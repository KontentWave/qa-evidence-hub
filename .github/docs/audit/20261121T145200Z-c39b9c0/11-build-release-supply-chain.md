# 11 — Build, Release, Configuration, and Supply Chain (`P1-02` Closeout Verification)

- **Run ID:** `20261121T145200Z-c39b9c0`
- **Reviewed baseline:** `c39b9c022f28fb5868407365cee8a552b6e5c438` (`refs/tags/v0.2.0-rc.5`)
- **Scope and evidence limits:** Verifies end-to-end green execution of `.github/workflows/release.yml` into **private** GHCR packages, SPDX 2.3 SBOM retention, manifest digest linkage, and updated `nginx:1.30-alpine-slim` base-image digest.

## Verified Private GHCR Release Provenance & SBOM Linkage (`v0.2.0-rc.5`, Run `44915546496`)

- **Commit SHA:** `c39b9c022f28fb5868407365cee8a552b6e5c438` (`refs/tags/v0.2.0-rc.5`)
- **Passing Verification & Release Run:** [44915546496](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44915546496) (`conclusion: success` across `Pre-Release Quality, Integration, BDD & Security Gates` and `Build Once, Scan, Smoke-Test, SBOM & Publish Private GHCR`)
- **Retained Artifact Bundle:** `release-sboms-and-provenance-c39b9c022f28fb5868407365cee8a552b6e5c438` (`release-provenance.json` SHA-256 `e9ec5e52dcd298ba1ea51946f6b1f2742c0ee9213d0ffe84b1c34c7654834adf`)
- **Private `api` Image Artifact:**
  - Package & Visibility: `ghcr.io/kontentwave/qa-evidence-hub-api` (`visibility: "private"`, anonymous OCI pull HTTP `401`)
  - Registry Manifest Digest: `ghcr.io/kontentwave/qa-evidence-hub-api@sha256:da5f3cb2a2fac70250d1aa903cd84c57b49d02d1c1b8877a3970f47fc55d405e`
  - Retained SPDX 2.3 SBOM: `qa-evidence-hub-api.spdx.json` (`SHA-256: 1de861fcfaf6d77d06798017435fea32a21a1d079f5581c70eb7f8bf87d73e8d`, `406` packages)
- **Private `web` Image Artifact:**
  - Package & Visibility: `ghcr.io/kontentwave/qa-evidence-hub-web` (`visibility: "private"`, anonymous OCI pull HTTP `401`)
  - Registry Manifest Digest: `ghcr.io/kontentwave/qa-evidence-hub-web@sha256:63f23f99228ff3a2cf7a62c58bdb24637c6d3883342964068b70db2d495b4bee`
  - Retained SPDX 2.3 SBOM: `qa-evidence-hub-web.spdx.json` (`SHA-256: 26b27b9b44ec1761ce706fa0090d8434081419d32a74c3d109ca9bdcd2fc2251`, `150` packages)

## Updated Pinned Nginx Digest

- `nginx:1.30-alpine-slim@sha256:8c950211a641ec5b23f265450517001f6bcca533666120ebe36cb4cff3d00a55` (`nginx/1.30.7`, `21` Alpine `3.24.4` packages, `0` Trivy HIGH/CRITICAL findings).

## Findings

- **`VG-P102-01` — `resolved`** (`F02` private GHCR requirement verified `PASS`).
