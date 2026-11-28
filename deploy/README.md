# VPS deployment

FeeFlow's services on the shared VPS, next to other projects. The shared edge Caddy
(`/opt/edge`) owns ports 80/443 and TLS; FeeFlow adds one site file and attaches its public
containers to the `edge` network. Postgres and the keeper are not reachable from outside.

| Service     | Public at                                          | Notes                                    |
| ----------- | -------------------------------------------------- | ---------------------------------------- |
| `api`       | `https://feeflow-api.185-147-159-149.sslip.io`     | attestations, X lookup, image upload     |
| `indexer`   | `https://feeflow-indexer.185-147-159-149.sslip.io` | `/api/*`, `/health`, `/ready`, `/status` |
| `keeper`    | —                                                  | `/health` on the internal network only   |
| `reconcile` | —                                                  | every 15 min, JSON lines in its logs     |

## Secrets and alerts

- `env/api.env`: `PRIVY_APP_SECRET`, `X_API_BEARER`, `ATTESTER_PRIVY_AUTH_KEY`, and
  `PINATA_JWT` (a Pinata key with only the `org:files:write` scope, for `/launch` token images;
  unset = uploads answer 503). Server-side only: never in git, never in a `NEXT_PUBLIC_` variable.
- The keeper logs `{"kind":"alert"}` lines: `low-balance`, `pons-override-pending`,
  `pons-redirected`. It doesn't sweep redirected tokens.
- `reconcile` exits 1 (`"status":"fail"`) on totals drift, on a pending Pons override of a routed
  token, or when the indexer's override state disagrees with the chain. Executed redirects are
  logged every run without failing it.
  | `postgres` | — | volume `feeflow_pgdata` |

## Layout on the host

```
/opt/feeflow/
  docker-compose.yml        (this folder)
  src/                      git archive of the repo at the deployed commit
  env/*.env                 from env/*.env.example; root-only (chmod 600), never in git
  env/postgres_password
/opt/feeflow/privy/             Privy attester keys (root-only); owner.key moves off the host after lock
/opt/edge/sites/feeflow.caddy   from feeflow.caddy
```

## Attester (Privy server wallet)

The attester key lives in a Privy server wallet. The API holds only `signer.key`, a P-256 key
that a Privy policy limits to FeeFlow typed data on chain 4663 (and, after `lock`, the deployed
contract). `owner.key` can change or export the wallet: keep it offline once set up.

```sh
cd /opt/feeflow
run() { docker compose run --rm --no-deps -v /opt/feeflow/privy:/privy api node_modules/.bin/tsx scripts/privy-attester.ts "$@"; }
run create /privy                       # prints walletId and ATTESTER_ADDRESS
run lock /privy <walletId> <contract>   # after the deploy
run check /privy <walletId>             # signs a FeeFlow message; plain and other-chain refused
```

## Update

```sh
git archive HEAD -- package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json packages services deploy   | ssh root@VPS 'rm -rf /opt/feeflow/src && mkdir -p /opt/feeflow/src && tar -x -C /opt/feeflow/src && cp /opt/feeflow/src/deploy/docker-compose.yml /opt/feeflow/'
ssh root@VPS 'cd /opt/feeflow && docker build -q -t feeflow-services -f src/deploy/Dockerfile src && docker compose up -d'
```

After the indexer reports ready, restart `keeper` and `reconcile` (`docker compose restart keeper
reconcile`): started together, their first run can race the indexer.

A schema change in `services/indexer/ponder.schema.ts` needs a new `DATABASE_SCHEMA` in
`env/indexer.env` (current: `feeflow_v3`). Ponder reindexes into it from `CONTRACT_DEPLOY_BLOCK`;
the site's indexer data is unavailable until the backfill finishes. Then drop the old schema.
The indexer caps RPC calls at 10/s (`ponder.config.ts`): above that the public RPC answers 429 and
Ponder's backfill stalls.
