# 02 — Optimization and Resource Efficiency (`P1-04`)

- **Run ID:** `20261123T173817Z-d5fac14`
- **Reviewed baseline:** `d5fac14699321a165cd6d235dd77b20ceb9bac73`

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Zero new npm dependencies added (`pnpm-lock.yaml` unchanged) | Static inspection | `PASS` | `package.json`, `apps/api/package.json`, `apps/web/package.json`, `pnpm-lock.yaml` (`0` diff lines) |
| Composite PostgreSQL B-tree indexes aligned with parent-scoped newest-first `ORDER BY` queries | Static + PG migration runtime | `PASS` | `apps/api/prisma/migrations/20261123000000_engagement_context/migration.sql` (`clients_created_at_id_idx`, `projects_client_id_created_at_id_idx`, `test_sessions_project_id_started_at_idx`) |
| Bounded list queries (`DEFAULT_DOMAIN_LIST_LIMIT = 200`) and bounded payload/column lengths (`200` / `20,000` chars, Nginx `1 MiB` default cap) | Static + PG & container runtime | `PASS` | `apps/api/src/common/validation.util.ts`, `apps/api/src/{clients,projects,sessions}/*.service.ts`, `scripts/f01-containers.test.mjs` |
| Parallel SSR data reads (`Promise.all`) with `4000 ms` `AbortSignal.timeout` and `cache: 'no-store'` | Static + RTL | `PASS` | `apps/web/src/lib/api.ts`, `apps/web/app/clients/**` |
| Observed container image sizes and idle working-set memory on `d5fac14` | Local Docker runtime | `PASS` | `api`: `684.7 MiB` (`123.1 MiB` idle), `web`: `260.7 MiB` (`56.62 MiB` idle), `postgres`: `99.05 MiB` idle, `nginx`: `6.652 MiB` idle (`scripts/f01-containers.test.mjs`) |

## Findings

None (`OPT-P101-01` carried forward from `P1-01`; target-VPS 500-finding / 2,000-evidence latency & peak memory validation scheduled for `P1-10` and `P1-12`).
