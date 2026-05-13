# HISTORY

意思決定と実装の経緯を時系列で記録する。「現状のコード / 設計を見ても分からない過去の判断」が対象。

各エントリは独立して読めるよう、外部参照は **canonical な doc 名 / Issue 番号** のみとし、暗黙の前提を持ち込まない。

---

## 2026-05-13 Vercel + Neon trial の decommission

### 背景

Phase 1 trial の deploy 戦略として、当初 Vercel (Next.js host) + Neon (managed Postgres) の組合せを採用した。`designs/01-architecture.md` の選定基準テーブル (free tier / pooler 提供 / `pg_dump` 互換) と、当時 visible だった Vercel の Next.js 配備の defacto 性に基づく判断だった。Issue #7 (`Set up remote admin trial on Vercel + Neon`) で trial 立ち上げ手順を `docs/RUNBOOK.md` に整備し、Neon project + Vercel project の payout 段階まで進めた。

### 判明した制約

実 ops 段階で 3 つの制約が顕在化した。

1. **Vercel Hobby の "non-commercial use" 規約**: 本プロジェクトは affiliated brand が物販活動を持つため、Hobby plan の規約に抵触する。Pro plan ($20/user/month) で解決はするが「trial 期間も常時課金」となり、無料維持 (CLAUDE.md §3-1) の方針と摩擦する。
2. **content moderation tolerance**: 公開コンテンツに二次創作 fan art (アニメキャラの水着・若年見えキャラ等の non-sexual 描写) を含む。Western SaaS の AUP + 法域 (米国 PROTECT Act §1466A / EU directive 2024/1385 等) で false positive / takedown リスクが運用負担となる懸念があり、日本 vendor + 日本リージョンの組合せが tolerance が高いと判断した。
3. **Phase 2 (MicroCMS) 教訓の再演リスク**: vendor 都合の plan / 規約変更で運用方針を曲げる事態は、過去の Phase 2 失敗と同じパターン。Vercel + Neon は trial 段階で同じ依存構造を踏むことになる。

### 判断

Issue #34 (`Re-evaluate Phase 1 trial vendor stack`) で vendor stack 全体を再評価し、以下の採用構成に切り替えた:

- **CMS**: PocketBase (Go 単一バイナリ / SQLite / MIT / Discord OAuth 内蔵)
- **Server**: Sakura VPS 石狩
- **DB**: SQLite (PocketBase native、`designs/01-architecture.md` の Postgres 縛りを trial スコープで緩和)
- **Object storage**: Sakura object storage
- **OAuth**: Discord (PocketBase 内蔵)
- **Pattern**: B (SSG-split。公開サイトは別 builder で静的化、build timing は CMS と分離)

不採用案の reason と判断根拠は Issue #34 closing comment と `designs/private/vendors.md` (gitignored) に詳細を記録。

### Decommission

採用しない vendor リソースは「将来の混乱・誤判断の温床」となるため、確実に decommission する。

- Vercel project + GitHub App integration を本 repo (`pplevrc/cms`) から外す
- Neon project (空 / `production` + `preview` branch、データなし) を削除
- 1Password 保管の trial 用 secret entries (Vercel / Neon の connection string) を archive

操作手順は Issue #45 (`Decommission Vercel + Neon trial surface`) の user-side ops checklist に従う。`docs/RUNBOOK.md` の "Vercel + Neon 初期セットアップ" / "Vercel + Neon rollback 手順" セクションは Issue #37 で PocketBase + Sakura VPS レシピに全置換される予定。

### 残された artefact

- **Vercel + Neon trial 関連の `docs/RUNBOOK.md` セクション** — Issue #37 で全置換予定
- **`designs/01-architecture.md` の選定基準テーブル** — Issue #35 で PocketBase + Sakura VPS + SQLite に整合する形に更新予定
- **Payload 採用前提の Issue 群 (#8 / #9 / #10 / #11 / #12 / #18 / #28 / #29)** — Issue #39 で PocketBase stack に対する適合性を再評価し、close / re-scope を判定予定
