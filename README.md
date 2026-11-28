# FeeFlow

FeeFlow routes the creator fees of Pons v2 tokens on Robinhood Chain (chain id 4663) to the X
account behind each launch, holds them in a non-custodial contract, and lets the account owner
claim with X login.

- Engineering plan: [docs/development-brief.md](docs/development-brief.md)
- Approved page designs: [docs/design/page-designs.html](docs/design/page-designs.html)
- **Every unfilled placeholder and open decision: [docs/placeholders.md](docs/placeholders.md)**
- Architecture decisions: [docs/adr](docs/adr)

## What the app does

| Page                    | What it's for                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `/`                     | Home: live cards for Explore, Payments, Leaderboard, Route and Docs                               |
| `/explore`              | Every routed token: search, newest or most paid per asset                                         |
| `/tokens/[address]`     | One token: fee buckets, open batches, history, Pons override warnings, collect, sweep and exits   |
| `/payments`             | Protocol totals and recent claims                                                                 |
| `/claim`                | X login, then claim everything credited to that account in one transaction                        |
| `/leaderboard`          | X accounts ranked by fees received, per asset                                                     |
| `/dashboard`            | A creator's routed tokens and activity                                                            |
| `/launch`               | Launch a Pons v2 token (image pinned on IPFS, optional initial buy), then hand it to `/route`     |
| `/route`                | Route an existing Pons token to an X account: sign, register, point Pons fees at the FeeFlow sink |
| `/docs`, `/disclosures` | How it works, trust assumptions, risks                                                            |

A launch can't name its own FeeFlow sink as the fee recipient: on Pons the token's address depends
on its recipient, and the sink's address depends on the token. So `/launch` launches with the
creator's wallet as recipient and `/route?token=…&handle=…` finishes the routing.

The Pons protocol owner can redirect any token's creator fees after a 3-day notice. FeeFlow can't
prevent it; it refuses to route a token with a pending override, shows pending and executed
overrides on the token page, and the keeper and reconcile job alert on them.

## Repository layout

```
apps/web          Next.js App Router: landing + app (Vercel)
services/api      attestation service, X API proxy, token image upload to IPFS (VPS)
services/keeper   always-on collector; alerts on Pons overrides (VPS)
services/indexer  Ponder indexer + REST API; reconcile job (VPS)
contracts/        Foundry: FeeFlow.sol, FeeSink.sol; Pons interfaces transcribed from verified source
packages/config   zod-validated env, chain definitions, addresses, protocol constants
packages/abi      generated ABIs
packages/sdk      typed helpers, EIP-712 types, error decoding
packages/ui       design tokens, primitives, logo assets
docs/             brief, designs, ADRs, placeholder register
```

## Getting started

Requires Node 22+ and pnpm 11 (`corepack enable`).

```sh
pnpm install
pnpm dev          # all apps in watch mode
pnpm build        # what CI gates on
pnpm lint && pnpm typecheck && pnpm test
```

Tests: `pnpm test` (unit), `pnpm --filter @feeflow/web e2e` (Playwright + axe), and with Foundry
installed `pnpm --filter @feeflow/web e2e:anvil` and `pnpm --filter @feeflow/indexer test:anvil`
(real transactions on a local chain). Fork tests run against mainnet state:
`FORK_RPC_URL=https://rpc.mainnet.chain.robinhood.com forge test --match-path "test/fork/*"`.

Copy `apps/web/.env.example` to `apps/web/.env.local`. With no contract address set, the app runs
in "Not deployed yet" mode. To see the app with synthetic data during development, set
`NEXT_PUBLIC_DATA_SOURCE=mock`; a production build refuses to start with that setting.
