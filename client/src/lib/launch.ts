import { useCallback, useRef, useState } from 'react';
import { Buffer } from 'buffer';
import bs58 from 'bs58';
import { Keypair, VersionedTransaction } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import type { LaunchView } from '../../../shared/launch';
import { upsertBrick } from './pyramid';
import { api, ApiError, type SendResponse } from './api';

export type StepId = 'upload' | 'build' | 'sign' | 'send' | 'confirm';
export const STEPS: StepId[] = ['upload', 'build', 'sign', 'send', 'confirm'];

export interface LaunchInput {
  /** changes whenever any launch-relevant input changes → new session */
  formKey: string;
  fields: { name: string; ticker: string; description: string; website?: string; twitter?: string; telegram?: string };
  trade: { devBuySol: number; slippagePct: number; priorityFeeSol: number };
  image: { blob: Blob; name: string };
}

export interface LaunchState {
  status: 'idle' | 'running' | 'error' | 'done';
  step: StepId | null;
  mode: 'tx' | 'mock' | null;
  error: string | null;
  log: string[];
  result: { launch: LaunchView; send: SendResponse } | null;
}

interface Session {
  formKey: string;
  launchId: string;
  mint: Keypair;
  upload?: { metadataUri: string; imageUri: string | null };
}

const initial: LaunchState = { status: 'idle', step: null, mode: null, error: null, log: [], result: null };

/** remembered for the success page (blob URL survives client-side navigation) */
export const lastLocalImage = new Map<string, string>();

function friendly(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/reject|denied|cancel|declined/i.test(m)) return 'Request was rejected in your wallet. Nothing was sent.';
  if (/blockhash/i.test(m)) return 'The transaction expired before it was sent. Retry to rebuild it.';
  if (e instanceof ApiError && e.status === 0) return m;
  if (e instanceof ApiError && e.code === 'content_blocked') return m;
  if (/insufficient|0x1\b|lamports/i.test(m)) return 'Not enough SOL in this wallet for the dev buy plus fees.';
  return m || 'Something went wrong.';
}

export function useLaunch() {
  const wallet = useWallet();
  const [state, setState] = useState<LaunchState>(initial);
  const running = useRef(false);
  const session = useRef<Session | null>(null);

  const log = (line: string) => setState((s) => ({ ...s, log: [...s.log, line] }));
  const step = (st: StepId) => setState((s) => ({ ...s, step: st }));

  const reset = useCallback(() => {
    if (running.current) return;
    setState(initial);
  }, []);

  const run = useCallback(
    async (input: LaunchInput) => {
      if (running.current) return; // no double submits
      if (!wallet.publicKey || !wallet.signTransaction) {
        setState({ ...initial, status: 'error', error: 'Connect a wallet first.' });
        return;
      }
      running.current = true;
      const creator = wallet.publicKey.toBase58();

      if (!session.current || session.current.formKey !== input.formKey) {
        session.current = { formKey: input.formKey, launchId: crypto.randomUUID(), mint: Keypair.generate() };
      }
      const ses = session.current;
      setState({ ...initial, status: 'running', step: 'upload', log: [`mint ${ses.mint.publicKey.toBase58()} (generated in this browser)`] });

      try {
        // 1. upload (cached across retries)
        if (!ses.upload) {
          const fd = new FormData();
          fd.append('image', input.image.blob, input.image.name);
          for (const [k, v] of Object.entries(input.fields)) if (v) fd.append(k, v);
          const up = await api.upload(fd);
          ses.upload = { metadataUri: up.metadataUri, imageUri: up.imageUri };
          log(`metadata → ${up.provider === 'local' ? 'local (dry run)' : up.provider} ${up.metadataUri.slice(0, 48)}…`);
        } else log('metadata already uploaded — reusing');

        // 2. build
        step('build');
        const built = await api.build({
          launchId: ses.launchId,
          creator,
          mint: ses.mint.publicKey.toBase58(),
          metadataUri: ses.upload.metadataUri,
          imageUri: ses.upload.imageUri ?? undefined,
          fields: input.fields,
          trade: input.trade,
        });
        setState((s) => ({ ...s, mode: built.mode }));
        log(built.mode === 'tx' ? 'transaction built via PumpPortal' : `PumpPortal unreachable — dry-run mock (${built.reason.slice(0, 80)})`);

        // 3. sign
        step('sign');
        let sendBody: Record<string, unknown>;
        if (built.mode === 'tx') {
          const tx = VersionedTransaction.deserialize(Buffer.from(built.tx, 'base64'));
          tx.sign([ses.mint]); // mint keypair never leaves the browser
          const signed = await wallet.signTransaction(tx);
          sendBody = { launchId: ses.launchId, signedTx: Buffer.from(signed.serialize()).toString('base64') };
          log('signed by mint + wallet');
        } else {
          if (!wallet.signMessage) throw new Error('This wallet cannot sign messages. Try Phantom, Solflare or Backpack.');
          const sig = await wallet.signMessage(new TextEncoder().encode(built.message));
          sendBody = { launchId: ses.launchId, mockSignature: bs58.encode(sig) };
          log('dry-run message signed');
        }

        // 4. send / simulate
        step('send');
        const sent = await api.send(sendBody);
        if (sent.error) {
          sent.simulation?.logs.slice(-6).forEach((l) => log(l));
          throw new Error(sent.error);
        }
        if (sent.simulation) {
          log(
            sent.simulation.skipped
              ? `simulation skipped: ${sent.simulation.skipped}`
              : `simulation ok · ${sent.simulation.unitsConsumed ?? '?'} CU`,
          );
        }
        if (sent.launch.signature) log(`signature ${sent.launch.signature}`);

        // 5. confirm (poll when actually sent)
        step('confirm');
        let launch = sent.launch;
        const deadline = Date.now() + 90_000;
        while (launch.status === 'sent' && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 2000));
          launch = (await api.launch(ses.launchId)).launch;
        }
        if (launch.status === 'failed') throw new Error('Transaction failed on-chain. Check Solscan, then retry.');
        if (launch.status === 'sent') log('still confirming — it may land shortly; check Solscan');
        if (launch.brickNo) {
          // our own brick: place it now even if the socket push is slow
          upsertBrick({
            n: launch.brickNo,
            mint: launch.mint,
            name: launch.name,
            ticker: launch.ticker,
            image: launch.imageUri,
            creator: launch.creator,
            placedAt: launch.placedAt ?? launch.createdAt,
            mcap: launch.marketCapUsd,
            ch24: launch.change24h,
            belowSince: null,
            hidden: launch.hidden,
            sim: false,
            dryRun: launch.simulated,
          }, { announce: false });
        }
        lastLocalImage.set(launch.launchId, URL.createObjectURL(input.image.blob));
        setState((s) => ({ ...s, status: 'done', step: 'confirm', result: { launch, send: sent } }));
        session.current = null; // a fresh launch next time
      } catch (e) {
        setState((s) => ({ ...s, status: 'error', error: friendly(e) }));
      } finally {
        running.current = false;
      }
    },
    [wallet],
  );

  return { state, run, reset, busy: state.status === 'running' };
}
