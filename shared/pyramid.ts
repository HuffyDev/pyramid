/**
 * Pyramid geometry + brick state. Shared by server (positions, cracks) and client (renderer).
 *
 * Brick #1 is the apex (row 0). Row r holds r + 1 bricks, so every new launch lands in
 * the bottom row and rows widen downward. Within a row, bricks fill from the center
 * outward so a half-built bottom row always looks balanced under the row above.
 * The $PYRAMID token is the capstone above the apex and is not a numbered brick.
 */

export const BRICK_W = 120;
export const BRICK_H = 54;
export const GAP = 6;
export const PITCH_X = BRICK_W + GAP;
export const PITCH_Y = BRICK_H + GAP;

/** row index (0 = apex) for 1-based brick number n */
export function rowOf(n: number): number {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`brick number must be a positive integer (got ${n})`);
  // largest r with r(r+1)/2 < n
  let r = Math.floor((Math.sqrt(8 * n + 1) - 1) / 2);
  while ((r * (r + 1)) / 2 >= n) r--;
  while (((r + 1) * (r + 2)) / 2 < n) r++;
  return r;
}

/** 1-based brick number of the first brick in row r */
export const rowStart = (r: number) => (r * (r + 1)) / 2 + 1;

/** Order (0-based) in which the r+1 slots of a row are filled: center first, then alternating out. */
export function fillOrder(slots: number): number[] {
  const out: number[] = [];
  const mid = (slots - 1) / 2;
  const left = Math.floor(mid);
  const right = Math.ceil(mid);
  if (left === right) out.push(left);
  else out.push(right, left);
  for (let d = 1; out.length < slots; d++) {
    if (right + d < slots) out.push(right + d);
    if (left - d >= 0) out.push(left - d);
  }
  return out;
}

export interface Slot {
  n: number;
  row: number;
  /** 0-based column, left → right */
  col: number;
  /** world-space center of the brick (apex at x = 0, y = 0; y grows downward) */
  x: number;
  y: number;
}

const orderCache = new Map<number, number[]>();
function orderFor(slots: number) {
  let o = orderCache.get(slots);
  if (!o) {
    o = fillOrder(slots);
    if (orderCache.size < 4096) orderCache.set(slots, o);
  }
  return o;
}

export function slotOf(n: number): Slot {
  const row = rowOf(n);
  const k = n - rowStart(row); // k-th brick placed in this row
  const col = orderFor(row + 1)[k];
  return { n, row, col, x: (col - row / 2) * PITCH_X, y: row * PITCH_Y };
}

/** Inverse of slotOf for hit-testing: world point → brick number among `count` placed bricks, or null. */
export function hitTest(wx: number, wy: number, count: number): number | null {
  if (count < 1) return null;
  const row = Math.round(wy / PITCH_Y);
  if (row < 0) return null;
  const local = wy - row * PITCH_Y;
  if (Math.abs(local) > BRICK_H / 2) return null; // in the mortar gap
  const colF = wx / PITCH_X + row / 2;
  const col = Math.round(colF);
  if (col < 0 || col > row) return null;
  if (Math.abs((colF - col) * PITCH_X) > BRICK_W / 2) return null;
  const k = orderFor(row + 1).indexOf(col);
  const n = rowStart(row) + k;
  return n <= count ? n : null;
}

/** World-space bounding box of a pyramid with `count` bricks (including the capstone). */
export function bounds(count: number) {
  const rows = count < 1 ? 1 : rowOf(count) + 1;
  const half = ((rows - 1) / 2) * PITCH_X + BRICK_W / 2;
  return { minX: -half, maxX: half, minY: -CAP_H - BRICK_H / 2 - GAP, maxY: (rows - 1) * PITCH_Y + BRICK_H / 2, rows };
}

export const CAP_W = BRICK_W * 1.05;
export const CAP_H = BRICK_H * 1.5;
/** capstone sits on the apex */
export const capstone = () => ({ x: 0, y: -BRICK_H / 2 - GAP / 2 - CAP_H / 2, w: CAP_W, h: CAP_H });

// ── brick state ──────────────────────────────────────────────────────────────

export const DEAD_AFTER_MS = 24 * 3600_000;
export const HOUR = 3600_000;

/**
 * 0 = intact. A brick cracks once its mcap has stayed below the dead threshold for 24h,
 * then deepens at 3 days and 7 days. Recovering above the threshold heals it.
 */
export function crackLevel(belowSince: string | number | null | undefined, now = Date.now()): 0 | 1 | 2 | 3 {
  if (belowSince == null) return 0;
  const t = typeof belowSince === 'number' ? belowSince : Date.parse(belowSince);
  if (!Number.isFinite(t)) return 0;
  const dt = now - t;
  if (dt >= 7 * 24 * HOUR) return 3;
  if (dt >= 3 * 24 * HOUR) return 2;
  if (dt >= DEAD_AFTER_MS) return 1;
  return 0;
}

/**
 * Next `belowSince` given a fresh mcap reading. Unknown mcap counts as below
 * (a coin nobody trades has no pairs), but never resets an existing clock.
 */
export function nextBelowSince(prev: string | null, mcap: number | null, threshold: number, nowIso: string): string | null {
  const below = mcap == null || mcap < threshold;
  if (!below) return null;
  return prev ?? nowIso;
}

/** 0..1 glow from market cap on a log scale: $5k → ~0, $10M+ → 1. */
export function glowOf(mcap: number | null | undefined): number {
  if (mcap == null || !Number.isFinite(mcap) || mcap <= 5_000) return 0;
  return Math.min(1, Math.log10(mcap / 5_000) / Math.log10(2_000));
}

export interface BrickView {
  n: number;
  mint: string;
  name: string;
  ticker: string;
  image: string | null;
  creator: string;
  placedAt: string;
  mcap: number | null;
  ch24: number | null;
  /** ISO time the mcap first dropped below the dead threshold (null = alive) */
  belowSince: string | null;
  hidden: boolean;
  /** synthetic (SIM mode) or dry-run brick */
  sim: boolean;
  dryRun: boolean;
}

export interface MarketTick {
  mint: string;
  mcap: number | null;
  ch24: number | null;
  belowSince: string | null;
}
