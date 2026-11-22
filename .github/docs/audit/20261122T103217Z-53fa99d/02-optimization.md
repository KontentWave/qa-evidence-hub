# 02 — Optimization and Resource Efficiency (`P1-03` Review Hardening)

- **Run ID:** `20261122T103217Z-53fa99d`
- **Reviewed baseline:** `53fa99dd3665385abd1ac3c57b56e1a063cc03af`

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Expensive `scrypt` password verification remains strictly outside the PostgreSQL transaction (`FOR UPDATE` row lock held only across short indexed session queries/writes) | Static + PG integration runtime | `PASS` | `apps/api/src/auth/auth.service.ts` |
| Per-IP in-flight reservations reject excess concurrent attempts from a single IP before `owner.findFirst` or `PasswordHasherService` queue entry while keeping `buckets.size <= maxKeys` (`4096` default, `16` test floor) | Static + unit + controlled-verifier integration | `PASS` | `apps/api/src/auth/login-throttler.service.ts`, `apps/api/test/auth-api.integration.spec.ts` (`findFirst` call count unchanged on `429`) |
| `scrypt` upper bound capped at `AUTH_PASSWORD_SCRYPT_LN = 16` (`~64 MiB` per hash <= `128 MiB` OpenSSL `maxmem`), preventing `128 MiB+` (`ln=17,18`) allocation failures | Static + `Node v24.22.3` runtime | `PASS` | `apps/api/src/config/env.validation.ts`, `apps/api/src/auth/password-hasher.service.ts`, `scripts/f01-containers.test.mjs` |
| Observed container sizes and post-auth RSS (`api` `684.3 MiB` / `108.6 MiB` RSS, `web` `283.9 MiB` / `60.8 MiB` RSS, `postgres` `66.5 MiB` RSS, `nginx` `9.0 MiB` RSS) | Local Docker runtime | `PASS` | `scripts/f01-containers.test.mjs` |

## Findings

Carries forward optional `OPT-P101-01` only; no resource defects open.
