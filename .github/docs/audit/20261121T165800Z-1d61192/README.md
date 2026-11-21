# Audit Run `20261121T165800Z-1d61192` — `P1-02` `F02` Review Hardening (`v0.2.1`)

## 1. Context and Reviewed Baseline

- **Run ID:** `20261121T165800Z-1d61192`
- **Observation window:** `2026-11-21T16:40:00Z` – `2026-11-21T16:58:00Z`
- **Reviewed baseline:** `1d611921d018e8b944f8c2c95aca97c3f16ae9b7` (`fix/p1-02-astra-f02-hardening` atop `main` `3594cd7`).
- **Scope:** Addresses all three items raised in external `F01`/`F02` review by GPT 6.2 Astra (`F01` accepted; two `F02` gate hardenings + commit-tag stability across `main` and `v*` releases). Reuses unchanged baseline evidence from [20261120T144000Z-1b5a236](../20261120T144000Z-1b5a236/README.md) and [20261121T145200Z-c39b9c0](../20261121T145200Z-c39b9c0/README.md).

## 2. Review Findings Addressed and Verified

1. **Outage-proof pre-push & post-push GHCR privacy gate (`F02`):** Implemented `scripts/verify-ghcr-privacy.mjs` (`pre-push` + `post-push`) requiring authenticated `HTTP 200` existence/digest/tag parity and conclusive `401`/`403` OCI `UNAUTHORIZED`/`DENIED` JSON on unauthenticated and anonymous probes; simulated `200`, `404`, `503`, and non-OCI HTML responses all fail closed (`scripts/verify-ghcr-privacy.test.mjs`).
2. **Full PostgreSQL `library` + `secret` Trivy scan with individual exceptions (`F02`):** Removed `checkAllLibrary: false` on `postgres` in `scripts/security-scan.mjs`; all four images (`api`, `web`, `nginx`, `postgres`) now run `--scanners vuln,secret --pkg-types library` + `--scanners vuln --pkg-types os --ignore-unfixed`, gated by target-, package/rule-, and expiry-bounded (`2027-02-19`) entries in `scripts/container-scan-exceptions.json` (`scripts/container-scan-exceptions.test.mjs`, `scripts/security-gates-blocking.test.mjs`).
3. **Immutable `sha-<12>` commit digest across `main` and `v*` tags (traceability):** Serialized `release.yml` per commit (`release-${{ github.sha }}`), reused existing `sha-<12>` GHCR artifacts without rebuilding or mutating `sha-<12>`, and aliased `:vX.Y.Z` to the exact raw manifest bytes via OCI v2 `PUT /manifests/<tag>`.

## 3. Category Reports

- [01-security.md](./01-security.md)
- [11-build-release-supply-chain.md](./11-build-release-supply-chain.md)
- [12-test-assurance.md](./12-test-assurance.md)
- Areas `02`–`06`, `08`, `10` unchanged from `20261120T144000Z-1b5a236` / `20261121T145200Z-c39b9c0`; `07` & `09` `NOT APPLICABLE`.

## 4. Verdicts and Status Separation

- **Foundation Gate `F01`:** **`PASS` (Owner accepted)**
- **Foundation Gate `F02`:** **`PASS` (All review items resolved and verified; `Pending owner sign-off` on `v0.2.1`)**
- **Production / Real-Data Verdict:** **`NOT READY` (`INSUFFICIENT EVIDENCE`)** — `P1-03`–`P1-13`, `F03`–`F04`, and section 8 Audit verdict remain unimplemented.
