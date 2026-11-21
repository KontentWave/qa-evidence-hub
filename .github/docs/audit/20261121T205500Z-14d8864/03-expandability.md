# 03 — Expandability and Architecture (`P1-03`)

- **Run ID:** `20261121T205500Z-14d8864`
- **Reviewed baseline:** `14d886482670619d89a666d97c1c34e80bbe7a7d`

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Application services accept an explicit `AuthenticatedActor` and enforce authorization independently of HTTP controllers (`project_sheet.md` §6.5) | Static + unit runtime | `PASS` | `apps/api/src/auth/auth.decorators.ts` (`AuthenticatedActor`, `@CurrentActor()`), `apps/api/src/auth/auth.service.ts` (`assertAuthorizedActor`), `apps/api/src/auth/auth.spec.ts` |
| Default-deny `APP_GUARD` protects all future domain controllers (`P1-04`–`P1-10`) automatically without per-route opt-in boilerplate | Static + integration runtime | `PASS` | `apps/api/src/auth/auth.module.ts`, `apps/api/src/auth/auth.guard.ts`, `apps/api/test/auth-api.integration.spec.ts` (`TestProtectedProbeController`) |
| Strict `apps/web` / `apps/api` boundary preserved (`apps/web` imports only `@qa-evidence-hub/api-client`, zero DB/storage packages or Server Action business logic) | Static + ESLint + Vitest | `PASS` | `eslint.config.mjs`, `apps/web/src/lib/api.ts`, `apps/web/src/app/page.spec.tsx`, `pnpm openapi:check` |
| `ADR-001` and `ADR-015` reconciled with as-built `P1-03` auth, proxy trust, SSR, and CI coverage state | Documentation review | `PASS` | `.github/docs/adr/001-next-nest-postgres-vps.md`, `.github/docs/adr/015-phase1-delivery-profile.md` |

## Findings

None.
