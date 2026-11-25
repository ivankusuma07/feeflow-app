# FeeFlow

FeeFlow routes the creator fees of Pons v2 tokens on Robinhood Chain (chain id 4663) to the X
account behind each launch, holds them in a non-custodial contract, and lets the account owner
claim with X login.

- Engineering plan: [docs/development-brief.md](docs/development-brief.md)
- Approved page designs: [docs/design/page-designs.html](docs/design/page-designs.html)
- **Every unfilled placeholder and open decision: [docs/placeholders.md](docs/placeholders.md)**
- Architecture decisions: [docs/adr](docs/adr)

## Repository layout

```
apps/web          Next.js App Router: landing + app (Vercel)
services/api      attestation service + X API proxy (VPS)
services/keeper   always-on collector (VPS)
services/indexer  Ponder indexer + REST API (VPS)
contracts/        Foundry: FeeFlow.sol, FeeSink.sol
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

Copy `apps/web/.env.example` to `apps/web/.env.local`. With no contract address set, the app runs
in "Not deployed yet" mode. To see the app with synthetic data during development, set
`NEXT_PUBLIC_DATA_SOURCE=mock`; a production build refuses to start with that setting.
