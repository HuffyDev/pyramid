import * as api from './backend';
import { saveSession, startLogin } from './discord';
import { getState, setData, setState } from './store';
import type { Launch, Offer, Result, TreasuryClaim } from './types';
import * as wallet from './wallet';

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const auth = () => ({ wallet: getState().wallet?.address, discordToken: getState().discord?.accessToken });

/* --------------------------------- Data ----------------------------------- */

export async function refresh(): Promise<Result<null>> {
  setState((s) => ({ status: s.loadedAt ? s.status : 'loading', error: null }));
  try {
    const data = await api.fetchSnapshot();
    setState({ data, status: 'ready', loadedAt: Date.now() });
    return ok(null);
  } catch (e) {
    setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    return fail(e);
  }
}

const upsertLaunch = (l: Launch) => setData((d) => ({ ...d, launches: [l, ...d.launches.filter((x) => x.id !== l.id)] }));
const upsertOffer = (o: Offer) => setData((d) => ({ ...d, offers: [o, ...d.offers.filter((x) => x.id !== o.id)] }));
const upsertClaim = (c: TreasuryClaim) => setData((d) => ({ ...d, claims: { ...d.claims, [c.serverId]: c } }));

/* -------------------------------- Session --------------------------------- */

export async function connectWallet(id: wallet.WalletOption['id'], silent = false): Promise<Result<string>> {
  try {
    const { address, provider } = await wallet.connect(id, silent);
    setState({ wallet: { address, provider: id } });
    provider.on?.('disconnect', () => setState({ wallet: null }));
    provider.on?.('accountChanged', (k) => setState({ wallet: k ? { address: k.toString(), provider: id } : null }));
    return ok(address);
  } catch (e) {
    return fail(e);
  }
}

export async function disconnectWallet() {
  const w = getState().wallet;
  setState({ wallet: null });
  await wallet.disconnect(w?.provider ?? null);
}

export function loginDiscord(returnTo?: string): Result<null> {
  try {
    startLogin(returnTo);
    return ok(null);
  } catch (e) {
    return fail(e);
  }
}

export function logoutDiscord() {
  saveSession(null);
  setState({ discord: null });
}

/* ------------------------------- Mutations -------------------------------- */

export async function createLaunch(input: api.LaunchInput): Promise<Result<Launch>> {
  if (!getState().wallet) return fail(new Error('Connect your wallet first.'));
  try {
    const l = await api.createLaunch(input, auth());
    upsertLaunch(l);
    return ok(l);
  } catch (e) {
    return fail(e);
  }
}

export async function requestClaimCode(serverId: string): Promise<Result<{ code: string; expiresAt?: number }>> {
  try {
    return ok(await api.requestClaimCode(serverId, auth()));
  } catch (e) {
    return fail(e);
  }
}

export async function verifyClaim(p: { serverId: string; wallet: string; code: string }): Promise<Result<TreasuryClaim>> {
  try {
    const c = await api.verifyClaim(p, auth());
    upsertClaim(c);
    return ok(c);
  } catch (e) {
    return fail(e);
  }
}

export async function updateTreasuryWallet(serverId: string, w: string): Promise<Result<TreasuryClaim>> {
  try {
    const c = await api.updateTreasuryWallet(serverId, w, auth());
    upsertClaim(c);
    return ok(c);
  } catch (e) {
    return fail(e);
  }
}

export async function createOffer(input: api.OfferInput): Promise<Result<Offer>> {
  if (!getState().wallet) return fail(new Error('Connect your wallet first.'));
  try {
    const o = await api.createOffer(input, auth());
    upsertOffer(o);
    return ok(o);
  } catch (e) {
    return fail(e);
  }
}

export async function acceptOffer(id: string): Promise<Result<Offer>> {
  try {
    const o = await api.acceptOffer(id, auth());
    upsertOffer(o);
    return ok(o);
  } catch (e) {
    return fail(e);
  }
}

export async function cancelOffer(id: string): Promise<Result<Offer>> {
  try {
    const o = await api.cancelOffer(id, auth());
    upsertOffer(o);
    return ok(o);
  } catch (e) {
    return fail(e);
  }
}
