import { describe, expect, it } from 'vitest';
import {
  BRICK_W,
  PITCH_X,
  PITCH_Y,
  bounds,
  crackLevel,
  fillOrder,
  glowOf,
  hitTest,
  nextBelowSince,
  rowOf,
  rowStart,
  slotOf,
  HOUR,
} from '../shared/pyramid.js';
import { createPyramid } from '../server/services/pyramid.js';
import { memoryStore } from '../server/db/store.js';
import { createSimWorld } from '../server/services/sim.js';
import { testEnv } from './helpers.js';

describe('brick placement', () => {
  it('first launch is the apex, rows widen downward (row r holds r+1 bricks)', () => {
    expect(slotOf(1)).toMatchObject({ row: 0, col: 0, x: 0, y: 0 });
    expect([2, 3].map(rowOf)).toEqual([1, 1]);
    expect([4, 5, 6].map(rowOf)).toEqual([2, 2, 2]);
    expect(rowOf(7)).toBe(3);
    expect(rowStart(3)).toBe(7);
    expect(rowOf(1000)).toBe(44);
    expect(rowOf(990)).toBe(43); // 44*45/2 = 990 → last brick of row 43
  });

  it('new launches fill the bottom row from the center outward', () => {
    expect(fillOrder(1)).toEqual([0]);
    expect(fillOrder(2)).toEqual([1, 0]);
    expect(fillOrder(3)).toEqual([1, 2, 0]);
    expect(fillOrder(4)).toEqual([2, 1, 3, 0]);
    expect(fillOrder(5)).toEqual([2, 3, 1, 4, 0]);
    for (let s = 1; s < 60; s++) expect([...fillOrder(s)].sort((a, b) => a - b)).toEqual([...Array(s).keys()]);
    // brick #4 starts row 2 in the middle, directly under the apex
    expect(slotOf(4)).toMatchObject({ row: 2, col: 1, x: 0, y: 2 * PITCH_Y });
  });

  it('every slot is unique and rows are centered (brick bond)', () => {
    const seen = new Set<string>();
    for (let n = 1; n <= 2000; n++) {
      const s = slotOf(n);
      const k = `${s.row}:${s.col}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
      expect(s.col).toBeGreaterThanOrEqual(0);
      expect(s.col).toBeLessThanOrEqual(s.row);
    }
    // a full row is symmetric around x = 0 and offset half a brick from the row above
    const row3 = [7, 8, 9, 10].map((n) => slotOf(n).x).sort((a, b) => a - b);
    expect(row3).toEqual([-1.5 * PITCH_X, -0.5 * PITCH_X, 0.5 * PITCH_X, 1.5 * PITCH_X]);
  });

  it('hit-testing inverts placement and ignores mortar gaps / empty slots', () => {
    for (const n of [1, 2, 3, 5, 17, 100, 999]) {
      const s = slotOf(n);
      expect(hitTest(s.x + 10, s.y - 5, 1000)).toBe(n);
    }
    const s = slotOf(5);
    expect(hitTest(s.x + BRICK_W / 2 + 2, s.y, 1000)).toBe(null); // mortar
    expect(hitTest(0, -PITCH_Y, 1000)).toBe(null); // above apex (capstone region)
    expect(hitTest(slotOf(9).x, slotOf(9).y, 8)).toBe(null); // slot not laid yet
  });

  it('bounds cover every brick (1,000+ bricks)', () => {
    const b = bounds(1200);
    for (const n of [1, 1200, rowStart(b.rows - 1)]) {
      const s = slotOf(n);
      expect(s.x - BRICK_W / 2).toBeGreaterThanOrEqual(b.minX);
      expect(s.x + BRICK_W / 2).toBeLessThanOrEqual(b.maxX);
      expect(s.y).toBeLessThanOrEqual(b.maxY);
    }
  });
});

describe('brick state', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  const ago = (h: number) => new Date(now - h * HOUR).toISOString();

  it('cracks after 24h below threshold, deepens at 3d and 7d', () => {
    expect(crackLevel(null, now)).toBe(0);
    expect(crackLevel(ago(23), now)).toBe(0);
    expect(crackLevel(ago(25), now)).toBe(1);
    expect(crackLevel(ago(80), now)).toBe(2);
    expect(crackLevel(ago(24 * 8), now)).toBe(3);
  });

  it('dead clock starts below threshold, keeps running, resets on recovery', () => {
    const t = ago(0);
    expect(nextBelowSince(null, 1000, 6000, t)).toBe(t);
    expect(nextBelowSince(ago(30), 1000, 6000, t)).toBe(ago(30));
    expect(nextBelowSince(ago(30), null, 6000, t)).toBe(ago(30));
    expect(nextBelowSince(ago(30), 50_000, 6000, t)).toBe(null);
  });

  it('glow scales with mcap on a log scale', () => {
    expect(glowOf(null)).toBe(0);
    expect(glowOf(4000)).toBe(0);
    expect(glowOf(100_000)).toBeGreaterThan(glowOf(20_000));
    expect(glowOf(1e9)).toBe(1);
  });
});

describe('pyramid index', () => {
  const launch = (mint: string, placedAt: string, over = {}) => ({
    launchId: crypto.randomUUID(),
    mint,
    name: mint,
    ticker: mint.toUpperCase(),
    description: '',
    imageUri: null,
    metadataUri: 'https://x',
    website: null,
    twitter: null,
    telegram: null,
    creator: 'C',
    devBuySol: 0,
    signature: null,
    status: 'confirmed' as const,
    simulated: false,
    createdAt: placedAt,
    placedAt,
    hidden: false,
    marketCapUsd: null,
    change24h: null,
    belowSince: null,
    ...over,
  });

  it('numbers bricks in placement order and only ever grows', async () => {
    const events: [string, unknown][] = [];
    const p = createPyramid({ env: testEnv(), store: memoryStore(), broadcast: (c, x) => events.push([c, x]) });
    await p.load();
    const a = p.placeLaunch(launch('a', '2026-10-10T00:00:00Z'))!;
    const b = p.placeLaunch(launch('b', '2026-10-10T00:01:00Z'))!;
    expect([a.n, b.n]).toEqual([1, 2]);
    expect(p.placeLaunch(launch('a', '2026-10-10T00:02:00Z'))!.n).toBe(1); // idempotent
    expect(events.filter((e) => e[0] === 'brick')).toHaveLength(2);
  });

  it('dry-run bricks are dropped from the pyramid when DRY_RUN is off', async () => {
    const p = createPyramid({ env: testEnv({ DRY_RUN: 'false' }), store: memoryStore() });
    expect(p.placeLaunch(launch('d', '2026-10-10T00:00:00Z', { simulated: true, status: 'simulated' }))).toBe(null);
  });

  it('hidden bricks keep their slot but lose their content publicly', async () => {
    const events: [string, unknown][] = [];
    const store = memoryStore();
    const p = createPyramid({ env: testEnv(), store, broadcast: (c, x) => events.push([c, x]) });
    p.placeLaunch(launch('a', '2026-10-10T00:00:00Z'));
    p.placeLaunch(launch('b', '2026-10-10T00:01:00Z'));
    await p.setHidden('a', true);
    expect(p.count()).toBe(2);
    expect(p.get('b')!.n).toBe(2);
    const upd = events.find((e) => e[0] === 'brick:update')![1] as { name: string; hidden: boolean; n: number };
    expect(upd).toMatchObject({ n: 1, name: '', hidden: true });
  });

  it('market poll persists mcap and starts the dead clock; ignores a DexScreener outage', async () => {
    const store = memoryStore();
    const base = launch('m', '2026-10-01T00:00:00Z');
    await store.upsertBuilding(base);
    await store.transition(base.launchId, ['building'], 'confirmed', { placedAt: base.placedAt });
    let answer = new Map([['m', { marketCapUsd: 1200, priceUsd: 1, priceChange24h: -40 }]]);
    const p = createPyramid({ env: testEnv(), store, markets: async () => answer });
    await p.load();
    await p.pollMarkets(new Date('2026-10-10T00:00:00Z'));
    expect(p.get('m')).toMatchObject({ mcap: 1200, ch24: -40, belowSince: '2026-10-10T00:00:00.000Z' });
    expect((await store.getByMint('m'))!.belowSince).toBe('2026-10-10T00:00:00.000Z');
    answer = new Map([['m', { marketCapUsd: 90_000, priceUsd: 1, priceChange24h: 300 }]]);
    await p.pollMarkets(new Date('2026-10-11T06:00:00Z'));
    expect(p.get('m')!.belowSince).toBe(null);
  });

  it('a brick placed while a reload is in flight is not dropped', async () => {
    const base = memoryStore();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const store = { ...base, kind: 'memory' as const, listPlaced: async (o: { includeSimulated: boolean }) => (await gate, base.listPlaced(o)) };
    const p = createPyramid({ env: testEnv(), store });
    const loading = p.load();
    p.placeLaunch(launch('late', '2026-10-10T00:05:00Z')); // e.g. a confirm landing mid-reload
    release();
    await loading;
    expect(p.get('late')).toMatchObject({ n: 1 });
    expect(p.count()).toBe(1);
  });

  it('SIM mode merges synthetic bricks and keeps launching', async () => {
    const sim = createSimWorld({ seedCount: 50, threshold: 6000, seed: 1 });
    const p = createPyramid({ env: testEnv({ SIM_MODE: 'true' }), store: memoryStore(), sim });
    await p.load();
    expect(p.count()).toBe(50);
    expect(p.all().some((b) => crackLevel(b.belowSince) > 0)).toBe(true);
    const b = p.append(sim.launch());
    expect(b.n).toBe(51);
    expect(sim.step().length).toBeGreaterThan(0);
  });
});
