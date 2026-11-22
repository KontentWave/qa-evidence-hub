# Audit Run `20261122T103217Z-53fa99d` — `P1-03` Review Hardening Follow-Up

## 1. Context and Reviewed Baseline

- **Run ID:** `20261122T103217Z-53fa99d`
- **Observation window:** `2026-11-22T09:50:00Z` – `2026-11-22T10:33:00Z`
- **Project:** QA Evidence Hub (`/home/marcel/projects/qa-evidence-hub`, GitHub `KontentWave/qa-evidence-hub`)
- **Prior reviewed baseline:** `059f09556ade322822e6c96d913c9a635ca0e312` (`059f095`, documenting `14d8864` on `feat/p1-03-single-owner-auth`, PR [#13](https://github.com/KontentWave/qa-evidence-hub/pull/13)).
- **Starting working-tree state:** `?? .github/skills/` (untracked local `.github/skills/implement-slice/SKILL.md`, preserved untouched and unstaged throughout).
- **Tested implementation baseline:** `53fa99dd3665385abd1ac3c57b56e1a063cc03af` (`53fa99d` on `feat/p1-03-single-owner-auth`, PR [#13](https://github.com/KontentWave/qa-evidence-hub/pull/13)), `git status --short` showing only preserved `?? .github/skills/`.
- **Verified container image digests on `53fa99d`:**
  - Local verified `apps/api/Dockerfile` (`runner`, `UID 1000`, `Node.js v24.22.3`): `sha256:40d1ca90783ac5d09432dfd6e49717e2815bf324f45874ed25f5a44fcbf3bc9b` (`684.3 MiB`)
  - Local verified `apps/web/Dockerfile` (`runner`, `UID 1000`, `Node.js v24.22.3`): `sha256:eafb512f310f0492569aebe23093ca16bfc02f70e6002c83dd99ce78f90a9af2` (`283.9 MiB`)
  - Pinned base & stack images unchanged: `node:24.22.3-trixie-slim@sha256:af02d57b57719b9657a45199a79264a9437940cd55b3c7b3fc99615654f124a0`, `postgres:17-bookworm@sha256:837bed18782820fe967067cb5328b02b0d9992c1be9a37ee0c9c492cfc03af3b` (`PostgreSQL 17.12`), `nginx:1.30-alpine-slim@sha256:8c950211a641ec5b23f265450517001f6bcca533666120ebe36cb4cff3d00a55` (`nginx/1.30.7`).
- **Scope:** Remediates and verifies all three `P1-03` review findings on synthetic data while preserving `F01`/`F02` gates and unchanged `P1-03` baseline evidence from [20261121T205500Z-14d8864](../20261121T205500Z-14d8864/README.md).

## 2. Changed Repository Paths (`11` files in `53fa99d`)

- **API auth & config (`4`):** `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/login-throttler.service.ts`, `apps/api/src/auth/password-hasher.service.ts`, `apps/api/src/config/env.validation.ts`.
- **Unit, PostgreSQL integration & container tests (`4`):** `apps/api/src/auth/auth.spec.ts`, `apps/api/src/config/env.validation.spec.ts`, `apps/api/test/auth-api.integration.spec.ts`, `scripts/f01-containers.test.mjs`.
- **Configuration & operational documentation (`3`):** `.env.example`, `.github/docs/CHANGELOG.md`, `.github/docs/runbook.md`.

## 3. Review Findings Addressed and Verified

1. **`P103-RV-01` — Password reset and session creation consistency (`resolved`):**
   - `AuthService.login` keeps expensive `scrypt` verification outside the database transaction, then executes `SELECT "id", "login_identifier", "password_hash", "timezone" FROM "owners" WHERE "singleton_key" = true FOR UPDATE` as the first statement inside `prisma.$transaction` — locking the identical singleton owner row as `scripts/provision-owner.ts reset-password` before mutating any sessions.
   - Compares the locked row's `password_hash` with the exact hash verified outside the transaction; if missing or rotated, rolls back, settles the throttle reservation, returns generic `401`, and issues zero cookies.
   - Holds the `FOR UPDATE` row lock through prior-session revocation, `20`-session cap eviction (`orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]`), and new session insertion.
   - Deterministically verified in `apps/api/test/auth-api.integration.spec.ts` against disposable PostgreSQL across both lock orderings (including `pg_blocking_pids(pid)` lock-wait proof) and a synchronized `16 + 8 = 24` valid-login burst leaving exact `20` active sessions (`20` cookies `200`, `4` oldest cookies `401` with `revoke_reason = 'session_cap_evicted'`).
2. **`P103-RV-02` — In-flight per-IP login reservation accounting (`resolved`):**
   - `LoginThrottlerService.reserveAttempt` reserves a per-IP attempt before the first asynchronous owner lookup or `scrypt` check, counting `failures + inFlight` against `AUTH_LOGIN_MAX_ATTEMPTS` and rejecting excess or blocked attempts with `429` + `Retry-After`.
   - Single-settlement reservation handles (`settle('success' | 'invalid_credentials' | 'error')`) settle each reservation at most once; `success` resets failure counters while preserving concurrent `inFlight` reservations, `error` releases the slot without penalizing or clearing prior failures, and `ensureCapacity` skips `inFlight > 0` buckets during `maxKeys` eviction.
   - Deterministically verified with a controlled verifier in `apps/api/src/auth/auth.spec.ts` and `apps/api/test/auth-api.integration.spec.ts` covering admission at limit (`0` extra DB lookups on `429`), IP independence, reservation preservation across concurrent success and `20`-IP bucket eviction, immediate recovery after `500` verifier errors, and recovery after block expiry.
3. **`P103-RV-03` — `scrypt` `AUTH_PASSWORD_SCRYPT_LN` alignment with runtime `128 MiB` ceiling (`resolved`):**
   - Retained `SCRYPT_MAXMEM = 128 MiB` and default `AUTH_PASSWORD_SCRYPT_LN = 16`, accepted `14`–`16`, and rejected `17` and `18` during `validateApiEnv` with a clear `EnvValidationError` (and guarded stored-hash verification via `MAX_ALLOWED_LN = 16` + OpenSSL memory bound check while preserving stored `ln,r,p` verification for CLI-provisioned hashes).
   - Verified in Vitest unit/integration suites and directly on `Node.js v24.22.3` (`node:24.22.3-trixie-slim@sha256:af02d57b...` in `scripts/f01-containers.test.mjs` Step 5b + direct `v24.22.3` Vitest run): `17` and `18` fail startup validation cleanly, `16` initializes the API and verifies both fresh `ln=16` and CLI-provisioned hashes, and `14` verifies CLI-provisioned `ln=16` hashes using stored parameters.

## 4. Category Reports

- [01-security.md](./01-security.md)
- [02-optimization.md](./02-optimization.md)
- [04-reliability-dependability.md](./04-reliability-dependability.md)
- [06-error-handling.md](./06-error-handling.md)
- [11-build-release-supply-chain.md](./11-build-release-supply-chain.md)
- [12-test-assurance.md](./12-test-assurance.md)
- Areas `03`, `05`, `08`, `09`, `10` unchanged from [20261121T205500Z-14d8864](../20261121T205500Z-14d8864/README.md); area `07` `NOT APPLICABLE`.

## 5. Sanitized Validation Ledger (`53fa99d`)

Tool versions: `node v24.21.0` (local host) / `v24.22.3` (pinned container runtime), `corepack 0.36.0`, `pnpm 12.21.0`, `Docker Engine 29.1.3`, `TypeScript 5.9.3`, `ESLint 10.15.0`, `Vitest 5.1.1` (`@vitest/coverage-v8 5.1.1`), `@cucumber/cucumber 13.3.0`, `@playwright/test 1.65.1`, `Prisma 7.10.1`, `PostgreSQL 17.12`, `Nginx 1.30.7`, `Gitleaks v8.30.1`, `Trivy 0.76.2`.

| Criterion | Environment | Command / Procedure (Sanitized) | Result / Exit Code | Evidence |
| :---- | :---- | :---- | :---- | :---- |
| Image digest & workflow SHA/security check | Local WSL2 | `pnpm verify:digests && pnpm verify:workflows` | `PASS` (`exit 0`) | [11-build-release-supply-chain.md](./11-build-release-supply-chain.md) |
| `.editorconfig` formatting (`133` files) & ESLint (`0` errors) | Local WSL2 | `pnpm format:check && pnpm lint` | `PASS` (`exit 0`) | [11-build-release-supply-chain.md](./11-build-release-supply-chain.md) |
| Strict TypeScript & OpenAPI zero-drift | Local WSL2 | `pnpm typecheck && pnpm openapi:check` | `PASS` (`exit 0`) | [11-build-release-supply-chain.md](./11-build-release-supply-chain.md) |
| Unit, contract, web RTL, `provision-owner` & gate suites | Local (`v24.21.0`) & Container (`v24.22.3`) | `pnpm test` (plus API Vitest inside `node:24.22.3-trixie-slim`) | `PASS` (`exit 0`, `81/81`: API `19`, Web `8`, `node:test` `54`; `19/19` on `v24.22.3`) | [12-test-assurance.md](./12-test-assurance.md) |
| `>= 80%` line & branch `apps/api/src/auth/` V8 coverage gate | Local WSL2 | `pnpm test:coverage` | `PASS` (`exit 0`, `97.91%` lines `328/335`, `94.23%` branches `196/208` across `6` files) | [12-test-assurance.md](./12-test-assurance.md) |
| Production workspace build (`api-client`, `api`, `web` standalone) | Local WSL2 | `pnpm build` | `PASS` (`exit 0`; `/` & `/login` `ƒ Dynamic`) | [11-build-release-supply-chain.md](./11-build-release-supply-chain.md) |
| Disposable PostgreSQL integration (`auth-api.integration.spec.ts` + DB isolation) | Local Docker (`PostgreSQL 17.12`) | `pnpm test:integration && node --test scripts/test-db-isolation.test.mjs` | `PASS` (`exit 0`, `13/13` integration + `3/3` DB isolation) | [01-security.md](./01-security.md), [04-reliability-dependability.md](./04-reliability-dependability.md) |
| Cucumber.js Foundation (`@foundation`) & Auth (`@P1-03`) BDD | Local Docker | `pnpm test:bdd:foundation && pnpm test:bdd:auth` | `PASS` (`exit 0`, `1/1` + `3/3` scenarios, `31/31` steps) | [12-test-assurance.md](./12-test-assurance.md) |
| `F01` + `P1-03` containers, `Node v24.22.3` `scrypt` (`16`/`14` vs `17`/`18`), HTTPS `Secure`-cookie Nginx & volume persistence | Local Docker (`Node v24.22.3`) | `node --test scripts/f01-containers.test.mjs` | `PASS` (`exit 0`, `1/1`) | [01-security.md](./01-security.md), [11-build-release-supply-chain.md](./11-build-release-supply-chain.md) |
| Playwright Chromium smoke through Nginx | Local Docker | `pnpm test:e2e:foundation` | `PASS` (`exit 0`, `1/1`) | [12-test-assurance.md](./12-test-assurance.md) |
| Gitleaks secrets, AST/Trivy IaC, `pnpm audit` deps, 4-image Trivy OCI, SPDX licenses & negative blocking fixtures | Local WSL2 & Docker | `pnpm verify:security:secrets && pnpm verify:security:static && pnpm verify:security:deps && pnpm verify:security:containers && pnpm verify:licenses && pnpm test:gates:blocking` | `PASS` (`exit 0`, `0` leaks/vulns, `625` licenses, `5/5` blocking fixtures) | [01-security.md](./01-security.md), [11-build-release-supply-chain.md](./11-build-release-supply-chain.md) |
| Trusted-ref `release.yml` private GHCR push & SPDX SBOM retention for `P1-03` | GitHub Actions `Release` | Restricted to `refs/heads/main` and `refs/tags/v*` post-merge | `NOT VERIFIED` (by `F02` read-only PR CI design) | `.github/workflows/release.yml` |
| Deferred `private-access.feature` domain scenarios (`P1-04`–`P1-07`), live VPS `F03`–`F04` (`P1-11`–`P1-12`), and physical desktop `Tab`/`Ctrl+P` (`VG-P101-02`) | Future slices / owner browser | Deferred per slice scope | `NOT VERIFIED` (`VG-P103-02`, `VG-P103-01`, `VG-P101-02`) | [20261121T205500Z-14d8864](../20261121T205500Z-14d8864/README.md) |

## 6. Verdicts and Status Separation (§6.6.2 / §8)

- **Foundation Gates `F01` & `F02`:** **`PASS` (Owner accepted; all `F01`/`F02` gates retained and green on `53fa99d`)**.
- **`P1-03` Implementation & Review Remediation Status:** **`Complete`** on synthetic data (`53fa99d`, PR [#13](https://github.com/KontentWave/qa-evidence-hub/pull/13)).
- **Local Verification Status:** **`PASS`** (`0` open defects; all unit, `97.91%`/`94.23%` `auth/` coverage, PostgreSQL concurrency/throttling integration, BDD, `Node v24.22.3` container/HTTPS, Playwright, and security/license checks `exit 0`).
- **Owner Acceptance Status:** **`Pending owner sign-off`** on PR [#13](https://github.com/KontentWave/qa-evidence-hub/pull/13).
- **Production / Real-Data Verdict:** **`NOT READY` (`INSUFFICIENT EVIDENCE`)** — `P1-04`–`P1-13`, `F03`–`F04`, and section 8 Audit verdict remain unimplemented.
