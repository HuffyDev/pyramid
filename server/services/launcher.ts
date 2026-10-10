import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { VersionedTransaction } from '@solana/web3.js';
import { buildRequestSchema, type LaunchRecord } from '../../shared/launch.js';
import { checkLaunchFields, filterMessage } from '../../shared/filter.js';
import { mockAllowed, type Env } from '../env.js';
import type { Store } from '../db/store.js';
import { extFor, type ImageMime } from '../lib/image.js';
import { UpstreamError, type FetchLike } from './http.js';
import { uploadPinata, uploadPumpIpfs, type UploadInput, type UploadResult } from './ipfs.js';
import { buildCreateBody, fetchCreateTx, inspectCreateTx } from './pumpportal.js';
import { Rpc } from './rpc.js';

export class LaunchError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = 'launch_error',
  ) {
    super(message);
  }
}

export interface LauncherDeps {
  env: Env;
  store: Store;
  fetchImpl?: FetchLike;
  log?: (msg: string, extra?: unknown) => void;
  /** called once when a launch becomes a brick (confirmed on-chain, or simulated in DRY_RUN) */
  onPlaced?: (launch: LaunchRecord) => void;
}

/** Throws a 422 if name / ticker / description trip the content filter. */
export function assertClean(f: { name?: string; ticker?: string; description?: string }) {
  const r = checkLaunchFields(f);
  if (!r.ok) throw new LaunchError(`Content filter: ${filterMessage(r.fields)}. Change it and try again.`, 422, 'content_blocked');
}

export type BuildResult = { mode: 'tx'; tx: string; launch: LaunchRecord } | { mode: 'mock'; message: string; launch: LaunchRecord; reason: string };

export interface SendResult {
  launch: LaunchRecord;
  simulation?: { logs: string[]; unitsConsumed: number | null; skipped?: string };
  error?: string;
}

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function mockSignMessage(l: { launchId: string; ticker: string; mint: string }) {
  return [
    'PYRAMID — DRY RUN',
    `Lay a brick: $${l.ticker}`,
    `Mint ${l.mint}`,
    `Id ${l.launchId}`,
    'Signing this message does not send a transaction or move funds.',
  ].join('\n');
}

export function createLauncher({ env, store, fetchImpl, log = () => {}, onPlaced = () => {} }: LauncherDeps) {
  /** move sent → simulated|confirmed and stamp placedAt; fires onPlaced exactly once */
  async function place(launchId: string, to: 'simulated' | 'confirmed', patch: { simulated?: boolean } = {}) {
    const placed = await store.transition(launchId, ['sent'], to, { ...patch, placedAt: new Date().toISOString() });
    if (placed) onPlaced(placed);
    return placed;
  }

  const rpc = env.HELIUS_RPC_URL ? new Rpc(env.HELIUS_RPC_URL, fetchImpl) : null;

  async function upload(input: UploadInput, origin: string) {
    assertClean({ name: input.name, ticker: input.symbol, description: input.description });
    const errors: string[] = [];
    let result: UploadResult | null = null;
    try {
      result = await uploadPumpIpfs(env.PUMP_IPFS_URL, input, fetchImpl);
    } catch (e) {
      errors.push(describe(e));
    }
    if (!result && env.PINATA_JWT) {
      try {
        result = await uploadPinata(env.PINATA_JWT, input, fetchImpl);
      } catch (e) {
        errors.push(describe(e));
      }
    }
    if (!result) {
      if (!mockAllowed(env)) throw new LaunchError(`Metadata upload failed: ${errors.join(' | ')}`, 502, 'upload_failed');
      // dry-run only: keep media locally so the UI flow can be exercised offline
      const base = (env.PUBLIC_SITE_URL || origin).replace(/\/$/, '');
      const id = randomUUID();
      await mkdir(env.MEDIA_DIR, { recursive: true });
      const imgName = `${id}.${extFor(input.image.mime as ImageMime)}`;
      await writeFile(path.join(env.MEDIA_DIR, imgName), input.image.bytes);
      const imageUri = `${base}/media/${imgName}`;
      const meta = { name: input.name, symbol: input.symbol, description: input.description, image: imageUri, showName: true };
      await writeFile(path.join(env.MEDIA_DIR, `${id}.json`), JSON.stringify(meta));
      result = { metadataUri: `${base}/media/${id}.json`, imageUri, provider: 'local' };
      log('[upload] using local dry-run media', errors);
    }
    return { ...result, warnings: errors };
  }

  async function build(raw: unknown): Promise<BuildResult> {
    const parsed = buildRequestSchema.safeParse(raw);
    if (!parsed.success) throw new LaunchError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    const req = parsed.data;
    assertClean(req.fields);

    const existing = await store.getLaunch(req.launchId);
    if (existing && !['building', 'failed'].includes(existing.status)) {
      throw new LaunchError('This launch was already submitted.', 409, 'already_submitted');
    }
    const byMint = await store.getByMint(req.mint);
    if (byMint && byMint.launchId !== req.launchId) throw new LaunchError('Mint address already used.', 409, 'mint_used');

    const launch = await store.upsertBuilding({
      launchId: req.launchId,
      mint: req.mint,
      creator: req.creator,
      name: req.fields.name,
      ticker: req.fields.ticker,
      description: req.fields.description,
      website: req.fields.website ?? null,
      twitter: req.fields.twitter ?? null,
      telegram: req.fields.telegram ?? null,
      imageUri: req.imageUri ?? null,
      metadataUri: req.metadataUri,
      devBuySol: req.trade.devBuySol,
    });

    try {
      const bytes = await fetchCreateTx(env.PUMPPORTAL_URL, buildCreateBody(req), fetchImpl);
      inspectCreateTx(bytes, { creator: req.creator, mint: req.mint });
      return { mode: 'tx', tx: Buffer.from(bytes).toString('base64'), launch };
    } catch (e) {
      if (mockAllowed(env)) {
        log('[build] PumpPortal unavailable, using mock mode', describe(e));
        return { mode: 'mock', message: mockSignMessage(launch), launch, reason: describe(e) };
      }
      throw new LaunchError(`Could not build transaction — ${describe(e)}`, 502, 'build_failed');
    }
  }

  async function send(raw: { launchId?: string; signedTx?: string; mockSignature?: string }): Promise<SendResult> {
    const launch = raw.launchId ? await store.getLaunch(raw.launchId) : null;
    if (!launch) throw new LaunchError('Unknown launch. Build it first.', 404, 'not_found');
    // idempotent: a second submit just returns current state
    if (['sent', 'confirmed', 'simulated'].includes(launch.status)) return { launch };

    const locked = await store.transition(launch.launchId, ['building', 'failed'], 'sent');
    if (!locked) return { launch: (await store.getLaunch(launch.launchId))! };
    const fail = async (msg: string, status = 400): Promise<never> => {
      await store.transition(launch.launchId, ['sent'], 'failed');
      throw new LaunchError(msg, status, 'send_failed');
    };

    if (!raw.signedTx) {
      if (!mockAllowed(env)) return fail('Signed transaction required.');
      if (!raw.mockSignature) return fail('Wallet signature required.');
      const done = await place(launch.launchId, 'simulated', { simulated: true });
      return { launch: done!, simulation: { logs: [], unitsConsumed: null, skipped: 'mock mode — no transaction was built' } };
    }

    let bytes: Uint8Array;
    let tx: VersionedTransaction;
    try {
      bytes = Buffer.from(raw.signedTx, 'base64');
      ({ tx } = inspectCreateTx(bytes, { creator: launch.creator, mint: launch.mint }));
    } catch (e) {
      return fail(`Signed transaction rejected: ${describe(e)}`);
    }
    if (tx.signatures.some((s) => s.every((b) => b === 0))) return fail('Transaction is missing a signature.');

    if (env.DRY_RUN) {
      if (!rpc) {
        const done = await place(launch.launchId, 'simulated', { simulated: true });
        return { launch: done!, simulation: { logs: [], unitsConsumed: null, skipped: 'HELIUS_RPC_URL not set' } };
      }
      try {
        const sim = await rpc.simulate(raw.signedTx);
        if (sim.value.err) {
          await store.transition(launch.launchId, ['sent'], 'failed');
          return {
            launch: (await store.getLaunch(launch.launchId))!,
            simulation: { logs: sim.value.logs ?? [], unitsConsumed: sim.value.unitsConsumed ?? null },
            error: `Simulation failed: ${JSON.stringify(sim.value.err)}`,
          };
        }
        const done = await place(launch.launchId, 'simulated', { simulated: true });
        return { launch: done!, simulation: { logs: sim.value.logs ?? [], unitsConsumed: sim.value.unitsConsumed ?? null } };
      } catch (e) {
        if (!mockAllowed(env)) return fail(`Simulation unavailable: ${describe(e)}`, 502);
        const done = await place(launch.launchId, 'simulated', { simulated: true });
        return { launch: done!, simulation: { logs: [], unitsConsumed: null, skipped: describe(e) } };
      }
    }

    if (!rpc) return fail('HELIUS_RPC_URL is not configured.', 500);
    let signature: string;
    try {
      signature = await rpc.send(raw.signedTx);
    } catch (e) {
      return fail(e instanceof UpstreamError ? e.message : `Send failed: ${describe(e)}`, 502);
    }
    const sent = await store.transition(launch.launchId, ['sent'], 'sent', { signature });
    // confirm in the background; client polls GET /api/launch/:id
    void (async () => {
      // one long retry window: a brick must not be lost because the first poll timed out
      let r = await rpc.confirm(signature);
      if (r === 'timeout') r = await rpc.confirm(signature, 180_000);
      if (r === 'confirmed') await place(launch.launchId, 'confirmed');
      else if (r === 'failed') await store.transition(launch.launchId, ['sent'], 'failed');
      log(`[send] ${launch.ticker} ${signature} → ${r}`);
    })().catch((e) => log('[send] confirm error', describe(e)));
    return { launch: sent! };
  }

  return { upload, build, send };
}
