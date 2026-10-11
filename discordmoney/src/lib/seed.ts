import { BOT_NAME, SAMPLE_DCM_PER_SOL, SERVERS, USERS, serverById, userById } from './fixtures';
import { DAY, HOUR, LAMPORTS_PER_SOL, sol } from './format';
import { demoMint, hex, mulberry32, receiptId, withRandom } from './ids';
import { RETENTION_MS, splitFee } from './ledger';
import type {
  Buyback,
  DemoState,
  FeeEvent,
  Launch,
  Notice,
  Offer,
  Payout,
  Recipient,
  Socials,
  TreasuryClaim,
} from './types';

export const STATE_VERSION = 3;

type PayPlan = 'all' | 'none' | 'partial' | 'tail' | 'fail' | 'zero';

interface Spec {
  name: string;
  ticker: string;
  description: string;
  dev: string;
  recipient: Recipient;
  ageDays: number;
  fees: number;
  avgSol: number;
  plan: PayPlan;
  message: string;
  socials?: Socials;
  mcap: number;
}

const m = (userId: string): Recipient => ({ kind: 'member', userId });
const s = (serverId: string): Recipient => ({ kind: 'server', serverId });

const SPECS: Spec[] = [
  {
    name: 'Guild Cat',
    ticker: 'GCAT',
    description: 'The unofficial mascot of every late-night build session. Fees go to the member who keeps the guild running.',
    dev: 'usr-nova',
    recipient: m('usr-minty'),
    ageDays: 19,
    fees: 7,
    avgSol: 1.4,
    plan: 'all',
    message: 'Thanks for herding the cats this week',
    socials: { x: 'https://x.com/guildcat_demo', website: 'https://guildcat.example' },
    mcap: 182_000,
  },
  {
    name: 'Raid Frog',
    ticker: 'RFROG',
    description: 'A ribbiting raid-night token for the Council. Treasury fees are waiting for an admin to claim them.',
    dev: 'usr-raid',
    recipient: s('srv-frog'),
    ageDays: 17,
    fees: 6,
    avgSol: 1.1,
    plan: 'none',
    message: 'Pond fund top-up for raid prizes',
    socials: { discord: 'https://discord.gg/frogcouncil-demo' },
    mcap: 96_400,
  },
  {
    name: 'Mod Fuel',
    ticker: 'MODF',
    description: 'Coffee money for the moderators. Every trade tops up the Pixel Forge treasury.',
    dev: 'usr-nova',
    recipient: s('srv-pixel'),
    ageDays: 15,
    fees: 8,
    avgSol: 0.9,
    plan: 'partial',
    message: 'Mod team snacks are on the house',
    socials: { x: 'https://x.com/modfuel_demo' },
    mcap: 141_000,
  },
  {
    name: 'Voice Goblin',
    ticker: 'VGOB',
    description: 'Lives in voice channels, never unmutes. Fees support the host of the weekly listening party.',
    dev: 'usr-lunar',
    recipient: m('usr-hex'),
    ageDays: 14,
    fees: 5,
    avgSol: 0.7,
    plan: 'all',
    message: 'Goblin hours sponsor drop',
    mcap: 58_300,
  },
  {
    name: 'Server Rat',
    ticker: 'SRAT',
    description: 'Scurries through every channel collecting crumbs. Orbit Arcade has not claimed its treasury yet.',
    dev: 'usr-salty',
    recipient: s('srv-orbit'),
    ageDays: 13,
    fees: 4,
    avgSol: 0.6,
    plan: 'none',
    message: 'Crumbs for the high-score board',
    mcap: 44_900,
  },
  {
    name: 'Ping Coin',
    ticker: 'PING',
    description: 'One notification at a time. The last demo payout attempt failed and is waiting for a retry.',
    dev: 'usr-hex',
    recipient: m('usr-lunar'),
    ageDays: 12,
    fees: 5,
    avgSol: 0.8,
    plan: 'fail',
    message: '@here your ping fund arrived',
    socials: { website: 'https://pingcoin.example' },
    mcap: 71_200,
  },
  {
    name: 'Emote Bean',
    ticker: 'BEAN',
    description: 'Small, round and in every reaction bar. Supports the Cozy Builders community treasury.',
    dev: 'usr-minty',
    recipient: s('srv-cozy'),
    ageDays: 11,
    fees: 6,
    avgSol: 0.5,
    plan: 'all',
    message: 'Bean jar refilled for build contests',
    mcap: 38_700,
  },
  {
    name: 'Lurker Duck',
    ticker: 'LURK',
    description: 'Reads everything, says nothing. Fees reward the quietest helper in the help channel.',
    dev: 'usr-owl',
    recipient: m('usr-quiet'),
    ageDays: 10,
    fees: 4,
    avgSol: 0.4,
    plan: 'tail',
    message: 'For the duck who answers every question',
    mcap: 22_100,
  },
  {
    name: 'Thread Owl',
    ticker: 'OWL',
    description: 'Keeps every discussion in its own thread. Signal Room treasury is still unclaimed.',
    dev: 'usr-owl',
    recipient: s('srv-signal'),
    ageDays: 9,
    fees: 5,
    avgSol: 0.75,
    plan: 'none',
    message: 'Briefing fund for the night shift',
    socials: { x: 'https://x.com/threadowl_demo', discord: 'https://discord.gg/signalroom-demo' },
    mcap: 64_800,
  },
  {
    name: 'Role Badger',
    ticker: 'ROLE',
    description: 'Hands out roles with enthusiasm. Midnight Labs collects the treasury share.',
    dev: 'usr-hex',
    recipient: s('srv-midnight'),
    ageDays: 8,
    fees: 7,
    avgSol: 0.65,
    plan: 'partial',
    message: 'Lab equipment fund',
    mcap: 88_500,
  },
  {
    name: 'Slowmode Snail',
    ticker: 'SNAIL',
    description: 'Ten-second cooldown, infinite patience. Just launched — no fees yet.',
    dev: 'usr-salty',
    recipient: m('usr-salty'),
    ageDays: 0.4,
    fees: 0,
    avgSol: 0,
    plan: 'zero',
    message: '',
    mcap: 4_200,
  },
  {
    name: 'Lobby Fox',
    ticker: 'LOBBY',
    description: 'Waits in every lobby until the squad is ready. Orbit Arcade can claim fees once they arrive.',
    dev: 'usr-nova',
    recipient: s('srv-orbit'),
    ageDays: 1.2,
    fees: 0,
    avgSol: 0,
    plan: 'zero',
    message: 'Tournament prize pool',
    mcap: 6_900,
  },
  {
    name: 'Patch Notes',
    ticker: 'PATCH',
    description: 'Ships every Friday, breaks every Saturday. Treasury share supports Midnight Labs.',
    dev: 'usr-lunar',
    recipient: s('srv-midnight'),
    ageDays: 16,
    fees: 6,
    avgSol: 1.2,
    plan: 'all',
    message: 'v2.1 shipped — thanks testers',
    socials: { website: 'https://patchnotes.example' },
    mcap: 133_000,
  },
  {
    name: 'Stage Crab',
    ticker: 'CRAB',
    description: 'Sideways into every stage event. Fees go to the host who runs the Friday stage.',
    dev: 'usr-raid',
    recipient: m('usr-raid'),
    ageDays: 6,
    fees: 6,
    avgSol: 1.6,
    plan: 'none',
    message: 'Stage night was a hit',
    mcap: 152_000,
  },
  {
    name: 'Reaction Bee',
    ticker: 'BUZZ',
    description: 'Buzzes on every message. The latest Pixel Forge payout simulation failed.',
    dev: 'usr-minty',
    recipient: s('srv-pixel'),
    ageDays: 5,
    fees: 4,
    avgSol: 0.55,
    plan: 'fail',
    message: 'Honey for the showcase winners',
    mcap: 31_500,
  },
  {
    name: 'Pixel Toast',
    ticker: 'TOAST',
    description: 'Golden-brown pixel art, served warm. Supports the community artist who draws the emotes.',
    dev: 'usr-nova',
    recipient: m('usr-owl'),
    ageDays: 4,
    fees: 5,
    avgSol: 0.9,
    plan: 'partial',
    message: 'Emote commission tip jar',
    socials: { x: 'https://x.com/pixeltoast_demo' },
    mcap: 77_800,
  },
  {
    name: 'Midnight Moth',
    ticker: 'MOTH',
    description: 'Drawn to the brightest screen in the room. Supports Midnight Labs after-hours sessions.',
    dev: 'usr-hex',
    recipient: s('srv-midnight'),
    ageDays: 3,
    fees: 3,
    avgSol: 0.35,
    plan: 'tail',
    message: 'Lamp oil for late sessions',
    mcap: 19_400,
  },
  {
    name: 'Echo Sprout',
    ticker: 'ECHO',
    description: 'Repeats the good ideas until they grow. Fees support the member who plants the weekly prompt.',
    dev: 'usr-nova',
    recipient: m('usr-nova'),
    ageDays: 2,
    fees: 4,
    avgSol: 0.7,
    plan: 'partial',
    message: 'Prompt garden is growing',
    mcap: 41_600,
  },
];

const OFFER_TEXTS = [
  'raidfrog.example/raid',
  'Join the Signal sprint',
  'pixelforge-jam',
  'Cozy Build Week',
  'midnightlabs.example/beta',
  'orbit cup qualifiers',
  'frog council votes now',
  'signal briefing live',
  'forge market day',
  'labs open house',
  'pixel jam signups',
];

export function createSeed(now: number = Date.now()): DemoState {
  return withRandom(mulberry32(0xd15c0d), () => buildSeed(now));
}

function lam(solAmount: number) {
  return Math.round(solAmount * LAMPORTS_PER_SOL);
}

function buildSeed(now: number): DemoState {
  const r = mulberry32(42);
  const claimedAt = now - 25 * DAY;
  const claims: Record<string, TreasuryClaim> = {};
  const claim = (serverId: string, adminId: string) => {
    const wallet = userById(adminId)!.wallet;
    claims[serverId] = {
      serverId,
      adminId,
      wallet,
      code: `DCM-DEMO-${hex(4)}`,
      claimedAt,
      history: [{ at: claimedAt, wallet }],
      sample: true,
    };
  };
  claim('srv-pixel', 'usr-nova');
  claim('srv-midnight', 'usr-hex');
  claim('srv-cozy', 'usr-minty');

  const launches: Launch[] = [];
  const fees: FeeEvent[] = [];
  const payouts: Payout[] = [];

  SPECS.forEach((spec, i) => {
    const createdAt = Math.round(now - spec.ageDays * DAY - r() * 3 * HOUR);
    const id = `dm-${(0x1a2b + i * 0x3f1).toString(16)}`;
    const dev = userById(spec.dev)!;
    const series: number[] = [];
    let v = spec.mcap * (0.18 + r() * 0.12);
    for (let k = 0; k < 24; k++) {
      v = Math.max(1500, v * (1 + (r() - 0.38) * 0.22));
      series.push(Math.round(v));
    }
    const scale = spec.mcap / series[series.length - 1];
    const mcap = series.map((x, k) => (k === series.length - 1 ? spec.mcap : Math.round(x * scale)));

    const launch: Launch = {
      id,
      mint: demoMint(spec.ticker),
      name: spec.name,
      ticker: spec.ticker,
      description: spec.description,
      image: { kind: 'art', seed: i * 7 + 3 },
      createdAt,
      devUserId: dev.id,
      devWallet: dev.wallet,
      recipient: spec.recipient,
      payoutMessage: spec.message,
      devBuy: lam([0, 0.5, 1, 0, 2, 0.25][i % 6]),
      socials: spec.socials ?? {},
      mcap,
      failure: null,
      sample: true,
    };
    launches.push(launch);

    const span = now - createdAt - 2 * HOUR;
    const evs: FeeEvent[] = [];
    for (let k = 0; k < spec.fees; k++) {
      const gross = lam(spec.avgSol * (0.45 + r() * 1.1));
      const at = Math.round(createdAt + HOUR + (span * (k + 0.5 + r() * 0.4)) / (spec.fees + 0.5));
      evs.push({ id: `fee-${id}-${k}`, launchId: id, at, gross, ...splitFee(gross), sample: true });
    }
    fees.push(...evs);

    const dest = spec.recipient.kind === 'member' ? userById(spec.recipient.userId)!.wallet : claims[spec.recipient.serverId]?.wallet ?? '';
    const pay = (upto: number, label: number) => {
      const slice = evs.slice(0, upto);
      const earned = slice.reduce((sum, f) => sum + f.recipient, 0);
      const already = payouts.filter((p) => p.launchId === id && p.status === 'completed').reduce((sum, p) => sum + p.amount, 0);
      const amount = earned - already;
      if (amount <= 0) return;
      payouts.push({
        id: `pay-${id}-${label}`,
        launchId: id,
        at: slice[slice.length - 1].at + Math.round((2 + r() * 6) * HOUR),
        amount,
        status: 'completed',
        to: dest,
        receipt: receiptId('PAY'),
        sample: true,
      });
    };

    const half = Math.max(1, Math.floor(evs.length / 2));
    if (spec.plan === 'all') {
      pay(half, 1);
      pay(evs.length, 2);
      // keep the final payout inside the timeline
      const last = payouts[payouts.length - 1];
      if (last && last.at > now - HOUR) last.at = now - HOUR;
    } else if (spec.plan === 'partial') {
      pay(half, 1);
    } else if (spec.plan === 'tail') {
      pay(evs.length, 1);
      const last = payouts[payouts.length - 1];
      if (last.at > now - 3 * HOUR) last.at = now - 3 * HOUR;
      const gross = lam(0.02 + r() * 0.02);
      fees.push({ id: `fee-${id}-tail`, launchId: id, at: now - 2 * HOUR, gross, ...splitFee(gross), sample: true });
    } else if (spec.plan === 'fail') {
      const at = now - Math.round((3 + r() * 10) * HOUR);
      payouts.push({
        id: `pay-${id}-fail`,
        launchId: id,
        at,
        amount: evs.reduce((sum, f) => sum + f.recipient, 0),
        status: 'failed',
        to: dest,
        receipt: receiptId('FAIL'),
        reason: 'Simulated network timeout while preparing the demo transfer.',
        sample: true,
      });
      launch.failure = { at, reason: 'Simulated network timeout while preparing the demo transfer.' };
    }
  });

  // Buybacks only spend platform revenue that existed at the time.
  const buybacks: Buyback[] = [];
  const sortedFees = [...fees].sort((a, b) => a.at - b.at);
  let spent = 0;
  for (const daysAgo of [13, 9, 5, 2]) {
    const at = now - daysAgo * DAY;
    const revenue = sortedFees.filter((f) => f.at <= at).reduce((sum, f) => sum + f.platform, 0);
    const available = revenue - spent;
    const solSpent = Math.floor(available * 0.85);
    if (solSpent <= 0) continue;
    const dcm = Math.floor((solSpent * SAMPLE_DCM_PER_SOL) / LAMPORTS_PER_SOL);
    buybacks.push({
      id: `buy-${daysAgo}`,
      at,
      solSpent,
      dcmBought: dcm,
      dcmBurned: dcm,
      rate: SAMPLE_DCM_PER_SOL,
      receipt: receiptId('BUY'),
      sample: true,
    });
    spent += solSpent;
  }

  const offers = seedOffers(now);
  const state: DemoState = {
    version: STATE_VERSION,
    seededAt: now,
    now,
    refreshedAt: Date.now(),
    claims,
    launches: launches.sort((a, b) => b.createdAt - a.createdAt),
    fees,
    payouts,
    buybacks,
    offers,
    notices: [],
    session: { walletUserId: null, discordUserId: null },
  };
  state.notices = seedNotices(state);
  return state;
}

function seedOffers(now: number): Offer[] {
  const base = (
    i: number,
    sponsorId: string,
    serverId: string,
    priceSol: number,
    days: number,
    createdAgoH: number,
  ): Offer => {
    const sponsor = userById(sponsorId)!;
    const server = serverById(serverId)!;
    const createdAt = now - createdAgoH * HOUR;
    return {
      id: `of-${(0x51 + i * 17).toString(16)}${i}`,
      createdAt,
      sponsorId,
      sponsorWallet: sponsor.wallet,
      serverId,
      channel: server.announcementChannel,
      price: lam(priceSol),
      postWithinDays: days,
      required: OFFER_TEXTS[i],
      notes: i % 3 === 0 ? 'Pin for the first few hours if possible.' : '',
      messages: [],
      log: [{ at: createdAt, text: `Offer created by @${sponsor.username}; ${priceSol} SOL placed in demo escrow.` }],
      sample: true,
    };
  };
  const accept = (o: Offer, agoH: number) => {
    o.acceptedAt = now - agoH * HOUR;
    o.deadline = o.acceptedAt + o.postWithinDays * DAY;
    o.log.push({ at: o.acceptedAt, text: 'Accepted by demo server admin.' });
  };
  const post = (o: Offer, agoH: number, removedAgoH?: number) => {
    const at = now - agoH * HOUR;
    o.messages.push({
      id: `msg-${o.id}-${o.messages.length}`,
      text: `Sponsored: ${o.required} — check it out!`,
      submittedAt: at,
      qualifies: true,
      ...(removedAgoH !== undefined ? { removedAt: now - removedAgoH * HOUR } : {}),
    });
    o.log.push({ at, text: 'Qualifying demo message submitted; 72-hour retention started.' });
    if (removedAgoH !== undefined)
      o.log.push({ at: now - removedAgoH * HOUR, text: 'Demo message removed early — retention invalidated.' });
  };
  const offers: Offer[] = [];

  const o0 = base(0, 'usr-salty', 'srv-frog', 1.5, 3, 5);
  offers.push(o0);

  const o1 = base(1, 'usr-lunar', 'srv-signal', 0.8, 7, 26);
  offers.push(o1);

  const o2 = base(2, 'usr-nova', 'srv-pixel', 2, 3, 30);
  accept(o2, 20);
  offers.push(o2);

  const o3 = base(3, 'usr-hex', 'srv-cozy', 1.2, 3, 40);
  accept(o3, 24);
  post(o3, 0);
  offers.push(o3);

  const o4 = base(4, 'usr-nova', 'srv-midnight', 3, 7, 110);
  accept(o4, 96);
  post(o4, 75);
  offers.push(o4);

  const o5 = base(5, 'usr-minty', 'srv-orbit', 0.6, 3, 60);
  accept(o5, 48);
  post(o5, 40, 30);
  o5.messages.push({
    id: `msg-${o5.id}-1`,
    text: `Reminder: ${o5.required.toUpperCase()} start this weekend`,
    submittedAt: now - 20 * HOUR,
    qualifies: true,
  });
  o5.log.push({ at: now - 20 * HOUR, text: 'Replacement message submitted before the deadline; retention restarted.' });
  offers.push(o5);

  const o6 = base(6, 'usr-raid', 'srv-frog', 2.5, 3, 200);
  accept(o6, 190);
  post(o6, 170);
  settlePaid(o6, now - 98 * HOUR);
  offers.push(o6);

  const o7 = base(7, 'usr-nova', 'srv-signal', 1, 1, 150);
  accept(o7, 140);
  post(o7, 130);
  settlePaid(o7, now - 58 * HOUR);
  offers.push(o7);

  const o8 = base(8, 'usr-quiet', 'srv-pixel', 0.9, 1, 120);
  accept(o8, 110);
  o8.settlement = { kind: 'refunded', at: now - 80 * HOUR, amount: o8.price, reason: 'No qualifying post before the deadline.', receipt: receiptId('REF') };
  o8.log.push({ at: now - 80 * HOUR, text: `Deadline passed without a qualifying post. Full ${sol(o8.price)} SOL refunded to sponsor.` });
  offers.push(o8);

  const o9 = base(9, 'usr-owl', 'srv-midnight', 0.5, 14, 90);
  o9.settlement = { kind: 'cancelled', at: now - 70 * HOUR, amount: o9.price, receipt: receiptId('REF') };
  o9.log.push({ at: now - 70 * HOUR, text: 'Sponsor cancelled before acceptance. Escrow returned.' });
  offers.push(o9);

  const o10 = base(10, 'usr-lunar', 'srv-pixel', 0.75, 1, 50);
  accept(o10, 36);
  o10.log.push({ at: now - 12 * HOUR, text: 'Posting deadline passed with no qualifying message.' });
  offers.push(o10);

  return offers.sort((a, b) => b.createdAt - a.createdAt);
}

function settlePaid(o: Offer, at: number) {
  const { platform, recipient } = splitFee(o.price);
  const live = o.messages[o.messages.length - 1];
  const end = live.submittedAt + RETENTION_MS;
  const when = Math.max(at, end);
  o.settlement = { kind: 'paid', at: when, recipientAmount: recipient, platformAmount: platform, to: `${serverById(o.serverId)!.name} treasury`, receipt: receiptId('ESC') };
  o.log.push({ at: end, text: '72-hour retention completed.' });
  o.log.push({ at: when, text: `Released ${sol(recipient)} SOL to recipient, ${sol(platform)} SOL platform fee.` });
}

function seedNotices(state: DemoState): Notice[] {
  const notices: Notice[] = [];
  const byId = new Map(state.launches.map((l) => [l.id, l]));
  for (const l of state.launches) {
    notices.push({
      id: `n-l-${l.id}`,
      at: l.createdAt,
      kind: 'launch',
      title: `${l.name} ($${l.ticker}) launched`,
      body: `Demo coin created by @${userById(l.devUserId)?.username}.`,
      launchId: l.id,
      sample: true,
    });
  }
  for (const p of state.payouts) {
    const l = byId.get(p.launchId)!;
    notices.push({
      id: `n-${p.id}`,
      at: p.at,
      kind: p.status === 'completed' ? 'payout' : 'failure',
      title: p.status === 'completed' ? `${sol(p.amount)} SOL paid to ${recipientLabel(l)}` : `Payout failed for $${l.ticker}`,
      body: p.status === 'completed' ? `${BOT_NAME} preview prepared for ${l.name}.` : p.reason ?? 'Simulated failure.',
      launchId: l.id,
      sample: true,
    });
  }
  for (const c of Object.values(state.claims)) {
    notices.push({
      id: `n-c-${c.serverId}`,
      at: c.claimedAt,
      kind: 'claim',
      title: `${serverById(c.serverId)?.name} treasury claimed`,
      body: `Verified demo admin @${userById(c.adminId)?.username}.`,
      serverId: c.serverId,
      sample: true,
    });
  }
  for (const b of state.buybacks) {
    notices.push({
      id: `n-${b.id}`,
      at: b.at,
      kind: 'buyback',
      title: `Simulated buyback: ${sol(b.solSpent)} SOL → ${b.dcmBurned.toLocaleString('en-US')} $DCM burned`,
      body: 'Sample exchange rate; no tokens exist.',
      sample: true,
    });
  }
  // A few fee notices for flavour, largest first.
  const big = [...state.fees].sort((a, b) => b.gross - a.gross).slice(0, 6);
  for (const f of big) {
    const l = byId.get(f.launchId)!;
    notices.push({
      id: `n-${f.id}`,
      at: f.at,
      kind: 'fees',
      title: `$${l.ticker} generated ${sol(f.gross)} SOL in fees`,
      body: `${sol(f.recipient)} SOL to recipient · ${sol(f.platform)} SOL platform share.`,
      launchId: l.id,
      sample: true,
    });
  }
  return notices.sort((a, b) => b.at - a.at);
}

function recipientLabel(l: Launch) {
  return l.recipient.kind === 'member'
    ? `@${userById(l.recipient.userId)?.username}`
    : `${serverById(l.recipient.serverId)?.name} treasury`;
}

/** Sanity checks used by tests and by the loader. */
export function seedInvariants(state: DemoState): string[] {
  const errors: string[] = [];
  if (state.launches.length < 18) errors.push('need 18 launches');
  if (SERVERS.length < 6) errors.push('need 6 servers');
  if (USERS.length < 8) errors.push('need 8 users');
  if (state.offers.length < 10) errors.push('need 10 offers');
  for (const l of state.launches) {
    const earned = state.fees.filter((f) => f.launchId === l.id).reduce((x, f) => x + f.recipient, 0);
    const paid = state.payouts.filter((p) => p.launchId === l.id && p.status === 'completed').reduce((x, p) => x + p.amount, 0);
    if (paid > earned) errors.push(`${l.ticker} overpaid`);
    if (l.recipient.kind === 'server' && paid > 0 && !state.claims[l.recipient.serverId]) errors.push(`${l.ticker} paid unclaimed`);
  }
  return errors;
}
