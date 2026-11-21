# 08 — Functional Correctness, Usability, and Accessibility (`P1-03`)

- **Run ID:** `20261121T205500Z-14d8864`
- **Reviewed baseline:** `14d886482670619d89a666d97c1c34e80bbe7a7d`

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| Anonymous `/` redirects (`307` -> `/login`) without rendering `Ready` or private workspace content | RTL + container HTTP/HTTPS + Playwright Chromium | `PASS` | `apps/web/src/app/page.spec.tsx`, `scripts/f01-containers.test.mjs`, `e2e/foundation-smoke.spec.ts` |
| Already-signed-in owner visiting `/login` redirects to `/` | RTL unit test | `PASS` | `apps/web/src/app/login.spec.tsx` |
| Explicit `<label htmlFor>` bindings (`Login identifier`, `Password`), `<main id="main-content">`, single `<h1>`, skip-link, and WCAG AA+ contrast | Static + RTL + Playwright Chromium | `PASS` | `apps/web/app/login/page.tsx`, `apps/web/src/components/login-form.tsx`, `apps/web/app/globals.css`, `e2e/foundation-smoke.spec.ts` |
| Keyboard `Tab` -> `Enter` submission, visible `:focus`/`:focus-visible` outline, automatic focus transfer to `#login-error-summary` (`role="alert"`), and preservation of non-sensitive `loginIdentifier` on error | RTL + Playwright Chromium | `PASS` | `apps/web/src/app/login.spec.tsx`, `e2e/foundation-smoke.spec.ts` (`await expect(errorSummary).toBeFocused()`) |
| Signed-in owner sees `QA Evidence Hub`, owner `loginIdentifier`, `timezone` (`Europe/Bratislava`), and `System status: Ready`, and `Sign out` restores anonymous denial | RTL + container HTTP/HTTPS + Playwright Chromium | `PASS` | `apps/web/app/page.tsx`, `scripts/f01-containers.test.mjs`, `e2e/foundation-smoke.spec.ts` |
| `@media print` hides `.no-print` navigation and sign-out controls cleanly | Static CSS inspection | `PASS` | `apps/web/app/globals.css` |
| Physical owner desktop `Tab` & `Ctrl+P` print-preview confirmation | Owner desktop browser | `NOT VERIFIED` | `VG-P101-02` (`Pending owner sign-off`) |

## Findings

- Carries forward `VG-P101-02` (`Pending owner sign-off` for physical owner desktop `Tab`/`Ctrl+P` confirmation). No `P1-03` UX or accessibility defects identified.
