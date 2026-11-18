# 11 — Build, Release, Configuration, and Supply Chain (`P1-01`)

- **Run ID:** `20261118T162641Z-2d67a0c`
- **Reviewed baseline:** commit `2d67a0c2f654d4d1f6dcb4758f7022e85ebca5c8` (`feat/p1-01-local-foundation`)
- **Scope and evidence limits:** Covers `packageManager` and `pnpm-lock.yaml` reproducibility, `allowBuilds` postinstall policy, `@sha256:` container base-image pinning, `scripts/check-digests.mjs`, Prisma baseline migration structure, and npm advisory triage. GitHub Actions CI/CD, SBOM generation, license-policy gate, private GHCR image publishing, and branch protection belong to `P1-02` (`F02`).

## Pinned Runtime & Image Digests Verified

- **Node.js:** `v24.21.0` Active LTS (`node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66`)
- **Package manager:** `pnpm@12.21.0` (`corepack 0.36.0`)
- **PostgreSQL:** `17.12` (`postgres:17-bookworm@sha256:40865bc877a289da75963d97d72b59633f639fc5af7a4e856bfa3714cae5b536`, identical across `compose.yaml` and `compose.test.yaml`)
- **Nginx:** `1.30.6` (`nginx:1.30-alpine@sha256:901e593c95dc85f5a729f5765516321366ef4ac401821431d408897e95287d0a`)
- **Application frameworks/tools:** Next.js `16.4.6`, React `19.3.1`, NestJS `12.5.1` (`@nestjs/swagger` `12.1.2`), Prisma `7.10.1` (`@prisma/adapter-pg` `7.10.1`, `pg` `8.23.1`), `openapi-typescript` `7.13.0`, `openapi-fetch` `0.17.0`, Vitest `5.1.1`, ESLint `10.15.0`, `typescript-eslint` `8.73.0`, TypeScript `5.9.3`

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| `pnpm install --frozen-lockfile` succeeds deterministically on host and inside both multi-stage Dockerfiles | Local + Docker build | `PASS` | `pnpm install --frozen-lockfile` (`exit 0`), `scripts/f01-containers.test.mjs` |
| `pnpm-workspace.yaml` `allowBuilds` explicitly blocks telemetry/arbitrary postinstall scripts (`@scarf/scarf: false`, `@swc/core: false`, `esbuild: false`, `sharp: false`) | Static + install runtime | `PASS` | `pnpm-workspace.yaml` |
| `scripts/check-digests.mjs` verifies all external `FROM` lines and Compose images carry real `@sha256:<64-hex>` digests and rejects tag-only or all-zero placeholders | Unit + CLI runtime | `PASS` | `pnpm verify:digests` (`exit 0`), `scripts/check-digests.test.mjs` (`6/6 pass`) |
| Production dependency advisory check (`pnpm audit --prod`) | Local advisory query | `PASS` | `No known vulnerabilities found` (2026-11-18) |
| Full workspace advisory check (`pnpm audit`) including dev/test tools | Local advisory query | `NOT VERIFIED` / Triaged | 1 unpatched dev-only advisory `GHSA-fc5q-39xc-vjpf` (`picomatch <=4.0.7` via `vitest > vite`, `Patched versions: None`); tracked as `VG-P101-03` |
| GitHub Actions `F01` execution, PR blocking status checks, CI coverage/security/license scans, SBOM generation, GHCR digest push, and branch protection | Dependent on `P1-02` | `NOT VERIFIED` | Tracked as `VG-P101-01` |

## Confirmed Defects

None identified within `P1-01` scope.

## Verification Gaps

### `VG-P101-01` — CI/CD `F01`–`F02` gates, SBOMs, private GHCR publishing, and branch protection pending `P1-02`

- **Category:** Build, release, configuration, and supply chain (`11`)
- **Type & State:** Verification gap · `new` · Disposition: `Pending owner sign-off`
- **Severity & Confidence:** Medium (gates `P1-03`+ feature work and production readiness per §6.0 / §6.6) · High confidence
- **Baseline / Evidence:** Planned slice `P1-02` (`project_sheet.md` §6.6); intentionally excluded from `P1-01` per §6.6.1
- **Expected vs Observed:** GitHub Actions workflows (`.github/workflows/ci.yml`, `release.yml`), `CODEOWNERS`, `dependabot.yml`, PR template, CI rejection of unpinned digests, CI Nginx production-image boot, PR status-check blocking, coverage/security/license CI scans, SBOM attestations, private GHCR image pushes, and protected-branch enforcement are not yet implemented (`NOT VERIFIED (dependent on P1-02)`).
- **Smallest Action & Check:** Implement and verify `P1-02` before starting `P1-03`. Does **not** block `P1-01` slice completion; **does** block `P1-03`+ and production use.

### `VG-P101-03` — Upstream unpatched devDependency ReDoS advisory in `picomatch <=4.0.7` (`GHSA-fc5q-39xc-vjpf`)

- **Category:** Build, release, configuration, and supply chain (`11`)
- **Type & State:** Verification gap / Supply-chain triage · `new` · Disposition: `Pending owner sign-off`
- **Severity & Confidence:** Low in `P1-01` context (advisory rated High generically, but unreachable in production runtime) · High confidence
- **Baseline / Evidence:** `pnpm audit` on `pnpm-lock.yaml` (`2d67a0c`); `pnpm audit --prod` returned `No known vulnerabilities found`
- **Expected vs Observed:** `vitest@5.1.1 > vite@8.3.8 > picomatch@4.0.7` triggers `GHSA-fc5q-39xc-vjpf` (`Patched versions: None` upstream as of 2026-11-18). `picomatch` is only invoked against developer-controlled test glob patterns in local/CI Vitest runs and is pruned from both `apps/api` and `apps/web` production container stages.
- **Smallest Action & Check:** Re-evaluate during `P1-02` dependency-gate setup: upgrade `vitest`/`vite` as soon as an upstream patched `picomatch` release is published, or document a time-bounded scoped dev-only advisory rule in `.github/docs/runbook.md` (`P1-02`) if upstream remains unpatched.
