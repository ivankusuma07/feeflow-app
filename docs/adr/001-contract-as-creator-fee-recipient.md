# ADR-001: Contract as Pons creator fee recipient

- Status: **Proposed**. The design is implemented against mocks; the Stage 0 fork spike that
  accepts or changes it has not run yet.
- Date: 25 Nov 2026

## Context

FeeFlow needs a contract, not a wallet, to receive each routed token's Pons v2 creator fees. The
brief requires proof on a mainnet fork that this works end to end before Stages 1–2 depend on it.

## What the Pons docs say (read 25 Nov 2026, not yet checked against verified ABIs)

Source: Pons developer docs (`pons-labs-llc.mintlify.app/developers/*`). `docs.ponsfamily.com/v2`
is only a stub that links there.

| Question                                           | Docs answer                                                                                                                                                                                                                                                                                                              | Consequence for FeeFlow                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Who can claim from the fee escrow?                 | Only `msg.sender`, for its own balance. No `claimFor`, no operator push, no owner rescue. A recipient contract that cannot call the escrow strands its fees.                                                                                                                                                             | The per-token **sink must be the recipient** and must call `claim()` / `claimToken(asset)` itself. This is the brief's design. |
| Current recipient getter (`PONS_RECIPIENT_GETTER`) | `getLaunchedToken(token).creatorFeeRecipient`; `exists` is false for tokens of other factories                                                                                                                                                                                                                           | Used in `registerToken` and `_exit`                                                                                            |
| `transferCreatorFeeRecipient(token, newRecipient)` | Only the current recipient. Immediate. Moves unswept fees and the whole buyback vest; amounts already in the escrow stay with the old recipient.                                                                                                                                                                         | Exits call it from the sink; exits collect first (try/catch) so escrow balances are credited before leaving                    |
| Owner override                                     | Factory owner (2-of-3 Safe) can propose a new recipient; executable after 3 days, expires 3 days later; `CreatorFeeRecipientChangeProposed` event                                                                                                                                                                        | Token page shows a pending takeover warning; FeeFlow cannot block it (disclosed)                                               |
| Sweeps                                             | Curve `sweepFees(minBuybackTokensOut)`, hook `sweepPoolFees(poolId, minConversionQuoteOut, minBuybackTokensOut)`. Sweeps needing an internal swap revert with `InternalSwapRequiresOperator()` unless run by the sweep operator `0xa101…cA83`, whose `sweepPool` / `sweepCurve` anyone can call (TWAP guard, cooldowns). | **Design change:** no sweep passthrough in `FeeSink`. The keeper and the token page call the sweep operator directly.          |
| Testnet                                            | No 46630 deployment documented                                                                                                                                                                                                                                                                                           | Integration tests run on a 4663 fork                                                                                           |
| Network                                            | RPC `https://rpc.mainnet.chain.robinhood.com`; explorers `robin.etherscan.io`, `robinhoodchain.blockscout.com`; `block.number` is the L1 block                                                                                                                                                                           | Contracts use `block.timestamp` only                                                                                           |

## Decision (pending fork evidence)

1. One `FeeSink` EIP-1167 clone per token, CREATE2 salt = token address, created by `FeeFlow` at
   registration. The sink is the Pons creator fee recipient and the only caller of the escrow for its balance.
2. `FeeFlow` supports only the active Pons v2 stack (factory and escrow are immutables). Tokens
   from archived or legacy stacks are rejected by `getLaunchedToken(..).exists`.
3. Native-ETH pairs are identified by `pairToken == address(0)`. **To verify on the fork.**

## Open questions for the fork spike

- [ ] Verify every signature in `contracts/src/interfaces/IPons.sol` against the verified explorer
      ABIs, especially the `LaunchedToken` struct field order and `transferCreatorFeeRecipient` types.
- [ ] Confirm how native-ETH pairs report `pairToken` (zero address or WETH).
- [ ] Buyback-vest releases credit the **launch token** to the recipient's escrow ledger. The sink
      only claims the pair asset, so such launch-token balances would sit in the escrow under the
      sink. Decide: ignore (disclose), or add a sink path that forwards them to the creator.
- [ ] Exact sweep-operator signatures (`sweepPool`, `sweepCurve`) and which tokens need it.
- [ ] Gas per step for both pair types (sets `COLLECT_THRESHOLD` and `SWEEP_THRESHOLD`).
- [ ] USDG pause/freeze function names from Paxos docs, and the revert shape when paused.

## Evidence

To be added by the spike: fork block, tx traces, gas table.
