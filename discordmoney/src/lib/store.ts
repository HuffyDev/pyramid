import { useSyncExternalStore } from 'react';
import { EMPTY_SNAPSHOT } from './backend';
import { loadSession } from './discord';
import type { DiscordSession, Snapshot } from './types';

export interface AppState {
  data: Snapshot;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  loadedAt: number | null;
  wallet: { address: string; provider: 'phantom' | 'solflare' | 'backpack' } | null;
  discord: DiscordSession | null;
}

let state: AppState = {
  data: EMPTY_SNAPSHOT,
  status: 'loading',
  error: null,
  loadedAt: null,
  wallet: null,
  discord: typeof window !== 'undefined' ? loadSession() : null,
};

const listeners = new Set<() => void>();
export const getState = () => state;
export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}
export function setData(fn: (d: Snapshot) => Snapshot) {
  setState((s) => ({ data: fn(s.data) }));
}
export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useApp(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}
/** Ticking "now" for countdowns (re-renders once a minute). */
export function useNow(intervalMs = 30_000) {
  return useSyncExternalStore(
    (cb) => {
      const t = window.setInterval(cb, intervalMs);
      return () => window.clearInterval(t);
    },
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
  );
}
