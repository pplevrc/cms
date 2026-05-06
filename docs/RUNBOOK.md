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
