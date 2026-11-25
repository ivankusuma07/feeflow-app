# Slither triage

CI runs Slither on `contracts/` and fails on medium or higher. Every suppressed finding is listed
here with the reason. Suppressions are inline (`slither-disable-next-line`) so they stay next to the code.

| Detector                    | Location                                        | Verdict                                                                                                                                                                                                          |
| --------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `arbitrary-send-eth` (high) | `FeeFlow._pay`                                  | False positive. `to` is bound by the attester's EIP-712 `Claim` signature in `claim`, is the stored creator in `releaseExpired`, and the immutable `FEE_RECIPIENT` in `withdrawFees`. No caller picks it freely. |
| `incorrect-equality`        | `_collect`: `gross == 0`                        | Intended. `gross` is FeeFlow's own balance delta around `pull()`; zero means nothing to credit.                                                                                                                  |
| `incorrect-equality`        | `_collect`: `creditedAt == block.timestamp`     | Intended. Merges collections in the same block into one batch, keeping the FIFO queue short.                                                                                                                     |
| `unused-return`             | `_collect`: `FeeSink.pull()`                    | Intended. The sink's reported amount is not trusted; the balance delta is used.                                                                                                                                  |
| `unused-return`             | `_useAttestation`: `ECDSA.tryRecover` 3rd value | Intended. The error code is checked; the extra value only carries data for error messages.                                                                                                                       |

Fixed rather than suppressed: `reentrancy-no-eth` in `registerToken` (state now written before the
sink is initialized), `uninitialized-local` (`any`, `index`).

Low and informational findings (`calls-loop`, `reentrancy-benign`, `reentrancy-events`,
`timestamp`, `missing-zero-check` on `pairAsset`, where zero means native ETH) are accepted: every
external call goes to a FeeFlow-deployed sink, the Pons escrow/factory, or the pair token, and all
mutating entry points are `nonReentrant`.
