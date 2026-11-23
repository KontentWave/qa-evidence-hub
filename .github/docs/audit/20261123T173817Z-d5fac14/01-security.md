# 01 — Security (`P1-04`)

- **Run ID:** `20261123T173817Z-d5fac14`
- **Reviewed baseline:** commit `d5fac14699321a165cd6d235dd77b20ceb9bac73` (`feat/p1-04-engagement-context` branched from `origin/main` `eb8bfad`, `git status --short` showing only preserved untracked `?? .github/skills/`)
- **Scope and evidence limits:** Covers `P1-04` (`AC01` `@S1` engagement context hierarchy — `clients`, `projects`, `test_sessions` — and `AC07` protected project HTML page guard) alongside retained `F01`/`F02` and `P1-03` auth/CSRF/proxy controls. Private R2 evidence downloads (`P1-05`), finding page & finding CSRF scenarios (`P1-06`), report page guard (`P1-07`), and live VPS TLS/Vault (`P1-11` / `F03`) remain deferred to their owning slices.

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Default-deny `APP_GUARD` (`AuthAndCsrfGuard`) returns `401` (`private, no-store, no-transform`, `nosniff`) on all anonymous `GET`/`POST` routes across `/api/v1/clients*`, `/api/v1/clients/:clientId/projects*`, and `/api/v1/projects/:projectId/sessions*` | Static + local PG runtime | `PASS` | `apps/api/src/clients/clients.controller.ts`, `apps/api/src/projects/projects.controller.ts`, `apps/api/src/sessions/sessions.controller.ts`, `apps/api/test/engagement-context.integration.spec.ts` |
| Service-level explicit `AuthenticatedActor` enforcement independent of HTTP controllers (`project_sheet.md` §6.5) | Static + Vitest unit | `PASS` | `apps/api/src/common/validation.util.ts` (`assertAuthorizedDomainActor`), `apps/api/src/{clients,projects,sessions}/*.spec.ts` |
| Authenticated `POST` mutations across `clients`, `projects`, and `sessions` require exact `Origin` and session-bound `X-CSRF-Token`, rejecting missing/invalid headers with `403` before creating records | Static + local PG & RTL runtime | `PASS` | `apps/api/src/auth/auth.guard.ts`, `apps/api/test/engagement-context.integration.spec.ts`, `apps/web/src/app/engagement.spec.tsx` |
| Anonymous HTML requests to `/clients`, `/clients/[clientId]`, `/clients/[clientId]/projects/[projectId]`, and `/clients/[clientId]/projects/[projectId]/sessions/[sessionId]` redirect (`307`) to `/login` with `private, no-store, no-transform`, zero `Set-Cookie`, and zero protected content | Static + RTL + Cucumber BDD + Nginx Playwright | `PASS` | `apps/web/app/clients/**`, `apps/web/src/app/engagement.spec.tsx`, `specs/features/private-access.feature` (`@P1-04` `project page`), `apps/api/bdd/engagement-context.steps.ts`, `e2e/engagement-context.spec.ts` |
| Next.js SSR reads forward strictly `qaeh_session` (`SAFE_SESSION_TOKEN_REGEX`) to fixed `INTERNAL_API_BASE_URL` with `cache: 'no-store'`, stripped `X-Forwarded-*`, and zero `Set-Cookie` emission | Static + RTL + Cucumber BDD + Nginx Playwright | `PASS` | `apps/web/src/lib/api.ts`, `apps/web/src/app/page.spec.tsx`, `apps/api/bdd/engagement-context.steps.ts`, `e2e/engagement-context.spec.ts` |
| Parent-scoped queries reject missing parents (`404`) and mismatched `(clientId, projectId)` or `(projectId, sessionId)` combinations (`404`) on both API and Next.js SSR routes | Static + PG integration + RTL | `PASS` | `apps/api/src/projects/projects.service.ts`, `apps/api/src/sessions/sessions.service.ts`, `apps/api/test/engagement-context.integration.spec.ts`, `apps/web/src/app/engagement.spec.tsx` |
| Runtime DTO allowlists (`whitelist: true`, `forbidNonWhitelisted: true`, `EmptyQueryDto`) reject undeclared properties (including attempted `status: 'Archived'` override on project creation) with `400` without echoing raw inputs | Static + PG integration | `PASS` | `apps/api/src/{clients,projects,sessions}/*.dto.ts`, `apps/api/test/engagement-context.integration.spec.ts` |
| Plain-text JSX rendering of all user text (`name`, `notes`, `description`, `testingContext`, `instructions`, `purpose`, session environment fields) with zero `dangerouslySetInnerHTML`, zero raw SQL (`$queryRawUnsafe`), and zero DB/storage imports or `NEXT_PUBLIC_`/`DATABASE_URL` references in `apps/web` | Static AST + ESLint + RTL | `PASS` | `pnpm verify:security:static` (`108` files), `pnpm lint`, `apps/web/src/app/page.spec.tsx` |
| Secret, dependency, SPDX license, and 4-image Trivy container scans | Local runtime | `PASS` | `pnpm verify:security:secrets`, `pnpm verify:security:deps`, `pnpm verify:licenses`, `pnpm verify:security:containers` (`0` leaks, `0` unreviewed HIGH/CRITICAL) |

## Confirmed Defects

None.

## Verification Gaps

- `VG-P103-01`: Live VPS HTTPS/TLS termination, HTTP→HTTPS redirect, and Compose secret-file mounts remain `NOT VERIFIED` until `P1-11` (`F03`).
- `VG-P103-02` (narrowed in `P1-04`): `project page` example in `specs/features/private-access.feature` is now `PASS` (`@P1-04`); remaining `AC07` domain scenarios (private `evidence` download in `P1-05`, `finding` page & finding CSRF mutation in `P1-06`, `project report` in `P1-07`) remain deferred to their owning slices.

## Accepted Limitations

None beyond documented Phase 1 scope.

## Optional Improvements

None beyond `OPT-P101-01` (carried forward from `P1-01`).
