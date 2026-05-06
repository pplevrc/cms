# Coding Standards

`CLAUDE.md` §8 を補完する詳細規約。

## TypeScript

### Strict 設定

`tsconfig.json` で以下を有効化:

- `strict: true`
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`

### 禁止する型

理由なく以下を使わない:

- `any`
- `unknown` を **絞り込みなしで使う**こと
- `Record<string, any>`
- `Function`（具体的な signature を書く）

「ここは型がわからない」場合は `unknown` を使った上で型ガードで絞り込むか、
ドメイン特有の型を新設する。`any` は最終手段で、必ず `// eslint-disable` コメントで理由を残す。

### Domain 型と Raw 型の分離

`packages/cms-client` では:

- `payload generate:types` の出力は**そのまま外部公開しない**
- Raw 型 → Domain 型の変換は cms-client 内部に集約（詳細: `designs/02-migration-resilience.md`）
- `index.ts` から export してよいのは Domain 型と fetcher のみ

## Payload Collection

### access 明示

すべての Collection で `access` の `read / create / update / delete` を**明示定義**する。
未定義はデフォルト全許可となるため禁止。詳細: `.claude/skills/add-payload-collection/SKILL.md`。

### field-level access

`role` などの権限関連フィールドは `access.update` で admin のみ更新可とする。

## ログ・エラー

- `console.log(req)` のような全オブジェクト出力は**禁止**（secret 漏洩リスク）
- 構造化ログを使い、フィールドを明示的に選択
- error message に DB 構造・internal path を含めない

## ファイル名規約

| 対象 | ケース | 例 |
|---|---|---|
| Collection 定義 | PascalCase | `Users.ts`, `Posts.ts`, `Members.ts` |
| Global 定義 | PascalCase | `SiteConfig.ts` |
| その他 TS ファイル | camelCase | `setUserField.ts`, `clientConfig.ts` |
| React コンポーネント | PascalCase | `AdminBar.tsx` |
| 設定ファイル | kebab-case | `payload.config.ts`, `next.config.mjs` |
| Markdown ドキュメント | kebab-case | `implementation-plan.md` |

## コメント

### JSDoc 形式

公開 API・複雑なロジックは JSDoc 形式で書く:

```typescript
/**
 * 公開サイト用の Post 一覧を取得する。
 *
 * @param query - 検索条件・ページング
 * @param options - baseUrl・AbortSignal 等
 * @returns 正規化済み Domain 型のページネーション結果
 */
export async function fetchPosts(...) { ... }
```

### コメントは「Why」を書く

「何をしているか」はコードで自明なはず。
コメントが必要なのは「なぜこの実装にしたか」「ここを変えると何が壊れるか」など、
コードから読み取れない**意図**や**制約**。

## Import 規約

- 相対 import は同一 workspace 内のみ
- workspace 横断は package 名経由（`@<ORG>/cms-client`）
- 公開 surface（`packages/cms-client/src/index.ts`）から Raw 型・URL 定数を export しない

## Secret / 機密値

- `.env` を生成しない（`.env.example` のみコミット）
- 本番相当の secret 形式値（実 URL・実 Key）をテスト・ドキュメントに書かない
- README やコメント例には `<DOMAIN>` 等のプレースホルダーまたは `example.com` を使う
- 認証・rate limit・upload の防御パラメータ具体値はコードに直書きせず、`process.env.X` 経由

詳細: `CLAUDE.md` §4, `designs/03-public-repo-security-model.md`
