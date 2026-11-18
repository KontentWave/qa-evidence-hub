# 12 — Test Assurance and Validation Quality (`P1-01`)

- **Run ID:** `20261118T162641Z-2d67a0c`
- **Reviewed baseline:** commit `2d67a0c2f654d4d1f6dcb4758f7022e85ebca5c8` (`feat/p1-01-local-foundation`)
- **Scope and evidence limits:** Covers `P1-01` unit, contract, real-PostgreSQL integration, concurrent disposable test-DB isolation/teardown, production container/Nginx infrastructure tests, and existing `sync-sheet` regression tests. Cucumber.js BDD step bindings and Playwright CI `@smoke` suites begin in `P1-02`–`P1-07`.

## Executed Suite Summary

| Suite / Check | Runner | Tests | Result | Key Assertions |
| :---- | :---- | :---- | :---- | :---- |
| `apps/api/src/config/env.validation.spec.ts` | Vitest `5.1.1` | 6 | `PASS` | Valid env parsing, missing/malformed `DATABASE_URL` non-echoing errors, `DATABASE_POOL_MAX < POSTGRES_MAX_CONNECTIONS`, wildcard `TRUST_PROXY` rejection |
| `apps/api/src/health/health.controller.spec.ts` | Vitest `5.1.1` + Supertest `7.3.2` | 5 | `PASS` | `200` liveness, `200`/`503` readiness, `no-store` + `nosniff`, non-echoing `400` undeclared query rejection and `404` JSON |
| `apps/api/src/openapi/openapi-contract.spec.ts` + `pnpm openapi:check` | Vitest `5.1.1` + `openapi-typescript` `7.13.0` | 2 + CLI | `PASS` | Committed `apps/api/openapi.json` and `packages/api-client/src/generated/openapi.ts` zero-drift check; Swagger UI `404` when `NODE_ENV=production` |
| `apps/web/src/app/page.spec.tsx` | Vitest `5.1.1` + Testing Library + `jsdom` | 4 | `PASS` | `<main>` + single `<h1>`, `Ready` and `503` degraded text rendering, `cache: 'no-store'` fetch, absence of DB/storage deps and `DATABASE_URL`/`NEXT_PUBLIC_*` |
| `scripts/check-digests.test.mjs` + `pnpm verify:digests` | `node:test` | 6 + CLI | `PASS` | Positive pinned fixtures plus negative rejection of unpinned `FROM`, malformed hex, unknown stages, tag-only Compose images, fallback defaults, mismatched `postgres` digests, and all-zero placeholders |
| `scripts/sync-sheet.test.mjs` | `node:test` | 25 | `PASS` | Non-regression of preserved Google Drive sheet/roadmap sync helpers |
| `apps/api/test/health-readiness.integration.spec.ts` | `scripts/test-db.sh` + Vitest `5.1.1` | 3 | `PASS` | Real PostgreSQL `17.12` `prisma migrate deploy` (`_prisma_migrations` only), `200` `/api/v1/health/ready`, `400` undeclared query, `404` JSON |
| `scripts/test-db-isolation.test.mjs` | `node:test` + Docker Compose | 3 | `PASS` | Non-`qaeh_test_` refusal, concurrent `TEST_RUN_ID` isolation + `reset` restoration, induced `exit 42` failure zero-leftover cleanup |
| `scripts/f01-containers.test.mjs` | `node:test` + Docker + Compose | 1 (end-to-end) | `PASS` | Production image build, non-root `UID 1000`, zero internal host ports, Nginx `/`, `/_next/static/*`, `/api/v1/health*`, `413` body limits, wire-level spoofed `X-Forwarded-*` overwrite, synthetic row persistence across container recreation without `-v`, clean teardown |

## Findings

- Cross-reference `VG-P101-01` (`11-build-release-supply-chain.md`): Automated CI execution of these suites on pull requests (`F02`) is scheduled for `P1-02`.
- Cross-reference `VG-P101-02` (`08-functional-correctness-ux-accessibility.md`): Owner manual desktop keyboard/print-preview confirmation remains `Pending owner sign-off`.
