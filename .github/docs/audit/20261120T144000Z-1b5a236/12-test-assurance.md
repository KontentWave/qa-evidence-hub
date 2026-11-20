# 12 — Test Assurance and Validation Quality (`P1-02`)

- **Run ID:** `20261120T144000Z-1b5a236`
- **Reviewed baseline:** `1b5a23635a06f484f89840352a45a0f6b9893ca7` (`feat/p1-02-ci-f01-f02-gates`)
- **Scope and evidence limits:** Covers all `P1-01` + `P1-02` unit, contract, coverage-gate, PostgreSQL integration, Foundation Cucumber.js BDD, Playwright Nginx smoke, `F01` container/persistence, negative security-fixture, and live GitHub PR branch-protection blocking checks.

## Executed Suite Summary

| Suite / Check | Environment | Tests / Cases | Result | Key Assertions |
| :---- | :---- | :---- | :---- | :---- |
| `pnpm test` (`api`, `web`, `check-digests`, `sync-sheet`, `check-format`, `check-workflows`, `check-api-service-coverage`, `check-licenses`, `verify-cucumber-executed`) | Local + GitHub Actions CI | `13` API + `4` Web + `45` Node tests (`62` total) | `PASS` | Contracts, boundary rules, SPDX OR/AND evaluation, SHA-pin/template-injection workflow rules, real V8 `<80%` auth-service fixture rejection, zero-scenario Cucumber guard |
| `pnpm test:coverage` | Local + GitHub Actions CI | `13` API specs + coverage evaluator | `PASS` (`N/A` reported) | Reports `N/A` (`0` eligible auth/domain service files in `P1-02`); `80%` line / `80%` branch gate wired for `P1-03`+ |
| `pnpm test:integration` + `scripts/test-db-isolation.test.mjs` | Local + GitHub Actions CI | `3` integration + `3` isolation | `PASS` | Real PostgreSQL `17.12` baseline migration, `/api/v1/health/ready` `200`, concurrent `test-db.sh` isolation & induced-failure zero-leftover cleanup |
| `pnpm test:bdd:foundation` | Local + GitHub Actions CI | `1` scenario (`7` steps) | `PASS` | Cucumber.js `GET /api/v1/health/ready` -> `200` `{ "status": "ready" }` + `no-store`/`nosniff`; fails if `0` scenarios execute |
| `scripts/f01-containers.test.mjs` | Local + GitHub Actions CI + `Release` | `1` end-to-end suite | `PASS` | Non-root `UID 1000`, zero host ports on `postgres`/`api`/`web`, Nginx header overwrite & `413` caps, synthetic PostgreSQL row survival across container recreation |
| `pnpm test:e2e:foundation` (`e2e/foundation-smoke.spec.ts`) | Local + GitHub Actions CI + `Release` | `1` Playwright Chromium spec | `PASS` | `/` renders `System status: Ready` through Nginx, `_next/static/*` `200`, `0` console/page errors; fails if `0` tests execute |
| `pnpm test:gates:blocking` (`scripts/security-gates-blocking.test.mjs`) | Local + GitHub Actions CI | `5` end-to-end negative suites | `PASS` | Exercises real CLI rejection of synthetic secret leak, `eval`/`$queryRawUnsafe` AST SAST, `USER root` Dockerfile IaC, vulnerable dependency audit + lockfile, vulnerable OCI image, `AGPL-3.0-only` license, and `<80%` service coverage |
| Live GitHub disposable PR `#3` unpinned-digest merge block & restoration | GitHub PR `#3` + Branch Protection | SHA `99c7bc4` -> `5639617` | `PASS` | Removing `nginx` `@sha256:` failed 2 required checks ([44749866367](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44749866367)) and blocked merge (`mergeStateStatus: BLOCKED`, `HTTP 405`); restoring pin passed all 4 checks ([44751299960](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44751299960), `mergeStateStatus: CLEAN`) |

## Findings

- Cross-reference `VG-P102-01` (`11-build-release-supply-chain.md`) and `VG-P101-02` (`08-functional-correctness-ux-accessibility.md`).
