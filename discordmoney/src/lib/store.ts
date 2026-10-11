import { useSyncExternalStore } from 'react';
import { STATE_VERSION, createSeed } from './seed';
import type { DemoState } from './types';

export const STORAGE_KEY = 'discordmoney:demo';

type Listener = () => void;
const listeners = new Set<Listener>();

export let loadIssue: 'corrupt' | 'outdated' | null = null;
export let saveIssue = false;

function isValid(x: unknown): x is DemoState {
  if (!x || typeof x !== 'object') return false;
  const s = x as Partial<DemoState>;
  return (
    s.version === STATE_VERSION &&
    typeof s.now === 'number' &&
    Array.isArray(s.launches) &&
    Array.isArray(s.fees) &&
    Array.isArray(s.payouts) &&
    Array.isArray(s.buybacks) &&
    Array.isArray(s.offers) &&
    Array.isArray(s.notices) &&
    !!s.claims &&
    typeof s.claims === 'object' &&
    !!s.session &&
    s.launches.every((l) => l && typeof l.id === 'string' && Array.isArray(l.mcap)) &&
    s.fees.every((f) => f && Number.isInteger(f.gross) && Number.isInteger(f.platform) && Number.isInteger(f.recipient))
  );
}

function load(): DemoState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return createSeed();
  }
  if (!raw) return createSeed();
  try {
    const parsed = JSON.parse(raw) as { version?: number };
    if (isValid(parsed)) return parsed;
    loadIssue = typeof parsed?.version === 'number' && parsed.version !== STATE_VERSION ? 'outdated' : 'corrupt';
  } catch {
    loadIssue = 'corrupt';
  }
  return createSeed();
}

let state: DemoState = load();
persist();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    saveIssue = false;
  } catch {
    saveIssue = true;
  }
}

export const getState = () => state;

export function setState(next: DemoState) {
  state = next;
  persist();
  listeners.forEach((l) => l());
}

export function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function resetDemo() {
  setState(createSeed());
}

/** Re-read storage (e.g. another tab changed it). Never fabricates activity. */
export function reloadFromStorage() {
  const fresh = load();
  setState({ ...fresh, refreshedAt: Date.now() });
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      const parsed = JSON.parse(e.newValue);
      if (isValid(parsed)) {
        state = parsed;
        listeners.forEach((l) => l());
      }
    } catch {
      /* ignore foreign writes */
    }
  });
}

export function useDemo(): DemoState {
  return useSyncExternalStore(subscribe, getState, getState);
}
