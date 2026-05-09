# RUNBOOK

運用手順を集約するドキュメント。エンジニア 1 人にしか実行できない手順を残さないために、誰が読んでも再実行できる形で記述する。

各セクションは独立して読めるよう、外部ドキュメントへの暗黙参照を避けて書く。

## ブランチ保護に CI チェックを必須化する

`main` への merge 前に CI の各 job (`typecheck` / `lint` / `secretlint` / `test:int`) を必須化する手順。`.github/workflows/ci.yml` で job 名が変わるたび、または job を追加するたびに本手順で required status check を更新する。

`test:e2e` は別 workflow (`.github/workflows/ci-e2e.yml`) に分離され、`e2e` label 付き PR と `main` push 時のみ起動する。required status check には含めない (詳細は次セクション「test:e2e の label-based gate」参照)。

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
6. (運用ノート) `test:e2e` は required に**含めない**。条件付き起動 workflow を required にすると、起動しない PR で「待ち」が永続し merge 不可になる。`e2e` label を付けた PR では `test:e2e` 結果を merge 前に必ず確認する運用で代替する (詳細は次セクション)。
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

| トリガ | `test:e2e` 起動 |
|---|---|
| PR 作成・push (label なし) | 起動しない (workflow 自体が job-level `if:` で skip。required status check 上にも現れない) |
| PR に `e2e` label を後付け | `pull_request.types: [labeled]` で workflow が再評価され起動 |
| PR commit push (label あり) | 起動 |
| `main` への直接 push | 常時起動 (最終 safety net) |

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
