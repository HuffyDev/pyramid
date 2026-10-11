import { beforeEach, describe, expect, it } from 'vitest';
import * as A from '../src/lib/actions';
import { DAY, HOUR } from '../src/lib/format';
import { allTotals, canPayout, launchStatus, offerView, platformTotals, splitFee } from '../src/lib/ledger';
import { createSeed, seedInvariants } from '../src/lib/seed';
import { getState, resetDemo, setState } from '../src/lib/store';

beforeEach(() => resetDemo());

describe('fee split', () => {
  it('floors the platform share and gives the remainder to the recipient', () => {
    expect(splitFee(1_000_000_009)).toEqual({ platform: 100_000_000, recipient: 900_000_009 });
    expect(splitFee(9)).toEqual({ platform: 0, recipient: 9 });
    for (const g of [1, 7, 123_456_789, 2_500_000_001]) {
      const { platform, recipient } = splitFee(g);
      expect(platform + recipient).toBe(g);
      expect(Number.isInteger(platform) && Number.isInteger(recipient)).toBe(true);
    }
  });
});

describe('seed', () => {
  it('meets data requirements and invariants', () => {
    const s = createSeed(Date.UTC(2026, 9, 1));
    expect(seedInvariants(s)).toEqual([]);
    const statuses = new Set(s.launches.map((l) => launchStatus(s, l)));
    expect([...statuses].sort()).toEqual(['accruing', 'awaiting-claim', 'failed', 'paid', 'ready']);
    const offerStatuses = new Set(s.offers.map((o) => offerView(o, s.now).status));
    for (const st of ['awaiting', 'accepted', 'posted', 'retention', 'completed', 'refunded', 'cancelled']) expect(offerStatuses.has(st as never)).toBe(true);
    expect(platformTotals(s).spent).toBeLessThanOrEqual(platformTotals(s).revenue);
  });
  it('is deterministic', () => {
    const t = Date.UTC(2026, 9, 1);
    const a = createSeed(t);
    const b = createSeed(t);
    expect({ ...a, refreshedAt: 0 }).toEqual({ ...b, refreshedAt: 0 });
  });
});

describe('payouts', () => {
  it('pays pending exactly once', () => {
    const s = getState();
    const l = s.launches.find((x) => launchStatus(s, x) === 'ready')!;
    const before = allTotals(s).get(l.id)!;
    const r = A.simulatePayout(l.id);
    expect(r.ok).toBe(true);
    const after = allTotals(getState()).get(l.id)!;
    expect(after.paid).toBe(before.paid + before.pending);
    expect(after.pending).toBe(0);
    expect(A.simulatePayout(l.id).ok).toBe(false);
  });
  it('blocks unclaimed servers until claimed, then allows payout', () => {
    const s = getState();
    const l = s.launches.find((x) => x.recipient.kind === 'server' && x.recipient.serverId === 'srv-orbit' && allTotals(s).get(x.id)!.pending > 0)!;
    const c = canPayout(s, l);
    expect(c.ok).toBe(false);
    A.connectDiscord('usr-quiet');
    const bad = A.claimServer({ serverId: 'srv-orbit', discordId: '1150276630184951808', adminId: 'usr-quiet', wallet: 'X', code: 'DCM-DEMO-0000' });
    expect(bad.ok).toBe(false);
    const good = A.claimServer({ serverId: 'srv-orbit', discordId: '1150276630184951808', adminId: 'usr-nova', wallet: 'W', code: 'DCM-DEMO-0001' });
    expect(good.ok).toBe(true);
    const dup = A.claimServer({ serverId: 'srv-orbit', discordId: '1150276630184951808', adminId: 'usr-nova', wallet: 'W2', code: 'DCM-DEMO-0002' });
    expect(dup.ok).toBe(false);
    expect(A.simulatePayout(l.id).ok).toBe(true);
  });
  it('failure moves no funds and retry clears it', () => {
    const s = getState();
    const l = s.launches.find((x) => launchStatus(s, x) === 'ready')!;
    const pending = allTotals(s).get(l.id)!.pending;
    expect(A.simulateFailure(l.id).ok).toBe(true);
    expect(allTotals(getState()).get(l.id)!.pending).toBe(pending);
    expect(launchStatus(getState(), getState().launches.find((x) => x.id === l.id)!)).toBe('failed');
    expect(A.simulatePayout(l.id).ok).toBe(true);
    expect(launchStatus(getState(), getState().launches.find((x) => x.id === l.id)!)).toBe('paid');
  });
  it('generated fees flow to every aggregate', () => {
    const before = getState();
    const l = before.launches[0];
    const r = A.generateFees(l.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const after = getState();
    expect(platformTotals(after).revenue - platformTotals(before).revenue).toBe(r.value.platform);
    expect(allTotals(after).get(l.id)!.earned - allTotals(before).get(l.id)!.earned).toBe(r.value.recipient);
  });
  it('buybacks only spend available revenue', () => {
    const r = A.runBuyback();
    if (r.ok) expect(platformTotals(getState()).available).toBe(0);
    expect(A.runBuyback().ok).toBe(false);
  });
});

describe('sponsored post state machine', () => {
  const mk = () => {
    A.connectWallet('usr-nova');
    const r = A.createOffer({ serverId: 'srv-pixel', channel: 'announcements', price: 1_000_000_007, postWithinDays: 1, required: 'Pixel Jam', notes: '' });
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };
  const view = (id: string) => offerView(getState().offers.find((o) => o.id === id)!, getState().now);

  it('pays after 72h retention with a 90/10 split, never refunds after', () => {
    const id = mk();
    expect(A.submitMessage(id, 'pixel jam').ok).toBe(false); // not accepted
    A.acceptOffer(id);
    const r = A.submitMessage(id, 'Join the PIXEL JAM tonight');
    expect(r.ok && r.value.qualifies).toBe(true);
    expect(A.processOfferPayout(id).ok).toBe(false);
    A.advanceClock(72 * HOUR);
    expect(view(id).canPay).toBe(true);
    expect(A.processOfferPayout(id).ok).toBe(true);
    const o = getState().offers.find((x) => x.id === id)!;
    expect(o.settlement?.kind).toBe('paid');
    if (o.settlement?.kind === 'paid') expect(o.settlement.platformAmount + o.settlement.recipientAmount).toBe(1_000_000_007);
    expect(A.processOfferRefund(id).ok).toBe(false);
    expect(A.processOfferPayout(id).ok).toBe(false);
  });
  it('rejects non-matching text and refunds after the deadline', () => {
    const id = mk();
    A.acceptOffer(id);
    const r = A.submitMessage(id, 'unrelated text');
    expect(r.ok && r.value.qualifies).toBe(false);
    expect(A.processOfferRefund(id).ok).toBe(false);
    A.advanceClock(DAY + HOUR);
    expect(A.submitMessage(id, 'pixel jam').ok).toBe(false);
    expect(A.processOfferRefund(id).ok).toBe(true);
    expect(A.processOfferPayout(id).ok).toBe(false);
  });
  it('early removal invalidates; replacement restarts retention', () => {
    const id = mk();
    A.acceptOffer(id);
    A.submitMessage(id, 'pixel jam');
    A.advanceClock(10 * HOUR);
    A.submitMessage(id, 'pixel jam v2');
    A.advanceClock(70 * HOUR); // 80h since first, 70h since replacement
    expect(view(id).canPay).toBe(false);
    A.removeMessage(id);
    expect(view(id).status).toBe('accepted');
    expect(view(id).canRefund).toBe(true); // deadline (24h) passed, no live post
  });
});

describe('storage', () => {
  it('state survives a set', () => {
    const s = getState();
    setState({ ...s, now: s.now + 1 });
    expect(getState().now).toBe(s.now + 1);
  });
});
