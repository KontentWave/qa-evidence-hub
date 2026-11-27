# QA Evidence Hub — Operational & CI Governance Runbook

- **Status:** Phase 1 Foundation (`F01`–`F02` accepted as of `v0.2.1` / `fbdaa55`), `P1-03` (`AC07` single-owner authentication, PostgreSQL session boundary, CSRF protection, and operator provisioning/reset CLI), and `P1-04` (`AC01` `@S1` engagement context and `AC07` project-page guard) active; `F03`–`F04` VPS provisioning, TLS, R2, deployment, backup, restore, rollback, and alerting procedures remain **planned for `P1-11`–`P1-12`**.
- **Real-data authorization:** **NOT AUTHORIZED.** Synthetic data only until `P1-11`–`P1-13` (`F03`–`F04` and section 8 Audit verdict) are completed and signed off by `@KontentWave`.
- **Related documents:** [project_sheet.md](./project_sheet.md) · [ADR-001](./adr/001-next-nest-postgres-vps.md) · [ADR-015](./adr/015-phase1-delivery-profile.md)

---

## 1. Local and CI Verification Commands (`F01`–`F02`)

Prerequisites: Node.js `>=24.0.0` (`v24.21+` LTS), `pnpm@12.21.0` via Corepack (`corepack enable pnpm`), Docker Engine with Compose v2 and Buildx, and Playwright Chromium (`pnpm exec playwright install chromium` locally; `--with-deps` on Ubuntu CI).

| Check | Command | Purpose & Gate Behavior |
| :---- | :---- | :---- |
| Locked install | `pnpm install --frozen-lockfile` | Enforces exact `pnpm-lock.yaml` resolution and `allowBuilds` postinstall policy |
| Digest & workflow pins | `pnpm verify:digests && pnpm verify:workflows` | Rejects unpinned Dockerfile/Compose/scanner images and unpinned or over-privileged GitHub Actions |
| Formatting & lint | `pnpm format:check && pnpm lint` | Enforces `.editorconfig` formatting and ESLint rules (including `apps/web` DB/storage import bans) |
| Strict types & OpenAPI | `pnpm typecheck && pnpm openapi:check` | Verifies strict TypeScript across all workspaces + `e2e/` and zero drift in `packages/api-client` |
| Unit & gate suites | `pnpm test` | Runs API/Web Vitest unit/contract tests plus digest, sync-sheet, format, workflow, coverage, license, and Cucumber-guard tests |
| API service coverage | `pnpm test:coverage` | Runs V8 coverage and enforces `>= 80%` line and `>= 80%` branch coverage on implemented API auth/domain services (`apps/api/src/{auth,clients,projects,sessions}/**` active through `P1-04`) |
| PostgreSQL integration | `pnpm test:integration` | Provisions disposable PostgreSQL (`scripts/test-db.sh`), runs `prisma migrate deploy`, and executes API DB, `auth-api`, and `engagement-context` integration suites |
| Foundation, Auth & Engagement BDD | `pnpm test:bdd:foundation && pnpm test:bdd:auth && pnpm test:bdd:engagement` | Runs Cucumber.js `@foundation`, `@P1-03`, and `(@AC01 and @S1) or @P1-04` (`specs/features/{private-access,engagement-context}.feature`) scenarios against migrated PostgreSQL and fails if `0` scenarios execute |
| `F01` + `P1-03` container suite | `node --test scripts/f01-containers.test.mjs` | Verifies non-root UID `1000`, internal-only DB/API/Web ports, operator CLI provisioning, anonymous `/` redirect, login/`Ready`/read-only SSR/logout, test-only HTTPS `Secure` cookie + HTTP downgrade rejection through Nginx, header overwrite/`413` caps, and volume survival |
| Browser Nginx smoke | `pnpm test:e2e:foundation` | Boots production stack behind Nginx and verifies anonymous `/` -> `/login` redirect, keyboard error-summary focus, owner sign-in -> `System status: Ready`, and sign-out denial in headless Chromium |
| Security & license gates | `pnpm verify:security:secrets && pnpm verify:security:static && pnpm verify:security:deps && pnpm verify:security:containers && pnpm verify:licenses` | Runs Gitleaks, AST SAST + Trivy IaC config, `pnpm audit`, Trivy OCI image scan, and SPDX license enforcement |
| Blocking fixture proof | `pnpm test:gates:blocking` | Exercises harmless negative fixtures proving every blocking gate exits non-zero on violations |

---

## 2. API Auth and Domain Service Coverage Policy

Enforced by `scripts/check-api-service-coverage.mjs` after `pnpm --filter @qa-evidence-hub/api test:coverage`:

- **Thresholds:** Minimum **`80%` line coverage** and **`80%` branch coverage** (enforced both per eligible file and in aggregate; unexecuted eligible files missing from `coverage-summary.json` fail automatically).
- **Eligible paths:** `apps/api/src/{auth,clients,projects,sessions,evidence,findings,observations,retests,reports}/**/*.ts`.
- **Documented exclusions:**
  - Declarative NestJS wiring, transport contracts, and tests: `*.spec.ts`, `*.dto.ts`, `*.module.ts`, `*.controller.ts`, `*.port.ts`, and barrel `index.ts` files (controllers, DTO allowlists, and storage ports are verified through HTTP/Cucumber/PostgreSQL integration and contract suites rather than line-percentage gaming).
  - Foundation bootstrap/infrastructure plumbing outside auth/domain directories: `src/main.ts`, `src/app.module.ts`, `src/app.setup.ts`, `src/common/**`, `src/config/**`, `src/health/**`, `src/openapi/**`, and `src/prisma/**`.
- **Active enforcement (`P1-03`+):** Beginning in `P1-03` (`apps/api/src/auth/**`) and extended in `P1-04` (`apps/api/src/{clients,projects,sessions}/**`), `scripts/check-api-service-coverage.mjs` enforces `>= 80%` line and `>= 80%` branch coverage per eligible file and in aggregate (`PASS` in `apps/api/coverage/service-coverage-gate.json` and the GitHub Actions job summary). Critical acceptance scenarios remain mandatory regardless of coverage percentage (`project_sheet.md` §6.0, §7).

---

## 3. License Compliance Policy and Reviewed Exceptions

Machine-enforced on every PR and release by `scripts/check-licenses.mjs` using `scripts/license-policy.json` across the full recursive workspace (`pnpm licenses list -r --json`).

### Allowed Permissive & Public-Domain SPDX Identifiers

Packages whose SPDX license expression resolves under standard SPDX `OR` / `AND` rules to the following identifiers are permitted without individual exception entries:

- `MIT`, `ISC`, `0BSD`, `BSD-2-Clause`, `BSD-3-Clause`, `Apache-2.0`, `BlueOak-1.0.0`, `CC0-1.0`, `PSF-2.0`, `Python-2.0`, `Unlicense`

### Default-Blocked Licenses

All strong or network copyleft licenses (`GPL-*`, `AGPL-*`, `SSPL-*`), source-available/commercial-restriction licenses (`BUSL-*`, `Elastic-2.0`), weak-copyleft licenses (`LGPL-*`, `MPL-*`, `EPL-*`, `EUPL-*`), Creative Commons attribution/non-commercial licenses (`CC-BY-*`, `CC-BY-NC-*`, `CC-BY-SA-*`), `UNLICENSED`, missing licenses, and unknown SPDX strings **block CI by default** unless an explicit, package-scoped, owner-reviewed exception is recorded in both `scripts/license-policy.json` and the table below.

### Reviewed License Exceptions

| Package Pattern | SPDX License | Scope | Reviewed Date | Reviewer | Rationale & Obligations |
| :---- | :---- | :---- | :---- | :---- | :---- |
| `@img/sharp-libvips-*` | `LGPL-3.0-or-later` | Runtime dynamic shared library | `2026-11-20` | `@KontentWave` | Unmodified prebuilt `libvips` `.so` dynamically linked by Next.js / Sharp inside private containers. QA Evidence Hub runs on a private single-owner VPS and never distributes modified `libvips` binaries. |
| `lightningcss*` | `MPL-2.0` | Build & standalone CSS | `2026-11-20` | `@KontentWave` | File-level weak-copyleft CSS compiler bundled unmodified by `next@16.4.6`; no MPL-2.0 source files are modified in this repository. |
| `elkjs` | `EPL-2.0` | Dev/CLI only | `2026-11-20` | `@KontentWave` | Transitive dependency of `prisma@7.10.1` CLI tooling; unmodified weak copyleft pruned from production `runner` images. |
| `caniuse-lite` | `CC-BY-4.0` | Build only | `2026-11-20` | `@KontentWave` | Browser compatibility dataset read during Next.js build; pruned from production runtime. |
| `spdx-exceptions` | `CC-BY-3.0` | Dev/build only | `2026-11-20` | `@KontentWave` | Canonical SPDX identifier list used by package-manifest normalization in dev/build tooling only. |

---

## 4. Dependency and Container Vulnerability Policy

Enforced by `scripts/security-scan.mjs` and `scripts/check-static-security.mjs`:

1. **Secrets (`pnpm verify:security:secrets`):** Gitleaks (`v8.30.1`, `@sha256:`-pinned) scans both full git commit history (`gitleaks git`) and the working tree (`gitleaks dir`). Any detected credential blocks CI; zero `.gitleaksignore` suppressions are active.
2. **Static analysis (`pnpm verify:security:static`):** TypeScript compiler AST security check (`eval`, `new Function`, `child_process.exec`/`execSync`, `$queryRawUnsafe`/`$executeRawUnsafe`, `dangerouslySetInnerHTML`, `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED=0`) plus Trivy IaC `config` scan (`HIGH,CRITICAL`) across Dockerfiles and Compose manifests.
3. **Workspace npm dependencies (`pnpm verify:security:deps`):** `pnpm audit --json` runs across **both production and dev dependencies** and blocks any unresolved `HIGH` or `CRITICAL` advisory (`scripts/dependency-exceptions.json` currently contains **`0` active exceptions**):
   - **`VG-P101-03` (`picomatch <=4.0.7`, `GHSA-fc5q-39xc-vjpf`) reconciliation (`2026-11-20`):** Officially **withdrawn** in the GitHub Advisory Database (`withdrawn_at: 2026-11-18T15:38:56Z`, `updated_at: 2026-11-19T16:07:41Z`). Confirmed `0` advisories on `picomatch`.
   - **`GHSA-7589-6fvf-x4pw` (`effect <=3.22.0`, High) remediation (`2026-11-20`):** Remediated via `pnpm-workspace.yaml` `overrides.effect: 3.22.5` (`>=3.22.1`), yielding `0` vulnerabilities across all 4 workspace projects.
   - **Future temporary exception rule:** `scripts/security-scan.mjs` rejects any exception in `scripts/dependency-exceptions.json` if the package is in `dependencies` (prod), if an upstream patched version exists, or if `expiresOn` has passed (maximum 30-day review horizon).
4. **Container images (`pnpm verify:security:containers`):**
   - `apps/api` and `apps/web` production `runner` stages (`node:24.22.3-trixie-slim@sha256:af02d57b...`) apply `apt-get upgrade -y` and strip unused global `/usr/local/lib/node_modules/{npm,corepack}` and `/opt/yarn*` CLI bundles. Trivy scans exported OCI tarballs (without mounting `docker.sock` into the scanner container) across **all four** stack images (`api`, `web`, `nginx`, `postgres`), running **both**:
     - `--scanners vuln,secret --pkg-types library --severity HIGH,CRITICAL --format json` (blocking all unreviewed language/binary vulnerabilities, even if unfixed, and all unreviewed embedded secrets across every image).
     - `--scanners vuln --pkg-types os --severity HIGH,CRITICAL --ignore-unfixed --format json` (blocking all fixable OS package vulnerabilities across every image).
   - **Dependabot baseline alignment (`.github/dependabot.yml`):** Weekly updates run across `npm`, `github-actions`, `docker`, and `docker-compose`, with `version-update:semver-major` ignores on `node` (Dockerfiles), `@types/node`, and `typescript` so Phase 1 stays aligned on Node.js 24 LTS and TypeScript `5.9.x` while still receiving `24.x` / `5.x` minor, patch, and security updates.
   - **Individually reviewed container scan exceptions (`scripts/container-scan-exceptions.json`):**
     - `api`, `web`, and `nginx` (`nginx:1.31-alpine-slim@sha256:5bfced78...`) carry **`0` exceptions** (`0` findings). (Upstream Debian `trixie` unfixed base advisories with `FixedVersion: ""` are tracked via `--ignore-unfixed` on `os` packages and weekly Dependabot `docker` updates.)
     - `postgres` (`postgres:19-bookworm@sha256:f4859caf...`) carries **only** target-, package/rule-, and expiry-bounded entries in `scripts/container-scan-exceptions.json` — any new CVE ID, binary/library target, secret path, or role mismatch fails closed:
       1. `usr/local/bin/gosu` (`stdlib@v1.24.6`, 27 individually listed Go stdlib CVE IDs, `expiresOn: 2027-02-19`): upstream `gosu` only executes local `setuid`/`setgid`/`execve` privilege drops at container startup on `internal: true` `data_net` and never invokes Go TLS/HTTP/mail/MIME/XML packages.
       2. `/etc/ssl/private/ssl-cert-snakeoil.key` (`RuleID: private-key`, `expiresOn: 2027-02-19`): stock Debian `ssl-cert` placeholder snakeoil key baked into official `debian:bookworm` / `postgres:19-bookworm` base layers, unused by our internal `data_net` PostgreSQL service.
       3. `/scan/postgres.tar (debian 12.15)` (`libpam-modules`, `libpam-modules-bin`, `libpam-runtime`, `libpam0g` `@ 1.5.2-6+deb12u2`, `CVE-2025-6020`, owner-approved 30-day window `2026-11-27` -> `2026-12-27`): upstream Docker Hub `postgres:19-bookworm` has not yet rebuilt against `linux-pam 1.5.2-6+deb12u3` (`pam_namespace` symlink traversal); PostgreSQL runs unexposed on `internal: true` `data_net` using `gosu` without PAM/`pam_namespace` or interactive user sessions, and these entries are to be removed as soon as upstream `postgres:19-bookworm` ships `1.5.2-6+deb12u3`.

---

## 5. Solo-Owner Branch Protection and Private GHCR Release Procedure

### Branch & Tag Enforcement (`KontentWave/qa-evidence-hub`)

- **`main` branch protection:** Requires pull requests before merging (`required_approving_review_count: 0` for solo-owner compatibility, `required_conversation_resolution: true`), enforces all rules on administrators (`enforce_admins: true`), blocks force-pushes and branch deletion, and requires strict up-to-date `PASS` on all four `ci.yml` status checks:
  1. `Quality, Types, OpenAPI & Coverage`
  2. `PostgreSQL Integration & Foundation BDD`
  3. `F01 Containers, Nginx & Playwright Smoke`
  4. `Secrets, Static, Dependency, License & Blocking Fixtures`
- **`refs/tags/v*` tag ruleset:** Restricts creation, update, and deletion of `v*` release tags to repository admin (`@KontentWave`) and blocks non-fast-forward tag rewrites.

### Private GHCR Release & SBOM Traceability (`.github/workflows/release.yml`)

1. Triggered automatically on pushes to `main`, pushes of protected `v*` SemVer tags, or `workflow_dispatch` on `main`, serialized per commit via `concurrency.group: release-${{ github.sha }}`.
2. Job `verify-and-test` runs full quality, OpenAPI, unit/coverage, PostgreSQL integration, Foundation BDD, secret, static, dependency, and license gates.
3. Job `build-scan-smoke-publish` runs `scripts/verify-ghcr-privacy.mjs pre-push` **before** building or pushing (requiring authenticated `tags/list` `HTTP 200` and conclusive `401`/`403` OCI error JSON on unauthenticated/anonymous probes). If `sha-<12>` already exists in private GHCR for `${GITHUB_SHA}` (e.g., when tagging `vX.Y.Z` on an already-merged `main` commit), it pulls and re-verifies that exact `@sha256:` artifact without rebuilding or mutating `sha-<12>`, and aliases `:vX.Y.Z` to the identical manifest bytes via OCI v2 `PUT /manifests/<tag>` (`scripts/verify-ghcr-privacy.mjs alias-tag`). Otherwise it builds `api` and `web` **once**, scans all four stack images with Trivy, generates SPDX 2.3 JSON SBOMs with Syft, smoke-tests behind Nginx (`f01-containers.test.mjs` + Playwright), pushes to private GHCR, runs `scripts/verify-ghcr-privacy.mjs post-push` (requiring authenticated `200` + exact digest parity across all tags and conclusive `401`/`403` OCI error JSON on anonymous access — failing closed on `200`, `404`, or `5xx` outages), and retains `release-sboms-and-provenance-<sha>-<run_id>` for 90 days.
4. **Package visibility verification & recreation procedure (as-built `private`):** Both `ghcr.io/kontentwave/qa-evidence-hub-api` and `ghcr.io/kontentwave/qa-evidence-hub-web` are provisioned under `@KontentWave` with `"visibility": "private"` (unlinked from public-repository permission inheritance) and explicit repository-scoped **Manage Actions access → Write** granted to `KontentWave/qa-evidence-hub`. Every `release.yml` run enforces both `pre-push` and `post-push` privacy gates (`scripts/verify-ghcr-privacy.mjs`), rejecting `200` (public leak) as well as `404`/`5xx` (missing manifest or registry outage). If a package ever needs to be recreated from scratch while `KontentWave/qa-evidence-hub` remains a `public` repository (used on GitHub Free for `main` branch protection), do **not** let `GITHUB_TOKEN` create the initial package (which defaults to `public` and cannot be switched back on personal accounts); instead:
   - Seed the initial `private` package from CLI (`gh auth token | docker login ghcr.io -u KontentWave --password-stdin` and `docker push ghcr.io/kontentwave/qa-evidence-hub-{api,web}:bootstrap` without `org.opencontainers.image.source`).
   - In GitHub UI *Package settings → Manage Actions access*, add repository `KontentWave/qa-evidence-hub` with Role **Write** (leaving repository permission inheritance off), then verify via `gh api /user/packages/container/qa-evidence-hub-{api,web} --jq '.visibility'` (`"private"`).

---

## 6. Operator Owner Provisioning and Password Reset (`P1-03`)

QA Evidence Hub enforces **strictly one owner account** in Phase 1 (`owners.singleton_key = true` unique constraint in PostgreSQL) with **zero public self-registration or email recovery**. Account provisioning and password rotation are operator-only actions executed via `scripts/provision-owner.ts` (bundled into the non-root `api` production container at `/app/scripts/provision-owner.ts`).

### Security and Credential Handling Rules

- **Never pass passwords on the command line:** `--password` and `-p` flags are explicitly rejected so credentials never appear in `ps` process listings or shell history.
- **Accepted password channels:** Interactive hidden TTY prompt (echo disabled, double-entry confirmation) or `--password-stdin` (single-line stdin pipe, e.g., from an operator password manager or protected root/owner secret file).
- **Password policy & adaptive KDF:** Minimum `12` characters (maximum `256` characters / `1,024` UTF-8 bytes), non-whitespace, no ASCII control characters, and distinct from `--login`. Hashed using salted OpenSSL/Node `scrypt` (`$scrypt$ln=16,r=8,p=1$<salt>$<hash>`, `N = 65,536`, `16`-byte CSPRNG salt, `64`-byte key, `128 MiB` per-hash `maxmem`). In `apps/api` (forwarded via `services.api.environment` in `compose.yaml` and documented in `.env.example`), `AUTH_PASSWORD_SCRYPT_LN` defaults to `16`, accepts `14`–`16`, and rejects `17` and `18` during startup environment validation; existing CLI-provisioned PHC hashes always verify using their stored `ln,r,p` parameters.
- **Per-IP login admission & in-flight throttling:** Before any database owner lookup or `scrypt` check, `LoginThrottlerService` reserves a per-IP attempt and enforces `failures + inFlight < AUTH_LOGIN_MAX_ATTEMPTS` (default `5`, forwarded via `services.api.environment` in `compose.yaml` and documented in `.env.example`; returning `429` with `Retry-After` when blocked or saturated), settling each reservation exactly once on `success`, `invalid_credentials`, or `error` while preserving concurrent reservations across successes and `AUTH_THROTTLE_MAX_KEYS` bucket evictions.
- **Zero-secret logging:** `scripts/provision-owner.ts` and `apps/api` never write raw passwords, password hashes, session cookies, session digests, CSRF tokens, or `DATABASE_URL` credentials to stdout, stderr, or container logs.

### Initial Single-Owner Provisioning

Inside the running Compose stack (`api` container as non-root `UID 1000`, after `prisma migrate deploy` has applied migrations):

```bash
# Interactive hidden TTY prompt (prompts twice with echo disabled):
docker compose exec api node /app/scripts/provision-owner.ts provision \
  --login owner@example.test \
  --timezone Europe/Bratislava

# Non-interactive stdin pipe (e.g., from secret store / password manager):
secret-tool lookup service qaeh-owner | docker compose exec -T api \
  node /app/scripts/provision-owner.ts provision \
  --login owner@example.test \
  --timezone Europe/Bratislava \
  --password-stdin
```

Against a direct local/test `DATABASE_URL`:

```bash
DATABASE_URL="postgresql://..." node scripts/provision-owner.ts provision \
  --login owner@example.test \
  --timezone Europe/Bratislava
```

- `--timezone` defaults to `Europe/Bratislava` when omitted and must be a valid IANA timezone identifier.
- If an owner row already exists (including under concurrent `provision` invocations), PostgreSQL enforces `owners_singleton_key_key` and the command exits non-zero (`exit 1`) without modifying the existing owner.

### Operator Password Reset and Session Revocation

Rotating the owner password updates `owners.password_hash` and **atomically revokes all active `auth_sessions` rows** (`revoked_at = NOW()`, `revoke_reason = 'password_reset'`) inside one PostgreSQL transaction:

```bash
# Interactive hidden TTY prompt inside the running api container:
docker compose exec api node /app/scripts/provision-owner.ts reset-password \
  --login owner@example.test

# Non-interactive stdin pipe:
secret-tool lookup service qaeh-owner-rotated | docker compose exec -T api \
  node /app/scripts/provision-owner.ts reset-password \
  --login owner@example.test \
  --password-stdin
```

- Optional `--login` verifies that the operator is targeting the expected provisioned owner identifier before rotating credentials; mismatches abort and roll back.
- `AuthService.login` keeps `scrypt` verification outside the database transaction and locks the same singleton `owners` row (`SELECT ... FROM "owners" WHERE "singleton_key" = true FOR UPDATE`) inside its session transaction, verifying the locked `password_hash` still matches the verified hash before revoking prior sessions, evicting oldest sessions above the `20`-session cap, or inserting a new session (returning generic `401` with no cookie if `reset-password` rotated the hash first).
- Immediately after `reset-password` commits, every session authorized by the old password is revoked and unusable (`401` on API routes and `307 -> /login` on Next.js SSR pages), and only the rotated password can establish new sessions.

---

## 7. Deferred Operational Sections (`P1-05`, `P1-11`–`P1-12` — Not Yet Implemented)

The following production runbook sections remain **unimplemented** at the end of `P1-03` and must be delivered and rehearsed before any real client data enters the system:

- **`P1-05`:** Evidence upload reconciliation CLI (`scripts/reconcile-evidence.ts`).
- **`P1-11` (`F03`):** Ansible VPS provisioning (`infra/ansible/site.yml`), Vault key custody, TLS renewal, host Compose secret-file rotation, and private Cloudflare R2 bucket configuration.
- **`P1-12` (`F04`):** Digest-pinned VPS deployment (`scripts/deploy.sh`, `scripts/smoke.sh`), encrypted off-VPS backups (`scripts/backup.sh`), isolated restore and post-restore deletion cleanup (`scripts/restore.sh`), schema-compatible rollback (`scripts/rollback.sh`), resource limits, RTO/RPO targets, and external HTTPS/host alert thresholds.
