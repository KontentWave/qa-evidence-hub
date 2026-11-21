# 11 — Build, Release, Configuration, and Supply Chain (`P1-02` Astra `F02` Review Hardening)

- **Run ID:** `20261121T165800Z-1d61192`
- **Reviewed baseline:** `1d611921d018e8b944f8c2c95aca97c3f16ae9b7` (`fix/p1-02-astra-f02-hardening`)
- **Scope and evidence limits:** Covers commit-tag immutability (`sha-<12>`) across `main` and `v*` release runs, OCI v2 manifest aliasing, pre/post-push GHCR privacy checks, and scoped `postgres` container scan exceptions.

## Hardened Release & Supply-Chain Invariants (`v0.2.1`)

1. **Per-commit serialization (`concurrency.group: release-${{ github.sha }}`):** Prevents concurrent `Release(main)` and `Release(vX.Y.Z)` runs on the same commit SHA from racing or overwriting `sha-<12>`.
2. **Immutable `sha-<12>` commit artifact reuse & OCI v2 manifest aliasing (`scripts/verify-ghcr-privacy.mjs`):**
   - When `sha-<12>` already exists in private GHCR for `${GITHUB_SHA}`, `release.yml` pulls and re-verifies that exact `@sha256:` image (Trivy scan, Syft SPDX 2.3 SBOM, `f01-containers.test.mjs`, Playwright Nginx smoke) without rebuilding or overwriting `sha-<12>`, and aliases `:vX.Y.Z` to the exact raw manifest bytes via OCI v2 `PUT /manifests/<tag>`.
   - `verify-ghcr-privacy.mjs post-push` asserts that both `sha-<12>` and `:vX.Y.Z` resolve to the **bit-for-bit identical `@sha256:` digest**.
3. **Individually reviewed `postgres:17-bookworm` allowlist (`scripts/container-scan-exceptions.json`):**
   - Scoped strictly to `imageRole: "postgres"` (`expiresOn: 2027-02-19`, max 95-day review horizon): `usr/local/bin/gosu` (`stdlib@v1.24.6`, 27 explicit CVE IDs) and `/etc/ssl/private/ssl-cert-snakeoil.key` (`RuleID: private-key`). `api`, `web`, and `nginx` have `0` exceptions.
