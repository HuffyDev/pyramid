/** All money is integer lamports (1 SOL = 1_000_000_000 lamports). */
export type Lamports = number;

export interface User {
  id: string;
  username: string;
  displayName: string;
  discordId: string;
  wallet: string;
  color: string;
  /** Servers where this fictional user holds the (simulated) Manage Server permission. */
  manages: string[];
}

export interface Server {
  id: string;
  name: string;
  discordId: string;
  color: string;
  members: number;
  channels: string[];
  announcementChannel: string;
}

export interface TreasuryClaim {
  serverId: string;
  adminId: string;
  wallet: string;
  code: string;
  claimedAt: number;
  updatedAt?: number;
  history: { at: number; wallet: string }[];
  sample: boolean;
}

export type Recipient = { kind: 'member'; userId: string } | { kind: 'server'; serverId: string };

export type CoinImage = { kind: 'art'; seed: number } | { kind: 'upload'; dataUrl: string };

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
  image: CoinImage;
  createdAt: number;
  devUserId: string;
  devWallet: string;
  recipient: Recipient;
  payoutMessage: string;
  devBuy: Lamports;
  socials: Socials;
  /** Sample market cap in USD, oldest → newest. */
  mcap: number[];
  failure: { at: number; reason: string } | null;
  sample: boolean;
}

export interface FeeEvent {
  id: string;
  launchId: string;
  at: number;
  gross: Lamports;
  platform: Lamports;
  recipient: Lamports;
  sample: boolean;
}

export interface Payout {
  id: string;
  launchId: string;
  at: number;
  amount: Lamports;
  status: 'completed' | 'failed';
  to: string;
  receipt: string;
  reason?: string;
  sample: boolean;
}

export interface Buyback {
  id: string;
  at: number;
  solSpent: Lamports;
  dcmBought: number;
  dcmBurned: number;
  rate: number;
  receipt: string;
  sample: boolean;
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
  sample: boolean;
}

export type OfferStatus =
  | 'awaiting'
  | 'accepted'
  | 'posted'
  | 'retention'
  | 'completed'
  | 'refunded'
  | 'cancelled';

export interface OfferMessage {
  id: string;
  text: string;
  submittedAt: number;
  removedAt?: number;
  qualifies: boolean;
  reason?: string;
}

export type Settlement =
  | { kind: 'paid'; at: number; recipientAmount: Lamports; platformAmount: Lamports; to: string; receipt: string }
  | { kind: 'refunded'; at: number; amount: Lamports; reason: string; receipt: string }
  | { kind: 'cancelled'; at: number; amount: Lamports; receipt: string };

export interface Offer {
  id: string;
  createdAt: number;
  sponsorId: string;
  sponsorWallet: string;
  serverId: string;
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
  sample: boolean;
}

export interface Session {
  walletUserId: string | null;
  discordUserId: string | null;
}

export interface DemoState {
  version: number;
  seededAt: number;
  /** Centralised simulated clock (ms). Only moves when the demo clock is advanced. */
  now: number;
  refreshedAt: number;
  claims: Record<string, TreasuryClaim>;
  launches: Launch[];
  fees: FeeEvent[];
  payouts: Payout[];
  buybacks: Buyback[];
  offers: Offer[];
  notices: Notice[];
  session: Session;
}

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };
