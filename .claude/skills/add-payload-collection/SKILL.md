---
name: add-payload-collection
description: 本リポジトリに新しい Payload Collection を追加するときに必ず使う実装手順。CLAUDE.md §4 (AI 実装規律) で要求される access 明示・createdBy hooks・field-level access・role-based 制御をテンプレートとして強制する。"Posts に X フィールドを足して" のような既存 Collection の編集にも適用する。新規 fetcher 追加が伴う場合は別途 add-cms-client-fetcher も使う。
---

# Add Payload Collection

新しい Collection を追加する／既存 Collection を変更するときの実装手順。
書き始める前に**全項目に目を通すこと**。

## 必読

- `CLAUDE.md` §4 (AI 実装規律 8 項目)
- `designs/03-public-repo-security-model.md` §各攻撃面への対応 (Collection レベルの脅威対応)

## 重要: 認証・運用パラメータの値を本ファイル/コードに直書きしない

`maxLoginAttempts` / `lockTime` / `tokenExpiration` / `rateLimit max,window` /
`password.minLength` / `upload.fileSize` / `mimeTypes` の許可リストなど、
**運用上の防御パラメータは具体値を public repo に commit しない**。
すべて `process.env.X` 経由で読み込むテンプレートにし、実値は `.env` （非コミット）で管理する。

## 手順

### Step 1: 配置先

```
app/src/collections/<PascalCase>.ts
```

ファイル名は **PascalCase**（`Posts.ts`, `Members.ts` など）。

### Step 2: 必須要素チェックリスト

新規 / 編集に関わらず、以下が**全て**満たされていることを確認する。

- [ ] `slug` が小文字複数形（`posts`, `events`, `members`）
- [ ] `access` が**明示定義**されている（read/create/update/delete 全て）
  - 認証必須なら `({ req: { user } }) => Boolean(user)` 等を明示
  - 公開読み取り可能なら `read: () => true` を明示
  - **未定義のまま残さない**（Payload デフォルトは全許可）
- [ ] 編集者が自分の作成エントリのみ更新可能なら `createdBy` field + field-level access
- [ ] `createdBy` / `updatedBy` を hooks で**自動付与**
- [ ] `role` 等の権限関連 field は `access.update` で admin 限定
- [ ] auth 系 collection は `auth.maxLoginAttempts`, `auth.lockTime`, password minLength を設定（**値は env vars 経由**）
- [ ] upload 系 collection は `upload.mimeTypes` (whitelist), `upload.fileSize` 上限を設定（値は env vars 経由）
- [ ] TypeScript strict で型エラーが出ていない（`any` 不使用）
- [ ] secret 形式値・本番ドメイン・防御パラメータ具体値がハードコードされていない

### Step 3: テンプレート（一般 Collection）

```typescript
import type { CollectionConfig } from 'payload';
import { setUserField } from '../hooks/setUserField';

export const Posts: CollectionConfig = {
  slug: 'posts',
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'body', type: 'richText' }, // Lexical
    { name: 'published', type: 'checkbox', defaultValue: false },
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      access: { update: () => false },
      hooks: {
        beforeChange: [setUserField()],
      },
    },
    {
      name: 'updatedBy',
      type: 'relationship',
      relationTo: 'users',
      access: { update: () => false },
      hooks: {
        beforeChange: [setUserField({ always: true })],
      },
    },
  ],
  access: {
    read: ({ req: { user } }) => {
      if (user) return true;
      return { published: { equals: true } };
    },
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => {
      if (!user) return false;
      if (user.role === 'admin' || user.role === 'moderator') return true;
      return { createdBy: { equals: user.id } };
    },
    delete: ({ req: { user } }) =>
      user?.role === 'admin' || user?.role === 'moderator',
  },
};
```

### Step 4: テンプレート（auth Collection）

防御パラメータはすべて env vars から読み込む。値はコミットしない。

```typescript
import type { CollectionConfig } from 'payload';

const requireNumber = (name: string): number => {
  const v = process.env[name];
  if (!v) throw new Error(`env var ${name} is required`);
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`env var ${name} must be a number`);
  return n;
};

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    tokenExpiration: requireNumber('AUTH_TOKEN_EXPIRATION_SEC'),
    maxLoginAttempts: requireNumber('AUTH_MAX_LOGIN_ATTEMPTS'),
    lockTime: requireNumber('AUTH_LOCK_TIME_MS'),
    cookies: {
      secure: true,
      sameSite: 'Strict',
      domain: process.env.COOKIE_DOMAIN,
    },
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'role',
      type: 'select',
      options: ['admin', 'moderator', 'editor'],
      defaultValue: 'editor',
      access: {
        update: ({ req: { user } }) => user?.role === 'admin',
      },
    },
  ],
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => user?.role === 'admin',
    update: ({ req: { user }, id }) =>
      user?.role === 'admin' || user?.id === id,
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
};
```

`.env.example` には `AUTH_TOKEN_EXPIRATION_SEC=`, `AUTH_MAX_LOGIN_ATTEMPTS=`,
`AUTH_LOCK_TIME_MS=`, `COOKIE_DOMAIN=` などの**キー名のみ**列挙する。
実値は運用文書（非公開）で管理する。

### Step 5: テンプレート（upload Collection）

mime whitelist / file size はカテゴリのみ示し、上限値は env vars 由来。

```typescript
import type { CollectionConfig } from 'payload';

const allowedMimeTypes = (process.env.UPLOAD_ALLOWED_MIMETYPES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const requireNumber = (name: string): number => {
  const v = process.env[name];
  if (!v) throw new Error(`env var ${name} is required`);
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`env var ${name} must be a number`);
  return n;
};

export const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    staticDir: undefined, // 外部 storage adapter で管理
    mimeTypes: allowedMimeTypes,
    fileSize: requireNumber('UPLOAD_MAX_FILE_SIZE_BYTES'),
    imageSizes: [], // 変換は配信側で行う
  },
  fields: [
    { name: 'alt', type: 'text', required: true },
    { name: 'caption', type: 'text' },
  ],
  access: {
    read: () => true, // 公開
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) =>
      user?.role === 'admin' || user?.role === 'moderator',
  },
};
```

### Step 6: payload.config.ts への登録

```typescript
import { Posts } from './collections/Posts';

export default buildConfig({
  collections: [
    /* ... */ Posts,
  ],
  /* ... */
});
```

### Step 7: 検証

```bash
pnpm --filter cms generate:types  # 型生成エラー無し
pnpm typecheck                     # strict pass
pnpm lint                          # pass
```

可能なら `pnpm dev` で admin にログインし、目視で:
- 新 Collection が表示されるか
- 認証必須の Collection に未ログインでアクセスできないか
- `createdBy` が自動的に埋まるか

### Step 8: cms-client 連携が必要な場合

新 Collection のデータを公開サイト側から取得したい場合は、別 skill `add-cms-client-fetcher` を使う。
**Collection 追加だけで自動的に公開サイト側から取れるようにはしない**（境界レイヤを通すため）。

## 違反したらどうなるか

- `access` 未定義 → デフォルト全許可で**全データが public API に露出**
- `createdBy` の field-level access 欠落 → 編集者が他人の作成元を書き換え可能
- auth 防御パラメータ未設定 / ハードコード → brute force に無防備、または防御値が公開される
- upload に mime whitelist 欠落 / 上限ハードコード → 任意ファイルアップロードや上限値開示

実装中、自分のコードがこれらに該当しないか**書く前に**確認する。

## 完了後

`security-reviewer` agent で当該 Collection を確認してから commit する:

> 「`app/src/collections/Posts.ts` を `security-reviewer` でレビューして」
