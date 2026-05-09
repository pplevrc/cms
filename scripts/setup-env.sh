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
# get added (Storage / Mail / Auth params 等)。

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

cp "$EXAMPLE_FILE" "$ENV_FILE"

PAYLOAD_SECRET=$(openssl rand -base64 32 | tr -d '\n')

# secretlint-disable-next-line @secretlint/secretlint-rule-database-connection-string -- ローカル docker-compose default; matches app/docker-compose.yml environment.
DEFAULT_DB_URL='postgres://postgres:postgres@127.0.0.1:5432/cms'

# `sed -i` has BSD / GNU differences. Use `-i.bak` and remove the backup
# afterwards so the script is portable across both.
sed -i.bak \
  -e "s|^PAYLOAD_SECRET=\$|PAYLOAD_SECRET=${PAYLOAD_SECRET}|" \
  -e "s|^DATABASE_URL=\$|DATABASE_URL=${DEFAULT_DB_URL}|" \
  "$ENV_FILE"

rm -f "${ENV_FILE}.bak"

# Clear the secret from this script process's environment.
unset PAYLOAD_SECRET

echo "Generated $ENV_FILE." >&2
echo "Review the file before running 'pnpm dev' or 'make dev'." >&2
