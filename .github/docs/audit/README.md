# QA Evidence Hub — Audit Index

Immutable slice and release audit runs generated under `.github/docs/Audit.md` and `project_sheet.md` §§6.6.2, 7.1, and 8. Never overwrite prior run directories.

## Audit Runs

| Run ID | Date (UTC) | Slice / Scope | Reviewed Baseline | Slice Conclusion | Production / Real-Data Verdict | Owner Disposition |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| [20261118T162641Z-2d67a0c](./20261118T162641Z-2d67a0c/README.md) | `2026-11-18` | `P1-01` — Repository and local container foundation (local `F01`) | `2d67a0c` (`feat/p1-01-local-foundation`) | Local `P1-01` checks `PASS` (`0` confirmed blockers; CI `F01`–`F02` `NOT VERIFIED` pending `P1-02`) | `INSUFFICIENT EVIDENCE` | `Pending owner sign-off` |
| [20261120T144000Z-1b5a236](./20261120T144000Z-1b5a236/README.md) | `2026-11-20` | `P1-02` — CI pipeline, repository controls, and `F01`/`F02` gate completion | `1b5a236` (`feat/p1-02-ci-f01-f02-gates`; PR `#3` `99c7bc4` -> `5639617`; `v0.2.0-rc.4` `9c9493e`) | `F01` `PASS` (local + CI); `F02` CI/PR-block/security/license/SBOM/digest-provenance `PASS`, private GHCR visibility `NOT VERIFIED` pending owner GitHub UI action (`VG-P102-01`) | `INSUFFICIENT EVIDENCE` | Merged in PR `#4` (`9611f74`) |
| [20261121T145200Z-c39b9c0](./20261121T145200Z-c39b9c0/README.md) | `2026-11-21` | `P1-02` closeout — `nginx:1.30-alpine-slim` `CVE-2026-86144` remediation & private GHCR release verification | `c39b9c0` (`v0.2.0-rc.5`, `Release` run `44915546496`) | Both `F01` and `F02` `PASS` (`VG-P102-01` `resolved`; private GHCR `HTTP 401` + SPDX SBOM provenance verified) | `INSUFFICIENT EVIDENCE` | `Pending owner sign-off` |
