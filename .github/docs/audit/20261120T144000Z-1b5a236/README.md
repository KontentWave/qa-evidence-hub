# Audit Run `20261120T144000Z-1b5a236` — Phase 1 Slice 2 (`P1-02`) Review

## 1. Context and Reviewed Baseline

- **Run ID:** `20261120T144000Z-1b5a236`
- **Observation window:** `2026-11-20T13:18:00Z` – `2026-11-20T14:40:00Z`
- **Project:** QA Evidence Hub (`/home/marcel/projects/qa-evidence-hub`, GitHub `KontentWave/qa-evidence-hub`)
- **Intended use:** Private single-owner QA engagement evidence, finding/observation tracking, and printable project reporting web application; **current audit scope is bounded to `P1-02` (CI pipeline, repository controls, and `F01`/`F02` gate completion, §§6.0, 6.6, 6.6.2, 7)**.
- **Starting checkout baseline recorded before edits:**
  - Branch `main` at SHA `f77376d72093af503c784c00cfcfcb324ba18c59` (`f77376d`, Merge PR `#2` from `feat/p1-01-local-foundation`)
  - Initial `git status --short`: `?? .github/skills/` (pre-existing local `.github/skills/implement-slice/SKILL.md`, preserved untouched throughout `P1-02`)
- **Reviewed candidate baseline:**
  - Branch `feat/p1-02-ci-f01-f02-gates` at commit `1b5a23635a06f484f89840352a45a0f6b9893ca7` (`1b5a236`), `git status --short` showing only preserved `?? .github/skills/`.
- **Disposable PR branch-protection proof baselines (PR [#3](https://github.com/KontentWave/qa-evidence-hub/pull/3), closed without merging):**
  - **Unpinned-digest SHA (`FAIL` + merge `BLOCKED`):** `99c7bc4151c4893aa4cfadbd6b37efe91c6f93c6` — CI run [44749866367](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44749866367)
  - **Restored-digest SHA (`PASS` + merge `CLEAN`):** `563961790ddcd5224e2dbfbe11b273d7e58079da` — CI run [44751299960](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44751299960)
- **Trusted-ref release & SBOM provenance baseline (`refs/tags/v0.2.0-rc.4`, SHA `9c9493e0c336f15986fefe06896652adb449e006`, Run [44754188990](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44754188990)):**
  - `api` GHCR manifest: `ghcr.io/kontentwave/qa-evidence-hub-api@sha256:ceb627227da5dc438da8aafd0d58f533774b1db2a0b47feb924a2c8c70bb4400` (`qa-evidence-hub-api.spdx.json` SHA-256 `b34ceb0aad7b5ab4b53060bf2f7f0528356e15f723e8d72300634c836ed9de3f`, `406` SPDX packages)
  - `web` GHCR manifest: `ghcr.io/kontentwave/qa-evidence-hub-web@sha256:43f9acc04168d7e32b6ab4e7d5b3bff49f5d03deda8788e10c8cd7de5617c340` (`qa-evidence-hub-web.spdx.json` SHA-256 `ffb5aaa73b6abf6ce16a532d3a52dd90c10446229bf7234c424287c2a7722df5`, `150` SPDX packages)
  - Pinned runtime base images: `node:24.22.3-trixie-slim@sha256:af02d57b57719b9657a45199a79264a9437940cd55b3c7b3fc99615654f124a0`, `postgres:17-bookworm@sha256:837bed18782820fe967067cb5328b02b0d9992c1be9a37ee0c9c492cfc03af3b` (`PostgreSQL 17.12`), `nginx:1.30-alpine@sha256:caf4e1e032a20f9c3c5e28fc7f25ffd768ad8677b4975c54193075997b3a97e3` (`nginx/1.30.7`).
- **Deployed environments & drift:** **None deployed.** No staging or production VPS, domain/TLS, or Cloudflare R2 bucket exists yet.

## 2. Verdicts and Status Separation (§6.6.2 / §8)

- **Foundation Gate `F01` (Containers and configuration):** **`PASS` (local runtime + GitHub Actions CI)** — clean-checkout install/build, CI rejection of unpinned image digest on disposable PR `#3` (`99c7bc4`), non-root `UID 1000`, private `postgres`/`api`/`web` ports, production boot behind Nginx, Playwright `/` `Ready` check, and synthetic PostgreSQL persistence across container recreation all verified in CI run [44751299960](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44751299960).
- **Foundation Gate `F02` (CI and repository controls):** **Implemented and verified across all PR/CI/branch-protection/SBOM/digest-provenance controls (`PASS`), EXCEPT private GHCR package visibility (`NOT VERIFIED` / blocked on one-time owner GitHub Web UI Package Settings action `VG-P102-01`).** Both `F01` and `F02` must be green before starting `P1-03`.
- **Implementation Status:** **`P1-02` implemented** on `feat/p1-02-ci-f01-f02-gates`.
- **Local Verification Status:** **`PASS`** across all quality, contract, coverage, integration, Cucumber BDD, `F01` container, Playwright Nginx smoke, secret, static, dependency, container, license, SBOM, and blocking-fixture checks.
- **Exact-Commit CI Status:** **`PASS`** on `ci.yml` (`4/4` required checks green); `release.yml` intentionally fails its final private-visibility assertion (`api=200, web=200`) until owner completes `VG-P102-01` in GitHub UI.
- **Owner Acceptance Status:** **`Pending owner sign-off`**.
- **Production / Real-Data Verdict:** **`NOT READY` (`INSUFFICIENT EVIDENCE`)** — real client data remains strictly unauthorized (`P1-03`–`P1-13`, `F03`–`F04`, and section 8 Audit verdict unimplemented).

## 3. Coverage Matrix

| Component / Path | Method & Depth | Baseline / Evidence | Coverage & Exclusions |
| :---- | :---- | :---- | :---- |
| `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `scripts/check-workflows*` | Full manual review + `pnpm verify:workflows` + live GitHub Actions PR & tag execution | `1b5a236`, runs `44749866367`, `44751299960`, `44754188990` | 100% of workflow YAML and action SHA pins reviewed and executed on GitHub |
| `.github/CODEOWNERS`, `.github/pull_request_template.md`, `.github/dependabot.yml`, GitHub `main` branch protection & `refs/tags/v*` ruleset `27730069` | Full review + live GitHub REST/GraphQL verification + disposable PR `#3` fail/pass proof | `1b5a236`, PR `#3` (`99c7bc4` -> `5639617`) | 100% reviewed; GHCR Web UI visibility toggle tracked in `VG-P102-01` |
| `specs/foundation/health-readiness.feature`, `apps/api/bdd/**`, `apps/api/cucumber.foundation.mjs`, `scripts/verify-cucumber-executed*` | Full review + disposable PostgreSQL Cucumber run + zero-scenario negative tests | `1b5a236` (local + CI) | 100% reviewed; product scenarios in `specs/features/*.feature` (`46`) verified untouched (`0` diff) |
| `playwright.config.ts`, `tsconfig.e2e.json`, `e2e/foundation-smoke.spec.ts`, `scripts/run-playwright-foundation-smoke.mjs` | Full review + headless Chromium against live Nginx Compose stack | `1b5a236` (local + CI + Release) | 100% reviewed; physical owner desktop `Tab`/`Ctrl+P` check remains `VG-P101-02` |
| `apps/api/vitest.config.ts`, `scripts/check-api-service-coverage*` | Full review + V8 coverage run (`N/A` in `P1-02`) + real `<80%` V8 fixture rejection test | `1b5a236` (local + CI) | 100% reviewed |
| `scripts/check-format*`, `scripts/check-licenses*`, `scripts/license-policy.json`, `scripts/check-static-security.mjs`, `scripts/security-scan.mjs`, `scripts/dependency-exceptions.json`, `scripts/security-gates-blocking.test.mjs` | Full review + live scans + 5 end-to-end negative fixture suites | `1b5a236` (local + CI) | 100% reviewed and executed |
| `apps/api/Dockerfile`, `apps/web/Dockerfile`, `compose.yaml`, `compose.test.yaml`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `package.json`, `scripts/f01-containers.test.mjs` | Full review + `f01-containers`, Trivy OCI scan, Syft SPDX SBOM, `pnpm audit` | `1b5a236` (local + CI + Release) | 100% of modified lines reviewed |
| `.github/docs/adr/015-phase1-delivery-profile.md`, `.github/docs/runbook.md`, `.github/docs/CHANGELOG.md` | Full consistency review against `project_sheet.md` and as-built scripts/workflows | `1b5a236` (documentation) | 100% reviewed |

## 4. Category Reports and Non-Applicable Area Rationale

| Area | Report / Status | Summary |
| :---- | :---- | :---- |
| `01` Security | [01-security.md](./01-security.md) | Read-only PR CI, 40-hex SHA action pins, zero `run:` template injection, upgraded `nginx 1.30.7` & `node 24.22.3`, Gitleaks/AST/Trivy gates, `VG-P102-01` |
| `02` Optimization & resource efficiency | [02-optimization.md](./02-optimization.md) | Single-build image reuse in CI/release, staged Gitleaks scan (`<2s`), observed `660.6 MiB` / `260.3 MiB` images (`OPT-P101-01`) |
| `03` Expandability & architecture | [03-expandability.md](./03-expandability.md) | `ADR-015`, isolated `specs/foundation/` preserving all 8 product `.feature` files, auto-activating `P1-03`+ coverage gate |
| `04` Reliability & dependability | [04-reliability-dependability.md](./04-reliability-dependability.md) | Cold-checkout `api-client` build order fix, sequential Trivy DB lock safety, zero-test guards, CI volume persistence |
| `05` Maintainability | [05-maintainability.md](./05-maintainability.md) | `.editorconfig` gate, ESLint 10, `CODEOWNERS`, PR template, `dependabot.yml`, `runbook.md` / `license-policy.json` parity |
| `06` Error handling & exceptions | [06-error-handling.md](./06-error-handling.md) | Redacted Gitleaks output, `finally` Docker/temp cleanup, SBOM retention before visibility failure exit |
| `07` Legacy & obsolete code | **`NOT APPLICABLE`** | No superseded application modules exist; temporary verification tags (`v0.2.0-rc.1`–`rc.3`) and disposable PR `#3` branch were deleted cleanly |
| `08` Functional correctness, UX & accessibility | [08-functional-correctness-ux-accessibility.md](./08-functional-correctness-ux-accessibility.md) | Cucumber `/api/v1/health/ready` `200` + Playwright Chromium `/` `System status: Ready` through Nginx (`VG-P101-02`) |
| `09` Data integrity, privacy & lifecycle | **`NOT APPLICABLE`** | `P1-02` adds zero database tables, accounts, or object-storage buckets (`_prisma_migrations` baseline only) |
| `10` Observability, operations & recovery | [10-observability-operations-recovery.md](./10-observability-operations-recovery.md) | Step summaries, retained Cucumber/Playwright/SBOM/provenance artifacts, initial `runbook.md` (`F04` planned in `P1-12`) |
| `11` Build, release, config & supply chain | [11-build-release-supply-chain.md](./11-build-release-supply-chain.md) | `VG-P101-03` (`picomatch`) resolved, `effect@3.22.5` patched, SPDX SBOM + GHCR digest provenance verified, `VG-P102-01` owner UI action |
| `12` Test assurance & validation quality | [12-test-assurance.md](./12-test-assurance.md) | 62 unit/gate tests + PG integration/isolation + Cucumber + Playwright + F01 + 5 negative blocking suites + live PR `#3` proof |

## 5. Sanitized Validation Ledger

Tool versions: `node v24.21.0` (host) / `v24.22.3` (containers), `corepack 0.36.0`, `pnpm 12.21.0`, `Docker Engine 29.1.3`, `Docker Compose v5.8.0`, `Docker Buildx v0.39.0`, `TypeScript 5.9.3`, `ESLint 10.15.0`, `Vitest 5.1.1` (`@vitest/coverage-v8 5.1.1`), `@cucumber/cucumber 13.3.0`, `@playwright/test 1.65.1` (`Chromium 159.0.8154.6`), `Prisma 7.10.1`, `PostgreSQL 17.12`, `Nginx 1.30.7`, `Gitleaks v8.30.1`, `Trivy 0.76.2`, `Syft v1.57.2`, `gh` CLI + GitHub Actions `ubuntu-latest`.

| Criterion | Environment | Command / Procedure (Sanitized) | Result / Exit Code | Evidence |
| :---- | :---- | :---- | :---- | :---- |
| Locked workspace installation | Local WSL2 & CI | `pnpm install --frozen-lockfile` | `PASS` (`exit 0`) | 739 lockfile entries verified |
| Image digest & workflow SHA/security check | Local WSL2 & CI | `pnpm verify:digests && pnpm verify:workflows` | `PASS` (`exit 0`) | [01-security.md](./01-security.md) |
| `.editorconfig` formatting & ESLint boundary rules | Local WSL2 & CI | `pnpm format:check && pnpm lint` | `PASS` (`exit 0`, 107 files) | [05-maintainability.md](./05-maintainability.md) |
| Cold-checkout strict TypeScript & OpenAPI drift check | Local WSL2 & CI | `pnpm typecheck && pnpm openapi:check` | `PASS` (`exit 0`) | [04-reliability-dependability.md](./04-reliability-dependability.md) |
| Unit, contract, sync-sheet & gate unit suites | Local WSL2 & CI | `pnpm test` | `PASS` (`exit 0`, 62/62) | `api` (13), `web` (4), `node:test` (45) |
| 80% line / 80% branch API service coverage gate + `<80%` fixture rejection | Local WSL2 & CI | `pnpm test:coverage && node --test scripts/check-api-service-coverage.test.mjs` | `PASS` (`exit 0`, `N/A` reported; `<80%` fixture rejected) | [12-test-assurance.md](./12-test-assurance.md) |
| Production builds (`api-client`, `api`, `web` standalone) | Local WSL2 & CI | `pnpm build` | `PASS` (`exit 0`) | `/` `ƒ (Dynamic)` |
| Disposable PostgreSQL integration & concurrent isolation/cleanup | Local Docker & CI | `pnpm test:integration && node --test scripts/test-db-isolation.test.mjs` | `PASS` (`exit 0`, 3/3 + 3/3) | [12-test-assurance.md](./12-test-assurance.md) |
| Cucumber.js Foundation `/api/v1/health/ready` BDD + zero-scenario guard | Local Docker & CI | `pnpm test:bdd:foundation` | `PASS` (`exit 0`, 1 scenario / 7 steps) | [08-functional-correctness-ux-accessibility.md](./08-functional-correctness-ux-accessibility.md) |
| `F01` production containers, non-root UID, private ports, Nginx header overwrite & volume persistence | Local Docker, CI & `Release` | `node --test scripts/f01-containers.test.mjs` | `PASS` (`exit 0`, 1/1) | [01-security.md](./01-security.md), [04-reliability-dependability.md](./04-reliability-dependability.md) |
| Playwright Chromium `/` shows `Ready` through Nginx | Local Docker, CI & `Release` | `pnpm test:e2e:foundation` | `PASS` (`exit 0`, 1/1) | [08-functional-correctness-ux-accessibility.md](./08-functional-correctness-ux-accessibility.md) |
| Secret, AST/IaC static, dependency (`pnpm audit`), OCI container & SPDX license gates | Local WSL2 & CI | `pnpm verify:security:secrets && pnpm verify:security:static && pnpm verify:security:deps && pnpm verify:security:containers && pnpm verify:licenses` | `PASS` (`exit 0`, `0` leaks, `0` vulns, `625` pkg entries verified) | [01-security.md](./01-security.md), [11-build-release-supply-chain.md](./11-build-release-supply-chain.md) |
| Harmless negative blocking-fixture verification across all gates | Local WSL2 & CI | `pnpm test:gates:blocking` | `PASS` (`exit 0`, 5/5 blocking paths rejected) | [12-test-assurance.md](./12-test-assurance.md) |
| Disposable PR `#3` unpinned-digest CI failure & GitHub merge block (`99c7bc4`) | Live GitHub PR `#3` + Branch Protection | Remove `nginx` `@sha256:` -> CI run `44749866367` + `PUT /pulls/3/merge` | `PASS` (CI `failure`; `mergeStateStatus: BLOCKED`; `HTTP 405`: `"2 of 4 required status checks are failing."`) | PR [#3](https://github.com/KontentWave/qa-evidence-hub/pull/3), run [44749866367](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44749866367) |
| Disposable PR `#3` restored-digest green CI & merge unblock (`5639617`) | Live GitHub PR `#3` + Branch Protection | Restore `nginx` `@sha256:` -> CI run `44751299960` | `PASS` (`4/4` required checks green; `mergeStateStatus: CLEAN`; closed without merging) | PR [#3](https://github.com/KontentWave/qa-evidence-hub/pull/3), run [44751299960](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44751299960) |
| Trusted-ref (`v0.2.0-rc.4`) build-once, scan, Nginx smoke, SPDX SBOM retention & GHCR digest linkage | Live GitHub Actions `Release` | Push `refs/tags/v0.2.0-rc.4` -> run `44754188990` + `gh run download 44754188990` | `PASS` (artifacts retained; manifest digests linked to commit, passing tests & SBOM SHA-256s) | [11-build-release-supply-chain.md](./11-build-release-supply-chain.md), run [44754188990](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44754188990) |
| Private GHCR package visibility (`qa-evidence-hub-api`, `qa-evidence-hub-web`) | Live GitHub Packages API & `Release` run | `gh api /user/packages/container/qa-evidence-hub-{api,web}` + OCI anonymous manifest probe | `NOT VERIFIED` (`FAIL` until owner GitHub Web UI action) | `VG-P102-01` (`"visibility": "public"` from public-repo `GITHUB_TOKEN` creation; blocked by `release.yml`) |
| Owner manual desktop `Tab` & `Ctrl+P` print-preview confirmation | Owner desktop browser | Manual confirmation by owner | `NOT VERIFIED` | `VG-P101-02` (`Pending owner sign-off`) |

## 6. Prior-Findings Reconciliation (`20261118T162641Z-2d67a0c` → `20261120T144000Z-1b5a236`)

| ID | Prior State | Current State | Evidence & Reconciliation |
| :---- | :---- | :---- | :---- |
| `VG-P101-01` | `new` | `resolved` (with GHCR UI visibility split to `VG-P102-01`) | `ci.yml`, `release.yml`, `CODEOWNERS`, `pull_request_template.md`, `dependabot.yml`, `main` branch protection, `refs/tags/v*` ruleset `27730069`, CI `F01`, disposable PR `#3` fail/block/pass proof (`44749866367` -> `44751299960`), and SPDX SBOM + GHCR manifest provenance (`44754188990`) are live and verified; remaining Web-UI-only GHCR package privacy step is tracked explicitly as `VG-P102-01`. |
| `VG-P101-02` | `new` | `open` | Automated Playwright Chromium smoke now runs in local and CI pipelines; physical owner desktop `Tab`/`Ctrl+P` confirmation remains `Pending owner sign-off`. |
| `VG-P101-03` | `new` | `resolved` | `GHSA-fc5q-39xc-vjpf` (`picomatch <=4.0.7`) was officially withdrawn upstream in the GitHub Advisory Database (`withdrawn_at: 2026-11-18T15:38:56Z`), and `GHSA-7589-6fvf-x4pw` (`effect`) was patched via `effect@3.22.5`; `pnpm verify:security:deps` (`pnpm audit` across prod + dev) passes with `0` advisories. |
| `OPT-P101-01` | `new` | `open` | Optional `pnpm deploy` `api` image size reduction (`660.6 MiB`) retained for pre-`P1-11` consideration (`Pending owner sign-off`). |

## 7. Active Findings and Prioritized Actions

| ID | Title | Type | Severity | State | Disposition | Blocks `F01`? | Blocks `F02` / `P1-03`+? |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| `VG-P102-01` | Transition auto-created `qa-evidence-hub-api` and `qa-evidence-hub-web` GHCR packages from `public` to `private` in GitHub Web UI and re-run `release.yml` | Verification gap / Owner UI action | Medium | `new` | `Pending owner action & sign-off` | No (`F01` `PASS`) | **Yes** — complete before starting `P1-03` so `F02` private GHCR requirement is `PASS` |
| `VG-P101-02` | Owner manual desktop browser `Tab` focus and `Ctrl+P` print-preview confirmation | Verification gap | Low | `open` | `Pending owner sign-off` | No | Confirm during owner review |
| `OPT-P101-01` | Optional `pnpm deploy` in `apps/api/Dockerfile` to trim `api` runner image size (`660.6 MiB`) | Optional improvement | Low / Info | `open` | `Pending owner sign-off` | No | Optional before `P1-11` |
