import { beforeEach, describe, expect, it } from 'vitest';
import pairs from './fixtures/dexscreener-tokens.json';
import { clearMarketCache, getMarkets, pickMarket } from '../server/services/dexscreener.js';
import { mockFetch } from './helpers.js';

describe('dexscreener', () => {
  beforeEach(clearMarketCache);
  it('picks the most liquid pair, falls back to fdv', () => {
    expect(pickMarket(pairs, 'MINT_A')).toEqual({ marketCapUsd: 130000, priceUsd: 0.00013, priceChange24h: 14 });
    expect(pickMarket(pairs, 'MINT_B').marketCapUsd).toBe(4200);
    expect(pickMarket(pairs, 'NOPE').marketCapUsd).toBe(null);
  });
  it('never throws when offline', async () => {
    const m = await getMarkets('https://ds.test', ['MINT_A'], mockFetch({}).impl);
    expect(m.get('MINT_A')?.marketCapUsd).toBe(null);
  });
  it('batches and caches', async () => {
    const { impl, calls } = mockFetch({ 'https://ds.test': () => new Response(JSON.stringify(pairs)) });
    await getMarkets('https://ds.test', ['MINT_A', 'MINT_B'], impl);
    await getMarkets('https://ds.test', ['MINT_A', 'MINT_B'], impl);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://ds.test/tokens/v1/solana/MINT_A,MINT_B');
  });
});
