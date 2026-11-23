# Audit Run `20261123T173817Z-d5fac14` — Phase 1 Slice 4 (`P1-04`) Review

## 1. Context and Reviewed Baseline

- **Run ID:** `20261123T173817Z-d5fac14`
- **Observation window:** `2026-11-23T16:45:00Z` – `2026-11-23T17:42:00Z`
- **Project:** QA Evidence Hub (`/home/marcel/projects/qa-evidence-hub`, GitHub `KontentWave/qa-evidence-hub`)
- **Intended use:** Private single-owner QA engagement evidence, finding/observation tracking, and printable project reporting web application; **current audit scope is bounded to `P1-04` (`AC01` `@S1` engagement context — `clients`, `projects`, `test_sessions` — and `AC07` protected project HTML page guard on synthetic data, `project_sheet.md` §§3, 5, 6.2–6.3, 6.6.2, 7.1)** alongside retained Foundation `F01`–`F02` and `P1-03` auth/CSRF/proxy gates.
- **Starting checkout baseline recorded before edits:**
  - `origin/main` / `main`: `eb8bfad77af14fa46aef47741422e9bf253c5b7b` (`eb8bfad`, after PR `#17` merge `984ac57` forwarding `AUTH_PASSWORD_SCRYPT_LN` and `AUTH_LOGIN_MAX_ATTEMPTS` in `compose.yaml`).
  - Initial `git status --short`: `?? .github/skills/` (unrelated local `.github/skills/implement-slice/SKILL.md`, preserved untouched and unstaged throughout `P1-04`).
- **Reviewed candidate baseline:**
  - Feature branch `feat/p1-04-engagement-context` at implementation commit `d5fac14699321a165cd6d235dd77b20ceb9bac73` (`d5fac14`), `git status --short` showing only preserved `?? .github/skills/`.
- **Verified container image digests on `d5fac14`:**
  - Local verified `apps/api/Dockerfile` (`runner`, `UID 1000`, `Node.js v24.22.3`): `sha256:2a96af11e556ab99aeb280b0fb9def9892e6329dfb7385e8c25edddd4d59b984` (`684.7 MiB`, `123.1 MiB` idle)
  - Local verified `apps/web/Dockerfile` (`runner`, `UID 1000`, `Node.js v24.22.3`): `sha256:ccb874de8445c3597c95e6b244d57cc2d8a51ca2d45a3039512a699680646ba2` (`260.7 MiB`, `56.62 MiB` idle)
  - Pinned base & stack images: `node:24.22.3-trixie-slim@sha256:af02d57b57719b9657a45199a79264a9437940cd55b3c7b3fc99615654f124a0`, `postgres:19-bookworm@sha256:f4859caf96de494e38efa69ed703b08a5bbd9605e152e604f2daec8841c87c41` (`PostgreSQL 19.0`, `99.05 MiB` idle), `nginx:1.31-alpine-slim@sha256:5bfced78d24d644270bedb0a9968697042e38d5c03fb6354603df025279c1cbe` (`nginx/1.31.9`, `6.652 MiB` idle).
  - Private GHCR image publishing (`release.yml`) is restricted by `F02` design to trusted `refs/heads/main` and `refs/tags/v*` refs (`NOT VERIFIED` on unmerged PR branch; executes post-merge).
- **Deployed environments & drift:** **None deployed.** All runtime verification ran on **synthetic data only** in isolated local WSL2 Docker (`PostgreSQL 19.0`, `Nginx 1.31.9`, `Node v24.22.3` containers) and GitHub Actions PR CI.

## 2. Changed and Created Repository Paths (`52` implementation files in `d5fac14` + documentation/audit)

- **Prisma & PostgreSQL migration (`2`):** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261123000000_engagement_context/migration.sql`.
- **NestJS API engagement modules, validation & OpenAPI (`20`):** `apps/api/openapi.json`, `apps/api/package.json`, `apps/api/src/app.module.ts`, `apps/api/src/common/validation.util.ts`, `apps/api/src/common/validation.util.spec.ts`, `apps/api/src/clients/{clients.dto.ts,clients.service.ts,clients.controller.ts,clients.module.ts,clients.spec.ts}`, `apps/api/src/projects/{projects.dto.ts,projects.service.ts,projects.controller.ts,projects.module.ts,projects.spec.ts}`, `apps/api/src/sessions/{sessions.dto.ts,sessions.service.ts,sessions.controller.ts,sessions.module.ts,sessions.spec.ts}`.
- **Generated OpenAPI client (`2`):** `packages/api-client/src/generated/openapi.ts`, `packages/api-client/src/index.ts`.
- **Next.js pages, accessible forms, timezone & SSR readers (`16`):** `apps/web/app/globals.css`, `apps/web/app/page.tsx`, `apps/web/app/clients/page.tsx`, `apps/web/app/clients/[clientId]/page.tsx`, `apps/web/app/clients/[clientId]/projects/[projectId]/page.tsx`, `apps/web/app/clients/[clientId]/projects/[projectId]/sessions/[sessionId]/page.tsx`, `apps/web/src/components/{workspace-header.tsx,create-client-form.tsx,create-project-form.tsx,create-session-form.tsx}`, `apps/web/src/lib/{api.ts,browser-csrf.ts,timezone.ts,timezone.spec.ts}`, `apps/web/src/app/{page.spec.tsx,engagement.spec.tsx}`.
- **Integration, BDD, container, Playwright & CI (`12`):** `package.json`, `specs/features/private-access.feature`, `apps/api/cucumber.engagement.mjs`, `apps/api/bdd/engagement-context.steps.ts`, `apps/api/vitest.integration.config.ts`, `apps/api/test/engagement-context.integration.spec.ts`, `apps/api/test/health-readiness.integration.spec.ts`, `scripts/f01-containers.test.mjs`, `scripts/test-db-isolation.test.mjs`, `e2e/engagement-context.spec.ts`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`.
- **Documentation & audit (`16`):** `.github/docs/project_sheet.md`, `.github/docs/CHANGELOG.md`, `.github/docs/runbook.md`, `.github/docs/audit/README.md`, `.github/docs/audit/20261123T173817Z-d5fac14/{README.md,01..12-*.md}`.

## 3. Verdicts and Status Separation (§6.6.2 / §8)

- **Foundation Gates `F01` & `F02`:** **`PASS` (Owner accepted; all `F01`/`F02` gates retained and green)**.
- **`P1-04` Implementation Status:** **`Complete`** on synthetic data (`feat/p1-04-engagement-context`).
- **Local Verification Status:** **`PASS`** (`0` confirmed defects; all quality, `98.36%`/`95.02%` service coverage across `9` files, `17/17` PG integration, `3/3` DB isolation, `7/7` BDD scenarios across `foundation`/`auth`/`engagement`, `1/1` `f01-containers`, `2/2` Playwright Nginx specs, and security/license/blocking checks `exit 0`).
- **Exact-Commit CI Status:** Verified on final PR head commit via all `4` required `ci.yml` status checks (`Quality, Types, OpenAPI & Coverage`, `PostgreSQL Integration & Foundation BDD`, `F01 Containers, Nginx & Playwright Smoke`, `Secrets, Static, Dependency, License & Blocking Fixtures`).
- **Owner Acceptance Status:** **`Pending owner sign-off`**.
- **Production / Real-Data Verdict:** **`NOT READY` (`INSUFFICIENT EVIDENCE`)** — real client data remains strictly unauthorized until `P1-05`–`P1-13`, `F03`–`F04`, and the section 8 Audit verdict complete.

## 4. Coverage Matrix

| Component / Path | Method & Depth | Baseline / Evidence | Coverage & Exclusions |
| :---- | :---- | :---- | :---- |
| `apps/api/prisma/**` (`clients`, `projects`, `test_sessions`) | Full SQL/Prisma review + real PostgreSQL 19 FK/CHECK/UNIQUE/composite-FK integration + `f01-containers` + `test-db-isolation` | `d5fac14` (static + local PG 19) | 100% reviewed and executed |
| `apps/api/src/{clients,projects,sessions,common}/**` | Full review + V8 unit coverage (`100%` lines & `100%` branches on all 3 new services; `98.36%`/`95.02%` aggregate across `9` files) + `engagement-context.integration.spec.ts` + Cucumber BDD | `d5fac14` (static + local runtime) | 100% reviewed |
| `packages/api-client/**`, `apps/api/openapi.json` | Full review + `pnpm openapi:check` + `openapi-contract.spec.ts` | `d5fac14` (local runtime) | 100% zero-drift verified |
| `apps/web/**`, `e2e/engagement-context.spec.ts` | Full review + Vitest/RTL (`15/15`) + standalone Next.js build + Cucumber SSR redirect/render + Playwright Chromium through Nginx (`2/2`) | `d5fac14` (static + local Docker runtime) | 100% reviewed; physical owner desktop `Tab`/`Ctrl+P` check remains `VG-P101-02` |
| `scripts/*`, `.github/workflows/{ci,release}.yml` | Full review + `verify:digests` + `verify:workflows` + `f01-containers` + Trivy 4-image scan + blocking fixtures (`5/5`) | `d5fac14` (local Docker runtime + PR CI) | 100% reviewed; `release.yml` private GHCR push runs post-merge on `main`/`v*` |

## 5. Category Reports and Non-Applicable Area Rationale

| Area | Report / Status | Summary |
| :---- | :---- | :---- |
| `01` Security | [01-security.md](./01-security.md) | Default-deny `401` + `403` CSRF/Origin on all 9 endpoints, explicit `AuthenticatedActor`, parent-scoped `404` on missing/mismatched parents, anonymous `/clients/.../projects/...` -> `307 /login` with zero leaked content, `qaeh_session`-only `no-store` SSR |
| `02` Optimization & resource efficiency | [02-optimization.md](./02-optimization.md) | Zero new npm deps, composite B-tree indexes, bounded `200`-item list queries, parallel SSR fetches with `4s` timeout |
| `03` Expandability & architecture | [03-expandability.md](./03-expandability.md) | `test_sessions` separate from `auth_sessions`, `UNIQUE (project_id, id)` ready for downstream composite FKs, zero OpenAPI drift |
| `04` Reliability & dependability | [04-reliability-dependability.md](./04-reliability-dependability.md) | `FOR SHARE` project-status lock in `createSession`, `P2003` -> `404`, `fileParallelism: false` DB test isolation |
| `05` Maintainability | [05-maintainability.md](./05-maintainability.md) | `167` formatted files, `0` ESLint issues, strict TS across all workspaces & `e2e`, reconciled docs |
| `06` Error handling & exceptions | [06-error-handling.md](./06-error-handling.md) | Distinct `400`/`401`/`403`/`404`/`409` responses, accessible form error summaries, zero internal leakage |
| `07` Legacy & obsolete code | **`NOT APPLICABLE`** | Additive `P1-04` slice atop `main` (`eb8bfad`); no obsolete code or dependencies introduced, and temporary local test images removed |
| `08` Functional correctness, UX & accessibility | [08-functional-correctness-ux-accessibility.md](./08-functional-correctness-ux-accessibility.md) | Client -> active project -> session creation & reload persistence, `Europe/Bratislava` formatting + DST-gap/rollover rejection, `#session-error-summary` focus & preserved inputs |
| `09` Data integrity, privacy & lifecycle | [09-data-integrity-privacy-lifecycle.md](./09-data-integrity-privacy-lifecycle.md) | PostgreSQL 19 `ON DELETE RESTRICT` FKs, trimmed nonblank `CHECK`s, `Active` default, `UNIQUE(project_id, id)`, `ended_at >= started_at` |
| `10` Observability, operations & recovery | [10-observability-operations-recovery.md](./10-observability-operations-recovery.md) | Health probes & Compose `--env-file` auth overrides intact, `cucumber-engagement.json` CI artifact retention |
| `11` Build, release, config & supply chain | [11-build-release-supply-chain.md](./11-build-release-supply-chain.md) | `@sha256:` & 40-SHA pins verified, `0` lockfile diff, `625` SPDX licenses, clean 4-image Trivy scan |
| `12` Test assurance & validation quality | [12-test-assurance.md](./12-test-assurance.md) | Red->Green TDD, `98.36%`/`95.02%` service coverage (`100%`/`100%` on all 3 `P1-04` services), `17/17` PG integration, `7/7` BDD, `2/2` Nginx Playwright |

## 6. Sanitized Validation Ledger

Tool versions: `node v24.21.0` (local host) / `v24.22.3` (containers), `corepack 0.36.0`, `pnpm 12.21.0`, `Docker Engine 29.1.3`, `Docker Compose v5.8.0`, `TypeScript 5.9.3`, `ESLint 10.15.0`, `Vitest 5.1.1` (`@vitest/coverage-v8 5.1.1`), `@cucumber/cucumber 13.3.0`, `@playwright/test 1.65.1`, `Prisma 7.10.1`, `PostgreSQL 19.0`, `Nginx 1.31.9`, `Gitleaks v8.30.1`, `Trivy 0.76.2`.

| Criterion | Environment | Command / Procedure (Sanitized) | Result / Exit Code | Evidence |
| :---- | :---- | :---- | :---- | :---- |
| Red-phase verification prior to `P1-04` implementation | Local WSL2 & Docker (`PostgreSQL 19.0`) | `pnpm test:integration` and `pnpm test:bdd:engagement` | `FAIL` as expected (`exit 1` on both before implementation) | [12-test-assurance.md](./12-test-assurance.md) |
| Image digest & workflow SHA/security check | Local WSL2 | `pnpm verify:digests && pnpm verify:workflows` | `PASS` (`exit 0`) | [11-build-release-supply-chain.md](./11-build-release-supply-chain.md) |
| `.editorconfig` formatting & ESLint boundary rules | Local WSL2 | `pnpm format:check && pnpm lint` | `PASS` (`exit 0`, `167` files, `0` warnings/errors) | [05-maintainability.md](./05-maintainability.md) |
| Strict TypeScript (`api-client`, `api`, `web`, `e2e`) & OpenAPI zero-drift | Local WSL2 | `pnpm typecheck && pnpm openapi:check` | `PASS` (`exit 0`) | [03-expandability.md](./03-expandability.md) |
| Unit, contract, web RTL & gate suites | Local WSL2 | `pnpm test` | `PASS` (`exit 0`, `95/95`: API `26`, Web `15`, `node:test` `54`) | [12-test-assurance.md](./12-test-assurance.md) |
| `>= 80%` line & branch `apps/api/src/{auth,clients,projects,sessions}/` V8 coverage gate | Local WSL2 | `pnpm test:coverage` | `PASS` (`exit 0`, `98.36%` lines / `95.02%` branches across `9` files; `100%`/`100%` on `clients`, `projects`, `sessions`) | [12-test-assurance.md](./12-test-assurance.md) |
| Production workspace build (`api-client`, `api`, `web` standalone) | Local WSL2 | `pnpm build` | `PASS` (`exit 0`; all `5` protected routes + `/login` `ƒ Dynamic`) | [11-build-release-supply-chain.md](./11-build-release-supply-chain.md) |
| Disposable PostgreSQL 19 constraints & API integration + concurrent DB isolation | Local Docker (`PostgreSQL 19.0`) | `pnpm test:integration && node --test scripts/test-db-isolation.test.mjs` | `PASS` (`exit 0`, `17/17` + `3/3`) | [09-data-integrity-privacy-lifecycle.md](./09-data-integrity-privacy-lifecycle.md) |
| Cucumber.js Foundation (`@foundation`), Auth (`@P1-03`), & Engagement (`(@AC01 and @S1) or @P1-04`) BDD | Local Docker (`PostgreSQL 19.0` + Next.js) | `pnpm test:bdd:foundation && pnpm test:bdd:auth && pnpm test:bdd:engagement` | `PASS` (`exit 0`, `1/1` + `3/3` + `3/3` = `7/7` scenarios, `52/52` steps) | [12-test-assurance.md](./12-test-assurance.md) |
| `F01` + `P1-03`/`P1-04` containers, non-root UID, private ports, `--env-file` auth overrides, HTTPS `Secure` cookie & table inventory | Local Docker (`Node v24.22.3`, `PG 19.0`, `Nginx 1.31.9`) | `node --test scripts/f01-containers.test.mjs` | `PASS` (`exit 0`, `1/1`, `129.8s`) | [01-security.md](./01-security.md), [10-observability-operations-recovery.md](./10-observability-operations-recovery.md) |
| Playwright Chromium E2E through Nginx (auth smoke + client/project/session creation, error focus & input preservation, reload persistence, anonymous project-page redirect) | Local Docker (`Nginx 1.31.9`) | `pnpm test:e2e:foundation` | `PASS` (`exit 0`, `2/2`) | [08-functional-correctness-ux-accessibility.md](./08-functional-correctness-ux-accessibility.md) |
| Gitleaks secrets, AST/Trivy IaC static (`108` files), `pnpm audit` deps, 4-image Trivy OCI, SPDX licenses (`625` entries) & negative blocking fixtures | Local WSL2 & Docker | `pnpm verify:security:containers && pnpm verify:security:secrets && pnpm verify:security:static && pnpm verify:security:deps && pnpm verify:licenses && pnpm test:gates:blocking` | `PASS` (`exit 0`, `0` leaks/vulns, `5/5` blocking fixtures) | [01-security.md](./01-security.md), [11-build-release-supply-chain.md](./11-build-release-supply-chain.md) |
| Trusted-ref `release.yml` private GHCR push & SPDX SBOM retention for `P1-04` | GitHub Actions `Release` | Triggered only on `refs/heads/main` / `refs/tags/v*` after PR merge | `NOT VERIFIED` (by `F02` read-only PR CI design; executes post-merge) | `.github/workflows/release.yml` |
| Remaining deferred `private-access.feature` scenarios (private R2 evidence download, finding page/CSRF, project report) | Future slices `P1-05`–`P1-07` | Deferred per slice scope (`P1-04` excludes evidence, findings & reports) | `NOT VERIFIED` (`VG-P103-02` narrowed; dependent on `P1-05`–`P1-07`) | [01-security.md](./01-security.md) |
| Live VPS HTTPS/TLS, Ansible Vault secret mounts, off-VPS backups/restores & monitoring (`F03`–`F04`) | Production VPS | Planned in `P1-11`–`P1-12` | `NOT VERIFIED` (`VG-P103-01`, no VPS provisioned yet) | [01-security.md](./01-security.md) |
| Physical owner desktop browser `Tab` & `Ctrl+P` print-preview confirmation | Owner desktop browser | Manual confirmation by owner | `NOT VERIFIED` (`VG-P101-02`, `Pending owner sign-off`) | [08-functional-correctness-ux-accessibility.md](./08-functional-correctness-ux-accessibility.md) |

## 7. Prior-Findings Reconciliation & Active Findings

| ID | Type | Severity | Prior State | Current State | Disposition & Notes |
| :---- | :---- | :---- | :---- | :---- | :---- |
| `P103-RV-04` | Confirmed defect (follow-up) | Low | `resolved` in `96796bb` (`20261123T144201Z-96796bb`) | `resolved` (merged on `main` via PR `#17`, `984ac57`) | Verified present in `compose.yaml` and passing in `scripts/f01-containers.test.mjs`. |
| `VG-P101-02` | Verification gap | Low | `open` | `open` | `Pending owner sign-off` — physical owner desktop `Tab` focus & `Ctrl+P` print-preview check (automated Chromium keyboard/error focus verified in `e2e/foundation-smoke.spec.ts` and `e2e/engagement-context.spec.ts`). |
| `VG-P103-01` | Verification gap | Medium (for real data; non-blocking for `P1-04` synthetic scope) | `open` | `open` | `Pending P1-11 / P1-12` — live VPS TLS, Vault secret mounts, and `F03`–`F04` recovery rehearsals required before real client data. |
| `VG-P103-02` | Verification gap | Low (planned slice boundary) | `open` | `open` (narrowed) | `Pending P1-05..P1-07` — `project page` example verified `PASS` in `P1-04`; remaining `private-access.feature` domain scenarios (`evidence download`, `finding page/CSRF`, `project report`) deferred to `P1-05`–`P1-07`. |
| `OPT-P101-01` | Optional improvement | Low / Info | `open` | `open` | `Pending owner sign-off` — optional `pnpm deploy` `api` image-size reduction (`684.7 MiB`) before `P1-11`. |
