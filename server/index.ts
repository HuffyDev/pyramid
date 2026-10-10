import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { Server as IOServer } from 'socket.io';
import { loadEnv } from './env.js';
import { buildApp } from './app.js';
import { memoryStore, pgStore, type Store } from './db/store.js';
import { runMigrations } from './db/migrate.js';

const env = loadEnv();
mkdirSync(env.MEDIA_DIR, { recursive: true });

let store: Store;
if (env.DATABASE_URL) {
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });
  await runMigrations(pool); // idempotent; baselines a hand-made schema
  store = pgStore(pool);
} else {
  console.warn('[db] DATABASE_URL not set — using in-memory store (data is lost on restart)');
  store = memoryStore();
}

const here = path.dirname(fileURLToPath(import.meta.url));
// dev (tsx): server/ → ../dist/client ; prod: dist/server/server/ → ../../client
const clientDir = [path.resolve(here, '../../client'), path.resolve(here, '../dist/client')].find((d) => existsSync(path.join(d, 'index.html'))) ?? null;

const { app, runtime } = await buildApp({ env, store, clientDir });
await app.ready();

// live pushes: new bricks, market ticks, hides, config changes (pattern from quant)
const io = new IOServer(app.server, {
  cors: { origin: env.NODE_ENV === 'production' ? false : '*' },
  serveClient: false,
  perMessageDeflate: { threshold: 1024 },
});
runtime.attach((channel, payload) => io.emit(channel, payload));

await runtime.start();
await app.listen({ port: env.PORT, host: env.HOST });
app.log.info(`PYRAMID on :${env.PORT} — DRY_RUN=${env.DRY_RUN} SIM=${env.SIM_MODE} store=${store.kind} bricks=${runtime.pyramid.count()}`);

const shutdown = async () => {
  runtime.stop();
  io.close();
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
