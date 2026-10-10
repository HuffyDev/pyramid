import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Env } from '../env.js';
import type { Runtime } from '../runtime.js';
import type { DbStatus } from '../db/connect.js';
import { createLimiter } from '../lib/rateLimit.js';

/** Constant-time bearer check (same scheme as quant's admin). Admin is off when ADMIN_TOKEN is unset. */
export function adminOk(env: Env, req: FastifyRequest): boolean {
  if (!env.ADMIN_TOKEN) return false;
  const h = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? (req.headers['x-admin-token'] as string | undefined);
  if (!h) return false;
  const a = Buffer.from(h);
  const b = Buffer.from(env.ADMIN_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

const base58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const settingBody = z.discriminatedUnion('key', [
  z.object({ key: z.literal('PYRAMID_MINT'), value: z.string().trim().regex(base58, 'invalid mint address').or(z.literal('')).nullable() }),
  z.object({ key: z.literal('DRY_RUN'), value: z.boolean() }),
  z.object({ key: z.literal('SIM_MODE'), value: z.boolean() }),
]);

const hideBody = z.object({ ref: z.string().trim().min(1), hidden: z.boolean() });

export async function adminRoutes(app: FastifyInstance, opts: { env: Env; runtime: Runtime; db?: { status: DbStatus } }) {
  const { env, runtime, db } = opts;
  // settings written while the database is down would live only in memory and be overwritten when it returns
  const dbDown = () => !!db && (db.status.state === 'connecting' || db.status.state === 'failed');
  const { pyramid } = runtime;
  const limit = createLimiter();

  app.addHook('onRequest', async (req, reply) => {
    if (!env.ADMIN_TOKEN) return reply.code(503).send({ error: 'ADMIN_TOKEN not configured' });
    if (!limit(`${req.ip}:admin`, 60, 60_000)) return reply.code(429).send({ error: 'Too many requests' });
    if (!adminOk(env, req)) return reply.code(401).send({ error: 'Unauthorized' });
  });

  const resolve = (ref: string) => {
    const n = ref.replace(/^#/, '');
    if (/^\d+$/.test(n)) return pyramid.byNumber(Number(n));
    return pyramid.get(ref);
  };

  app.get('/status', async () => ({
    settings: { PYRAMID_MINT: env.PYRAMID_MINT || null, DRY_RUN: env.DRY_RUN, SIM_MODE: env.SIM_MODE },
    heliusConfigured: !!env.HELIUS_RPC_URL,
    db: db ? { state: db.status.state, error: db.status.error, hint: db.status.hint, attempts: db.status.attempts } : { state: 'none', error: null, hint: null, attempts: 0 },
    bricks: pyramid.count(),
    hidden: pyramid.all().filter((b) => b.hidden).map((b) => ({ n: b.n, mint: b.mint, name: b.name, ticker: b.ticker })),
  }));

  app.get<{ Querystring: { q?: string } }>('/bricks', async (req) => {
    const q = (req.query.q ?? '').trim().toLowerCase().replace(/^#/, '');
    const all = pyramid.all();
    const hits = q
      ? all.filter((b) => String(b.n) === q || b.mint.toLowerCase() === q || b.ticker.toLowerCase().includes(q) || b.name.toLowerCase().includes(q))
      : all.slice(-25).reverse();
    return { bricks: hits.slice(0, 50).map((b) => ({ n: b.n, mint: b.mint, name: b.name, ticker: b.ticker, hidden: b.hidden, sim: b.sim })) };
  });

  app.post('/settings', async (req, reply) => {
    const p = settingBody.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message ?? 'invalid' });
    const { key, value } = p.data;
    if (dbDown()) return reply.code(503).send({ error: 'Database unreachable — settings would not be saved. Fix DATABASE_URL first.' });
    if (key === 'DRY_RUN' && value === false && !env.HELIUS_RPC_URL) return reply.code(400).send({ error: 'Set HELIUS_RPC_URL before turning DRY_RUN off.' });
    await runtime.set(key, typeof value === 'boolean' ? String(value) : (value ?? null));
    return { ok: true, settings: { PYRAMID_MINT: env.PYRAMID_MINT || null, DRY_RUN: env.DRY_RUN, SIM_MODE: env.SIM_MODE } };
  });

  app.post('/hide', async (req, reply) => {
    const p = hideBody.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'ref (brick #, or mint) and hidden required' });
    const b = resolve(p.data.ref);
    if (!b) return reply.code(404).send({ error: 'Brick not found' });
    if (dbDown() && !b.sim) return reply.code(503).send({ error: 'Database unreachable — the hide would not be saved.' });
    const r = await pyramid.setHidden(b.mint, p.data.hidden);
    return { ok: true, brick: { n: r!.n, mint: r!.mint, hidden: r!.hidden } };
  });
}
