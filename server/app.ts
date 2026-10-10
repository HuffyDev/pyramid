import { existsSync } from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { IMAGE_MAX_BYTES, launchFieldsSchema, sendRequestSchema, type LaunchView, type PublicConfig } from '../shared/launch.js';
import { mockAllowed, type Env } from './env.js';
import type { Store } from './db/store.js';
import { assertClean, createLauncher, LaunchError } from './services/launcher.js';
import type { FetchLike } from './services/http.js';
import { publicBrick } from './services/pyramid.js';
import { sniffImage } from './lib/image.js';
import { createLimiter } from './lib/rateLimit.js';
import { createRuntime, type Runtime } from './runtime.js';
import { adminRoutes } from './routes/admin.js';
import type { DbStatus } from './db/connect.js';

export interface AppDeps {
  env: Env;
  store: Store;
  fetchImpl?: FetchLike;
  clientDir?: string | null;
  logger?: boolean;
  runtime?: Runtime;
  /** live database status; omitted = no database configured (tests, local UI work) */
  db?: { status: DbStatus };
}

export async function buildApp({ env, store, fetchImpl, clientDir, logger = true, runtime: rt, db }: AppDeps): Promise<{ app: FastifyInstance; runtime: Runtime }> {
  const app = Fastify({ logger: logger ? { level: 'info' } : false, disableRequestLogging: true, bodyLimit: 2 * 1024 * 1024, trustProxy: true });
  const runtime = rt ?? createRuntime({ env, store, fetchImpl, log: (m) => app.log.info(m) });
  const { pyramid } = runtime;
  const launcher = createLauncher({
    env,
    store,
    fetchImpl,
    log: (m, x) => app.log.info({ x }, m),
    onPlaced: (l) => pyramid.placeLaunch(l),
  });
  const limit = createLimiter();
  const guard = (req: FastifyRequest, bucket: string, max: number, windowMs = 60_000) => {
    if (!limit(`${req.ip}:${bucket}`, max, windowMs)) throw new LaunchError('Slow down — too many requests.', 429, 'rate_limited');
  };

  await app.register(multipart, { limits: { fileSize: IMAGE_MAX_BYTES, files: 1, fields: 12 } });

  app.setErrorHandler((err, _req, reply) => {
    const e = err as Error & { status?: number; code?: string; statusCode?: number };
    const status = e instanceof LaunchError ? e.status : e.statusCode && e.statusCode < 500 ? e.statusCode : 500;
    if (status >= 500) app.log.error(err);
    reply.status(status).send({ error: status >= 500 && !(e instanceof LaunchError) ? 'Internal error' : e.message, code: e.code ?? 'error' });
  });

  const origin = (req: FastifyRequest) => `${req.protocol}://${req.host}`;

  /**
   * With a database configured, launches wait for it: a real launch recorded only in memory
   * would vanish from the pyramid on the next restart. Dry runs may continue in memory once
   * the first connection attempt has failed (they are practice bricks anyway).
   */
  const launchesPaused = () => {
    const st = db?.status.state;
    if (!st || st === 'none' || st === 'ready') return null;
    if (st === 'connecting') return 'Warming up — try again in a few seconds.';
    return env.DRY_RUN ? null : 'Launches are paused: the database is unreachable. Nothing was sent.';
  };
  const ensureLaunchesOpen = () => {
    const why = launchesPaused();
    if (why) throw new LaunchError(why, 503, 'launches_paused');
  };
  const withBrick = (l: Awaited<ReturnType<Store['getLaunch']>>): LaunchView | null => (l ? { ...l, brickNo: pyramid.get(l.mint)?.n ?? null } : null);

  // always 200 while the process is up, so the host does not restart-loop over a database problem
  app.get('/api/health', async () => ({
    ok: true,
    store: store.kind,
    db: db?.status.state ?? 'none', // details (errors, hints) only in /admin: they can name hosts or users
    dryRun: env.DRY_RUN,
    sim: env.SIM_MODE,
    bricks: pyramid.count(),
  }));

  app.get('/api/config', async (): Promise<PublicConfig> => ({
    dryRun: env.DRY_RUN,
    mockMode: mockAllowed(env),
    simMode: env.SIM_MODE,
    pyramidMint: env.PYRAMID_MINT || null,
    pyramidX: env.PYRAMID_X_URL || null,
    pyramidTelegram: env.PYRAMID_TELEGRAM_URL || null,
    siteUrl: env.PUBLIC_SITE_URL || null,
    deadMcapUsd: env.DEAD_MCAP_USD,
    launchesPaused: launchesPaused(),
  }));

  // ── pyramid ────────────────────────────────────────────────────────────────
  app.get('/api/pyramid', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return { bricks: pyramid.all().map(publicBrick), at: new Date().toISOString() };
  });

  app.get<{ Params: { mint: string } }>('/api/bricks/:mint', async (req) => {
    const b = pyramid.get(req.params.mint);
    if (!b) throw new LaunchError('Brick not found', 404, 'not_found');
    const pub = publicBrick(b);
    let detail: { description: string; website: string | null; twitter: string | null; telegram: string | null; signature: string | null } = {
      description: '',
      website: null,
      twitter: null,
      telegram: null,
      signature: null,
    };
    if (!b.hidden) {
      if (b.sim) detail.description = runtime.sim?.get(b.mint)?.description ?? '';
      else {
        const l = await store.getByMint(b.mint);
        if (l) detail = { description: l.description, website: l.website, twitter: l.twitter, telegram: l.telegram, signature: l.signature };
      }
    }
    return { brick: pub, detail, total: pyramid.count() };
  });

  // ── launch (non-custodial: the server never sees a private key) ────────────
  app.post('/api/filter', async (req) => {
    guard(req, 'filter', 60);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const s = (v: unknown) => (typeof v === 'string' ? v.slice(0, 600) : '');
    assertClean({ name: s(b.name), ticker: s(b.ticker), description: s(b.description) });
    return { ok: true };
  });

  app.post('/api/upload', async (req) => {
    guard(req, 'upload', 10);
    ensureLaunchesOpen();
    const fields: Record<string, string> = {};
    let image: { bytes: Buffer; filename: string } | null = null;
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const bytes = await part.toBuffer();
        if (part.fieldname === 'image') image = { bytes, filename: part.filename || 'image' };
      } else {
        fields[part.fieldname] = String(part.value ?? '');
      }
    }
    if (!image) throw new LaunchError('Image is required.');
    const mime = sniffImage(image.bytes);
    if (!mime) throw new LaunchError('Image must be PNG, JPG, WEBP or GIF.');
    if (image.bytes.length > IMAGE_MAX_BYTES) throw new LaunchError('Image is too large.');
    const parsed = launchFieldsSchema.safeParse(fields);
    if (!parsed.success) throw new LaunchError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    const f = parsed.data;
    return launcher.upload(
      { image: { ...image, mime }, name: f.name, symbol: f.ticker, description: f.description, website: f.website, twitter: f.twitter, telegram: f.telegram },
      origin(req),
    );
  });

  app.post('/api/launch/build', async (req) => {
    guard(req, 'build', 20);
    ensureLaunchesOpen();
    return launcher.build(req.body);
  });

  app.post('/api/launch/send', async (req) => {
    guard(req, 'send', 20);
    ensureLaunchesOpen();
    const parsed = sendRequestSchema.safeParse(req.body);
    if (!parsed.success) throw new LaunchError('Invalid request.');
    const r = await launcher.send(parsed.data);
    return { ...r, launch: withBrick(r.launch) };
  });

  app.get<{ Params: { id: string } }>('/api/launch/:id', async (req) => {
    const l = withBrick(await store.getLaunch(req.params.id));
    if (!l) throw new LaunchError('Not found', 404, 'not_found');
    return { launch: l };
  });

  await app.register(adminRoutes, { prefix: '/api/admin', env, runtime, db });

  // dry-run local media
  const mediaDir = path.resolve(env.MEDIA_DIR);
  await app.register(fastifyStatic, { root: mediaDir, prefix: '/media/', decorateReply: false, serve: true, allowedPath: () => true });

  if (clientDir && existsSync(clientDir)) {
    await app.register(fastifyStatic, { root: clientDir, prefix: '/' });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/media/') || req.url.startsWith('/socket.io/')) return reply.status(404).send({ error: 'Not found' });
      return reply.type('text/html').sendFile('index.html', clientDir);
    });
  }

  return { app, runtime };
}
