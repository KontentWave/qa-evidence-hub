# 01 — Security (`P1-02` Closeout Verification)

- **Run ID:** `20261121T145200Z-c39b9c0`
- **Reviewed baseline:** `c39b9c022f28fb5868407365cee8a552b6e5c438` (`refs/tags/v0.2.0-rc.5` on `fix/p1-02-nginx-slim-and-ghcr-closeout`, atop PR `#4` merge `9611f74` on `main`)
- **Scope and evidence limits:** Targeted security & supply-chain delta verification covering (1) overnight Alpine `libxml2` `CVE-2026-86144` remediation via `nginx:1.30-alpine-slim@sha256:8c950211...` and (2) live verification of private GHCR package visibility (`VG-P102-01` closure). Unchanged `P1-02` controls reuse verified baseline evidence from [20261120T144000Z-1b5a236](../20261120T144000Z-1b5a236/README.md).

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Post-merge `CI` (`44914694847`) and `Release` (`44914694851`) container gate caught newly published Alpine `libxml2` `CVE-2026-86144` (`HIGH`) in `nginx:1.30-alpine@sha256:caf4e1e0...` (`71` OS packages) | Live GitHub Actions CI | `PASS` (gate blocked as designed) | Runs [44914694847](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44914694847), [44914694851](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44914694851) |
| Switching `compose.yaml` to `nginx:1.30-alpine-slim@sha256:8c950211a641ec5b23f265450517001f6bcca533666120ebe36cb4cff3d00a55` (`nginx/1.30.7`, `21` OS packages, removing unused XSLT/`libxml2` modules) passes Trivy `HIGH,CRITICAL` scan (`0` findings) and full `F01` + Playwright smoke | Local + GitHub Actions `Release` | `PASS` | `node --test scripts/f01-containers.test.mjs`, `Release` run [44915546496](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44915546496) |
| Both GHCR packages (`ghcr.io/kontentwave/qa-evidence-hub-api`, `ghcr.io/kontentwave/qa-evidence-hub-web`) report `"visibility": "private"` via GitHub REST API and reject anonymous OCI index/manifest pulls with `HTTP 401` | Live GitHub Packages API + `Release` run | `PASS` | `GET /user/packages/container/qa-evidence-hub-{api,web}`; `Release` run [44915546496](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44915546496) |

## Findings

- **`VG-P102-01` — `resolved`:** Public auto-created GHCR packages were deleted by `@KontentWave`, re-seeded as `"visibility": "private"` without public-repo permission inheritance, granted repository-scoped `Manage Actions access: Write`, and verified end-to-end (`anonymousPullHttpStatus: 401`, `conclusion: success`) in `Release` run [44915546496](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44915546496).
