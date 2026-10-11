import { describe, expect, it } from 'vitest';
import { EMPTY_SNAPSHOT } from '../src/lib/backend';
import { HOUR, solToLamports } from '../src/lib/format';
import { aggregate, allTotals, launchStatus, offerView, platformTotals, splitFee } from '../src/lib/ledger';
import type { Launch, Offer, Snapshot } from '../src/lib/types';
import { isSolanaAddress, validateSocial } from '../src/lib/validate';

const W = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const launch = (id: string, recipient: Launch['recipient']): Launch => ({
  id,
  mint: `mint${id}`,
  name: id,
  ticker: id.toUpperCase(),
  description: '',
  imageUrl: '',
  createdAt: 0,
  devWallet: W,
  recipient,
  payoutMessage: '',
  devBuy: 0,
  socials: {},
  mcap: [],
  failure: null,
});
let n = 0;
const fee = (launchId: string, gross: number) => ({ id: `f${n++}`, launchId, at: 1, gross, ...splitFee(gross) });

describe('fee split', () => {
  it('floors the platform share; recipient gets the exact remainder', () => {
    expect(splitFee(1_000_000_009)).toEqual({ platform: 100_000_000, recipient: 900_000_009 });
    expect(splitFee(9)).toEqual({ platform: 0, recipient: 9 });
    for (const g of [1, 7, 123_456_789, 2_500_000_001]) {
      const { platform, recipient } = splitFee(g);
      expect(platform + recipient).toBe(g);
    }
  });
  it('parses SOL into lamports without float drift', () => {
    expect(solToLamports('0.1')).toBe(100_000_000);
    expect(solToLamports('1.000000001')).toBe(1_000_000_001);
    expect(solToLamports('abc')).toBeNull();
  });
});

describe('ledger', () => {
  const data: Snapshot = {
    ...EMPTY_SNAPSHOT,
    launches: [launch('a', { kind: 'member', username: 'nova', wallet: W }), launch('b', { kind: 'server', serverId: '123456789012345678', serverName: 'S' })],
    fees: [fee('a', 2e9), fee('a', 1e9), fee('b', 1e9)],
    payouts: [{ id: 'p', launchId: 'a', at: 2, amount: 1.8e9, status: 'completed', to: W }],
    buybacks: [{ id: 'bb', at: 3, solSpent: 0.1e9, dcmBought: 5, dcmBurned: 5 }],
  };
  it('derives totals, statuses and aggregates from the same ledger', () => {
    expect(allTotals(data).get('a')).toMatchObject({ gross: 3e9, platform: 0.3e9, earned: 2.7e9, paid: 1.8e9, pending: 0.9e9 });
    expect(launchStatus(data, data.launches[0])).toBe('ready');
    expect(launchStatus(data, data.launches[1])).toBe('awaiting-claim');
    expect(aggregate(data)).toMatchObject({ launches: 2, gross: 4e9, paid: 1.8e9 });
    expect(platformTotals(data)).toMatchObject({ revenue: 0.4e9, spent: 0.1e9, available: 0.3e9, burned: 5 });
  });
  it('handles an empty snapshot', () => {
    expect(aggregate(EMPTY_SNAPSHOT)).toMatchObject({ launches: 0, gross: 0 });
  });
});

describe('offers', () => {
  const base: Offer = { id: 'o', createdAt: 0, sponsorWallet: W, serverId: '1', serverName: 'S', channel: 'c', price: 1e9, postWithinDays: 1, required: 'x', notes: '', messages: [], log: [] };
  it('derives status from timestamps', () => {
    expect(offerView(base, 0).status).toBe('awaiting');
    const acc = { ...base, acceptedAt: 0, deadline: 24 * HOUR };
    expect(offerView(acc, HOUR).status).toBe('accepted');
    const posted = { ...acc, messages: [{ id: 'm', text: 'x', submittedAt: HOUR, qualifies: true }] };
    expect(offerView(posted, HOUR).status).toBe('posted');
    expect(offerView(posted, 10 * HOUR).status).toBe('retention');
    expect(offerView({ ...posted, settlement: { kind: 'paid' as const, at: 1, recipientAmount: 9e8, platformAmount: 1e8, to: 'S' } }, 0).status).toBe('completed');
  });
});

describe('validation', () => {
  it('checks Solana addresses and social URLs', () => {
    expect(isSolanaAddress(W)).toBe(true);
    expect(isSolanaAddress('0xabc')).toBe(false);
    expect(validateSocial('x', 'https://x.com/a')).toBeNull();
    expect(validateSocial('x', 'https://evil.com')).not.toBeNull();
    expect(validateSocial('discord', 'https://discord.gg/abc')).toBeNull();
  });
});
