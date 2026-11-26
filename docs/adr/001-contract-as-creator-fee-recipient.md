# ADR-001: Contract as Pons creator fee recipient

- Status: **Accepted**, from the Stage 0 fork spike on 25 Nov 2026. A few open items remain (below).
- Date: 25 Nov 2026

## Context

FeeFlow needs a contract, not a wallet, to receive each routed token's Pons v2 creator fees. The
brief requires proof on a mainnet fork that this works end to end before Stages 1–2 depend on it.

## Decision

1. One `FeeSink` EIP-1167 clone per token, CREATE2 salt = token address, created by `FeeFlow` at
   registration. The sink is the Pons creator fee recipient and the only caller of the escrow for its balance.
2. `FeeFlow` supports only the active Pons v2 stack (factory and escrow are immutables). Tokens
   from other stacks are rejected because `getLaunchedToken(..).exists` is false for them.
3. Native-ETH pairs are identified by `pairToken == address(0)` (confirmed).
4. Sweeps are not proxied by the sink. Anyone (the keeper, or a user from the token page) calls
   the public sweep operator's `sweepCurve(curve)` / `sweepPool(poolId)` directly.
5. **Any pair asset Pons allows is accepted** (decided 26 Nov 2026): native ETH, USDG, and any
   other ERC-20, such as the Robinhood stock tokens. `registerToken` stores the `pairToken` Pons reports.
   Accounting is per asset and uses the balance delta, so a token that takes a transfer fee credits only
   what arrived. Amounts in different assets are never summed. The app identifies assets by address;
   symbols of other ERC-20s are untrusted display data (`displaySymbol` in `packages/sdk`).

## Evidence (Robinhood Chain 4663 fork, public RPC, blocks ~123,084,000–123,086,000)

Suite: `contracts/test/fork/PonsFork.t.sol`. It runs only with `FORK_RPC_URL` set:

```
FORK_RPC_URL=https://rpc.mainnet.chain.robinhood.com forge test --match-path "test/fork/*" -vv
```

All 6 tests pass against the live factory, escrow, curves and sweep operator:

| Test                                                        | What it proves                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test_fork_interfacesDecode`                                | `getLaunchedToken` decodes with the `IPons.sol` struct; the USDG pair reports USDG, the ETH pair reports `address(0)`; unknown tokens return `exists = false`; `getLaunchFeePolicy` decodes                                                                               |
| `test_fork_transferRequiresCurrentRecipient`                | A non-recipient gets `NotCreatorFeeRecipient()` (`0xb9f93944`)                                                                                                                                                                                                            |
| `test_fork_usdgPair_endToEnd`                               | Recipient → creator → register → creator moves the recipient to the sink → real 3,000 USDG buy → operator sweep credits 11.65 USDG to the sink in the escrow → `collect` pulls all of it, takes 1% → `claim` pays the net → `exitByCreator` moves the Pons recipient away |
| `test_fork_ethPair_endToEnd`                                | Same flow on a native-ETH pair (0.5 ETH buy → ~0.015 ETH credited)                                                                                                                                                                                                        |
| `test_fork_otherErc20Pair_gme_endToEnd`, `..._ant_endToEnd` | Same flow on tokens paired with the GME and ANT stock tokens (18 decimals); payouts to an arbitrary wallet are not blocked by any transfer restriction                                                                                                                    |

### How the ABIs were verified

The explorers' verified-source APIs (robin.etherscan.io, robinhoodchain.blockscout.com) sit behind a
bot check, and the Etherscan v2 API needs a key. Instead:

- **Selectors:** each function FeeFlow calls has its 4-byte selector in the deployed dispatcher.
  None of the three contracts is an ERC-1967 proxy, so the code checked is the code that runs.
- **Live decoding:** return values decode with sensible data, e.g. graduation thresholds of 4.2e18
  for the ETH pair and 7,225.722 USDG (6 decimals) for the USDG pair. A USDG token's recipient
  matches its `CreatorFeeRecipientUpdated` log.
- **Events:** the topics of `TokenLaunched(address,address,address,address,uint256,uint256)` (token,
  curve and deployer indexed) and `CreatorFeeRecipientUpdated(address,address,address)` match the
  factory logs exactly.
- **Wiring:** `factory.feeEscrow()` returns the escrow address in `packages/config`; `factory.owner()`
  is the Safe named in the Pons docs (`0x263e…19Dd`).

### Findings

| Finding                                                                                                                                                                                      | Consequence                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `curve.sweepFees` reverts `NotFeeSweepOperator()` (`0x8d42130c`) for everyone except the operator                                                                                            | Sweeps go through the operator (decision 4)                                                                                  |
| The operator reverts `BelowFloor()` (`0x4e7e2916`) when a curve's accrued fees are below a floor (the fees from a 500 USDG buy, ~8 USDG on the curve, were refused; a 3,000 USDG buy passed) | The keeper must check balances before sweeping. The token page shows "not enough fees to sweep yet" (added to `decodeError`) |
| The escrow pays `msg.sender` only                                                                                                                                                            | Confirms the sink must be the recipient                                                                                      |
| `transferCreatorFeeRecipient` is immediate                                                                                                                                                   | Route step 2/2 and exits take effect in one tx                                                                               |
| Launch policy on both tokens: protocol share 3000 bps, buyback/burn 5000 bps, hook fee 100 bps, max internal impact 300 bps                                                                  | Shown on the token page's fee policy card                                                                                    |
| **Not only USDG and ETH.** Of ~3,600 launches in the last 5M blocks: ~3,010 ETH, ~140 USDG, and ~430 paired with ~30 other ERC-20s (mostly Robinhood stock tokens such as GME, ANT, TTWO)    | Supported (decision 5), proven on GME and ANT pairs                                                                          |

### Gas (fork, per step)

| Step                                 | USDG pair | ETH pair |
| ------------------------------------ | --------: | -------: |
| `registerToken` (deploys the sink)   |   362,664 |  322,864 |
| `transferCreatorFeeRecipient` → sink |    10,472 |   10,472 |
| `operator.sweepCurve`                |   288,633 |  112,340 |
| `collect` (first batch)              |   264,582 |  213,704 |
| `claim` (1 token)                    |   106,831 |  109,938 |
| `exitByCreator`                      |    33,246 |   28,320 |

Measured with `gasleft()` around the call in the test, so cold-storage costs are included but not
the 21k intrinsic cost. Inputs for `COLLECT_THRESHOLD` and `SWEEP_THRESHOLD`.

## Open items

- [x] **Other pair tokens**: supported (decision 5). Residual risk: a pair token that rebases down, blocks transfers or pauses can affect claims in that asset only. Unit tests cover a fee-on-transfer pair (`test/PairAssets.t.sol`).
- [ ] **Buyback-vest launch-token credits.** No launch-token credit appeared in the escrow for the
      sink during a single buy and sweep. Vest releases are time-based, so this needs a longer
      fork run, or reading a token whose vest has released. If credits do appear, the sink cannot
      claim them today.
- [ ] **Exact floor value** for `BelowFloor`: read it from the operator, or binary-search it on a fork.
- [ ] **USDG pause/freeze** function names (Paxos). The unit suite covers a paused asset with a mock.
- [ ] **Pinned-block fork in CI** needs an archive RPC; the public RPC serves recent state only.
