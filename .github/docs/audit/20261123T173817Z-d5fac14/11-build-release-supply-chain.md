# 11 — Build, Release, Configuration, and Supply Chain (`P1-04`)

- **Run ID:** `20261123T173817Z-d5fac14`
- **Reviewed baseline:** `d5fac14699321a165cd6d235dd77b20ceb9bac73`

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Immutable `@sha256:` image digests across Dockerfiles, `compose.yaml`, `compose.test.yaml` (`postgres:19-bookworm`, `nginx:1.31-alpine-slim`, `node:24.22.3-trixie-slim`), and scanner images | Static check | `PASS` | `pnpm verify:digests` |
| GitHub Actions workflow security (`ci.yml` `contents: read`, 40-char SHA action pins, zero inline `${{ ... }}` in `run:`, `pnpm test:bdd:engagement` wired into both `ci.yml` and `release.yml`) | Static check | `PASS` | `pnpm verify:workflows` |
| Zero lockfile drift (`pnpm-lock.yaml` untouched), SPDX license policy (`625` package entries), `pnpm audit` (`0` advisories), and 4-image Trivy `vuln,secret` scan (`0` unreviewed findings) | Local runtime | `PASS` | `pnpm verify:licenses`, `pnpm verify:security:deps`, `pnpm verify:security:containers` |
| Non-root `UID 1000` (`node`) execution and standalone Next.js dynamic route compilation across all 5 authenticated routes (`/`, `/clients`, `/clients/[clientId]`, `/clients/[clientId]/projects/[projectId]`, `/clients/[clientId]/projects/[projectId]/sessions/[sessionId]`) | Local Docker build & runtime | `PASS` | `scripts/f01-containers.test.mjs`, `pnpm test:e2e:foundation` |

## Findings

None.
