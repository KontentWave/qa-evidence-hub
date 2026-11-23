# 10 — Observability, Operations, and Recovery (`P1-04`)

- **Run ID:** `20261123T173817Z-d5fac14`
- **Reviewed baseline:** `d5fac14699321a165cd6d235dd77b20ceb9bac73`

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| `/api/v1/health` and `/api/v1/health/ready` liveness/readiness probes and `compose.yaml` operator `--env-file` auth overrides (`AUTH_PASSWORD_SCRYPT_LN`, `AUTH_LOGIN_MAX_ATTEMPTS`) preserved behind Nginx | Local Docker runtime | `PASS` | `scripts/f01-containers.test.mjs` (`1/1`) |
| Cucumber JSON artifact retention (`cucumber-foundation.json`, `cucumber-auth.json`, `cucumber-engagement.json`) and Playwright JSON report (`playwright-foundation.json`) wired in CI | Static + `pnpm verify:workflows` | `PASS` | `.github/workflows/ci.yml` |
| Production VPS monitoring, alerting, and off-VPS backup/restore rehearsals (`F04`) | Deferred to `P1-12` | `NOT VERIFIED` | Tracked in `VG-P103-01` (planned in `P1-12`) |

## Findings

None beyond `VG-P103-01`.
