import { randomUUID } from 'node:crypto';
import { loadEnv } from '../server/env.js';
import { creator, mint } from './fixtures/keys.js';

export const testEnv = (over: Record<string, string> = {}) =>
  loadEnv({ MEDIA_DIR: '/tmp/pyramid-test-media', PUMPPORTAL_URL: 'https://pp.test/api/trade-local', HELIUS_RPC_URL: 'https://rpc.test', ...over });

export const buildReq = (over: Record<string, unknown> = {}) => ({
  launchId: randomUUID(),
  creator: creator.publicKey.toBase58(),
  mint: mint.publicKey.toBase58(),
  metadataUri: 'https://ipfs.io/ipfs/bafkreifixture',
  fields: { name: 'Sand Cat', ticker: 'scat', description: 'just a brick', twitter: 'https://x.com/pyramid' },
  trade: { devBuySol: 0.5, slippagePct: 10, priorityFeeSol: 0.0005 },
  ...over,
});

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
/** route-table fetch mock; records calls */
export function mockFetch(routes: Record<string, Handler>) {
  const calls: { url: string; body?: unknown }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body });
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) throw new TypeError(`fetch failed (no route for ${url})`);
    return routes[key](url, init);
  }) as typeof fetch;
  return { impl, calls };
}

export const rpcRoute = (results: Record<string, unknown>): Handler => async (_u, init) => {
  const { method } = JSON.parse(String(init?.body));
  if (!(method in results)) return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -1, message: `no mock for ${method}` } }));
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: results[method] }));
};
