# Audit Run `20261127T162909Z-05c38bf` — `P1-04` `AC01` Session Review Hardening

## 1. Context and Reviewed Baseline

- **Run ID:** `20261127T162909Z-05c38bf`
- **Observation window:** `2026-11-27T15:44:00Z` – `2026-11-27T16:30:00Z`
- **Project:** QA Evidence Hub (`/home/marcel/projects/qa-evidence-hub`, GitHub `KontentWave/qa-evidence-hub`)
- **Prior reviewed baseline:** `9f4864009a1834ff623d387643cd683b19c44472` (`9f48640`, `origin/main` after merging PR [#18](https://github.com/KontentWave/qa-evidence-hub/pull/18)).
- **Starting working-tree & local Docker volume state:**
  - `git status --short`: `?? .github/skills/` (unrelated local `.github/skills/implement-slice/SKILL.md`, preserved untouched and unstaged throughout).
  - `docker volume ls` & `docker ps -a`: zero `qa-evidence-hub` persistent PostgreSQL 17 volumes present; unrelated local containers and volumes (`9595a0d52a67be275eec9181539d78a0914b182b1ad5044f68cac8fbefbe4ece` on `pg-dj01` `postgres:16`, `freelance-opportunity-triage-platform_mariadb_test_data`) left completely untouched while all database, BDD, container, and Playwright checks ran exclusively on isolated disposable PostgreSQL 19.0 stacks (`compose.test.yaml` / `qaeh_*` projects).
- **Tested implementation baseline:** `05c38bfb94b4b39ace12385de25d52d17605dc83` (`05c38bf` implementation + `3fb8088f1f0d285716524438cf6bcf5b0d7419d2` `3fb8088` Playwright post-submit navigation-wait stabilization on `fix/p1-04-session-review` branched from `origin/main` `9f48640`), `git status --short` showing only preserved `?? .github/skills/`.
- **Verified container image digests on `05c38bf`:**
  - Local verified `apps/api/Dockerfile` (`runner`, `UID 1000`, `Node.js v24.22.3`, fresh `apt-get upgrade`): `sha256:8aa1c08d6fa279593bd7b71f8c151073efc107af24ef0260bfa7e2ae59d05539` (`687.3 MiB`, `720,727,561` bytes; `118.6 MiB` idle)
  - Local verified `apps/web/Dockerfile` (`runner`, `UID 1000`, `Node.js v24.22.3`, fresh `apt-get upgrade`): `sha256:72ec254de9a25c893ab07e9038cd49a9812ecafcbad4a45ab10ba72c48d4324c` (`286.8 MiB`, `300,700,244` bytes; `57.73 MiB` idle)
  - Pinned base & stack images unchanged: `node:24.22.3-trixie-slim@sha256:af02d57b57719b9657a45199a79264a9437940cd55b3c7b3fc99615654f124a0`, `postgres:19-bookworm@sha256:f4859caf96de494e38efa69ed703b08a5bbd9605e152e604f2daec8841c87c41` (`PostgreSQL 19.0`, `62.64 MiB` idle), `nginx:1.31-alpine-slim@sha256:5bfced78d24d644270bedb0a9968697042e38d5c03fb6354603df025279c1cbe` (`nginx/1.31.9`, `10.67 MiB` idle).
- **Scope:** Remediates and verifies both `P1-04` `AC01` post-merge review findings from PR `#18` (`9f48640`) on synthetic data while preserving `F01`/`F02` gates and unchanged `P1-04` baseline evidence from [20261123T173817Z-d5fac14](../20261123T173817Z-d5fac14/README.md).

## 2. Changed Repository Paths (`18` implementation/config files in `05c38bf` + documentation/audit)

- **API validation, sessions pagination & OpenAPI (`7`):** `apps/api/openapi.json`, `apps/api/src/common/validation.util.ts`, `apps/api/src/common/validation.util.spec.ts`, `apps/api/src/sessions/sessions.dto.ts`, `apps/api/src/sessions/sessions.controller.ts`, `apps/api/src/sessions/sessions.service.ts`, `apps/api/src/sessions/sessions.spec.ts`.
- **Generated OpenAPI client (`2`):** `packages/api-client/src/generated/openapi.ts`, `packages/api-client/src/index.ts`.
- **Next.js SSR read helper, project pagination UI & RTL tests (`4`):** `apps/web/src/lib/api.ts`, `apps/web/app/clients/[clientId]/projects/[projectId]/page.tsx`, `apps/web/app/globals.css`, `apps/web/src/app/engagement.spec.tsx`.
- **PostgreSQL integration, Cucumber BDD & Playwright Nginx E2E (`3`):** `apps/api/test/engagement-context.integration.spec.ts`, `apps/api/bdd/engagement-context.steps.ts`, `e2e/engagement-context.spec.ts`.
- **Container scan exception & operational documentation (`2` in `05c38bf` + audit/sheet/changelog):** `scripts/container-scan-exceptions.json`, `.github/docs/runbook.md`, `.github/docs/project_sheet.md`, `.github/docs/CHANGELOG.md`, `.github/docs/audit/README.md`, `.github/docs/audit/20261127T162909Z-05c38bf/{README.md,01..12-*.md}`.

## 3. Review Findings Addressed and Verified

1. **`P104-RV-01` — Older backdated sessions unreachable past the 200-item project page limit (`resolved`):**
   - Added `ListSessionsQueryDto` (`cursor?: string` `1..256`, `limit?: number` `1..200` defaulting to `200`) and `nextCursor: string | null` on `SessionListResponseDto` for `GET /api/v1/projects/{projectId}/sessions`, keeping `items: SessionDto[]`, `(startedAt DESC, createdAt DESC, id DESC)` ordering, authentication (`401`), parent-project scoping (`404`), and `Cache-Control: private, no-store, no-transform` + `X-Content-Type-Options: nosniff`.
   - Implemented canonical base64url keyset cursors in `SessionsService.listSessions` backed by parameterized `$queryRaw` row-value comparisons `("started_at", "created_at", "id") < ($2::timestamptz, $3::timestamptz, $4::uuid)` and full 6-digit microsecond UTC timestamps (`YYYY-MM-DD"T"HH24:MI:SS.US"Z"`), preventing JavaScript `Date` millisecond truncation from causing gaps or duplicates across tied `startedAt` and sub-millisecond `createdAt` rows.
   - Regenerated `apps/api/openapi.json` and `packages/api-client`, updated `fetchProjectSessionsForOwner` in `apps/web/src/lib/api.ts` to accept `{ cursor, limit }` and return `TestSessionListResponse`, and added `<nav aria-label="Test sessions pagination" className="pagination-nav no-print">` with keyboard-accessible `Older sessions` (and `Newest sessions` on older pages) links on `/clients/[clientId]/projects/[projectId]`.
   - Verified Red (`400` on `?limit=2` before implementation) -> Green in `engagement-context.integration.spec.ts` (multi-page `limit=2` walk across sub-ms `createdAt` ties and identical `(startedAt, createdAt)` UUID ties with `0` gaps/duplicates + `201`-session default boundary + malformed cursor/limit `400` + anonymous `401` + missing project `404`), `engagement.spec.tsx`, and Playwright Chromium through Nginx (`e2e/engagement-context.spec.ts`: fixture seeds `200` newer sessions, owner creates backdated `201`st session through form, visits project afresh, focuses and activates `Older sessions` via keyboard `Enter`, opens record, reloads, and verifies saved purpose and start time).
2. **`P104-RV-02` — Sub-millisecond reversed session time ranges accepted due to JavaScript `Date` truncation (`resolved`):**
   - Added `parseStrictIsoInstant` in `apps/api/src/common/validation.util.ts` normalizing strict ISO-8601 UTC and `±HH:MM` offset timestamps with up to `6` fractional digits into exact `bigint` UTC microseconds (`epochMicros`) alongside floor-converted JavaScript `Date` instances (and rejecting non-Gregorian year `0000` before PostgreSQL `22008`).
   - Updated `SessionsService.createSession` (`apps/api/src/sessions/sessions.service.ts`) to compare `endedInstant.epochMicros < startedInstant.epochMicros` before JavaScript `Date` conversion discards sub-millisecond precision.
   - Verified Red (`201` returned on `startedAt = 2026-11-27T10:00:00.123900Z`, `endedAt = 2026-11-27T10:00:00.123100Z` before implementation) -> Green in `validation.util.spec.ts`, `sessions.spec.ts`, and PostgreSQL-backed `engagement-context.integration.spec.ts`: reversed sub-ms range returns `400` with `fieldErrors: [{ field: 'endedAt' }]` and unchanged project session count (`0`), swapped values succeed (`201`), equal instants across `+02:00` and `-05:30` offsets with `6` fractional digits succeed (`201`), and `endedAt` remains optional (`201`).
3. **Owner-approved temporary `postgres:19-bookworm` `CVE-2025-6020` exception (`recorded`):**
   - Upstream Docker Hub `postgres:19-bookworm` (including its latest `2026-11-24` image build) still packages `libpam0g`, `libpam-modules`, `libpam-modules-bin`, and `libpam-runtime` at `1.5.2-6+deb12u2` (`CVE-2025-6020` `pam_namespace` symlink traversal, fixed in Debian `1.5.2-6+deb12u3`). With explicit `@KontentWave` approval during this session, recorded four `postgres`-only, target/package/version/CVE-pinned, 30-day (`2026-11-27` -> `2026-12-27`) entries in `scripts/container-scan-exceptions.json` and `.github/docs/runbook.md` §4 (`gosu` runs without PAM/`pam_namespace` on unexposed `internal: true` `data_net`).

## 4. Category Reports

- [01-security.md](./01-security.md)
- [02-optimization.md](./02-optimization.md)
- [03-expandability.md](./03-expandability.md)
- [04-reliability-dependability.md](./04-reliability-dependability.md)
- [06-error-handling.md](./06-error-handling.md)
- [08-functional-correctness-ux-accessibility.md](./08-functional-correctness-ux-accessibility.md)
- [09-data-integrity-privacy-lifecycle.md](./09-data-integrity-privacy-lifecycle.md)
- [11-build-release-supply-chain.md](./11-build-release-supply-chain.md)
- [12-test-assurance.md](./12-test-assurance.md)
- Areas `05` (`167` formatted files, `0` ESLint/TS issues) and `10` (health/Compose probes unchanged) retain [20261123T173817Z-d5fac14](../20261123T173817Z-d5fac14/README.md); area `07` `NOT APPLICABLE`.

## 5. Sanitized Validation Ledger (`05c38bf`)

Tool versions: `node v24.21.0` (local host) / `v24.22.3` (containers), `corepack 0.36.0`, `pnpm 12.21.0`, `Docker Engine 29.1.3`, `Docker Compose v5.8.0`, `TypeScript 5.9.3`, `ESLint 10.15.0`, `Vitest 5.1.1` (`@vitest/coverage-v8 5.1.1`), `@cucumber/cucumber 13.3.0`, `@playwright/test 1.65.1`, `Prisma 7.10.1`, `PostgreSQL 19.0`, `Nginx 1.31.9`, `Gitleaks v8.30.1`, `Trivy 0.76.2`.

| Criterion | Environment | Command / Procedure (Sanitized) | Result / Exit Code | Evidence |
| :---- | :---- | :---- | :---- | :---- |
| Red-phase regression proof for `P104-RV-02` (sub-ms reversed range) | Local WSL2 & Docker (`PostgreSQL 19.0`) | `pnpm --filter @qa-evidence-hub/api exec vitest run src/sessions/sessions.spec.ts` and `pnpm test:integration` | `FAIL` as expected (`exit 1`, `201 !== 400` before fix) | [12-test-assurance.md](./12-test-assurance.md) |
| Red-phase regression proof for `P104-RV-01` (session cursor pagination) | Local Docker (`PostgreSQL 19.0`) | `pnpm test:integration` | `FAIL` as expected (`exit 1`, `400 !== 200` on `?limit=2` before fix) | [12-test-assurance.md](./12-test-assurance.md) |
| OpenAPI export, client generation & zero-drift verification | Local WSL2 | `pnpm openapi:generate && pnpm openapi:check` | `PASS` (`exit 0`, `0` drift) | [03-expandability.md](./03-expandability.md) |
| Image digest, workflow SHA/security, `.editorconfig` format (`167` files), ESLint & strict TS | Local WSL2 | `pnpm verify:digests && pnpm verify:workflows && pnpm format:check && pnpm lint && pnpm typecheck` | `PASS` (`exit 0`, `0` warnings/errors) | [11-build-release-supply-chain.md](./11-build-release-supply-chain.md) |
| Unit, contract, web RTL & gate suites | Local WSL2 | `pnpm test` | `PASS` (`exit 0`, `96/96`: API `26`, Web `16`, `node:test` `54`) | [12-test-assurance.md](./12-test-assurance.md) |
| `>= 80%` line & branch `apps/api/src/{auth,clients,projects,sessions}/` V8 coverage gate | Local WSL2 | `pnpm test:coverage` | `PASS` (`exit 0`, `98.47%` lines `450/457`, `95.56%` branches `258/270` across `9` files; `100%`/`100%` on `clients`, `projects`, `sessions`) | [12-test-assurance.md](./12-test-assurance.md) |
| Production workspace build (`api-client`, `api`, `web` standalone) | Local WSL2 | `pnpm build` | `PASS` (`exit 0`; all `5` protected routes + `/login` `ƒ Dynamic`) | [11-build-release-supply-chain.md](./11-build-release-supply-chain.md) |
| Disposable PostgreSQL 19 integration (`19/19`) + concurrent DB isolation (`3/3`) | Local Docker (`PostgreSQL 19.0`) | `pnpm test:integration && node --test scripts/test-db-isolation.test.mjs` | `PASS` (`exit 0`, `19/19` + `3/3`) | [04-reliability-dependability.md](./04-reliability-dependability.md), [09-data-integrity-privacy-lifecycle.md](./09-data-integrity-privacy-lifecycle.md) |
| Cucumber.js Foundation (`@foundation`), Auth (`@P1-03`), & Engagement (`(@AC01 and @S1) or @P1-04`) BDD | Local Docker (`PostgreSQL 19.0` + Next.js) | `pnpm test:bdd:foundation && pnpm test:bdd:auth && pnpm test:bdd:engagement` | `PASS` (`exit 0`, `1/1` + `3/3` + `3/3` = `7/7` scenarios, `52/52` steps) | [12-test-assurance.md](./12-test-assurance.md) |
| `F01` + `P1-03`/`P1-04` containers, non-root UID, private ports, `--env-file` auth overrides, HTTPS `Secure` cookie & volume persistence | Local Docker (`Node v24.22.3`, `PG 19.0`, `Nginx 1.31.9`) | `node --test scripts/f01-containers.test.mjs` | `PASS` (`exit 0`, `1/1`, `111.4s`) | [01-security.md](./01-security.md), [11-build-release-supply-chain.md](./11-build-release-supply-chain.md) |
| Playwright Chromium E2E through Nginx (`3/3`: auth smoke, engagement creation/error-focus/anonymous redirect, and `200`-fixture + backdated `201`st session via keyboard `Older sessions` + reload) | Local Docker (`Nginx 1.31.9`) | `pnpm test:e2e:foundation` | `PASS` (`exit 0`, `3/3`) | [08-functional-correctness-ux-accessibility.md](./08-functional-correctness-ux-accessibility.md) |
| Gitleaks secrets, AST/Trivy IaC (`108` files), `pnpm audit` deps, 4-image Trivy OCI, SPDX licenses (`625` entries) & negative blocking fixtures | Local WSL2 & Docker | `pnpm verify:security:secrets && pnpm verify:security:static && pnpm verify:security:deps && pnpm verify:security:containers && pnpm verify:licenses && pnpm test:gates:blocking` | `PASS` (`exit 0`, `0` leaks/unreviewed vulns, `5/5` blocking fixtures) | [01-security.md](./01-security.md), [11-build-release-supply-chain.md](./11-build-release-supply-chain.md) |
| Trusted-ref `release.yml` private GHCR push & SPDX SBOM retention | GitHub Actions `Release` | Restricted to `refs/heads/main` and `refs/tags/v*` post-merge | `NOT VERIFIED` (by `F02` read-only PR CI design; executes post-merge) | `.github/workflows/release.yml` |
| Deferred `private-access.feature` scenarios (`P1-05`–`P1-07`), live VPS `F03`–`F04` (`P1-11`–`P1-12`), and physical desktop `Tab`/`Ctrl+P` (`VG-P101-02`) | Future slices / owner browser | Deferred per slice scope | `NOT VERIFIED` (`VG-P103-02`, `VG-P103-01`, `VG-P101-02`) | [20261123T173817Z-d5fac14](../20261123T173817Z-d5fac14/README.md) |

## 6. Prior-Findings Reconciliation & Verdicts (§6.6.2 / §8)

| ID | Type | Severity | Prior State | Current State | Disposition & Notes |
| :---- | :---- | :---- | :---- | :---- | :---- |
| `P104-RV-01` | Confirmed defect (PR `#18` review) | Medium | `open` on `9f48640` | `resolved` in `05c38bf` | Bounded cursor pagination + keyboard-accessible `Older sessions` link verified across tied start times and `201`-session Nginx Playwright flow. |
| `P104-RV-02` | Confirmed defect (PR `#18` review) | Medium | `open` on `9f48640` | `resolved` in `05c38bf` | Microsecond `parseStrictIsoInstant` comparison rejects sub-ms reversed ranges (`400` on `endedAt`, unchanged row count) while preserving offsets and optional `endedAt`. |
| `VG-P101-02` | Verification gap | Low | `open` | `open` | `Pending owner sign-off` — physical owner desktop `Tab` focus & `Ctrl+P` print-preview check. |
| `VG-P103-01` | Verification gap | Medium (for real data; non-blocking for `P1-04`) | `open` | `open` | `Pending P1-11 / P1-12` — live VPS TLS, Vault secret mounts, and `F03`–`F04` recovery rehearsals. |
| `VG-P103-02` | Verification gap | Low (planned slice boundary) | `open` (narrowed) | `open` (narrowed) | `Pending P1-05..P1-07` — remaining `private-access.feature` scenarios (`evidence download`, `finding page/CSRF`, `project report`). |
| `OPT-P101-01` | Optional improvement | Low / Info | `open` | `open` | `Pending owner sign-off` — optional `pnpm deploy` `api` image-size reduction before `P1-11`. |

- **Foundation Gates `F01` & `F02`:** **`PASS` (Owner accepted; all `F01`/`F02` gates retained and green)**.
- **`P1-04` Implementation & Session Review Remediation Status:** **`Complete`** on synthetic data (`fix/p1-04-session-review`, `05c38bf` + `3fb8088`).
- **Local Verification Status:** **`PASS`** (`0` open defects; all quality, OpenAPI, `98.47%`/`95.56%` service coverage, `19/19` PG 19 integration, `7/7` BDD, `1/1` `f01-containers`, `3/3` Nginx Playwright, and security/license/blocking checks `exit 0`).
- **Exact-Commit CI Status:** Verified on PR head commit via all `4` required `ci.yml` status checks.
- **Owner Acceptance Status:** **`Pending owner sign-off`**.
- **Production / Real-Data Verdict:** **`NOT READY` (`INSUFFICIENT EVIDENCE`)** — real client data remains strictly unauthorized until `P1-05`–`P1-13`, `F03`–`F04`, and section 8 Audit verdict complete.
