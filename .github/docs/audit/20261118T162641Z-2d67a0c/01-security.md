# 01 — Security (`P1-01`)

- **Run ID:** `20261118T162641Z-2d67a0c`
- **Reviewed baseline:** commit `2d67a0c2f654d4d1f6dcb4758f7022e85ebca5c8` (`feat/p1-01-local-foundation`, clean working tree)
- **Scope and evidence limits:** Covers `P1-01` container, reverse-proxy, runtime validation, secret-boundary, and error-surface foundations. Authentication, sessions, CSRF protection (`P1-03`), R2 object access (`P1-05`), and VPS firewall/TLS/Ansible Vault (`P1-11`) are outside `P1-01` scope and remain unimplemented.

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Application containers (`api`, `web`) run as non-root user (`UID 1000`, `GID 1000`) | Static + local runtime | `PASS` | `apps/api/Dockerfile`, `apps/web/Dockerfile` (`USER node`); `scripts/f01-containers.test.mjs` verified `id -u === 1000` in both built images |
| `api`, `web`, and `postgres` publish zero host ports in `compose.yaml`; `postgres` isolated on `internal: true` `data_net` | Static + local runtime | `PASS` | `compose.yaml`; `scripts/f01-containers.test.mjs` inspected `NetworkSettings.Ports` (`null` bindings on `postgres`, `api`, `web`; loopback `127.0.0.1:<port>->80/tcp` on `nginx`) |
| `apps/web` holds zero DB/storage packages and zero `DATABASE_URL` / `NEXT_PUBLIC_*` secrets | Static + local runtime | `PASS` | `apps/web/package.json`, `eslint.config.mjs` (`no-restricted-imports`), `apps/web/src/app/page.spec.tsx`, `compose.yaml` (`web` receives only `NODE_ENV`, `PORT`, `HOSTNAME`, `INTERNAL_API_BASE_URL`) |
| Nginx overwrites `X-Forwarded-For` (`$remote_addr`), `X-Forwarded-Proto` (`$scheme`), and `X-Forwarded-Host` (`$http_host`), hides version tokens (`server_tokens off`), and sets `X-Content-Type-Options: nosniff` | Static + local runtime | `PASS` | `infra/nginx/default.conf`; `scripts/f01-containers.test.mjs` sent spoofed `X-Forwarded-For: 203.0.113.195`, `X-Forwarded-Proto: https`, `X-Forwarded-Host: spoofed.attacker.invalid` through live Nginx and verified upstream received overwritten values and `Server: nginx` without version |
| NestJS rejects wildcard `TRUST_PROXY=true` / `/0` CIDRs and disables `X-Powered-By` | Static + local runtime | `PASS` | `apps/api/src/config/env.validation.ts`, `apps/api/src/app.setup.ts`; `env.validation.spec.ts` & `health.controller.spec.ts` |
| NestJS `ValidationPipe` (`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`) rejects undeclared fields without echoing raw submitted values | Static + local runtime | `PASS` | `apps/api/src/app.setup.ts`, `apps/api/src/health/health.controller.spec.ts`, `apps/api/test/health-readiness.integration.spec.ts` |
| Swagger UI disabled when `NODE_ENV=production` | Static + local runtime | `PASS` | `apps/api/src/app.setup.ts`; `apps/api/src/openapi/openapi-contract.spec.ts` verified `404` on `/api/docs`, `/api/v1/docs`, `/api/docs-json` |
| `.dockerignore` and `.gitignore` exclude `.env*`, private keys, `.git`, and IDE state | Static inspection | `PASS` | `.dockerignore`, `.gitignore` |
| Production HTTPS/TLS termination, owner authentication, and CSRF guards | Not in `P1-01` scope | `NOT VERIFIED` | Planned in `P1-03` (auth/CSRF) and `P1-11` (`F03` VPS TLS/Vault) |

## Confirmed Defects

None identified within `P1-01` scope.

## Verification Gaps

- Cross-reference `VG-P101-01` (`11-build-release-supply-chain.md`): Automated CI secret/container/SAST scanning (`F02`) is scheduled for `P1-02`. Local `pnpm audit --prod` reported `0` production advisories; `VG-P101-03` documents the dev-only `picomatch` advisory.

## Accepted Limitations

None (no owner risk acceptance has been recorded yet; all open items remain `Pending owner sign-off`).

## Optional Improvements

None beyond planned `P1-02`/`P1-03`/`P1-11` slices.
