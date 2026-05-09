# 01. アーキテクチャ

## 全体像

```
┌──────────────────────────────────────────────────────────────────┐
│ 編集者                                                             │
│   ├ 非エンジニア  (CMS 編集のみ)                                    │
│   └ エンジニア    (CMS 編集 + コード保守)                            │
│   認証経路は 04-auth-strategy.md 参照                               │
└────────────────┬─────────────────────────┬───────────────────────┘
                 │ 編集                     │ コード変更
                 ▼                         ▼
        ┌──────────────────┐   ┌──────────────────────────┐
        │ Payload CMS      │ ◄ │ 本リポジトリ (public)       │
        │ on Hosting plan  │   │  app (Payload)            │
        │ <ADMIN_DOMAIN>   │   │  packages/cms-client      │
        └────────┬─────────┘   └──────────────┬───────────┘
                 │ 保存                       │ tag push
                 ▼                            ▼
   ┌──────────────────────────┐   ┌──────────────────────────┐
   │ managed Postgres         │   │ private npm registry      │
   │ + S3 互換オブジェクト       │   │ @<ORG>/cms-client (priv)  │
   │ストレージ                  │   │                           │
   └──────────────────────────┘   └──────────────┬───────────┘
                                                 │ npm install
                                                 ▼
                                  ┌──────────────────────────┐
                                  │ 公開サイト (public)        │
                                  │ Static site generator     │
                                  │ <DOMAIN>                  │
                                  └──────────────────────────┘
```

具体ベンダーは運用文書（非公開）で管理する。本ドキュメントには記述しない。

## リポジトリ分離

両 repo とも **public**:

- 公開サイト: 静的サイトホスティングの free 枠が public 限定
- 本リポジトリ: ホスティングプランの collaboration が public 限定

代償として、機密性は private package `@<ORG>/cms-client` に内部実装を閉じ込めることで担保する。

## monorepo 構造（pnpm workspaces）

```
<本リポジトリ>/
├── app/                             # Payload + Next.js (THE app)
│   └── src/
│       ├── app/(payload)/           # Payload routes
│       ├── collections/             # Users, Members, Events, Posts, Media
│       ├── globals/
│       ├── access/                  # 共通 access 関数
│       ├── hooks/                   # 共通 hooks (createdBy 等)
│       ├── endpoints/               # custom endpoints (admin 用)
│       └── payload.config.ts
├── packages/
│   └── cms-client/                  # @<ORG>/cms-client
│       └── src/
│           ├── types/
│           │   ├── generated.ts     # Payload 自動生成型(internal)
│           │   ├── domain.ts        # 公開 Domain 型
│           │   └── index.ts
│           ├── fetchers/            # public surface
│           ├── lib/                 # client, url
│           └── index.ts
├── designs/                         # 設計判断の根拠
├── docs/                            # 運用手順 / 履歴 / 過去スキーマ
└── .github/workflows/               # ci, publish-package, backup
```

## 責務の境界

### app

- Payload の admin UI と REST API を提供
- 認証・認可・DB スキーマ・storage adapter を持つ
- 直接の consumer は **編集者のみ**（公開サイトではない）

### packages/cms-client

- 公開サイトに対する**唯一の interface layer**
- Payload Raw 型を内部に閉じ、Domain 型と fetch 関数のみ export
- 移行発生時の影響半径を定義する境界線
- 詳細: [02-migration-resilience.md](./02-migration-resilience.md)

### 公開サイトリポジトリ (隣接)

- `@<ORG>/cms-client` を npm install して使う
- CMS の DB / Storage 層の存在を知らなくて済む状態を維持する

## 技術スタックの選定基準

具体ベンダーは運用文書で管理する。本ドキュメントは**選定基準**のみ記述する。

| 層 | 選定基準 |
|---|---|
| CMS | TypeScript first / セルフホスト可 / access 制御が明示的 / Next.js 互換 → **Payload 3.x** |
| Framework | Payload 3.x が前提 → **Next.js (App Router)** |
| DB | free tier / pooler 提供 / `pg_dump` 互換のエクスポート可 / 標準 Postgres ドライバ |
| Storage | free tier / S3 互換 / カスタムドメイン配信可 |
| Mail | SMTP 互換（プロバイダ差し替え容易） |
| Deploy | Next.js 互換 / public repo collaboration が無料枠で可能 |
| Pkg distribution | private npm registry を無料で利用可 |

選定はすべて「無料維持」「移行容易性」「少人数エンジニアで運用可能」の 3 条件を満たす最小構成。

## 「次の移行」シナリオに対する備え

| シナリオ | 影響を受ける範囲 | 担保 |
|---|---|---|
| Payload → 別 CMS | `app/` 全部 + `cms-client` の fetcher 内部 | Domain 型は不変、公開サイトは再デプロイ不要 |
| DB ベンダー変更 | DB 接続文字列のみ | adapter で抽象化、connection string 差し替えのみ |
| Storage ベンダー変更 | storage 設定のみ | S3 互換 interface で抽象化 |
| ホスティング変更 | Dockerfile + env vars 移行 | Dockerfile を初期から同梱（検証用） |
| npm registry 変更 | `.npmrc` + publish workflow | registry URL 差し替えのみ |

すべて「設定差し替えのみで移行可」を維持する設計。
