# 10 — Observability, Operations, and Recovery (`P1-03`)

- **Run ID:** `20261121T205500Z-14d8864`
- **Reviewed baseline:** `14d886482670619d89a666d97c1c34e80bbe7a7d`

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| `/api/v1/health` and `/api/v1/health/ready` remain public for Docker/Nginx liveness & readiness probes even when `APP_ORIGIN` uses `https://`, while `web` healthcheck probes `/login` (`200`) | Static + container HTTP/HTTPS runtime | `PASS` | `apps/api/src/health/health.controller.ts`, `apps/api/src/auth/auth.guard.ts`, `compose.yaml`, `scripts/f01-containers.test.mjs` |
| Operator provisioning and password-reset runbook (`scripts/provision-owner.ts` inside `api` container and local CLI) documented with exact commands and credential rules | Documentation + container runtime | `PASS` | `.github/docs/runbook.md` §6, `scripts/f01-containers.test.mjs` |
| CI retains both `cucumber-foundation.json` and `cucumber-auth.json` BDD reports (`cucumber-bdd-reports`), `playwright-foundation.json`, and step coverage summaries | Workflow inspection + live CI run | `PASS` | `.github/workflows/ci.yml` |
| Production off-VPS backups, isolated restore rehearsals, rollback scripts, and external HTTPS/host alerts (`F04`) | Deferred to `P1-12` (`F04`) | `NOT VERIFIED` | Planned in `P1-12` before real client data |

## Findings

None within `P1-03` scope.
