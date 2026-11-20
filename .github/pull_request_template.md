## Slice & Scope

- **Slice ID:** `P1-XX`
- **Gates / Acceptance Criteria / Milestone:** `F01` / `F02` / `AC0X` / `S1` / `S2`
- **Included scope:**
- **Explicit exclusions (deferred to later slices):**

## Verification Evidence

Record exact commands, environments (`static`, `local runtime`, `exact-commit CI`), and exit codes (`PASS` / `FAIL` / `NOT VERIFIED` with concrete reason):

- [ ] `pnpm verify:digests && pnpm verify:workflows`
- [ ] `pnpm format:check && pnpm lint && pnpm typecheck && pnpm openapi:check`
- [ ] `pnpm test && pnpm test:coverage && pnpm build`
- [ ] `pnpm test:integration` and current-slice Cucumber.js BDD scenarios
- [ ] `F01` container / Nginx / Playwright smoke checks (as applicable)
- [ ] Secret, static, dependency, container, and license gates (`runbook.md` exceptions updated if applicable)
- [ ] Separate slice review against `.github/docs/Audit.md` recorded under `.github/docs/audit/<run>/`

## Status Separation (`project_sheet.md` §6.6.2)

- **Implementation:**
- **Local verification:**
- **Exact-commit CI:**
- **Owner acceptance:** `Pending owner sign-off`
- **Production / real-data readiness:** `NOT READY` (`INSUFFICIENT EVIDENCE` until `F03`–`F04` and §8 Audit verdict)

## Risks, Rollback & Operational Notes

- **Schema / migration impact:**
- **Container / configuration changes:**
- **Rollback / recovery compatibility:**
