/** All money is integer lamports (1 SOL = 1_000_000_000 lamports). */
export type Lamports = number;

export interface Person {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface Guild {
  id: string;
  name: string;
  iconUrl?: string;
  /** User is owner or holds the Manage Server permission. */
  canManage: boolean;
}

export interface DiscordSession {
  user: Person;
  guilds: Guild[];
  accessToken: string;
  expiresAt: number;
}

export interface TreasuryClaim {
  serverId: string;
  serverName: string;
  iconUrl?: string;
  adminId: string;
  adminUsername: string;
  wallet: string;
  claimedAt: number;
  updatedAt?: number;
  history: { at: number; wallet: string }[];
}

export type Recipient =
  | { kind: 'member'; username: string; discordId?: string; wallet: string }
  | { kind: 'server'; serverId: string; serverName: string; iconUrl?: string; channel?: string };

export interface Socials {
  x?: string;
  discord?: string;
  website?: string;
}

export interface Launch {
  id: string;
  mint: string;
  name: string;
  ticker: string;
  description: string;
  imageUrl: string;
  createdAt: number;
  devWallet: string;
  devUsername?: string;
  recipient: Recipient;
  payoutMessage: string;
  devBuy: Lamports;
  socials: Socials;
  /** Market cap in USD, oldest → newest. */
  mcap: number[];
  failure?: { at: number; reason: string } | null;
  signature?: string;
}

export interface FeeEvent {
  id: string;
  launchId: string;
  at: number;
  gross: Lamports;
  platform: Lamports;
  recipient: Lamports;
  signature?: string;
}

export interface Payout {
  id: string;
  launchId: string;
  at: number;
  amount: Lamports;
  status: 'completed' | 'failed';
  to: string;
  signature?: string;
  reason?: string;
}

export interface Buyback {
  id: string;
  at: number;
  solSpent: Lamports;
  dcmBought: number;
  dcmBurned: number;
  signature?: string;
}

export type NoticeKind = 'launch' | 'fees' | 'payout' | 'failure' | 'claim' | 'offer' | 'buyback';

export interface Notice {
  id: string;
  at: number;
  kind: NoticeKind;
  title: string;
  body: string;
  launchId?: string;
  serverId?: string;
  offerId?: string;
}

export type OfferStatus = 'awaiting' | 'accepted' | 'posted' | 'retention' | 'completed' | 'refunded' | 'cancelled';

export interface OfferMessage {
  id: string;
  text: string;
  submittedAt: number;
  removedAt?: number;
  qualifies: boolean;
  reason?: string;
  url?: string;
}

export type Settlement =
  | { kind: 'paid'; at: number; recipientAmount: Lamports; platformAmount: Lamports; to: string; signature?: string }
  | { kind: 'refunded'; at: number; amount: Lamports; reason: string; signature?: string }
  | { kind: 'cancelled'; at: number; amount: Lamports; signature?: string };

export interface Offer {
  id: string;
  createdAt: number;
  sponsorWallet: string;
  serverId: string;
  serverName: string;
  channel: string;
  price: Lamports;
  postWithinDays: number;
  required: string;
  notes: string;
  acceptedAt?: number;
  deadline?: number;
  messages: OfferMessage[];
  settlement?: Settlement;
  log: { at: number; text: string }[];
}

/** Everything the site renders, as returned by the backend. */
export interface Snapshot {
  launches: Launch[];
  fees: FeeEvent[];
  payouts: Payout[];
  buybacks: Buyback[];
  offers: Offer[];
  claims: Record<string, TreasuryClaim>;
  notices: Notice[];
}

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };
