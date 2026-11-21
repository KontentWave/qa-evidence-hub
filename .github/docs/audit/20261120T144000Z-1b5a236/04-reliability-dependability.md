# 04 — Reliability and Dependability (`P1-02`)

- **Run ID:** `20261120T144000Z-1b5a236`
- **Reviewed baseline:** `1b5a23635a06f484f89840352a45a0f6b9893ca7` (`feat/p1-02-ci-f01-f02-gates`)
- **Scope and evidence limits:** Covers CI determinism, clean-checkout build ordering, concurrent Trivy cache lock prevention, ephemeral port/project isolation, zero-test failure guards, and container volume persistence in CI.

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Clean-checkout `pnpm typecheck`, `pnpm openapi:check`, and `pnpm test` succeed with zero pre-existing `dist/` or `.tsbuildinfo` artifacts | Local cold-checkout test + GitHub Actions CI | `PASS` | Fixed in `616bd62` and `9c9493e`; verified live in CI run [44751299960](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44751299960) |
| Sequential Trivy OCI tarball scans prevent cache/DB lock timeouts (`Failed to acquire cache or database lock`) | Local + GitHub Actions CI | `PASS` | `scripts/security-scan.mjs` (`runContainerVulnerabilityGate`) |
| Zero-scenario / zero-test execution guards fail CI if either Cucumber.js Foundation BDD or Playwright smoke runs `0` cases | Unit + CLI runtime | `PASS` | `scripts/verify-cucumber-executed.mjs` (`3/3` tests), `scripts/run-playwright-foundation-smoke.mjs` |
| Synthetic PostgreSQL record survives `docker compose down` + `docker compose up -d --wait` on persistent volume in GitHub Actions `ubuntu-latest` runner | GitHub Actions CI | `PASS` | `F01 Containers, Nginx & Playwright Smoke` job in run [44751299960](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44751299960) |
| `release.yml` verifies local image `sha256` IDs are unchanged between build, scan, smoke test, and `docker push` (`cancel-in-progress: false`) | GitHub Actions `Release` run | `PASS` | Run [44754188990](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44754188990) |

## Findings

None identified within `P1-02` scope.
