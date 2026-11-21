# 04 — Reliability and Dependability (`P1-03`)

- **Run ID:** `20261121T205500Z-14d8864`
- **Reviewed baseline:** `14d886482670619d89a666d97c1c34e80bbe7a7d`

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Concurrent owner provisioning serialized deterministically by PostgreSQL `owners_singleton_key_key` unique constraint | Local & CI PG runtime | `PASS` | `apps/api/test/auth-api.integration.spec.ts` (`Promise.all` of 3 concurrent `provision-owner.ts` processes -> exact `1` row persisted) |
| Atomic transactional password rotation + session revocation (`BEGIN ... SELECT FOR UPDATE ... UPDATE owners ... UPDATE auth_sessions ... COMMIT`) with `ROLLBACK` on error | Static + PG integration runtime | `PASS` | `scripts/provision-owner.ts`, `apps/api/test/auth-api.integration.spec.ts` |
| Atomic login session creation, prior-session reauthentication revocation, stale-expiry cleanup, and active-session cap inside `prisma.$transaction` | Static + unit/PG runtime | `PASS` | `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.spec.ts`, `apps/api/test/auth-api.integration.spec.ts` |
| Race-free browser CSRF bootstrap in `<LoginForm />` and `<LogoutButton />` (shared in-flight promise awaited on fast keyboard submit) | Static + RTL + Playwright Chromium | `PASS` | `apps/web/src/components/login-form.tsx`, `apps/web/src/components/logout-button.tsx`, `e2e/foundation-smoke.spec.ts` |
| Bounded DNS lookup timeout (`1500 ms`) + TTL caching (`5000 ms`) + fail-closed fallback on `TRUST_PROXY=nginx` | Static + container runtime | `PASS` | `apps/api/src/config/trusted-proxy.ts`, `scripts/f01-containers.test.mjs` (survived `compose down`/`up` and `compose restart nginx`) |
| Persistent PostgreSQL volume preserves migrated `owners` and `auth_sessions` across container recreation | Local & CI Docker runtime | `PASS` | `scripts/f01-containers.test.mjs` |

## Findings

None.
