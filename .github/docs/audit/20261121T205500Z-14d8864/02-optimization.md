# 02 — Optimization and Resource Efficiency (`P1-03`)

- **Run ID:** `20261121T205500Z-14d8864`
- **Reviewed baseline:** `14d886482670619d89a666d97c1c34e80bbe7a7d`

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Zero new runtime or dev npm dependencies added for auth/hashing/CSRF/proxy | Static + lockfile inspection | `PASS` | `package.json`, `apps/api/package.json`, `apps/web/package.json`, `pnpm-lock.yaml` (`0` diff on lockfile; uses Node 24 built-in `crypto.scrypt`, `crypto.createHmac`, `net.BlockList`) |
| Bounded memory for per-IP login throttling (`maxKeys = 4096`, expired-entry sweep + LRU oldest eviction) | Static + unit runtime | `PASS` | `apps/api/src/auth/login-throttler.service.ts`, `apps/api/src/auth/auth.spec.ts` |
| Bounded OpenSSL `scrypt` memory and queue (`N = 65,536`, `r = 8`, `p = 1` = `64 MiB`/op, max `4` concurrent + `16` queued; throttled IPs rejected before `scrypt` or DB query) | Static + unit runtime | `PASS` | `apps/api/src/auth/password-hasher.service.ts`, `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.spec.ts` |
| Bounded `auth_sessions` growth via opportunistic 24h expired-row purge + `20` active sessions/owner cap + indexed `token_digest`, `(owner_id, revoked_at)`, and `expires_at` | Static + unit/PG runtime | `PASS` | `apps/api/prisma/migrations/20261121000000_owner_and_auth_sessions/migration.sql`, `apps/api/src/auth/auth.service.ts` |
| Read-only SSR session lookup (`findUnique` by unique `token_digest`, zero write locks or tuple churn) | Local & CI PG runtime | `PASS` | `apps/api/test/auth-api.integration.spec.ts` verified unchanged PostgreSQL `xmin` across repeated `GET /api/v1/auth/session` calls |
| Observed production container sizes and post-auth idle RSS (`f01-containers.test.mjs`) | Local Docker runtime | `PASS` | `api` `684.3 MiB` (`118.1 MiB` RSS after `scrypt` login), `web` `260.4 MiB` (`68.4 MiB` RSS), `postgres` `54.5 MiB` RSS, `nginx` `7.2 MiB` RSS |
| Full-stack VPS memory/CPU/latency measurement under 500-finding / 2,000-evidence & 25 MP decode load | Deferred to `P1-10` / `P1-12` | `NOT VERIFIED` | Domain tables and VPS host not yet provisioned |

## Findings

- Carries forward optional `OPT-P101-01` (`pnpm deploy` image-size trim on `api` before `P1-11`). No `P1-03` resource defects identified.
