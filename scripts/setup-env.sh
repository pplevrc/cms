#!/usr/bin/env bash
#
# Bootstrap app/.env from app/.env.example with locally-generated values.
# Idempotent — does not overwrite an existing app/.env.
#
# Generated values:
#   PAYLOAD_SECRET: 32 bytes via openssl rand -base64 32
#   DATABASE_URL:   docker-compose default (matches app/docker-compose.yml)
#
# Other env vars stay empty in app/.env; the user fills them in as features
# get added (Storage / Mail / Auth params 等).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/app/.env"
EXAMPLE_FILE="$ROOT_DIR/app/.env.example"

if [ -f "$ENV_FILE" ]; then
  echo "app/.env already exists; not overwriting." >&2
  echo "Remove app/.env and re-run 'make setup' to regenerate." >&2
  exit 0
fi

if [ ! -f "$EXAMPLE_FILE" ]; then
  echo "app/.env.example missing; cannot bootstrap." >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to generate PAYLOAD_SECRET; install it first." >&2
  exit 1
fi

# Clean up the partially-written .env (and any awk-staged tmp files) if any
# step after `cp` fails. Without this, a half-written app/.env would block
# re-runs because of the existence guard above without any hint of what went
# wrong.
cleanup_on_error() {
  local rc=$?
  if [ $rc -ne 0 ]; then
    rm -f "$ENV_FILE" "$ENV_FILE.tmp"
  fi
}
trap cleanup_on_error EXIT

cp "$EXAMPLE_FILE" "$ENV_FILE"

PAYLOAD_SECRET=$(openssl rand -base64 32 | tr -d '\n')

# secretlint-disable-next-line @secretlint/secretlint-rule-database-connection-string -- ローカル docker-compose default; matches app/docker-compose.yml environment.
DEFAULT_DB_URL='postgres://postgres:postgres@127.0.0.1:5432/cms'

# Use awk with ENVIRON[] rather than sed with shell-interpolated argv so that
# the generated PAYLOAD_SECRET does not appear in any process's argv (which
# would leak via /proc/<pid>/cmdline and casual `ps -ef` on a multi-user host).
# The values are passed via the awk process's environment instead, which has
# stricter default visibility.
#
# The END block enforces that BOTH placeholder keys actually matched and got
# substituted. If app/.env.example is ever changed so a key carries a non-empty
# default (e.g. `PAYLOAD_SECRET=changeme`), the regex no longer matches, the
# corresponding flag stays unset, and awk exits non-zero. The cleanup_on_error
# trap then removes the half-written .env so re-runs work cleanly.
PAYLOAD_SECRET="$PAYLOAD_SECRET" \
DEFAULT_DB_URL="$DEFAULT_DB_URL" \
awk '
  /^PAYLOAD_SECRET=$/ { sub(/=$/, "=" ENVIRON["PAYLOAD_SECRET"]); secret_set=1 }
  /^DATABASE_URL=$/   { sub(/=$/, "=" ENVIRON["DEFAULT_DB_URL"]); db_set=1 }
  { print }
  END {
    if (!secret_set) {
      print "Failed to substitute PAYLOAD_SECRET — app/.env.example may have a non-empty default for PAYLOAD_SECRET=." > "/dev/stderr"
      exit 1
    }
    if (!db_set) {
      print "Failed to substitute DATABASE_URL — app/.env.example may have a non-empty default for DATABASE_URL=." > "/dev/stderr"
      exit 1
    }
  }
' "$ENV_FILE" > "$ENV_FILE.tmp"
mv "$ENV_FILE.tmp" "$ENV_FILE"

echo "Generated $ENV_FILE." >&2
echo "Review the file before running 'pnpm dev' or 'make dev'." >&2
