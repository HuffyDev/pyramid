import type { Lamports } from './types';

export const LAMPORTS_PER_SOL = 1_000_000_000;

/** Parse a user-entered SOL amount into integer lamports without float drift. */
export function solToLamports(input: string): Lamports | null {
  const s = input.trim();
  if (s === '') return 0;
  if (!/^\d*(\.\d{0,9})?$/.test(s) || s === '.') return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole || '0') * LAMPORTS_PER_SOL + Number(frac.padEnd(9, '0'));
}

export function sol(lamports: Lamports, maxDigits = 4): string {
  const v = lamports / LAMPORTS_PER_SOL;
  const digits = v !== 0 && Math.abs(v) < 0.001 ? 6 : maxDigits;
  return v.toLocaleString('en-US', { minimumFractionDigits: v === 0 ? 0 : 2, maximumFractionDigits: digits });
}

export const solLabel = (lamports: Lamports, maxDigits = 4) => `${sol(lamports, maxDigits)} SOL`;

export function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export const int = (n: number) => Math.round(n).toLocaleString('en-US');

export function compact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return int(n);
}

export function shortAddr(a: string, head = 4, tail = 4): string {
  return a.length <= head + tail + 1 ? a : `${a.slice(0, head)}…${a.slice(-tail)}`;
}

export function dateTime(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function date(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function time(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Relative to the simulated demo clock, not wall time. */
export function ago(ms: number, now: number): string {
  const d = Math.max(0, now - ms);
  const m = Math.floor(d / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export function duration(ms: number): string {
  const neg = ms < 0;
  const total = Math.abs(ms);
  const d = Math.floor(total / 86_400_000);
  const h = Math.floor((total % 86_400_000) / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const parts = d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  return neg ? `-${parts}` : parts;
}

export const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
