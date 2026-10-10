import { z } from 'zod';

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : !['false', '0', 'off', 'no'].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().default(5000),
  HOST: z.string().default('0.0.0.0'),
  // trimmed; an empty secret counts as unset
  DATABASE_URL: z.string().trim().optional().transform((v) => v || undefined),
  HELIUS_RPC_URL: z.string().optional(),
  /** Build + simulate only, never broadcast. ON unless explicitly "false". */
  DRY_RUN: bool(true),
  /**
   * In DRY_RUN, fall back to a fully local mock launch (wallet signs a message,
   * no transaction) when PumpPortal / IPFS / RPC are unreachable. Ignored when DRY_RUN=false.
   */
  MOCK_FALLBACK: bool(true),
  /** $PYRAMID contract address. Empty = CA hidden on the site. Admin can set it at runtime. */
  PYRAMID_MINT: z.string().default('ssrd7Lp5CZq6zuUht35N7vqQ92Gq8Kgxe9mRYhXpump'),
  PYRAMID_X_URL: z.string().optional(),
  PYRAMID_TELEGRAM_URL: z.string().optional(),
  /** bearer token for /admin. Admin is disabled when unset. */
  ADMIN_TOKEN: z.string().optional(),
  /** synthetic launches so the pyramid looks alive while testing. Never touches chain. */
  SIM_MODE: bool(false),
  SIM_SEED: z.coerce.number().int().min(0).max(5000).default(60),
  SIM_INTERVAL_MS: z.coerce.number().int().min(0).default(4000),
  /** a brick cracks after its mcap stays below this for 24h */
  DEAD_MCAP_USD: z.coerce.number().min(0).default(6000),
  MARKET_POLL_MS: z.coerce.number().int().min(5000).default(45_000),
  PINATA_JWT: z.string().optional(),
  PUBLIC_SITE_URL: z.string().optional(),
  PUMPPORTAL_URL: z.string().default('https://pumpportal.fun/api/trade-local'),
  PUMP_IPFS_URL: z.string().default('https://pump.fun/api/ipfs'),
  DEXSCREENER_URL: z.string().default('https://api.dexscreener.com'),
  MEDIA_DIR: z.string().default('./data/media'),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error('Invalid environment: ' + parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  return parsed.data;
}

/** mock mode is only ever possible while DRY_RUN is on */
export const mockAllowed = (env: Env) => env.DRY_RUN && env.MOCK_FALLBACK;
