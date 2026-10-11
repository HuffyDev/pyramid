# DiscordMoney — Launch a community coin. Get paid through Discord.

React 18 + TypeScript + Tailwind CSS + React Router, in Discord's colour palette.
Token: **Discord Pay ($DP)** · CA `CAV5LevZc5AonWsgRKEqjgEqXnptXFgudt52Mrxgpump` · X https://x.com/Payondiscord

## Run

```bash
npm install
npm run dev                                         # http://localhost:5173
npm ci --include=dev && npm run build && npm start  # production, http://localhost:5000
```

## Configure (copy `.env.example` → `.env`, or set in Replit Secrets)

- `VITE_API_BASE_URL` — your backend. Endpoints and data shapes: **[API.md](API.md)**.
  All server calls live in `src/lib/backend.ts`.
- `VITE_DISCORD_CLIENT_ID` — enables "Log in with Discord".

These are build-time variables: rebuild/republish after changing them. Without an API the site
shows empty states, and actions that need the server explain they aren't available yet.
Wallet connection (Phantom, Solflare, Backpack) works with no configuration.

## Publish (Replit)

`.replit` builds with `npm ci --include=dev && npm run build` and serves `dist/` with
`server.mjs` (zero-dependency static server with SPA fallback, `/healthz`).

## Checks

`npm run typecheck` · `npm test` · `node scripts/e2e.mjs <url> [withApi]` (browser smoke test; `scripts/mock-api.mjs` is a test-only stub API).

Not affiliated with Discord or pump.fun.
