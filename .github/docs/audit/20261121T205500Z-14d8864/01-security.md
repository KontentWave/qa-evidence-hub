# 01 — Security (`P1-03`)

- **Run ID:** `20261121T205500Z-14d8864`
- **Reviewed baseline:** commit `14d886482670619d89a666d97c1c34e80bbe7a7d` (`feat/p1-03-single-owner-auth` branched from `origin/main` `fbdaa55`, `git status --short` showing only preserved untracked `?? .github/skills/`)
- **Scope and evidence limits:** Covers `P1-03` (`AC07` single-owner authentication, PostgreSQL session boundary, pre-login & post-login anti-CSRF, pre-multipart enforcement, explicit Nginx proxy trust, read-only SSR cookie forwarding, and operator CLI provisioning/reset) alongside retained `F01`/`F02` controls. Domain authorization on projects/evidence/findings (`P1-04`–`P1-10`) and live VPS TLS/firewall/Vault (`P1-11` / `F03`) remain deferred to their owning slices.

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Single-owner singleton enforced in PostgreSQL even under concurrent provisioning | Static + local & CI PG runtime | `PASS` | `apps/api/prisma/migrations/20261121000000_owner_and_auth_sessions/migration.sql` (`singleton_key = true` + `owners_singleton_key_key` unique index); `apps/api/test/auth-api.integration.spec.ts` fired 3 concurrent `provision-owner.ts` processes (`1` succeeded, `2` rejected) |
| Operator-only provisioning & password reset (`scripts/provision-owner.ts`), salted adaptive `scrypt` (`$scrypt$ln=16,r=8,p=1$`), hidden TTY / `--password-stdin` only, `--password` CLI flag rejected, reset revokes active sessions | Static + local & CI runtime | `PASS` | `scripts/provision-owner.ts`, `scripts/provision-owner.test.mjs`, `apps/api/test/auth-api.integration.spec.ts` |
| Zero public self-registration endpoints or UI links | Static + Cucumber BDD | `PASS` | `specs/features/private-access.feature` (`Do not provide public self-registration`), `apps/api/bdd/private-access.steps.ts`, `apps/web/src/app/login.spec.tsx` |
| NestJS default-deny `APP_GUARD` (`AuthAndCsrfGuard`) returns `401` on anonymous protected routes while allowing only `/api/v1/health*`, `/api/v1/auth/csrf`, and `/api/v1/auth/login` | Static + local & CI runtime | `PASS` | `apps/api/src/auth/auth.guard.ts`, `apps/api/test/auth-api.integration.spec.ts`, `scripts/f01-containers.test.mjs` |
| Generic `401` login failures + timing-equalized dummy `scrypt` verification when login identifier is unknown | Static + local & CI runtime | `PASS` | `apps/api/src/auth/password-hasher.service.ts` (`verifyOrEqualize`), `apps/api/src/auth/auth.service.ts`, `apps/api/test/auth-api.integration.spec.ts`, `specs/features/private-access.feature` |
| Bounded per-IP login throttling (`429` + `Retry-After`, bounded `maxKeys = 4096`) and bounded `scrypt` concurrency/queue (`4` active + `16` queued) | Static + local & CI runtime | `PASS` | `apps/api/src/auth/login-throttler.service.ts`, `apps/api/src/auth/password-hasher.service.ts`, `apps/api/src/auth/auth.spec.ts`, `apps/api/test/auth-api.integration.spec.ts` |
| Opaque 256-bit CSPRNG session tokens stored only as SHA-256 `token_digest` in `auth_sessions`; host-only `HttpOnly; Secure; SameSite=Lax; Path=/` cookies (no `Domain`); logout revokes DB session and clears cookie (`Max-Age=0`) | Static + local & CI runtime | `PASS` | `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/csrf.service.ts`, `apps/api/test/auth-api.integration.spec.ts`, `scripts/f01-containers.test.mjs` |
| Browser-bound pre-login CSRF (`qaeh_csrf_prelogin` HMAC) + fresh session-bound post-login CSRF (`qaeh-auth-csrf-v1` HMAC) + exact `Origin` check enforced before multipart parsing | Static + local & CI runtime | `PASS` | `apps/api/src/auth/auth.guard.ts`, `apps/api/test/auth-api.integration.spec.ts` (verified Multer `_handleFile` and controller handler stay at `0` calls on `401`/`403`) |
| Explicit Nginx ingress `TRUST_PROXY` (`false`, `loopback`, explicit IP/CIDR, or `nginx` single-hop `hopIndex === 0`); untrusted `X-Forwarded-For` / `X-Forwarded-Proto` ignored | Static + local & CI runtime | `PASS` | `apps/api/src/config/env.validation.ts`, `apps/api/src/config/trusted-proxy.ts`, `apps/api/test/auth-api.integration.spec.ts`, `scripts/f01-containers.test.mjs` |
| `Secure` cookie issuance and HTTP-downgrade (`403`) rejection verified through Nginx with test-only HTTPS (`TLSv1.2`/`TLSv1.3`, verified CA) | Local & CI container runtime | `PASS` | `scripts/f01-containers.test.mjs` (Step 7b) |
| Next.js SSR forwards only `qaeh_session` cookie to fixed `INTERNAL_API_BASE_URL` with read-only `private, no-store, no-transform` semantics and zero `Set-Cookie` | Static + local & CI runtime | `PASS` | `apps/web/src/lib/api.ts`, `apps/web/src/app/page.spec.tsx`, `apps/api/test/auth-api.integration.spec.ts` (`xmin` unchanged), `scripts/f01-containers.test.mjs`, `e2e/foundation-smoke.spec.ts` |
| Secret, AST/IaC static, dependency, and 4-image Trivy container scans | Local & CI runtime | `PASS` | `pnpm verify:security:secrets`, `pnpm verify:security:static`, `pnpm verify:security:deps`, `pnpm verify:security:containers` (`0` leaks, `0` unreviewed HIGH/CRITICAL) |
| Live production VPS HTTPS/TLS certificate, firewall, and Ansible Vault secret mounts | Deferred to `P1-11` (`F03`) | `NOT VERIFIED` | Tracked in `VG-P103-01` (live VPS & domain do not exist yet) |

## Confirmed Defects

None open. During the separate diff review prior to commit, two defense-in-depth hardenings (`PasswordHasherService` wait-queue cap `MAX_HASH_WAIT_QUEUE = 16` and `AuthService` active-session ceiling `MAX_ACTIVE_SESSIONS_PER_OWNER = 20`) were identified, applied, unit-tested, and reverified in `14d8864`.

## Verification Gaps

- `VG-P103-01`: Live VPS HTTPS/TLS termination, HTTP→HTTPS redirect, and Compose secret-file mounts remain `NOT VERIFIED` until `P1-11` (`F03`); `Secure`-cookie issuance and HTTP-downgrade rejection behind Nginx TLS were verified in isolated Docker using an ephemeral X.509 certificate in `scripts/f01-containers.test.mjs`.
- `VG-P103-02`: Deferred `AC07` scenarios requiring domain pages/files (`project page` in `P1-04`, private `evidence` download in `P1-05`, `finding` page & finding CSRF mutation in `P1-06`, `project report` in `P1-07`) remain `NOT VERIFIED` until their owning slices exist.

## Accepted Limitations

None beyond documented Phase 1 scope.

## Optional Improvements

None beyond `OPT-P101-01` (carried forward from `P1-01`).
