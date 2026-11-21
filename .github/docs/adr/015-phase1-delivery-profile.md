# ADR-015: Phase 1 Delivery, CI/CD Assurance, and Solo-Owner Enforcement Profile

- **Status:** Accepted
- **Date:** 2026-11-20
- **Slice:** `P1-02` — Phase 1 Slice 2 (CI pipeline, repository controls and `F01`/`F02` gate completion)
- **Related specification:** [project_sheet.md](../project_sheet.md) (§§6.0, 6.4, 6.6, 6.6.2, 7, 7.1, 8) · [ADR-001](./001-next-nest-postgres-vps.md)

## Context

QA Evidence Hub is built and operated in Phase 1 by a solo practitioner (`@KontentWave`) targeting a single Linux VPS with Docker Compose, Nginx, Next.js, NestJS, PostgreSQL, and private Cloudflare R2 storage. Before implementing authentication (`P1-03`) or domain/storage features (`P1-04`–`P1-10`), Foundation gates `F01` and `F02` require reproducible pull-request quality/security enforcement, real container smoke verification behind Nginx in CI, solo-owner branch protection that genuinely blocks broken changes, and traceable private GHCR release artifacts with retained SBOMs.

At the same time, enterprise multi-environment delivery infrastructure (persistent staging clusters, blue/green or canary traffic routers, feature-flag ramp services, dedicated cloud secrets managers, Sigstore key-management ceremony infrastructure, and full distributed tracing/SLO platforms) would add recurring cost, operational surface area, and maintenance overhead disproportionate to a single-owner engagement tool.

## Decision

Adopt a simplified, high-integrity Phase 1 delivery and assurance profile enforced through GitHub Actions, immutable container digests, and explicit operational controls:

1. **Isolated synthetic CI environments instead of persistent staging:**
   - Every pull request (`ci.yml`) and release (`release.yml`) boots disposable PostgreSQL instances (`compose.test.yaml` + `scripts/test-db.sh`) and full production container stacks (`compose.yaml`: `postgres`, `api`, `web`, `nginx`) with synthetic credentials and synthetic data inside isolated ephemeral runners.
   - Live Cloudflare R2 provider contract tests (introduced in `P1-05` / `P1-11`) will target a dedicated private synthetic R2 test bucket strictly separated from any real engagement bucket.

2. **Read-only PR workflows and SHA-pinned supply chain:**
   - All third-party GitHub Actions in `.github/workflows/ci.yml` and `.github/workflows/release.yml` are pinned by full 40-character lowercase commit SHA (enforced by `scripts/check-workflows.mjs`).
   - All external Dockerfile base images, Compose runtime images, and containerized security/SBOM scanners (`gitleaks`, `trivy`, `syft`) are pinned by `@sha256:<64-hex>` manifest digest (`scripts/check-digests.mjs` and `scripts/check-workflows.mjs`).
   - Pull-request jobs run strictly with `permissions: contents: read` and receive zero GHCR publishing, VPS SSH/deployment, Ansible Vault, or R2 credentials.

3. **Layered CI quality, BDD, coverage, security, and license gates (`F01` + `F02`):**
   - Formatting (`.editorconfig`), ESLint boundary rules, strict TypeScript, and zero OpenAPI client drift (`pnpm openapi:check`).
   - Vitest unit/contract suites, disposable PostgreSQL integration + parallel isolation/cleanup verification, Cucumber.js Foundation BDD (`specs/foundation/`, failing CI if zero Foundation scenarios execute while keeping product scenarios in `specs/features/` for `P1-03`–`P1-10`), and Playwright Chromium browser smoke through Nginx (`/` rendering `System status: Ready`).
   - 80% line and 80% branch V8 coverage gate wired for implemented API auth/domain services (`apps/api/src/{auth,clients,projects,sessions,evidence,findings,observations,retests,reports}`), reporting `N/A` in `P1-02` before `P1-03` introduces `auth/` and proven against below-threshold fixtures in CI.
   - Blocking security and compliance checks exercised against harmless negative fixtures in CI: Gitleaks git-history + working-tree secret detection, TypeScript AST SAST + Trivy IaC config static checks, `pnpm audit` (`HIGH`/`CRITICAL` across prod and dev), Trivy OCI image scanning, and SPDX license allowlist + reviewed runbook exceptions (`scripts/check-licenses.mjs`).

4. **Build-once, scan, smoke-test, SBOM, and private GHCR release pipeline (`release.yml`):**
   - Triggered only from authorized trusted refs (`refs/heads/main` and admin-protected `refs/tags/v*` in `KontentWave/qa-evidence-hub`).
   - Builds production `api` and `web` `runner` images **once**, scans those exact local image IDs with Trivy, generates SPDX 2.3 JSON SBOMs via Syft, smoke-tests those exact images behind Nginx (`f01-containers.test.mjs` + Playwright), and pushes the unmodified tested images to `ghcr.io/kontentwave/qa-evidence-hub-api` and `ghcr.io/kontentwave/qa-evidence-hub-web`.
   - Retains a 90-day `release-provenance.json` + SPDX SBOM bundle linking each registry manifest digest (`sha256:...`) to its commit SHA, passing verification run URL, and SBOM SHA-256, and enforces an anonymous OCI manifest/index pull check (`Accept: application/vnd.oci.image.index.v1+json, ...`) that fails `release.yml` if either GHCR package is publicly readable (`HTTP 200`). Because `KontentWave/qa-evidence-hub` is a `public` personal repository (enabling GitHub Free `main` branch protection), both GHCR packages were seeded as `"visibility": "private"` via authenticated CLI push (without `org.opencontainers.image.source` public-repo inheritance) and granted repository-scoped `Manage Actions access: Write` for `KontentWave/qa-evidence-hub` (verified `HTTP 401` on anonymous pulls).

5. **Solo-owner GitHub branch and tag enforcement:**
   - `main` enforces strict up-to-date required status checks across all four `ci.yml` jobs with administrator enforcement enabled (`enforce_admins: true`), pull-request merge required with `required_approving_review_count: 0` (avoiding solo-owner self-approval deadlock while still requiring PR checks and conversation resolution), and force-pushes/deletions disabled.
   - `refs/tags/v*` is protected by a repository ruleset restricting release tag creation, update, and deletion to the repository owner.

6. **Controlled single-VPS maintenance-window deployment and Ansible Vault runtime secrets (`P1-11`–`P1-12`):**
   - Production releases on the single VPS (`F03`–`F04`) will use explicit maintenance windows, pre-deploy verified off-VPS backups, single-run Prisma migrations, and digest-pinned rollouts rather than zero-downtime blue/green or canary clusters.
   - Provisioning secrets will be encrypted with Ansible Vault (vault key outside the repository) and materialized into root/owner-protected host files mounted read-only via Docker Compose `secrets:` only into the service requiring them, replacing an external cloud secrets-manager daemon in Phase 1.

## Explicitly Deferred Facilities

- **Deferred delivery facilities:** Persistent staging environment, blue/green or canary rollout routing, percentage traffic-ramp feature flags, and a dedicated secrets-manager service (e.g., Vault server / cloud KMS secret injector). Revisit before multi-user/shared operation or if uptime/rotation requirements exceed single-owner maintenance windows.
- **Deferred assurance facilities:** Cryptographic image/attestation signing (e.g., Cosign/Sigstore) and a full distributed tracing, dashboard, and SLO burn-rate platform (e.g., OpenTelemetry collector + Grafana/Tempo/Prometheus stack). Phase 1 relies on immutable `@sha256:` digests, retained SPDX SBOMs + provenance JSON, required CI checks, bounded Docker JSON logs, and targeted host/HTTPS/backup alerts (`F04`).

## Consequences

- **Positive:**
  - Zero cloud staging or observability-cluster sprawl while testing the exact production image bytes and Nginx topology in every CI and release run.
  - Solo owner cannot accidentally merge a PR with failing quality, BDD, browser smoke, digest, coverage, secret, vulnerability, or license checks, yet is never blocked waiting for a nonexistent second human approver.
  - Every published GHCR image digest is deterministically traceable to its exact git commit, passing test/smoke run, and retained SPDX SBOM.
- **Trade-offs and limitations:**
  - Controlled single-VPS deployments incur brief planned maintenance windows during releases (`F04`).
  - Host secret files mounted via Compose `secrets:` are not encrypted at rest by Docker itself; host disk/file permissions and encrypted off-VPS backup handling in `P1-11`–`P1-12` are mandatory before storing real client data.
  - Passing `F01`–`F02` unlocks `P1-03` feature development on synthetic data only; real client data remains strictly unauthorized until `F03`–`F04` and a section 8 Audit verdict (`GO` or owner-accepted `CONDITIONAL GO`) pass in `P1-13`.
