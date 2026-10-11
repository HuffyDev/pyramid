/**
 * Discord login (OAuth2, implicit grant — scopes: identify, guilds).
 * Set VITE_DISCORD_CLIENT_ID and add `<your site>/auth/discord` as a redirect URI
 * in the Discord Developer Portal → OAuth2.
 */
import type { DiscordSession, Guild } from './types';

export const DISCORD_CLIENT_ID = (import.meta.env.VITE_DISCORD_CLIENT_ID as string | undefined) ?? '';
export const discordConfigured = DISCORD_CLIENT_ID !== '';

const SESSION_KEY = 'discordmoney:discord';
const STATE_KEY = 'discordmoney:discord-state';
const RETURN_KEY = 'discordmoney:discord-return';
const MANAGE_GUILD = 0x20n;

export const redirectUri = () => `${window.location.origin}/auth/discord`;

export function startLogin(returnTo = window.location.pathname) {
  if (!discordConfigured) throw new Error('Discord login is not available yet.');
  const state = crypto.getRandomValues(new Uint32Array(4)).join('-');
  try {
    sessionStorage.setItem(STATE_KEY, state);
    sessionStorage.setItem(RETURN_KEY, returnTo);
  } catch {
    throw new Error('Your browser is blocking storage needed for login. Open the site in a normal tab.');
  }
  const q = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    response_type: 'token',
    redirect_uri: redirectUri(),
    scope: 'identify guilds',
    state,
  });
  window.location.assign(`https://discord.com/oauth2/authorize?${q}`);
}

interface ApiUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}
interface ApiGuild {
  id: string;
  name: string;
  icon?: string | null;
  owner?: boolean;
  permissions?: string;
}

/** Called on /auth/discord. Returns the path to go back to. */
export async function completeLogin(hash: string): Promise<{ session: DiscordSession; returnTo: string }> {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const err = p.get('error_description') || p.get('error');
  if (err) throw new Error(err);
  const token = p.get('access_token');
  const state = p.get('state');
  if (!token) throw new Error('Discord did not return a login token.');
  let expected: string | null = null;
  try {
    expected = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);
  } catch {
    /* storage blocked */
  }
  if (!state || state !== expected) throw new Error('Login state mismatch. Please try again.');
  const headers = { Authorization: `Bearer ${token}` };
  const [uRes, gRes] = await Promise.all([fetch('https://discord.com/api/users/@me', { headers }), fetch('https://discord.com/api/users/@me/guilds', { headers })]);
  if (!uRes.ok) throw new Error('Could not load your Discord profile.');
  const u = (await uRes.json()) as ApiUser;
  const gs = gRes.ok ? ((await gRes.json()) as ApiGuild[]) : [];
  const guilds: Guild[] = gs.map((g) => ({
    id: g.id,
    name: g.name,
    iconUrl: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64` : undefined,
    canManage: Boolean(g.owner) || (g.permissions ? (BigInt(g.permissions) & MANAGE_GUILD) === MANAGE_GUILD : false),
  }));
  const session: DiscordSession = {
    user: {
      id: u.id,
      username: u.username,
      displayName: u.global_name ?? u.username,
      avatarUrl: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : undefined,
    },
    guilds,
    accessToken: token,
    expiresAt: Date.now() + Number(p.get('expires_in') ?? 604800) * 1000,
  };
  saveSession(session);
  let returnTo = '/';
  try {
    returnTo = sessionStorage.getItem(RETURN_KEY) || '/';
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    /* storage blocked */
  }
  return { session, returnTo };
}

export function loadSession(): DiscordSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as DiscordSession;
    if (!s?.user?.id || !s.accessToken || s.expiresAt < Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function saveSession(s: DiscordSession | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
