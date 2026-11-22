# 11 — Build, Release, Configuration, and Supply Chain (`P1-03` Review Hardening)

- **Run ID:** `20261122T103217Z-53fa99d`
- **Reviewed baseline:** `53fa99dd3665385abd1ac3c57b56e1a063cc03af`

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| `AUTH_PASSWORD_SCRYPT_LN` validated against `14`–`16` (default `16`, documented in `.env.example` and `runbook.md`), matching `node:24.22.3-trixie-slim` OpenSSL `128 MiB` `maxmem` | Unit + `Node v24.22.3` container runtime | `PASS` | `apps/api/src/config/env.validation.ts`, `.env.example`, `.github/docs/runbook.md`, `scripts/f01-containers.test.mjs` |
| Zero dependency/lockfile changes (`0` diff on `pnpm-lock.yaml`), `625` SPDX license entries verified, and all `@sha256:` / 40-SHA workflow pins intact | Local gate execution | `PASS` | `pnpm verify:digests`, `pnpm verify:workflows`, `pnpm verify:licenses`, `pnpm verify:security:deps` |
| Full 4-image Trivy OCI `vuln,secret` (`library` + `os`) scan clean (`0` unreviewed HIGH/CRITICAL findings) | Local Docker + Trivy `0.76.2` | `PASS` | `pnpm verify:security:containers` |

## Findings

None.
