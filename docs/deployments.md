# Deployments

## Robinhood Chain mainnet (4663), 27 Nov 2026

| What                    | Value                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| FeeFlow                 | `0xF7b438c70CA4a126cD4Ed0603DFa3761fcE819D2`                                                       |
| FeeSink implementation  | `0x85b6F7cA14B61B5D38db6699Cb0CB77B23764A59`                                                       |
| Deploy transaction      | `0xc679fd784a93496369249fa299a98bf860b239866dfc5ce75e9201b2a13029f5`                               |
| Deploy block            | 124082737                                                                                          |
| Pons factory / escrow   | `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e` / `0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e`        |
| Fee recipient and admin | `0x9F220f524b978C45b246fde763b460FE3fAfd1bf` (one EOA with an EIP-7702 delegation; owner decision) |
| Attester                | `0x00f76cb42B0A5433fa6F5291fFeBa73234291b43` (Privy server wallet)                                 |
| Attester timelock       | 48 h (172800 s)                                                                                    |
| Keeper                  | `0x0277f0C021E6469E7d22D4aa31AF1840Df78b151` (gas only)                                            |

Read back on chain after the deploy: every constructor value above, `pendingAttester` = 0,
`registrationPaused` = false, `FEE_BPS` = 100, `CLAIM_WINDOW` = 30 days. The Privy signer policy is
locked to this contract and chain (checked: other contract, other chain and plain messages refused).

Not met before mainnet (brief §Launch): no audit, no 72 h zero-drift run, no second reviewer of the
deploy script. The contract is not verified on the explorer yet.

## Services

| Service | URL                                              |
| ------- | ------------------------------------------------ |
| Web     | https://feeflow-dusky.vercel.app                 |
| API     | https://feeflow-api.185-147-159-149.sslip.io     |
| Indexer | https://feeflow-indexer.185-147-159-149.sslip.io |
