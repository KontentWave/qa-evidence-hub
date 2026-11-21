# Audit Run `20261121T145200Z-c39b9c0` — `P1-02` Closeout (`F01` + `F02` Complete)

## 1. Context and Reviewed Baseline

- **Run ID:** `20261121T145200Z-c39b9c0`
- **Observation window:** `2026-11-21T14:18:00Z` – `2026-11-21T14:52:00Z`
- **Reviewed baseline:** `c39b9c022f28fb5868407365cee8a552b6e5c438` (`refs/tags/v0.2.0-rc.5` on `fix/p1-02-nginx-slim-and-ghcr-closeout`, following PR `#4` merge `9611f74` on `main`).
- **Scope:** Delta verification closing `VG-P102-01` (private GHCR package visibility + green `Release` workflow run [44915546496](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44915546496)) and remediating overnight Alpine `libxml2` `CVE-2026-86144` by switching `compose.yaml` to `nginx:1.30-alpine-slim@sha256:8c950211a641ec5b23f265450517001f6bcca533666120ebe36cb4cff3d00a55`. Reuses unchanged `P1-02` baseline evidence from [20261120T144000Z-1b5a236](../20261120T144000Z-1b5a236/README.md).

## 2. Verdicts and Status Separation

- **Foundation Gate `F01`:** **`PASS` (local + GitHub Actions CI + `Release`)**
- **Foundation Gate `F02`:** **`PASS` (all PR/CI/branch-protection/coverage/BDD/Playwright/security/license/SBOM/private-GHCR controls verified)**
- **Owner Acceptance Status:** `P1-02` PR `#4` merged by owner confirmation (`9611f74`); final `nginx-slim` + `VG-P102-01` closeout PR pending merge; physical desktop `Tab`/`Ctrl+P` check (`VG-P101-02`) `Pending owner sign-off`.
- **Production / Real-Data Verdict:** **`NOT READY` (`INSUFFICIENT EVIDENCE`)** — `P1-03`–`P1-13`, `F03`–`F04`, and section 8 Audit verdict remain unimplemented.

## 3. Category Reports

| Area | Report / Status | Summary |
| :---- | :---- | :---- |
| `01` Security | [01-security.md](./01-security.md) | `CVE-2026-86144` blocked by CI and remediated via `nginx:1.30-alpine-slim`; private GHCR `HTTP 401` verified |
| `11` Build, release, config & supply chain | [11-build-release-supply-chain.md](./11-build-release-supply-chain.md) | Green `Release` run `44915546496`, private GHCR digests (`da5f3cb2...`, `63f23f99...`), retained SPDX 2.3 SBOMs, `VG-P102-01` `resolved` |
| `02`–`06`, `08`, `10`, `12` | Unchanged from [20261120T144000Z-1b5a236](../20261120T144000Z-1b5a236/README.md) | Reused per `Audit.md` §3 / §8 (`compose.yaml` `nginx` digest & `--pkg-types` verified in `f01-containers.test.mjs` and run `44915546496`) |
| `07`, `09` | **`NOT APPLICABLE`** | Same rationale as `20261120T144000Z-1b5a236` |

## 4. Prior-Findings Reconciliation (`20261120T144000Z-1b5a236` → `20261121T145200Z-c39b9c0`)

| ID | Prior State | Current State | Evidence |
| :---- | :---- | :---- | :---- |
| `VG-P102-01` | `new` | **`resolved`** | Public GHCR packages deleted and re-seeded as `"visibility": "private"` (`GET /user/packages/container/qa-evidence-hub-{api,web}`); `Manage Actions access: Write` configured; `Release` run [44915546496](https://github.com/KontentWave/qa-evidence-hub/actions/runs/44915546496) passed all jobs (`anonymousPullHttpStatus: 401`). |
| `VG-P101-02` | `open` | `open` | Low — owner manual desktop `Tab` & `Ctrl+P` visual confirmation (`Pending owner sign-off`). |
| `OPT-P101-01` | `open` | `open` | Optional — `pnpm deploy` `api` image size reduction candidate before `P1-11` (`Pending owner sign-off`). |
