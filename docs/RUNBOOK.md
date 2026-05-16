# RUNBOOK

運用手順を集約するドキュメント。エンジニア 1 人にしか実行できない手順を残さないために、誰が読んでも再実行できる形で記述する。

各セクションは独立して読めるよう、外部ドキュメントへの暗黙参照を避けて書く。

## ブランチ保護に CI チェックを必須化する

`main` への merge 前に CI の各 job (`typecheck` / `lint` / `secretlint` / `test:int`) を必須化する手順。`.github/workflows/ci.yml` で job 名が変わるたび、または job を追加するたびに本手順で required status check を更新する。

`test:e2e` は別 workflow (`.github/workflows/ci-e2e.yml`) に分離され、`e2e` label 付き PR と `main` push 時のみ実行される (label 無し PR では SKIPPED 扱い)。required status check への含め方は次セクション「test:e2e の label-based gate」参照。

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
6. (運用ノート) `test:e2e` は required に**含めなくてよい**。GitHub は条件付き起動 job の SKIPPED を required の success として扱うため、required に入れても破綻はしない。ただし「label 無し PR で test:e2e が green=success と表示される」のが視覚的に紛らわしい場合は required から外し、`e2e` label を付けた PR では Actions タブで完了を merge 前に目視確認する運用に倒すほうが状態が明示的になる。本書ではデフォルトとして「required から外す」を推奨。
7. 保存する (`Save changes` / `Update rule`)。
8. 動作確認: 任意の PR で 4 job が green になり、かつ PR 画面で `4 required status checks passed` と表示されることを確認する。

### よくある失敗

- **検索しても job 名が出てこない**: 対象 job が一度も走っていない。先に PR を作って CI を走らせる。
- **`test:e2e` を誤って required に追加してしまう**: 条件付き起動の workflow を required にすると、label が付いていない PR で "Expected — Waiting for status to be reported" が永続し merge 不可になる。required から外す。
- **rename 後も古い名前が required として残る**: ruleset / branch protection の status check リストに古い名前が残ったまま。手動で削除する必要がある。

### CLI からの確認 (任意)

```bash
gh api repos/<owner>/<repo>/branches/main/protection | jq '.required_status_checks.contexts'
```

返ってくるリストに上記 4 job 名が含まれており `test:e2e` が含まれていなければ設定は正しい。

## test:e2e の label-based gate

`test:e2e` は実 Payload を起動して Playwright で叩く性質上、単一 job のなかで最も時間がかかる。docs / cms-client / config 系の変更にも毎回フル実行すると CI 時間と GitHub Actions runner 消費が線形に増える。これを抑えるため、`test:e2e` だけ別 workflow (`.github/workflows/ci-e2e.yml`) に分離し、**PR `e2e` label 付与時** および **`main` への push 時** にのみ起動する構成にする。

### 動作

| トリガ | `test:e2e` 挙動 |
|---|---|
| PR 作成・push (label なし) | workflow は起動するが job-level `if:` で skip → check status は SKIPPED (GitHub は SKIPPED を required の success として扱う) |
| PR に `e2e` label を後付け | `pull_request.types: [labeled]` で workflow が再評価され、job が実行される |
| PR commit push (label あり) | `pull_request.types: [synchronize]` で workflow が再評価され、job が実行される |
| `main` への直接 push | 常時実行 (最終 safety net) |

### 「`e2e` label を付けるべき PR」の判断軸

人間判断のオーバーヘッドを下げる目的で、判断基準は別途 skill として明文化される (`.claude/skills/decide-e2e-label/...` 系)。基本方針:

- **付ける**: `app/src/**` の変更 (Payload config / collections / endpoints / hooks / access)、`.github/workflows/**` の変更、`app/Dockerfile` の変更
- **付けない**: `docs/**` のみ、root docs (`README.md` / `SECURITY.md` / `CLAUDE.md`) のみ、`.claude/skills/**` のみ、`packages/cms-client/**` のみ
- **保留**: 上記カテゴリが混在、または判定不能 — user に振る

### `e2e` label の付け方

```bash
gh pr edit <PR_NUMBER> --add-label "e2e"
```

label 追加後、`Actions` タブで `CI — e2e` workflow が起動することを確認する。

### よくある失敗

- **`e2e` label を付け忘れて UI / collection 変更を merge してしまう**: 後追いで `gh pr edit <N> --add-label "e2e"` を叩くと workflow が再評価され起動する。merge 後でも `main` push 時の e2e で safety net が効くが、回帰検出が遅れるため事前付与が望ましい
- **`e2e` label が付いた PR を `test:e2e` 完了前に merge してしまう**: `test:e2e` が required に含まれない構成のため、技術的には merge 可能。`e2e` label 付き PR の merge 前に Actions タブで完了確認する運用で対処する

## Secret rotation

トライアル段階から本番運用までで導入する全 secret に対して、漏洩・退職・定期更新時に安全に値を入れ替える手順をまとめる。**事前にドリル検証していない rotation 手順は本番インシデント中に動くとは限らない** ため、最初の本物 secret を導入する前にここを固める。

対象範囲:

- `PAYLOAD_SECRET` — Payload の JWT 署名鍵
- `DATABASE_URL` — managed Postgres の接続文字列 (role password を含む)
- `STORAGE_*` — S3 互換オブジェクトストレージの access key / secret key
- `SMTP_*` — メール送信用 SMTP credential
- GitHub Actions secrets — CI / バックアップ workflow が使う credential

「ローテートしたつもりで実は古い credential が生きている」状態を作らないことが目的。各 secret の保管場所・番号付き rotation 手順・rotation 後の検証ステップを必ず通す。

### `gh secret set` の安全な渡し方 (本セクション共通)

`gh secret set <NAME> --body "<VALUE>"` や `echo "<VALUE>" | gh secret set <NAME> --body-file -` のように **値をコマンドライン引数または echo に入れて渡す** と、シェル履歴に平文で残る。共有環境で実行すると履歴経由で漏洩しうる。本セクションの `gh secret set` 例は **インタラクティブ入力前提** で書く:

```bash
# TTY 実行: gh が stdin から値を読み取り、入力中エコーされず履歴にも残らない
gh secret set <NAME>

# スクリプト経由: read -rs + mktemp の組み合わせで全段でリーク経路を塞ぐ
read -rs SECRET                            # 画面エコーなし。シェル履歴にも入らない
SECRET_FILE=$(mktemp)                       # /tmp/tmp.XXXXXX 形式の一意パス。固定パス /tmp/secret は race / 予測攻撃の対象になりうる
printf '%s' "$SECRET" > "$SECRET_FILE"      # ファイルに値を書き出す
gh secret set <NAME> < "$SECRET_FILE"       # gh が stdin から読み取る
shred -u "$SECRET_FILE" && unset SECRET     # ファイルを上書き削除し、変数も解放
```

### ドリル: `PAYLOAD_SECRET` (実施記録 2026-05-09)

最初の本物 secret 投入前に、無害な値で経路をリハーサルした記録。本番値導入時はこの手順をなぞる。

#### 対象保管場所 (本書執筆時点)

| 保管場所 | 状態 | 備考 |
|---|---|---|
| `app/src/payload.config.ts` (consumer) | `process.env.PAYLOAD_SECRET` で参照 | rotation 時に編集する場所ではない |
| `app/.env.example` | キー名のみ記載、値はブランク | rotation 対象外 (テンプレ) |
| 各開発者ローカル `app/.env` | gitignored | 各自で更新 |
| `.github/workflows/ci.yml` | リテラル文字列 (CI runner ローカル限定 dummy) | GH Actions secret 化完了後にリテラル直接編集パスは廃止される |
| Vercel env (Production / Preview) | 未配備 | リモート配備完了後に追加 |

#### ドリル手順と結果

1. **新値生成** — `openssl rand -base64 32` をローカル実行。
   - 結果: 標準出力に 1 行 base64 文字列が出力される。値は記録に残さない (secret なので)。`.env.example` 記載のとおり 32+ chars 要件を満たす。
2. **ローカル `app/.env` の値を新値に置換** → `pnpm dev` 再起動。
   - 結果: dev server が secret 由来のエラーなく起動完了 (Payload は起動時に `secret` 必須チェックを通すのみで、値の内容自体は正常起動を妨げない)。
3. **古いセッションの無効化検証** — admin UI に既存ログインで再アクセス。
   - 期待: 古い JWT は新 secret で decode 失敗 → 401 → ログイン画面にリダイレクト。
   - 結果: リモート配備で admin user が確定してから再検証。本ドリルでは「値置換後にサーバが起動した」までを確認した。
4. **CI workflow 側の rotation** — `.github/workflows/ci.yml` のリテラルを置換するパスを確認。
   - 結果: `grep -n "PAYLOAD_SECRET" .github/workflows/ci.yml` で 2 箇所 hit (`test:int` / `test:e2e` job)。GH Actions secret 化完了後はリテラル直接編集パスは廃止される。
5. **Vercel env 側の rotation** — 未配備のため walkthrough のみ。
   - 期待手順: Production scope 先 → Preview scope 後の順で `vercel env rm --yes` → `vercel env add`。Production を先に切るのは Preview の検証中ユーザーが古い token で詰まる時間を最短化するため。
   - 結果: Vercel 配備完了後にこの順序で再ドリル必要。

#### 学び / 改善点

- ドリル時点での live 検証可能範囲は **ローカル `app/.env`** のみ。Vercel 配備と GH Actions secret 化完了後に該当環境を追加してこのドリル節を更新する。
- CI workflow 内の dummy リテラルは「CI runner ローカル限定の dummy」だが、本物の secret 導入後に「dummy か real か」の判別コストが上がる。**GH Actions secret 化** を **Vercel 配備** より先に終わらせる順序が妥当。

### `PAYLOAD_SECRET`

JWT 署名に使われる。値が変わると既存セッションが全て invalidate され、ユーザーは再ログインが必要になる。

#### 保管場所

- 各開発者ローカル `app/.env`
- `.github/workflows/ci.yml` (リテラル — GH Actions secret 化完了後に廃止)
- (将来) Vercel env vars Production scope (Vercel 配備完了後)
- (将来) Vercel env vars Preview scope (同上 — Production と別値にする)

#### Rotation 手順

1. 新値を生成: `openssl rand -base64 32` (32+ chars random)。
2. 環境別に値を入れ替える (順序: GH Actions → Vercel Production → Vercel Preview → ローカル の順。Production を先に切るのは Preview の検証中ユーザーが古い token で詰まる時間を最短化するため):
   1. **GH Actions secret** (GH Actions secret 化完了後): `gh secret set CI_PAYLOAD_SECRET` を TTY で実行 (上記「`gh secret set` の安全な渡し方」参照)、または UI から更新
   2. **Vercel Production** (Vercel 配備完了後): `vercel env rm PAYLOAD_SECRET production --yes` → `vercel env add PAYLOAD_SECRET production` → 値を貼り付け
   3. **Vercel Preview** (同上): 同上 (`production` を `preview` に置換)
   4. **ローカル**: 各開発者が自分の `app/.env` を編集 (Slack 等で「rotation したので各自更新してください」と通知)
3. 反映: GH Actions は次回 workflow run、Vercel は redeploy (`vercel --prod`)、ローカルは `pnpm dev` 再起動。

#### Post-rotation 検証

- [ ] Vercel preview URL で admin にログインできる (新 JWT が発行される)
- [ ] Vercel preview の admin に古い browser session で再アクセス → ログイン画面にリダイレクトされる
- [ ] 直近の CI workflow run が green
- [ ] 各開発者が `pnpm dev` 起動成功を Slack 等で報告

### `DATABASE_URL` (Neon role password)

Postgres 接続文字列。Neon role password の rotation はこの URL に含まれる password 部分を更新する作業。

#### 保管場所

- 各開発者ローカル `app/.env` (ローカル開発は `app/docker-compose.yml` の Postgres を使うため、本番 Neon の URL とは別物)
- (将来) Vercel env vars Production scope (Vercel 配備完了後)
- (将来) Vercel env vars Preview scope (同上 — Production と別 role / 別 DB を推奨)
- (将来) GitHub Actions secrets — backup workflow 用 (backup workflow 導入後)

#### Rotation 手順

1. **Neon dashboard** にサインイン → 対象プロジェクト → `Roles` ページ。
2. 対象 role (例: `app`) の `Reset password` を実行。新パスワードを生成し、新 connection string を取得する (Neon UI が提示する `postgresql://...` 形式の URL をそのまま使う)。
3. 環境別に値を入れ替える:
   1. **Vercel Production**: `vercel env rm DATABASE_URL production --yes` → `vercel env add DATABASE_URL production`
   2. **Vercel Preview**: 同上 (Preview 用 role / DB を別途用意している場合はそちらの URL を使う)
   3. **GH Actions backup secret**: `gh secret set BACKUP_DATABASE_URL` を TTY で実行
4. Vercel redeploy → 直後の DB アクセスが成功することを確認。

#### Post-rotation 検証

- [ ] Vercel preview で admin が DB を伴う操作 (collection 一覧表示など) を実行できる
- [ ] 旧 password で接続を試みる → 失敗することを Neon dashboard の audit log で確認
- [ ] backup workflow を `workflow_dispatch` で 1 回手動実行 → 成功することを確認 (backup workflow 導入後)

### `STORAGE_*` (S3 互換オブジェクトストレージ)

メディア配信用バケットへの read/write credential。`STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` のペア。

#### 保管場所

- 各開発者ローカル `app/.env`
- (将来) Vercel env vars Production scope (ストレージ adapter 配線完了後)
- (将来) Vercel env vars Preview scope (同上 — 同一バケット参照可、token 自体は別発行を推奨)
- (将来) GitHub Actions secrets — backup workflow 用に backup bucket scope の別 token (backup workflow 導入後)

#### Rotation 手順

1. **ストレージ vendor dashboard** で対象 token を `Roll` または `Delete + Create new` で再発行。
2. 旧 token は revoke する前に新 token を環境に投入し、両方有効な状態で切り替える (downtime ゼロ rotation)。
3. 環境別に新 token を投入:
   1. **Vercel Production**: `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` の両方を更新 (`vercel env rm <KEY> production --yes` → `vercel env add <KEY> production` を 2 キー分繰り返す)
   2. **Vercel Preview**: 同上
   3. **GH Actions backup secret** (backup workflow 導入後): backup bucket scope 用の `BACKUP_STORAGE_*` 2 キーを `gh secret set` で更新
4. 反映確認後、vendor dashboard で旧 token を revoke。

#### Post-rotation 検証

- [ ] Vercel preview の admin から新規メディアをアップロード → ストレージに保存され、`<MEDIA_DOMAIN>` (設計上のメディア配信ホスト名) 経由で配信される
- [ ] 既存メディア URL が引き続き解決される (バケット側の object permission 設定に変更がないことを意味する)
- [ ] backup workflow を 1 回手動実行 → backup bucket に新 dump が現れる

### `SMTP_*` (メール送信)

`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS`。`SMTP_PASS` だけが secret 性が高い (host / user は公開可)。

ローカル開発は本番 SMTP vendor を使わない想定 (mailpit 等の SMTP catcher、もしくは vendor が提供する dev 用 sandbox API key)。**本 rotation 手順は本番経路のみ扱う**。ローカル開発側 SMTP 値の管理は本書の対象外。

#### 保管場所

- (将来) Vercel env vars Production scope (Resend 配線完了後)
- (将来) Vercel env vars Preview scope (同上)

#### Rotation 手順

1. **Resend dashboard** で SMTP credential を再発行。新 `SMTP_PASS` を取得 (vendor によっては `SMTP_USER` も再発行)。
2. 環境別に新値を投入:
   1. **Vercel Production**: `SMTP_PASS` (および必要なら `SMTP_USER`) を更新 (`vercel env rm <KEY> production --yes` → `vercel env add <KEY> production`)
   2. **Vercel Preview**: 同上
3. Vercel redeploy。
4. 旧 credential を Resend dashboard で無効化。

#### Post-rotation 検証

- [ ] Vercel preview で forgot-password を発火 → 検証用アドレスに実メールが届く
- [ ] Resend dashboard の送信ログに該当メール送信の記録がある
- [ ] 旧 credential での SMTP 認証が失敗することを Resend dashboard の audit log で確認

### GitHub Actions secrets (CI / backup)

- `CI_PAYLOAD_SECRET` (GH Actions secret 化完了後に追加)
- `BACKUP_DATABASE_URL` (backup workflow 導入後に追加)
- `BACKUP_STORAGE_ACCESS_KEY_ID` / `BACKUP_STORAGE_SECRET_ACCESS_KEY` (同上)

#### 保管場所

- repo Settings → Secrets and variables → Actions のみ

#### Rotation 手順

1. **新値を生成**: 対象に応じて `openssl rand -base64 32` または vendor dashboard から再発行。
2. **secret を更新**: `gh secret set <NAME>` を TTY で実行 (本セクション冒頭「`gh secret set` の安全な渡し方」参照) または UI から更新。
3. 旧値を消す方式は 2 通り。GH Actions secret は同名で複数値を持てない (常に単一値で `gh secret set` 実行で即上書き)。
   - **同名上書き** — 新値が全 workflow で動作することを事前確認した上で `gh secret set <NAME>` で上書き。downtime ゼロだが事前確認が必須
   - **別名併設 → 移行 → 削除** — 例: `<NAME>_NEW` を新値で `gh secret set` し、各 workflow を `<NAME>_NEW` 参照に書き換え、最後に `gh secret delete <NAME>` で旧 secret を削除。workflow 群を段階的に切り替えたいときに使う
4. 直近の workflow を `workflow_dispatch` で 1 回手動実行 → green を確認。

#### CLI 例

```bash
# 値はインタラクティブ入力 (TTY 検出時、gh は stdin を待つ。入力中エコーされず履歴にも残らない)
gh secret set CI_PAYLOAD_SECRET

# スクリプト経由は本セクション冒頭「`gh secret set` の安全な渡し方」の read -rs + mktemp パターンに従う
# (空ファイル経路のリスクと race / 予測攻撃の両方を塞ぐため、mktemp 単体ではなく read -rs と組み合わせる)

# 確認 (値は表示されない、設定の存在のみ)
gh secret list
```

#### Post-rotation 検証

- [ ] CI workflow が次回 PR / push で green
- [ ] backup workflow を `workflow_dispatch` で 1 回手動実行 → backup bucket に新 dump が現れる

### よくある失敗

- **複数環境のうち 1 つだけ rotation し忘れる** — Production だけ更新して Preview を放置するなど。本書のチェックリストを上から順に潰す。
- **rotation 中の downtime ゼロを狙って両方有効化したまま旧値を revoke し忘れる** — 新値の動作確認後、必ず vendor dashboard で旧値を明示的に無効化する。
- **古い JWT が残っている browser からのアクセスを「正常」と勘違い** — `PAYLOAD_SECRET` rotation 後は古い JWT は decode 失敗するはず。「ログインしたままになっている」場合は rotation が反映されていない (Vercel redeploy 漏れなど)。
- **`gh secret set <NAME> --body "<VALUE>"` でシェル履歴に値が残る** — 「`gh secret set` の安全な渡し方」セクション参照。共有環境では絶対に避ける。

## Vercel + Neon 初期セットアップ

トライアル段階の admin 配備で Neon (managed Postgres) を DB に、Vercel を deploy 先に置く。本セクションは vendor 固有の ID / DSN / credential を repo に書かないために、すべて placeholder ベースで手順を記載する。実値は Vercel UI / Neon UI で都度入力する。

リモート配備が完了するまでは「Secret rotation」セクション内の `(将来) Vercel 配備完了後` マーカーが残るが、本セットアップが終わったタイミングでマーカーを外して該当環境を rotation 対象に追加する。

### 前提

- GitHub repo の admin 権限を持つアカウント (Vercel との Git 連携で installation 承認が必要)
- Neon の team / personal アカウント (個人アカウントを使う場合、退職リスクを避けるため将来的に team アカウントへ移行する旨を `docs/HISTORY.md` に記録する)
- Vercel の team / personal アカウント (同上)
- ローカルに `vercel` CLI を導入済み (`pnpm dlx vercel --version` で確認可)。CLI を使わず Vercel UI のみで完結させる場合は不要

vendor アカウントが個人 1 人に紐づく状態は `CLAUDE.md` 2-2「シングルポイント障害を作らない」に抵触する。少なくとも本セットアップ完了直後に「アカウント所有者が抜けた場合の引き継ぎ手順」を別途文書化する。

### 手順 1: Neon プロジェクト + DB 払い出し

1. Neon dashboard にサインイン → `Create Project` を実行。
   - Project name: `<NEON_PROJECT>` (例: コミュニティ名 + `-cms-trial` 等。public repo に書かない)
   - Postgres version: 最新安定版 (Neon が default で提示する版)
   - Region: 配信先ユーザーから geographically 近いリージョン
2. プロジェクト作成直後に default で `main` branch / `<DATABASE_NAME>` DB / `<DB_OWNER_ROLE>` role が払い出される。dashboard の `Connection Details` から **pooled connection string** を取得し、`postgresql://...` 形式 (scheme + role + password + Neon host + DB 名 + `sslmode=require`) の値を控える。
   - Vercel のような serverless ランタイムからは pooled (PgBouncer) 経由を推奨。direct connection は migration / 一括書き込み用に別途控える。
3. (任意 / 推奨) Production と Preview で別 DB を分離するため、Neon の `Branches` 機能で `<NEON_PREVIEW_BRANCH>` を作成する。Preview branch は本番データを汚染せず schema 互換性確認に使える。
4. `Roles` タブで application 用の role (`<APP_ROLE>`) を別途作成し、必要最小限の権限のみ付与する。owner role は migration / DDL 専用にし、ランタイムは `<APP_ROLE>` で接続する構成を推奨。
5. ここで取得した connection string は `DATABASE_URL` として Vercel 側に投入する。値をローカルファイルに保存しない (clipboard → Vercel UI へ直接貼る)。

### 手順 2: Vercel プロジェクト払い出し + GitHub repo へのリンク

1. Vercel dashboard にサインイン → `Add New...` → `Project` を実行。
2. `Import Git Repository` で本 GitHub repo を選択 (Vercel GitHub App の installation 権限が必要。private org の場合は org admin から承認をもらう)。
3. Project name: `<VERCEL_PROJECT>` を設定。
4. Framework preset: `Next.js` が自動検出される。
5. Root Directory: `app/` を指定 (本 repo は monorepo 構成で Next.js app が `app/` 直下にある)。
6. Build / Output 設定はデフォルトのまま。`pnpm` lockfile が repo root にあるため、Vercel は `pnpm install` を自動選択する。
7. Environment Variables の入力は手順 3 で行うため、ここでは空のまま `Deploy` を押下せず、一旦 `Skip` または最小値で先に作成する (project だけ作って env 投入後に redeploy する流れ)。
8. 作成完了後、Vercel project 設定の `Git` タブで本 repo の `main` branch が `Production Branch` になっていることを確認する。

### 手順 3: Vercel env vars 投入

`app/.env.example` に列挙されているキーのうち、Phase 1 の admin トライアルで必要なものを投入する。STORAGE / SMTP 系は対応 vendor (S3 互換ストレージ / メール送信 SaaS) の配線が完了したタイミングで追加する想定で、本セットアップでは投入しない。

#### Phase 1 で投入する key

| key | scope | 値の出処 |
|---|---|---|
| `DATABASE_URL` | Production / Preview | 手順 1 で取得した Neon connection string。Production と Preview で別 branch を分けた場合はそれぞれ別値 |
| `PAYLOAD_SECRET` | Production / Preview | `openssl rand -base64 32` で生成した 32+ chars random。Production と Preview は別値 |
| `NEXT_PUBLIC_SERVER_URL` | Production | 本配備後の本番 URL (`https://<VERCEL_PRODUCTION_HOST>`)。Preview scope は preview URL が deploy 毎に変わるため Vercel 提供の `VERCEL_URL` system env を内部で参照する設計に倒すか、Preview には設定しない |
| `COOKIE_DOMAIN` | Production | 本配備後の本番ホスト名 (`<VERCEL_PRODUCTION_HOST>`)。Preview は ephemeral host のため設定しない (Cookie は host-only として発行される) |
| `ALLOWED_ORIGINS` | Production / Preview | カンマ区切り。Production は本番 origin、Preview は preview URL を含む allow-list (Vercel `VERCEL_URL` を build 時に展開する設計を取らない場合は wildcard 排除のため明示列挙) |
| `AUTH_TOKEN_EXPIRATION_SEC` | Production / Preview | JWT 有効期間 (秒)。許容レンジ 3600 (1h) ~ 86400 (24h)。admin 用途は短めが推奨で、標準 7200 (2h) |
| `AUTH_MAX_LOGIN_ATTEMPTS` | Production / Preview | 連続ログイン失敗回数のロック閾値。許容レンジ 3 ~ 10。標準 5 |
| `AUTH_LOCK_TIME_MS` | Production / Preview | ロック継続時間 (ミリ秒)。許容レンジ 300000 (5min) ~ 3600000 (1h)。標準 900000 (15min) |
| `AUTH_PASSWORD_MIN_LENGTH` | Production / Preview | パスワード最小長。admin 用は 12 以上必須、推奨 16 |
| `RATE_LIMIT_LOGIN_MAX` | Production / Preview | 単位時間あたりのログイン試行上限。許容レンジ 5 ~ 20。標準 10 |
| `RATE_LIMIT_LOGIN_WINDOW_MS` | Production / Preview | rate limit の判定ウィンドウ (ミリ秒)。許容レンジ 60000 (1min) ~ 900000 (15min)。標準 300000 (5min) |
| `UPLOAD_MAX_FILE_SIZE_BYTES` | Production / Preview | アップロード最大バイト数。コミュニティ写真共有想定で 10485760 (10MB) ~ 52428800 (50MB)。標準 20971520 (20MB) |
| `UPLOAD_ALLOWED_MIMETYPES` | Production / Preview | カンマ区切り MIME タイプ。標準は画像のみ `image/png,image/jpeg,image/webp` (実行可能形式・任意バイナリは含めない) |

組織固有の最終決定値を別途運用ドキュメントで管理している場合はそちらを優先する。本表の標準値は public 利用想定の安全側デフォルト。

#### 投入しない key (vendor 配線完了後に追加)

`STORAGE_*` / `MEDIA_PUBLIC_URL` / `SMTP_*` / `MAIL_FROM_*` は対応 vendor (S3 互換ストレージ / Resend) 配線完了後に投入する。先に key だけ Vercel に登録すると「未配線なのに値が見える」状態になり、誤って参照するコードが merge されうるため、配線が終わるまで Vercel 側にも登録しない。

#### 投入方法 (CLI)

values を shell history に残さないため、`vercel env add` を TTY で実行し、対話的に値を貼り付ける:

```bash
# プロジェクト link を一度だけ実施 (project root で 1 回)
pnpm dlx vercel link

# scope 別に投入。コマンドが対話的に値入力を促す。クリップボードから貼り付け、Enter で確定。
pnpm dlx vercel env add DATABASE_URL production
pnpm dlx vercel env add DATABASE_URL preview
pnpm dlx vercel env add PAYLOAD_SECRET production
pnpm dlx vercel env add PAYLOAD_SECRET preview
# ... 上表の残り key も同様
```

scope は 3 種類 (`production` / `preview` / `development`)。本セットアップでは `production` と `preview` の 2 scope を埋める。`development` scope は Vercel CLI でローカル `vercel dev` を使う開発者向けで、本 repo は `pnpm dev` (Docker Compose + Next.js) でローカル開発するため空のままでよい。

#### 投入方法 (UI)

CLI を使わない場合は Vercel project の `Settings` → `Environment Variables` から同じ scope 指定で 1 key ずつ追加する。値はテキストフィールドに直接貼り付ける。

### 手順 4: 動作確認

1. **push-to-deploy 確認**: 任意の branch (例: `chore/vercel-trial-smoke`) に空 commit を push し、PR を起こす。Vercel が PR に preview URL コメントを自動投稿することを確認する (`https://<VERCEL_PROJECT>-<HASH>-<TEAM>.vercel.app` 形式)。
2. **preview deploy ログ確認**: Vercel dashboard の `Deployments` から該当 deployment を開き、build / install / next build がすべて success になっていることを確認する。
3. **admin user 作成**: 初回のみ admin user を作成する必要がある。preview URL の `/admin` を開き、Payload の first-user 作成画面が表示されることを確認 → 検証用メールアドレスとパスワードを入力して登録。
4. **admin login 確認**: ログアウト → 再度 `/admin` にアクセスしログイン画面が表示されること、登録した credential でログインできること、ログイン後に admin 画面 (Dashboard) が表示されることを確認する。
5. **Production deploy 確認**: PR を `main` に merge し、Vercel が `Production` deployment を起動することを確認する。Production URL (`https://<VERCEL_PRODUCTION_HOST>`) で同じ admin login が成立することを確認する。

### よくある失敗

- **Vercel build が `Cannot find module 'next'` で失敗**: Root Directory が `app/` に設定されていない。Project Settings → General → Root Directory で `app/` を指定する。
- **`/admin` で 500 が返る**: `DATABASE_URL` が未設定 / 接続失敗。Vercel deployment ログの runtime logs で Postgres エラーが出ていないか確認する。Neon 側で IP allowlist を有効にしている場合は Vercel からの接続が拒否されるため、IP allowlist を解除するか Vercel の outbound IP を許可する。
- **preview URL で admin login が「Invalid email or password」になる**: admin user は **deployment ごとの DB に紐づく**。Preview と Production で別 DB (Neon branch 分離) を使っている場合、それぞれで初回 admin user 作成が必要。
- **CSRF / CORS で admin UI が静的アセットしか描画しない**: `ALLOWED_ORIGINS` に preview URL が含まれていない、または Production でのみ origin を設定して Preview で空になっている。Preview scope の `ALLOWED_ORIGINS` を更新する。
- **同一 origin で複数の admin が同時セッションを取れない**: Cookie の `secure` / `sameSite` 設定がローカル前提のままになっている可能性。`docs/coding-standards.md` の Cookie 設定方針に従って production 設定を確認する。

## Vercel + Neon rollback 手順

deploy が壊れた / DB 状態を巻き戻したい / 緊急で公開を止めたい状況の手順。シナリオ別に独立して読めるよう書く。

### シナリオ 1: deploy がアプリ側 bug で壊れた

直前まで動いていた状態に戻すのが目的。とるべき手は 2 通り、状況に応じて使い分ける。

#### 手順 A: 直前の green commit に `git revert`

bug を含む commit が特定済みで、コードレベルで戻したい場合:

1. ローカルで対象 commit を `git revert <COMMIT_SHA>` する (merge commit の場合は `-m 1` を付ける)。
2. PR を作成 → CI green を確認 → merge する。
3. Vercel が `main` への push を検知して自動的に新 Production deployment を起動する。新 deployment が active になった時点で旧 (壊れた) deployment は外される。
4. Production URL で動作復帰を確認する。

bug 修正の正式 PR を後追いで起こす場合も、まずは revert で公開状態を戻し、修正は別 PR として独立させる。

#### 手順 B: Vercel UI で旧 deployment を再昇格 (Promote to Production)

revert PR を待つ余裕がない場合、または bug commit が複数絡んでいて単純な revert で戻せない場合:

1. Vercel dashboard → 対象 project → `Deployments` タブを開く。
2. 直前の安定 deployment (green、status `Ready`) を選択する。
3. deployment 詳細画面の `...` メニューから `Promote to Production` を実行する。
4. Vercel が当該 deployment の build artifact を Production alias (`https://<VERCEL_PRODUCTION_HOST>`) に再割り当てする (再 build は走らない)。
5. Production URL で動作復帰を確認する。
6. **後続作業として必須**: その後 `main` への新規 push があると、Vercel は再び `main` を Production として deploy し、Promote した旧 deployment は再び外れる。`main` を壊れた状態のままにせず、bug 修正 PR (または revert PR) を必ず merge してコードと Production state を一致させる。

### シナリオ 2: deploy 自体を一時停止したい

env 設定ミスを調査中など、新 commit が自動 deploy されると困る場合。

#### 手順 A: Production Branch 切り替えによる事実上の deploy 停止

最も影響が小さい止め方。Production deploy だけ止めて Preview deploy は維持できる。

1. Vercel dashboard → 対象 project → `Settings` → `Git`。
2. `Production Branch` を `main` から空 / または存在しない branch 名 (例: `frozen`) に切り替える。
3. これ以降 `main` への push は Preview deploy としてのみ扱われ、Production alias は固定される。
4. 復旧時は Production Branch を `main` に戻す → 直近 commit を Production deploy するか、`Promote to Production` で任意 deployment を昇格する。

#### 手順 B: GitHub Integration を一時切断

push 自体を Vercel に拾わせたくない場合。

1. Vercel dashboard → 対象 project → `Settings` → `Git` → `Disconnect Git Repository`。
2. 切断中は GitHub からの自動 deploy は発生しない。手動 deploy (`vercel --prod`) のみ可能。
3. 復旧時は同画面から再連携する。連携を再開しても過去の commit は遡って deploy されない。

切断するとブランチ毎の preview URL も止まるため、調査作業を Preview 上で続けたい場合は手順 A の方が向く。

### シナリオ 3: Neon DB の状態を巻き戻したい

migration 失敗 / 誤った一括更新などで DB を任意時点に戻したい場合。Neon は branch / Point-in-Time Restore (PITR) を提供する。

#### 手順 A: Neon Branch を使った巻き戻し (推奨)

本番 DB を直接巻き戻すのではなく、戻したい時刻の snapshot から branch を切り、新 branch を新しい Production DB として採用する。本番 branch は痕跡として残せるため、調査が後追いで可能。

1. Neon dashboard → 対象プロジェクト → `Branches` タブ → `Create Branch`。
2. `Parent branch` を Production の現行 branch、`Time travel` で戻したい時刻 (UTC) を指定する (`<RESTORE_TIMESTAMP>`)。
3. 新 branch の connection string (`postgresql://...` 形式、host 部分が新 branch 用ホストに変わる) を取得する。
4. Vercel Production scope の `DATABASE_URL` を新 branch の値に更新する (`vercel env rm DATABASE_URL production --yes` → `vercel env add DATABASE_URL production` → 値貼り付け)。`vercel env add` も TTY 入力により値が shell history に残らない原則に従う (本書「Secret rotation」セクション冒頭で `gh secret set` を例として詳述している原則と同じ)。
5. Vercel を `vercel --prod` で redeploy する (env 変更は次回 deploy で反映)。
6. Production URL で巻き戻された状態を確認する。
7. 旧 branch は数日間保持し、原因調査が完了したら `Delete Branch` で削除する。

#### 手順 B: Point-in-Time Restore (Restore in place)

巻き戻し先の時点で本番 branch を上書きしたい場合 (現行 branch を historical state に巻き戻す)。

1. Neon dashboard → 対象プロジェクト → `Backups & Restore` → `Restore`。
2. 戻したい時刻 (`<RESTORE_TIMESTAMP>`) を指定する。
3. 復元範囲 (Production branch) を選び、`Restore` を実行する。Neon が新しい head に置き換える。
4. connection string は既存と同じため Vercel env 更新は不要。Vercel を redeploy する必要もないが、connection pooler のキャッシュを切り替えるため `vercel --prod` で 1 回 redeploy するのが確実。
5. Production URL で巻き戻された状態を確認する。

手順 A と異なり旧状態は復元時刻以降の差分が失われる。差分を調査用に残したい場合は手順 A を選ぶ。

### シナリオ 4: 緊急 take-down

credential 漏洩 / 不正アクセス検知 / 法的要請など、即座に公開を止めて credential も使えなくする必要がある場合。**初動 5 分で打てる手** から並べる。

1. **Vercel project を非公開化** — Vercel dashboard → 対象 project → `Settings` → `Deployment Protection` → `Vercel Authentication` を有効化。これで全 deployment (Production / Preview 含む) が Vercel ログインなしではアクセスできなくなる。DNS や Production alias を変えずに即座に外部からの accessibility を切れる。
2. **Neon role password を即時 rotation** — Neon dashboard → `Roles` → 対象 role の `Reset password`。漏洩した接続文字列を即座に無効化する。手順は本書「Secret rotation」セクション → `DATABASE_URL` (Neon role password) を参照し、Vercel env 更新まで完了させる。
3. **Payload secret を rotation** — JWT も漏洩している前提で、`PAYLOAD_SECRET` も同時に rotation する。手順は「Secret rotation」セクション → `PAYLOAD_SECRET` を参照。これで漏洩した token / セッションが全て invalidate される。
4. **GitHub repo の write 権限見直し** — credential 漏洩経路として GitHub access token / collaborator アカウントの可能性がある場合、GitHub repo の Settings → Collaborators / Deploy keys / Actions secrets を棚卸しし、不要なものを revoke する。
5. **事後対応**: Vercel Authentication を解除する前に、(1) 漏洩経路の特定、(2) credential 全件 rotation 完了、(3) 不正操作の有無の audit log 確認、を完了させる。Vercel deployment logs / Neon query history / GitHub audit log を相互照合する。

`Vercel Authentication` 有効化はユーザー体験を完全に止めるため、完全 take-down が必要なケース専用とする。部分的な絞り込みで足りる場合 (特定 origin だけ拒否したい等) は手順 2「Production Branch 切り替え」または application 側 `ALLOWED_ORIGINS` の絞り込みで対処する。

### よくある失敗

- **revert PR を起こしたが Vercel が壊れた deployment を Production に置いたまま**: revert PR が `main` に merge されていない (draft のままなど)。`main` への merge を確認する。緊急時は手順 B (`Promote to Production`) で先に Production を戻し、revert PR は後追いする。
- **Promote to Production 後に bug が再発した**: `main` への新規 push が走り、Vercel が再び `main` を Production にした。「シナリオ 1 手順 B」末尾の「後続作業として必須」を参照。
- **Neon Branch 切り戻し後も古いデータが見える**: Vercel が古い `DATABASE_URL` で deploy されたままになっている (env 変更が次回 deploy で反映されるため)。`vercel --prod` で redeploy する。
- **Take-down 中に Vercel Authentication を切ったが credential 鳥かごから漏洩 token が再利用された**: `PAYLOAD_SECRET` rotation が漏れている。Take-down の手順 3 を必ず通す。
- **Take-down 解除タイミングの判断ミス**: 漏洩経路が特定できないまま Vercel Authentication を解除すると同じ攻撃が再発する。事後対応 3 項目をチェックリストとして必ず潰してから解除する。

## PocketBase upstream の四半期 due diligence

trial 期間中の CMS バックエンドとして採用している PocketBase の upstream 状態を、**四半期に 1 回** 観測して記録する手順。観測結果は private file に蓄積し、発火条件に該当する変化が見つかった時点で stack 移行検討用の別 Issue を起こす運用。

### 目的

vendor 信頼性を採用前 / 採用中に評価せず、後から運用方針を曲げる事態 (CLAUDE.md §1 Phase 2 の根本失敗パターン) を再演しないため。採用判断の根拠と「何が変わったら見直すか」を repo / private storage に明文化し、判断材料を個人の頭に閉じない (CLAUDE.md §2-2 シングルポイント障害排除)。

trial 段階では既に以下の mitigation が組まれているため、upstream に変化があっても**即時の運用停止リスクは低い**:

- `packages/cms-client` 境界 (CLAUDE §5-1) — 公開サイトは Domain 型のみ参照し、PocketBase 固有の REST / 型に縛られない
- SQLite 標準 SQL ベース — `.dump` で schema / data を他 RDBMS (Postgres / MySQL 等) に持ち出せる
- Pattern B (SSG-split) — 公開サイト訪問者は VPS / PocketBase に到達しない (ビルド時 fetch のみ)
- off-VPS backup (`docs/RUNBOOK.md` 別運用、#42 で整備) — vendor 障害から独立して復旧可能

本セクションはこれら mitigation を前提に、「採用継続 / 移行検討」の switch を四半期で押し直す運用手順を定義する。

### 前提

- 観測担当者は GitHub UI または `gh` CLI で public な GitHub repo / Security Advisories を閲覧できる
- private snapshot 保管先 (`designs/private/vendors.md` の PocketBase 章) が手元に同期されている (`designs/private/` は gitignored、メンバー間別途同期)
- 観測結果は **diff 形式** で残す — 「前回 snapshot との差分」が判定の主入力になるため、過去 snapshot を上書き消失させない

### レビュー timing

四半期末: **3 月末 / 6 月末 / 9 月末 / 12 月末**。trial 期間中は省略しない。Phase 3 移行後の継続要否は別途判断する (本セクションの対象外)。

### 観測項目 (snapshot するもの)

各四半期で以下 5 項目を観測し、`designs/private/vendors.md` の PocketBase snapshot 章を更新する。

1. **直近 90 日の release / commit 活動**
    - 確認源: `gh api repos/pocketbase/pocketbase/releases?per_page=30` / `gh api repos/pocketbase/pocketbase/commits?per_page=30`
    - 観測軸: 月 1 release 以上、commit cadence が活発 (週単位で複数 commit があるか)
2. **未解決の critical / high severity security advisory**
    - 確認源: `gh api repos/pocketbase/pocketbase/security-advisories` または `https://github.com/pocketbase/pocketbase/security/advisories`
    - 観測軸: 未解決 (`state` が `published` のまま未パッチ) の高深刻度件数。既知の medium 以下は記録のみで判定材料には含めない
3. **v1.0 roadmap の進行**
    - 確認源: `https://github.com/orgs/pocketbase/projects/2` (public project board)
    - 観測軸: 完了済み issue / 残 issue / 直近 stage の動き。前回 snapshot との diff
4. **直近 6 ヶ月の breaking change**
    - 確認源: minor バージョン (`v0.NN.0`) リリースの release notes
    - 観測軸: 本プロジェクトで利用している経路 (REST API / SQLite schema / `packages/cms-client` 内の adapter) に影響する変更の有無。手動 migration が必要になる変更は要評価
5. **財政・sponsorship 状況**
    - 確認源: maintainer の public 発言 (GitHub discussion / blog / sponsor page)、`https://github.com/sponsors/ganigeorgiev`
    - 観測軸: 採用継続に影響しうる大きな変化 (助成終了 / 主要 sponsor 撤退 / commercial 化宣言 / archive 宣言など)。**具体額や個人特定情報は public doc に書かない** — private snapshot 内に留める

### 手順

1. 上記 5 項目を順番に確認し、各項目について「前回 snapshot からの変化」を 1-2 行で記述する
2. `designs/private/vendors.md` の PocketBase snapshot 章を **追記** する (既存 snapshot は履歴として残す)。snapshot 取得日を section heading に入れる
3. 5 項目の総合判定として「採用継続 OK」または「採用見直し必要」を 1 段落で記述
4. 「採用見直し必要」と判定された場合のみ、次の「発火条件」セクションに従って後続アクションを起こす

snapshot は private に閉じるが、**「四半期確認を実施した事実」自体は公開 doc に記載してよい** (`designs/05` の VPS 集約 threat model などで「定期確認による属人化排除」として参照)。

### 発火条件と起こすべき action

snapshot 結果のうち以下のいずれかに該当した場合、本プロジェクトでの採用継続を見直し、stack 移行検討を別 Issue として開始する:

- **release 停止**: PocketBase の last release が **60 日以上** 停止している (patch / minor ともに)
- **upstream archive 宣言**: maintainer が repo の archive / 開発終了を公的に宣言
- **対応不可能な breaking change**: 本プロジェクトが利用している経路 (REST API / SQLite schema / 認証フロー) に、`packages/cms-client` 境界レイヤだけでは吸収不能な変更が入った
- **重大な security advisory**: critical / high severity の未解決 advisory が直近 30 日以内に発生し、upstream で対応 PR / branch が示されていない

上記いずれかに該当した場合の action:

1. **別 Issue を起票** — タイトル例 `[stack] PocketBase 採用見直し: <発火条件>`、priority urgent、AC に「移行先候補の評価 + 移行手順 draft + go/no-go 判定」を含める
2. **移行先候補の参照** — `designs/private/vendors.md` の B 章 (escape hatch 候補) を参照。第 1 候補 / 第 2 候補の事前評価が記録されている前提で、本 Issue では「現状観測との差分」だけを評価すればよい
3. **#42 (DR / バックアップ) との接続** — F-5 (PocketBase upstream maintain 停止シナリオ) の移行手順を実行可能性レベルで確認

### snapshot 保管場所の参照

詳細な snapshot データは `designs/private/vendors.md` (gitignored、各メンバーが個別保管) の PocketBase 章を参照する。本書には `designs/private/` の具体内容や vendor の特定情報を転載しない。

### 既知の bus factor mitigation

upstream が単一 maintainer であることに起因する bus factor は、本プロジェクト側で以下の構造的措置により分散済み:

- **`packages/cms-client` 境界** (CLAUDE §5-1) — 公開サイトは PocketBase 固有 API を直接踏まないため、移行時の影響半径が `app/` 内に閉じる
- **SQLite portability** — `.dump` 経由で schema + data を別 RDBMS にエクスポート可能。データを vendor に握られない (CLAUDE §2-1)
- **Pattern B (SSG-split)** — 公開サイトはビルド時 fetch のみで PocketBase に依存せず動作する
- **off-VPS backup** (#42) — vendor 障害から独立した経路で復旧データを保持
- **escape hatch 候補の事前評価** — `designs/private/vendors.md` の B 章で第 1 / 第 2 候補とその切替工数を事前に明文化済み

これらにより、upstream の単一 maintainer 依存が即座に本プロジェクトの単一障害点にならない構造を維持する。

### よくある失敗

- **snapshot を上書きして履歴が消える**: `designs/private/vendors.md` の snapshot 章は **追記**。過去 snapshot は履歴として残す。前回 snapshot との diff が判定の主入力なため、消すと次回判定の根拠が失われる
- **public doc に snapshot の具体値 (現在の sponsorship 額、maintainer の個人発言の引用等) を書く**: CLAUDE §4 違反。public doc には「四半期確認している」事実のみを書き、具体値は `designs/private/vendors.md` に閉じる
- **発火条件に該当したが「観測当面」として様子見にする**: 発火条件は「別 Issue を起票する閾値」として定義済み。様子見にする判断自体を Issue 化し、判断根拠を残す
