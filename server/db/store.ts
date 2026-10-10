import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import type { LaunchRecord, LaunchStatus } from '../../shared/launch.js';
import { launches, settings } from './schema.js';

export type NewLaunch = Omit<
  LaunchRecord,
  'createdAt' | 'signature' | 'status' | 'simulated' | 'placedAt' | 'hidden' | 'marketCapUsd' | 'change24h' | 'belowSince'
>;
export type LaunchPatch = Partial<Pick<LaunchRecord, 'signature' | 'simulated' | 'placedAt'>>;
export interface MarketPatch {
  mint: string;
  marketCapUsd: number | null;
  change24h: number | null;
  belowSince: string | null;
}

export interface Store {
  kind: 'postgres' | 'memory';
  upsertBuilding(l: NewLaunch): Promise<LaunchRecord>;
  getLaunch(launchId: string): Promise<LaunchRecord | null>;
  getByMint(mint: string): Promise<LaunchRecord | null>;
  /** atomically move a launch from one status to another; returns null if it was not in `from` */
  transition(launchId: string, from: LaunchStatus[], to: LaunchStatus, patch?: LaunchPatch): Promise<LaunchRecord | null>;
  /** every placed launch, oldest first (brick order) */
  listPlaced(opts: { includeSimulated: boolean }): Promise<LaunchRecord[]>;
  setHidden(mint: string, hidden: boolean): Promise<LaunchRecord | null>;
  /** launches in a given status, oldest first (the reconciler reads 'sent') */
  listByStatus(status: LaunchStatus, limit?: number): Promise<LaunchRecord[]>;
  updateMarket(rows: MarketPatch[]): Promise<void>;
  getSettings(): Promise<Record<string, string>>;
  setSetting(key: string, value: string | null): Promise<void>;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const date = (s: string | null | undefined) => (s ? new Date(s) : null);

const toRecord = (r: typeof launches.$inferSelect): LaunchRecord => ({
  ...r,
  status: r.status as LaunchStatus,
  createdAt: r.createdAt.toISOString(),
  placedAt: iso(r.placedAt),
  belowSince: iso(r.belowSince),
});

export function pgStore(pool: Pool): Store {
  const db: NodePgDatabase = drizzle(pool);
  return {
    kind: 'postgres',
    async upsertBuilding(l) {
      const [row] = await db
        .insert(launches)
        .values({ ...l, status: 'building' })
        .onConflictDoUpdate({
          target: launches.launchId,
          set: { ...l },
          setWhere: sql`${launches.status} in ('building','failed')`,
        })
        .returning();
      return row ? toRecord(row) : (await this.getLaunch(l.launchId))!;
    },
    async getLaunch(id) {
      const [r] = await db.select().from(launches).where(eq(launches.launchId, id));
      return r ? toRecord(r) : null;
    },
    async getByMint(mint) {
      const [r] = await db.select().from(launches).where(eq(launches.mint, mint));
      return r ? toRecord(r) : null;
    },
    async transition(id, from, to, patch = {}) {
      const set: Partial<typeof launches.$inferInsert> = { status: to };
      if (patch.signature !== undefined) set.signature = patch.signature;
      if (patch.simulated !== undefined) set.simulated = patch.simulated;
      if (patch.placedAt !== undefined) set.placedAt = date(patch.placedAt);
      const [r] = await db
        .update(launches)
        .set(set)
        .where(and(eq(launches.launchId, id), inArray(launches.status, from)))
        .returning();
      return r ? toRecord(r) : null;
    },
    async listPlaced({ includeSimulated }) {
      const rows = await db
        .select()
        .from(launches)
        .where(
          and(
            sql`${launches.placedAt} is not null`,
            includeSimulated ? inArray(launches.status, ['confirmed', 'simulated']) : eq(launches.status, 'confirmed'),
          ),
        )
        .orderBy(asc(launches.placedAt), asc(launches.createdAt));
      return rows.map(toRecord);
    },
    async listByStatus(status, limit = 200) {
      const rows = await db.select().from(launches).where(eq(launches.status, status)).orderBy(asc(launches.createdAt)).limit(limit);
      return rows.map(toRecord);
    },
    async setHidden(mint, hidden) {
      const [r] = await db.update(launches).set({ hidden }).where(eq(launches.mint, mint)).returning();
      return r ? toRecord(r) : null;
    },
    async updateMarket(rows) {
      // small batches; a few hundred rows per poll at most
      for (const m of rows) {
        await db
          .update(launches)
          .set({ marketCapUsd: m.marketCapUsd, change24h: m.change24h, belowSince: date(m.belowSince) })
          .where(eq(launches.mint, m.mint));
      }
    },
    async getSettings() {
      const rows = await db.select().from(settings);
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },
    async setSetting(key, value) {
      if (value === null) {
        await db.delete(settings).where(eq(settings.key, key));
        return;
      }
      await db
        .insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
    },
  };
}

/** Used when DATABASE_URL is not set (local UI work, tests). Not persistent. */
export function memoryStore(): Store {
  const rows = new Map<string, LaunchRecord>();
  const kv = new Map<string, string>();
  const byMint = (mint: string) => [...rows.values()].find((r) => r.mint === mint) ?? null;
  return {
    kind: 'memory',
    async upsertBuilding(l) {
      const cur = rows.get(l.launchId);
      if (cur && !['building', 'failed'].includes(cur.status)) return cur;
      const rec: LaunchRecord = {
        ...l,
        signature: null,
        status: 'building',
        simulated: false,
        createdAt: cur?.createdAt ?? new Date().toISOString(),
        placedAt: null,
        hidden: false,
        marketCapUsd: null,
        change24h: null,
        belowSince: null,
      };
      rows.set(l.launchId, rec);
      return rec;
    },
    async getLaunch(id) {
      return rows.get(id) ?? null;
    },
    async getByMint(mint) {
      return byMint(mint);
    },
    async transition(id, from, to, patch = {}) {
      const cur = rows.get(id);
      if (!cur || !from.includes(cur.status)) return null;
      const next = { ...cur, ...patch, launchId: id, status: to };
      rows.set(id, next);
      return next;
    },
    async listPlaced({ includeSimulated }) {
      return [...rows.values()]
        .filter((r) => r.placedAt && (r.status === 'confirmed' || (includeSimulated && r.status === 'simulated')))
        .sort((a, b) => a.placedAt!.localeCompare(b.placedAt!) || a.createdAt.localeCompare(b.createdAt));
    },
    async listByStatus(status, limit = 200) {
      return [...rows.values()]
        .filter((r) => r.status === status)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, limit);
    },
    async setHidden(mint, hidden) {
      const r = byMint(mint);
      if (!r) return null;
      const next = { ...r, hidden };
      rows.set(r.launchId, next);
      return next;
    },
    async updateMarket(list) {
      for (const m of list) {
        const r = byMint(m.mint);
        if (r) rows.set(r.launchId, { ...r, marketCapUsd: m.marketCapUsd, change24h: m.change24h, belowSince: m.belowSince });
      }
    },
    async getSettings() {
      return Object.fromEntries(kv);
    },
    async setSetting(key, value) {
      if (value === null) kv.delete(key);
      else kv.set(key, value);
    },
  };
}
