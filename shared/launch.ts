import { z } from 'zod';

export const NAME_MAX = 32;
export const TICKER_MAX = 10;
export const DESC_MAX = 500;
export const DEV_BUY_MAX_SOL = 50;

export const PRIORITY_PRESETS = {
  low: 0.0001,
  med: 0.0005,
  high: 0.0015,
} as const;
export type PriorityPreset = keyof typeof PRIORITY_PRESETS | 'custom';

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024;

const optionalUrl = (hosts?: string[], label = 'link') =>
  z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine(
      (v) => {
        if (!v) return true;
        try {
          const u = new URL(v);
          if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
          if (!hosts) return true;
          const h = u.hostname.replace(/^www\./, '');
          return hosts.includes(h);
        } catch {
          return false;
        }
      },
      { message: hosts ? `must be a ${label} URL (${hosts.join(' / ')})` : 'must be a valid URL' },
    );

export const tickerSchema = z
  .string()
  .trim()
  .min(1, 'ticker required')
  .max(TICKER_MAX, `max ${TICKER_MAX} characters`)
  .regex(/^[A-Za-z0-9]+$/, 'letters and numbers only')
  .transform((s) => s.toUpperCase());

export const launchFieldsSchema = z.object({
  name: z.string().trim().min(1, 'name required').max(NAME_MAX, `max ${NAME_MAX} characters`),
  ticker: tickerSchema,
  description: z.string().trim().max(DESC_MAX, `max ${DESC_MAX} characters`).default(''),
  website: optionalUrl(),
  twitter: optionalUrl(['x.com', 'twitter.com'], 'X'),
  telegram: optionalUrl(['t.me', 'telegram.me'], 'Telegram'),
});

export const tradeParamsSchema = z.object({
  devBuySol: z.number().min(0).max(DEV_BUY_MAX_SOL, `max ${DEV_BUY_MAX_SOL} SOL`),
  slippagePct: z.number().min(0.5, 'min 0.5%').max(50, 'max 50%'),
  priorityFeeSol: z.number().min(0).max(0.05, 'max 0.05 SOL'),
});

const base58 = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'invalid address');

export const buildRequestSchema = z.object({
  launchId: z.string().uuid(),
  creator: base58,
  mint: base58,
  metadataUri: z.string().url(),
  imageUri: z.string().url().optional(),
  fields: launchFieldsSchema,
  trade: tradeParamsSchema,
});
export type BuildRequest = z.infer<typeof buildRequestSchema>;

export const sendRequestSchema = z.object({
  launchId: z.string().uuid(),
  /** base64 signed transaction, or absent in mock mode */
  signedTx: z.string().optional(),
  /** base58 wallet signature over the mock-mode message */
  mockSignature: z.string().optional(),
});

export type LaunchStatus = 'building' | 'simulated' | 'sent' | 'confirmed' | 'failed';

export interface LaunchRecord {
  launchId: string;
  mint: string;
  name: string;
  ticker: string;
  description: string;
  imageUri: string | null;
  metadataUri: string;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  creator: string;
  devBuySol: number;
  signature: string | null;
  status: LaunchStatus;
  simulated: boolean;
  createdAt: string;
  /** when the launch landed (confirmed, or simulated in DRY_RUN): the brick's place in the pyramid */
  placedAt: string | null;
  hidden: boolean;
  marketCapUsd: number | null;
  change24h: number | null;
  belowSince: string | null;
}

export interface LaunchView extends LaunchRecord {
  /** pyramid brick number once placed */
  brickNo: number | null;
}

export interface PublicConfig {
  dryRun: boolean;
  mockMode: boolean;
  simMode: boolean;
  /** $PYRAMID contract address; null until the admin sets it (CA stays hidden) */
  pyramidMint: string | null;
  pyramidX: string | null;
  pyramidTelegram: string | null;
  siteUrl: string | null;
  deadMcapUsd: number;
}
