# 02 — Optimization and Resource Efficiency (`P1-02`)

- **Run ID:** `20261120T144000Z-1b5a236`
- **Reviewed baseline:** `1b5a23635a06f484f89840352a45a0f6b9893ca7` (`feat/p1-02-ci-f01-f02-gates`)
- **Scope and evidence limits:** Covers CI/release build reuse, pnpm cache effectiveness, image sizes after `runner` stage hardening, and observed container idle memory in local WSL2 and GitHub Actions `ubuntu-latest`. Target VPS capacity measurements remain deferred to `P1-12` (`F04`).

## Checks and Observed Metrics

| Criterion | Environment | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Single image build reused across `f01-containers`, Playwright Nginx smoke, SBOM generation, and Trivy container scan via `PREBUILT_API_IMAGE` / `PREBUILT_WEB_IMAGE` | Local + GitHub Actions CI | `PASS` | `ci.yml` (`f01-containers-and-smoke` finished in ~3m35s in run [44751299960](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44751299960)); `release.yml` builds once before scan/smoke/push |
| Observed `P1-02` `runner` image sizes (`node:24.22.3-trixie-slim` with `apt-get upgrade` and stripped global `npm`/`corepack`/`yarn`) | Local Docker `29.1.3` | Recorded | `api`: `660.6 MiB` (`692,736,228` bytes); `web`: `260.3 MiB` (`272,987,835` bytes) |
| Observed idle container working-set memory behind Nginx | Local Docker `29.1.3` | Recorded | `api`: `112.2 MiB`, `web`: `60.1 MiB`, `postgres`: `117.0 MiB`, `nginx`: `6.3 MiB` |
| Gitleaks working-tree staging copies only `git ls-files --cached --others --exclude-standard` rather than scanning `node_modules/` (`~47 MB` avoided) | Local + GitHub Actions CI | `PASS` | `scripts/security-scan.mjs` (`pnpm verify:security:secrets` completes in `<2s`) |

## Findings

- **Retained Optional Improvement `OPT-P101-01`** (`open`, Low / Informational, `Pending owner sign-off`): `apps/api/Dockerfile` can optionally adopt `pnpm deploy --filter @qa-evidence-hub/api --prod` ahead of `P1-11` VPS disk sizing to trim sibling workspace packages from the `660.6 MiB` `api` image. Does not block `P1-02` or `P1-03`.
