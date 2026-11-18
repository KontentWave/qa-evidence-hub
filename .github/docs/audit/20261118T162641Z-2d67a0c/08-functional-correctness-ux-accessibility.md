# 08 — Functional Correctness, Usability, and Accessibility (`P1-01`)

- **Run ID:** `20261118T162641Z-2d67a0c`
- **Reviewed baseline:** commit `2d67a0c2f654d4d1f6dcb4758f7022e85ebca5c8` (`feat/p1-01-local-foundation`)
- **Scope and evidence limits:** Covers `P1-01` HTTP/HTML/OpenAPI contracts, semantic landmarks, WCAG AA contrast, keyboard focus CSS, text-explicit readiness states, and `@media print` rules. Automated DOM tests and Playwright inspection in VS Code's integrated browser were executed; physical desktop keyboard/print-preview confirmation by the owner is recorded under `VG-P101-02`.

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| `GET /api/v1/health` (`200 { status: "ok" }`) and `GET /api/v1/health/ready` (`200 { status: "ready" }` / `503 { status: "not_ready" }`) match OpenAPI contract and headers | Unit + integration + container runtime | `PASS` | `health.controller.spec.ts`, `openapi-contract.spec.ts`, `health-readiness.integration.spec.ts`, `scripts/f01-containers.test.mjs` |
| `GET /` serves dynamic HTML (`Cache-Control: private, no-store, no-transform`) with `<html lang="en">`, descriptive `<title>`, skip link, `<main>` landmark, single `<h1>`, and `role="status"` readiness region | Unit + container + Playwright browser | `PASS` | `apps/web/src/app/page.spec.tsx`, `scripts/f01-containers.test.mjs`, integrated browser accessibility snapshot on `http://localhost:18080/` |
| Text-explicit readiness state (never color-only) and WCAG AA+ foreground/background contrast in both `Ready` (`#064e3b` on `#ecfdf5`, >9:1) and `Not ready (degraded)` (`#7f1d1d` on `#fef2f2`, >9:1) states | Static CSS + Playwright browser | `PASS` | `apps/web/app/globals.css`; verified live in browser with `postgres` running and stopped |
| Visible `:focus-visible` ring (`3px solid #1d4ed8`, `outline-offset: 3px`), `.skip-link` reveal on focus (`top: 16px`), zero console/network errors, and `@media print` hiding `.no-print`/`.skip-link` with `break-inside: avoid` | Playwright browser inspection | `PASS` | Verified on `http://localhost:18080/` via `openBrowserPage` and `runPlaywrightCode` |
| Physical desktop browser `Tab` traversal and native OS print preview (`Ctrl+P`) visual confirmation by owner | Manual QA | `NOT VERIFIED` | Tracked as `VG-P101-02` |

## Confirmed Defects

None identified.

## Verification Gaps

### `VG-P101-02` — Owner manual desktop browser keyboard `Tab` and `Ctrl+P` print-preview confirmation

- **Category:** Functional correctness, usability, and accessibility (`08`)
- **Type & State:** Verification gap · `new` · Disposition: `Pending owner sign-off`
- **Severity & Confidence:** Low · High confidence (automated Playwright snapshot, computed `:focus-visible` stylesheet rules, contrast values, degraded `503` state, and `@media print` computed styles all passed)
- **Baseline / Evidence:** `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`, `apps/web/app/globals.css`
- **Expected vs Observed:** Automated checks do not substitute for final human visual/assistive confirmation (§7.1, Audit §4.08).
- **Smallest Verification Action:** Boot the stack locally (`compose.yaml` with built image IDs or `compose.dev.yaml`), open `http://localhost:8080/`, press `Tab` through `Skip to main content` → `System readiness` → `Foundation scope`, and open `Ctrl+P` print preview to confirm visual focus outline and print pagination. Does not block `P1-01` implementation completion; closes upon owner review.
