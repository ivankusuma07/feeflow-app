# @feeflow/keeper

Always-on worker on the VPS. Its wallet holds gas only: every call it makes is permissionless,
so it can never move user funds anywhere the contract would not send them anyway.

Each run (every `LOOP_INTERVAL_SECONDS`):

1. Reads the work list from the indexer (`/api/keeper/work`).
2. **Sweep:** for routed, not-graduated tokens, calls the Pons sweep operator's `sweepCurve`. The
   call is estimated first; Pons reverts below its own floor (`BelowFloor`) or for internal swaps
   (`InternalSwapRequiresOperator`), and those tokens are skipped and logged. There is no verified
   getter for unswept fees yet (`PONS_UNSWEPT_GETTER`), so `SWEEP_THRESHOLD_*` is reserved.
3. **Collect:** reads each sink's escrow balance on chain and calls `collectMany` for those at or
   above `COLLECT_THRESHOLD_*` (in batches of 20).
4. **Release:** for tokens whose oldest batch is past 30 days (block time), confirms with
   `expirable()` and calls `releaseExpired(token, MAX_RELEASE_BATCHES)`.
5. **Withdraw fees:** `withdrawFees(asset)` every `WITHDRAW_FEES_EVERY_DAYS` per asset.

Every transaction is estimated (which reverts like the real call) and checked against
`GAS_BUDGET_WEI_PER_RUN` before it is sent. Failed runs back off exponentially (up to 1 h).
State lives in memory and every action is re-checked on chain, so restarts are safe.

## Health

`GET 127.0.0.1:$HEALTH_PORT/health` → `{ address, lastRunAt, lastAttemptAt, consecutiveFailures,
lastSummary }`; 503 once the last successful run is older than three intervals plus 10 min. The
indexer reads it (`KEEPER_HEALTH_URL`) for the app's "Last keeper run" line and "delayed" flag.

## Logs

One JSON line per event on stdout: `start`, `run` (summary), `tx`, `skip` (with the revert
reason), `budget`, `error`, and `alert` (`low-balance` below `KEEPER_MIN_BALANCE_WEI`).

## Tests

- `pnpm --filter @feeflow/keeper test`: the decision rules.
- `pnpm --filter @feeflow/keeper test:anvil`: the keeper process against Anvil + DeployLocal +
  the real indexer; checks collect (and not below threshold), fee withdrawal, expiry release and
  the heartbeat in `/api/keeper/status`. Needs Foundry.
