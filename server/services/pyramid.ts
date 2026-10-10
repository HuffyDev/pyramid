import type { LaunchRecord } from '../../shared/launch.js';
import { nextBelowSince, slotOf, type BrickView, type MarketTick } from '../../shared/pyramid.js';
import type { Env } from '../env.js';
import type { Store } from '../db/store.js';
import type { MarketData } from './dexscreener.js';
import type { SimWorld } from './sim.js';

export type Broadcast = (channel: string, payload: unknown) => void;

export interface PyramidDeps {
  env: Env;
  store: Store;
  broadcast?: Broadcast;
  markets?: (mints: string[]) => Promise<Map<string, MarketData>>;
  sim?: SimWorld | null;
  log?: (msg: string) => void;
}

export const brickFromLaunch = (l: LaunchRecord): Omit<BrickView, 'n'> => ({
  mint: l.mint,
  name: l.name,
  ticker: l.ticker,
  image: l.imageUri,
  creator: l.creator,
  placedAt: l.placedAt ?? l.createdAt,
  mcap: l.marketCapUsd,
  ch24: l.change24h,
  belowSince: l.belowSince,
  hidden: l.hidden,
  sim: false,
  dryRun: l.simulated,
});

/** What the public sees: hidden bricks keep their slot but lose their content. */
export function publicBrick(b: BrickView): BrickView {
  if (!b.hidden) return b;
  return { ...b, name: '', ticker: '', image: null, creator: '' };
}

/**
 * In-memory index of every placed brick, in placement order (index + 1 = brick number).
 * Postgres is the source of truth for real bricks; SIM bricks live only in memory.
 * The pyramid only grows: bricks are appended, never removed (hidden ones keep their slot).
 */
export function createPyramid({ env, store, broadcast = () => {}, markets, sim = null, log = () => {} }: PyramidDeps) {
  let bricks: BrickView[] = [];
  const byMint = new Map<string, BrickView>();
  let simWorld = sim;

  const index = () => {
    byMint.clear();
    bricks.forEach((b, i) => {
      b.n = i + 1;
      byMint.set(b.mint, b);
    });
  };

  /** bricks appended while a load() query is in flight; merged back so a reload never drops one */
  let appendedDuringLoad: BrickView[] | null = null;

  async function load() {
    appendedDuringLoad = [];
    let real: BrickView[];
    try {
      real = (await store.listPlaced({ includeSimulated: env.DRY_RUN })).map((l) => ({ ...brickFromLaunch(l), n: 0 }));
    } catch (e) {
      appendedDuringLoad = null;
      throw e;
    }
    const synthetic = env.SIM_MODE && simWorld ? simWorld.bricks().map((b) => ({ ...b, n: 0 })) : [];
    const next = [...real, ...synthetic];
    const seen = new Set(next.map((b) => b.mint));
    for (const b of appendedDuringLoad) if (!seen.has(b.mint) && (!b.sim || env.SIM_MODE) && (!b.dryRun || env.DRY_RUN)) next.push({ ...b, n: 0 });
    appendedDuringLoad = null;
    bricks = next.sort((a, b) => a.placedAt.localeCompare(b.placedAt));
    index();
    log(`[pyramid] ${bricks.length} bricks (${real.length} launched, ${synthetic.length} sim)`);
    broadcast('reload', { count: bricks.length });
  }

  function append(b: Omit<BrickView, 'n'>): BrickView {
    const existing = byMint.get(b.mint);
    if (existing) return existing;
    const brick: BrickView = { ...b, n: bricks.length + 1 };
    bricks.push(brick);
    appendedDuringLoad?.push(brick);
    byMint.set(brick.mint, brick);
    broadcast('brick', publicBrick(brick));
    return brick;
  }

  /** a launch landed — it becomes the next brick */
  function placeLaunch(l: LaunchRecord) {
    if (l.simulated && !env.DRY_RUN) return null;
    const b = append(brickFromLaunch(l));
    log(`[pyramid] brick #${b.n} placed · $${b.ticker}`);
    return b;
  }

  function applyTicks(ticks: MarketTick[]) {
    const changed: MarketTick[] = [];
    for (const t of ticks) {
      const b = byMint.get(t.mint);
      if (!b) continue;
      if (b.mcap === t.mcap && b.ch24 === t.ch24 && b.belowSince === t.belowSince) continue;
      b.mcap = t.mcap;
      b.ch24 = t.ch24;
      b.belowSince = t.belowSince;
      changed.push(t);
    }
    if (changed.length) broadcast('market', changed);
    return changed;
  }

  /** poll DexScreener for every real on-chain brick; persist mcap + dead clock */
  async function pollMarkets(now = new Date()) {
    if (!markets) return 0;
    const live = bricks.filter((b) => !b.sim && !b.dryRun);
    if (!live.length) return 0;
    const data = await markets(live.map((b) => b.mint));
    // getMarkets never throws; an all-empty answer for many coins means DexScreener is down, not that they all died
    if (live.length > 3 && ![...data.values()].some((m) => m.marketCapUsd != null)) return 0;
    const nowIso = now.toISOString();
    const ticks: MarketTick[] = live.map((b) => {
      const m = data.get(b.mint);
      const mcap = m?.marketCapUsd ?? null;
      return { mint: b.mint, mcap: mcap ?? b.mcap, ch24: m?.priceChange24h ?? b.ch24, belowSince: nextBelowSince(b.belowSince, mcap, env.DEAD_MCAP_USD, nowIso) };
    });
    const changed = applyTicks(ticks);
    if (changed.length)
      await store.updateMarket(changed.map((t) => ({ mint: t.mint, marketCapUsd: t.mcap, change24h: t.ch24, belowSince: t.belowSince })));
    return changed.length;
  }

  async function setHidden(mint: string, hidden: boolean) {
    const b = byMint.get(mint);
    if (!b) return null;
    if (!b.sim) await store.setHidden(mint, hidden);
    else simWorld?.setHidden(mint, hidden);
    b.hidden = hidden;
    broadcast('brick:update', publicBrick(b));
    return b;
  }

  return {
    load,
    placeLaunch,
    append,
    applyTicks,
    pollMarkets,
    setHidden,
    setSim(w: SimWorld | null) {
      simWorld = w;
    },
    all: () => bricks,
    count: () => bricks.length,
    get: (mint: string) => byMint.get(mint) ?? null,
    byNumber: (n: number) => bricks[n - 1] ?? null,
    slot: (n: number) => slotOf(n),
  };
}

export type Pyramid = ReturnType<typeof createPyramid>;
