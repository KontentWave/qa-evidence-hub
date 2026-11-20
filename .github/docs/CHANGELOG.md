# Changelog

All notable changes to QA Evidence Hub are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Pre-1.0 versions (`0.x.y`) reflect active Phase 1 development on synthetic data only; real client data remains unauthorized until `F03`–`F04` and the section 8 production audit verdict pass in `P1-13`.

## [0.2.0-rc.1] - 2026-11-20

### Added (`P1-02` — CI pipeline, repository controls, and `F01`/`F02` gate completion)

- Added SHA-pinned, read-only pull-request CI workflow (`.github/workflows/ci.yml`) running formatting, ESLint boundary rules, strict TypeScript, OpenAPI drift check, Vitest unit/contract tests, 80% line/branch API auth/domain coverage gate (`N/A` until `P1-03`), disposable PostgreSQL integration + isolation checks, Cucumber.js Foundation BDD (`specs/foundation/health-readiness.feature` with zero-scenario failure guard), production builds, `F01` container/Nginx/persistence suite, Playwright browser smoke (`e2e/foundation-smoke.spec.ts`), security/license scans, and blocking-fixture verification.
- Added trusted-ref release workflow (`.github/workflows/release.yml`) that builds `api` and `web` production images once, scans and smoke-tests those exact artifacts behind Nginx, generates SPDX 2.3 JSON SBOMs (`syft`), publishes to private GHCR packages (`ghcr.io/kontentwave/qa-evidence-hub-api` and `ghcr.io/kontentwave/qa-evidence-hub-web`), verifies private package visibility / anonymous pull denial, and retains `release-provenance.json` + SBOM artifacts.
- Added `.github/CODEOWNERS`, `.github/pull_request_template.md`, and `.github/dependabot.yml` across `npm`, `github-actions`, `docker`, and `docker-compose`.
- Added executable gate scripts and negative-fixture tests: `scripts/check-format*`, `scripts/check-workflows*`, `scripts/check-api-service-coverage*`, `scripts/check-licenses*` + `scripts/license-policy.json`, `scripts/check-static-security.mjs`, `scripts/security-scan.mjs` + `scripts/dependency-exceptions.json`, `scripts/verify-cucumber-executed*`, `scripts/run-playwright-foundation-smoke.mjs`, and `scripts/security-gates-blocking.test.mjs`.
- Added [ADR-015](./adr/015-phase1-delivery-profile.md) and initial [runbook.md](./runbook.md) documenting delivery simplifications, coverage exclusions, SPDX license policy and reviewed exceptions, vulnerability gating, solo-owner branch protection, and private GHCR provenance.

### Security & Changed (`P1-02`)

- Updated pinned container base images to `node:24.22.3-trixie-slim@sha256:af02d57b57719b9657a45199a79264a9437940cd55b3c7b3fc99615654f124a0`, `nginx:1.30-alpine@sha256:caf4e1e032a20f9c3c5e28fc7f25ffd768ad8677b4975c54193075997b3a97e3` (`nginx/1.30.7`, remediating `CVE-2026-113425` and peer CVEs), and `postgres:17-bookworm@sha256:837bed18782820fe967067cb5328b02b0d9992c1be9a37ee0c9c492cfc03af3b`.
- Hardened `apps/api/Dockerfile` and `apps/web/Dockerfile` `runner` stages with `apt-get upgrade -y` (`zlib1g` fix) and removal of unused global `npm`, `npx`, `corepack`, and `yarn` CLI bundles.
- Added `pnpm-workspace.yaml` `overrides.effect: 3.22.5` remediating `GHSA-7589-6fvf-x4pw` (`0` vulnerabilities in `pnpm audit` across prod and dev); reconciled upstream withdrawal of `picomatch` `GHSA-fc5q-39xc-vjpf` (`VG-P101-03`).

## [0.1.0] - 2026-11-18

### Added (`P1-01` — Repository and local container foundation)

- Initialized locked `pnpm@12.21.0` TypeScript monorepo (`apps/api`, `apps/web`, `packages/api-client`), baseline Prisma migration plumbing (`_prisma_migrations` only), OpenAPI export/client generation, digest-pinned multi-stage non-root Dockerfiles, `compose.yaml` / `compose.dev.yaml` / `compose.test.yaml`, Nginx single-origin reverse proxy (`infra/nginx/default.conf`), `scripts/test-db.sh`, `scripts/check-digests.mjs`, `scripts/f01-containers.test.mjs`, relocated unchanged `specs/features/*.feature` (`AC01`–`AC08`), [ADR-001](./adr/001-next-nest-postgres-vps.md), and audit run `20261118T162641Z-2d67a0c`.
