# 04 — Reliability and Dependability (`P1-04`)

- **Run ID:** `20261123T173817Z-d5fac14`
- **Reviewed baseline:** `d5fac14699321a165cd6d235dd77b20ceb9bac73`

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Transactional `SELECT ... FROM "projects" WHERE "id" = $1 FOR SHARE` before `testSession.create` prevents concurrent project archival (`P1-10`) from racing with session creation | Static + unit + PG integration | `PASS` | `apps/api/src/sessions/sessions.service.ts`, `apps/api/src/sessions/sessions.spec.ts`, `apps/api/test/engagement-context.integration.spec.ts` |
| Prisma `P2003` foreign-key race mapped cleanly to `NotFoundException` (`404`) rather than `500` | Static + unit | `PASS` | `apps/api/src/projects/projects.service.ts`, `apps/api/src/projects/projects.spec.ts` |
| Sequential integration-file execution (`fileParallelism: false`) eliminates cross-file `TRUNCATE` races against shared disposable PostgreSQL | Local PG runtime | `PASS` | `apps/api/vitest.integration.config.ts`, `pnpm test:integration` (`17/17`) |
| Race-free in-flight CSRF bootstrap deduplication across `CreateClientForm`, `CreateProjectForm`, and `CreateSessionForm` | Static + RTL + Playwright | `PASS` | `apps/web/src/components/create-{client,project,session}-form.tsx`, `apps/web/src/app/engagement.spec.tsx`, `e2e/engagement-context.spec.ts` |
| Additive SQL migration (`20261123000000_engagement_context`) applies cleanly and persists across container recreation | Local Docker & PG runtime | `PASS` | `scripts/test-db-isolation.test.mjs` (`3/3`), `scripts/f01-containers.test.mjs` (`1/1`) |

## Findings

None.
