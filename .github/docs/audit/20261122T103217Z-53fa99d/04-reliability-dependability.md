# 04 — Reliability and Dependability (`P1-03` Review Hardening)

- **Run ID:** `20261122T103217Z-53fa99d`
- **Reviewed baseline:** `53fa99dd3665385abd1ac3c57b56e1a063cc03af`

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Deterministic Ordering A (`login` verifies old password -> `reset-password` commits -> `login` enters `tx` and sees rotated hash) rejects `login` (`401`) and leaves `0` active sessions | Disposable PostgreSQL integration | `PASS` | `apps/api/test/auth-api.integration.spec.ts` |
| Deterministic Ordering B (`login` holds `owners` `FOR UPDATE` -> `reset-password` blocks on lock -> `login` commits -> `reset-password` revokes new session and commits) leaves `0` active old-password sessions and accepts new password | Disposable PostgreSQL integration | `PASS` | `apps/api/test/auth-api.integration.spec.ts` (`pg_blocking_pids(pid)` verified) |
| Synchronized concurrent valid logins (`16` existing + `8` simultaneous) serialize on `owners` `FOR UPDATE` and leave exact `20` active sessions (`4` oldest evicted) | Disposable PostgreSQL integration | `PASS` | `apps/api/test/auth-api.integration.spec.ts` |
| Idempotent single-settlement per-IP throttle reservations recover immediately after internal errors (`500`) and after `AUTH_LOGIN_BLOCK_SECONDS` expiry | Unit + controlled-verifier integration | `PASS` | `apps/api/src/auth/auth.spec.ts`, `apps/api/test/auth-api.integration.spec.ts` |

## Findings

None.
