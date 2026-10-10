import { fetchSafe, type FetchLike } from './http.js';

export interface MarketData {
  marketCapUsd: number | null;
  priceUsd: number | null;
  priceChange24h: number | null;
}

interface Pair {
  baseToken?: { address?: string };
  marketCap?: number;
  fdv?: number;
  priceUsd?: string;
  priceChange?: { h24?: number };
  liquidity?: { usd?: number };
}

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; data: MarketData }>();

export function pickMarket(pairs: Pair[], mint: string): MarketData {
  const mine = pairs.filter((p) => p.baseToken?.address === mint);
  if (!mine.length) return { marketCapUsd: null, priceUsd: null, priceChange24h: null };
  const best = mine.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(+v) ? +v : null);
  return {
    marketCapUsd: num(best.marketCap) ?? num(best.fdv),
    priceUsd: num(best.priceUsd),
    priceChange24h: num(best.priceChange?.h24),
  };
}

/** Batched lookup (30 addresses per call). Never throws — returns nulls on failure. */
export async function getMarkets(baseUrl: string, mints: string[], fetchImpl?: FetchLike): Promise<Map<string, MarketData>> {
  const out = new Map<string, MarketData>();
  const now = Date.now();
  const todo: string[] = [];
  for (const m of new Set(mints)) {
    const c = cache.get(m);
    if (c && now - c.at < TTL_MS) out.set(m, c.data);
    else todo.push(m);
  }
  for (let i = 0; i < todo.length; i += 30) {
    const chunk = todo.slice(i, i + 30);
    let pairs: Pair[] = [];
    try {
      const res = await fetchSafe(`${baseUrl}/tokens/v1/solana/${chunk.join(',')}`, {
        service: 'DexScreener',
        timeoutMs: 6_000,
        retries: 0,
        fetchImpl,
      });
      if (res.ok) {
        const j = await res.json().catch(() => []);
        pairs = Array.isArray(j) ? j : Array.isArray(j?.pairs) ? j.pairs : [];
      }
    } catch {
      /* offline / rate limited: leave nulls */
    }
    for (const m of chunk) {
      const data = pickMarket(pairs, m);
      out.set(m, data);
      cache.set(m, { at: now, data });
    }
  }
  return out;
}

export function clearMarketCache() {
  cache.clear();
}
