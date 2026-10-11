/**
 * Backend adapter — the single place the site talks to your server.
 *
 * Set VITE_API_BASE_URL (e.g. https://api.yourdomain.com) and implement the
 * endpoints below on your server, or replace any function body with your own
 * code (pump.fun / PumpPortal calls, your database, your Discord bot, etc.).
 * See API.md for request/response shapes.
 *
 * Until VITE_API_BASE_URL is set, reads return empty data and writes throw
 * NotConfiguredError, which the UI shows as "not available yet".
 */
import type { Launch, Lamports, Offer, Recipient, Snapshot, Socials, TreasuryClaim } from './types';

export const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/+$/, '');
export const isConfigured = API_BASE !== '';

export class NotConfiguredError extends Error {
  constructor(feature: string) {
    super(`${feature} is not available yet.`);
    this.name = 'NotConfiguredError';
  }
}

export const EMPTY_SNAPSHOT: Snapshot = { launches: [], fees: [], payouts: [], buybacks: [], offers: [], claims: {}, notices: [] };

interface Auth {
  wallet?: string | null;
  discordToken?: string | null;
}

async function call<T>(feature: string, path: string, init: RequestInit = {}, auth: Auth = {}): Promise<T> {
  if (!isConfigured) throw new NotConfiguredError(feature);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.body) headers['Content-Type'] = 'application/json';
  if (auth.wallet) headers['X-Wallet'] = auth.wallet;
  if (auth.discordToken) headers.Authorization = `Bearer ${auth.discordToken}`;
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body && (body.error || body.message)) || `${feature} failed (${res.status}).`);
  return body as T;
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

/* --------------------------------- Reads ---------------------------------- */

/** GET /snapshot — everything the site renders. */
export async function fetchSnapshot(): Promise<Snapshot> {
  if (!isConfigured) return EMPTY_SNAPSHOT;
  const s = await call<Partial<Snapshot>>('Loading data', '/snapshot');
  return { ...EMPTY_SNAPSHOT, ...s, claims: s.claims ?? {} };
}

/* -------------------------------- Launches -------------------------------- */

export interface LaunchInput {
  name: string;
  ticker: string;
  description: string;
  /** Square PNG/WebP data URL of the coin image. */
  image: string;
  recipient: Recipient;
  payoutMessage: string;
  devBuy: Lamports;
  socials: Socials;
}

/**
 * POST /launches — create the coin.
 * If your server needs the creator to sign a transaction, return
 * `{ transaction: base64 }` and complete it in createLaunchWithWallet().
 */
export function createLaunch(input: LaunchInput, auth: Auth): Promise<Launch> {
  return call<Launch>('Launching', '/launches', post({ ...input, devWallet: auth.wallet }), auth);
}

/* --------------------------------- Claims --------------------------------- */

/** POST /claims/code — issue a one-time code for the bot challenge. */
export function requestClaimCode(serverId: string, auth: Auth): Promise<{ code: string; expiresAt?: number }> {
  return call('Server claims', '/claims/code', post({ serverId }), auth);
}

/** POST /claims/verify — server verifies Manage Server via Discord and stores the treasury wallet. */
export function verifyClaim(p: { serverId: string; wallet: string; code: string }, auth: Auth): Promise<TreasuryClaim> {
  return call('Server claims', '/claims/verify', post(p), auth);
}

/** POST /claims/:serverId/wallet — change the treasury wallet (admin only). */
export function updateTreasuryWallet(serverId: string, wallet: string, auth: Auth): Promise<TreasuryClaim> {
  return call('Treasury settings', `/claims/${encodeURIComponent(serverId)}/wallet`, post({ wallet }), auth);
}

/* ---------------------------- Sponsored posts ----------------------------- */

export interface OfferInput {
  serverId: string;
  channel: string;
  price: Lamports;
  postWithinDays: number;
  required: string;
  notes: string;
}

/** POST /offers — create an offer and fund escrow. */
export function createOffer(input: OfferInput, auth: Auth): Promise<Offer> {
  return call('Sponsored posts', '/offers', post({ ...input, sponsorWallet: auth.wallet }), auth);
}

/** POST /offers/:id/accept — server admin accepts. */
export function acceptOffer(id: string, auth: Auth): Promise<Offer> {
  return call('Sponsored posts', `/offers/${encodeURIComponent(id)}/accept`, post({}), auth);
}

/** POST /offers/:id/cancel — sponsor cancels before acceptance; escrow returned. */
export function cancelOffer(id: string, auth: Auth): Promise<Offer> {
  return call('Sponsored posts', `/offers/${encodeURIComponent(id)}/cancel`, post({}), auth);
}
