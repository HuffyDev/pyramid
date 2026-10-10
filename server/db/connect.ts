import pg from 'pg';
import { runMigrations } from './migrate.js';
import { memoryStore, pgStore, type Store } from './store.js';

/**
 * The database must never take the site down. The server starts listening first and
 * connects in the background; until Postgres is reachable it serves from an in-memory
 * store, pauses real (non-dry-run) launches, and keeps retrying.
 */

export type DbState = 'none' | 'connecting' | 'ready' | 'failed';

export interface DbStatus {
  state: DbState;
  error: string | null;
  /** human advice for the operator (logged, shown in /admin and /api/health) */
  hint: string | null;
  attempts: number;
  since: string;
}

/** A Store whose backing implementation can be swapped (memory → postgres) without callers noticing. */
export interface SwitchableStore extends Store {
  swap(next: Store): void;
  readonly current: Store;
}

export function switchableStore(initial: Store): SwitchableStore {
  let cur = initial;
  return {
    get kind() {
      return cur.kind;
    },
    get current() {
      return cur;
    },
    swap(next) {
      cur = next;
    },
    upsertBuilding: (l) => cur.upsertBuilding(l),
    getLaunch: (id) => cur.getLaunch(id),
    getByMint: (m) => cur.getByMint(m),
    transition: (id, from, to, patch) => cur.transition(id, from, to, patch),
    listPlaced: (o) => cur.listPlaced(o),
    setHidden: (m, h) => cur.setHidden(m, h),
    updateMarket: (rows) => cur.updateMarket(rows),
    getSettings: () => cur.getSettings(),
    setSetting: (k, v) => cur.setSetting(k, v),
  };
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

/** Turn a connection error into advice an operator can act on. */
export function dbHint(url: string, err: unknown, env: Record<string, string | undefined> = process.env): string {
  const e = err as { code?: string; message?: string };
  const host = hostOf(url);
  const deployed = !!env.REPLIT_DEPLOYMENT;
  if (host === 'helium' && deployed)
    return "DATABASE_URL points at Replit's development database (host 'helium'), which published apps cannot reach. In Replit: Publishing → Adjust settings → add a production database, then republish.";
  if (e?.code === 'ENOTFOUND' || e?.code === 'EAI_AGAIN')
    return `Database host '${host}' does not resolve from this machine. Check DATABASE_URL${deployed ? ' — a published app needs its own production database' : ''}.`;
  if (e?.code === 'ECONNREFUSED') return `Nothing is listening at '${host}'. Is the database running?`;
  if (e?.code === '28P01' || /password authentication/i.test(e?.message ?? '')) return 'Database rejected the password in DATABASE_URL.';
  if (e?.code === '3D000') return 'The database named in DATABASE_URL does not exist.';
  if (/timeout/i.test(e?.message ?? '')) return `Timed out connecting to '${host}'.`;
  return 'Could not connect to Postgres. Check DATABASE_URL.';
}

export interface ConnectorOpts {
  url: string | undefined;
  store: SwitchableStore;
  /** called after the postgres store is swapped in (reload pyramid + settings) */
  onReady?: () => Promise<void> | void;
  /** called on every state change (e.g. to tell clients launches paused / resumed) */
  onStatus?: (s: DbStatus) => void;
  log?: (m: string) => void;
  connectTimeoutMs?: number;
  /** retry delays in ms; the last one repeats */
  retryMs?: number[];
  makePool?: (url: string) => pg.Pool;
  migrate?: (pool: pg.Pool) => Promise<void>;
}

export function createDbConnector(o: ConnectorOpts) {
  const log = o.log ?? ((m: string) => console.log(m));
  const retry = o.retryMs ?? [5_000, 15_000, 30_000, 60_000, 120_000];
  const status: DbStatus = { state: o.url ? 'connecting' : 'none', error: null, hint: null, attempts: 0, since: new Date().toISOString() };
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let pool: pg.Pool | null = null;

  const set = (p: Partial<DbStatus>) => {
    const changed = p.state !== undefined && p.state !== status.state;
    Object.assign(status, p, { since: new Date().toISOString() });
    if (changed) o.onStatus?.(status);
  };

  const makePool =
    o.makePool ??
    ((url: string) =>
      new pg.Pool({
        connectionString: url,
        max: 10,
        connectionTimeoutMillis: o.connectTimeoutMs ?? 10_000,
        idleTimeoutMillis: 30_000,
      }));

  async function attempt(): Promise<boolean> {
    if (!o.url || stopped) return false;
    status.attempts++;
    const p = makePool(o.url);
    // an idle client erroring (db restart, network blip) must not crash the process
    p.on('error', (e) => log(`[db] pool error: ${e.message}`));
    try {
      await (o.migrate ?? ((pp) => runMigrations(pp, undefined, log)))(p);
      if (stopped) {
        await p.end().catch(() => {});
        return false;
      }
      pool = p;
      o.store.swap(pgStore(p));
      set({ state: 'ready', error: null, hint: null });
      log(`[db] connected${status.attempts > 1 ? ` after ${status.attempts} attempts` : ''}`);
      // the connection is good even if the reload hiccups; never flip back to 'failed' for that
      await Promise.resolve()
        .then(() => o.onReady?.())
        .catch((e) => log(`[db] reload after connect failed: ${(e as Error).message}`));
      return true;
    } catch (e) {
      await p.end().catch(() => {});
      const msg = (e as Error).message || String(e);
      const hint = dbHint(o.url, e);
      set({ state: 'failed', error: msg, hint });
      log(`[db] connect failed (attempt ${status.attempts}): ${msg}`);
      log(`[db] ${hint}`);
      log('[db] serving from memory until the database is reachable; real launches are paused.');
      return false;
    }
  }

  function schedule() {
    if (stopped || status.state === 'ready') return;
    const delay = retry[Math.min(status.attempts - 1, retry.length - 1)] ?? 60_000;
    timer = setTimeout(async () => {
      if (!(await attempt())) schedule();
    }, delay);
    timer.unref?.();
  }

  return {
    status,
    /** first attempt (awaitable), then background retries until it works */
    async start() {
      if (!o.url) {
        log('[db] DATABASE_URL not set — using in-memory store (data is lost on restart)');
        return;
      }
      if (!(await attempt())) schedule();
    },
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await pool?.end().catch(() => {});
    },
  };
}

export type DbConnector = ReturnType<typeof createDbConnector>;

export const freshMemoryStore = () => switchableStore(memoryStore());
