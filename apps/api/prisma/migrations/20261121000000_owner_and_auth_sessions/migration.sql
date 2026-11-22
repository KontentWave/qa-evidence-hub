-- P1-03: Single-owner account (database-enforced singleton) and opaque digest-backed auth sessions.

CREATE TABLE "owners" (
  "id" UUID NOT NULL,
  "singleton_key" BOOLEAN NOT NULL DEFAULT true,
  "login_identifier" VARCHAR(200) NOT NULL,
  "password_hash" TEXT NOT NULL,
  "timezone" VARCHAR(100) NOT NULL DEFAULT 'Europe/Bratislava',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "owners_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "owners_singleton_key_true_check" CHECK ("singleton_key" = true),
  CONSTRAINT "owners_login_identifier_nonempty_check" CHECK (
    btrim("login_identifier") <> ''
    AND "login_identifier" = btrim("login_identifier")
    AND char_length("login_identifier") <= 200
  ),
  CONSTRAINT "owners_password_hash_nonempty_check" CHECK (btrim("password_hash") <> ''),
  CONSTRAINT "owners_timezone_nonempty_check" CHECK (
    btrim("timezone") <> ''
    AND "timezone" = btrim("timezone")
    AND char_length("timezone") <= 100
  )
);

CREATE UNIQUE INDEX "owners_singleton_key_key" ON "owners" ("singleton_key");
CREATE UNIQUE INDEX "owners_login_identifier_key" ON "owners" ("login_identifier");
CREATE UNIQUE INDEX "owners_login_identifier_lower_key" ON "owners" (LOWER("login_identifier"));

CREATE TABLE "auth_sessions" (
  "id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "token_digest" VARCHAR(64) NOT NULL,
  "csrf_salt" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "revoke_reason" VARCHAR(64),

  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_sessions_owner_id_fkey" FOREIGN KEY ("owner_id")
    REFERENCES "owners" ("id") ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT "auth_sessions_token_digest_hex_check" CHECK ("token_digest" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "auth_sessions_csrf_salt_hex_check" CHECK ("csrf_salt" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "auth_sessions_expires_after_created_check" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "auth_sessions_revocation_consistency_check" CHECK (
    ("revoked_at" IS NULL AND "revoke_reason" IS NULL)
    OR ("revoked_at" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "auth_sessions_token_digest_key" ON "auth_sessions" ("token_digest");
CREATE INDEX "auth_sessions_owner_active_idx" ON "auth_sessions" ("owner_id", "revoked_at");
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions" ("expires_at");
