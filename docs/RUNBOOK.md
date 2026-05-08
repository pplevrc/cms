# RUNBOOK

運用手順を集約するドキュメント。エンジニア 1 人にしか実行できない手順を残さないために、誰が読んでも再実行できる形で記述する。

各セクションは独立して読めるよう、外部ドキュメントへの暗黙参照を避けて書く。

## ブランチ保護に CI チェックを必須化する

`main` への merge 前に CI の各 job (`typecheck` / `lint` / `secretlint` / `test:int` / `test:e2e`) を必須化する手順。`.github/workflows/ci.yml` で job 名が変わるたび、または job を追加するたびに本手順で required status check を更新する。

### 前提

- リポジトリの設定権限を持つ管理者アカウント
- 対象ブランチは `main`
- 既に `.github/workflows/ci.yml` が `pull_request` トリガーで動作しており、PR 上で対象 job が少なくとも 1 度成功している (= GitHub 側に check の名前が記録されている) こと

required status check は実際に GitHub に記録された名前から選択する形式のため、対象 job が一度も走っていないリポジトリでは候補に出てこない。リポジトリ初期化直後は、本手順の前にダミー PR を 1 つ作って CI を走らせるのが確実。

### 手順 (Repository Settings UI)

1. リポジトリ画面の `Settings` → `Branches` (Classic) または `Settings` → `Rules` → `Rulesets` (Ruleset) を開く。
2. `main` を対象とするルール (Branch protection rule または Branch ruleset) を編集する。
3. `Require status checks to pass before merging` を有効化する。
4. `Require branches to be up to date before merging` も合わせて有効化する (CI が古い main で走らないようにするため)。
5. 検索ボックスに以下の job 名を入れて、それぞれを required に追加する:
   - `typecheck`
   - `lint`
   - `secretlint`
   - `test:int`
   - `test:e2e`
6. 保存する (`Save changes` / `Update rule`)。
7. 動作確認: 任意の PR で全 job が green になり、かつ PR 画面で `5 required status checks passed` と表示されることを確認する。

### よくある失敗

- **検索しても job 名が出てこない**: 対象 job が一度も走っていない。先に PR を作って CI を走らせる。
- **`test:e2e` だけ green にならない**: GitHub Actions の Postgres service container が起動失敗している可能性。Workflow 内の `services.postgres.options` の health check 条件、もしくは `DATABASE_URL` のホスト名を確認する (`localhost` であって `postgres` ではない)。
- **rename 後も古い名前が required として残る**: ruleset / branch protection の status check リストに古い名前が残ったまま。手動で削除する必要がある。

### CLI からの確認 (任意)

```bash
gh api repos/<owner>/<repo>/branches/main/protection | jq '.required_status_checks.contexts'
```

返ってくるリストに上記 5 job 名が含まれていれば設定は正しい。

## Secret rotation

トライアル段階から本番運用までで導入する全 secret に対して、漏洩・退職・定期更新時に安全に値を入れ替える手順をまとめる。**事前にドリル検証していない rotation 手順は本番インシデント中に動くとは限らない** ため、最初の本物 secret を導入する前にここを固める。

対象範囲:

- `PAYLOAD_SECRET` — Payload の JWT 署名鍵
- `DATABASE_URL` — managed Postgres の接続文字列 (role password を含む)
- `STORAGE_*` — S3 互換オブジェクトストレージの access key / secret key
- `SMTP_*` — メール送信用 SMTP credential
- GitHub Actions secrets — CI / バックアップ workflow が使う credential

「ローテートしたつもりで実は古い credential が生きている」状態を作らないことが目的。各 secret の保管場所・番号付き rotation 手順・rotation 後の検証ステップを必ず通す。

### ドリル: `PAYLOAD_SECRET` (実施記録 2026-05-09)

最初の本物 secret 投入前に、無害な値で経路をリハーサルした記録。本番値導入時はこの手順をなぞる。

#### 対象保管場所 (本書執筆時点)

| 保管場所 | 状態 | 備考 |
|---|---|---|
| `app/src/payload.config.ts` (consumer) | `process.env.PAYLOAD_SECRET` で参照 | rotation 時に編集する場所ではない |
| `app/.env.example` | キー名のみ記載、値はブランク | rotation 対象外 (テンプレ) |
| 各開発者ローカル `app/.env` | gitignored | 各自で更新 |
| `.github/workflows/ci.yml` | リテラル文字列 (`ci-runner-only-...`) | `#14` で `${{ secrets.CI_PAYLOAD_SECRET }}` に置換予定 |
| Vercel env (Production / Preview) | 未配備 | `#7` (Vercel + Neon trial) 完了後に追加 |

#### ドリル手順と結果

1. **新値生成** — `openssl rand -base64 32` をローカル実行。
   - 結果: 標準出力に 1 行 base64 文字列が出力される。値は記録に残さない (secret なので)。`.env.example` 記載のとおり 32+ chars 要件を満たす。
2. **ローカル `app/.env` の値を新値に置換** → `pnpm dev` 再起動。
   - 結果: dev server が secret 由来のエラーなく起動完了 (Payload は起動時に `secret` 必須チェックを通すのみで、値の内容自体は正常起動を妨げない)。
3. **古いセッションの無効化検証** — admin UI に既存ログインで再アクセス。
   - 期待: 古い JWT は新 secret で decode 失敗 → 401 → ログイン画面にリダイレクト。
   - 結果: `#7` 完了後に admin user が確定してから再検証。本ドリルでは「値置換後にサーバが起動した」までを確認した。
4. **CI workflow 側の rotation** — `.github/workflows/ci.yml` のリテラルを置換するパスを確認。
   - 結果: `grep -n "PAYLOAD_SECRET" .github/workflows/ci.yml` で 2 箇所 hit (`test:int` / `test:e2e` job)。`#14` 完了後は GH Actions secret 経由になり、本ドリルの「リテラル直接編集」パスは廃止される。
5. **Vercel env 側の rotation** — 未配備のため walkthrough のみ。
   - 期待手順: Production scope 先 → Preview scope 後の順で `vercel env rm` → `vercel env add`。Production を先に切るのは Preview の検証中ユーザーが古い token で詰まる時間を最短化するため。
   - 結果: `#7` 完了後にこの順序で再ドリル必要。

#### 学び / 改善点

- ドリル時点での live 検証可能範囲は **ローカル `app/.env`** のみ。`#7` (Vercel) と `#14` (GH Actions secret) 完了後に該当環境を追加してこのドリル節を更新する。
- リテラル `ci-runner-only-...` は CI runner ローカル限定の dummy 値だが、本物の secret 導入後に「dummy か real か」の判別コストが上がるため、`#14` を `#7` 着手前に終わらせる順序が妥当。

### `PAYLOAD_SECRET`

JWT 署名に使われる。値が変わると既存セッションが全て invalidate され、ユーザーは再ログインが必要になる。

#### 保管場所

- 各開発者ローカル `app/.env`
- `.github/workflows/ci.yml` (リテラル — `#14` で GH Actions secret 化予定)
- (将来) Vercel env vars Production scope (`#7` 完了後)
- (将来) Vercel env vars Preview scope (同上 — Production と別値にする)

#### Rotation 手順

1. 新値を生成: `openssl rand -base64 32` (32+ chars random)。
2. 環境別に値を入れ替える (順序: GH Actions → Vercel Production → Vercel Preview → ローカル):
   1. **GH Actions secret** (`#14` 完了後): `gh secret set CI_PAYLOAD_SECRET --body "<NEW_VALUE>"` または repo Settings → Secrets and variables → Actions UI から更新。
   2. **Vercel Production** (`#7` 完了後): `vercel env rm PAYLOAD_SECRET production` → `vercel env add PAYLOAD_SECRET production` → 値を貼り付け。
   3. **Vercel Preview** (`#7` 完了後): 同上 (`production` を `preview` に置換)。
   4. **ローカル**: 各開発者が自分の `app/.env` を編集 (Slack 等で「rotation したので各自更新してください」と通知)。
3. 反映: GH Actions は次回 workflow run、Vercel は redeploy (`vercel --prod`)、ローカルは `pnpm dev` 再起動。

#### Post-rotation 検証

- [ ] Vercel preview URL で admin にログインできる (新 JWT が発行される)。
- [ ] Vercel preview の admin に古い browser session で再アクセス → ログイン画面にリダイレクトされる。
- [ ] 直近の CI workflow run が green。
- [ ] 各開発者が `pnpm dev` 起動成功を Slack 等で報告。

### `DATABASE_URL` (Neon role password)

Postgres 接続文字列。Neon role password の rotation はこの URL に含まれる password 部分を更新する作業。

#### 保管場所

- 各開発者ローカル `app/.env` (ローカル開発は `app/docker-compose.yml` の Postgres を使うため、本番 Neon の URL とは別物)
- (将来) Vercel env vars Production scope (`#7` 完了後)
- (将来) Vercel env vars Preview scope (同上 — Production と別 role / 別 DB を推奨)
- (将来) GitHub Actions secrets — backup workflow (`#12`) 用

#### Rotation 手順

1. **Neon dashboard** にサインイン → 対象プロジェクト → `Roles` ページ。
2. 対象 role (例: `app`) の `Reset password` を実行。新パスワードを生成し、新 connection string を取得する (Neon UI が提示する `postgresql://...` 形式の URL をそのまま使う)。
3. 環境別に値を入れ替える:
   1. **Vercel Production**: `vercel env rm DATABASE_URL production` → `vercel env add DATABASE_URL production`。
   2. **Vercel Preview**: 同上 (Preview 用 role / DB を別途用意している場合はそちらの URL を使う)。
   3. **GH Actions backup secret**: `gh secret set BACKUP_DATABASE_URL --body "<NEW_URL>"`。
4. Vercel redeploy → 直後の DB アクセスが成功することを確認。

#### Post-rotation 検証

- [ ] Vercel preview で admin が DB を伴う操作 (collection 一覧表示など) を実行できる。
- [ ] 旧 password で接続を試みる → 失敗することを Neon dashboard の audit log で確認。
- [ ] backup workflow を `workflow_dispatch` で 1 回手動実行 → 成功することを確認 (`#12` 完了後)。

### `STORAGE_*` (S3 互換オブジェクトストレージ)

メディア配信用バケットへの read/write credential。`STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` のペア。

#### 保管場所

- 各開発者ローカル `app/.env`
- (将来) Vercel env vars Production scope (`#8` 完了後)
- (将来) Vercel env vars Preview scope (同上 — 同一バケット参照可、token 自体は別発行を推奨)
- (将来) GitHub Actions secrets — backup workflow (`#12`) 用に backup bucket scope の別 token を使う

#### Rotation 手順

1. **ストレージ vendor dashboard** で対象 token を `Roll` または `Delete + Create new` で再発行。
2. 旧 token は revoke する前に新 token を環境に投入し、両方有効な状態で切り替える (downtime ゼロ rotation)。
3. 環境別に新 token を投入:
   1. **Vercel Production**: `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` の両方を更新。
   2. **Vercel Preview**: 同上。
   3. **GH Actions backup secret** (`#12` 完了後): backup bucket scope 用の `BACKUP_STORAGE_*` を更新。
4. 反映確認後、vendor dashboard で旧 token を revoke。

#### Post-rotation 検証

- [ ] Vercel preview の admin から新規メディアをアップロード → ストレージに保存され、`<MEDIA_DOMAIN>` 経由で配信される。
- [ ] 既存メディア URL が引き続き解決される (バケット側の object permission 設定に変更がないことを意味する)。
- [ ] backup workflow を 1 回手動実行 → backup bucket に新 dump が現れる。

### `SMTP_*` (メール送信)

`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS`。`SMTP_PASS` だけが secret 性が高い (host / user は公開可)。

#### 保管場所

- 各開発者ローカル `app/.env`
- (将来) Vercel env vars Production scope (`#9` 完了後)
- (将来) Vercel env vars Preview scope (同上)

#### Rotation 手順

1. **メール vendor dashboard** で SMTP credential を再発行。新 `SMTP_PASS` を取得 (vendor によっては `SMTP_USER` も再発行)。
2. 環境別に新値を投入:
   1. **Vercel Production**: `SMTP_PASS` (および必要なら `SMTP_USER`) を更新。
   2. **Vercel Preview**: 同上。
3. Vercel redeploy。
4. 旧 credential を vendor dashboard で無効化。

#### Post-rotation 検証

- [ ] Vercel preview で forgot-password を発火 → 検証用アドレスに実メールが届く。
- [ ] vendor dashboard の送信ログに該当メール送信の記録がある。
- [ ] 旧 credential での SMTP 認証が失敗することを vendor dashboard の audit log で確認。

### GitHub Actions secrets (CI / backup)

- `CI_PAYLOAD_SECRET` (`#14` で導入)
- `BACKUP_DATABASE_URL` (`#12` で導入)
- `BACKUP_STORAGE_ACCESS_KEY_ID` / `BACKUP_STORAGE_SECRET_ACCESS_KEY` (`#12` で導入)

#### 保管場所

- repo Settings → Secrets and variables → Actions のみ

#### Rotation 手順

1. **新値を生成**: 対象に応じて `openssl rand -base64 32` または vendor dashboard から再発行。
2. **secret を更新**: `gh secret set <NAME> --body "<NEW_VALUE>"` または UI から更新。
3. 必要に応じて旧 secret を `gh secret delete <NAME>` するが、複数 workflow が参照している間は両方有効化期間を作る。
4. 直近の workflow を `workflow_dispatch` で 1 回手動実行 → green を確認。

#### CLI 例

```bash
# 値を直接渡す (履歴に残らないよう --body-file - を使うほうが安全な場合もある)
echo -n "<NEW_VALUE>" | gh secret set CI_PAYLOAD_SECRET --body-file -

# 確認 (値は表示されない、設定の存在のみ)
gh secret list
```

#### Post-rotation 検証

- [ ] CI workflow が次回 PR / push で green。
- [ ] backup workflow を `workflow_dispatch` で 1 回手動実行 → backup bucket に新 dump が現れる。

### よくある失敗

- **複数環境のうち 1 つだけ rotation し忘れる** — Production だけ更新して Preview を放置するなど。本書のチェックリストを上から順に潰す。
- **rotation 中の downtime ゼロを狙って両方有効化したまま旧値を revoke し忘れる** — 新値の動作確認後、必ず vendor dashboard で旧値を明示的に無効化する。
- **古い JWT が残っている browser からのアクセスを「正常」と勘違い** — `PAYLOAD_SECRET` rotation 後は古い JWT は decode 失敗するはず。「ログインしたままになっている」場合は rotation が反映されていない (Vercel redeploy 漏れなど)。
