import { VersionedTransaction } from '@solana/web3.js';
import type { BuildRequest } from '../../shared/launch.js';
import { fetchSafe, safeText, UpstreamError, type FetchLike } from './http.js';

/**
 * Body for PumpPortal Local Transaction API, action "create".
 * Docs: https://pumpportal.fun/creation/ — fields verified against public examples;
 * `npm run check:live` probes the endpoint shape before going live.
 */
export function buildCreateBody(req: BuildRequest) {
  return {
    publicKey: req.creator,
    action: 'create',
    tokenMetadata: {
      name: req.fields.name,
      symbol: req.fields.ticker,
      uri: req.metadataUri,
    },
    mint: req.mint,
    denominatedInSol: 'true',
    amount: req.trade.devBuySol,
    slippage: req.trade.slippagePct,
    priorityFee: req.trade.priorityFeeSol,
    pool: 'pump',
  };
}

export async function fetchCreateTx(
  url: string,
  body: ReturnType<typeof buildCreateBody>,
  fetchImpl?: FetchLike,
): Promise<Uint8Array> {
  const res = await fetchSafe(url, {
    service: 'PumpPortal',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: 15_000,
    retries: 1,
    fetchImpl,
  });
  if (res.status !== 200) {
    throw new UpstreamError('PumpPortal', `HTTP ${res.status}`, res.status, await safeText(res));
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < 64) throw new UpstreamError('PumpPortal', 'empty or truncated transaction');
  return bytes;
}

/**
 * Defensive checks before handing a third-party-built tx to the user:
 * fee payer must be the creator, the mint must be a required signer,
 * and nobody else may be required to sign.
 */
export function inspectCreateTx(bytes: Uint8Array, expect: { creator: string; mint: string }) {
  let tx: VersionedTransaction;
  try {
    tx = VersionedTransaction.deserialize(bytes);
  } catch (e) {
    throw new UpstreamError('PumpPortal', 'response is not a valid versioned transaction');
  }
  const msg = tx.message;
  const nSigners = msg.header.numRequiredSignatures;
  const signers = msg.staticAccountKeys.slice(0, nSigners).map((k) => k.toBase58());
  if (signers[0] !== expect.creator) {
    throw new UpstreamError('PumpPortal', `fee payer mismatch (got ${signers[0]})`);
  }
  if (!signers.includes(expect.mint)) {
    throw new UpstreamError('PumpPortal', 'mint is not a required signer');
  }
  const extra = signers.filter((s) => s !== expect.creator && s !== expect.mint);
  if (extra.length) throw new UpstreamError('PumpPortal', `unexpected signers: ${extra.join(',')}`);
  return { tx, signers, instructions: msg.compiledInstructions.length };
}
