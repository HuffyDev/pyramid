import { HOUR } from './format';
import type { Lamports, Launch, Offer, OfferMessage, OfferStatus, Snapshot } from './types';

/** Platform keeps floor(gross / 10); the recipient gets the exact remainder. */
export function splitFee(gross: Lamports): { platform: Lamports; recipient: Lamports } {
  const g = Math.max(0, Math.floor(gross));
  const platform = Math.floor(g / 10);
  return { platform, recipient: g - platform };
}

export const MIN_PAYOUT: Lamports = 50_000_000; // 0.05 SOL
export const RETENTION_MS = 72 * HOUR;

export type LaunchStatus = 'accruing' | 'awaiting-claim' | 'ready' | 'paid' | 'failed';

export const STATUS_LABEL: Record<LaunchStatus, string> = {
  accruing: 'Fees accruing',
  'awaiting-claim': 'Awaiting claim',
  ready: 'Ready for payout',
  paid: 'Paid out',
  failed: 'Payout failed',
};

export interface LaunchTotals {
  gross: Lamports;
  platform: Lamports;
  earned: Lamports;
  paid: Lamports;
  pending: Lamports;
  feeCount: number;
  payoutCount: number;
  failedCount: number;
}

const totalsCache = new WeakMap<Snapshot, Map<string, LaunchTotals>>();

/** One pass over the ledger; every page reads from this. */
export function allTotals(data: Snapshot): Map<string, LaunchTotals> {
  const hit = totalsCache.get(data);
  if (hit) return hit;
  const map = new Map<string, LaunchTotals>();
  for (const l of data.launches)
    map.set(l.id, { gross: 0, platform: 0, earned: 0, paid: 0, pending: 0, feeCount: 0, payoutCount: 0, failedCount: 0 });
  for (const f of data.fees) {
    const t = map.get(f.launchId);
    if (!t) continue;
    t.gross += f.gross;
    t.platform += f.platform;
    t.earned += f.recipient;
    t.feeCount++;
  }
  for (const p of data.payouts) {
    const t = map.get(p.launchId);
    if (!t) continue;
    if (p.status === 'completed') {
      t.paid += p.amount;
      t.payoutCount++;
    } else t.failedCount++;
  }
  for (const t of map.values()) t.pending = Math.max(0, t.earned - t.paid);
  totalsCache.set(data, map);
  return map;
}

const EMPTY: LaunchTotals = { gross: 0, platform: 0, earned: 0, paid: 0, pending: 0, feeCount: 0, payoutCount: 0, failedCount: 0 };
export const totalsFor = (data: Snapshot, id: string) => allTotals(data).get(id) ?? EMPTY;
export const isClaimed = (data: Snapshot, serverId: string) => Boolean(data.claims[serverId]);

export function launchStatus(data: Snapshot, launch: Launch): LaunchStatus {
  const t = totalsFor(data, launch.id);
  if (launch.failure) return 'failed';
  if (launch.recipient.kind === 'server' && !isClaimed(data, launch.recipient.serverId) && t.pending > 0) return 'awaiting-claim';
  if (t.pending >= MIN_PAYOUT) return 'ready';
  if (t.pending === 0 && t.paid > 0) return 'paid';
  return 'accruing';
}

export function payoutDestination(data: Snapshot, launch: Launch): string | null {
  if (launch.recipient.kind === 'member') return launch.recipient.wallet || null;
  return data.claims[launch.recipient.serverId]?.wallet ?? null;
}

export function recipientName(launch: Launch): string {
  return launch.recipient.kind === 'member' ? `@${launch.recipient.username}` : `${launch.recipient.serverName} treasury`;
}

export interface Aggregates {
  launches: number;
  gross: Lamports;
  platform: Lamports;
  paid: Lamports;
  pending: Lamports;
  earned: Lamports;
}

export function aggregate(data: Snapshot, launches: Launch[] = data.launches): Aggregates {
  const all = allTotals(data);
  const a: Aggregates = { launches: launches.length, gross: 0, platform: 0, paid: 0, pending: 0, earned: 0 };
  for (const l of launches) {
    const t = all.get(l.id);
    if (!t) continue;
    a.gross += t.gross;
    a.platform += t.platform;
    a.paid += t.paid;
    a.pending += t.pending;
    a.earned += t.earned;
  }
  return a;
}

export function platformTotals(data: Snapshot) {
  const revenue = data.fees.reduce((s, f) => s + f.platform, 0);
  const spent = data.buybacks.reduce((s, b) => s + b.solSpent, 0);
  const burned = data.buybacks.reduce((s, b) => s + b.dcmBurned, 0);
  return { revenue, spent, available: Math.max(0, revenue - spent), burned, count: data.buybacks.length };
}

export const latestMcap = (l: Launch) => l.mcap[l.mcap.length - 1] ?? 0;

/* ---------------------------- Sponsored posts ---------------------------- */

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  awaiting: 'Awaiting acceptance',
  accepted: 'Accepted',
  posted: 'Posted',
  retention: 'Retention period',
  completed: 'Completed',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
};

export const liveMessage = (o: Offer): OfferMessage | undefined =>
  [...o.messages].reverse().find((m) => m.qualifies && m.removedAt === undefined);

export function offerView(o: Offer, now: number) {
  const live = liveMessage(o);
  const retentionEndsAt = live ? live.submittedAt + RETENTION_MS : undefined;
  let status: OfferStatus;
  if (o.settlement?.kind === 'paid') status = 'completed';
  else if (o.settlement?.kind === 'refunded') status = 'refunded';
  else if (o.settlement?.kind === 'cancelled') status = 'cancelled';
  else if (o.acceptedAt === undefined) status = 'awaiting';
  else if (live) status = now - live.submittedAt < HOUR ? 'posted' : 'retention';
  else status = 'accepted';
  const open = !o.settlement;
  return {
    status,
    live,
    retentionEndsAt,
    retentionLeft: retentionEndsAt !== undefined ? Math.max(0, retentionEndsAt - now) : undefined,
    retentionProgress: live ? Math.min(1, (now - live.submittedAt) / RETENTION_MS) : 0,
    pastDeadline: o.deadline !== undefined && now > o.deadline,
    canAccept: open && o.acceptedAt === undefined,
    canCancel: open && o.acceptedAt === undefined,
  };
}

export const offerSplit = (price: Lamports) => splitFee(price);

export function escrowTotals(data: Snapshot) {
  let held = 0;
  let released = 0;
  let refunded = 0;
  let platform = 0;
  for (const o of data.offers) {
    if (!o.settlement) held += o.price;
    else if (o.settlement.kind === 'paid') {
      released += o.settlement.recipientAmount;
      platform += o.settlement.platformAmount;
    } else refunded += o.settlement.amount;
  }
  return { held, released, refunded, platform };
}
