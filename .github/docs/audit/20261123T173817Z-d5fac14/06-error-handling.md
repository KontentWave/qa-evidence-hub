# 06 — Error Handling and Exceptions (`P1-04`)

- **Run ID:** `20261123T173817Z-d5fac14`
- **Reviewed baseline:** `d5fac14699321a165cd6d235dd77b20ceb9bac73`

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Distinct, non-leaking HTTP error codes: `400` `BAD_REQUEST` with `fieldErrors`, `401` `UNAUTHORIZED`, `403` `FORBIDDEN`, `404` `NOT_FOUND` (missing or mismatched parent), and `409` `CONFLICT` (archived parent project) | Static + PG integration | `PASS` | `apps/api/src/common/http-exception.filter.ts`, `apps/api/test/engagement-context.integration.spec.ts` |
| Web forms distinguish validation errors (linked error summary), expired session (`401` -> `/login`), CSRF refresh (`403`), missing parent (`404`), archived project (`409`), and network failure without exposing internal hosts or DSNs | Static + RTL + Playwright | `PASS` | `apps/web/src/components/create-{client,project,session}-form.tsx`, `apps/web/src/app/engagement.spec.tsx`, `e2e/engagement-context.spec.ts` |
| Graceful degraded SSR banners when internal API is unreachable and `404` (`notFound()`) on malformed UUIDs or missing/mismatched parents | Static + RTL | `PASS` | `apps/web/src/lib/api.ts`, `apps/web/app/clients/**`, `apps/web/src/app/engagement.spec.tsx` |

## Findings

None.
