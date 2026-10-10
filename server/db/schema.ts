import { pgTable, text, timestamp, doublePrecision, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core';

/** One row per launch attempt. A launch becomes a brick once it is placed (confirmed, or simulated in DRY_RUN). */
export const launches = pgTable(
  'launches',
  {
    launchId: text('launch_id').primaryKey(),
    mint: text('mint').notNull(),
    name: text('name').notNull(),
    ticker: text('ticker').notNull(),
    description: text('description').notNull().default(''),
    imageUri: text('image_uri'),
    metadataUri: text('metadata_uri').notNull(),
    website: text('website'),
    twitter: text('twitter'),
    telegram: text('telegram'),
    creator: text('creator').notNull(),
    devBuySol: doublePrecision('dev_buy_sol').notNull().default(0),
    signature: text('signature'),
    status: text('status').notNull().default('building'),
    simulated: boolean('simulated').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    placedAt: timestamp('placed_at', { withTimezone: true }),
    hidden: boolean('hidden').notNull().default(false),
    marketCapUsd: doublePrecision('market_cap_usd'),
    change24h: doublePrecision('change_24h'),
    belowSince: timestamp('below_since', { withTimezone: true }),
  },
  (t) => [uniqueIndex('launches_mint_idx').on(t.mint), index('launches_created_idx').on(t.createdAt), index('launches_placed_idx').on(t.placedAt)],
);

/** Runtime settings the admin can change without a redeploy (PYRAMID_MINT, DRY_RUN, SIM_MODE). */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
