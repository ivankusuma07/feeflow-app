# VPS deployment

FeeFlow's services on the shared VPS, next to other projects. The shared edge Caddy
(`/opt/edge`) owns ports 80/443 and TLS; FeeFlow adds one site file and attaches its public
containers to the `edge` network. Postgres and the keeper are not reachable from outside.

| Service     | Public at                                          | Notes                                    |
| ----------- | -------------------------------------------------- | ---------------------------------------- |
| `api`       | `https://feeflow-api.185-147-159-149.sslip.io`     | attestations, X lookup                   |
| `indexer`   | `https://feeflow-indexer.185-147-159-149.sslip.io` | `/api/*`, `/health`, `/ready`, `/status` |
| `keeper`    | —                                                  | `/health` on the internal network only   |
| `reconcile` | —                                                  | every 15 min, JSON lines in its logs     |
| `postgres`  | —                                                  | volume `feeflow_pgdata`                  |

## Layout on the host

```
/opt/feeflow/
  docker-compose.yml        (this folder)
  src/                      git archive of the repo at the deployed commit
  env/*.env                 from env/*.env.example; root-only (chmod 600), never in git
  env/postgres_password
/etc/feeflow/attester-sa.json   GCP service account for KMS signing (placed by the owner)
/opt/edge/sites/feeflow.caddy   from feeflow.caddy
```

## Update

```sh
git archive HEAD | ssh root@VPS 'rm -rf /opt/feeflow/src && mkdir -p /opt/feeflow/src && tar -x -C /opt/feeflow/src'
ssh root@VPS 'cd /opt/feeflow && docker compose up -d --build'
```

A schema change in `services/indexer/ponder.schema.ts` needs a new `DATABASE_SCHEMA` (e.g.
`feeflow_v2`): Ponder reindexes into it while the old one keeps serving until the switch.
