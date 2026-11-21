# 12 — Test Assurance and Validation Quality (`P1-02` Astra `F02` Review Hardening)

- **Run ID:** `20261121T165800Z-1d61192`
- **Reviewed baseline:** `1d611921d018e8b944f8c2c95aca97c3f16ae9b7` (`fix/p1-02-astra-f02-hardening`)

## New Regression & Negative-Fixture Tests Added

| Test File | Cases | Verified Behavior |
| :---- | :---- | :---- |
| `scripts/verify-ghcr-privacy.test.mjs` | `4` | Rejects `200` (public), `404` (missing/wrong media type), `503` (outage), and non-OCI HTML `401` bodies in both `pre-push` and `post-push` (including when an anonymous token is issued before manifest `404`/`503`); verifies `alias-tag` preserves exact manifest bytes and digest |
| `scripts/container-scan-exceptions.test.mjs` | `1` (5 sub-cases) | Verifies reviewed `postgres` `gosu` + `snakeoil` entries pass while rejecting `imageRole` mismatch (`api`), unlisted `gosu` CVE IDs, other binaries inside `postgres`, non-snakeoil secret paths (without echoing secret `Match`), and expired review windows |
| `scripts/security-gates-blocking.test.mjs` (test 4b) | `1` (extended) | Builds a scratch OCI image containing a dynamically generated synthetic credential, saves to tarball, and verifies `security-scan.mjs scan-image-tar` blocks (`exit != 0`) without leaking the credential value |

Total `pnpm test` count increased from `62` to **`67` passing tests** (`13` API + `4` Web + `50` Node tests), plus `5/5` end-to-end negative blocking suites in `pnpm test:gates:blocking`.
