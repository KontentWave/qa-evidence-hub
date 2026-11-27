# 11 — Build, Release, Configuration, and Supply Chain (`P1-04` Session Review Hardening)

- **Run ID:** `20261127T162909Z-05c38bf`
- **Reviewed baseline:** `05c38bfb94b4b39ace12385de25d52d17605dc83`

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| `@sha256:` image digests, 40-char workflow action SHAs, `0` `pnpm-lock.yaml` diff, `167` `.editorconfig`-clean files, `625` SPDX licenses, `0` Gitleaks/AST-SAST/Trivy-IaC/`pnpm audit` findings, and `5/5` blocking fixtures | Local WSL2 & Docker | `PASS` | `pnpm verify:digests`, `pnpm verify:workflows`, `pnpm verify:licenses`, `pnpm verify:security:*`, `pnpm test:gates:blocking` |
| Fresh `--no-cache` production `runner` images (`api` `sha256:8aa1c08d...` `687.3 MiB`, `web` `sha256:72ec254d...` `286.8 MiB`) upgrade Debian `trixie` `libzstd1` to `1.5.7+dfsg-1+deb13u1` (`0` vulnerabilities on `api`, `web`, `nginx`) and pass 4-image Trivy scan alongside owner-approved 30-day `postgres` `CVE-2025-6020` exception | Local Docker (`Trivy 0.76.2`) | `PASS` | `pnpm verify:security:containers`, `scripts/container-scan-exceptions.json`, `.github/docs/runbook.md` |
| Trusted-ref `release.yml` private GHCR push & SPDX SBOM retention | GitHub Actions `Release` | `NOT VERIFIED` | Executes only on `refs/heads/main` and `refs/tags/v*` post-merge by `F02` design |

## Findings

None.
