# 01 — Security (`P1-03` Compose Auth Overrides)

- **Run ID:** `20261123T144201Z-96796bb`
- **Reviewed baseline:** `96796bbde1758c03939564f9662837ae95cf6005` (`fix/p1-03-compose-auth-overrides`)
- **Scope and evidence limits:** Covers operator `.env` forwarding of `AUTH_PASSWORD_SCRYPT_LN` and `AUTH_LOGIN_MAX_ATTEMPTS` in `compose.yaml` and end-to-end Nginx container verification.

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| `compose.yaml` forwards `AUTH_PASSWORD_SCRYPT_LN` (default `16`) and `AUTH_LOGIN_MAX_ATTEMPTS` (default `5`) under `services.api.environment` without exposing either setting to `web` or `nginx` | Static + `docker compose config --format json` | `PASS` | `compose.yaml`, `scripts/f01-containers.test.mjs` |
| `AUTH_LOGIN_MAX_ATTEMPTS=2` supplied solely via `docker compose --env-file` enforces per-IP login admission through Nginx with valid `Origin` and `X-CSRF-Token` (`401`, `401`, then `429` with positive `Retry-After`) | Local Docker + Nginx runtime | `PASS` | `scripts/f01-containers.test.mjs` (Step 7c) |
| `AUTH_PASSWORD_SCRYPT_LN=14` supplied solely via `docker compose --env-file` starts `api` healthy and applies validated `passwordScryptLn = 14` (`$scrypt$ln=14,r=8,p=1$`) on PID 1 | Local Docker runtime | `PASS` | `scripts/f01-containers.test.mjs` (Step 7c) |
| Gitleaks secret scan and AST SAST + Trivy IaC scan on updated `compose.yaml` and `.env.example` pass with `0` findings | Local runtime | `PASS` | `pnpm verify:security:secrets`, `pnpm verify:security:static` |

## Findings

`P103-RV-04` resolved and verified. Deferred `VG-P103-01` and `VG-P103-02` remain unchanged per slice plan.
