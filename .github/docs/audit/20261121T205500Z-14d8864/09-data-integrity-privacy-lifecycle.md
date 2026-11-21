# 09 — Data Integrity, Privacy, and Lifecycle (`P1-03`)

- **Run ID:** `20261121T205500Z-14d8864`
- **Reviewed baseline:** `14d886482670619d89a666d97c1c34e80bbe7a7d`

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| PostgreSQL `owners` constraints: UUID PK, `singleton_key = true` + unique index, trimmed non-empty `login_identifier <= 200` + case-insensitive unique index `LOWER(login_identifier)`, non-empty `password_hash`, validated IANA `timezone` (`Europe/Bratislava` default), `TIMESTAMPTZ` timestamps | Static SQL + real PG migration/integration | `PASS` | `apps/api/prisma/migrations/20261121000000_owner_and_auth_sessions/migration.sql`, `apps/api/test/health-readiness.integration.spec.ts`, `apps/api/test/auth-api.integration.spec.ts` |
| PostgreSQL `auth_sessions` constraints: UUID PK, FK `owner_id -> owners(id) ON DELETE CASCADE ON UPDATE RESTRICT`, 64-hex `token_digest` unique index + regex `CHECK`, 64-hex `csrf_salt` regex `CHECK`, `expires_at > created_at` `CHECK`, `revoked_at`/`revoke_reason` consistency `CHECK` | Static SQL + real PG integration | `PASS` | `apps/api/prisma/migrations/20261121000000_owner_and_auth_sessions/migration.sql`, `apps/api/test/auth-api.integration.spec.ts` |
| Raw session tokens and CSRF secrets are never persisted in PostgreSQL (`token_digest` = SHA-256 hex; authenticated CSRF derived via HMAC keyed by browser-held `HttpOnly` token) | Static + PG integration | `PASS` | `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/csrf.service.ts`, `apps/api/test/auth-api.integration.spec.ts` |
| Protected and auth HTTP responses carry `Cache-Control: private, no-store, no-transform` and `X-Content-Type-Options: nosniff` | Integration + container + Playwright | `PASS` | `apps/api/src/auth/auth.guard.ts`, `apps/web/next.config.mjs`, `scripts/f01-containers.test.mjs`, `e2e/foundation-smoke.spec.ts` |
| Zero out-of-slice domain tables created (`public` tables strictly `_prisma_migrations`, `auth_sessions`, `owners`) | Real PG integration & container checks | `PASS` | `apps/api/test/health-readiness.integration.spec.ts`, `scripts/f01-containers.test.mjs` |

## Findings

None.
