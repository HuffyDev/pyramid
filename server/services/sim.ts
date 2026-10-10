import type { BrickView, MarketTick } from '../../shared/pyramid.js';
import { HOUR } from '../../shared/pyramid.js';

/**
 * SIM mode: synthetic launches and a random-walk market so the pyramid looks alive while testing.
 * Purely in memory. Never touches the chain, the database or any external API.
 */

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const A = ['sand', 'dune', 'gold', 'moon', 'night', 'tomb', 'sun', 'scarab', 'oasis', 'mirage', 'jackal', 'camel', 'falcon', 'lazy', 'tiny', 'based', 'sleepy', 'cursed', 'lucky', 'giga', 'wet', 'crying', 'ancient', 'quiet', 'feral', 'cosmic', 'bald', 'chunky', 'sad', 'brave'];
const N = ['cat', 'frog', 'dog', 'brick', 'mummy', 'sphinx', 'beetle', 'goose', 'otter', 'stone', 'block', 'lizard', 'hippo', 'crab', 'ibis', 'snail', 'pigeon', 'cobra', 'bean', 'rock', 'moth', 'toad', 'worm', 'yak', 'gecko', 'capy', 'monk', 'chad', 'king', 'mason'];
const DESC = [
  'just a brick in the pyramid.',
  'laid at night. wrapped in linen.',
  'the sand remembers.',
  'one more stone for the monument.',
  'we build up. we never take down.',
  'dug up from the dunes.',
  'a small brick with big plans.',
  'carried here by camel.',
];

const pick = <T>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];
const addr = (r: () => number, len = 44) => Array.from({ length: len }, () => B58[Math.floor(r() * B58.length)]).join('');

export interface SimBrick extends Omit<BrickView, 'n'> {
  description: string;
}

export function makeSimBrick(r: () => number, placedAt: number, threshold: number, opts: { fresh?: boolean } = {}): SimBrick {
  const a = pick(r, A);
  const n = pick(r, N);
  const name = r() < 0.5 ? `${a} ${n}` : `${n}${r() < 0.3 ? ' coin' : ''}`;
  const ticker = (r() < 0.6 ? (a.slice(0, 2) + n.slice(0, 3)) : n.slice(0, 5)).toUpperCase().slice(0, 6) + (r() < 0.15 ? String(Math.floor(r() * 9) + 1) : '');
  // log-normal-ish mcap: most coins tiny, a few monuments
  const u = r();
  const mcap = opts.fresh ? 4200 + r() * 3000 : Math.round(Math.exp(8.2 + Math.pow(u, 2.4) * 7.2 + r() * 0.6));
  const age = Date.now() - placedAt;
  let belowSince: string | null = null;
  if (!opts.fresh && mcap < threshold && age > 30 * HOUR && r() < 0.75) belowSince = new Date(placedAt + (6 + r() * 20) * HOUR).toISOString();
  return {
    mint: addr(r, 40) + 'pump',
    name: name.replace(/\b\w/g, (c) => c.toUpperCase()),
    ticker,
    image: null,
    creator: addr(r),
    placedAt: new Date(placedAt).toISOString(),
    mcap,
    ch24: Math.round((r() - 0.42) * 160 * 10) / 10,
    belowSince,
    hidden: false,
    sim: true,
    dryRun: false,
    description: pick(r, DESC),
  };
}

export interface SimWorld {
  bricks(): SimBrick[];
  get(mint: string): SimBrick | null;
  setHidden(mint: string, hidden: boolean): void;
  /** new synthetic launch (placed now) */
  launch(): SimBrick;
  /** random-walk a slice of the market; returns ticks for bricks that changed */
  step(): MarketTick[];
}

export function createSimWorld(opts: { seedCount: number; threshold: number; seed?: number }): SimWorld {
  const r = rng(opts.seed ?? 0xb71c);
  const list: SimBrick[] = [];
  const now = Date.now();
  // seed history spread over the last ~10 days, denser recently
  for (let i = 0; i < opts.seedCount; i++) {
    const t = now - Math.pow(1 - i / Math.max(1, opts.seedCount), 1.6) * 10 * 24 * HOUR - 60_000;
    list.push(makeSimBrick(r, t, opts.threshold));
  }
  list.sort((a, b) => a.placedAt.localeCompare(b.placedAt));
  const byMint = new Map(list.map((b) => [b.mint, b]));

  return {
    bricks: () => list,
    get: (m) => byMint.get(m) ?? null,
    setHidden(m, h) {
      const b = byMint.get(m);
      if (b) b.hidden = h;
    },
    launch() {
      const b = makeSimBrick(r, Date.now(), opts.threshold, { fresh: true });
      list.push(b);
      byMint.set(b.mint, b);
      return b;
    },
    step() {
      const ticks: MarketTick[] = [];
      const k = Math.max(1, Math.ceil(list.length * 0.08));
      for (let i = 0; i < k; i++) {
        const b = list[Math.floor(r() * list.length)];
        if (!b || b.mcap == null) continue;
        const drift = b.belowSince ? -0.004 : 0.004;
        const shock = (r() - 0.5) * (b.mcap < 20_000 ? 0.22 : 0.08);
        b.mcap = Math.max(2500, Math.round(b.mcap * Math.exp(drift + shock)));
        b.ch24 = Math.round(Math.max(-99, (b.ch24 ?? 0) + shock * 100) * 10) / 10;
        // sim keeps existing cracks so screenshots stay stable; a big pump heals one
        if (b.belowSince && b.mcap >= opts.threshold * 3) b.belowSince = null;
        ticks.push({ mint: b.mint, mcap: b.mcap, ch24: b.ch24, belowSince: b.belowSince });
      }
      return ticks;
    },
  };
}
