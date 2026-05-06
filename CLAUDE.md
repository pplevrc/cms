# Community CMS — Claude Code 向け思想ドキュメント

このリポジトリでコードを書くすべての AI エージェントは、本ドキュメントを起動時に必ず読むこと。
**思想に反する実装は、機能要件を満たしていても不採用**である。

本ドキュメントは「どう判断するか（思想）」を扱う。
具体的な設計判断の根拠は [designs/](./designs/) に、実装手順は [.claude/skills/](./.claude/skills/) にある。

---

## 1. 過去経緯（思想の根拠）

このプロジェクトはコミュニティ運営サイト CMS の **3 度目の実装**である。
過去 2 回の失敗が、以下すべての設計原則の根拠になっている。

| Phase | 構成 | 失敗 |
|---|---|---|
| 1 | Google Drive + GAS + Spreadsheet | 個人 Google アカウント設定変更で全体が壊れた |
| 2 | MicroCMS（現状） | 無料枠制約で「全員編集」を諦める判断を強いられた |
| 3 | Payload セルフホスト（本リポジトリ） | — |

「過去経緯を知らない判断」は本プロジェクトでは無効である。
迷ったら必ず Phase 1 / Phase 2 で何が壊れたかに立ち返って判断すること。

---

## 2. 絶対原則

**すべての実装判断はこの 4 原則に従う。** 機能要件と衝突したら原則を優先する。

### 2-1. データの所有権をプラットフォームに握らせない

- ベンダーロックイン回避
- 任意のタイミングで全データをエクスポート可能な状態を維持する
- スキーマ・変換ロジックを repo 内に保持する

**実装上の帰結**: 管理者専用のデータ全件エクスポート endpoint は機能ではなく**設計要件**。後回しにしない。具体パスは `.env`/環境変数で管理する。

### 2-2. シングルポイント障害を作らない

- **個人アカウント依存禁止**（Phase 1 の教訓）
- **単一サービス無料枠依存の最小化**（Phase 2 の教訓）
- 1 人がボトルネックになる運用フロー（env vars 編集など）を残す場合、必ず代替手段を併設する

**実装上の帰結**: secret rotation 手順 (`docs/RUNBOOK.md`) が無い実装は未完成。

### 2-3. スキーマと変換ロジックを履歴として残す

- `docs/migrations/` に過去スキーマと変換ルールを蓄積する
- 「現状の Payload Collection 定義」だけ見ても、過去とどう違うか分からない状態にしない

### 2-4. 「次の移行」を前提に設計する

- Payload も永遠ではない
- データレイヤを薄く保ち、別 CMS / DB / ホストへ乗り換え可能にする
- これは整理整頓ではなく**構造的要件**。`packages/cms-client` が境界の物理的実装

**実装上の帰結**: 公開サイト側から Payload 固有型・URL・挙動が見える設計はリジェクト対象。詳細は [designs/02-migration-resilience.md](./designs/02-migration-resilience.md)。

---

## 3. 補助優先順位（迷ったとき）

絶対原則で決着しない場合、以下の優先順で判断する。

1. **無料維持** — 月額コストが発生する選択をしない
2. **移行耐性** — Payload 固有機能に web 側を縛らない
3. **public repo 前提** — secret や internal endpoint URL を repo に含めない
4. **非エンジニア親和** — メール+パスワードで完結、技術的前提を要求しない
5. **少人数エンジニアの運用** — 1 人ボトルネックを作らず PR ベース運用
6. **ホスティングプランの制約** — env vars 編集はプラットフォームオーナー 1 人前提（コードは少人数協業）

---

## 4. AI 実装規律（public repo であることに起因する遵守事項）

このリポジトリは **public** であるため、以下は**例外なく守る**。違反する実装は提案段階でリジェクトする。

1. `.env` ファイルを生成しない（`.env.example` のみ）
2. テスト・ドキュメントに本番相当の secret 形式値（実 URL・実 Key）を書かない
3. README やコメント例には `<DOMAIN>` 等のプレースホルダーまたは `example.com` を使う
4. error message に DB 構造・internal path を含めない
5. `console.log(req)` のような全オブジェクト出力を書かない
6. Payload Collection の `access` を未定義のまま実装を進めない（デフォルトは全許可）
7. CORS / CSRF を `*` で実装しない
8. Cookie の `secure: false` を本番設定に含めない

実装中、自分のコードがこれらに該当しないか**書く前に**確認する。
レビュー時は [.claude/agents/security-reviewer.md](./.claude/agents/security-reviewer.md) を起動する。

---

## 5. 隣接リポジトリとの関係

```
[本リポジトリ (CMS, public)] ──publish──► @<ORG>/cms-client (private package)
                                                       │
                                                       ▼
                                       [公開サイトリポジトリ (web, public)]
```

### 5-1. cms-client が唯一の境界

公開サイト側から見えるのは `@<ORG>/cms-client` の Domain 型と fetch 関数のみ。
Payload の Raw 型・REST URL・認証フローは `cms-client` 内部に閉じる。
両リポジトリは **private npm registry 経由でしか繋がらない**ことを設計上の不変条件とする。
詳細は [designs/02-migration-resilience.md](./designs/02-migration-resilience.md)。

### 5-2. ローカル併設環境について

開発者が公開サイト側リポジトリを本リポジトリと同じ親ディレクトリに併設している場合、
AI が read-only で参照できる場合がある（`.claude/settings.local.json` で個別に設定）。
これは個人環境の便宜であり、本リポジトリの正式な依存関係ではない。
コード・ドキュメント・コミットメッセージなど共有成果物に**ローカルパスや具体的な隣接リポジトリ名を書かない**こと。

---

## 6. ドキュメント・ナビゲーション

| 用途 | 場所 | 公開 |
|---|---|---|
| 思想・AI 遵守事項（本書） | `CLAUDE.md` | ◯ |
| 設計判断の根拠（Why） | `designs/*.md` | ◯ |
| 実装テンプレート・手順（How） | `.claude/skills/*/SKILL.md` | ◯ |
| Phase 1 実装スコープ・DoD・推奨順序 | `docs/implementation-plan.md` | ◯ |
| コーディング規約（詳細版） | `docs/coding-standards.md` | ◯ |
| 過去経緯・意思決定の履歴（実装後に追記） | `docs/HISTORY.md` | ◯ |
| 運用手順（secret rotation, バックアップ復元） | `docs/RUNBOOK.md` | ◯ |
| 過去スキーマ記録 | `docs/migrations/*.md` | ◯ |
| public repo 用のセキュリティポリシー | `SECURITY.md` | ◯ |
| **具体値・固有名詞・組織情報** | `designs/private/*.md` | ✗ (gitignored) |
| **具体タスク・DoD・実装順序** | `designs/private/tasks.md` | ✗ (gitignored) |
| **具体 adapter 設定 / workflow YAML** | `designs/private/templates/*` | ✗ (gitignored) |

迷ったときの読む順:
1. **CLAUDE.md（本書）— 思想**
2. **designs/ — 設計判断の根拠**
3. **docs/implementation-plan.md — 何を / いつ作るか**
4. **.claude/skills/ — 実装テンプレート**
5. **具体値が必要になったら `designs/private/`**（ローカルでのみ参照可）

`designs/private/` の存在は前提で書かれているが、本リポジトリには含まれない。
チームメンバーは別途同期する（同期手段は `designs/private/README.md` に記述）。

---

## 7. AI 用ツール

`.claude/` 配下に以下を配置している。該当タスクで活用すること。

### Agents（レビュー用）

- [security-reviewer](./.claude/agents/security-reviewer.md) — §4 の遵守事項 + 公開リポ脅威モデルに対する自動レビュー
- [migration-resilience-reviewer](./.claude/agents/migration-resilience-reviewer.md) — `cms-client` 境界レイヤの侵食を検出

### Skills（実装支援）

- [add-payload-collection](./.claude/skills/add-payload-collection/SKILL.md) — Collection 追加時の必須要素（access 明示、`createdBy` hook 等）
- [add-cms-client-fetcher](./.claude/skills/add-cms-client-fetcher/SKILL.md) — fetcher 追加時の Raw→Domain 変換規約

---

## 8. 言語・コメント規約

- ドキュメント・コメントは日本語が一次言語（コミュニティ全体の慣習）
- 識別子・コード・コミットメッセージは英語
- JSDoc 形式コメントを優先（標準ツールチェーン互換）
