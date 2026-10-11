# DiscordMoney — "Launch a community coin. Get paid through Discord."

Interactive frontend prototype of a Discord-flavoured community-coin launchpad.
React 18 + TypeScript + Tailwind CSS + React Router. **Everything — wallets, Discord
auth, launches, fees, payouts, claims, sponsored-post escrow — is simulated in the
browser and persisted to `localStorage`.** No backend, keys, signatures or payments.

$DCM contract address: `CAV5LevZc5AonWsgRKEqjgEqXnptXFgudt52Mrxgpump` · X: https://x.com/Payondiscord
(Buyback/burn figures shown in the app come from the local demo ledger, not on-chain data.)

## Run

```bash
cd discordmoney
npm install
npm run dev        # http://localhost:5173
# production build + server (what Replit publishing runs):
npm ci --include=dev && npm run build && npm start   # http://localhost:5000 ($PORT)
```

Publishing on Replit is configured in the repo-root `.replit`: it builds from this folder
(`npm ci --include=dev && npm run build` → `dist/`) and serves with `server.mjs`, a
zero-dependency Node static server with SPA fallback (deep links like `/launches/dm-1a2b`
work on reload), long-cache headers for hashed assets and a `/healthz` endpoint.

Checks: `npm run typecheck`, `npm test` (ledger + state-machine unit tests),
`npm run e2e <dir-with-coin.png-and-bad.txt>` (Playwright; needs the app served on port 4173,
e.g. `PORT=4173 npm start`).

## Routes

`/` Launch · `/launches` · `/launches/:id` · `/dashboard` · `/offers` (Posts) · `/claim` · anything else → 404.

## Where things live

- `src/lib/ledger.ts` — single source of truth for all money maths (integer lamports,
  `platform = floor(gross/10)`, recipient = remainder, pending = earned − paid, status rules,
  offer state machine view).
- `src/lib/actions.ts` — every state change (payout-once guards, claim permission checks,
  offer accept/submit/remove/pay/refund, demo clock).
- `src/lib/seed.ts` — deterministic sample data: 18 launches, 6 servers, 8 users, 11 offers,
  buybacks, claimed + unclaimed treasuries.
- `src/lib/store.ts` — versioned `localStorage` persistence, corrupt-data recovery, reset.

Independent prototype. Not affiliated with Discord or pump.fun.
