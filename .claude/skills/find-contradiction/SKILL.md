---
name: find-contradiction
description: Use this skill to scan design documents and sample YAML for contradictions, inconsistencies, naming drift, or broken references. Returns a classified list of findings (immediate-fix vs. needs-review). Triggers on "矛盾を探す", "不整合チェック", "find contradictions", "find inconsistencies".
---

# find-contradiction

Scan all design docs and sample YAML. Return findings classified as **immediate-fix** or **needs-review**.

## Target Files

```
CLAUDE.md
SECURITY.md
designs/**/*.md
docs/**/*.md
.claude/agents/**/*.md
.claude/skills/**/SKILL.md
```

`designs/private/` 配下もローカルで参照可能なら対象。

## Investigation Checklist

| Category | What to check |
|---|---|
| Broken links | Markdown links point to existing files |
| Naming drift | Same concept under different names (e.g. `cms-client` vs `client-package`) |
| Placeholder consistency | `<ORG>` / `<DOMAIN>` 等のプレースホルダーが揺れずに使われているか |
| Stale field names | Past renames fully propagated |
| Contradicting statements | Different explanations for the same fact |
| Missing definitions | Terms used but absent from `CLAUDE.md` / `designs/01-architecture.md` |
| Stack divergence | `designs/01-architecture.md` の選定基準 vs. 実装 |
| Public/Private 境界 | 公開ドキュメントに具体値・固有名詞・組織情報が漏れていないか (`designs/03-public-repo-security-model.md` 参照) |
| Context-dependent language | Phrases that assume prior knowledge of changes (negating unstated alternatives, history references, delta descriptions) — see `doc-context-free` skill |

## Classification

**Immediate fix** — act without asking:
- Broken link
- Conversion artifact (garbled text, mis-concatenated backticks)
- Obvious naming drift (same concept, different label)
- Stale field name
- Unambiguous spec gap (answer clear from existing docs)

**Needs review** — do not fix, surface to user:
- Architecture decision required
- User intent unclear
- Multiple valid interpretations

## Output Format

Report findings as:
```
[immediate-fix] file:line — description
[needs-review]  file:line — description + options
```

## Accuracy

- Use Explore agent — faster and more thorough than reading files one by one
- Verify apparent contradictions by reading both files; many are false positives from different contexts
- Never fix based on inference alone
