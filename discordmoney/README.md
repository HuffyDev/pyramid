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
# or a production build:
npm run build && npm run preview   # http://localhost:4173
```

Checks: `npm run typecheck`, `npm test` (ledger + state-machine unit tests),
`npm run e2e <dir-with-coin.png-and-bad.txt>` (Playwright; needs `npm run preview` running).

Static hosting: serve `dist/` with an SPA fallback to `index.html` so deep links like
`/launches/dm-1a2b` reload correctly.

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
