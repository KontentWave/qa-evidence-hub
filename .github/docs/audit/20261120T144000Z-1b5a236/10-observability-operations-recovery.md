# 10 — Observability, Operations, and Recovery (`P1-02`)

- **Run ID:** `20261120T144000Z-1b5a236`
- **Reviewed baseline:** `1b5a23635a06f484f89840352a45a0f6b9893ca7` (`feat/p1-02-ci-f01-f02-gates`)
- **Scope and evidence limits:** Covers CI/release workflow job summaries, retained BDD/Playwright/SBOM/provenance artifacts, and initial operational governance in `.github/docs/runbook.md`. VPS alerting, off-VPS backups, isolated restore rehearsals, and rollback scripts belong to `P1-12` (`F04`).

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| GitHub Actions `ci.yml` publishes API service coverage status to `$GITHUB_STEP_SUMMARY` and retains Cucumber (`cucumber-foundation-report`) and Playwright (`playwright-foundation-report`) JSON artifacts for 14 days | GitHub Actions CI | `PASS` | CI run [44751299960](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44751299960) |
| GitHub Actions `release.yml` retains 90-day `release-sboms-and-provenance-<sha>` artifacts (`qa-evidence-hub-api.spdx.json`, `qa-evidence-hub-web.spdx.json`, `release-provenance.json`, `sha256sums.txt`) and writes digest/SBOM tables to `$GITHUB_STEP_SUMMARY` | GitHub Actions `Release` run | `PASS` | `Release` run [44754188990](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44754188990) |
| `.github/docs/runbook.md` documents local/CI gate commands, coverage exclusions, SPDX license policy & exceptions, vulnerability triage rules, solo-owner branch protection, and deferred `P1-11`–`P1-12` operational sections | Documentation review | `PASS` | `.github/docs/runbook.md` |
| Production VPS monitoring, backup/restore rehearsals, and rollback scripts (`F04`) | Planned in `P1-12` | `NOT VERIFIED` | Explicitly marked unimplemented in `runbook.md` §6 |

## Findings

None identified within `P1-02` scope.
