# 03 — Expandability and Architecture (`P1-01`)

- **Run ID:** `20261118T162641Z-2d67a0c`
- **Reviewed baseline:** commit `2d67a0c2f654d4d1f6dcb4758f7022e85ebca5c8` (`feat/p1-01-local-foundation`)
- **Scope and evidence limits:** Reviews monorepo workspace boundaries, web/API separation, OpenAPI contract pipeline, Prisma baseline layout, and alignment with `ADR-001` and `project_sheet.md` §§6.0–6.5.

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Separate `apps/web` (Next.js standalone) and `apps/api` (NestJS Express) processes behind single-origin Nginx proxy | Static + local runtime | `PASS` | `compose.yaml`, `infra/nginx/default.conf`, `scripts/f01-containers.test.mjs` |
| Dependency direction enforced (`apps/web` → `@qa-evidence-hub/api-client` → HTTP `/api/v1/*` → `apps/api` → `PrismaService`) | Static + lint + test | `PASS` | `eslint.config.mjs` (`no-restricted-imports`), `apps/web/src/lib/api.ts` (`server-only`), `apps/web/src/app/page.spec.tsx` |
| OpenAPI contract exported from NestJS (`apps/api/openapi.json`) and TypeScript client generated without manual drift (`packages/api-client/src/generated/openapi.ts`) | Static + local runtime | `PASS` | `pnpm openapi:check` (`exit 0`), `apps/api/src/openapi/openapi-contract.spec.ts` |
| `ADR-001` accurately documents stack rationale, boundaries, alternatives, and operational trade-offs | Documentation review | `PASS` | `.github/docs/adr/001-next-nest-postgres-vps.md` |
| Zero premature `P1-02`–`P1-13` domain models, auth stubs, R2 SDKs, or dummy tables introduced | Static + DB runtime | `PASS` | `apps/api/prisma/schema.prisma`, `apps/api/test/health-readiness.integration.spec.ts` (`_prisma_migrations` is the sole table in `public`) |

## Findings

No confirmed defects, verification gaps, accepted limitations, or optional improvements identified in this area for `P1-01`.
