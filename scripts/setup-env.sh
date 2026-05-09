#!/usr/bin/env bash
#
# app/.env をローカル開発用に bootstrap する。app/.env.example を起点に、
# `PAYLOAD_SECRET` と `DATABASE_URL` だけ自動生成 / 既定値で埋めて書き出す。
# 既存の app/.env は絶対に上書きしない (idempotent)。
#
# 自動で埋める値:
#   PAYLOAD_SECRET: openssl rand -base64 32 で生成した 32 bytes ランダム値
#   DATABASE_URL:   docker-compose のデフォルト接続文字列
#                   (app/docker-compose.yml の environment と一致させる)
#
# 他の env vars は app/.env.example の空のまま残す。Storage / Mail / Auth
# パラメータ等は機能を追加するタイミングで利用者が手で埋める想定。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/app/.env"
EXAMPLE_FILE="$ROOT_DIR/app/.env.example"

if [ -f "$ENV_FILE" ]; then
  echo "app/.env が既に存在するため上書きしません。" >&2
  echo "再生成したい場合は app/.env を削除してから 'pnpm bootstrap' を再実行してください。" >&2
  exit 0
fi

if [ ! -f "$EXAMPLE_FILE" ]; then
  echo "app/.env.example が見つからないため bootstrap できません。" >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "PAYLOAD_SECRET の生成に openssl が必要です。先にインストールしてください。" >&2
  exit 1
fi

# 部分失敗時の cleanup。`cp` 成功後に awk 等が失敗すると半端な app/.env
# (PAYLOAD_SECRET= が空のまま) が残り、existence guard に引っかかって
# 再実行時に user が迷子になる。EXIT trap で非 0 終了時のみ ENV_FILE と
# .tmp を削除する。
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

# sed の shell 展開された argv に PAYLOAD_SECRET の生成値が乗ると、
# /proc/<pid>/cmdline や多人数ホストでの `ps -ef` から一瞬読める状態が
# 発生する。それを避けるため awk + ENVIRON[] 経由で env vars 経路を使い、
# 値そのものは argv に乗らないようにする。
#
# END block で `secret_set` / `db_set` フラグをチェックし、両方の置換が
# 実際に発火したことを確認する。app/.env.example の対応キーが空 default
# でなくなった場合 (例: `PAYLOAD_SECRET=changeme`) は regex が match せず
# フラグ未設定 → awk が exit 1 → cleanup_on_error trap が走って半端な
# .env が残らない、という流れで fail loud にする。
PAYLOAD_SECRET="$PAYLOAD_SECRET" \
DEFAULT_DB_URL="$DEFAULT_DB_URL" \
awk '
  /^PAYLOAD_SECRET=$/ { sub(/=$/, "=" ENVIRON["PAYLOAD_SECRET"]); secret_set=1 }
  /^DATABASE_URL=$/   { sub(/=$/, "=" ENVIRON["DEFAULT_DB_URL"]); db_set=1 }
  { print }
  END {
    if (!secret_set) {
      print "PAYLOAD_SECRET の置換に失敗しました。app/.env.example の PAYLOAD_SECRET= に default 値が入っていないか確認してください。" > "/dev/stderr"
      exit 1
    }
    if (!db_set) {
      print "DATABASE_URL の置換に失敗しました。app/.env.example の DATABASE_URL= に default 値が入っていないか確認してください。" > "/dev/stderr"
      exit 1
    }
  }
' "$ENV_FILE" > "$ENV_FILE.tmp"
mv "$ENV_FILE.tmp" "$ENV_FILE"

echo "$ENV_FILE を生成しました。" >&2
echo "'pnpm dev' を実行する前にファイルの内容を確認してください。" >&2
