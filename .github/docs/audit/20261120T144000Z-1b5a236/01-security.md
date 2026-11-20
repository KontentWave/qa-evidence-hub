# 01 — Security (`P1-02`)

- **Run ID:** `20261120T144000Z-1b5a236`
- **Reviewed baseline:** branch `feat/p1-02-ci-f01-f02-gates` at commit `1b5a23635a06f484f89840352a45a0f6b9893ca7` (branched from `main` `f77376d72093af503c784c00cfcfcb324ba18c59`; preserved untracked `.github/skills/`)
- **Scope and evidence limits:** Covers `P1-02` CI/release workflow least privilege, SHA-pinned third-party actions and scanner images, secret/SAST/IaC/dependency/container security gates, base-image security remediations, solo-owner branch/tag protection, and GHCR package visibility. Application authentication/CSRF (`P1-03`), R2 bucket access (`P1-05`), and VPS firewall/TLS/Ansible Vault (`P1-11`) remain unimplemented.

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| `.github/workflows/ci.yml` declares top-level read-only `permissions: contents: read`, omits `pull_request_target`, and exposes zero publishing, deployment, SSH, Vault, or R2 secrets | Static + CLI + GitHub Actions CI | `PASS` | `scripts/check-workflows.mjs` (`exit 0`), `scripts/check-workflows.test.mjs` (`3/3`), CI run [44751299960](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44751299960) |
| Zero inline `${{ ... }}` template expressions inside workflow `run:` blocks across `ci.yml` and `release.yml` (hardened during `Audit.md` pass) | Static + CLI | `PASS` | Fixed in `1b5a236`; enforced by `scripts/check-workflows.mjs` |
| Every third-party GitHub Action in `ci.yml` and `release.yml` is pinned by 40-char lowercase commit SHA, and scanner containers (`gitleaks`, `trivy`, `syft`) are pinned by `@sha256:<64-hex>` | Static + CLI | `PASS` | `pnpm verify:workflows` (`exit 0`), `pnpm verify:digests` (`exit 0`) |
| Gitleaks (`v8.30.1`) scans full Git history (`gitleaks git`) and staged non-ignored working tree (`gitleaks dir`) without reading local gitignored `.vscode`/`.env` files; synthetic secret fixture blocks (`exit != 0`) | Local + GitHub Actions CI | `PASS` | `pnpm verify:security:secrets` (`0` leaks), `scripts/security-gates-blocking.test.mjs` test 1 |
| TypeScript AST SAST (`eval`, `new Function`, `child_process.exec`, `$queryRawUnsafe`, `dangerouslySetInnerHTML`, `rejectUnauthorized: false`) + Trivy IaC `config` scan pass with `0` HIGH/CRITICAL findings and block unsafe fixtures | Local + GitHub Actions CI | `PASS` | `pnpm verify:security:static` (`51` files + Dockerfiles clean), `scripts/security-gates-blocking.test.mjs` test 2 |
| Upgraded `nginx:1.30-alpine@sha256:caf4e1e0...` (`1.30.7`, remediating 4 CRITICAL + 5 HIGH CVEs from `1.30.6`) and `node:24.22.3-trixie-slim@sha256:af02d57b...` (`apt-get upgrade -y` `zlib1g` fix + stripped global `npm`/`corepack`/`yarn` in `runner`) pass Trivy HIGH/CRITICAL scan | Local + GitHub Actions CI | `PASS` | `pnpm verify:security:containers` (`exit 0`), `scripts/security-gates-blocking.test.mjs` test 4 |
| Solo-owner branch protection on `main` (`enforce_admins: true`, `strict: true`, `required_approving_review_count: 0`) and admin-only ruleset `27730069` on `refs/tags/v*` active | Live GitHub API | `PASS` | `GET /repos/KontentWave/qa-evidence-hub/branches/main/protection`; disposable PR `#3` blocked on `99c7bc4` (`HTTP 405`) |
| Published GHCR packages (`qa-evidence-hub-api`, `qa-evidence-hub-web`) enforce `private` visibility denying anonymous OCI manifest pulls | Live GitHub API + `release.yml` | `NOT VERIFIED` (`FAIL` until owner UI action) | `VG-P102-01` — auto-created as `public` from public repo; `release.yml` run [44754188990](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44754188990) actively blocks until owner sets `Private` in GitHub UI |

## Confirmed Defects Resolved During Slice Review

- **Fixed in `9c9493e`:** `release.yml` `check_private_package` initially omitted `application/vnd.oci.image.index.v1+json` from `Accept:`, causing GHCR to return `404` on Docker 29 OCI index manifests and masking `"visibility": "public"` in run `44751155275`. Added OCI index/manifest-list media types so `release.yml` accurately detects `HTTP 200` on public packages and exits `1` (verified live in run [44754188990](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44754188990)).
- **Fixed in `1b5a236`:** Moved remaining `${{ steps.*.outputs.* }}` references in `release.yml` `run:` steps into `env:` bindings and added an automated check in `scripts/check-workflows.mjs`.

## Open Verification Gaps

- See `VG-P102-01` in [11-build-release-supply-chain.md](./11-build-release-supply-chain.md) (owner GitHub Package Settings UI step required to switch/recreate both GHCR packages as `private` before starting `P1-03`). Note that the published Foundation images contain zero credentials, keys, or client data (`0` Gitleaks and Trivy secret findings).
