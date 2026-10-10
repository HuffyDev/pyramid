# PYRAMID — setup

Non-custodial Solana launchpad. Every coin launched through it becomes a brick in a live pyramid.
Users sign in their own wallet; the mint keypair is generated in the browser; the server never sees a private key.
No platform fee. No bundling, no sniping.

## Run on Replit

1. Import the repo. `.replit` already runs `npm run build && npm start` on Node 22, port 5000 → 80, VM deployment
   (the Socket.IO pushes and the market poller need an always-on process).
2. Add a Postgres database (Replit sets `DATABASE_URL`). Migrations run on every boot and are idempotent
   (a hand-made schema is baselined instead of re-created).
3. Add the secrets below in the **Secrets** tab. At minimum: `HELIUS_RPC_URL`, `ADMIN_TOKEN`.
4. Run `npm run check:live`. Every check should pass **before** you turn `DRY_RUN` off.

### Published site shows "Internal Server Error" / won't open

Almost always the database. Replit's workspace database (host `helium`) is **development only** — a published app cannot
reach it. If the deployment inherits that `DATABASE_URL`, older builds crashed on boot with `ENOTFOUND helium`.

Since this fix the server never crashes over the database: it starts, serves the site from memory, retries the database in
the background, and pauses real launches until Postgres answers (dry runs keep working). To fix it properly:

1. Replit → **Publishing → Adjust settings** → add / create a **production database** (this gives the deployment its own `DATABASE_URL`).
2. **Republish**.
3. Open `/api/health` — `"db":"ready"` means it's connected. `/admin` shows the exact database error and a hint if not.

## Environment variables

| Var | Required | Default | What it does |
|---|---|---|---|
| `DATABASE_URL` | recommended | — | Postgres. Without it an in-memory store is used (bricks are lost on restart). If it is set but unreachable the site still runs (from memory), retries in the background, and pauses real launches until it connects. On Replit, published apps need a production database (not the dev `helium` one). |
| `HELIUS_RPC_URL` | for live | — | Helius RPC URL incl. API key. Simulates (dry run) and sends (live). Never sent to the browser. |
| `DRY_RUN` | no | `true` | `true`: build + simulate, never broadcast. Only `false`/`0`/`off`/`no` turns it off. Admin can flip it at runtime. |
| `MOCK_FALLBACK` | no | `true` | Dry run only: if PumpPortal / IPFS / RPC are unreachable, run a local mock (wallet signs a message, no tx). Ignored when `DRY_RUN=false`. |
| `ADMIN_TOKEN` | for /admin | — | Bearer token for `/admin`. Use 24+ random chars. Admin is disabled when unset. |
| `PYRAMID_MINT` | no | `ssrd7Lp5CZq6zuUht35N7vqQ92Gq8Kgxe9mRYhXpump` | $PYRAMID contract shown in the capstone. Admin can change it, or clear it to hide the CA ("sealed"). |
| `PYRAMID_X_URL` | no | — | Official X link (footer, capstone section). |
| `PYRAMID_TELEGRAM_URL` | no | — | Official Telegram link. |
| `PUBLIC_SITE_URL` | no | request origin | Canonical URL for share links and dry-run media URLs. |
| `SIM_MODE` | no | `false` | Synthetic launches + random-walk market so the pyramid looks alive. Memory only, never on-chain. Admin can flip it. |
| `SIM_SEED` | no | `60` | Bricks the sim world starts with. |
| `SIM_INTERVAL_MS` | no | `4000` | Average gap between synthetic launches (jittered). `0` = no new sim launches. |
| `DEAD_MCAP_USD` | no | `6000` | A brick cracks after its mcap stays below this for 24h (deeper at 3d and 7d). Recovery heals it. |
| `MARKET_POLL_MS` | no | `45000` | DexScreener poll interval for real bricks. |
| `PINATA_JWT` | no | — | Fallback IPFS upload if pump.fun's IPFS endpoint rejects uploads. |
| `PORT` | no | `5000` | HTTP port. |
| `PUMPPORTAL_URL` / `PUMP_IPFS_URL` / `DEXSCREENER_URL` | no | public endpoints | Overrides for testing. |
| `MEDIA_DIR` | no | `./data/media` | Where dry-run media is stored. |

Runtime settings changed in `/admin` (`PYRAMID_MINT`, `DRY_RUN`, `SIM_MODE`) are saved in the `settings` table
and override the env on every boot. To return to the env value, change it back in `/admin`.

## Scripts

- `npm run dev` — API (tsx watch, :5000) + Vite (:5173, proxies `/api`, `/media`, `/socket.io`)
- `npm run build && npm start` — production
- `npm test` — tx building (fixtures), launch flow (dry run / live / mock / idempotent double-submit), content filter,
  brick placement, pyramid index (cracks, hides, market poll), HTTP + admin. Set `TEST_DATABASE_URL` to also
  test migrations and the Postgres store.
- `npm run check:live` — read-only checks of Helius, PumpPortal (unsigned create probe), pump.fun IPFS, DexScreener, config
- `npm run screenshots` — after `npm run build`: boots its own servers and writes `docs/screenshots/*` at 1440 and 390
  (`npm run screenshots -- pages` for the brick page and leaderboard)
- `npm run db:generate` — new Drizzle migration after editing `server/db/schema.ts`

## Going-live checklist

- [ ] `npm run check:live` is all green (PumpPortal's create shape has changed before — if it fails, don't go live)
- [ ] `SIM_MODE` off, `ADMIN_TOKEN` set, `DATABASE_URL` set
- [ ] One launch with `DRY_RUN=true` against mainnet RPC: simulation passes
- [ ] Turn `DRY_RUN` off in `/admin`, lay one brick yourself with a 0 dev buy, check it on pump.fun / Solscan
- [ ] `PUBLIC_SITE_URL` and `PYRAMID_X_URL` set

Dry-run bricks are only shown while `DRY_RUN` is on. Turning it off rebuilds the pyramid from confirmed launches only,
so the first real coin becomes brick #1.

## How it fits together

```
shared/       launch schemas + fees (from afterpad), pyramid geometry + brick state, content filter
server/
  services/   launcher, pumpportal, rpc, ipfs, dexscreener, http   ← afterpad, unchanged in spirit
              pyramid.ts   in-memory brick index, placement, market poll, dead clock, hide
              sim.ts       SIM mode world
  runtime.ts  owns pyramid + poller + sim; applies admin settings
  routes/     admin.ts (bearer token, timing-safe)
  db/         drizzle schema, store (pg + memory), idempotent boot migrations
client/src/
  pyramid/    renderer.ts (canvas 2D, culling, LOD, drop-in + dust, light) · sprites.ts (cached brick surfaces)
  components/ LaunchSheet, SuccessDock, PyramidStage (+ hover card), TickerStrip, BrickTile, Layout
  pages/      Home, Brick (/brick/:mint), Leaderboard, Admin
  wallet/     wallet-adapter: Phantom, Solflare + any Wallet Standard wallet (Backpack)
```

Launch flow: upload image + metadata to IPFS → server asks PumpPortal (trade-local `create`) for an unsigned tx and checks
it (fee payer = creator, mint is a signer, nobody else signs) → browser signs with the mint key, the wallet signs →
server simulates (dry run) or sends via Helius and confirms → the launch becomes the next brick and is pushed to every
client over Socket.IO.

Placement: brick #1 is the apex; row r holds r+1 bricks; each new brick lands in the bottom row, filling from the
center outward. Bricks are never removed — hidden ones show as sealed and keep their slot.

## Known limits (v1)

- Cost summary: pump.fun trade fee and rent are estimates (marked `*`).
- Market data comes from DexScreener; a brand-new pump.fun coin may show no mcap ("fresh") until DexScreener lists it.
  A coin with no pairs at all counts as below the dead threshold, so it cracks after 24h.
- The content filter is a deterministic word list (with leetspeak / spacing handling). Admin hide covers what it misses.
- One server process: rate limits and the brick index are in memory (fine for a single Replit VM).
