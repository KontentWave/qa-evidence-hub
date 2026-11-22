# Audit Run `20261121T205500Z-14d8864` — Phase 1 Slice 3 (`P1-03`) Review

## 1. Context and Reviewed Baseline

- **Run ID:** `20261121T205500Z-14d8864`
- **Observation window:** `2026-11-21T19:41:00Z` – `2026-11-21T20:57:00Z`
- **Project:** QA Evidence Hub (`/home/marcel/projects/qa-evidence-hub`, GitHub `KontentWave/qa-evidence-hub`)
- **Intended use:** Private single-owner QA engagement evidence, finding/observation tracking, and printable project reporting web application; **current audit scope is bounded to `P1-03` (`AC07` single-owner authentication, session boundary, and CSRF protection on synthetic data, §§2–4, 6.2, 6.6, 6.6.2, 7.1)** alongside retained Foundation `F01`–`F02` gates.
- **Starting checkout baseline recorded before edits:**
  - `origin/main` / `HEAD`: `fbdaa55db4bfbebc2622546b4a97cd840c661594` (`fbdaa55`, Merge PR `#12` `fix/p1-02-astra-f02-hardening`; `F02` at `v0.2.1` accepted by owner)
  - Initial `git status --short`: `?? .github/skills/` (local `.github/skills/implement-slice/SKILL.md`, preserved untouched and unstaged throughout `P1-03`)
- **Reviewed candidate baseline:**
  - Feature branch `feat/p1-03-single-owner-auth` (PR [#13](https://github.com/KontentWave/qa-evidence-hub/pull/13)) at commit `14d886482670619d89a666d97c1c34e80bbe7a7d` (`14d8864`), `git status --short` showing only preserved `?? .github/skills/`.
  - Exact-commit GitHub Actions PR `CI` run: [44948487083](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44948487083) (`4/4` required jobs `success`: [Quality, Types, OpenAPI & Coverage](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44948487083/job/136980962142), [PostgreSQL Integration & Foundation BDD](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44948487083/job/136980961947), [F01 Containers, Nginx & Playwright Smoke](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44948487083/job/136980962154), [Secrets, Static, Dependency, License & Blocking Fixtures](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44948487083/job/136980962049)).
- **Verified container image digests on `14d8864`:**
  - Local verified `apps/api/Dockerfile` (`runner`, `UID 1000`): `sha256:9cf05e9afd68cd493ddb65ebe318e95fc8aa9978704391668a4f73cd8750f7c9` (`684.3 MiB`)
  - Local verified `apps/web/Dockerfile` (`runner`, `UID 1000`): `sha256:a39347630bbb8bbe7dddd8431a2b52748d86eb083c12f3f0f37766ec85f043f4` (`260.4 MiB`)
  - Pinned base & stack images: `node:24.22.3-trixie-slim@sha256:af02d57b57719b9657a45199a79264a9437940cd55b3c7b3fc99615654f124a0`, `postgres:17-bookworm@sha256:837bed18782820fe967067cb5328b02b0d9992c1be9a37ee0c9c492cfc03af3b` (`PostgreSQL 17.12`), `nginx:1.30-alpine-slim@sha256:8c950211a641ec5b23f265450517001f6bcca533666120ebe36cb4cff3d00a55` (`nginx/1.30.7`).
  - Note: Private GHCR image publishing (`release.yml`) is restricted by design to trusted `refs/heads/main` and `refs/tags/v*` refs (`permissions: contents: read` on PR CI) and executes post-merge (`NOT VERIFIED` on unmerged PR branch by `F02` least-privilege rule).
- **Deployed environments & drift:** **None deployed.** No staging or production VPS, domain/TLS, or Cloudflare R2 bucket exists yet. All runtime verification was performed on **synthetic data only** in isolated local WSL2 Docker and GitHub Actions `ubuntu-latest` runners.

## 2. Changed and Created Repository Paths (`62` files in `14d8864`)

- **Database & operator CLI (`4`):** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261121000000_owner_and_auth_sessions/migration.sql`, `scripts/provision-owner.ts`, `scripts/provision-owner.test.mjs`.
- **NestJS API auth, config, proxy trust & OpenAPI (`23`):** `apps/api/package.json`, `apps/api/Dockerfile`, `apps/api/openapi.json`, `apps/api/src/app.module.ts`, `apps/api/src/app.setup.ts`, `apps/api/src/common/http-exception.filter.ts`, `apps/api/src/config/env.validation.ts`, `apps/api/src/config/env.validation.spec.ts`, `apps/api/src/config/trusted-proxy.ts`, `apps/api/src/health/health.controller.ts`, `apps/api/src/health/health.controller.spec.ts`, `apps/api/src/openapi/export-openapi.ts`, `apps/api/src/openapi/openapi-contract.spec.ts`, `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/auth.decorators.ts`, `apps/api/src/auth/auth.dto.ts`, `apps/api/src/auth/auth.guard.ts`, `apps/api/src/auth/auth.module.ts`, `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.spec.ts`, `apps/api/src/auth/csrf.service.ts`, `apps/api/src/auth/login-throttler.service.ts`, `apps/api/src/auth/password-hasher.service.ts`.
- **Generated OpenAPI client (`2`):** `packages/api-client/src/generated/openapi.ts`, `packages/api-client/src/index.ts`.
- **Next.js login/logout UI & SSR boundary (`9`):** `apps/web/app/globals.css`, `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`, `apps/web/app/login/page.tsx`, `apps/web/app/not-found.tsx`, `apps/web/src/components/login-form.tsx`, `apps/web/src/components/logout-button.tsx`, `apps/web/src/lib/api.ts`, `apps/web/src/app/page.spec.tsx`, `apps/web/src/app/login.spec.tsx` (`10` web files total).
- **Integration, BDD, container/HTTPS, E2E, Compose & CI (`18`):** `.dockerignore`, `.env.example`, `compose.yaml`, `compose.dev.yaml`, `package.json`, `tsconfig.e2e.json`, `apps/api/cucumber.auth.mjs`, `apps/api/bdd/foundation-readiness.steps.ts`, `apps/api/bdd/private-access.steps.ts`, `apps/api/test/auth-api.integration.spec.ts`, `apps/api/test/health-readiness.integration.spec.ts`, `specs/features/private-access.feature`, `e2e/foundation-smoke.spec.ts`, `scripts/f01-containers.test.mjs`, `scripts/run-playwright-foundation-smoke.mjs`, `scripts/test-db-isolation.test.mjs`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`.
- **Documentation (`5`):** `.github/docs/runbook.md`, `.github/docs/adr/001-next-nest-postgres-vps.md`, `.github/docs/adr/015-phase1-delivery-profile.md`, `.github/docs/CHANGELOG.md`, `.github/docs/project_sheet.md`.

## 3. Verdicts and Status Separation (§6.6.2 / §8)

- **Foundation Gates `F01` & `F02`:** **`PASS` (Owner accepted; all `F01`/`F02` gates retained and green on `14d8864`)**.
- **`P1-03` Implementation Status:** **`Complete`** on synthetic data (`feat/p1-03-single-owner-auth`, PR [#13](https://github.com/KontentWave/qa-evidence-hub/pull/13)).
- **Local Verification Status:** **`PASS`** (`0` confirmed defects; all quality, `98.22%`/`96.23%` `auth/` service coverage, PostgreSQL integration, Foundation + `@P1-03` BDD, `F01` + test-only HTTPS Nginx container, Playwright Chromium smoke, and security/license/blocking checks `exit 0`).
- **Exact-Commit CI Status:** **`PASS`** on `14d8864` — CI run [44948487083](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44948487083) (`4/4` required checks green).
- **Owner Acceptance Status:** **`Pending owner sign-off`** on `P1-03` (PR [#13](https://github.com/KontentWave/qa-evidence-hub/pull/13)).
- **Production / Real-Data Verdict:** **`NOT READY` (`INSUFFICIENT EVIDENCE`)** — real client data remains strictly unauthorized until `P1-04`–`P1-13`, `F03`–`F04`, and the section 8 Audit verdict complete.

## 4. Coverage Matrix

| Component / Path | Method & Depth | Baseline / Evidence | Coverage & Exclusions |
| :---- | :---- | :---- | :---- |
| `apps/api/prisma/**`, `scripts/provision-owner*` | Full review + unit (`provision-owner.test.mjs`) + concurrent real-PG & container CLI integration | `14d8864` (static + local + CI) | 100% reviewed and executed |
| `apps/api/src/auth/**`, `apps/api/src/config/**`, `apps/api/src/common/**`, `apps/api/src/app.*` | Full line-by-line review + V8 unit coverage (`98.22%` lines / `96.23%` branches) + `auth-api.integration.spec.ts` + Cucumber `@P1-03` | `14d8864` (static + local + CI) | 100% of `auth/` and modified config/filter files reviewed |
| `packages/api-client/**`, `apps/api/openapi.json` | Full review + `pnpm openapi:check` + `openapi-contract.spec.ts` | `14d8864` (local + CI) | 100% zero-drift verified |
| `apps/web/**`, `e2e/foundation-smoke.spec.ts` | Full review + RTL (`8/8`) + standalone build + Playwright Chromium (`1/1`) | `14d8864` (static + local + CI) | 100% reviewed; physical owner desktop `Tab`/`Ctrl+P` check remains `VG-P101-02` |
| `compose*.yaml`, `apps/api/Dockerfile`, `.dockerignore`, `scripts/f01-containers.test.mjs`, `scripts/run-playwright-foundation-smoke.mjs`, `scripts/test-db-isolation.test.mjs`, `.github/workflows/*.yml` | Full review + `verify:digests` + `verify:workflows` + `f01-containers` (HTTP + verified-CA HTTPS) + Trivy 4-image scan + live CI run `44948487083` | `14d8864` (local + CI) | 100% reviewed; post-merge `release.yml` GHCR publish runs only on `main`/`v*` |
| `.github/docs/{runbook.md,CHANGELOG.md,project_sheet.md,adr/*}` | Full consistency review against code and `project_sheet.md` §§2–4, 6.2, 6.6.2, 7.1 | `14d8864` (documentation) | 100% reviewed |

## 5. Category Reports and Non-Applicable Area Rationale

| Area | Report / Status | Summary |
| :---- | :---- | :---- |
| `01` Security | [01-security.md](./01-security.md) | DB singleton owner, `scrypt` PHC + hidden/stdin CLI, SHA-256 session digests, host-only `HttpOnly`/`Secure`/`SameSite=Lax` cookie, pre/post-login HMAC CSRF + exact `Origin` before multipart, explicit `nginx` proxy trust, HTTPS Nginx proof |
| `02` Optimization & resource efficiency | [02-optimization.md](./02-optimization.md) | Zero new npm deps, bounded `4096`-key login throttler, bounded `4+16` `scrypt` queue, read-only SSR (`xmin` unchanged), `20`-session cap |
| `03` Expandability & architecture | [03-expandability.md](./03-expandability.md) | Service-level `AuthenticatedActor` enforcement, default-deny `APP_GUARD`, strict `web`/`api` OpenAPI boundary |
| `04` Reliability & dependability | [04-reliability-dependability.md](./04-reliability-dependability.md) | Concurrent provisioning race proof, transactional reset + session revocation, race-free browser CSRF bootstrap, volume persistence |
| `05` Maintainability | [05-maintainability.md](./05-maintainability.md) | `133` formatted files, `0` ESLint issues, strict TS across `scripts/*.ts`, zero OpenAPI drift, updated runbook/ADRs/changelog |
| `06` Error handling & exceptions | [06-error-handling.md](./06-error-handling.md) | Generic `401` login failures, distinct `400`/`401`/`403`/`429` (`Retry-After`), zero secret/DSN leakage in CLI or HTTP |
| `07` Legacy & obsolete code | **`NOT APPLICABLE`** | Additive `P1-03` slice atop `v0.2.1` (`fbdaa55`); no obsolete application code or dependencies exist, and temporary local test images were removed |
| `08` Functional correctness, UX & accessibility | [08-functional-correctness-ux-accessibility.md](./08-functional-correctness-ux-accessibility.md) | Anonymous `/` -> `/login` redirect, labeled inputs, `Tab`/`Enter` keyboard flow, `#login-error-summary` focus, owner `Ready` + logout |
| `09` Data integrity, privacy & lifecycle | [09-data-integrity-privacy-lifecycle.md](./09-data-integrity-privacy-lifecycle.md) | PostgreSQL `CHECK`/unique/FK constraints on `owners` and `auth_sessions`, digest-only storage, `private, no-store, no-transform` headers |
| `10` Observability, operations & recovery | [10-observability-operations-recovery.md](./10-observability-operations-recovery.md) | Health probe continuity under `https://` `APP_ORIGIN`, containerized `provision-owner.ts` runbook, retained CI BDD/Playwright artifacts |
| `11` Build, release, config & supply chain | [11-build-release-supply-chain.md](./11-build-release-supply-chain.md) | Immutable `@sha256:` & 40-SHA pins, `0` lockfile diff, `625` SPDX entries verified, clean 4-image Trivy scan |
| `12` Test assurance & validation quality | [12-test-assurance.md](./12-test-assurance.md) | Red->Green TDD, `98.22%`/`96.23%` `auth/` coverage, `10/10` PG integration, `4/4` BDD scenarios, HTTP+HTTPS `f01-containers`, Chromium E2E |

## 6. Sanitized Validation Ledger

Tool versions: `node v24.21.0` (local) / `v24.22.3` (containers), `corepack 0.36.0`, `pnpm 12.21.0`, `Docker Engine 29.1.3`, `Docker Compose v5.8.0`, `Docker Buildx v0.39.0`, `OpenSSL 3.0.2`, `TypeScript 5.9.3`, `ESLint 10.15.0`, `Vitest 5.1.1` (`@vitest/coverage-v8 5.1.1`), `@cucumber/cucumber 13.3.0`, `@playwright/test 1.65.1`, `Prisma 7.10.1`, `PostgreSQL 17.12`, `Nginx 1.30.7`, `Gitleaks v8.30.1`, `Trivy 0.76.2`.

| Criterion | Environment | Command / Procedure (Sanitized) | Result / Exit Code | Evidence |
| :---- | :---- | :---- | :---- | :---- |
| Image digest & workflow SHA/security check | Local WSL2 & CI (`14d8864`) | `pnpm verify:digests && pnpm verify:workflows` | `PASS` (`exit 0`) | [Job 136980962142](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44948487083/job/136980962142) |
| `.editorconfig` formatting (`133` files) & ESLint (`0` errors) | Local WSL2 & CI (`14d8864`) | `pnpm format:check && pnpm lint` | `PASS` (`exit 0`) | [Job 136980962142](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44948487083/job/136980962142) |
| Strict TypeScript (`api-client`, `api`, `web`, `e2e`, `scripts/*.ts`) & OpenAPI zero-drift | Local WSL2 & CI (`14d8864`) | `pnpm typecheck && pnpm openapi:check` | `PASS` (`exit 0`) | [Job 136980962142](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44948487083/job/136980962142) |
| Unit, contract, web RTL, `provision-owner` & gate suites | Local WSL2 & CI (`14d8864`) | `pnpm test` | `PASS` (`exit 0`, `80/80`: API `18`, Web `8`, `node:test` `54`) | [Job 136980962142](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44948487083/job/136980962142) |
| `>= 80%` line & branch `apps/api/src/auth/` V8 coverage gate | Local WSL2 & CI (`14d8864`) | `pnpm test:coverage` | `PASS` (`exit 0`, `98.22%` lines / `96.23%` branches across `6` files) | [12-test-assurance.md](./12-test-assurance.md), [Job 136980962142](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44948487083/job/136980962142) |
| Production workspace build (`api-client`, `api`, `web` standalone) | Local WSL2 & CI (`14d8864`) | `pnpm build` | `PASS` (`exit 0`; `/` & `/login` `ƒ Dynamic`) | [Job 136980962142](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44948487083/job/136980962142) |
| Disposable PostgreSQL migration & `auth-api.integration.spec.ts` + concurrent DB isolation | Local Docker & CI (`14d8864`) | `pnpm test:integration && node --test scripts/test-db-isolation.test.mjs` | `PASS` (`exit 0`, `10/10` + `3/3`) | [01-security.md](./01-security.md), [Job 136980961947](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44948487083/job/136980961947) |
| Cucumber.js Foundation (`@foundation`) & Auth (`@P1-03` `private-access.feature`) BDD | Local Docker & CI (`14d8864`) | `pnpm test:bdd:foundation && pnpm test:bdd:auth` | `PASS` (`exit 0`, `1/1` + `3/3` scenarios, `31/31` steps) | [12-test-assurance.md](./12-test-assurance.md), [Job 136980961947](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44948487083/job/136980961947) |
| `F01` + `P1-03` containers, non-root UID, private ports, operator CLI, auth/SSR/logout & test-only HTTPS `Secure`-cookie Nginx proof | Local Docker & CI (`14d8864`) | `node --test scripts/f01-containers.test.mjs` | `PASS` (`exit 0`, `1/1`) | [01-security.md](./01-security.md), [Job 136980962154](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44948487083/job/136980962154) |
| Playwright Chromium smoke through Nginx (anonymous `/` -> `/login`, keyboard error focus, login -> `Ready`, logout denial) | Local Docker & CI (`14d8864`) | `pnpm test:e2e:foundation` | `PASS` (`exit 0`, `1/1`) | [08-functional-correctness-ux-accessibility.md](./08-functional-correctness-ux-accessibility.md), [Job 136980962154](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44948487083/job/136980962154) |
| Gitleaks secrets, AST/Trivy IaC static, `pnpm audit` deps, 4-image Trivy OCI, SPDX licenses & negative blocking fixtures | Local WSL2 & CI (`14d8864`) | `pnpm verify:security:secrets && pnpm verify:security:static && pnpm verify:security:deps && pnpm verify:security:containers && pnpm verify:licenses && pnpm test:gates:blocking` | `PASS` (`exit 0`, `0` leaks/vulns, `625` licenses, `5/5` blocking fixtures) | [Job 136980962049](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44948487083/job/136980962049), [Job 136980962154](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44948487083/job/136980962154) |
| Trusted-ref `release.yml` private GHCR push & SPDX SBOM retention for `P1-03` | GitHub Actions `Release` | Triggered only on `refs/heads/main` / `refs/tags/v*` after PR `#13` merge | `NOT VERIFIED` (by `F02` read-only PR CI design; executes automatically upon merge to `main`) | `.github/workflows/release.yml` |
| Deferred `private-access.feature` domain scenarios (project/finding/report pages, private R2 download, finding CSRF) | Future slices `P1-04`–`P1-07` | Deferred per slice scope (`P1-03` excludes domain entities & R2) | `NOT VERIFIED` (`VG-P103-02`, dependent on `P1-04`–`P1-07`) | [01-security.md](./01-security.md) |
| Live VPS HTTPS/TLS, Ansible Vault secret mounts, off-VPS backups/restores & monitoring (`F03`–`F04`) | Production VPS | Planned in `P1-11`–`P1-12` | `NOT VERIFIED` (`VG-P103-01`, no VPS provisioned yet) | [01-security.md](./01-security.md) |
| Physical owner desktop browser `Tab` & `Ctrl+P` print-preview confirmation | Owner desktop browser | Manual confirmation by owner | `NOT VERIFIED` (`VG-P101-02`, `Pending owner sign-off`) | [08-functional-correctness-ux-accessibility.md](./08-functional-correctness-ux-accessibility.md) |

## 7. Prior-Findings Reconciliation & Active Findings

| ID | Type | Severity | Prior State | Current State | Disposition & Notes |
| :---- | :---- | :---- | :---- | :---- | :---- |
| `VG-P102-01` | Verification gap | Medium | `resolved` (`20261121T165800Z-1d61192`) | `resolved` (Owner accepted `F02` at `v0.2.1` `fbdaa55`) | Closed. |
| `VG-P101-02` | Verification gap | Low | `open` | `open` | `Pending owner sign-off` — physical owner desktop `Tab` focus & `Ctrl+P` print-preview check (automated Chromium keyboard focus & login/logout verified in `e2e/foundation-smoke.spec.ts`). |
| `VG-P103-01` | Verification gap | Medium (for real data; non-blocking for `P1-03` synthetic scope) | `new` | `new` | `Pending P1-11 / P1-12` — live VPS TLS, Vault secret mounts, and `F03`–`F04` recovery rehearsals required before real client data (test-only Nginx HTTPS verified in `P1-03`). |
| `VG-P103-02` | Verification gap | Low (planned slice boundary) | `new` | `new` | `Pending P1-04..P1-07` — domain-bound `private-access.feature` scenarios (`project page`, `evidence download`, `finding page/CSRF`, `project report`) deferred to owning slices. |
| `OPT-P101-01` | Optional improvement | Low / Info | `open` | `open` | `Pending owner sign-off` — optional `pnpm deploy` `api` image-size reduction (`684.3 MiB`) before `P1-11`. |
