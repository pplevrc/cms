# Implementation Plan

Phase 1（本リポジトリの初期実装）の作業範囲・完了基準・推奨順序。
具体的な endpoint 名・vendor 名・ファイル名を含む詳細版は `designs/private/tasks.md`（gitignored）。

## Phase 1 で実装するもの

### プロジェクト基盤
- [ ] monorepo 初期化（`package.json` / `tsconfig.json` / `pnpm-workspace.yaml`）
- [ ] 各種設定ファイル（`.env.example` / `.gitignore` / `.npmrc`）
- [ ] Next.js + Payload の最小セットアップ
- [ ] `payload.config.ts`

### Collection / Global
- [ ] Collections 5 種（Users / Members / Events / Posts / Media）の最小定義
- [ ] Globals 1 種（SiteConfig）の最小定義
- [ ] 共通 access 関数（`access/`）
- [ ] 共通 hooks（`hooks/setUserField` 等）

### Adapter 設定
- [ ] Postgres adapter（DB 接続）
- [ ] S3 互換ストレージ adapter（メディアアップロード）
- [ ] SMTP adapter（メール送信）

### セキュリティ設定
- [ ] CORS / CSRF allow list
- [ ] Cookie 設定（`secure: true`, `sameSite: 'Strict'`）

### カスタム endpoint
- [ ] 管理者専用データエクスポート endpoint（具体パスは `designs/private/endpoints.md`）

### cms-client パッケージ
- [ ] `packages/cms-client` 雛形（型・fetcher・URL builder）

### CI/CD
- [ ] CI workflow（lint / typecheck / test）
- [ ] Package publish workflow（tag push 連動）
- [ ] DB バックアップ workflow（月次自動）

### インフラ
- [ ] Dockerfile（VPS 移行用、起動可能性検証のみ）

### ドキュメント
- [ ] `README.md`（root）
- [ ] `SECURITY.md`（root、本リポジトリにテンプレあり）
- [ ] `docs/HISTORY.md`（経緯記述）
- [ ] `docs/RUNBOOK.md`（secret rotation、バックアップ復元手順）
- [ ] `docs/migrations/`（初期スキーマ記録）

## Definition of Done

実装完了の判定基準。すべて満たした時点でレビュー可能。

### ローカル動作
- [ ] `pnpm install && pnpm dev` でローカル起動できる
- [ ] 管理画面にアクセスし、最初の admin ユーザーを作成できる
- [ ] Users collection の role 設定で 2 人目を招待できる
- [ ] Media collection に画像をアップロード → ストレージに保存される
- [ ] アップロードした画像が独自ドメイン経由の URL で取得できる
- [ ] パスワードリセットメールが送信される
- [ ] ログイン endpoint のレート制限が動作する（連続失敗でロック）
- [ ] 管理者専用エクスポート endpoint が admin のみアクセス可で JSON dump を返す

### ビルド・型・テスト
- [ ] `pnpm typecheck` が全 workspace で pass
- [ ] `pnpm build` が全 workspace で成功
- [ ] `pnpm lint` が pass
- [ ] `payload generate:types` でエラーなく型生成
- [ ] `packages/cms-client` が build 成功し、最小 fetcher 1 つで動作確認

### CI / コンテナ
- [ ] CI workflow が PR で動作（typecheck / lint / test pass）
- [ ] Dockerfile から `docker build` 成功、`docker run` で起動

### ドキュメント
- [ ] `.env.example` に全環境変数キーが記載
- [ ] `SECURITY.md` / `README.md` / `docs/HISTORY.md` / `docs/RUNBOOK.md` が生成済み

## 推奨実装順序

各ステップ完了時に `pnpm typecheck` と `pnpm build` が通ることを確認しながら進める。

1. プロジェクト初期化（pnpm workspace / tsconfig / `.gitignore` / `.env.example`）
2. Next.js + Payload の最小セットアップ
3. Postgres adapter 設定（DB 接続確認）
4. Users collection（auth 動作確認）
5. ストレージ adapter（画像アップロード確認）
6. Media collection（公開 URL 確認）
7. その他 Collections（Posts / Events / Members）
8. 共通 access / hooks
9. 管理者専用エクスポート endpoint
10. SMTP adapter
11. `packages/cms-client` 雛形（型生成 → 1 つの fetcher）
12. CI workflow
13. Publish workflow
14. Backup workflow
15. Dockerfile
16. ドキュメント整備（`README` / `SECURITY` / `HISTORY` / `RUNBOOK` / `migrations/`）

## Phase 1 に含めない（後続対応）

| 項目 | 担当タイミング |
|---|---|
| 既存 CMS データの移行スクリプト | Phase 1 完了後の別タスク |
| 公開サイト側リポジトリの改修 | cms-client minor リリース後 |
| 過去スキーマ（Phase 1 / Phase 2、`CLAUDE.md` §1 参照）の中身記入 | マイグレーションタスクとして |
| 管理者ロール 2FA 必須化 | Phase 2 |
| 認証イベントログの外部転送 | Phase 2 |
| Uptime monitoring | Phase 2 |
| 画像のウイルススキャン | Phase 2 |

Phase 2 項目は、運用開始後に課題が顕在化した時点で着手する（事前に作り込まない）。
