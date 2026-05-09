# CMS アプリケーション

Payload + Next.js による管理画面 (admin) と REST API を提供するアプリケーション。
公開サイトはこのアプリではなく、`@<ORG>/cms-client` パッケージを介して別リポジトリで動作する。

設計の経緯・判断の根拠は [`../designs/`](../designs/) を参照。

## このアプリが必要とするもの

ローカル開発で動作させるには 3 つを準備する。

| # | 必要なもの | 用途 |
|---|---|---|
| 1 | Node.js (`^18.20.2 \|\| >=20.9.0`) | Payload と Next.js を動かす runtime |
| 2 | pnpm (`^9 \|\| ^10`) | 依存解決とワークスペース管理 |
| 3 | PostgreSQL (16+ 推奨) | データの保存先。Payload は起動時に DB に接続するため、無いと admin にアクセスできない |

「PostgreSQL を用意」する手段は 2 つある。手元の環境に合わせて選ぶ:

- **Docker でローカル起動** (Docker daemon があれば数秒で立つ)
- **クラウド Postgres** (free tier の managed Postgres を契約)

どちらの場合も DB の接続文字列 (`DATABASE_URL`) を `.env` に書く工程は共通。

## ローカルで起動するまで

### 0. (推奨) `pnpm bootstrap` で一括 bootstrap

リポジトリルートで:

```bash
pnpm bootstrap
```

次の 2 ステップを 1 コマンドにまとめる:

- `app/.env` 不在時のみ `app/.env.example` をコピーし、`PAYLOAD_SECRET` にランダム値 (`openssl rand -base64 32`) と、`DATABASE_URL` に Docker Postgres のデフォルト接続文字列 (本書「3A. Docker でローカル Postgres を立ち上げる場合」と同じもの) を埋める。**既存の `app/.env` は絶対に上書きしない**
- `pnpm install --frozen-lockfile` をルートで実行する

`pnpm setup-env` 単体で env bootstrap だけ走らせることもできる (依存解決はスキップ)。

`pnpm bootstrap` の中身を手で再現したい場合は次の各ステップを参照。

### 1. リポジトリ ルートで依存をインストール

```bash
# pnpm workspace なのでルートで一度だけ
cd <本リポジトリのルート>
pnpm install
```

`app/` 配下の依存も `packages/` の依存もまとめて解決される。

### 2. 環境変数ファイルを作る

```bash
cd app
cp .env.example .env
```

`.env` は `.gitignore` 済み。実値はここに書く。**`.env` を commit してはならない**（`SECURITY.md` 参照）。

`.env.example` は **キー名のみ** を載せている。値は以下から:
- `DATABASE_URL`: 後述の「DB を用意する」で生成
- `PAYLOAD_SECRET`: 32 文字以上のランダム文字列。生成例:
  ```bash
  openssl rand -base64 32
  ```
- その他のキーの値の出処は `../designs/private/templates/env-vars-reference.md`（gitignored、チーム vault で同期）

trial の最初の起動だけなら `DATABASE_URL` と `PAYLOAD_SECRET` の 2 つで動く。他のキーは空のまま進めて、機能を追加するタイミングで埋めれば良い。

必須 env vars (`PAYLOAD_SECRET` / `DATABASE_URL`) が未設定 (空文字列を含む) の状態で `pnpm dev` を起動すると、`requireEnv` ヘルパが「環境変数 X が設定されていません」エラーで明示的に落ちる。silent failure を避けるための意図的な挙動。

### 3. DB を用意する

#### A. Docker でローカル Postgres を立ち上げる場合

`app/docker-compose.yml` がローカル開発用の Postgres コンテナ定義を持っている。`app/` 配下で:

```bash
docker compose up -d postgres
```

起動後、`.env` の `DATABASE_URL` に下記を設定:

<!-- secretlint-disable @secretlint/secretlint-rule-database-connection-string -- ローカル開発専用の固定 credential を junior が copy-paste できるよう例示。docker-compose.yml の environment と一致。本番値は managed Postgres 側で発行する。 -->
```
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/cms
```
<!-- secretlint-enable -->


ユーザー名・パスワード・DB 名は `docker-compose.yml` の `environment` セクションと一致させる必要がある（既定値は `postgres` / `postgres` / `cms`）。

| 操作 | コマンド |
|---|---|
| 状態確認 | `docker compose ps` |
| ログ | `docker compose logs -f postgres` |
| 停止（データ保持） | `docker compose down` |
| 停止 + データ消去 | `docker compose down -v` |

#### B. クラウド Postgres を使う場合

managed Postgres サービスで free project を作り、connection string をコピーして `.env` に貼る。

```
DATABASE_URL=postgres://...
```

接続経路が pooler 対応の場合は **pooler URL を使う**（serverless 環境での接続効率のため。詳細は `../designs/03-public-repo-security-model.md` §⑤）。

### 4. 開発サーバーを起動

リポジトリ ルートから:
```bash
pnpm --filter cms dev
```

または `app/` 配下から:
```bash
cd app
pnpm dev
```

ブラウザで <http://localhost:3000/admin> を開く。最初のアクセスで admin ユーザーの作成画面が出る。Email + Password を入力すると、その値で admin ロールのユーザーが作成され、以降ログインで使える。

## 開発中に使うコマンド

すべて `app/` 配下、または `pnpm --filter cms <スクリプト>` で実行する。

| コマンド | 何をする |
|---|---|
| `pnpm dev` | 開発サーバー起動（コード変更で自動再読込） |
| `pnpm build` | 本番ビルドを生成 |
| `pnpm start` | ビルド済みのサーバーを起動 |
| `pnpm generate:types` | Collection 定義から TypeScript 型を生成 (`src/payload-types.ts`) |
| `pnpm lint` | ESLint で静的解析 |
| `pnpm test` | unit (vitest) + e2e (playwright) を順に実行 |
| `pnpm test:int` | unit テストのみ |
| `pnpm test:e2e` | e2e テストのみ |
| `pnpm devsafe` | `.next/` を消してから dev 起動（キャッシュ起因の不具合対処用） |

Collection を編集した後は `pnpm generate:types` を実行して型を更新する。Type 生成を忘れると `payload-types.ts` が古いまま `pnpm typecheck` がエラーを出す。

## 行き詰まったときに見るところ

| 症状 | 原因として疑うところ |
|---|---|
| `next/package.json` が見つからないというエラーが起動時に出る | `app/next.config.ts` の `turbopack.root` が `pnpm-workspace.yaml` の場所を指しているか確認 |
| admin にアクセスすると DB 接続エラー | DB プロセスが起動しているか / `.env` の `DATABASE_URL` が正しいか |
| admin の画面が真っ白で何も出ない | ブラウザのコンソールでエラーを確認。`pnpm devsafe` でキャッシュをクリアして再起動 |
| `pnpm typecheck` が `src/payload-types.ts` の不整合で失敗 | `pnpm generate:types` を実行してから再 typecheck |
| Collection 編集が反映されない | dev server を再起動。`payload.config.ts` の編集は HMR で拾えないことがある |
| Image upload で "no storage adapter" エラー | `payload.config.ts` の `plugins` に S3 互換ストレージ adapter を設定しているか確認 |

ログの全文を読むのが一番早い。エラー文中の URL（Payload / Next.js のドキュメントへのリンク）はだいたい原因解説に直接飛ぶ。

## ディレクトリ構成

```text
app/
├── src/
│   ├── app/
│   │   ├── (frontend)/        # Next.js 公開ページ用 (本プロジェクトの公開サイトは別リポジトリで実装するため、このディレクトリは使わない)
│   │   └── (payload)/
│   │       ├── admin/         # admin UI ルート
│   │       └── api/           # REST / GraphQL endpoint
│   ├── collections/           # Collection 定義 (Users, Media など)
│   ├── globals/               # Globals 定義 (SiteConfig など)
│   ├── access/                # 共通 access 関数
│   ├── hooks/                 # 共通 hooks (createdBy 自動付与など)
│   ├── endpoints/             # custom endpoints (admin 専用 export など)
│   ├── payload-types.ts       # 自動生成型 (手動編集禁止)
│   └── payload.config.ts      # Payload の設定エントリーポイント
├── tests/
│   ├── int/                   # vitest による unit / 統合テスト
│   └── e2e/                   # Playwright による E2E
├── .env / .env.example        # 環境変数 (.env は commit 禁止)
├── docker-compose.yml         # ローカル DB 用 (オプション)
├── Dockerfile                 # 本番イメージ用 (将来の VPS 移行検証用)
├── next.config.ts             # Next.js 設定
├── package.json               # アプリ依存とスクリプト
└── tsconfig.json              # TypeScript 設定
```

## 次に読むべきもの

| 知りたいこと | 場所 |
|---|---|
| 全体アーキテクチャ・責務境界 | `../designs/01-architecture.md` |
| 移行耐性レイヤ (`packages/cms-client`) の設計 | `../designs/02-migration-resilience.md` |
| public repo 前提のセキュリティ要件 | `../designs/03-public-repo-security-model.md` |
| Phase 1 の実装スコープと完了基準 | `../docs/implementation-plan.md` |
| コーディング規約の詳細 | `../docs/coding-standards.md` |
| 脆弱性報告窓口 | `../SECURITY.md` |
| Payload 自体の機能リファレンス | <https://payloadcms.com/docs> |
| Next.js (App Router) リファレンス | <https://nextjs.org/docs> |

## トラブル時の連絡先

ローカル環境固有の問題で詰まった場合は、チーム内の運用 vault（同期手段は `../designs/private/README.md` 参照）にある連絡先を参照する。
