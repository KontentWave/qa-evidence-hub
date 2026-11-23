# Changelog

All notable changes to QA Evidence Hub are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Pre-1.0 versions (`0.x.y`) reflect active Phase 1 development on synthetic data only; real client data remains unauthorized until `F03`–`F04` and the section 8 production audit verdict pass in `P1-13`.

## [0.4.0] - 2026-11-23

### Added (`P1-04` — Engagement context: clients, projects, and test sessions)

- Added additive Prisma models (`Client`, `Project`, `TestSession`, `ProjectStatus`) and PostgreSQL 19 migration (`20261123000000_engagement_context`) enforcing non-null `clients -> projects -> test_sessions` foreign keys (`ON DELETE RESTRICT ON UPDATE RESTRICT`), trimmed nonblank text `CHECK` constraints, `Active` project creation default, `UNIQUE (project_id, id)` on `test_sessions` for downstream same-project composite foreign keys, `CHECK (ended_at IS NULL OR ended_at >= started_at)`, and parent-scoped B-tree indexes while keeping `test_sessions` strictly separate from `auth_sessions`.
- Implemented authenticated, parent-scoped create, list, and detail endpoints under `/api/v1` in `apps/api/src/{clients,projects,sessions}/` (`POST/GET /api/v1/clients`, `GET /api/v1/clients/:clientId`, `POST/GET /api/v1/clients/:clientId/projects`, `GET /api/v1/clients/:clientId/projects/:projectId`, `POST/GET /api/v1/projects/:projectId/sessions`, `GET /api/v1/projects/:projectId/sessions/:sessionId`) with explicit `AuthenticatedActor` checks, strict calendar-validated ISO-8601 UTC/offset parsing, allowlisted DTOs + `fieldErrors`, `FOR SHARE` active-project status verification during session creation, `404` rejection on missing or mismatched parents, `100%` line and `100%` branch V8 service coverage across all three new domain services (`98.36%` lines / `95.02%` branches aggregate across `9` eligible files), and regenerated `@qa-evidence-hub/api-client` OpenAPI types.
- Built linked Next.js App Router pages and accessible client forms (`apps/web/app/clients/**`, `apps/web/src/components/{workspace-header,create-client-form,create-project-form,create-session-form}.tsx`, `apps/web/src/lib/{timezone,browser-csrf,api}.ts`) featuring owner-timezone (`Europe/Bratislava`) display and DST-safe `datetime-local` conversion, read-only `qaeh_session`-only `private, no-store` SSR forwarding, anonymous HTML redirect (`307`) to `/login` without private content, direct same-origin `/api/v1/*` browser mutations with `Origin` and `X-CSRF-Token`, and keyboard-focused `#session-error-summary` linked to `#session-ended-at` while preserving all non-sensitive entered fields when `endedAt` precedes `startedAt`.
- Added `apps/api/test/engagement-context.integration.spec.ts`, Cucumber BDD runner `apps/api/cucumber.engagement.mjs` + `apps/api/bdd/engagement-context.steps.ts` binding both `@S1` scenarios in `specs/features/engagement-context.feature` and the `@P1-04` `project page` example in `specs/features/private-access.feature` (`pnpm test:bdd:engagement` wired into `.github/workflows/ci.yml` and `.github/workflows/release.yml`), Playwright Nginx E2E verification (`e2e/engagement-context.spec.ts`), updated schema assertions in `apps/api/test/health-readiness.integration.spec.ts`, `scripts/f01-containers.test.mjs`, and `scripts/test-db-isolation.test.mjs`, and recorded audit run [20261123T173817Z-d5fac14](./audit/20261123T173817Z-d5fac14/README.md).

## [0.3.1] - 2026-11-23

### Changed (Dependencies & Container Baselines)

- Upgraded `@testing-library/jest-dom` from `7.0.1` to `8.0.0` (PR `#14`), `nginx` from `1.30-alpine-slim` to `1.31-alpine-slim@sha256:5bfced78d24d644270bedb0a9968697042e38d5c03fb6354603df025279c1cbe` (`nginx/1.31.9`, PR `#16`), and `postgres` from `17-bookworm` to `19-bookworm@sha256:f4859caf96de494e38efa69ed703b08a5bbd9605e152e604f2daec8841c87c41` (`PostgreSQL 19.0`, PR `#15`), updating the Compose volume mount target in `compose.yaml` and `compose.test.yaml` to `/var/lib/postgresql` for PostgreSQL 18+ `PGDATA` cluster layout compatibility.

### Fixed (`P1-03` Compose Auth Overrides)

- Forwarded `AUTH_PASSWORD_SCRYPT_LN: "${AUTH_PASSWORD_SCRYPT_LN:-16}"` and `AUTH_LOGIN_MAX_ATTEMPTS: "${AUTH_LOGIN_MAX_ATTEMPTS:-5}"` beside `TRUST_PROXY` under `services.api.environment` in `compose.yaml`, and added `AUTH_LOGIN_MAX_ATTEMPTS=5` beside `AUTH_PASSWORD_SCRYPT_LN=16` in `.env.example`, preserving existing API defaults while enabling operator `docker compose --env-file` overrides.
- Extended `scripts/f01-containers.test.mjs` to exercise `compose.yaml` and the production API image through `docker compose --env-file` with inherited process environment copies cleared, verifying rendered defaults (`16` and `5`), healthy API startup and validated runtime `passwordScryptLn = 14` with `AUTH_PASSWORD_SCRYPT_LN=14`, bounded non-zero startup validation failure on `AUTH_PASSWORD_SCRYPT_LN=17` (`14`–`16`), and per-IP `401`/`401`/`429` (`Retry-After > 0`) login throttling through Nginx with `AUTH_LOGIN_MAX_ATTEMPTS=2`.

## [0.3.0] - 2026-11-22

### Security & Fixed (`P1-03` Review Hardening)

- Serialized `AuthService.login` session mutations with `scripts/provision-owner.ts reset-password` (`apps/api/src/auth/auth.service.ts`, `apps/api/test/auth-api.integration.spec.ts`): kept expensive `scrypt` verification outside the database transaction, acquired `SELECT ... FROM "owners" WHERE "singleton_key" = true FOR UPDATE` before mutating sessions, compared the locked row's `password_hash` with the verified hash (returning generic `401` with zero cookies if rotated), and held the row lock through prior-session revocation, `20`-session cap eviction, and new session insertion.
- Counted in-flight per-IP login reservations alongside recorded failures against `AUTH_LOGIN_MAX_ATTEMPTS` before any asynchronous owner lookup or `scrypt` verification (`apps/api/src/auth/login-throttler.service.ts`, `apps/api/src/auth/auth.service.ts`), settling each reservation once on `success`, `invalid_credentials`, or `error` while preserving active reservations across concurrent successes and bounded `maxKeys` bucket eviction.
- Aligned `AUTH_PASSWORD_SCRYPT_LN` validation and runtime bounds (`apps/api/src/config/env.validation.ts`, `apps/api/src/auth/password-hasher.service.ts`, `scripts/f01-containers.test.mjs`, `.env.example`) with the `128 MiB` per-hash `scrypt` limit on Node `24.22.3`: kept default `16`, accepted `14`–`16`, rejected `17` and `18` at startup validation with a clear configuration error, and preserved stored-parameter verification for CLI-provisioned PHC hashes.

### Added (`P1-03` — Single-owner authentication, session boundary, and CSRF protection)

- Added Prisma models and SQL migration (`20261121000000_owner_and_auth_sessions`) for `owners` (PostgreSQL `singleton_key` unique constraint enforcing a single owner even under concurrent provisioning) and `auth_sessions` (storing SHA-256 `token_digest` values, per-session CSRF salts, expiry timestamps, and revocation metadata).
- Added operator-only provisioning and password-reset CLI (`scripts/provision-owner.ts`, bundled at `/app/scripts/provision-owner.ts` in `apps/api/Dockerfile` and tested in `scripts/provision-owner.test.mjs` + `apps/api/test/auth-api.integration.spec.ts`) using salted adaptive `scrypt`, hidden TTY or `--password-stdin` input, CLI `--password` rejection, atomic session revocation on password reset, and zero-secret output.
- Implemented `apps/api/src/auth/` (`PasswordHasherService`, `CsrfService`, `LoginThrottlerService`, `AuthService`, `AuthAndCsrfGuard`, `AuthController`) with default-deny `APP_GUARD` authorization, generic `401` login failures, bounded per-IP login throttling (`429` + `Retry-After`) and bounded hashing queue, host-only `HttpOnly; Secure; SameSite=Lax; Path=/` cookies, browser-bound pre-login and session-bound post-login `X-CSRF-Token` + exact `Origin` checks before multipart processing, read-only `GET /api/v1/auth/session` (`private, no-store, no-transform`, zero `Set-Cookie`), and regenerated `@qa-evidence-hub/api-client` OpenAPI types.
- Built accessible Next.js `/login` and protected `/` UI (`apps/web/app/login/page.tsx`, `apps/web/src/components/login-form.tsx`, `apps/web/src/components/logout-button.tsx`, `apps/web/src/lib/api.ts`) with explicit labels, keyboard navigation, visible error-summary focus on validation/`401` failures, direct `/api/v1/auth/*` browser mutations, and read-only `qaeh_session`-only SSR forwarding.
- Added `apps/api/test/auth-api.integration.spec.ts`, `@P1-03` Cucumber BDD steps (`specs/features/private-access.feature`, `apps/api/bdd/private-access.steps.ts`, `pnpm test:bdd:auth`), adapted `scripts/f01-containers.test.mjs` (including test-only HTTPS `Secure` cookie and HTTP-downgrade proof through Nginx) and `e2e/foundation-smoke.spec.ts`, and wired auth BDD + `>= 80%` `auth/` service coverage into `.github/workflows/ci.yml` and `.github/workflows/release.yml`.

### Security & Changed (`P1-03`)

- Tightened `TRUST_PROXY` validation and Express proxy resolution (`apps/api/src/config/env.validation.ts`, `apps/api/src/config/trusted-proxy.ts`, `compose.yaml`) to trust forwarded headers **only** from the configured single-hop Nginx ingress (`false`, `loopback`, explicit IP/CIDR, or `nginx` service hostname), rejecting numeric hop counts and broad `uniquelocal`/`linklocal` ranges so sibling internal containers (`web`) cannot spoof `X-Forwarded-*` headers.
- Enforced exact `APP_ORIGIN` configuration in production (requiring `https://` for non-loopback production origins) and rejected non-HTTPS requests at `AuthAndCsrfGuard` whenever an `https://` origin is configured.

## [0.2.1] - 2026-11-21

### Security & Fixed (`P1-02` `F02` Review Hardening)

- Hardened GHCR privacy verification (`scripts/verify-ghcr-privacy.mjs` + `scripts/verify-ghcr-privacy.test.mjs` + `.github/workflows/release.yml`): verify package existence (`HTTP 200`) and private OCI denial (`401`/`403` `UNAUTHORIZED`/`DENIED` JSON) **before** building/pushing, and require authenticated `HTTP 200` digest/tag parity plus conclusive `401`/`403` OCI error JSON on unauthenticated/anonymous pulls **after** publishing (failing closed on `200`, `404`, and `5xx` outages).
- Enabled full Trivy `library` + embedded `secret` scanning (`--scanners vuln,secret --pkg-types library`) alongside `os` scanning on `postgres:17-bookworm` (`scripts/security-scan.mjs`), replacing the broad `checkAllLibrary: false` skip with an expiry-bounded, target/package/CVE/rule-pinned allowlist (`scripts/container-scan-exceptions.json` + `scripts/container-scan-exceptions.test.mjs`) and adding an OCI embedded-secret negative fixture in `scripts/security-gates-blocking.test.mjs`.
- Preserved immutable `sha-<12>` commit tags across `main` and `v*` release runs (`concurrency.group: release-${{ github.sha }}` + reusing existing `sha-<12>` GHCR digests and promoting `:vX.Y.Z` via OCI v2 manifest aliasing so commit and version tags resolve to the identical `@sha256:` digest).

## [0.2.0] - 2026-11-21

### Added (`P1-02` — CI pipeline, repository controls, and `F01`/`F02` gate completion)

- Added SHA-pinned, read-only pull-request CI workflow (`.github/workflows/ci.yml`) running formatting, ESLint boundary rules, strict TypeScript, OpenAPI drift check, Vitest unit/contract tests, 80% line/branch API auth/domain coverage gate (`N/A` until `P1-03`), disposable PostgreSQL integration + isolation checks, Cucumber.js Foundation BDD (`specs/foundation/health-readiness.feature` with zero-scenario failure guard), production builds, `F01` container/Nginx/persistence suite, Playwright browser smoke (`e2e/foundation-smoke.spec.ts`), security/license scans, and blocking-fixture verification.
- Added trusted-ref release workflow (`.github/workflows/release.yml`) that builds `api` and `web` production images once, scans and smoke-tests those exact artifacts behind Nginx, generates SPDX 2.3 JSON SBOMs (`syft`), publishes to private GHCR packages (`ghcr.io/kontentwave/qa-evidence-hub-api` and `ghcr.io/kontentwave/qa-evidence-hub-web`), verifies private package visibility / anonymous pull denial (`HTTP 401`), and retains `release-provenance.json` + SBOM artifacts.
- Added `.github/CODEOWNERS`, `.github/pull_request_template.md`, and `.github/dependabot.yml` across `npm`, `github-actions`, `docker`, and `docker-compose` (with `version-update:semver-major` ignores keeping `node` base images and `@types/node` on Node 24 LTS and `typescript` on `5.x` during Phase 1).
- Added executable gate scripts and negative-fixture tests: `scripts/check-format*`, `scripts/check-workflows*`, `scripts/check-api-service-coverage*`, `scripts/check-licenses*` + `scripts/license-policy.json`, `scripts/check-static-security.mjs`, `scripts/security-scan.mjs` + `scripts/dependency-exceptions.json`, `scripts/verify-cucumber-executed*`, `scripts/run-playwright-foundation-smoke.mjs`, and `scripts/security-gates-blocking.test.mjs`.
- Added [ADR-015](./adr/015-phase1-delivery-profile.md) and initial [runbook.md](./runbook.md) documenting delivery simplifications, coverage exclusions, SPDX license policy and reviewed exceptions, vulnerability gating, solo-owner branch protection, and private GHCR provenance.

### Security & Changed (`P1-02`)

- Updated pinned container base images to `node:24.22.3-trixie-slim@sha256:af02d57b57719b9657a45199a79264a9437940cd55b3c7b3fc99615654f124a0`, `nginx:1.30-alpine-slim@sha256:8c950211a641ec5b23f265450517001f6bcca533666120ebe36cb4cff3d00a55` (`nginx/1.30.7` minimal image without unused XSLT/`libxml2` modules, remediating `CVE-2026-113425` and `CVE-2026-86144`), and `postgres:17-bookworm@sha256:837bed18782820fe967067cb5328b02b0d9992c1be9a37ee0c9c492cfc03af3b`.
- Hardened `apps/api/Dockerfile` and `apps/web/Dockerfile` `runner` stages with `apt-get upgrade -y` (`zlib1g` fix) and removal of unused global `npm`, `npx`, `corepack`, and `yarn` CLI bundles.
- Added `pnpm-workspace.yaml` `overrides.effect: 3.22.5` remediating `GHSA-7589-6fvf-x4pw` (`0` vulnerabilities in `pnpm audit` across prod and dev); reconciled upstream withdrawal of `picomatch` `GHSA-fc5q-39xc-vjpf` (`VG-P101-03`).

## [0.1.0] - 2026-11-18

### Added (`P1-01` — Repository and local container foundation)

- Initialized locked `pnpm@12.21.0` TypeScript monorepo (`apps/api`, `apps/web`, `packages/api-client`), baseline Prisma migration plumbing (`_prisma_migrations` only), OpenAPI export/client generation, digest-pinned multi-stage non-root Dockerfiles, `compose.yaml` / `compose.dev.yaml` / `compose.test.yaml`, Nginx single-origin reverse proxy (`infra/nginx/default.conf`), `scripts/test-db.sh`, `scripts/check-digests.mjs`, `scripts/f01-containers.test.mjs`, relocated unchanged `specs/features/*.feature` (`AC01`–`AC08`), [ADR-001](./adr/001-next-nest-postgres-vps.md), and audit run `20261118T162641Z-2d67a0c`.
