# 09 — Data Integrity, Privacy, and Lifecycle (`P1-04`)

- **Run ID:** `20261123T173817Z-d5fac14`
- **Reviewed baseline:** `d5fac14699321a165cd6d235dd77b20ceb9bac73`

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Non-null PostgreSQL `UUID` foreign keys (`projects.client_id -> clients.id`, `test_sessions.project_id -> projects.id`) with `ON DELETE RESTRICT ON UPDATE RESTRICT` preventing orphan creation (`23503`) and destructive parent deletion (`23001`) | Real PostgreSQL 19 runtime | `PASS` | `apps/api/prisma/migrations/20261123000000_engagement_context/migration.sql`, `apps/api/test/engagement-context.integration.spec.ts` |
| Trimmed, nonblank PostgreSQL `CHECK` constraints (`btrim`, `!~ '^\s|\s$'`, `char_length`) across `clients.name`, `projects.name`, `test_sessions.purpose`, and optional metadata/notes fields | Real PostgreSQL 19 runtime | `PASS` | `apps/api/prisma/migrations/20261123000000_engagement_context/migration.sql`, `apps/api/test/engagement-context.integration.spec.ts` |
| `projects.status` `project_status` enum (`Active` \| `Archived`) defaults to `Active` in both Prisma and PostgreSQL | Real PostgreSQL 19 runtime | `PASS` | `apps/api/prisma/schema.prisma`, `apps/api/test/engagement-context.integration.spec.ts` |
| `test_sessions` enforces `UNIQUE (project_id, id)` (`test_sessions_project_id_id_key`) and `CHECK (ended_at IS NULL OR ended_at >= started_at)` (`test_sessions_ended_at_not_before_started_at_check`) | Real PostgreSQL 19 runtime | `PASS` | `apps/api/test/engagement-context.integration.spec.ts` (`23514` check violation on `ended_at < started_at`; `23503` composite FK violation on cross-project reference) |
| Exact `public` schema table inventory (`_prisma_migrations`, `auth_sessions`, `clients`, `owners`, `projects`, `test_sessions`) with zero out-of-slice tables | Real PostgreSQL 19 & container runtime | `PASS` | `apps/api/test/health-readiness.integration.spec.ts`, `scripts/f01-containers.test.mjs`, `scripts/test-db-isolation.test.mjs` |

## Findings

None.
