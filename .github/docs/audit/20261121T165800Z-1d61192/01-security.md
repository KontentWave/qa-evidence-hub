# 01 — Security (`P1-02` Astra `F02` Review Hardening)

- **Run ID:** `20261121T165800Z-1d61192`
- **Reviewed baseline:** `1d611921d018e8b944f8c2c95aca97c3f16ae9b7` (`fix/p1-02-astra-f02-hardening` atop `main` `3594cd7`)
- **Scope and evidence limits:** Targeted remediation of external review findings on `F02`: (1) outage-proof pre-push + post-push GHCR privacy enforcement (`scripts/verify-ghcr-privacy.mjs`) and (2) full `library` + embedded `secret` Trivy scanning on `postgres:17-bookworm` with individually reviewed, expiry-bounded exceptions (`scripts/container-scan-exceptions.json`).

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| `scripts/verify-ghcr-privacy.mjs` (`pre-push`) verifies authenticated `tags/list` (`HTTP 200`) and conclusive `401`/`403` OCI `UNAUTHORIZED`/`DENIED` JSON on unauthenticated & anonymous token probes **before** building or pushing | Unit + live GHCR API | `PASS` | `scripts/verify-ghcr-privacy.test.mjs`, live probe against `qa-evidence-hub-{api,web}` (`prePushAuthTagsHttp: 200`, `prePushAnonTokenHttp: 401`) |
| `scripts/verify-ghcr-privacy.mjs` (`post-push`) requires authenticated `HTTP 200` + exact SHA-256 digest parity across all tags and conclusive `401`/`403` OCI error JSON on unauthenticated & anonymous probes, rejecting simulated `200`, `404`, `503`, and non-OCI HTML gateway responses | Unit + live GHCR API | `PASS` | `scripts/verify-ghcr-privacy.test.mjs` (`4/4`), live probe against `v0.2.0` digests |
| `scripts/security-scan.mjs` runs `--scanners vuln,secret --pkg-types library` and `--scanners vuln --pkg-types os --ignore-unfixed` across **all four** images (`api`, `web`, `nginx`, `postgres`), matching only target-, package/rule-, and expiry-bounded (`2027-02-19`) `postgres` entries in `scripts/container-scan-exceptions.json` | Unit + full 4-image Trivy runtime + negative OCI secret fixture | `PASS` | `pnpm verify:security:containers` (`exit 0`), `scripts/container-scan-exceptions.test.mjs`, `scripts/security-gates-blocking.test.mjs` test 4b |
| Gitleaks git-history + working-tree secret scan and AST SAST + Trivy IaC config scan pass with `0` findings | Local runtime | `PASS` | `pnpm verify:security:secrets`, `pnpm verify:security:static` (`54` files) |

## Findings

All confirmed `F02` review items resolved and verified.
