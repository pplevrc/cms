# 04. 認証戦略

## なぜこの設計が必要か

Phase 1 (Google Drive + GAS) は個人 Google アカウントの設定変更で全体が壊れた。
Phase 2 (MicroCMS) は無料枠制約で「全員編集」を諦める判断を強いられた。
どちらも **「誰が member か」と「member が CMS にアクセスできる経路」が同じ vendor に握られていた** ことが共通の失敗点。

絶対原則 §2-2「シングルポイント障害を作らない」を auth レイヤで成立させるには、
**source of truth (会員リスト) と CMS access path (ログイン経路) を分離可能な構造で保つ** 必要がある。

## 採用する設計: Discord OAuth + cold-standby Email/Password

本コミュニティは private Discord server を会員コミュニケーションの場として既に運用している。
Discord server membership = 会員リスト の source of truth は既に存在する。

CMS access path として 2 経路を持つが、**通常運用は片方のみ active**:

```
通常運用 (Discord active)
  ┌────────────────────────┐
  │ Discord OAuth          │  ◄── primary
  │  + server membership   │       会員 = login 可能
  │    check (24h cache)   │
  └────────────┬───────────┘
               │ user resolution by discordId
               ▼
  ┌────────────────────────┐
  │ Users collection       │
  │  - email (forced 入力) │  ◄── 入力は強制、認証経路は dormant
  │  - password            │  ◄── placeholder hash (bcrypt; 平文破棄)
  │  - discordId (unique)  │
  │  - role                │
  └────────────────────────┘
```

```
災害時 (Discord 経路死亡 → admin が fallback mode 発動)
  ┌────────────────────────┐
  │ Email + Password       │  ◄── active (発動後)
  │  (全員 reset 後)        │
  └────────────┬───────────┘
               │
               ▼
  ┌────────────────────────┐
  │ Users collection       │
  │  - email               │
  │  - password (新値)      │  ◄── reset 後の正規 hash
  │  - discordId (保持)    │
  └────────────────────────┘
```

**通常運用** では Email + Password 経路は dormant (placeholder hash で実 login 不可)。
**災害時** に admin が「fallback mode」を発動すると、全 users に password reset メール送信 + login UI を Email + Password form に切替、で auth 経路が active になる。

これにより:

- Discord 健全 → 自動 onboarding/offboarding でゼロ admin 工数
- Discord 死亡 → 計画手順で email mode に切替、CMS access 維持
- どちらも「単一 vendor 完全依存」は構造上不可能

## トライアル段階のスコープ

トライアル段階のスコープは **Discord OAuth のみ**。fallback infra (email 強制収集 + placeholder hash + reset 配線) の投入完了は **本リリース必須前提条件** として扱う。

理由:

- 本番データなし (コンテンツ 0、利用者数人)、SPOF 顕在化のコストが本番より桁違いに低い
- 動作する経路 1 本に集中することで、トライアル段階の運用感確認を最短で回せる
- fallback infra の設計と動作確認は Discord OAuth 経路の動作確認後に独立して進められる

ゲート未達のまま本番投入することは絶対原則違反として扱う (`CLAUDE.md` §2-2)。

## 通常時の active 経路を Discord OAuth 1 本に絞る理由

cold-standby 構造は **通常時の admin 工数を Discord OAuth のみに集中させ、災害時のみ計画的に切替** する。
通常 / 災害の切替コストは admin が手順に従って 1 度発動するだけで、運用判断のブレがゼロになる。

常時 dual maintain (Discord OAuth と Email + Password を並行 active) と比較した場合の cold-standby の利点:

- **UX が単純**: 利用者は通常時 Discord ボタンしか見えず、ログイン経路の選択判断が不要
- **admin 工数が少ない**: 通常時 active な経路は 1 本だけで、2 経路の整合性管理 (パスワード変更時の Discord 退出処理等) が発生しない
- **SPOF 改善効果が明確**: primary が常に Discord OAuth で固定されるため、運用判断がブレない
  (Discord 一過性障害でも「待つ」が標準動作で、混在する整合崩れが起きない)

## fallback 切替を人間判断に残す理由

fallback mode の発動 / 解除 / drill 手順を `docs/RUNBOOK.md` に明文化し、admin が 1 名で実行可能にする。
判断トリガは Discord 障害の **長期化見込み** ・ **規約変更などの構造的要因** のいずれかで、いずれも人間判断の領域。

自動切替 (Discord API 障害検出 → 自動 email mode 切替) は次の理由で採用しない:

- **誤検知リスク**: Discord API の一過性障害 (rate limit / 数分の outage) で自動発動すると、復旧後に「全員にいきなり password reset メールが届いた」事故になる
- **発動コスト**: fallback mode 発動 = 全員に reset メール送信 + UI 切替、戻すのも同コスト。自動化に値する頻度ではない

## 不採用にした他の選択肢

| 案 | 不採用理由 |
|---|---|
| 常時 dual maintain (Email + Discord 並行 active) | UX 複雑化、admin 工数増、SPOF 改善効果薄れ (上節参照) |
| Discord 自前 bot で会員リスト sync して CMS DB に保持 | bot 運用コスト、Discord API rate limit 対策、CMS 側でも会員リスト持つことで真の二重管理になる |
| 自動 fallback 切替 (障害検出 → 自動 mode 切替) | 誤検知 / 復旧時の事故 (上節参照) |
| OAuth provider 抽象化レイヤ自前実装 (Discord / GitHub / Google を吸収) | Phase 1 範囲超過、Payload v3 標準 auth-strategy 機構で十分 |
| Discord server role を CMS role (`admin` / `moderator` / `editor`) に自動 mapping | サーバー側 role 体系が CMS 用と一致しない場合に齟齬が発生、初期は CMS 側で role を管理する方が安定 |
| email を Discord 側 OAuth scope で取得して placeholder password なし | Discord 側 email が community email でない (個人 email) ことがあり、disaster 時に届かない懸念。CMS 側で別途 email を強制入力させる |

## 不変条件

本設計を実装する後続 Issue は、以下を破ってはならない:

1. Discord OAuth で初ログインする user は **email を必ず保持** する (収集タイミングは初回 OAuth 完了直後の強制フォーム)
2. Users.password は **常に bcrypt hash を持つ** (placeholder でも正規でも、空にならない)。Discord 経由 user の placeholder hash は **cryptographically-random な平文を生成しその bcrypt 化を保存する** ことで作る (平文は破棄する)。これにより placeholder のままでは password 認証経路は構造的に必ず失敗する
3. fallback mode の発動 / 解除は **admin authn 必須** の操作とする (誰でも踏める endpoint にしない)
4. Discord membership 確認の cache は **24h 上限**。それ以上の長期 cache は退会済み user の延命を許す
5. fallback mode の発動 / 解除 / drill 手順は `docs/RUNBOOK.md` に文書化し、**本リリース前の trial 環境で実 Discord OAuth + SMTP secrets が揃った後に 1 度ドリル検証する** (production 投入前にゲートとして通過させる)

これらの条件のいずれかを破る実装は、本設計の SPOF 回避効果を失わせるためリジェクト対象。

## vendor 固有値

Discord guild ID / OAuth client credentials / 対象 Discord server 名等の **具体値は public repo に書かない**。
`designs/private/` 側に分離した認証関連ドキュメントで管理する (CLAUDE.md §6 ナビゲーションテーブル参照)。

公開ファイルに登場する placeholder:

| placeholder | 意味 |
|---|---|
| `<DISCORD_GUILD_ID>` | 対象 Discord server の snowflake ID |
| `<DISCORD_CLIENT_ID>` | OAuth app の client ID |
| `<DISCORD_CLIENT_SECRET>` | OAuth app の client secret (env vars 経由のみ) |

env vars キーの canonical 一覧は `designs/private/templates/env-vars-reference.md` に集約する。

## 関連

- `CLAUDE.md` §2-2 (SPOF 回避原則)
- `CLAUDE.md` §3-1〜§3-6 (補助優先順位 — 無料維持 / 移行耐性 / 非エンジニア親和)
- [`designs/03-public-repo-security-model.md`](./03-public-repo-security-model.md) (auth 周辺の脅威モデル)
- [`designs/private/org-structure.md`](./private/org-structure.md) (`role` の 3 階層定義 — admin / moderator / editor)
- `docs/RUNBOOK.md` の Secret rotation セクション (本設計が要求する rotation 経路の前提)
