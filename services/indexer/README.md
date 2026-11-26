# @feeflow/indexer

Ponder 0.18 on Postgres. Indexes every FeeFlow event, snapshots each routed token's Pons escrow
balance, and serves the REST API the web app reads (`apps/web/src/data/indexer.ts`).

| Endpoint                                     | Response (`@feeflow/sdk`) |
| -------------------------------------------- | ------------------------- |
| `GET /api/totals`                            | `Totals`                  |
| `GET /api/claims/recent?limit=`              | `ClaimRecord[]`           |
| `GET /api/tokens/top?limit=`                 | `TokenSummary[]`          |
| `GET /api/tokens/:address`                   | `TokenDetail` (404)       |
| `GET /api/accounts/:xUserId`                 | `AccountView` (404)       |
| `GET /api/leaderboard?period=&asset=&limit=` | `LeaderboardEntry[]`      |
| `GET /api/keeper/status`                     | `KeeperStatus`            |

Ponder also serves `/health`, `/ready` and `/status`.

## Run

```sh
cp .env.example .env.local      # gitignored; fill in RPC_URL, CONTRACT_ADDRESS, ...
pnpm --filter @feeflow/indexer dev
```

Without `DATABASE_URL` it uses embedded PGlite in `.ponder/` (development only; production refuses
to start without Postgres). Production: `ponder start --schema "$DATABASE_SCHEMA"` behind Caddy.

## Tests

- `pnpm --filter @feeflow/indexer test`: the row → response mapping, query parsing, X lookups.
- `pnpm --filter @feeflow/indexer test:anvil`: Anvil + DeployLocal + `ponder start`; drives route,
  collect, claim, expiry and exit on chain, checks every endpoint and reconciles with
  `totals(asset)`. Needs Foundry.

## Reconciliation

`pnpm --filter @feeflow/indexer reconcile` (cron on the VPS) reads `/api/totals` while the indexer
stays on one block, compares each asset with `FeeFlow.totals(asset)` at that block, and exits 1
with one JSON line per drifting field.

## Known gaps

- `unswept` is `null`: no verified Pons view for fees still on a curve or hook
  (`docs/placeholders.md`, `PONS_UNSWEPT_GETTER`). `accrued` is the escrow balance only.
- `imageUrl` is `null` until the Pons token image source is confirmed.
- `/api/keeper/status` reports no runs until the keeper writes its heartbeat.
- `hasLoggedIn` is set once an account claims or exits by handle, the only on-chain proof of login.
