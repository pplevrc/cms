# 02. 移行耐性レイヤの設計

## なぜこの設計が必要か

絶対原則 2-4「次の移行を前提に設計する」の構造的実装。
過去 2 回の Phase 移行（Google Spreadsheet → MicroCMS → Payload）が証明したのは、
**「永続的な CMS は存在しない」**という事実である。

Payload も例外ではない。3〜5 年後に別のスタックへ移る前提で、その時の影響半径を**コード構造で**制約する。

## 境界レイヤ: `packages/cms-client`

```
┌─────────────────────────────────────┐
│ 公開サイト (隣接リポジトリ)            │
│  import { fetchPosts, Post }        │
│    from '@<ORG>/cms-client'         │
└──────────────┬──────────────────────┘
               │  Domain 型 + fetch 関数のみ
               ▼
┌─────────────────────────────────────┐
│ @<ORG>/cms-client                   │  ◄── 移行耐性の境界
│  - Domain 型 (公開)                  │
│  - Raw 型 (internal)                 │
│  - Raw → Domain 変換                 │
│  - fetch / retry / timeout           │
└──────────────┬──────────────────────┘
               │  Payload REST (現在)
               ▼
┌─────────────────────────────────────┐
│ Payload (app)                  │
└─────────────────────────────────────┘
```

公開サイト側のコードは Payload を直接 `import` も `fetch` もしない。
データ取得は常に `@<ORG>/cms-client` を経由する。
これにより以下が成立する:

- Payload 移行時、公開サイト側のソースは原則無変更
- Domain 型を不変に保てば、`cms-client` の major bump も不要
- 「Payload に詳しい人」が公開サイト側に不要になる

## cms-client が含むもの・含まないもの

| 含める | 含めない |
|---|---|
| Domain 型（公開用に絞った型） | Payload Config 全体 |
| fetch 関数（list / find / search） | admin UI ロジック |
| URL 構築ロジック | write 系 API（公開サイトは read のみ） |
| Raw → Domain 変換 | DB スキーマ |
| エラー / リトライ / タイムアウト | 認証ロジック |
| | secret デフォルト値 |
| | 具体的な endpoint パス（env vars 経由） |

「公開サイト側で実行されたら困るもの」「Payload に依存する詳細」「機密値」は一切含めない。

## Raw 型と Domain 型の分離規約

### Raw 型 (`src/types/generated.ts`)

- `payload generate:types` の出力をそのままコピー
- **手動編集禁止**
- CI で自動再生成・上書き
- **`export` してはならない**（cms-client 内部からのみ参照可能）

### Domain 型 (`src/types/domain.ts`)

- 公開サイトが扱いやすい形に成形した型
- 例: Lexical JSON ではなく `bodyHtml: string`
- 例: `relationship` は depth=0 で ID にせず、必要なフィールドだけ展開
- Payload が内部管理用に持つメタフィールド（例: `_status` というドラフト状態フラグや、`updatedAt` の細部）は Domain 型に含めない

### 変換関数 (`src/fetchers/<entity>.ts`)

```typescript
import type { Post as PostRaw } from '../types/generated';
import type { Post } from '../types/domain';

function toDomain(raw: PostRaw): Post {
  return {
    id: raw.id,
    title: raw.title,
    bodyHtml: lexicalToHtml(raw.body),
    publishedAt: new Date(raw.createdAt),
    authorName: typeof raw.author === 'object' ? raw.author.name : '',
  };
}
```

Raw → Domain は**全 fetcher で必須**。
「Raw をそのまま返す fetcher」は禁止。Payload 依存が公開サイト側に漏れる。

## fetcher の責務

各 fetcher は以下を担う:

1. URL 構築（クエリパラメータ含む）
2. fetch 実行（timeout, retry, AbortSignal 対応）
3. Raw レスポンスを Domain 型に変換
4. ページネーション情報を `PaginatedResponse<T>` 形式に正規化

詳細な実装規約: [.claude/skills/add-cms-client-fetcher/SKILL.md](../.claude/skills/add-cms-client-fetcher/SKILL.md)

## バージョニング規約

| bump | 条件 |
|---|---|
| major | Domain 型の breaking change |
| minor | 後方互換な機能追加（新 fetcher 等） |
| patch | バグ修正、内部実装変更 |

`app` のバージョンとは**独立**。
Payload 内部実装の変更は cms-client の patch、Domain 型変更は major。

## 管理者用エクスポート endpoint との関係

管理者ロールのみアクセスできる JSON dump endpoint は**移行発生時の脱出口**。
具体パスは env vars で管理し、本ドキュメントには記述しない。
cms-client の対象ではない（admin 用なので）。
admin が JSON dump を取得 → 別 CMS へインポート、というフローを想定する。

## 「やってはいけない」具体例

| ❌ NG | ⭕ OK |
|---|---|
| `import type { Post } from '@payload-types'` を公開サイト側で使う | `import type { Post } from '@<ORG>/cms-client'` |
| Domain 型に `_status` や Payload 内部フィールドを含める | 公開サイトに必要なフィールドだけに絞る |
| cms-client が `payload` パッケージを runtime 依存する | cms-client は HTTP 経由で REST のみ叩く |
| `cms-client` の Domain 型をいじって web 側修正で対応する | breaking change なら cms-client の major bump |
| `cms-client` の README に Payload の URL や endpoint 詳細を書く | 「community CMS の read API クライアント」とだけ |

## 移行時に何が起きるか（思考実験）

仮に **Payload → 自前 Headless** に移る場合:

1. `app` のコードはほぼ全捨て
2. `cms-client` の `fetchers/*.ts` の中身を新 API に合わせて書き換え
3. `cms-client` の **公開 API surface（types/domain.ts と index.ts）は無変更**
4. `cms-client` を patch / minor で publish
5. 公開サイトは再ビルド不要（次回ビルド時に自動取り込み）

このシナリオで step 3 が成立しない設計は、本リポジトリでは不採用。
