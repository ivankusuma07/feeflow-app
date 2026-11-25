# FeeFlow — Development Brief

Nov 25, 2026 · @Ivan Kusuma Aulia

## Overview

FeeFlow routes the creator fees of Pons v2 tokens on Robinhood Chain (chain id 4663) to the X account behind each launch, holds them in a non-custodial contract, and lets the account owner claim with X login. This brief turns the approved product brief ("FeeFlow — Build Brief") into an engineering plan: architecture, repo, config, stage-by-stage tasks, and the fixes the product brief needs before code depends on it.

- **Source of truth for product decisions:** the build brief. Where this doc corrects it, the correction is listed in "Corrections and clarifications" and is already applied below.
- **Source of truth for Pons behaviour:** the official docs at docs.ponsfamily.com/v2 and verified explorer ABIs, never the brief's summary.
- **MVP scope:** landing page, app (dashboard, claim, route, token pages, payments, leaderboard), FeeFlow + FeeSink contracts, attestation service, keeper, indexer + API, X API client.
- **Out of scope:** staking, points, airdrops, yield, keeper swaps of ETH, any feature not in the build brief.
- **Fixed values:** token name FLOW, ticker $FLOW (its own creator fees go to a team wallet, not through FeeFlow), fee 100 bps (immutable), claim window 30 days per credited batch, ETH pairs pay ETH, both creator and handle owner can exit, no geo-block anywhere, Stock Token conversion is only a “Swap on a DEX” link after a successful claim (decided 25 Nov 2026).

Work runs in five stages. Stage 0 is new: a verification spike that proves a contract can act as a Pons creator fee recipient before anything else is built on that assumption.

## Architecture

&#91;embedded content: FeeFlow architecture · 11 components\]

Fees travel along the bottom: swept on Pons, pulled by the per-token sink, credited in FeeFlow, paid to the attested wallet. The off-chain services only trigger collection, index events and sign attestations; none of them can move balances.

## Repository layout and tooling

One pnpm + Turborepo monorepo, so the contract ABI, chain config and shared types are generated once and consumed by every service.

```
feeflow/
  apps/
    web/            Next.js App Router (landing + app, deployed on Vercel)
  services/
    api/            attestation service + X API proxy (VPS)
    keeper/         Node + viem, always-on (VPS)
    indexer/        Ponder (or viem log indexer) + Postgres, REST API
  contracts/        Foundry: FeeFlow.sol, FeeSink.sol, tests, scripts
  packages/
    config/         zod-validated env, chain definition, addresses per network
    abi/            generated ABIs (Foundry out + verified Pons/USDG ABIs)
    sdk/            typed read/write helpers, EIP-712 types, error decoding
    ui/             design tokens, shadcn components restyled, Logo SVG
  docs/             ADRs, runbooks, placeholder register
```

| Area | Choice | Note |
| --- | --- | --- |
| Package manager | pnpm workspaces + Turborepo | one `pnpm build` gates CI |
| Language | TypeScript strict everywhere | `noUncheckedIndexedAccess` on |
| Web | Next.js App Router, Tailwind, shadcn/ui, TanStack Query, framer-motion | light theme only |
| Chain | wagmi + viem, custom Robinhood Chain definition | 4663 mainnet, 46630 testnet |
| Auth | Privy (X login + embedded wallet + external wallets) behind `AuthProvider` | server verify with `@privy-io/server-auth` |
| Contracts | Solidity + Foundry, OpenZeppelin (Clones, SafeERC20, EIP712, ReentrancyGuard) | non-upgradeable |
| Indexer | Ponder on Postgres | swap for custom viem indexer only if Ponder lacks chain support |
| ABI codegen | `wagmi cli` (foundry + etherscan-style plugins) | no hand-written selectors |
| Quality | ESLint, Prettier, `forge fmt`, Slither, Lighthouse CI | all in CI |

## Configuration and placeholders

Every external value lives in `packages/config`, validated by zod at boot. A missing contract address puts the UI in "Not deployed yet" mode; it never falls back to sample data. Secrets (attester key, X bearer, Privy secret) live only in the host's secret store or KMS.

| Placeholder | Used by | Status |
| --- | --- | --- |
| `CHAIN_ID` | all | 4663 (testnet 46630), re-verify |
| `RPC_URL`, `EXPLORER_URL` | all | open |
| `PONS_FACTORY_ADDRESS` | contracts, indexer, web | `0x7eD5…EC7e`, re-verify |
| `PONS_ESCROW_ADDRESS` | contracts, indexer | `0xd3AF…Ac9e`, resolve per token |
| `USDG_ADDRESS` | contracts, web | `0x5fc5…d168`, re-verify with Paxos docs |
| `PONS_RECIPIENT_GETTER` | sdk, contracts | name to confirm from ABI |
| `CONTRACT_ADDRESS`, `SINK_IMPLEMENTATION_ADDRESS` | all | after deploy |
| `FEEFLOW_FEE_RECIPIENT` | contracts | open, multisig recommended, immutable |
| `ADMIN_MULTISIG` | contracts | open |
| `ATTESTER_ADDRESS`, `ATTESTER_KEY` | contracts, attestation | open, key in KMS |
| `ATTESTER_TIMELOCK` | contracts | open, suggest 48 h |
| `PRIVY_APP_ID`, `PRIVY_APP_SECRET` | web, attestation | open |
| `X_API_BEARER` | web API, indexer | open; tier = pay-per-use credits |
| `KEEPER_ADDRESS`, `KEEPER_HOST` | keeper | open |
| `COLLECT_THRESHOLD`, `SWEEP_THRESHOLD`, `KEEPER_STALE_AFTER` | keeper, web | open, set after fork test gas numbers |
| `INDEXER_URL`, `CONFIRMATIONS` | indexer, web | open |
| DEX\_SWAP\_URL | web claim success screen | Uniswap web app swap page (decided 25 Nov 2026), Robinhood Chain and the claimed asset pre-selected; copy the exact URL from app.uniswap.org, do not guess the chain slug |
| `X_URL`, `DOCS_URL`, `TELEGRAM_URL`, `TOS_URL`, `PRIVACY_URL`, `DOMAIN`, `AUDIT_STATUS` | web | open |

PONS\_RECIPIENT\_GETTER, ATTESTER\_TIMELOCK, the keeper thresholds, CONFIRMATIONS, QUOTE\_TTL, SWAP\_DEADLINE and TOS\_VERSION were used in the build brief but missing from its placeholder list; they are added here. `docs/placeholders.md` is the living register and the README links to it.

## Design references

The supplied logo replaces the build brief's “redraw option #1” spec, and the bento mockup is the layout reference. Both conflict with the brief in places, listed below.

**Logo**

- Final mark: a capital F made of three wave bars with pointed tips. The stem rises from a square-cut leg, and the bottom bar curves down into it. Supplied as a raster with a transparent background; traced to SVG.
- Assets for `packages/ui/assets`: `feeflow-mark-neon.svg` (Robin Neon `#CCFF00`), `feeflow-mark-black.svg`, `feeflow-app-icon.svg` (neon mark on a black circle), `feeflow-app-icon-neon.svg` (black mark on a neon circle), `favicon-32.png`, `apple-touch-icon.png`. The mark reads at 24 px; use the app icon below that.
- Wordmark: “FeeFlow” in Geist semibold `#1C1C1C`, mark to the left, vertically centred.
- Logo colour (decided 25 Nov 2026): Robin Neon `#CCFF00`, the colour named in Robinhood Chain's brand guidelines. Neon on `#F7F6F2` is about 1.1 : 1 contrast, so on the light theme the mark reads faintly there; even so, the navbar and footer use the bare neon mark with no circle (decided 25 Nov 2026). The black-circle app icon is for the favicon and app icon only. Neon is also the UI accent; see "Neon on the light theme" below. The guidelines forbid using Robinhood Chain's brand identity in token artwork or iconography, so the `$FLOW` token image should be the black mark on white, not neon.

**Neon on the light theme** (decided 25 Nov 2026: neon accent, light theme kept)

- Accent `#CCFF00` replaces olive `#4F6F52` everywhere. Black on neon is about 18 : 1, neon on the page background about 1.1 : 1, so neon is used only as a fill, never as text or an icon on a light surface.
- Primary button: neon fill, black `#000000` text, hover `#B8E600`. Secondary button: white with 1 px `#1C1C1C` border.
- Active nav item and selected filter chips: neon pill with black text.
- Progress and leaderboard bars: neon fill with a 1 px `#1C1C1C` outline on an `#E4E2DC` track, so the bar meets 3 : 1.
- LIVE dot: neon with a 1 px black ring.
- Focus rings: 2 px `#1C1C1C`, offset 2 px. Text links: `#1C1C1C`, underlined.
- Logo: the bare neon mark (no circle), about 30 px tall, in the navbar and footer; the neon-on-black app icon only as favicon and app icon.
- Errors and warnings stay muted amber and red; neon never signals status.

**Bento mockup: what to take**

- Navbar: logo left, links centred, actions right (X icon, Connect wallet, Open app), white, 64 px, 1 px bottom line, sticky on scroll
- Centred hero with one filled neon button (black text) and one outlined button
- Grid: 7/5 row (card grid + ranked list), then 4/4/4 row (metric card with thin bar, activity feed, 3-step icon explainer)
- Card style: white, 1 px `#E4E2DC` border, 12–16 px radius, no shadow; ranked rows with rank, avatar, handle, mono number, thin outlined neon bar; small neon LIVE dot

**Bento mockup: what to ignore**

| Mockup shows | Why it is out | Use instead |
| --- | --- | --- |
| “Token fees, shared with the community.” and the pooled, top-of-leaderboard, $100K market cap subline | Different product (reward pool), not FeeFlow | Locked headline and subline from the build brief |
| Nav: Home, Explore, Claim, Analytics, Launch, search box | FeeFlow does not launch tokens; no real search exists | Dashboard · Leaderboard · Payments · Docs, plus Open app or Log in with X / Connect wallet |
| “Check a handle” and “Launch” hero buttons | Not features in the brief | Open app, plus a “See every payment” text link |
| Explore cards with meme images, market cap and fees | No market-cap talk; token images only from Pons metadata | Linked tokens or top fee-earning tokens, monogram fallback |
| Reward pool card with market-cap progress bar | No such feature | Claimable (dashboard) or Total fees paid (payments) |
| Rank-change arrows (+2, −1) | Not in the brief | Optional; add only if Fabio wants it, computed from the period filter |
| Placeholder handles, numbers, photo avatar | Fake data | “—” until live; real X avatars only |

**Page designs** ([FeeFlow — Page Designs](https://claude.ai/artifact/Gt1B7UbAV1Zk2tYRWw3aoq), approved 25 Nov 2026)

Stages 1 and 2 build from these designs: Landing, Dashboard, Claim, Claim success, Token, Route, Payments, Leaderboard, Docs. There is no Explore page; the Payments page's "All routed tokens" table covers browsing.

- Navbar on every page: sticky, bare neon logo, centred links with a neon pill on the current page, X icon button (links to `X_URL`), then Connect wallet + Open app when logged out, or the X account chip + wallet address chip when connected.
- Feature cards on the landing page carry 20 px line icons (stroke 1.75, `#1C1C1C`) in a 40 px rounded tile. Use lucide equivalents: user, log-in, shield-check, receipt, clock, coins, arrow-left-right, percent.
- Leaderboard ranks USDG and ETH separately (asset toggle beside the 7d / 30d / all-time filter), so no prices are mixed. This is an addition to the build brief.
- App pages in the designs show synthetic data under a black "SAMPLE DATA — design only" bar. In code that bar is the dev-only mock banner; production never shows it.
- The Docs disclosures add one line: holding FLOW entitles you to nothing from FeeFlow's fees.

**Illustrations** (Magnific, soft clay style, neon coins on `#F7F6F2`, 4:3; source PNGs are 2048 × 1536 in Ivan's Magnific history; ship as WebP about 1400 px wide)

| Asset | Used on |
| --- | --- |
| `step1-launch` (rocket on a launch pad) | Landing · How it works, step 1 |
| `step2-route` (pipe rerouting coins to a profile) | Landing step 2; Route page "What happens next" card |
| `step3-collect` (robot arm moving coins into a vault) | Landing step 3 |
| `step4-claim` (coins dropping into a wallet) | Landing step 4 |
| `success` (wallet full of coins with a check mark) | Claim success screen |
| `empty` (empty tray with a sleepy coin) | Empty states: landing "Top fee-earning tokens" before deploy, dashboard with no linked tokens |

No hero illustration: the landing hero is text and buttons only. Illustrations sit on the page background with `mix-blend-mode: multiply` so their off-white matches; step images fill the top of their card at 4:3.

## Corrections and clarifications to the build brief

These gaps would cause wrong code if built literally. All ten are applied in the stage plans below.

| # | Build brief says | Problem | Proposed resolution |
| --- | --- | --- | --- |
| 1 | 4.4 step 6: `claim(xUserId, tokens, to, expiry, signature)` | 4.10 adds `nonce`; without it the replay rule cannot hold | One signature everywhere: `claim(xUserId, tokens, to, expiry, nonce, attestation)` |
| 2 | 4.10 `exitByHandle(token, newRecipient, expiry, nonce, attestation)` | Attestation must bind the token's `xUserId` and the action | EIP-712 type `Exit{xUserId, token, newRecipient, nonce, expiry}`; contract reads `xUserId` from storage and checks it matches |
| 3 | Fuzz "fee bps" | `FEE_BPS` is a constant | Fuzz `gross` and token counts only |
| 4 | 30-day expiry goes to the registering creator | A creator can bind an X account that never claims and collect everything after 30 days | Keep the rule (decided), but show "claims in last 30 days" and "expired to creator" per token, and flag tokens where the handle has never logged in |
| 5 | Claim attests `{xUserId, to, tokens[], nonce, expiry}` | Token list in the signature adds nothing (contract checks binding) and bloats it | Sign `{xUserId, to, nonce, expiry}`; contract skips tokens not bound to `xUserId` |
| 6 | Registration requires attestation that `xUserId` is valid | Attester is trusted for validity, not ownership, at this step | Keep; document that registration attests only that the id exists |
| 7 | `exitBy*` calls `collect` first | Collect reverts if escrow claim reverts (e.g. USDG paused), blocking exit | Wrap collect in try/catch inside exit; exit must never be blocked by a frozen asset |
| 8 | Expired batches still claimable until released | Fine, but `credited` vs `expirable` reads must agree in UI | `expirable(token)` returns sum of batches past window; UI shows both |
| 9 | X avatars from X API for all accounts | Pay-per-use cost; redundant for logged-in users | Privy `profilePictureUrl` for anyone who logs in; X API only for handle→id at `/route` and never-logged-in accounts, cached, spend limit set |
| 10 | FIFO batch queue per token | Unbounded loop in `releaseExpired` if many tiny batches | `releaseExpired(token, maxBatches)`; keeper `collect` only above threshold to keep batches few |

## Stage 0 — verification spike

Goal: prove, on a mainnet fork, that a contract can be a Pons creator fee recipient end to end. If it cannot, the per-token sink design changes and Stages 1–2 copy changes with it. Timebox: 3–4 days.

1. Pull verified ABIs for the Pons factory, curve, hook and escrow, and for USDG, from the explorer and the official docs; commit them to `packages/abi` with source links.
2. Confirm against source: the current-recipient getter name, `transferCreatorFeeRecipient` access rule, escrow `claim` / `claimToken` / `balanceOf` / `balanceOfToken`, sweep functions and their caller rules, every event's argument list, `getLaunchFeePolicy` fields, `canLaunch`.
3. Confirm whether Pons v2 is deployed on testnet 46630; if not, all integration tests run on a 4663 fork.
4. Write a throwaway `ProbeSink` that can receive ETH, call escrow `claim()` / `claimToken(asset)`, call the curve sweep, and call `transferCreatorFeeRecipient`.
5. Fork test, ETH pair and USDG pair: launch or pick a token → point recipient at the probe → simulate trades → sweep → claim into the probe → transfer recipient away. Record gas per step.
6. Check sweep from a non-creator, non-operator contract and from the creator-set sink; note when `InternalSwapRequiresOperator` fires.
7. Read USDG freeze/pause function names from Paxos docs and confirm how a paused transfer reverts.
8. Write ADR-001 "Contract as creator fee recipient" with results, gas numbers and any design change.

**Exit criteria:** both pair types pass steps 5–6 on a fork, or a written design change is approved.

## Stage 1 — landing page

Goal: ship `/` and the shared UI foundation. Can run in parallel with Stage 0, because it reads no contract.

- [ ] Scaffold monorepo, CI (lint, typecheck, build), `packages/config` with zod env and the Robinhood Chain viem definition
- [ ] Design tokens in Tailwind: `bg #F7F6F2`, `surface #FFFFFF`, `text #1C1C1C`, muted at AA, `accent #CCFF00 (fill only, black text on it)`, `line #E4E2DC`; Geist + Geist Mono; radius 12–16 cards, 8 buttons
- [ ] Restyle shadcn primitives (Button, Card, Dialog, Table, Tabs, Toast) to the tokens; no default shadcn look
- [ ] Logo: bare neon mark in navbar and footer; neon-on-black app icon for the favicon
- [ ] Navbar (logo, Dashboard · Leaderboard · Payments · Docs, X icon, Connect wallet, Open app), sticky on scroll; mobile menu
- [ ] Sections in order: hero (locked headline + subline verbatim), How it works, What you get, Where the fees come from, Live stats, Roadmap, FAQ, Disclosures, Footer
- [ ] Live stats: `StatCard` shows “—” and “Live data appears after the FeeFlow contract is deployed.” until `CONTRACT_ADDRESS` and `INDEXER_URL` are set
- [ ] Copy from the build brief sections 3.2–3.10 only; no new claims
- [ ] `/disclosures` full page; `/terms`, `/privacy` placeholders with the required Terms note
- [ ] Lighthouse CI on mobile: Perf ≥ 90, A11y ≥ 95, BP ≥ 95, SEO ≥ 90; usable at 375 px

**Exit criteria:** landing deployed to a preview URL, Lighthouse thresholds pass in CI, Fabio approves the copy.

## Stage 2 — web app

Goal: every app route working against a typed `DataSource`, with the dev-only mock adapter, all wallet and transaction states, and Privy auth. Contract writes are wired to the generated ABI but stay disabled until Stage 3 deploys to testnet.

**Foundations**

- [ ] `AuthProvider` interface over Privy: `login()`, `logout()`, `xAccount {userId, username, name, avatarUrl}`, `getIdentityToken()`, wallet list; external wallets via Privy connectors
- [ ] `NetworkGuard`, `TxButton` (idle → confirm in wallet → pending with explorer link → success / decoded error, double-submit blocked), `TxToast`, `Address`, `Amount`, `Avatar`, `EmptyState`, `ErrorState`, `StatCard`
- [ ] Error decoder: custom errors from FeeFlow and Pons ABIs, user-rejected, insufficient gas, attestation expired, nothing to claim
- [ ] `DataSource` interface (`getTotals`, `getRecentClaims`, `getTopTokens`, `getLeaderboard`, `getAccount`, `getToken`) with `mock` and `indexer` adapters; build fails if `NEXT_PUBLIC_DATA_SOURCE=mock` and `NODE_ENV=production`; mock banner “MOCK DATA — DEV ONLY”

**Routes**

| Route | Key work | Writes |
| --- | --- | --- |
| `/dashboard` | Bento 7/5 + 4/4/4: Linked tokens, Claimable, Fees received (gross · 1% fee · net), Recent activity, How claiming works | none |
| `/claim` | Token list with filters, destination wallet, per-token summary + “Claim by …” oldest expiry, attestation fetch | `claim` |
| `/route` | Recipient check, X handle → user id lookup with avatar confirm, creator EIP-712 sign, register, then Pons transfer with future-fees warning | `registerToken`, Pons `transferCreatorFeeRecipient` |
| `/tokens/[address]` | Three buckets (unswept, in escrow, credited), batches with expiry, history, pending takeover, exit-rights note, “Not routed” state | sweep, `collect`, `releaseExpired`, `exitByHandle`, `exitByCreator` |
| `/payments` | TotalsRow (6 figures), Recent claims, Top tokens table, keeper status, disclosures note | none |
| `/leaderboard` | Ranked X accounts, 7d / 30d / all, layout animation off under reduced motion | none |
| Claim success (no /convert page) | Amounts and tx link, then a “Swap on Uniswap” link to DEX\_SWAP\_URL (opens in a new tab) with one line under it: “Stock Tokens aren't available in some countries.” No geo-block, no eligibility check, no in-app swap. | none |
| `/docs`, `/disclosures`, `/terms`, `/privacy` | Trust assumptions, contract addresses, FAQ | none |

**Avatars:** use Privy's `profilePictureUrl` (swap `_normal` for `_400x400`) for logged-in accounts, stored on login; the VPS API's `/x/users` endpoint for handle lookups and never-logged-in ids, cached in Postgres 24 h, initials fallback.

**Exit criteria:** all routes pass with mock data, every write path shows all states against a local Anvil deployment, a11y checks pass on each route.

## Stage 3 — contracts

Goal: `FeeFlow` plus one EIP-1167 `FeeSink` clone per routed token, non-upgradeable, with the build brief's section 4.10 spec and the corrections above. No admin path to balances, no fee setter.

**FeeSink** (deployed by CREATE2, salt = token address, so the sink address is known before launch)

- `initialize(feeflow, token, pairAsset)` once; every other function `onlyFeeFlow`
- `pull()` → escrow `claim()` or `claimToken(pairAsset)`, forward the full balance to FeeFlow
- `sweep(...)` passthrough to curve or hook, for collect-from-UI
- `transferRecipient(newRecipient)` → Pons `transferCreatorFeeRecipient(token, newRecipient)`
- `receive()` accepts ETH only from the escrow

**FeeFlow**

| Function | Caller | Key checks |
| --- | --- | --- |
| `registerToken(token, xUserId, creatorSig, attestation)` | anyone | Pons-launched; `creatorSig` signer = current recipient → stored `creator`; attester sig over `xUserId`; not registered; registration not paused |
| `collect(token)` / `collectMany(tokens)` | anyone | balance delta `gross`; `fee = gross * 100 / 10_000`; push batch `{net, now}` if net > 0 |
| `claim(xUserId, tokens, to, expiry, nonce, attestation)` | anyone holding a valid attestation | EIP-712 `Claim{xUserId, to, nonce, expiry}`; nonce unused; skip tokens not bound; CEI + nonReentrant |
| `exitByHandle(token, newRecipient, expiry, nonce, attestation)` | handle owner | `Exit{xUserId, token, newRecipient, nonce, expiry}`; try collect; sink transfers recipient; mark exited |
| `exitByCreator(token, newRecipient)` | stored `creator` | same flow, role = CREATOR |
| `releaseExpired(token, maxBatches)` | anyone | pop head batches with `creditedAt + 30 days <= now`; pay `creator` only |
| `withdrawFees(asset)` | anyone | pay `accruedFees[asset]` to immutable `FEE_RECIPIENT` |
| `queueAttester` / `executeAttester` / `setRegistrationPaused` | `ADMIN_MULTISIG` | timelock on attester; nothing else |

**Events:** `TokenRegistered`, `Collected`, `Claimed`, `Exited`, `Expired`, `FeesWithdrawn`, `AttesterQueued`, `AttesterUpdated`, `RegistrationPaused`. Each carries enough for the indexer to rebuild totals without extra reads.

**Tests (Foundry):** the build brief's unit, fuzz and invariant list, plus: exit still succeeds when collect reverts (paused USDG); `releaseExpired` with 500 batches and `maxBatches` bound; EIP-712 domain mismatch (chain id, contract); ABI has no setter for fee, window, recipient or bindings. Fork suite from Stage 0 becomes the mandatory pre-mainnet gate.

**Deployment:** testnet (or fork) first, then mainnet via a Foundry script reviewed by two people; verify source on the explorer; publish addresses in `packages/config` and `/docs`. External audit before mainnet is recommended; `AUDIT_STATUS` stays honest either way.

**Exit criteria:** `forge test` green including invariants and fork suite; Slither clean or triaged; deployment script dry-run on fork.

## Stage 4 — backend services

Goal: real data end to end. Mock adapter removed from every production path.

**Attestation service** (`services/api` on the VPS, so the Vercel app never holds a signing credential)

- `POST /api/attest/register` — verifies the X user id exists (X API), returns `Register{token, xUserId, nonce, expiry}` signed by the attester
- `POST /api/attest/claim` and `/api/attest/exit` — verifies the Privy identity token server-side, reads the linked X `subject`, never trusts a client-sent id; signs with expiry ≤ 10 min
- Key in KMS (AWS KMS or GCP KMS secp256k1), signing through the KMS API; rate limit per X id and IP; structured audit log of every signature

**Keeper** (`services/keeper`)

- Loop per routed token: read unswept + escrow → sweep if ≥ `SWEEP_THRESHOLD` and allowed (skip and log `InternalSwapRequiresOperator`) → `collectMany` for tokens with escrow ≥ `COLLECT_THRESHOLD`
- Optional: call `releaseExpired` for tokens with expired batches, and `withdrawFees` weekly
- Gas budget per run, exponential backoff, idempotent; `/health` and heartbeat written to the indexer DB for the “Last keeper run” line and the stale banner

**Indexer + API** (`services/indexer`, Ponder on Postgres)

- Sources: Pons factory events, escrow events filtered to sink addresses, all FeeFlow events; backfill from FeeFlow deploy block (and Pons factory start for `TokenLaunched` lookups)
- Periodic snapshot of unswept reads per routed token for “accrued, not yet sent”
- Endpoints: `/api/totals`, `/api/claims/recent`, `/api/tokens/top`, `/api/tokens/:address`, `/api/accounts/:xUserId`, `/api/leaderboard?period=`, `/api/keeper/status`; every record carries tx hash and block number
- Reorg handling at `CONFIRMATIONS`; a reconciliation job compares indexed totals with `totals(asset)` on chain and alerts on drift

**X API client**

- Pay-per-use credits with a monthly spend limit set in the console
- `GET /2/users/by/username/:username` for `/route`; batched `GET /2/users?ids=` (≤ 100 per call) for refresh; refresh weekly or on broken image, not daily for everyone
- User id is the primary key; handles and avatars are cached display data

**Exit criteria:** testnet or fork deployment with keeper and indexer running 72 h without manual intervention; reconciliation shows zero drift; app on `indexer` adapter passes all acceptance criteria.

## Hosting and ownership

The frontend runs on Vercel and every other service on one VPS; Ivan builds the contracts as well as the app (decided 25 Nov 2026). The Vercel app talks only to the VPS API and the chain RPC: it holds no database credentials and no signing keys, because Vercel functions have changing IPs and Postgres should never be public.

| Component | Where | Notes |
| --- | --- | --- |
| Web app (Next.js) | Vercel | Env vars are public config only; production build fails if the mock data source is selected |
| API: attestation, X API proxy, indexer REST | VPS | Behind Caddy with TLS at an `api.` subdomain; CORS limited to the Vercel domain; rate limits per IP and X id |
| Indexer (Ponder) | VPS | Backfills from the FeeFlow deploy block; reorg depth `CONFIRMATIONS` |
| Postgres | VPS | Not exposed to the internet; nightly `pg_dump` copied off the server |
| Keeper | VPS | Hot wallet holds gas only; alert when its ETH balance runs low |
| Attester key | KMS, called from the VPS | Never on disk. If KMS is not ready at launch: encrypted keystore, short attestation expiry, move to KMS before volume grows |
| RPC | Paid provider + fallback | Keeper and indexer fail over automatically |

- Run all VPS services with Docker Compose and restart policies; uptime checks on each `/health` endpoint.
- Starting size: 4 vCPU, 8 GB RAM, 160 GB SSD; grow the disk with the indexer.
- Contracts: Ivan writes and tests them (Stage 3). Plan extra time for the fork and invariant suites, and get an outside review before mainnet.

## Testing, CI and definition of done

A stage is done when its exit criteria pass in CI and the build brief's section 6 items for that stage are ticked.

| Layer | Tooling | Runs on |
| --- | --- | --- |
| Contracts | `forge test` unit, fuzz (10k runs), invariant (depth 50), fork suite | every PR; fork suite nightly + before deploy |
| Static analysis | Slither, `forge fmt --check` | every PR |
| Web unit | Vitest + Testing Library for `TxButton` states, `DataSource` adapters, error decoder | every PR |
| Web e2e | Playwright against Anvil with deployed contracts and mock Privy | every PR touching `apps/web` |
| Accessibility + perf | axe in Playwright, Lighthouse CI on `/` (mobile) | every PR |
| Services | Vitest for keeper decisions and indexer handlers; Ponder against an Anvil fork | every PR |
| Production guard | build fails if mock data source is selected with `NODE_ENV=production` | every build |

Release gate for mainnet:

- [ ] Fork suite green on a block from the last 24 h
- [ ] Pons addresses, ABIs and events re-verified against docs on deploy day
- [ ] `FEEFLOW_FEE_RECIPIENT` and `ADMIN_MULTISIG` confirmed by Fabio in writing (immutable)
- [ ] Contracts verified on the explorer; addresses published in `/docs`
- [ ] Keeper funded, indexer backfilled, reconciliation at zero drift
- [ ] Disclosures, Terms note and `AUDIT_STATUS` reviewed
- [ ] README lists every unfilled placeholder and open decision

## Risks and open decisions

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Contract-as-recipient fails on Pons | Core design breaks | Stage 0 spike before any contract work |
| Pons deploys a new stack or changes ABIs (unaudited) | Integration breaks; old tokens keep old escrow | Resolve escrow per token; pin ABIs with source links; re-verify on deploy day |
| Attester key compromise | Claims authorised for any handle | KMS, short expiry, nonces, timelocked rotation, public claims, alerting on unusual claim volume |
| Creator abuse via expiry or exit | Handle owner loses future or unclaimed fees | Disclosed; per-token history and “handle never logged in” flag |
| USDG freeze/pause on FeeFlow | USDG stuck | Disclosed; exits not blocked; per-asset accounting isolates ETH |
| Many tiny batches | `releaseExpired` gas | `maxBatches` bound; keeper collect thresholds |
| Pons operator-only sweeps | Pending fees wait on Pons | Shown as pending with explanation |
| X API cost or terms change | Avatars missing | Privy avatars first, cache, initials fallback, spend limit |
| Stock Tokens are restricted in the US, Canada, UK, Switzerland and other regions | Users in those regions follow the DEX link | FeeFlow only links out; no swap UI; one-line availability note on the link |

**Open decisions for Fabio**

- [ ] Confirm the $FLOW token image colour
- [ ] `FEEFLOW_FEE_RECIPIENT` and `ADMIN_MULTISIG` addresses
- [ ] `ATTESTER_TIMELOCK` length (proposal: 48 h)
- [ ] Copy the exact Uniswap Robinhood Chain swap URL into DEX\_SWAP\_URL
- [ ] Audit before mainnet: yes / no, and which firm
- [ ] Domain
