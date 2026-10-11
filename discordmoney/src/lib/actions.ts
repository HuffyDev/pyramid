import { BOT_NAME, DEFAULT_USER_ID, SAMPLE_DCM_PER_SOL, serverById, userById } from './fixtures';
import { DAY, LAMPORTS_PER_SOL, sol } from './format';
import { claimCode, demoMint, launchId, random, receiptId, uid } from './ids';
import {
  canPayout,
  liveMessage,
  matchesRequired,
  offerView,
  payoutDestination,
  platformTotals,
  recipientName,
  splitFee,
  totalsFor,
} from './ledger';
import { getState, setState } from './store';
import type {
  Buyback,
  CoinImage,
  DemoState,
  FeeEvent,
  Lamports,
  Launch,
  Notice,
  Offer,
  Payout,
  Recipient,
  Result,
  Socials,
} from './types';

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

function commit(mut: (s: DemoState) => DemoState) {
  setState(mut(getState()));
}

function notice(n: Omit<Notice, 'id' | 'sample'>): Notice {
  return { ...n, id: uid('n'), sample: false };
}

/* --------------------------------- Session -------------------------------- */

export function connectWallet(userId = getState().session.discordUserId ?? DEFAULT_USER_ID) {
  commit((s) => ({ ...s, session: { ...s.session, walletUserId: userId } }));
}
export function connectDiscord(userId = getState().session.walletUserId ?? DEFAULT_USER_ID) {
  commit((s) => ({ ...s, session: { ...s.session, discordUserId: userId } }));
}
export function disconnectWallet() {
  commit((s) => ({ ...s, session: { ...s.session, walletUserId: null } }));
}
export function disconnectDiscord() {
  commit((s) => ({ ...s, session: { ...s.session, discordUserId: null } }));
}
export function disconnectAll() {
  commit((s) => ({ ...s, session: { walletUserId: null, discordUserId: null } }));
}
/** Switch the fictional identity for whichever connections are active. */
export function switchIdentity(userId: string) {
  commit((s) => ({
    ...s,
    session: {
      walletUserId: s.session.walletUserId ? userId : null,
      discordUserId: s.session.discordUserId ? userId : null,
    },
  }));
}

export function markRefreshed() {
  commit((s) => ({ ...s, refreshedAt: Date.now() }));
}

/* --------------------------------- Launches ------------------------------- */

export interface LaunchInput {
  name: string;
  ticker: string;
  description: string;
  image: CoinImage;
  recipient: Recipient;
  payoutMessage: string;
  devBuy: Lamports;
  socials: Socials;
}

export function createLaunch(input: LaunchInput): Result<string> {
  const s = getState();
  const dev = userById(s.session.walletUserId);
  if (!dev) return fail('Connect a demo wallet first.');
  const id = launchId();
  const mcap0 = 3_500 + Math.round(random() * 2_000) + Math.round((input.devBuy / LAMPORTS_PER_SOL) * 900);
  const launch: Launch = {
    id,
    mint: demoMint(input.ticker),
    name: input.name.trim(),
    ticker: input.ticker,
    description: input.description.trim(),
    image: input.image,
    createdAt: s.now,
    devUserId: dev.id,
    devWallet: dev.wallet,
    recipient: input.recipient,
    payoutMessage: input.payoutMessage.trim(),
    devBuy: input.devBuy,
    socials: input.socials,
    mcap: [mcap0],
    failure: null,
    sample: false,
  };
  commit((st) => ({
    ...st,
    launches: [launch, ...st.launches],
    notices: [
      notice({
        at: st.now,
        kind: 'launch',
        title: `${launch.name} ($${launch.ticker}) launched`,
        body: `Demo coin created by @${dev.username}. Fees route to ${recipientName(launch)}.`,
        launchId: id,
      }),
      ...st.notices,
    ],
  }));
  return ok(id);
}

export function generateFees(id: string): Result<FeeEvent> {
  const s = getState();
  const l = s.launches.find((x) => x.id === id);
  if (!l) return fail('Launch not found.');
  const gross = Math.round((0.15 + random() * 2.25) * LAMPORTS_PER_SOL);
  const ev: FeeEvent = { id: uid('fee'), launchId: id, at: s.now, gross, ...splitFee(gross), sample: false };
  const last = l.mcap[l.mcap.length - 1] ?? 4000;
  const nextMcap = Math.round(last * (1.02 + random() * 0.1));
  commit((st) => ({
    ...st,
    fees: [...st.fees, ev],
    launches: st.launches.map((x) => (x.id === id ? { ...x, mcap: [...x.mcap, nextMcap].slice(-48) } : x)),
    notices: [
      notice({
        at: st.now,
        kind: 'fees',
        title: `$${l.ticker} generated ${sol(gross)} SOL in sample fees`,
        body: `${sol(ev.recipient)} SOL to ${recipientName(l)} · ${sol(ev.platform)} SOL platform share.`,
        launchId: id,
      }),
      ...st.notices,
    ],
  }));
  return ok(ev);
}

export function simulatePayout(id: string): Result<Payout> {
  const s = getState();
  const l = s.launches.find((x) => x.id === id);
  if (!l) return fail('Launch not found.');
  const check = canPayout(s, l);
  if (!check.ok) return fail(check.reason);
  const amount = totalsFor(s, id).pending;
  const to = payoutDestination(s, l)!;
  const p: Payout = { id: uid('pay'), launchId: id, at: s.now, amount, status: 'completed', to, receipt: receiptId('PAY'), sample: false };
  commit((st) => {
    // re-check against the latest state so a double click can never pay twice
    if (totalsFor(st, id).pending !== amount) return st;
    return {
      ...st,
      payouts: [...st.payouts, p],
      launches: st.launches.map((x) => (x.id === id ? { ...x, failure: null } : x)),
      notices: [
        notice({
          at: st.now,
          kind: 'payout',
          title: `${sol(amount)} SOL paid to ${recipientName(l)}`,
          body: `Demo receipt ${p.receipt}. ${BOT_NAME} notification preview prepared (not sent).`,
          launchId: id,
        }),
        ...st.notices,
      ],
    };
  });
  return ok(p);
}

export function simulateFailure(id: string): Result<Payout> {
  const s = getState();
  const l = s.launches.find((x) => x.id === id);
  if (!l) return fail('Launch not found.');
  const check = canPayout(s, l);
  if (!check.ok) return fail(check.reason);
  const reason = 'Simulated RPC timeout — no funds moved. Retry with “Simulate payout”.';
  const p: Payout = {
    id: uid('pay'),
    launchId: id,
    at: s.now,
    amount: totalsFor(s, id).pending,
    status: 'failed',
    to: payoutDestination(s, l)!,
    receipt: receiptId('FAIL'),
    reason,
    sample: false,
  };
  commit((st) => ({
    ...st,
    payouts: [...st.payouts, p],
    launches: st.launches.map((x) => (x.id === id ? { ...x, failure: { at: st.now, reason } } : x)),
    notices: [notice({ at: st.now, kind: 'failure', title: `Payout failed for $${l.ticker}`, body: reason, launchId: id }), ...st.notices],
  }));
  return ok(p);
}

export function runBuyback(): Result<Buyback> {
  const s = getState();
  const { available } = platformTotals(s);
  if (available <= 0) return fail('No unspent platform revenue. Generate sample fees first.');
  const dcm = Math.floor((available * SAMPLE_DCM_PER_SOL) / LAMPORTS_PER_SOL);
  const b: Buyback = {
    id: uid('buy'),
    at: s.now,
    solSpent: available,
    dcmBought: dcm,
    dcmBurned: dcm,
    rate: SAMPLE_DCM_PER_SOL,
    receipt: receiptId('BUY'),
    sample: false,
  };
  commit((st) => ({
    ...st,
    buybacks: [...st.buybacks, b],
    notices: [
      notice({
        at: st.now,
        kind: 'buyback',
        title: `Simulated buyback: ${sol(available)} SOL → ${dcm.toLocaleString('en-US')} $DCM burned`,
        body: `Sample rate ${SAMPLE_DCM_PER_SOL.toLocaleString('en-US')} $DCM per SOL. No tokens exist.`,
      }),
      ...st.notices,
    ],
  }));
  return ok(b);
}

/* ---------------------------------- Claims -------------------------------- */

export const newClaimCode = claimCode;

export function claimServer(p: { serverId: string; discordId: string; adminId: string; wallet: string; code: string }): Result<null> {
  const s = getState();
  const server = serverById(p.serverId);
  const admin = userById(p.adminId);
  if (!server) return fail('Choose a server.');
  if (p.discordId.trim() !== server.discordId)
    return fail(`Server ID does not match ${server.name}. Expected the fictional ID shown in server info.`);
  if (!admin) return fail('Connect a demo Discord identity first.');
  if (!p.code) return fail('Generate a demo code first.');
  if (!p.wallet) return fail('Choose a demo treasury wallet.');
  const existing = s.claims[p.serverId];
  if (existing)
    return fail(`${server.name} is already claimed by @${userById(existing.adminId)?.username}. Conflicting claims are blocked.`);
  if (!admin.manages.includes(p.serverId))
    return fail(`@${admin.username} does not have the simulated Manage Server permission in ${server.name}. Verification refused.`);
  commit((st) => ({
    ...st,
    claims: {
      ...st.claims,
      [p.serverId]: { serverId: p.serverId, adminId: admin.id, wallet: p.wallet, code: p.code, claimedAt: st.now, history: [{ at: st.now, wallet: p.wallet }], sample: false },
    },
    notices: [
      notice({
        at: st.now,
        kind: 'claim',
        title: `${server.name} treasury claimed`,
        body: `Verified demo admin @${admin.username}. Treasury payouts are now enabled.`,
        serverId: p.serverId,
      }),
      ...st.notices,
    ],
  }));
  return ok(null);
}

export function updateTreasuryWallet(serverId: string, wallet: string, actorId: string | null): Result<null> {
  const s = getState();
  const c = s.claims[serverId];
  if (!c) return fail('Server is not claimed.');
  const actor = userById(actorId);
  if (!actor || !actor.manages.includes(serverId)) return fail('Only a verified demo admin of this server can change the treasury wallet.');
  if (wallet === c.wallet) return fail('That wallet is already the treasury destination.');
  commit((st) => ({
    ...st,
    claims: { ...st.claims, [serverId]: { ...c, wallet, updatedAt: st.now, history: [...c.history, { at: st.now, wallet }] } },
    notices: [
      notice({ at: st.now, kind: 'claim', title: `${serverById(serverId)?.name} treasury wallet updated`, body: `Changed by @${actor.username}.`, serverId }),
      ...st.notices,
    ],
  }));
  return ok(null);
}

/* ------------------------------ Sponsored posts --------------------------- */

export interface OfferInput {
  serverId: string;
  channel: string;
  price: Lamports;
  postWithinDays: number;
  required: string;
  notes: string;
}

export function createOffer(input: OfferInput): Result<string> {
  const s = getState();
  const sponsor = userById(s.session.walletUserId);
  if (!sponsor) return fail('Connect a demo wallet to fund the offer.');
  const o: Offer = {
    id: uid('of'),
    createdAt: s.now,
    sponsorId: sponsor.id,
    sponsorWallet: sponsor.wallet,
    ...input,
    required: input.required.trim(),
    notes: input.notes.trim(),
    messages: [],
    log: [{ at: s.now, text: `Offer created by @${sponsor.username}; ${sol(input.price)} SOL placed in demo escrow.` }],
    sample: false,
  };
  commit((st) => ({
    ...st,
    offers: [o, ...st.offers],
    notices: [
      notice({ at: st.now, kind: 'offer', title: `New sponsored post offer for ${serverById(o.serverId)?.name}`, body: `${sol(o.price)} SOL held in demo escrow.`, offerId: o.id }),
      ...st.notices,
    ],
  }));
  return ok(o.id);
}

function updateOffer(id: string, fn: (o: Offer, now: number) => Offer | string, noticeOf?: (o: Offer) => Omit<Notice, 'id' | 'sample' | 'at'>): Result<Offer> {
  const s = getState();
  const o = s.offers.find((x) => x.id === id);
  if (!o) return fail('Offer not found.');
  const next = fn(o, s.now);
  if (typeof next === 'string') return fail(next);
  commit((st) => ({
    ...st,
    offers: st.offers.map((x) => (x.id === id ? next : x)),
    notices: noticeOf ? [notice({ ...noticeOf(next), at: st.now }), ...st.notices] : st.notices,
  }));
  return ok(next);
}

export const acceptOffer = (id: string) =>
  updateOffer(id, (o, now) => {
    if (!offerView(o, now).canAccept) return 'This offer can no longer be accepted.';
    const deadline = now + o.postWithinDays * DAY;
    return { ...o, acceptedAt: now, deadline, log: [...o.log, { at: now, text: `Accepted by demo server admin. Post deadline set to ${o.postWithinDays} day(s).` }] };
  });

export const cancelOffer = (id: string) =>
  updateOffer(
    id,
    (o, now) => {
      if (!offerView(o, now).canCancel) return 'Only offers awaiting acceptance can be cancelled.';
      return {
        ...o,
        settlement: { kind: 'cancelled', at: now, amount: o.price, receipt: receiptId('REF') },
        log: [...o.log, { at: now, text: `Sponsor cancelled. ${sol(o.price)} SOL escrow returned.` }],
      };
    },
    (o) => ({ kind: 'offer', title: 'Sponsored post cancelled', body: `${sol(o.price)} SOL returned from demo escrow.`, offerId: o.id }),
  );

export function submitMessage(id: string, text: string): Result<{ qualifies: boolean; replaced: boolean }> {
  let info = { qualifies: false, replaced: false };
  const r = updateOffer(id, (o, now) => {
    const v = offerView(o, now);
    if (!o.acceptedAt) return 'The offer must be accepted first.';
    if (o.settlement) return 'This offer is already settled.';
    if (v.pastDeadline) return 'The posting deadline has passed. Submissions are closed.';
    const t = text.trim();
    if (!t) return 'Enter the demo message text.';
    const qualifies = matchesRequired(t, o.required);
    const live = liveMessage(o);
    const msgId = uid('msg');
    let messages = o.messages;
    const log = [...o.log];
    if (qualifies && live) {
      messages = messages.map((m) => (m.id === live.id ? { ...m, removedAt: now } : m));
      log.push({ at: now, text: 'Previous message replaced before the deadline; retention restarted.' });
    }
    messages = [
      ...messages,
      { id: msgId, text: t, submittedAt: now, qualifies, ...(qualifies ? {} : { reason: `Missing required text “${o.required}”.` }) },
    ];
    log.push({
      at: now,
      text: qualifies ? 'Qualifying demo message submitted; 72-hour retention started.' : `Message rejected — required text “${o.required}” not found.`,
    });
    info = { qualifies, replaced: qualifies && Boolean(live) };
    return { ...o, messages, log };
  });
  return r.ok ? ok(info) : r;
}

export const removeMessage = (id: string) =>
  updateOffer(id, (o, now) => {
    const live = liveMessage(o);
    if (!live || o.settlement) return 'There is no live qualifying message to remove.';
    return {
      ...o,
      messages: o.messages.map((m) => (m.id === live.id ? { ...m, removedAt: now } : m)),
      log: [...o.log, { at: now, text: 'Demo message removed before 72 hours — post invalidated.' }],
    };
  });

export const processOfferPayout = (id: string) =>
  updateOffer(
    id,
    (o, now) => {
      if (o.settlement) return 'This offer is already settled — it can never be paid and refunded.';
      const v = offerView(o, now);
      if (!v.live) return 'No live qualifying message.';
      if (!v.canPay) return `Retention not complete. ${Math.ceil((v.retentionLeft ?? 0) / 3_600_000)}h remaining on the demo clock.`;
      const { platform, recipient } = splitFee(o.price);
      return {
        ...o,
        settlement: { kind: 'paid', at: now, recipientAmount: recipient, platformAmount: platform, to: `${serverById(o.serverId)?.name} treasury`, receipt: receiptId('ESC') },
        log: [...o.log, { at: now, text: `Retention verified. Released ${sol(recipient)} SOL to recipient and ${sol(platform)} SOL platform fee.` }],
      };
    },
    (o) => ({ kind: 'offer', title: `Sponsored post completed in ${serverById(o.serverId)?.name}`, body: `${sol(splitFee(o.price).recipient)} SOL released from demo escrow (90/10).`, offerId: o.id }),
  );

export const processOfferRefund = (id: string) =>
  updateOffer(
    id,
    (o, now) => {
      if (o.settlement) return 'This offer is already settled — it can never be paid and refunded.';
      const v = offerView(o, now);
      if (!o.acceptedAt) return 'Unaccepted offers are cancelled, not refunded.';
      if (v.live) return 'A qualifying message is live. Refunds are only possible without a qualifying post.';
      if (!v.pastDeadline) return 'The posting deadline has not passed yet. Advance the demo clock.';
      return {
        ...o,
        settlement: { kind: 'refunded', at: now, amount: o.price, reason: 'No qualifying post by the deadline.', receipt: receiptId('REF') },
        log: [...o.log, { at: now, text: `No qualifying post by the deadline. Full ${sol(o.price)} SOL refunded to sponsor.` }],
      };
    },
    (o) => ({ kind: 'offer', title: 'Sponsored post refunded', body: `${sol(o.price)} SOL returned to sponsor from demo escrow.`, offerId: o.id }),
  );

export function advanceClock(ms: number) {
  commit((s) => ({ ...s, now: s.now + ms }));
}
