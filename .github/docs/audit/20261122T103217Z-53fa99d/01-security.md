# 01 — Security (`P1-03` Review Hardening)

- **Run ID:** `20261122T103217Z-53fa99d`
- **Reviewed baseline:** `53fa99dd3665385abd1ac3c57b56e1a063cc03af` (`feat/p1-03-single-owner-auth`)
- **Scope and evidence limits:** Covers remediation of the three `P1-03` review findings across `AuthService.login` / `reset-password` lock serialization, in-flight per-IP login reservation throttling, and `scrypt` `ln=14..16` runtime alignment on `Node v24.22.3`.

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| `AuthService.login` locks `owners WHERE singleton_key = true FOR UPDATE` inside `prisma.$transaction` (keeping `scrypt` outside `tx`), rejects stale `password_hash` with generic `401` and zero cookies, and leaves `0` usable old-password sessions after `reset-password` commits across both lock orderings | Static + deterministic PG integration | `PASS` | `apps/api/src/auth/auth.service.ts`, `apps/api/test/auth-api.integration.spec.ts` (Orderings A & B with `pg_blocking_pids` proof) |
| Concurrent valid logins serialize under the singleton `owners` `FOR UPDATE` row lock and enforce `<= 20` active sessions (`session_cap_evicted`) | Static + deterministic PG integration | `PASS` | `apps/api/test/auth-api.integration.spec.ts` (`16 + 8` synchronized valid logins -> `20` active `200`, `4` oldest revoked `401`) |
| `LoginThrottlerService.reserveAttempt` counts `failures + inFlight` against `AUTH_LOGIN_MAX_ATTEMPTS` before DB lookup or `scrypt`, settles once per attempt, isolates distinct client IPs, and preserves active reservations across concurrent success and `maxKeys` eviction | Static + unit + controlled-verifier HTTP integration | `PASS` | `apps/api/src/auth/login-throttler.service.ts`, `apps/api/src/auth/auth.spec.ts`, `apps/api/test/auth-api.integration.spec.ts` |
| `AUTH_PASSWORD_SCRYPT_LN` accepts `14`–`16` (default `16`, `128 MiB` `maxmem`), rejects `17` and `18` at startup validation, fails closed on out-of-range PHC parameters without throwing OpenSSL memory errors, and verifies CLI-provisioned `ln=16` hashes using stored parameters | Static + unit/PG integration + `Node v24.22.3` container runtime | `PASS` | `apps/api/src/config/env.validation.ts`, `apps/api/src/auth/password-hasher.service.ts`, `scripts/f01-containers.test.mjs` |
| Secret, AST SAST (`$queryRaw` tagged template only; `0` `$queryRawUnsafe`), IaC, dependency, and 4-image Trivy scans pass with `0` findings | Local runtime | `PASS` | `pnpm verify:security:secrets`, `pnpm verify:security:static`, `pnpm verify:security:deps`, `pnpm verify:security:containers` |

## Findings

`P103-RV-01`, `P103-RV-02`, and `P103-RV-03` resolved and reverified. Deferred `VG-P103-01` and `VG-P103-02` remain unchanged per slice plan.
