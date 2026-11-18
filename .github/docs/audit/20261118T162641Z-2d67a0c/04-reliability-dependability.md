# 04 — Reliability and Dependability (`P1-01`)

- **Run ID:** `20261118T162641Z-2d67a0c`
- **Reviewed baseline:** commit `2d67a0c2f654d4d1f6dcb4758f7022e85ebca5c8` (`feat/p1-01-local-foundation`)
- **Scope and evidence limits:** Covers readiness probe timeouts, graceful shutdown hooks, container restart/healthcheck orchestration, persistent PostgreSQL volume survival across container recreation, and disposable test-DB concurrency/cleanup guarantees. Upload leases and R2 fault-injection recovery belong to `P1-05`.

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| `PrismaService.checkReadiness()` bounds `SELECT 1` with both `pg.Pool` timeouts and an explicit `Promise.race` timer (`clearTimeout` in `finally`) | Static + unit + integration | `PASS` | `apps/api/src/prisma/prisma.service.ts`, `health.controller.spec.ts`, `health-readiness.integration.spec.ts` |
| Graceful `SIGTERM` / `SIGINT` handling and NestJS `enableShutdownHooks()` release HTTP listener and `pg.Pool` cleanly | Static + runtime teardown | `PASS` | `apps/api/src/main.ts`, `apps/api/src/prisma/prisma.service.ts`, `compose.yaml` (`stop_grace_period: 15s`) |
| `pg_isready -h 127.0.0.1` + SQL readiness check eliminates PostgreSQL `docker-entrypoint.sh` Unix-socket init race | Local runtime | `PASS` | `compose.yaml`, `compose.test.yaml`, `scripts/test-db.sh`; verified via repeated concurrent runs of `scripts/test-db-isolation.test.mjs` |
| Synthetic PostgreSQL data survives `docker compose down` + `up -d --wait` (container recreation without `-v`) on persistent `postgres_data` volume | Local runtime | `PASS` | `scripts/f01-containers.test.mjs` verified recreated `postgres` container ID and surviving `qaeh_f01_synthetic.persistence_probe` row |
| Concurrent `scripts/test-db.sh` runs stay isolated and mid-run failures leave zero leftover `qaeh_test_<id>` containers, networks, or volumes | Local runtime | `PASS` | `scripts/test-db-isolation.test.mjs` (`exit 0`, 3/3 tests) |
| SSR readiness fetch uses `AbortSignal.timeout(4000)` and degrades cleanly on `503` or unreachable API | Unit + browser runtime | `PASS` | `apps/web/src/lib/api.ts`, `apps/web/src/app/page.spec.tsx`, live browser check with `postgres` stopped |

## Pre-Commit Defect Resolved During Slice Verification

During initial end-to-end execution before commit `2d67a0c`, `pg_isready` without `-h 127.0.0.1` matched the temporary local-only PostgreSQL initialization server inside `postgres:17-bookworm`, causing a transient `ECONNRESET` on host TCP connections during concurrent test-DB startup. Adding `-h 127.0.0.1` to `compose.yaml` and `compose.test.yaml` plus `wait_for_sql_ready` in `scripts/test-db.sh` resolved the race and was reverified across repeated runs prior to commit `2d67a0c`.

## Remaining Findings

No open confirmed defects in `P1-01`. Off-VPS backup/restore and failed-release rollback rehearsals remain planned in `P1-12` (`F04`).
