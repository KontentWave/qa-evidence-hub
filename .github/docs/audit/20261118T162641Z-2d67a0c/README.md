# Audit Run `20261118T162641Z-2d67a0c` — Phase 1 Slice 1 (`P1-01`) Review

## 1. Context and Reviewed Baseline

- **Run ID:** `20261118T162641Z-2d67a0c`
- **Observation window:** `2026-11-18T16:16:38Z` – `2026-11-18T16:26:41Z`
- **Project:** QA Evidence Hub (`/home/marcel/projects/qa-evidence-hub`)
- **Intended use:** Private single-owner QA engagement evidence, finding/observation tracking, and printable project reporting web application; **current audit scope is bounded to `P1-01` (Repository and local container foundation, §6.6.1)**.
- **Reviewed candidate baseline:** Git branch `feat/p1-01-local-foundation` at commit `2d67a0c2f654d4d1f6dcb4758f7022e85ebca5c8` (`2d67a0c`, parent `7fde6db` on `main`), clean working tree (`git status --short` empty at commit time).
- **Verified local production container artifacts built from `2d67a0c`:**
  - `apps/api/Dockerfile` (`runner`): `sha256:1b5699d42e0236a8c139ab535ffe9c5ee18dc729f1c20cdaa750fa44814f70c1` (`659.1 MiB`, `UID 1000`)
  - `apps/web/Dockerfile` (`runner`): `sha256:9bd4b39aabf413814dba95b508a4b556bfbed3096ae6f9b4099b35e8ea329490` (`258.8 MiB`, `UID 1000`)
  - `postgres`: `postgres:17-bookworm@sha256:40865bc877a289da75963d97d72b59633f639fc5af7a4e856bfa3714cae5b536` (`PostgreSQL 17.12`)
  - `nginx`: `nginx:1.30-alpine@sha256:901e593c95dc85f5a729f5765516321366ef4ac401821431d408897e95287d0a` (`nginx/1.30.6`)
- **Deployed environments & drift:** **None deployed.** No staging or production VPS, domain/TLS, GHCR registry package, or Cloudflare R2 bucket exists yet. All runtime evidence in this run is **local WSL2 Linux (`Ubuntu 22.04.5 LTS`, `x86_64`) runtime** on synthetic test data only.

## 2. Verdicts and Status Separation (§6.6.2 / §8)

- **Production / Real-Data Verdict:** **`INSUFFICIENT EVIDENCE`** (Real client data is strictly **not authorized**; downstream slices `P1-02` [`F02` CI/GHCR/SBOM], `P1-03` [owner auth/CSRF], `P1-04`–`P1-10` [domain/R2/reports/deletion], `P1-11` [`F03` VPS/TLS/Vault], `P1-12` [`F04` deploy/backup/restore/alerts], and the `P1-13` pre-real-data full audit remain unimplemented).
- **`P1-01` Slice Candidate Conclusion:** **All in-scope `P1-01` implementation and local verification checks `PASS` with zero confirmed `P1-01` blockers.** Note that Foundation `F01`–`F02` as a whole is **not** yet complete until `P1-02` verifies CI enforcement.
- **Owner Acceptance Status:** **`Pending owner sign-off`**.

## 3. Coverage Matrix

| Component / Path | Method & Depth | Baseline / Evidence | Coverage & Exclusions |
| :---- | :---- | :---- | :---- |
| Root workspace (`package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `eslint.config.mjs`, `.editorconfig`, `.gitignore`, `.dockerignore`, `.env.example`) | Full manual review + ESLint + `tsc` + `pnpm install --frozen-lockfile` + `pnpm audit` | `2d67a0c` (static + local runtime) | 100% of root manifests/configs reviewed |
| Gherkin specs (`specs/features/*.feature`) & Drive sync (`scripts/sync-sheet*`) | Git rename hash check (`100%` similarity across 8 files) + `node --test scripts/sync-sheet.test.mjs` | `2d67a0c` (static + local runtime) | All 8 feature files verified unchanged; 25/25 sync tests passed |
| `apps/api/` (`src/**`, `prisma/**`, `prisma.config.ts`, `openapi.json`, `test/**`, `Dockerfile`) | Full line-by-line review + Vitest unit/contract (13 tests) + disposable PostgreSQL integration (3 tests) + container smoke | `2d67a0c` (static + local runtime) | 100% of `apps/api` first-party files reviewed and executed |
| `packages/api-client/` (`src/index.ts`, `src/generated/openapi.ts`) | Full review + `pnpm openapi:check` + `tsc` build + SSR integration | `2d67a0c` (static + local runtime) | 100% of first-party files reviewed |
| `apps/web/` (`app/**`, `src/**`, `next.config.mjs`, `public/robots.txt`, `Dockerfile`) | Full review + Vitest/RTL (4 tests) + standalone build + Nginx container smoke + Playwright browser check | `2d67a0c` (static + local runtime) | 100% of first-party files reviewed; physical owner desktop `Tab`/`Ctrl+P` confirmation pending (`VG-P101-02`) |
| `infra/nginx/default.conf`, `compose.yaml`, `compose.dev.yaml`, `compose.test.yaml`, `scripts/check-digests*`, `scripts/test-db*`, `scripts/f01-containers.test.mjs` | Full review + negative fixture tests + concurrent DB isolation/failure teardown + live Nginx wire-level header/body/persistence tests | `2d67a0c` (static + local runtime) | 100% of `P1-01` infra files reviewed; GitHub Actions CI & VPS TLS excluded (`P1-02`, `P1-11`) |
| `.github/docs/adr/001-next-nest-postgres-vps.md` | Full documentation consistency review against `project_sheet.md` | `2d67a0c` (documentation) | Reviewed in full |

## 4. Category Reports and Non-Applicable Area Rationale

| Area | Report / Status | Summary |
| :---- | :---- | :---- |
| `01` Security | [01-security.md](./01-security.md) | Non-root `UID 1000`, internal-only DB/API ports, Nginx header overwrite, strict `ValidationPipe`, non-leaking errors, Swagger off in prod |
| `02` Optimization & resource efficiency | [02-optimization.md](./02-optimization.md) | Bounded pool (`10 < 30`), Nginx body/timeout caps, log rotation, observed image sizes & idle RSS (`OPT-P101-01`) |
| `03` Expandability & architecture | [03-expandability.md](./03-expandability.md) | Clean web/API/OpenAPI boundary and `ADR-001` alignment; zero premature domain/storage coupling |
| `04` Reliability & dependability | [04-reliability-dependability.md](./04-reliability-dependability.md) | Bounded `SELECT 1`, graceful `SIGTERM`, persistent PG volume survival, TCP-gated `test-db.sh` isolation & failure cleanup |
| `05` Maintainability | [05-maintainability.md](./05-maintainability.md) | Strict TS, ESLint 10, shared `configureApp()`, runnable `compose.dev.yaml`, unchanged Gherkin & `sync-sheet` scripts |
| `06` Error handling & exceptions | [06-error-handling.md](./06-error-handling.md) | Non-echoing `EnvValidationError`, sanitized JSON `400`/`404`/`503`, graceful SSR degraded rendering |
| `07` Legacy & obsolete code | **`NOT APPLICABLE`** | Greenfield `P1-01` implementation directly atop specification baseline `7fde6db`; no superseded application code exists, and `scripts/sync-sheet*` remains active operator tooling (25/25 tests passing) |
| `08` Functional correctness, UX & accessibility | [08-functional-correctness-ux-accessibility.md](./08-functional-correctness-ux-accessibility.md) | Health/readiness/HTML contracts, `<main>`/`<h1>`/`role="status"`, WCAG AA+ contrast, `:focus-visible`, `@media print` (`VG-P101-02`) |
| `09` Data integrity, privacy & lifecycle | **`NOT APPLICABLE`** | `P1-01` explicitly excludes business/domain tables, user accounts, and R2 storage (`_prisma_migrations` baseline only); domain constraints and deletion lifecycle begin in `P1-03`–`P1-10` |
| `10` Observability, operations & recovery | [10-observability-operations-recovery.md](./10-observability-operations-recovery.md) | Liveness/readiness Compose ordering, `10m×3` logs, volume recreation check, `^qaeh_test_` safety guard |
| `11` Build, release, config & supply chain | [11-build-release-supply-chain.md](./11-build-release-supply-chain.md) | Locked `pnpm@12.21.0`, `@sha256:` digests, `0` prod advisories; `P1-02` CI/GHCR/SBOM pending (`VG-P101-01`) & dev `picomatch` triage (`VG-P101-03`) |
| `12` Test assurance & validation quality | [12-test-assurance.md](./12-test-assurance.md) | 52 unit/contract/digest/sync tests + 3 real-PG integration tests + 3 DB isolation tests + end-to-end F01 container suite |

## 5. Sanitized Validation Ledger

Tool versions in verification environment: `node v24.21.0`, `corepack 0.36.0`, `pnpm 12.21.0`, `Docker Engine 29.1.3`, `Docker Compose v5.8.0`, `Docker Buildx v0.39.0`, `TypeScript 5.9.3`, `ESLint 10.15.0`, `Vitest 5.1.1`, `Prisma 7.10.1`, `PostgreSQL 17.12`, `Nginx 1.30.6`.

| Criterion | Environment | Command / Procedure (Sanitized) | Observation Time (UTC) | Result / Exit Code | Evidence |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Locked workspace installation | Local WSL2 | `pnpm install --frozen-lockfile` | `2026-11-18T16:16:38Z` | `PASS` (`exit 0`) | 660 lockfile entries verified |
| Digest-pin verification + negative tests | Local WSL2 | `pnpm verify:digests && node --test scripts/check-digests.test.mjs` | `2026-11-18T16:22:33Z` | `PASS` (`exit 0`, 6/6) | [11-build-release-supply-chain.md](./11-build-release-supply-chain.md) |
| ESLint & boundary import rules | Local WSL2 | `pnpm lint` | `2026-11-18T16:22:35Z` | `PASS` (`exit 0`) | [05-maintainability.md](./05-maintainability.md) |
| Strict TypeScript across workspace | Local WSL2 | `pnpm typecheck` | `2026-11-18T16:22:45Z` | `PASS` (`exit 0`) | [05-maintainability.md](./05-maintainability.md) |
| OpenAPI spec & generated client zero-drift check | Local WSL2 | `pnpm openapi:check` | `2026-11-18T16:22:52Z` | `PASS` (`exit 0`) | [03-expandability.md](./03-expandability.md) |
| Production workspace build (`api-client`, `api`, `web` standalone) | Local WSL2 | `pnpm build` | `2026-11-18T16:17:15Z` | `PASS` (`exit 0`) | `/` marked `ƒ (Dynamic)` |
| Unit, contract & `sync-sheet` regression suites | Local WSL2 | `pnpm test` | `2026-11-18T16:22:57Z` | `PASS` (`exit 0`, 48/48) | `api` (13), `web` (4), `check-digests` (6), `sync-sheet` (25) |
| Disposable PostgreSQL baseline migration & readiness integration | Local Docker (`compose.test.yaml`) | `pnpm test:integration` | `2026-11-18T16:23:05Z` | `PASS` (`exit 0`, 3/3) | [12-test-assurance.md](./12-test-assurance.md) |
| Concurrent `test-db.sh` isolation, `reset`, non-`qaeh_test_` guard & induced-failure cleanup | Local Docker (`compose.test.yaml`) | `node --test scripts/test-db-isolation.test.mjs` | `2026-11-18T16:18:59Z` | `PASS` (`exit 0`, 3/3) | [04-reliability-dependability.md](./04-reliability-dependability.md) |
| `F01` production containers, non-root UID, port isolation, Nginx routing, header overwrite & volume persistence | Local Docker (`compose.yaml`) | `node --test scripts/f01-containers.test.mjs` | `2026-11-18T16:25:54Z` | `PASS` (`exit 0`, 1/1) | [01-security.md](./01-security.md), [02-optimization.md](./02-optimization.md) |
| `compose.dev.yaml` override configuration merge | Local WSL2 | `docker compose --env-file .env.example -f compose.yaml -f compose.dev.yaml config` | `2026-11-18T16:22:32Z` | `PASS` (`exit 0`) | [05-maintainability.md](./05-maintainability.md) |
| Production dependency advisory audit | Local npm advisory DB | `pnpm audit --prod` | `2026-11-18T16:20:30Z` | `PASS` (`exit 0`, 0 vulns) | [11-build-release-supply-chain.md](./11-build-release-supply-chain.md) |
| Integrated Playwright browser inspection (`Ready` + `503` degraded + `:focus-visible` + `@media print`) | Local Docker + Browser | `openBrowserPage` / `runPlaywrightCode` on `http://localhost:18080/` | `2026-11-18T16:13:00Z` | `PASS` (0 console/net errors) | [08-functional-correctness-ux-accessibility.md](./08-functional-correctness-ux-accessibility.md) |
| Owner manual desktop `Tab` & `Ctrl+P` print-preview confirmation | Owner desktop browser | Manual confirmation by owner | `2026-11-18` | `NOT VERIFIED` | `VG-P101-02` (`Pending owner sign-off`) |
| GitHub Actions `F01`/`F02` execution, PR blocking, CI coverage/security/license scans, SBOM, GHCR push & branch protection | GitHub Actions / Repo settings | Planned in `P1-02` | `2026-11-18` | `NOT VERIFIED (dependent on P1-02)` | `VG-P101-01` |

## 6. Prior-Findings Reconciliation

No prior audit runs existed before `20261118T162641Z-2d67a0c` (initial `P1-01` slice audit).

## 7. Findings Summary and Prioritized Follow-Up Actions

| ID | Title | Type | Severity | State | Disposition | Blocks `P1-01`? | Blocks `P1-03`+ / Prod? |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| `VG-P101-01` | GitHub Actions `F01`/`F02` gates, SBOMs, private GHCR digests, and branch protection not yet implemented | Verification gap | Medium | `new` | `Pending owner sign-off` | No (deferred by spec to `P1-02`) | **Yes** — `P1-02` must pass before `P1-03`+ and any production use |
| `VG-P101-02` | Owner manual desktop browser `Tab` focus and `Ctrl+P` print-preview confirmation | Verification gap | Low | `new` | `Pending owner sign-off` | No | Confirm during owner review of `P1-01` |
| `VG-P101-03` | Unpatched upstream devDependency ReDoS advisory `GHSA-fc5q-39xc-vjpf` (`picomatch <=4.0.7` via `vitest > vite`; `0` prod vulns) | Verification gap | Low | `new` | `Pending owner sign-off` | No | Re-check / gate in `P1-02` CI dependency policy |
| `OPT-P101-01` | Use `pnpm deploy` in `apps/api/Dockerfile` to trim sibling workspace prod packages from `api` runner image (`659.1 MiB`) | Optional improvement | Low / Info | `new` | `Pending owner sign-off` | No | Optional before `P1-11` VPS disk sizing |
