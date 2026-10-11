import { serverById, userById } from './fixtures';
import { HOUR } from './format';
import type { DemoState, Lamports, Launch, Offer, OfferMessage, OfferStatus } from './types';

/** Platform keeps floor(gross / 10); the recipient gets the exact remainder. */
export function splitFee(gross: Lamports): { platform: Lamports; recipient: Lamports } {
  const g = Math.max(0, Math.floor(gross));
  const platform = Math.floor(g / 10);
  return { platform, recipient: g - platform };
}

export const MIN_PAYOUT: Lamports = 50_000_000; // 0.05 SOL demo minimum
export const RETENTION_MS = 72 * HOUR;

export type LaunchStatus = 'accruing' | 'awaiting-claim' | 'ready' | 'paid' | 'failed';

export const STATUS_LABEL: Record<LaunchStatus, string> = {
  accruing: 'Fees accruing',
  'awaiting-claim': 'Awaiting claim',
  ready: 'Ready for payout',
  paid: 'Paid out',
  failed: 'Demo failed',
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
  lastActivity: number;
}

const totalsCache = new WeakMap<DemoState, Map<string, LaunchTotals>>();

/** One pass over the shared ledger; every page reads from this. */
export function allTotals(state: DemoState): Map<string, LaunchTotals> {
  const hit = totalsCache.get(state);
  if (hit) return hit;
  const map = new Map<string, LaunchTotals>();
  for (const l of state.launches) {
    map.set(l.id, {
      gross: 0,
      platform: 0,
      earned: 0,
      paid: 0,
      pending: 0,
      feeCount: 0,
      payoutCount: 0,
      failedCount: 0,
      lastActivity: l.createdAt,
    });
  }
  for (const f of state.fees) {
    const t = map.get(f.launchId);
    if (!t) continue;
    t.gross += f.gross;
    t.platform += f.platform;
    t.earned += f.recipient;
    t.feeCount++;
    t.lastActivity = Math.max(t.lastActivity, f.at);
  }
  for (const p of state.payouts) {
    const t = map.get(p.launchId);
    if (!t) continue;
    if (p.status === 'completed') {
      t.paid += p.amount;
      t.payoutCount++;
    } else t.failedCount++;
    t.lastActivity = Math.max(t.lastActivity, p.at);
  }
  for (const t of map.values()) t.pending = Math.max(0, t.earned - t.paid);
  totalsCache.set(state, map);
  return map;
}

const EMPTY: LaunchTotals = {
  gross: 0,
  platform: 0,
  earned: 0,
  paid: 0,
  pending: 0,
  feeCount: 0,
  payoutCount: 0,
  failedCount: 0,
  lastActivity: 0,
};

export const totalsFor = (state: DemoState, id: string) => allTotals(state).get(id) ?? EMPTY;

export const isClaimed = (state: DemoState, serverId: string) => Boolean(state.claims[serverId]);

export function launchStatus(state: DemoState, launch: Launch): LaunchStatus {
  const t = totalsFor(state, launch.id);
  if (launch.failure) return 'failed';
  if (launch.recipient.kind === 'server' && !isClaimed(state, launch.recipient.serverId) && t.pending > 0)
    return 'awaiting-claim';
  if (t.pending >= MIN_PAYOUT) return 'ready';
  if (t.pending === 0 && t.paid > 0) return 'paid';
  return 'accruing';
}

/** Where a payout for this launch would land (null when no destination exists yet). */
export function payoutDestination(state: DemoState, launch: Launch): string | null {
  if (launch.recipient.kind === 'member') return userById(launch.recipient.userId)?.wallet ?? null;
  return state.claims[launch.recipient.serverId]?.wallet ?? null;
}

export function recipientName(launch: Launch): string {
  if (launch.recipient.kind === 'member') return `@${userById(launch.recipient.userId)?.username ?? 'unknown'}`;
  return `${serverById(launch.recipient.serverId)?.name ?? 'Unknown server'} treasury`;
}

export function canPayout(
  state: DemoState,
  launch: Launch,
): { ok: true } | { ok: false; reason: string; claim?: boolean } {
  const t = totalsFor(state, launch.id);
  if (launch.recipient.kind === 'server' && !isClaimed(state, launch.recipient.serverId))
    return {
      ok: false,
      claim: true,
      reason: `${serverById(launch.recipient.serverId)?.name ?? 'This server'} has not claimed its treasury yet. A demo admin must verify and link a treasury wallet before payouts can be simulated.`,
    };
  if (t.pending <= 0) return { ok: false, reason: 'Nothing pending. Generate sample fees first.' };
  if (t.pending < MIN_PAYOUT)
    return { ok: false, reason: 'Pending balance is below the 0.05 SOL demo payout minimum.' };
  if (!payoutDestination(state, launch)) return { ok: false, reason: 'Recipient has no linked demo wallet.' };
  return { ok: true };
}

export interface Aggregates {
  launches: number;
  gross: Lamports;
  platform: Lamports;
  paid: Lamports;
  pending: Lamports;
  earned: Lamports;
}

export function aggregate(state: DemoState, launches: Launch[] = state.launches): Aggregates {
  const all = allTotals(state);
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

export function platformTotals(state: DemoState) {
  const revenue = state.fees.reduce((s, f) => s + f.platform, 0);
  const spent = state.buybacks.reduce((s, b) => s + b.solSpent, 0);
  const burned = state.buybacks.reduce((s, b) => s + b.dcmBurned, 0);
  return { revenue, spent, available: Math.max(0, revenue - spent), burned, count: state.buybacks.length };
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

export const matchesRequired = (text: string, required: string) =>
  text.toLowerCase().includes(required.trim().toLowerCase());

export function offerView(o: Offer, now: number) {
  const live = liveMessage(o);
  const retentionEndsAt = live ? live.submittedAt + RETENTION_MS : undefined;
  let status: OfferStatus;
  if (o.settlement?.kind === 'paid') status = 'completed';
  else if (o.settlement?.kind === 'refunded') status = 'refunded';
  else if (o.settlement?.kind === 'cancelled') status = 'cancelled';
  else if (!o.acceptedAt) status = 'awaiting';
  else if (live) status = now - live.submittedAt < HOUR ? 'posted' : 'retention';
  else status = 'accepted';

  const open = !o.settlement;
  const pastDeadline = o.deadline !== undefined && now > o.deadline;
  return {
    status,
    live,
    retentionEndsAt,
    retentionLeft: retentionEndsAt !== undefined ? Math.max(0, retentionEndsAt - now) : undefined,
    retentionProgress: live ? Math.min(1, (now - live.submittedAt) / RETENTION_MS) : 0,
    pastDeadline,
    canAccept: open && !o.acceptedAt,
    canCancel: open && !o.acceptedAt,
    canSubmit: open && Boolean(o.acceptedAt) && !pastDeadline,
    canRemove: open && Boolean(live),
    canPay: open && Boolean(live) && retentionEndsAt !== undefined && now >= retentionEndsAt,
    canRefund: open && Boolean(o.acceptedAt) && !live && pastDeadline,
  };
}

export function offerSplit(price: Lamports) {
  return splitFee(price);
}

export function escrowTotals(state: DemoState) {
  let held = 0;
  let released = 0;
  let refunded = 0;
  let platform = 0;
  for (const o of state.offers) {
    if (!o.settlement) held += o.price;
    else if (o.settlement.kind === 'paid') {
      released += o.settlement.recipientAmount;
      platform += o.settlement.platformAmount;
    } else refunded += o.settlement.amount;
  }
  return { held, released, refunded, platform };
}
