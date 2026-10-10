import type { Env } from './env.js';
import type { Store } from './db/store.js';
import type { FetchLike } from './services/http.js';
import { getMarkets } from './services/dexscreener.js';
import { createPyramid, type Broadcast } from './services/pyramid.js';
import { createSimWorld, type SimWorld } from './services/sim.js';

/** Settings the admin can flip at runtime; persisted in the `settings` table, env provides defaults. */
export const RUNTIME_KEYS = ['PYRAMID_MINT', 'DRY_RUN', 'SIM_MODE'] as const;
export type RuntimeKey = (typeof RUNTIME_KEYS)[number];

const truthy = (v: string) => !['false', '0', 'off', 'no'].includes(v.toLowerCase());

/**
 * Owns the long-lived pieces: the pyramid index, the market poller and the SIM loop.
 * `env` is mutated in place when the admin changes a setting, so the launcher
 * (which reads env.DRY_RUN on every call) picks the change up immediately.
 */
export function createRuntime(opts: { env: Env; store: Store; fetchImpl?: FetchLike; log?: (m: string) => void }) {
  const { env, store, fetchImpl, log = () => {} } = opts;
  let out: Broadcast = () => {};
  const broadcast: Broadcast = (c, p) => out(c, p);
  let sim: SimWorld | null = null;
  const timers: NodeJS.Timeout[] = [];
  let simTimers: NodeJS.Timeout[] = [];
  const defaultMint = env.PYRAMID_MINT;

  const pyramid = createPyramid({
    env,
    store,
    broadcast,
    log,
    markets: (mints) => getMarkets(env.DEXSCREENER_URL, mints, fetchImpl),
  });

  function stopSim() {
    simTimers.forEach(clearInterval);
    simTimers = [];
  }

  function startSim() {
    stopSim();
    if (!env.SIM_MODE) {
      sim = null;
      pyramid.setSim(null);
      return;
    }
    sim ??= createSimWorld({ seedCount: env.SIM_SEED, threshold: env.DEAD_MCAP_USD });
    pyramid.setSim(sim);
    if (env.SIM_INTERVAL_MS > 0) {
      const launchTick = () => {
        const b = sim!.launch();
        pyramid.append(b);
        // jitter: "every few seconds", never metronomic
        simTimers[0] = setTimeout(launchTick, env.SIM_INTERVAL_MS * (0.5 + Math.random()));
      };
      simTimers.push(setTimeout(launchTick, env.SIM_INTERVAL_MS));
      simTimers.push(setInterval(() => pyramid.applyTicks(sim!.step()), 2500));
    }
  }

  async function applySetting(key: RuntimeKey, value: string | null) {
    if (key === 'PYRAMID_MINT') env.PYRAMID_MINT = value ?? defaultMint; // '' = CA hidden
    if (key === 'DRY_RUN') env.DRY_RUN = value == null ? env.DRY_RUN : truthy(value);
    if (key === 'SIM_MODE') env.SIM_MODE = value == null ? env.SIM_MODE : truthy(value);
  }

  /** (re)apply saved settings and rebuild the pyramid from the store — at boot, and when the database comes online */
  let reconciler: (() => Promise<void>) | null = null;
  const reconcile = () => (reconciler ? reconciler().catch((e) => log(`[reconcile] ${(e as Error).message}`)) : Promise.resolve());

  async function reload() {
    const saved = await store.getSettings();
    for (const k of RUNTIME_KEYS) if (saved[k] != null) await applySetting(k, saved[k]);
    startSim();
    await pyramid.load();
    broadcast('config', null);
    await reconcile();
  }

  async function start() {
    await reload();
    const poll = () => pyramid.pollMarkets().catch((e) => log(`[market] ${(e as Error).message}`));
    timers.push(setInterval(poll, env.MARKET_POLL_MS));
    timers.push(setInterval(() => void reconcile(), 60_000));
    void poll();
  }

  async function set(key: RuntimeKey, value: string | null) {
    await store.setSetting(key, value);
    await applySetting(key, value);
    if (key === 'SIM_MODE') startSim();
    if (key === 'SIM_MODE' || key === 'DRY_RUN') await pyramid.load();
    broadcast('config', null);
    log(`[admin] ${key} = ${value ?? '(default)'}`);
  }

  return {
    pyramid,
    start,
    reload,
    set,
    setReconciler(f: () => Promise<void>) {
      reconciler = f;
    },
    get sim() {
      return sim;
    },
    attach(b: Broadcast) {
      out = b;
    },
    stop() {
      timers.forEach(clearInterval);
      stopSim();
    },
  };
}

export type Runtime = ReturnType<typeof createRuntime>;
