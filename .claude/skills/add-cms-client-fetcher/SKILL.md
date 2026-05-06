---
name: add-cms-client-fetcher
description: packages/cms-client に公開サイト向けの fetcher を追加するときに必ず使う実装手順。Raw 型と Domain 型の分離、変換関数の必須化、index.ts からの公開 surface の純化を強制する。新 Collection を公開サイト側から読みたい場合、新しいクエリパラメータを公開する場合、または既存 fetcher の Domain 型に変更を入れる場合に適用する。Collection 自体の追加は別途 add-payload-collection を使う。
---

# Add cms-client Fetcher

`packages/cms-client` に新しい fetcher を追加・変更するときの実装手順。
書き始める前に**全項目に目を通すこと**。

## 必読

- `CLAUDE.md` §2-4 (絶対原則「次の移行を前提に設計する」)
- `designs/02-migration-resilience.md` (境界レイヤ設計と Raw → Domain 分離規約)

## 大原則

> **「明日 Payload を捨てて自前 API に置き換えても、公開サイトのソースは 1 行も変わらない」**
> これが成立しない fetcher は不採用。

## 手順

### Step 1: 配置先

```
packages/cms-client/src/
├── types/
│   ├── generated.ts        # Payload 生成型 (internal, 編集禁止)
│   ├── domain.ts           # 公開 Domain 型
│   └── index.ts            # 型 re-export (Domain のみ)
├── fetchers/
│   └── <entity>.ts         # 新 fetcher はここ
├── lib/
│   ├── client.ts           # fetch wrapper
│   └── url.ts
└── index.ts                # 公開 API surface
```

### Step 2: Domain 型を先に決める（実装より重要）

`src/types/domain.ts` に**公開サイトが扱いやすい形**で型を定義する。
Payload の Raw 型をコピーして使うのではない。**設計判断**。

```typescript
// src/types/domain.ts
export interface Post {
  id: string;
  title: string;
  bodyHtml: string;        // Lexical JSON ではなく HTML 化済みを返す
  publishedAt: Date;       // string ではなく Date
  authorName: string;      // relationship を ID ではなく展開
}
```

設計時の自問:

- このフィールド、本当に公開サイトで使う？（不要なら削る）
- Payload 内部メタ (`_status`, `updatedAt` の細部、`docs[].id` 以外の Payload 系メタ) を含んでないか？
- Lexical JSON や Payload リレーションシップ生形を leak していないか？
- 別の CMS / API でも同じ shape を提供できるか？（できなければ Payload 依存）

### Step 3: 必須要素チェックリスト

新規 / 編集に関わらず、以下が**全て**満たされていることを確認する。

- [ ] Domain 型が `src/types/domain.ts` に定義され、`src/types/index.ts` から re-export されている
- [ ] Raw 型 (`generated.ts`) は `src/types/index.ts` から re-export されていない
- [ ] fetcher 内で `toDomain` 相当の変換関数が**必ず**呼ばれている
- [ ] fetcher は Raw 型を **return しない**
- [ ] fetcher は `AbortSignal` を受け取れる
- [ ] fetcher は timeout を持つ（`lib/client.ts` のデフォルトを継承で可）
- [ ] ページネーションは `PaginatedResponse<T>` 形式に正規化（Payload の `docs` / `totalDocs` 形をそのまま漏らさない）
- [ ] `src/index.ts` から fetcher と Domain 型のみ export
- [ ] `src/index.ts` から Raw 型 / URL 定数 / Payload 用語が含まれた識別子は export されていない
- [ ] runtime 依存に `payload` / `@payloadcms/*` が無い（`package.json` で確認）

### Step 4: テンプレート

```typescript
// src/fetchers/posts.ts
import type { Post as PostRaw } from '../types/generated';
import type { Post, ListQuery, PaginatedResponse } from '../types';
import { createCmsClient } from '../lib/client';

const DEFAULT_BASE_URL = process.env.CMS_PUBLIC_URL ?? '';

interface FetchOptions {
  baseUrl?: string;
  signal?: AbortSignal;
}

export async function fetchPosts(
  query: ListQuery = {},
  options: FetchOptions = {},
): Promise<PaginatedResponse<Post>> {
  const client = createCmsClient({
    baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
  });
  const raw = await client.get<RawListResponse<PostRaw>>('/api/posts', {
    params: query,
    signal: options.signal,
  });
  return {
    docs: raw.docs.map(toDomain),
    totalDocs: raw.totalDocs,
    page: raw.page,
    totalPages: raw.totalPages,
    hasNextPage: raw.hasNextPage,
  };
}

export async function fetchPost(
  id: string,
  options: FetchOptions = {},
): Promise<Post | null> {
  const client = createCmsClient({
    baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
  });
  const raw = await client.get<PostRaw | null>(`/api/posts/${id}`, {
    signal: options.signal,
  });
  return raw ? toDomain(raw) : null;
}

// internal
interface RawListResponse<T> {
  docs: T[];
  totalDocs: number;
  page: number;
  totalPages: number;
  hasNextPage: boolean;
}

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

### Step 5: 公開 API surface への登録

```typescript
// src/index.ts に追記
export { fetchPosts, fetchPost } from './fetchers/posts';
// 必要なら型も
export type { Post } from './types';
```

**重要**: ここで Raw 型 (`PostRaw`) や URL 定数 (`DEFAULT_BASE_URL`) を export してはならない。
Domain 型と関数のみ。

### Step 6: Domain 型の変更時はバージョン bump を判断

| 変更内容 | bump |
|---|---|
| 新 fetcher 追加、新 Domain 型追加 | minor |
| 既存 Domain 型のフィールド追加 (optional) | minor |
| 既存 Domain 型のフィールド削除 / 型変更 / リネーム | **major** |
| バグ修正、内部実装のみ変更 | patch |

major bump は公開サイト側の修正を要求するため、必ず変更履歴 (`CHANGELOG.md` 等) を残す。

### Step 7: 検証

```bash
pnpm --filter @<ORG>/cms-client typecheck   # strict pass
pnpm --filter @<ORG>/cms-client build        # ビルド成功
```

`src/index.ts` の出力を grep で確認し、Raw 型 / Payload 用語が漏れていないか:

```bash
# index.ts に Payload 用語が含まれていないか
grep -i "payload\|generated\|raw" packages/cms-client/src/index.ts
# → ヒットしないこと
```

## 違反したらどうなるか

- Raw 型を返す fetcher → 公開サイトが Payload 固有構造に依存、移行時に web 側修正必須
- Domain 型に Payload 内部メタが残る → 同上
- `index.ts` から Raw 型 export → 公開サイトが直接 Raw 型を使い始める可能性
- `payload` runtime 依存 → cms-client が Node 専用になる可能性、bundle 肥大、移行困難

## 完了後

`migration-resilience-reviewer` agent で当該 fetcher を確認してから commit する:

> 「`packages/cms-client/src/fetchers/posts.ts` を `migration-resilience-reviewer` でレビューして」

加えて、新規 fetcher が public API surface を増やしている場合は `security-reviewer` も走らせる。
