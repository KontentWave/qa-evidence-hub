# ADR-001: Next.js, NestJS, and PostgreSQL Monorepo on Single VPS

- **Status:** Accepted
- **Date:** 2026-11-18
- **Slice:** `P1-01` — Phase 1 Slice 1 (Repository and local container foundation)
- **Related specification:** [project_sheet.md](../project_sheet.md) (§§2, 6.0–6.5, 6.6.1)

## Context

QA Evidence Hub is a private, single-owner application enabling one QA practitioner to capture engagement evidence, record findings and observations, track retests across test sessions, and print structured project reports without maintaining separate defect spreadsheets or ad-hoc screenshot folders.

Selecting a VPS deployment target removed earlier shared-hosting runtime constraints and enabled running long-lived containerized Node.js processes and a dedicated PostgreSQL instance behind a reverse proxy. At the same time, the system must satisfy four architectural constraints from Phase 1 onward:

1. **Strict private access and credential isolation:** Database credentials and private Cloudflare R2 object-storage credentials (introduced in `P1-05`) must never enter browser bundles, client environment variables, or UI rendering code.
2. **Authoritative server validation and business invariants:** Runtime DTO validation, authentication/CSRF checks, upload lease/recovery state machines, project-consistency rules, and report-snapshot assembly need a single authoritative backend boundary rather than being split across UI Server Actions and API handlers.
3. **Portfolio and maintainability alignment:** A strongly typed TypeScript monorepo with an explicit OpenAPI contract between API and web demonstrates clear API/QA engineering boundaries. (TypeScript is a deliberate project preference, not a technical prerequisite for future Model Context Protocol work.)
4. **Future adapter reuse without Phase 1 scope creep:** Application services that accept an explicit authenticated actor and enforce authorization independently of HTTP controllers can later support a read-only or post-MVP MCP adapter (Phase 5+) without rewriting domain persistence or bypassing service checks.

## Decision

Adopt a `pnpm` TypeScript monorepo deployed via Docker Compose behind a single-origin Nginx reverse proxy on a Linux VPS:

1. **Workspace layout (`pnpm` workspaces):**
   - `apps/api`: NestJS modular monolith on the Express adapter (`@nestjs/platform-express`), owning runtime DTO allowlist validation (`ValidationPipe`), exception sanitization, authentication/session/CSRF enforcement (`P1-03`+), business services, Prisma/PostgreSQL persistence, and private object-storage access (`P1-05`+).
   - `apps/web`: Next.js App Router (`output: 'standalone'`) owning server-rendered HTML structure, accessible interactive UI, and `@media print` report presentation. `apps/web` holds zero database or object-storage packages/credentials and queries `apps/api` exclusively over internal HTTP (`INTERNAL_API_BASE_URL`) with `cache: 'no-store'`.
   - `packages/api-client`: OpenAPI TypeScript types and fetch client generated from `apps/api/openapi.json` (`openapi-typescript` + `openapi-fetch`) and verified for zero drift via `pnpm openapi:check`.
   - `specs/features`: Canonical Gherkin acceptance specifications (`AC01`–`AC08`).
2. **Single-origin ingress and network segmentation (`compose.yaml`, `infra/nginx/default.conf`):**
   - Only `nginx` publishes a host port (`HTTP` locally in `P1-01`; `HTTPS` + `HTTP→HTTPS` redirect on VPS in `P1-11` / `F03`).
   - `/api/v1/*` routes to `api:3001` (with `/api/v1/evidence` configured upfront for HTTP/1.1 unbuffered request streaming and bounded body/timeout limits); `/` and `/_next/static/*` route to `web:3000`.
   - Nginx overwrites `X-Forwarded-For` (`$remote_addr`), `X-Forwarded-Proto` (`$scheme`), and `X-Forwarded-Host` (`$http_host`), and NestJS rejects wildcard `TRUST_PROXY=true`.
   - `postgres` runs on an internal-only Docker network (`data_net`) shared solely with `api` and persists state on a named volume (`postgres_data`).
3. **Reproducible container and test baseline (`P1-01`):**
   - Multi-stage Dockerfiles (`apps/api/Dockerfile`, `apps/web/Dockerfile`) and Compose manifests pin all external images (`node:24.21.0-trixie-slim`, `postgres:17-bookworm`, `nginx:1.30-alpine`) by immutable `@sha256:<64-hex>` digest, verified by `scripts/check-digests.mjs`, and run application containers as non-root `node` (`UID 1000`).
   - Integration tests run against disposable, project-isolated PostgreSQL containers (`compose.test.yaml` + `scripts/test-db.sh` scoped strictly to `qaeh_test_<id>`).

## Alternatives Considered

- **Single Next.js application (Route Handlers / Server Actions + Prisma directly in `apps/web`):** Rejected because co-locating database/storage credentials and multipart upload streaming inside the Next.js presentation runtime blurs trust boundaries, complicates unbuffered 10 MiB upload rejection before multipart parsing, and couples domain services to UI framework primitives.
- **Microservices or separate background queue/worker infrastructure in Phase 1:** Rejected as unnecessary operational overhead and memory pressure on a single-owner VPS; synchronous bounded operations with database-backed upload leases and explicit reconciliation satisfy Phase 1 requirements.
- **Unpinned `:latest` or floating minor container tags:** Rejected because floating tags break build reproducibility and supply-chain traceability required by Foundation gates `F01`–`F02`.

## Consequences

- **Positive:**
  - Clean separation between presentation (`apps/web`) and authoritative domain/security/persistence logic (`apps/api`), enforced both by network topology (`data_net`) and ESLint import restrictions.
  - Contract drift between NestJS DTOs and Next.js consumers is caught deterministically via `apps/api/openapi.json` and `pnpm openapi:check`.
  - Non-root runtime images and digest-pinned base images establish the `F01` container baseline ahead of `P1-02` CI automation.
- **Trade-offs and limitations:**
  - Operating two Node.js containers (`web` and `api`) alongside `postgres` and `nginx` uses more baseline memory than a single process; container RSS, image sizes, and PostgreSQL candidate parameters (`shared_buffers=512MB`, `work_mem=8MB`, `max_connections=30` with `DATABASE_POOL_MAX=10`) must be validated under worst-case image decode and report workloads on the target VPS in `P1-12` before storing real client data.
  - Local `P1-01` verification exercises HTTP behind Nginx and locally built production image digests; CI enforcement (`F02`), private GHCR digest publishing (`P1-02`), TLS/Vault provisioning (`F03` / `P1-11`), and backup/restore rehearsals (`F04` / `P1-12`) remain separate downstream gates.
