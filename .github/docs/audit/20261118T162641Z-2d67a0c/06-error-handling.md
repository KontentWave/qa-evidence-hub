# 06 — Error Handling and Exceptions (`P1-01`)

- **Run ID:** `20261118T162641Z-2d67a0c`
- **Reviewed baseline:** commit `2d67a0c2f654d4d1f6dcb4758f7022e85ebca5c8` (`feat/p1-01-local-foundation`)
- **Scope and evidence limits:** Covers API environment validation errors, global `HttpExceptionFilter`, DTO validation failure payloads, `503` readiness degradation, and Next.js SSR upstream failure handling.

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| `validateApiEnv` fails fast on startup with structured `EnvValidationError` without echoing `DATABASE_URL` credentials, hostnames, or raw URIs | Static + unit | `PASS` | `apps/api/src/config/env.validation.ts`, `apps/api/src/config/env.validation.spec.ts` |
| `HttpExceptionFilter` returns stable JSON `{ code, message, fieldErrors? }` with `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`, stripping raw URLs/queries from `404` and validation errors | Static + unit + integration | `PASS` | `apps/api/src/common/http-exception.filter.ts`, `health.controller.spec.ts`, `health-readiness.integration.spec.ts` |
| `GET /api/v1/health/ready` returns `503 { "status": "not_ready" }` with zero DSN, host, or stack leakage when PostgreSQL throws or times out | Unit + live browser check | `PASS` | `apps/api/src/health/health.controller.spec.ts` and live `qaeh_uicheck` browser verification with `postgres` stopped |
| Next.js `fetchPlatformReadiness()` catches `503`, invalid env, and network timeouts, returning user-safe degraded status text without leaking internal `http://api:3001` hostnames | Unit + live browser check | `PASS` | `apps/web/src/lib/api.ts`, `apps/web/src/app/page.spec.tsx` |

## Findings

No confirmed defects, verification gaps, accepted limitations, or optional improvements identified in this area.
