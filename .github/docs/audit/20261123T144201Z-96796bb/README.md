# Audit Run `20261123T144201Z-96796bb` — `P1-03` Compose Auth Overrides Follow-Up

## 1. Context and Reviewed Baseline

- **Run ID:** `20261123T144201Z-96796bb`
- **Observation window:** `2026-11-23T14:24:00Z` – `2026-11-23T14:43:00Z`
- **Project:** QA Evidence Hub (`/home/marcel/projects/qa-evidence-hub`, GitHub `KontentWave/qa-evidence-hub`)
- **Prior reviewed baseline:** `4fbe5aea7fff9490e51cf1efbda010cd64287359` (`4fbe5ae`, `origin/main` after merging PR [#13](https://github.com/KontentWave/qa-evidence-hub/pull/13)).
- **Starting working-tree state:** `?? .github/skills/` (unrelated untracked local `.github/skills/implement-slice/SKILL.md`, preserved untouched and unstaged throughout).
- **Tested implementation baseline:** `96796bbde1758c03939564f9662837ae95cf6005` (`96796bb` on `fix/p1-03-compose-auth-overrides`), `git status --short` showing only preserved `?? .github/skills/`.
- **Verified container image digests on `96796bb`:**
  - Local verified `apps/api/Dockerfile` (`runner`, `UID 1000`, `Node.js v24.22.3`): `sha256:40d1ca90783ac5d09432dfd6e49717e2815bf324f45874ed25f5a44fcbf3bc9b` (`684.3 MiB`; unchanged — runtime change strictly limited to `compose.yaml`)
  - Local verified `apps/web/Dockerfile` (`runner`, `UID 1000`, `Node.js v24.22.3`): `sha256:eafb512f310f0492569aebe23093ca16bfc02f70e6002c83dd99ce78f90a9af2` (`283.9 MiB`; unchanged)
  - Pinned base & stack images unchanged: `node:24.22.3-trixie-slim@sha256:af02d57b57719b9657a45199a79264a9437940cd55b3c7b3fc99615654f124a0`, `postgres:17-bookworm@sha256:837bed18782820fe967067cb5328b02b0d9992c1be9a37ee0c9c492cfc03af3b` (`PostgreSQL 17.12`), `nginx:1.30-alpine-slim@sha256:8c950211a641ec5b23f265450517001f6bcca533666120ebe36cb4cff3d00a55` (`nginx/1.30.7`).
- **Scope:** Forwards `AUTH_PASSWORD_SCRYPT_LN` and `AUTH_LOGIN_MAX_ATTEMPTS` through `services.api.environment` in `compose.yaml` (preserving defaults `16` and `5`), documents `AUTH_LOGIN_MAX_ATTEMPTS=5` in `.env.example`, and verifies the exact operator `docker compose --env-file` startup path in `scripts/f01-containers.test.mjs` while reusing unchanged `P1-03` baseline evidence from [20261121T205500Z-14d8864](../20261121T205500Z-14d8864/README.md) and [20261122T103217Z-53fa99d](../20261122T103217Z-53fa99d/README.md).

## 2. Changed Repository Paths (`5` files in `96796bb`)

- **Compose & environment example (`2`):** `compose.yaml`, `.env.example`.
- **Container & Nginx smoke test (`1`):** `scripts/f01-containers.test.mjs`.
- **Operational documentation (`2`):** `.github/docs/runbook.md`, `.github/docs/CHANGELOG.md`.

## 3. Review Finding Addressed and Verified

1. **`P103-RV-04` — Forwarding `AUTH_PASSWORD_SCRYPT_LN` and `AUTH_LOGIN_MAX_ATTEMPTS` in `compose.yaml` and exercising the operator `docker compose --env-file` path (`resolved`):**
   - Added `AUTH_PASSWORD_SCRYPT_LN: "${AUTH_PASSWORD_SCRYPT_LN:-16}"` and `AUTH_LOGIN_MAX_ATTEMPTS: "${AUTH_LOGIN_MAX_ATTEMPTS:-5}"` beside `TRUST_PROXY` under `services.api.environment` in `compose.yaml`, and added `AUTH_LOGIN_MAX_ATTEMPTS=5` beside `AUTH_PASSWORD_SCRYPT_LN=16` in `.env.example`, with zero changes to `apps/api` or `apps/web` runtime code.
   - Extended `scripts/f01-containers.test.mjs` (Step 7c) using the checked-in `compose.yaml`, the built production API image, and temporary `.env` files passed via `docker compose --env-file`, explicitly clearing inherited `AUTH_PASSWORD_SCRYPT_LN` and `AUTH_LOGIN_MAX_ATTEMPTS` copies from the test process environment (first verified Red with `AUTH_PASSWORD_SCRYPT_LN=16 AUTH_LOGIN_MAX_ATTEMPTS=5` exported in the shell failing `undefined !== '16'` prior to editing `compose.yaml`, then verified Green):
     - **Defaults (`both keys omitted`):** `docker compose --env-file ... config --format json` renders `services.api.environment.AUTH_PASSWORD_SCRYPT_LN = "16"` and `AUTH_LOGIN_MAX_ATTEMPTS = "5"`.
     - **Valid override (`AUTH_PASSWORD_SCRYPT_LN=14`):** `docker compose --env-file ... up -d --wait` starts `api` `running|healthy` (`GET /api/v1/health/ready` `200` through Nginx), and inspecting PID 1 (`/proc/1/environ` -> `validateApiEnv` + `PasswordHasherService`) confirms `passwordScryptLn = 14`, `loginMaxAttempts = 5`, and `$scrypt$ln=14,r=8,p=1$` hashing.
     - **Invalid override (`AUTH_PASSWORD_SCRYPT_LN=17`):** Executing the normal API startup command (`CMD ["node", "dist/main.js"]` via `docker compose --env-file ... run --rm --no-deps api`) under a bounded `15s` wait exits non-zero (`exit 1`) with `EnvValidationError` naming `AUTH_PASSWORD_SCRYPT_LN` and its allowed range `14 and 16`, with temporary containers, networks, volumes, and `.env` cleaned up and verified empty.
     - **Throttle override (`AUTH_LOGIN_MAX_ATTEMPTS=2`):** Against the existing CLI-provisioned synthetic owner fixture through Nginx from a single client with valid `Origin` and pre-login `X-CSRF-Token`, invalid logins `1` and `2` return `401` and invalid login `3` returns `429` with a positive numeric `Retry-After` header.

## 4. Category Reports

- [01-security.md](./01-security.md)
- [06-error-handling.md](./06-error-handling.md)
- [11-build-release-supply-chain.md](./11-build-release-supply-chain.md)
- [12-test-assurance.md](./12-test-assurance.md)
- Areas `02`–`05`, `08`–`10` unchanged from [20261121T205500Z-14d8864](../20261121T205500Z-14d8864/README.md) and [20261122T103217Z-53fa99d](../20261122T103217Z-53fa99d/README.md); area `07` `NOT APPLICABLE`.

## 5. Sanitized Validation Ledger (`96796bb`)

Tool versions: `node v24.21.0` (local host) / `v24.22.3` (pinned container runtime), `corepack 0.36.0`, `pnpm 12.21.0`, `Docker Engine 29.1.3`, `Docker Compose v5.8.0`, `TypeScript 5.9.3`, `ESLint 10.15.0`, `Vitest 5.1.1` (`@vitest/coverage-v8 5.1.1`), `Prisma 7.10.1`, `PostgreSQL 17.12`, `Nginx 1.30.7`, `Gitleaks v8.30.1`, `Trivy 0.76.2`.

| Criterion | Environment | Command / Procedure (Sanitized) | Result / Exit Code | Evidence |
| :---- | :---- | :---- | :---- | :---- |
| Red-phase verification prior to `compose.yaml` edit | Local Docker (`v24.22.3`) | `AUTH_PASSWORD_SCRYPT_LN=16 AUTH_LOGIN_MAX_ATTEMPTS=5 node --test scripts/f01-containers.test.mjs` | `FAIL` as expected (`exit 1`, `undefined !== '16'`) | [12-test-assurance.md](./12-test-assurance.md) |
| `F01` + `P1-03` containers & operator `docker compose --env-file` auth overrides (`defaults 16/5`, `ln=14`, `ln=17` bounded exit, `maxAttempts=2` Nginx `401`/`401`/`429`) | Local Docker (`Node v24.22.3`, `Compose v5.8.0`) | `node --test scripts/f01-containers.test.mjs` | `PASS` (`exit 0`, `1/1`, `111.6s`) | [01-security.md](./01-security.md), [11-build-release-supply-chain.md](./11-build-release-supply-chain.md), [12-test-assurance.md](./12-test-assurance.md) |
| Image digest, workflow SHA/security, `.editorconfig` format (`133` files), ESLint, strict TS & OpenAPI zero-drift | Local WSL2 | `pnpm verify:digests && pnpm verify:workflows && pnpm format:check && pnpm lint && pnpm typecheck && pnpm openapi:check` | `PASS` (`exit 0`) | [11-build-release-supply-chain.md](./11-build-release-supply-chain.md) |
| Unit/gate suites (`81/81`), `>= 80%` `auth/` V8 coverage (`97.91%`/`94.23%`), & production build | Local WSL2 | `pnpm test && pnpm test:coverage && pnpm build` | `PASS` (`exit 0`) | [12-test-assurance.md](./12-test-assurance.md) |
| Gitleaks secrets, AST SAST + Trivy IaC (`compose.yaml`), `pnpm audit` deps & SPDX licenses | Local WSL2 & Docker | `pnpm verify:security:secrets && pnpm verify:security:static && pnpm verify:security:deps && pnpm verify:licenses` | `PASS` (`exit 0`, `0` leaks/vulns, `625` licenses) | [01-security.md](./01-security.md), [11-build-release-supply-chain.md](./11-build-release-supply-chain.md) |
| Disposable PG integration, Cucumber BDD, Playwright smoke & 4-image Trivy scan on PR head commit | GitHub Actions PR CI (`ci.yml`) | Executed across all `4` required CI jobs on PR head commit (unchanged from `4fbe5ae` locally) | Verified on exact-commit PR CI (`NOT VERIFIED` locally in this targeted run; unchanged `apps/api`/`apps/web` image digests) | `.github/workflows/ci.yml` |
| Trusted-ref `release.yml` private GHCR push & SPDX SBOM retention | GitHub Actions `Release` | Restricted to `refs/heads/main` and `refs/tags/v*` post-merge | `NOT VERIFIED` (by `F02` read-only PR CI design) | `.github/workflows/release.yml` |
| Deferred `private-access.feature` domain scenarios (`P1-04`–`P1-07`), live VPS `F03`–`F04` (`P1-11`–`P1-12`), and physical desktop `Tab`/`Ctrl+P` (`VG-P101-02`) | Future slices / owner browser | Deferred per slice scope | `NOT VERIFIED` (`VG-P103-02`, `VG-P103-01`, `VG-P101-02`) | [20261121T205500Z-14d8864](../20261121T205500Z-14d8864/README.md) |

## 6. Verdicts and Status Separation (§6.6.2 / §8)

- **Foundation Gates `F01` & `F02`:** **`PASS` (Owner accepted; all `F01`/`F02` gates retained)**.
- **`P1-03` Implementation & Compose Follow-Up Status:** **`Complete`** on synthetic data (`96796bb` atop `main` `4fbe5ae`).
- **Local Verification Status:** **`PASS`** (`node --test scripts/f01-containers.test.mjs` and local quality/type/coverage/build/static-security/secret/license checks `exit 0`).
- **Owner Acceptance Status:** **`Pending owner sign-off`**.
- **Production / Real-Data Verdict:** **`NOT READY` (`INSUFFICIENT EVIDENCE`)** — `P1-04`–`P1-13`, `F03`–`F04`, and section 8 Audit verdict remain unimplemented.
