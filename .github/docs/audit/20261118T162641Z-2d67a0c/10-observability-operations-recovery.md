# 10 — Observability, Operations, and Recovery (`P1-01`)

- **Run ID:** `20261118T162641Z-2d67a0c`
- **Reviewed baseline:** commit `2d67a0c2f654d4d1f6dcb4758f7022e85ebca5c8` (`feat/p1-01-local-foundation`)
- **Scope and evidence limits:** Covers container healthchecks, liveness/readiness separation, bounded container log rotation, persistent volume survival across container recreation, and `scripts/test-db.sh` operational safety guards. Production alerting, runbooks, backup/restore, and rollback scripts belong to `P1-02` and `P1-12` (`F04`).

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Distinct liveness (`/api/v1/health`) and DB readiness (`/api/v1/health/ready`) endpoints wired to Compose `service_healthy` dependency ordering (`postgres` → `api` → `web` → `nginx`) | Static + container runtime | `PASS` | `compose.yaml`, `scripts/f01-containers.test.mjs` (`docker compose up -d --wait` converged all 4 services to `Healthy`) |
| Docker `json-file` log rotation (`max-size: "10m"`, `max-file: "3"`) configured across all services in `compose.yaml` | Static inspection | `PASS` | `compose.yaml` |
| Persistent `postgres_data` named volume preserves database state across container teardown and recreation (`down` without `-v`) | Local runtime | `PASS` | `scripts/f01-containers.test.mjs` |
| `scripts/test-db.sh` enforces `^qaeh_test_` project-name guard before any Docker mutation or volume deletion | Unit/infra runtime | `PASS` | `scripts/test-db.sh`, `scripts/test-db-isolation.test.mjs` |
| Off-VPS backup, isolated restore rehearsal, monitoring alerts, and release rollback procedures (`F04`) | Not in `P1-01` scope | `NOT VERIFIED` | Planned in `P1-12` (`scripts/deploy.sh`, `backup.sh`, `restore.sh`, `rollback.sh`, `.github/docs/runbook.md`) |

## Findings

No confirmed defects within `P1-01` scope. Operational recovery and alerting gates (`F04`) remain planned prerequisites before any real client data (`P1-12`–`P1-13`).
