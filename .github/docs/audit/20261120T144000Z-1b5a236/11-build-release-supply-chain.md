# 11 — Build, Release, Configuration, and Supply Chain (`P1-02`)

- **Run ID:** `20261120T144000Z-1b5a236`
- **Reviewed baseline:** `1b5a23635a06f484f89840352a45a0f6b9893ca7` (`feat/p1-02-ci-f01-f02-gates`)
- **Scope and evidence limits:** Covers `F01` CI completion and `F02` CI/repository controls, dependency/container/license/secret supply-chain gates, branch/tag protection, GHCR publishing, SPDX SBOM provenance, and reconciliation of `VG-P101-01` and `VG-P101-03`.

## Pinned Runtimes, Base Images, Scanner Images, and GitHub Actions

- **Runtime & Base Images:**
  - `node:24.22.3-trixie-slim@sha256:af02d57b57719b9657a45199a79264a9437940cd55b3c7b3fc99615654f124a0` (`Node.js v24.22.3` in containers; `v24.21.0` local WSL2; `pnpm@12.21.0`)
  - `postgres:17-bookworm@sha256:837bed18782820fe967067cb5328b02b0d9992c1be9a37ee0c9c492cfc03af3b` (`PostgreSQL 17.12`, identical in `compose.yaml` and `compose.test.yaml`)
  - `nginx:1.30-alpine@sha256:caf4e1e032a20f9c3c5e28fc7f25ffd768ad8677b4975c54193075997b3a97e3` (`nginx/1.30.7`, `0` Trivy HIGH/CRITICAL findings)
- **Scanner & SBOM Containers (`scripts/security-scan.mjs`):**
  - `ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f`
  - `ghcr.io/aquasecurity/trivy:0.76.2@sha256:8f6bb947dbc528902e11f2f5be52f7b519f6a39d5d148f41166f2040499768fb`
  - `ghcr.io/anchore/syft:v1.57.2@sha256:e97e20b6e6d1699c60296b66ab337941724f9bd06ac279d893eda89601fc4b2a`
- **GitHub Actions (`.github/workflows/ci.yml`, `release.yml`):**
  - `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` (`v7.0.1`)
  - `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1` (`v7.1.0`)
  - `actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9` (`v7.0.2`)
  - `docker/login-action@8aa5831fb8d48d8f76594c7ddde61ae58019f550` (`v4.8.0`)

## Release Provenance & SBOM Linkage (`v0.2.0-rc.4`, Run `44754188990`)

- **Commit SHA:** `9c9493e0c336f15986fefe06896652adb449e006` (`refs/tags/v0.2.0-rc.4`)
- **Verification & Smoke Run:** [44754188990](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44754188990) (`Pre-Release Quality, Integration, BDD & Security Gates` `PASS`; `f01-containers.test.mjs`, Playwright Nginx smoke, and Trivy container scan `PASS` on exact built image IDs before `docker push`)
- **Published `api` Artifact:**
  - Registry Manifest Digest: `ghcr.io/kontentwave/qa-evidence-hub-api@sha256:ceb627227da5dc438da8aafd0d58f533774b1db2a0b47feb924a2c8c70bb4400`
  - Retained SPDX 2.3 SBOM: `qa-evidence-hub-api.spdx.json` (`SHA-256: b34ceb0aad7b5ab4b53060bf2f7f0528356e15f723e8d72300634c836ed9de3f`, `406` packages)
- **Published `web` Artifact:**
  - Registry Manifest Digest: `ghcr.io/kontentwave/qa-evidence-hub-web@sha256:43f9acc04168d7e32b6ab4e7d5b3bff49f5d03deda8788e10c8cd7de5617c340`
  - Retained SPDX 2.3 SBOM: `qa-evidence-hub-web.spdx.json` (`SHA-256: ffb5aaa73b6abf6ce16a532d3a52dd90c10446229bf7234c424287c2a7722df5`, `150` packages)

## Prior Findings Reconciliation

- **`VG-P101-03` (`picomatch <=4.0.7`, `GHSA-fc5q-39xc-vjpf`) — `resolved`:** Authoritative GitHub Advisory Database query (`GET /advisories/GHSA-fc5q-39xc-vjpf`) confirmed upstream officially **withdrew** `GHSA-fc5q-39xc-vjpf` (`withdrawn_at: 2026-11-18T15:38:56Z`, `updated_at: 2026-11-19T16:07:41Z`). In addition, `GHSA-7589-6fvf-x4pw` (`effect <=3.22.0`, High) was remediated via `pnpm-workspace.yaml` `overrides.effect: 3.22.5`. Full `pnpm audit` across all prod and dev dependencies passes with **`0` vulnerabilities**.
- **`VG-P101-01` (CI/CD `F01`–`F02` gates, SBOMs, private GHCR digests, branch protection) — `resolved` for `F01` and CI/branch-protection/SBOM/provenance; remaining GHCR UI visibility step split out as `VG-P102-01` below.**

## Open Verification Gap (`F02` Gate Blocker Pending Owner GitHub UI Action)

### `VG-P102-01` — GHCR packages (`qa-evidence-hub-api`, `qa-evidence-hub-web`) require one-time GitHub Web UI transition from `public` to `private`

- **Category:** Build, release, configuration, and supply chain (`11`) (cross-ref `01`)
- **Type & State:** Verification gap / External platform UI prerequisite · `new` · Disposition: `Pending owner action & sign-off`
- **Severity & Confidence:** Medium (gates `F02` closeout before starting `P1-03`; `0` secrets or client data exist in Foundation images) · High confidence
- **Baseline / Evidence:** `GET /user/packages/container/qa-evidence-hub-{api,web}` (`"visibility": "public"`); `Release` run [44754188990](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44754188990) (`Enforce private GHCR package visibility` exited `1` on `api=200, web=200`).
- **Root Cause:** `KontentWave/qa-evidence-hub` is a `public` personal repository (required on GitHub Free to enforce `main` branch protection). When `GITHUB_TOKEN` creates a brand-new GHCR package from a public repository, GitHub auto-links it and sets `"visibility": "public"`. GitHub exposes no REST/GraphQL mutation to toggle package visibility (`PATCH /user/packages/...` is `404`), and the CLI token lacks `delete:packages`.
- **Exact Owner Action Required & Closure Check:**
  1. Open `https://github.com/users/KontentWave/packages/container/qa-evidence-hub-api/settings` and `https://github.com/users/KontentWave/packages/container/qa-evidence-hub-web/settings` → **Danger Zone**.
  2. Delete both auto-created public packages (or switch visibility to **Private** if enabled in UI).
  3. If deleted, seed private packages once from CLI (`gh auth token | docker login ghcr.io -u KontentWave --password-stdin` and `docker push ghcr.io/kontentwave/qa-evidence-hub-{api,web}:bootstrap`), then in each package's **Package settings → Manage Actions access**, add `KontentWave/qa-evidence-hub` with Role **Write** (leaving *Inherit access from repository* unchecked).
  4. Closure check: `gh api /user/packages/container/qa-evidence-hub-{api,web} --jq '.visibility'` returns `"private"` and re-running `.github/workflows/release.yml` passes `Enforce private GHCR package visibility` (`exit 0`).
