# 08 — Functional Correctness, Usability, and Accessibility (`P1-02`)

- **Run ID:** `20261120T144000Z-1b5a236`
- **Reviewed baseline:** `1b5a23635a06f484f89840352a45a0f6b9893ca7` (`feat/p1-02-ci-f01-f02-gates`)
- **Scope and evidence limits:** Covers automated Cucumber.js Foundation `/api/v1/health/ready` BDD verification and Playwright Chromium smoke verification of `/` through Nginx. Product UI journeys (`P1-03`–`P1-10`) remain planned.

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Cucumber.js Foundation scenario asserts `GET /api/v1/health/ready` returns `200` `{ "status": "ready" }` with `Cache-Control: no-store` and `X-Content-Type-Options: nosniff` against migrated PostgreSQL | Local + GitHub Actions CI | `PASS` | `specs/foundation/health-readiness.feature`, `apps/api/bdd/foundation-readiness.steps.ts` (`1` scenario, `7/7` steps passed) |
| Playwright Chromium (`159.0.8154.6`) navigates to `/` through live Nginx reverse proxy, verifying `<main#main-content>`, `<h1>QA Evidence Hub</h1>`, visible `role="status"` text `System status: Ready`, `/_next/static/*` `200`, `private, no-store, no-transform` + `nosniff`, and `0` console/page errors | Local + GitHub Actions CI + `Release` workflow | `PASS` | `e2e/foundation-smoke.spec.ts` (`1/1` passed in local run, CI run [44751299960](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44751299960), and `Release` run [44754188990](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44754188990)) |
| Owner manual desktop `Tab` focus-order and `Ctrl+P` print-preview confirmation | Manual owner browser | `NOT VERIFIED` | Retained from `P1-01` as `VG-P101-02` (`Pending owner sign-off`) |

## Findings

- **Retained Verification Gap `VG-P101-02`** (`open`, Low, `Pending owner sign-off`): Automated Playwright checks pass in local and CI Chromium; physical owner desktop `Tab` / `Ctrl+P` visual confirmation remains pending owner review.
