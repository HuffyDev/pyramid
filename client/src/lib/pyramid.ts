import { useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { BrickView, MarketTick } from '../../../shared/pyramid';

/**
 * Live pyramid state shared by every page: initial snapshot over HTTP, then
 * Socket.IO pushes (new bricks, market ticks, hides, config changes).
 */
interface State {
  bricks: BrickView[];
  loaded: boolean;
  error: string | null;
  connected: boolean;
  /** bumps on config changes so the config provider can refetch */
  configRev: number;
}

let state: State = { bricks: [], loaded: false, error: null, connected: false, configRev: 0 };
const subs = new Set<() => void>();
const brickSubs = new Set<(b: BrickView) => void>();
let socket: Socket | null = null;
let started = false;

const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
};

async function load() {
  try {
    const r = await fetch('/api/pyramid', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as { bricks: BrickView[] };
    set({ bricks: j.bricks, loaded: true, error: null });
  } catch (e) {
    set({ loaded: true, error: (e as Error).message });
  }
}

/** add/replace one brick (socket event, or our own launch response) */
export function upsertBrick(b: BrickView, opts: { announce?: boolean } = {}) {
  const cur = state.bricks;
  if (b.n <= cur.length) {
    if (cur[b.n - 1]?.mint !== b.mint && b.n === cur.length + 1) return;
    const next = cur.slice();
    next[b.n - 1] = { ...cur[b.n - 1], ...b };
    set({ bricks: next });
    return;
  }
  if (b.n !== cur.length + 1) {
    // we missed something: resync
    void load();
    return;
  }
  set({ bricks: [...cur, b] });
  if (opts.announce !== false) brickSubs.forEach((f) => f(b));
}

export function startPyramid() {
  if (started) return;
  started = true;
  void load();
  socket = io({ transports: ['websocket', 'polling'] });
  socket.on('connect', () => {
    set({ connected: true });
    if (state.loaded) void load(); // catch up after a reconnect
  });
  socket.on('disconnect', () => set({ connected: false }));
  socket.on('brick', (b: BrickView) => upsertBrick(b));
  socket.on('brick:update', (b: BrickView) => upsertBrick(b, { announce: false }));
  socket.on('reload', () => void load());
  socket.on('config', () => set({ configRev: state.configRev + 1 }));
  socket.on('market', (ticks: MarketTick[]) => {
    const idx = new Map(state.bricks.map((b, i) => [b.mint, i]));
    let next: BrickView[] | null = null;
    for (const t of ticks) {
      const i = idx.get(t.mint);
      if (i === undefined) continue;
      next ??= state.bricks.slice();
      next[i] = { ...next[i], mcap: t.mcap, ch24: t.ch24, belowSince: t.belowSince };
    }
    if (next) set({ bricks: next });
  });
}

export function usePyramid() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
  );
}

export const getPyramid = () => state;

/** fires for every newly placed brick (not for the initial snapshot) */
export function onNewBrick(f: (b: BrickView) => void) {
  brickSubs.add(f);
  return () => {
    brickSubs.delete(f);
  };
}

export function stats(bricks: BrickView[], now = new Date()) {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const since = midnight.toISOString();
  let total = 0;
  let today = 0;
  for (const b of bricks) {
    if (b.mcap && !b.hidden) total += b.mcap;
    if (b.placedAt >= since) today++;
  }
  return { count: bricks.length, total, today };
}
