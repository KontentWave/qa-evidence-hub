# 01 — Security (`P1-04` Session Review Hardening)

- **Run ID:** `20261127T162909Z-05c38bf`
- **Reviewed baseline:** `05c38bfb94b4b39ace12385de25d52d17605dc83`

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Paginated `GET /api/v1/projects/:projectId/sessions?cursor=...&limit=...` enforces authentication (`401` anonymous), parent-project scoping (`WHERE "project_id" = $1::uuid`, `404` missing project), `Cache-Control: private, no-store, no-transform`, `X-Content-Type-Options: nosniff`, and zero `Set-Cookie` | Static + PG 19 integration + Nginx Playwright | `PASS` | `apps/api/src/sessions/{sessions.controller.ts,sessions.service.ts}`, `apps/api/test/engagement-context.integration.spec.ts`, `e2e/engagement-context.spec.ts` |
| Parameterized `$queryRaw` tagged-template SQL only (`0` `$queryRawUnsafe` calls across `108` AST-scanned files); `cursor` strictly validated for length (`<= 256`), canonical base64url round-trip, `YYYY-MM-DDTHH:MM:SS.ffffffZ` instant validity, and UUID v1–v8 syntax before query execution | Static AST + Unit + PG 19 integration | `PASS` | `apps/api/src/sessions/sessions.service.ts`, `apps/api/src/sessions/sessions.spec.ts`, `scripts/check-static-security.mjs` |
| Next.js `ProjectDetailPage` (`?cursor=...`) executes `requireAuthenticatedOwner()` prior to inspecting `params`/`searchParams` or calling domain endpoints, and forwards only `qaeh_session` with `cache: 'no-store'` | Static + RTL + Nginx Playwright | `PASS` | `apps/web/app/clients/[clientId]/projects/[projectId]/page.tsx`, `apps/web/src/lib/api.ts`, `apps/web/src/app/engagement.spec.tsx` |
| Owner-approved 30-day (`2026-11-27` -> `2026-12-27`) `postgres`-only container scan exception for `CVE-2025-6020` (`libpam* 1.5.2-6+deb12u2`, awaiting upstream Docker Hub `postgres:19-bookworm` rebuild) fails closed on any other image role, target, package, version, CVE, or expiry | Unit + 4-image Trivy OCI + Blocking fixtures | `PASS` | `scripts/container-scan-exceptions.json`, `scripts/container-scan-exceptions.test.mjs`, `.github/docs/runbook.md` |

## Findings

None (`VG-P103-01` and `VG-P103-02` remain planned future-slice items).
