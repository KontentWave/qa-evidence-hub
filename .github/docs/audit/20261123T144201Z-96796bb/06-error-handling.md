# 06 — Error Handling and Exceptions (`P1-03` Compose Auth Overrides)

- **Run ID:** `20261123T144201Z-96796bb`
- **Reviewed baseline:** `96796bbde1758c03939564f9662837ae95cf6005`

## Checks Executed

| Check | Evidence Type | Result | Evidence |
| :---- | :---- | :---- | :---- |
| `AUTH_PASSWORD_SCRYPT_LN=17` supplied via `docker compose --env-file` causes the normal production API startup command (`CMD ["node", "dist/main.js"]`) to exit non-zero within a bounded `15s` wait, naming `AUTH_PASSWORD_SCRYPT_LN` and its allowed `14`–`16` range | Local Docker Compose runtime | `PASS` | `scripts/f01-containers.test.mjs` (Step 7c) |
| Exceeding `AUTH_LOGIN_MAX_ATTEMPTS=2` through Nginx returns `429` with a positive numeric `Retry-After` header after two `401` invalid-credential responses | Local Docker + Nginx runtime | `PASS` | `scripts/f01-containers.test.mjs` (Step 7c) |

## Findings

None.
