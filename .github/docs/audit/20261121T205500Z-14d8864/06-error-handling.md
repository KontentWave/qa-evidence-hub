# 06 — Error Handling and Exceptions (`P1-03`)

- **Run ID:** `20261121T205500Z-14d8864`
- **Reviewed baseline:** `14d886482670619d89a666d97c1c34e80bbe7a7d`

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Identical generic `401` JSON body (`{ code: "UNAUTHORIZED", message: "Authentication is required." }`) across unknown user, wrong password, missing cookie, expired session, and revoked session | Static + integration & BDD runtime | `PASS` | `apps/api/src/common/http-exception.filter.ts`, `apps/api/test/auth-api.integration.spec.ts`, `specs/features/private-access.feature` |
| Distinct non-sensitive HTTP status codes for validation (`400` with sanitized `fieldErrors`), unauthenticated (`401`), invalid `Origin`/`X-CSRF-Token`/transport (`403`), and login rate limiting (`429` + `Retry-After`) | Static + integration runtime | `PASS` | `apps/api/src/common/http-exception.filter.ts`, `apps/api/test/auth-api.integration.spec.ts` |
| `HttpExceptionFilter` preserves `Cache-Control: private, no-store, no-transform` on auth/protected errors while keeping `no-store` on `/api/v1/health*` | Static + unit/integration runtime | `PASS` | `apps/api/src/common/http-exception.filter.ts`, `apps/api/src/health/health.controller.spec.ts`, `apps/api/test/auth-api.integration.spec.ts` |
| `scripts/provision-owner.ts` exits `1` with sanitized operator messages and never echoes passwords, hashes, or `DATABASE_URL` | Static + integration runtime | `PASS` | `scripts/provision-owner.ts`, `apps/api/test/auth-api.integration.spec.ts` |
| `<LoginForm />` and `<LogoutButton />` surface clear user-facing alerts without exposing backend hostnames or credentials | Static + RTL + Playwright | `PASS` | `apps/web/src/components/login-form.tsx`, `apps/web/src/components/logout-button.tsx`, `apps/web/src/app/login.spec.tsx`, `e2e/foundation-smoke.spec.ts` |

## Findings

None.
