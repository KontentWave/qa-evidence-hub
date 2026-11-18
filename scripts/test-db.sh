#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/compose.test.yaml"

TEST_DB_NAME="${TEST_POSTGRES_DB:-qaeh_test}"
TEST_DB_USER="${TEST_POSTGRES_USER:-qaeh_test}"
TEST_DB_PASSWORD="${TEST_POSTGRES_PASSWORD:-qaeh_test_ephemeral}"

resolve_project_name() {
  if [[ -n "${COMPOSE_PROJECT_NAME:-}" ]]; then
    if [[ ! "${COMPOSE_PROJECT_NAME}" =~ ^qaeh_test_[a-z0-9][a-z0-9_-]*$ ]]; then
      echo "Refusing unsafe COMPOSE_PROJECT_NAME='${COMPOSE_PROJECT_NAME}': must match ^qaeh_test_[a-z0-9][a-z0-9_-]*$" >&2
      exit 1
    fi
  fi

  if [[ -n "${TEST_RUN_ID:-}" ]]; then
    local normalized_id
    normalized_id="$(printf '%s' "${TEST_RUN_ID}" | tr '[:upper:]' '[:lower:]')"
    if [[ ! "${normalized_id}" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
      echo "Refusing invalid TEST_RUN_ID='${TEST_RUN_ID}': must match ^[a-zA-Z0-9][a-zA-Z0-9_-]*$" >&2
      exit 1
    fi
    printf 'qaeh_test_%s' "${normalized_id}"
    return
  fi

  if [[ -n "${COMPOSE_PROJECT_NAME:-}" ]]; then
    printf '%s' "${COMPOSE_PROJECT_NAME}"
    return
  fi

  printf 'qaeh_test_local'
}

compose_cmd() {
  local project="$1"
  shift
  COMPOSE_PROJECT_NAME="${project}" docker compose -p "${project}" -f "${COMPOSE_FILE}" "$@"
}

discover_database_url() {
  local project="$1"
  local port_mapping
  port_mapping="$(compose_cmd "${project}" port postgres_test 5432)"
  local host_port="${port_mapping##*:}"
  if [[ ! "${host_port}" =~ ^[0-9]+$ ]]; then
    echo "Failed to resolve published port for ${project} (got '${port_mapping}')" >&2
    exit 1
  fi
  printf 'postgresql://%s:%s@127.0.0.1:%s/%s?schema=public' \
    "${TEST_DB_USER}" "${TEST_DB_PASSWORD}" "${host_port}" "${TEST_DB_NAME}"
}

teardown_project() {
  local project="$1"
  if [[ ! "${project}" =~ ^qaeh_test_[a-z0-9][a-z0-9_-]*$ ]]; then
    echo "Refusing teardown for non-test project '${project}'" >&2
    exit 1
  fi
  compose_cmd "${project}" down -v --remove-orphans >/dev/null 2>&1 || true
}

wait_for_sql_ready() {
  local project="$1"
  local attempt
  for attempt in $(seq 1 30); do
    if compose_cmd "${project}" exec -T \
      -e PGPASSWORD="${TEST_DB_PASSWORD}" \
      postgres_test \
      psql -h 127.0.0.1 -U "${TEST_DB_USER}" -d "${TEST_DB_NAME}" -c "SELECT 1" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.2
  done
  echo "PostgreSQL TCP SQL check timed out for ${project}" >&2
  exit 1
}

start_project() {
  local project="$1"
  local startup_ok=0
  trap 'if [[ "${startup_ok}" -eq 0 ]]; then teardown_project "'"${project}"'"; fi' EXIT INT TERM

  compose_cmd "${project}" up -d --wait >/dev/null
  wait_for_sql_ready "${project}"
  local db_url
  db_url="$(discover_database_url "${project}")"
  startup_ok=1
  trap - EXIT INT TERM
  printf '%s\n' "${db_url}"
}

reset_project() {
  local project="$1"
  local db_url
  db_url="$(discover_database_url "${project}")"

  compose_cmd "${project}" exec -T postgres_test \
    psql -v ON_ERROR_STOP=1 -U "${TEST_DB_USER}" -d "${TEST_DB_NAME}" \
    -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO \"${TEST_DB_USER}\"; GRANT ALL ON SCHEMA public TO public;" \
    >/dev/null

  (
    cd "${REPO_ROOT}"
    DATABASE_URL="${db_url}" pnpm --filter @qa-evidence-hub/api prisma:migrate:deploy >/dev/null
  )

  printf '%s\n' "${db_url}"
}

ACTION="${1:-}"
if [[ -z "${ACTION}" ]]; then
  echo "Usage: scripts/test-db.sh <up|reset|down|run [cmd...]>" >&2
  exit 1
fi
shift

case "${ACTION}" in
  up)
    PROJECT="$(resolve_project_name)"
    start_project "${PROJECT}"
    ;;
  reset)
    PROJECT="$(resolve_project_name)"
    reset_project "${PROJECT}"
    ;;
  down)
    PROJECT="$(resolve_project_name)"
    compose_cmd "${PROJECT}" down -v --remove-orphans >/dev/null
    ;;
  run)
    if [[ $# -eq 0 ]]; then
      echo "Usage: scripts/test-db.sh run <command> [args...]" >&2
      exit 1
    fi
    if [[ -z "${COMPOSE_PROJECT_NAME:-}" && -z "${TEST_RUN_ID:-}" ]]; then
      TEST_RUN_ID="run_$(date +%s)_$$"
      export TEST_RUN_ID
    fi
    PROJECT="$(resolve_project_name)"
    trap 'teardown_project "${PROJECT}"' EXIT INT TERM

    compose_cmd "${PROJECT}" up -d --wait >/dev/null
    wait_for_sql_ready "${PROJECT}"
    DB_URL="$(discover_database_url "${PROJECT}")"
    export COMPOSE_PROJECT_NAME="${PROJECT}"
    export DATABASE_URL="${DB_URL}"

    "$@"
    ;;
  *)
    echo "Unknown subcommand '${ACTION}'. Expected one of: up, reset, down, run" >&2
    exit 1
    ;;
esac
