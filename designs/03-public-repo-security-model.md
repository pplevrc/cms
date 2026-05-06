# 03. Public Repo セキュリティモデル

## 前提と覚悟

本リポジトリは **public** である。public 化は以下の経済的制約から決定された:

- 公開サイトは静的サイトホスティング free 枠を使うため public 必須
- 本リポジトリはホスティングプランの collaboration を使うため public 必須

private 化は free tier 構成を放棄することを意味するため、選択肢に入らない。
代わりに、**public 前提で安全な構造**を作るという設計命題に置き換えて解く。

## 公開境界

### Repo に**含めて良い**

- アーキテクチャ・思想・運用手順
- Payload Collection の**スキーマ定義**（フィールド名・型・access ルール）
- CI/CD ワークフローの**形**（実 secret は環境変数 / GitHub Secrets 側）
- `<DOMAIN>`, `<ADMIN_DOMAIN>` 等の**プレースホルダー**

### Repo に**絶対含めない**

- 実 URL（admin の本物のドメイン、ストレージの実 endpoint、DB の実ホスト名）
- API Token, Access Key, Password, Secret
- 編集者の email アドレス・氏名・identifier
- DB の本番テーブル構造の詳細スナップショット
- 認証パラメータの**具体値**（ロックアウト窓、rate limit の閾値、minLength など）
- 自前で追加したカスタム endpoint の**具体パス**
- 採用ベンダー名・課金プラン・bucket 構成・DB 接続戦略
- `console.log` が拾った request オブジェクト全体

「コミットしようとしたが本当に公開していいか」を**書く前に**自問する。
**運用パラメータは env vars に、固有名詞・組織情報・具体値は `designs/private/` (gitignored) に置き、本リポジトリのコミット対象には参照のみ書く**。

## 内部実装の隠蔽: cms-client は private

cms-client 自体は機能的には public でもよい設計だが、**意図的に private package** とする:

- Payload REST URL 構築規則
- リトライ戦略
- 認可フロー前提

これらが攻撃者の偵察コストを上げる材料となる。
公開しても致命的ではないが、「攻撃者の自動探索を遅らせる」ための層。

## 脅威モデル

```
攻撃面                                          想定攻撃                      主たる対策の方向性
──────────────────────────────────────────────────────────────────────────────────────────────
①コードリーディング                            脆弱性発見、internal API 探索   最小限露出 + cms-client private
②認証エンドポイント                            brute force / credential stuffing  rateLimit + アカウントロック
③secret 漏洩                                  commit ミス、log 出力、PR 履歴   push protection + 規律 + log filter
④CI/CD 経路                                  pull_request_target 誤用、token 抜取  permissions 最小化 + PRT 禁止
⑤DB / Storage 直接                           IP/Token 推測、scope 過剰         scope 限定 + rotate + 経路分離
```

具体パラメータ値は env vars で管理し、本ドキュメントには記述しない。

## 各攻撃面への対応方針

### ① コードリーディング

- README / コメント / docstring に**実値**を書かない
- error message に DB 構造・internal path を含めない
- public API の URL 例は `https://example.com/...` を使う
- cms-client は private にして偵察コストを上げる

### ② 認証エンドポイントへの brute force / credential stuffing

要件（具体値は env vars / 運用文書）:

- パスワードに最低長を要求（ポリシーは env vars で）
- 連続失敗回数を上限化し、超過でアカウントを一定期間ロック
- ログイン endpoint に rate limit を適用（閾値は env vars）
- email enumeration 対策: パスワードリセット応答は存在不問で常に 200

実装側の責務:

- Payload `auth.password.minLength` / `auth.maxLoginAttempts` / `auth.lockTime` を env vars から読み込む
- `rateLimit` をログイン endpoint に適用、閾値・window は env vars から
- パスワードリセット handler の応答を常に成功扱いに統一

### ③ secret 漏洩

| 経路 | 対策 |
|---|---|
| `.env` の commit | `.gitignore` で `.env*` を除外、`.env.example` のみコミット（**キー名のみ、値は記載しない**） |
| log 出力 | `console.log(req)` 系の全オブジェクト出力禁止、構造化ログのみ |
| PR コメント | secret 形式値を含む PR は merge 前に rebase で除去 |
| GitHub Actions log | secret は env vars 経由、`echo $SECRET` 禁止 |

GitHub 側設定（ユーザー作業、Claude Code 範囲外）:
- Secret scanning + Push protection
- Branch protection (main, PR 必須, status check 必須)
- Dependabot alerts + security updates
- Private vulnerability reporting

### ④ CI/CD 経路

```yaml
# 各 job の permissions を最小化
permissions:
  contents: read
  packages: write       # publish job のみ
  pull-requests: write  # コメント追加が必要な job のみ

on: pull_request                # ← OK
# on: pull_request_target       # ← 原則禁止
```

`pull_request_target` を使う場合は理由をコメントで明記する。

### ⑤ DB / Storage 直接

要件（具体実装は運用文書）:

- ストレージ bucket への public access を無効化、配信は独自ドメイン経由のみ
- API token は最小スコープで発行（書き込み用 / バックアップ用 / 配信用などを分離）
- DB password は十分な長さで生成し、定期 rotate
- DB 接続は serverless 環境で効率的な経路を選択（pooler 等）
- アプリ用 DB role は DML のみ（DDL 不要なら剥奪）
- バックアップ保存先は本番データの保存先と**別系統**

## 環境別の secret 分離

ホスティングプラットフォームの env vars を **Production / Preview / Development** で別系統:

- Production: 本番 DB / Storage / SMTP
- Preview: PR 用 sandbox（または完全 mock）
- Development: 個人ローカル（commit しない）

「Preview に Production secret を流す」は禁止。Preview から漏洩した secret で Production に到達できる構造を作らない。

## バックアップの分離

データエクスポート endpoint と DB バックアップは**別経路**:

- アプリ層エクスポート endpoint: 管理者のみ、JSON、CMS 内データ全件
- インフラ層バックアップ: DB ダンプ、定期自動、専用ストレージ・専用 token

片方が侵害されてもバックアップ復元の経路が残ることを担保する。

## AI 実装規律との対応

CLAUDE.md §4 の 8 項目は本ドキュメントの脅威モデルから逆算されたもの。

| AI 規律 | 対応する脅威 |
|---|---|
| `.env` を生成しない | ③ |
| 実 secret 形式を書かない | ① ③ |
| プレースホルダーを使う | ① |
| error に DB 構造を含めない | ① |
| 全オブジェクト log 禁止 | ③ |
| access 未定義禁止 | Payload デフォルト全許可（脅威拡張） |
| CORS/CSRF を `*` にしない | ② |
| Cookie `secure: false` 禁止 | session hijack |

## レビューと自己検証

実装後、`.claude/agents/security-reviewer.md` を起動して当該変更を脅威モデルに照らす。
**Claude Code 自身が違反を検出することを設計に組み込む**。
