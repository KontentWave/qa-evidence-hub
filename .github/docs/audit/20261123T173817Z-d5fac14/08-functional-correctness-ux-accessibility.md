# 08 — Functional Correctness, Usability, and Accessibility (`P1-04`)

- **Run ID:** `20261123T173817Z-d5fac14`
- **Reviewed baseline:** `d5fac14699321a165cd6d235dd77b20ceb9bac73`

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Signed-in owner creates client, creates active project for that client, creates test session, sees it listed under the project, and reopens it with all saved details after page reload | Cucumber BDD + Nginx Playwright | `PASS` | `specs/features/engagement-context.feature` (`@S1`), `apps/api/bdd/engagement-context.steps.ts`, `e2e/engagement-context.spec.ts` |
| Invalid session time range (`endedAt < startedAt`) saves zero rows, moves keyboard focus to `#session-error-summary` (`role="alert"`), links `<a href="#session-ended-at">` (`aria-invalid="true"`), and preserves all non-sensitive entered fields | RTL + Cucumber BDD + Nginx Playwright | `PASS` | `apps/web/src/components/create-session-form.tsx`, `apps/web/src/app/engagement.spec.tsx`, `apps/api/bdd/engagement-context.steps.ts`, `e2e/engagement-context.spec.ts` |
| Session timestamps stored in UTC (`TIMESTAMPTZ`) and formatted deterministically in the owner's configured timezone (`Europe/Bratislava`, e.g. `2026-10-06T09:00:00Z` -> `2026-10-06 11:00 (Europe/Bratislava)` inside semantic `<time dateTime="...">`), rejecting calendar rollovers (`2026-02-31`) and nonexistent spring-forward DST gap times (`2026-03-29T02:30`) | Unit + Cucumber BDD + Nginx Playwright | `PASS` | `apps/api/src/common/validation.util.spec.ts`, `apps/web/src/lib/timezone.spec.ts`, `apps/api/bdd/engagement-context.steps.ts`, `e2e/engagement-context.spec.ts` |
| Semantic `<main id="main-content">`, single `<h1>` per page, `<nav aria-label="Breadcrumb">` (`aria-current="page"`), explicit `<label htmlFor>` on every form control, text status (`Status: Active`) alongside visual pill, and `.no-print` styling | Static + RTL + Playwright | `PASS` | `apps/web/app/**`, `apps/web/src/app/engagement.spec.tsx`, `e2e/engagement-context.spec.ts` |
| Physical owner desktop browser `Tab` & `Ctrl+P` print-preview confirmation | Manual owner check | `NOT VERIFIED` | Tracked in `VG-P101-02` (`Pending owner sign-off`) |

## Findings

None beyond `VG-P101-02`.
