---
name: write-self-contained-comments
description: Use this skill when writing or editing comments in code (//, /* */, #, """) or technical documentation (Markdown design docs, README, CHANGELOG). Enforces self-contained writing — comments must make sense without external context such as other PRs, Issues, or conversation history. Triggers on "コメント書く", "ドキュメントを書く", "comment writing", "design doc 執筆", and applies during any code/doc edit that includes commentary or prose.
---

# write-self-contained-comments

Code comments and technical documentation must be readable in isolation. The reader should never need to navigate to another PR, Issue, or conversation log just to understand what a comment means.

## Scope

| Target | Applies |
|---|---|
| Code comments (`//`, `/* */`, `#`, `"""`, JSDoc) | Yes |
| Markdown technical docs (`designs/**.md`, `docs/**.md`, README, CHANGELOG, etc.) | Yes |
| `CLAUDE.md`, `SECURITY.md`, `.claude/agents/**`, `.claude/skills/**` | Yes |
| **PR descriptions and commit messages** | No — Issue references are conventional and expected here |
| **Linear / GitHub Issue bodies** | No — use the platform's native cross-link mechanism |

## Required rules

### 1. Write WHY, not WHAT

If the code itself answers "what does this do?", do not restate it. Comments are for hidden constraints, invariants, workarounds for specific bugs, or behaviors that would surprise a reader.

```typescript
// Bad — restates what the code obviously does
// req から user を取り出す
const user = req.user;

// Good — captures a constraint not visible in the code
// Payload は role に関わらず req.user を返すが、本 endpoint は admin 専用なので
// role を明示的にチェックする (CLAUDE.md §4-6 の access 明示原則)。
if (req.user?.role !== 'admin') return res.sendStatus(403);
```

### 2. Do not cite Issue / PR numbers as a context-compression shortcut

Phrases like "implemented in PPL-43" or "decided in PR #25" force the reader to look up an external system to understand the present text. This is harmful because:

- Linear Issues never appear in `git log` / `git blame` / GitHub search, so the reference is invisible from the repository's own history
- PR numbers are opaque on their own and require a round-trip to the GitHub UI
- External links rot — the reference may be deleted, archived, or moved years later

**Disallowed**:

```typescript
// Domain 型の構造は PPL-43 で決定
// 公開 surface 範囲は PR #25 で確定
// fetcher の retry 戦略は PPL-44 のとおり
```

**Rewrites**:

```typescript
// Domain 型は Payload Raw 型のフィールドを意図的に絞る
// (詳細: designs/02-migration-resilience.md §Raw 型と Domain 型の分離規約)。
//
// 公開 surface (packages/cms-client/src/index.ts) は Domain 型と
// fetcher のみ。Raw 型・URL 定数は export しない。
//
// retry 戦略は cms-client 内部に閉じ、公開サイト側からは見えない。
```

Guideline:

- Name the **concept** that lives elsewhere ("Domain 型と Raw 型の分離", "公開 surface", "境界レイヤ")、Issue tracker entry の番号ではなく
- ポインタが必要なら **repo-relative path** (`designs/02-migration-resilience.md`, `packages/cms-client/src/...`) を使う — これらは `git log` / `git blame` から辿れる
- "本ファイル外で扱う" / "別途設計" / "今回はスコープ外" で十分なケースが多い。Issue 番号を貼っても読者が取れる行動は増えない

### 3. TODO / FIXME may carry an Issue ID

`TODO` と `FIXME` は「未完了である」ことを示す慣例的な grep-able マーカー。Issue ID を付けるとメンテナが追跡しやすくなるため、これは唯一の例外。

```typescript
// TODO(PPL-43): R2 storage adapter の prefix を env vars 化する
// FIXME: payload size > UPLOAD_MAX_FILE_SIZE_BYTES のときの error handling を再考する
```

ただしここでも、コメントは **TODO の中身を必ず説明する**こと。チケット番号だけ指して終わりにしない。

### 4. Do not anchor text to the current task, PR, or commit

"In this change…", "as of the previous commit…", "the calling code expects…" のような時制を含む表現は時間とともに腐る。**現在の状態**を記述する。

```typescript
// Bad
// このコミットで Raw 型の re-export を削除した
// Bad
// PPL-37 で導入した URL builder を本 PR でリファクタリング

// Good
// 公開 surface (index.ts) からは Raw 型を export しない
// (designs/02-migration-resilience.md §Raw 型と Domain 型の分離規約)。
//
// URL は cms-client 内部の lib/url.ts で構築する。
// 公開サイト側に URL 構築規則が漏れないようにするため。
```

### 5. Avoid delta and negation framing

"Previously…", "the old layout was…", "this is not X…" は読者が過去を知っていることを要求する。**現在の事実を直接**書く。
(`doc-context-free` skill も参照。)

```markdown
Bad:  以前の fetcher は Raw 型を直接返していたが、新しい fetcher は Domain 型を返す。
Good: fetcher は Raw 型を内部で Domain 型へ変換し、Domain 型を返す。
```

CHANGELOG だけは**履歴を記録するための文書**なので例外。ただし CHANGELOG でも「今回の変更内容」を書くにとどめ、新旧設計を比較する形で全体を再説明しない。

## Self-review checklist

コメント・ドキュメントを編集した後に走らせる:

- [ ] すべてのコメントが non-obvious WHY を説明している（そうでないコメントは削除）
- [ ] `grep -nE '\b[A-Z][A-Z0-9]+-[0-9]+\b|PR #[0-9]+|Issue #[0-9]+'` の結果が TODO / FIXME 行のみ（CHANGELOG / Issue 本体ファイルは対象外）
- [ ] "in this change", "previously", "the old", "this fixes" のような時制依存表現が無い
- [ ] In-repo 参照は relative path (`designs/...`, `packages/...`, `docs/...`) を使用
- [ ] PR や対話履歴を見ていない読者でも、コメント単体で行動できる

`<TICKET-PREFIX>-NN` の grep パターンは大文字英字＋数字の Issue ID を一律検出する。プロジェクト固有の prefix が決まっていれば置き換える (例: `PPL-[0-9]+`)。

## Examples — before / after

```typescript
// Before
/**
 * `body` は Lexical JSON。HTML への変換は別途検討中
 * (PPL-43 で取り扱う)。
 */

// After
/**
 * `body` は Lexical JSON。公開サイト側で HTML として描画するため、
 * cms-client の fetcher 内で `lexicalToHtml()` を通して `bodyHtml` に変換する。
 * 変換ロジックは packages/cms-client/src/fetchers/<entity>.ts に集約。
 */
```

```markdown
// Before
- 公開 surface の境界は PR #28 で議論し、PPL-43 で確定した。

// After
- 公開 surface (`packages/cms-client/src/index.ts`) は Domain 型と fetcher のみ。
  Raw 型・URL 定数・Payload 用語を含む識別子は export しない。
  詳細は designs/02-migration-resilience.md §境界レイヤ。
```

```typescript
// Before
// 本 PR で Raw 型の re-export を削除した。

// After
// コメントを残す必要が本当にあるかを先に判断する。多くの場合は git log で十分。
// もし残すなら、現在の状態だけを書く:
// 公開 surface には Domain 型のみが現れる。Raw 型は cms-client 内部に閉じる。
```
