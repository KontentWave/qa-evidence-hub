# 11 — Build, Release, Configuration, and Supply Chain (`P1-03`)

- **Run ID:** `20261121T205500Z-14d8864`
- **Reviewed baseline:** `14d886482670619d89a666d97c1c34e80bbe7a7d`

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| All Dockerfile `FROM` lines (`node:24.22.3-trixie-slim@sha256:af02d57b...`) and Compose images (`postgres:17-bookworm@sha256:837bed18...`, `nginx:1.30-alpine-slim@sha256:8c950211...`) pinned by `@sha256:<64-hex>` | Static + `pnpm verify:digests` | `PASS` | `apps/api/Dockerfile`, `apps/web/Dockerfile`, `compose.yaml`, `compose.test.yaml` |
| All GitHub Actions pinned by 40-char commit SHA, `ci.yml` read-only (`contents: read`), and zero `${{ ... }}` interpolation inside `run:` blocks | Static + `pnpm verify:workflows` + CI | `PASS` | `.github/workflows/ci.yml`, `.github/workflows/release.yml` |
| Zero new npm packages or SPDX license exceptions; `elkjs` (`EPL-2.0`) remains dev-only and pruned from production `runner` images | `pnpm verify:licenses` + Dockerfile inspection | `PASS` | `pnpm-lock.yaml` (`0` diff), `apps/api/Dockerfile` (`pnpm prune --prod`), `625` license entries verified |
| `APP_ORIGIN` required in `NODE_ENV=production` and requires `https://` for non-loopback production origins; `TRUST_PROXY` rejects wildcard, hop-count, and broad private ranges | Unit + integration runtime | `PASS` | `apps/api/src/config/env.validation.ts`, `apps/api/src/config/env.validation.spec.ts` |
| Trivy `HIGH`/`CRITICAL` `library` + `secret` + `os` scans clean across `api`, `web`, `nginx`, and `postgres` | Local & CI container scan | `PASS` | `pnpm verify:security:containers` |

## Findings

None.
