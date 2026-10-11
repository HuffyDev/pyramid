# DiscordMoney backend API

The site talks to your server only through `src/lib/backend.ts`. Set `VITE_API_BASE_URL`
(build-time env var) to your API's base URL and implement these endpoints — or edit the
functions in `backend.ts` directly to call your own code.

All amounts are **integer lamports** (1 SOL = 1,000,000,000). Timestamps are **ms since epoch**.
Errors: any non-2xx with `{ "error": "message" }` — the message is shown to the user.

Request headers sent when available:
- `X-Wallet: <connected wallet address>` — verify ownership with a signed message on your side before trusting it.
- `Authorization: Bearer <discord access token>` — verify with `GET https://discord.com/api/users/@me`.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/snapshot` | — | `Snapshot` (everything the site renders) |
| POST | `/launches` | `LaunchInput` + `devWallet` | `Launch` |
| POST | `/claims/code` | `{ serverId }` | `{ code, expiresAt? }` |
| POST | `/claims/verify` | `{ serverId, wallet, code }` | `TreasuryClaim` |
| POST | `/claims/:serverId/wallet` | `{ wallet }` | `TreasuryClaim` |
| POST | `/offers` | `OfferInput` + `sponsorWallet` | `Offer` |
| POST | `/offers/:id/accept` | `{}` | `Offer` |
| POST | `/offers/:id/cancel` | `{}` | `Offer` |

Types are defined in `src/lib/types.ts` (`Snapshot`, `Launch`, `FeeEvent`, `Payout`, `Buyback`,
`TreasuryClaim`, `Offer`, `Notice`). Fee events must already be split: `platform = floor(gross / 10)`,
`recipient = gross - platform`. The site derives pending/paid totals and launch statuses from
`fees` and `payouts`, so every page stays consistent with your ledger.

Server-side jobs the site expects (not called from the browser): recording fee events, sending
payouts, $DP buybacks/burns, the Discord bot `/verify <code>` command, watching sponsored-post
messages (retention, refunds) — reflect their results in `/snapshot`.

## Discord login

Set `VITE_DISCORD_CLIENT_ID` and add `https://<your-domain>/auth/discord` as an OAuth2 redirect
URI in the Discord Developer Portal. Scopes used: `identify guilds`.

## Wallets

Phantom, Solflare and Backpack are detected in the browser automatically — no keys needed.
