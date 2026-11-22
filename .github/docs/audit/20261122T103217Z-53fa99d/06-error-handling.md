# 06 — Error Handling and Exceptions (`P1-03` Review Hardening)

- **Run ID:** `20261122T103217Z-53fa99d`
- **Reviewed baseline:** `53fa99dd3665385abd1ac3c57b56e1a063cc03af`

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Admitted credential failures (unknown user, wrong password, or concurrent `reset-password` hash rotation) consistently return generic `401` (`UNAUTHORIZED`) with zero session cookies | Unit + PG integration runtime | `PASS` | `apps/api/src/auth/auth.service.ts`, `apps/api/test/auth-api.integration.spec.ts` |
| Throttled requests (`blockedUntilMs > now` or `failures + inFlight >= maxAttempts`) return `429` (`TOO_MANY_REQUESTS`) with positive `Retry-After` header | Unit + HTTP integration runtime | `PASS` | `apps/api/src/auth/login-throttler.service.ts`, `apps/api/test/auth-api.integration.spec.ts` |
| Internal DB or verifier failures settle the reservation as `'error'` without falsely penalizing the client IP and surface sanitized `500` JSON | Unit + HTTP integration runtime | `PASS` | `apps/api/src/auth/auth.service.ts`, `apps/api/test/auth-api.integration.spec.ts` |
| `AUTH_PASSWORD_SCRYPT_LN=17` and `18` fail fast at startup with explicit `EnvValidationError` (`14 and 16`) rather than OpenSSL `ERR_EVP_MEMORY_LIMIT_EXCEEDED` | Unit + `Node v24.22.3` container runtime | `PASS` | `apps/api/src/config/env.validation.spec.ts`, `scripts/f01-containers.test.mjs` |

## Findings

None.
