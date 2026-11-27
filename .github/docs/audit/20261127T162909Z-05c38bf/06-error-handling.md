# 06 — Error Handling and Exceptions (`P1-04` Session Review Hardening)

- **Run ID:** `20261127T162909Z-05c38bf`
- **Reviewed baseline:** `05c38bfb94b4b39ace12385de25d52d17605dc83`

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Sub-millisecond reversed `endedAt < startedAt` (`2026-11-27T10:00:00.123100Z < 2026-11-27T10:00:00.123900Z`) returns `400 BAD_REQUEST` with `fieldErrors: [{ field: 'endedAt' }]` and zero internal/SQL leakage | Unit + PG 19 integration | `PASS` | `apps/api/src/sessions/sessions.service.ts`, `apps/api/test/engagement-context.integration.spec.ts` |
| Malformed `cursor`, out-of-bounds `limit` (`0`, `201`, non-integer), and undeclared query fields return `400 BAD_REQUEST` with `fieldErrors`; blank, repeated, or tampered `?cursor=...` on `ProjectDetailPage` triggers Next.js `notFound()` (`404`) | Unit + RTL + PG 19 integration | `PASS` | `apps/api/src/sessions/sessions.spec.ts`, `apps/web/src/app/engagement.spec.tsx`, `apps/api/test/engagement-context.integration.spec.ts` |

## Findings

None.
