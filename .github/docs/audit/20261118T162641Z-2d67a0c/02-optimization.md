# 02 — Optimization and Resource Efficiency (`P1-01`)

- **Run ID:** `20261118T162641Z-2d67a0c`
- **Reviewed baseline:** commit `2d67a0c2f654d4d1f6dcb4758f7022e85ebca5c8` (`feat/p1-01-local-foundation`)
- **Scope and evidence limits:** Covers local container image footprints, idle container memory on synthetic `P1-01` boot, connection-pool bounds, Nginx body/timeout limits, and Docker log rotation. Production VPS capacity (2 vCPU / 4 GB RAM / 32 GB SSD hypothesis) and 25 MP Sharp image-decode / 500-finding report latency are not yet testable in `P1-01`.

## Observed Local Measurements (WSL2 Linux x86_64, Docker 29.1.3)

| Artifact / Container | Observed Measurement | Notes |
| :---- | :---- | :---- |
| `apps/api` runner image (`sha256:1b5699d4...`) | `659.1 MiB` (`691,065,808 bytes`) uncompressed | Multi-stage `node:24.21.0-trixie-slim`; see `OPT-P101-01` |
| `apps/web` runner image (`sha256:9bd4b39a...`) | `258.8 MiB` (`271,322,777 bytes`) uncompressed | Next.js `output: 'standalone'` + `.next/static` + `public` |
| `api` container idle memory (`docker stats --no-stream`) | `99.93 MiB` | After health/readiness warm-up |
| `web` container idle memory (`docker stats --no-stream`) | `57.93 MiB` | After SSR `/` + static asset warm-up |
| `postgres` container idle memory (`docker stats --no-stream`) | `108.0 MiB` | `shared_buffers=512MB`, `work_mem=8MB`, `max_connections=30` |
| `nginx` container idle memory (`docker stats --no-stream`) | `13.05 MiB` | `nginx:1.30-alpine` (`1.30.6`) |

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| API PostgreSQL pool bounded strictly below `POSTGRES_MAX_CONNECTIONS` (`10 < 30`) with query/statement timeouts (`5000 ms`) | Static + local runtime | `PASS` | `apps/api/src/config/env.validation.ts`, `apps/api/src/prisma/prisma.service.ts`, `env.validation.spec.ts` |
| Nginx enforces `1m` default body cap, `11m` `/api/v1/evidence` cap, `proxy_request_buffering off`, and bounded timeouts | Static + local runtime | `PASS` | `infra/nginx/default.conf`; `scripts/f01-containers.test.mjs` verified `413` on `1.5 MiB` `/api/v1/health`, `200` on `2 MiB` `/api/v1/evidence`, and `413` on `12 MiB` `/api/v1/evidence` |
| Docker `json-file` log rotation (`10m` × `3`) configured on all production services | Static inspection | `PASS` | `compose.yaml` (`postgres`, `api`, `web`, `nginx`) |
| Static UI assets cached immutably while HTML and API responses use `no-store` | Local runtime | `PASS` | `scripts/f01-containers.test.mjs` verified `public, max-age=31536000, immutable` on `/_next/static/*` and `no-store` on `/` and `/api/v1/health*` |

## Confirmed Defects

None identified.

## Verification Gaps

- Target VPS peak RSS/CPU/disk under Sharp 25 MP validation and 500-finding / 2,000-evidence report rendering remains `NOT VERIFIED` until `P1-10` and `P1-12`.

## Optional Improvements

### `OPT-P101-01` — Isolate `apps/api` runtime `node_modules` via `pnpm deploy` to reduce uncompressed image size

- **Category:** Optimization / Build packaging (`02`, cross-ref `11`)
- **Type & State:** Optional improvement · `new` · Disposition: `Pending owner sign-off`
- **Severity & Confidence:** Low (Informational) · High confidence
- **Baseline / Evidence:** `apps/api/Dockerfile:18`, `scripts/f01-containers.test.mjs` metric `api_image=sha256:1b5699d42e0236a8c139ab535ffe9c5ee18dc729f1c20cdaa750fa44814f70c1 size=659.1 MiB`
- **Expected vs Observed:** `CI=true pnpm prune --prod --ignore-scripts` removes all workspace `devDependencies`, but retains workspace sibling production packages (`apps/web`'s `next`) inside `/workspace/node_modules/.pnpm` because all workspace `package.json` manifests are present in the workspace root. Runtime memory (`99.93 MiB`) and attack surface (unimported modules) are unaffected, and `apps/web` standalone image is `258.8 MiB`, but disk transfer/storage for `api` is ~350 MiB larger than strictly required.
- **Smallest Action & Check:** In a subsequent container/CI slice (`P1-02` or before `P1-11` VPS disk budgeting), switch `apps/api/Dockerfile` to `pnpm --filter @qa-evidence-hub/api --prod deploy` (copying the generated Prisma client artifact) and re-run `scripts/f01-containers.test.mjs`. Does **not** block `P1-01`.
