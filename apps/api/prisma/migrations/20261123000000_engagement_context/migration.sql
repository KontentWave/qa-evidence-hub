-- P1-04: Engagement context hierarchy (clients -> projects -> test_sessions) with
-- trimmed nonblank checks, active project default, UNIQUE(project_id, id) for downstream
-- same-project composite foreign keys, and session time-range enforcement.

CREATE TYPE "project_status" AS ENUM ('Active', 'Archived');

CREATE TABLE "clients" (
  "id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "clients_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clients_name_trimmed_nonempty_check" CHECK (
    btrim("name") <> ''
    AND "name" = btrim("name")
    AND "name" !~ '^\s|\s$'
    AND char_length("name") <= 200
  ),
  CONSTRAINT "clients_notes_trimmed_length_check" CHECK (
    "notes" IS NULL
    OR (
      btrim("notes") <> ''
      AND "notes" !~ '^\s|\s$'
      AND char_length("notes") <= 20000
    )
  )
);

CREATE INDEX "clients_created_at_id_idx" ON "clients" ("created_at" DESC, "id" DESC);

CREATE TABLE "projects" (
  "id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "status" "project_status" NOT NULL DEFAULT 'Active',
  "description" TEXT,
  "testing_context" TEXT,
  "instructions" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "projects_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id")
    REFERENCES "clients" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "projects_name_trimmed_nonempty_check" CHECK (
    btrim("name") <> ''
    AND "name" = btrim("name")
    AND "name" !~ '^\s|\s$'
    AND char_length("name") <= 200
  ),
  CONSTRAINT "projects_description_trimmed_length_check" CHECK (
    "description" IS NULL
    OR (
      btrim("description") <> ''
      AND "description" !~ '^\s|\s$'
      AND char_length("description") <= 20000
    )
  ),
  CONSTRAINT "projects_testing_context_trimmed_length_check" CHECK (
    "testing_context" IS NULL
    OR (
      btrim("testing_context") <> ''
      AND "testing_context" !~ '^\s|\s$'
      AND char_length("testing_context") <= 20000
    )
  ),
  CONSTRAINT "projects_instructions_trimmed_length_check" CHECK (
    "instructions" IS NULL
    OR (
      btrim("instructions") <> ''
      AND "instructions" !~ '^\s|\s$'
      AND char_length("instructions") <= 20000
    )
  )
);

CREATE INDEX "projects_client_id_created_at_id_idx"
  ON "projects" ("client_id", "created_at" DESC, "id" DESC);

CREATE TABLE "test_sessions" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "purpose" VARCHAR(200) NOT NULL,
  "started_at" TIMESTAMPTZ(6) NOT NULL,
  "ended_at" TIMESTAMPTZ(6),
  "environment" VARCHAR(200),
  "device" VARCHAR(200),
  "os" VARCHAR(200),
  "browser" VARCHAR(200),
  "build_version" VARCHAR(200),
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "test_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "test_sessions_project_id_id_key" UNIQUE ("project_id", "id"),
  CONSTRAINT "test_sessions_project_id_fkey" FOREIGN KEY ("project_id")
    REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "test_sessions_purpose_trimmed_nonempty_check" CHECK (
    btrim("purpose") <> ''
    AND "purpose" = btrim("purpose")
    AND "purpose" !~ '^\s|\s$'
    AND char_length("purpose") <= 200
  ),
  CONSTRAINT "test_sessions_ended_at_not_before_started_at_check" CHECK (
    "ended_at" IS NULL OR "ended_at" >= "started_at"
  ),
  CONSTRAINT "test_sessions_environment_trimmed_length_check" CHECK (
    "environment" IS NULL
    OR (
      btrim("environment") <> ''
      AND "environment" !~ '^\s|\s$'
      AND char_length("environment") <= 200
    )
  ),
  CONSTRAINT "test_sessions_device_trimmed_length_check" CHECK (
    "device" IS NULL
    OR (
      btrim("device") <> ''
      AND "device" !~ '^\s|\s$'
      AND char_length("device") <= 200
    )
  ),
  CONSTRAINT "test_sessions_os_trimmed_length_check" CHECK (
    "os" IS NULL
    OR (
      btrim("os") <> ''
      AND "os" !~ '^\s|\s$'
      AND char_length("os") <= 200
    )
  ),
  CONSTRAINT "test_sessions_browser_trimmed_length_check" CHECK (
    "browser" IS NULL
    OR (
      btrim("browser") <> ''
      AND "browser" !~ '^\s|\s$'
      AND char_length("browser") <= 200
    )
  ),
  CONSTRAINT "test_sessions_build_version_trimmed_length_check" CHECK (
    "build_version" IS NULL
    OR (
      btrim("build_version") <> ''
      AND "build_version" !~ '^\s|\s$'
      AND char_length("build_version") <= 200
    )
  ),
  CONSTRAINT "test_sessions_notes_trimmed_length_check" CHECK (
    "notes" IS NULL
    OR (
      btrim("notes") <> ''
      AND "notes" !~ '^\s|\s$'
      AND char_length("notes") <= 20000
    )
  )
);

CREATE INDEX "test_sessions_project_id_started_at_idx"
  ON "test_sessions" ("project_id", "started_at" DESC, "created_at" DESC, "id" DESC);
