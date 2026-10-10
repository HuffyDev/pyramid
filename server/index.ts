import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server as IOServer } from 'socket.io';
import { loadEnv } from './env.js';
import { buildApp } from './app.js';
import { memoryStore } from './db/store.js';
import { createDbConnector, switchableStore } from './db/connect.js';

// a stray rejection must never take the whole site down; log it and keep serving
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));

const env = loadEnv();
mkdirSync(env.MEDIA_DIR, { recursive: true });

// Serve from memory until Postgres answers; the connector swaps the real store in (and retries forever).
const store = switchableStore(memoryStore());

const here = path.dirname(fileURLToPath(import.meta.url));
// dev (tsx): server/ → ../dist/client ; prod: dist/server/server/ → ../../client
const clientDir = [path.resolve(here, '../../client'), path.resolve(here, '../dist/client')].find((d) => existsSync(path.join(d, 'index.html'))) ?? null;

let onDbReady: () => Promise<void> = async () => {};
let onDbStatus: () => void = () => {};
const db = createDbConnector({ url: env.DATABASE_URL, store, onReady: () => onDbReady(), onStatus: () => onDbStatus() });

const { app, runtime } = await buildApp({ env, store, clientDir, db });
await app.ready();

// live pushes: new bricks, market ticks, hides, config changes (pattern from quant)
const io = new IOServer(app.server, {
  cors: { origin: env.NODE_ENV === 'production' ? false : '*' },
  serveClient: false,
  perMessageDeflate: { threshold: 1024 },
});
runtime.attach((channel, payload) => io.emit(channel, payload));
onDbStatus = () => io.emit('config', null); // clients refetch config: launches paused / resumed

// listen first: the site is up even if the database is not
await app.listen({ port: env.PORT, host: env.HOST });
await runtime.start();

// the database coming online (now, after retries, or after an outage) reloads settings, every brick and
// pending launches from Postgres. A failed reload keeps the db 'failed' (launches paused) and is retried.
onDbReady = () => runtime.reload();
await db.start();

app.log.info(`PYRAMID on :${env.PORT} — DRY_RUN=${env.DRY_RUN} SIM=${env.SIM_MODE} store=${store.kind} db=${db.status.state} bricks=${runtime.pyramid.count()}`);

const shutdown = async () => {
  runtime.stop();
  io.close();
  await app.close();
  await db.stop();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
