---
name: decide-e2e-label
description: Apply the `e2e` PR label only when the diff modifies e2e infrastructure that the test suite cannot self-protect against (e2e workflow, playwright config, runtime container image). For every other layer the skill defers to the user, surfacing the diff so the user can judge whether the change is critical enough to spend the 30-minute test budget. Fires inside `/develop` after PR creation, after pushing new commits, and before promoting draft to ready. Do not fire after merge — post-merge e2e runs from the main-push trigger, not from this skill.
---

# decide-e2e-label

Decide whether to apply the `e2e` label to the current PR. The label triggers `test:e2e` via `.github/workflows/ci-e2e.yml`. A full e2e run currently takes ~30 minutes, so the policy is biased toward NOT labelling unless the change is one this suite cannot self-protect against.

## Why this is conservative

`test:e2e` runs the full Payload boot + admin UI flow. It is the most expensive job in CI. Auto-labelling on every diff under `app/src/**` (the naive heuristic) burns 30 min on cosmetic changes — typo fixes, comment edits, unused-variable cleanups — that do not exercise runtime behaviour. The cost of a false positive (30 min wasted) is much larger than the cost of a false negative (developer adds the label after the fact, or the post-merge run on `main` catches it).

The skill therefore auto-labels only the narrow set of changes that the e2e suite cannot self-protect against, and defers everything else to the user.

## Two-tier policy

### Tier 1 — auto-apply the label

Apply the label automatically. These changes can break the e2e workflow itself; if e2e is not run, the next time someone needs it, the regression is harder to localise.

- `.github/workflows/ci-e2e.yml` — the workflow that owns the e2e run
- `app/playwright.config.ts` — Playwright runner configuration
- `app/Dockerfile` — runtime container image used in `docker-compose` checks

### Tier 2 — defer to the user

Print the changed files that fall in this tier and ask the user to decide. The user's question is "is this change critical enough to spend 30 minutes verifying integrated runtime?" — that judgement requires reading the diff, not pattern matching.

- `app/src/**` — Payload config / collections / hooks / access / endpoints
- `app/package.json` / `app/pnpm-lock.yaml` — dependency changes, especially Payload / Next.js / adapter bumps
- `app/tsconfig*.json` / `app/next.config.*` — build / runtime configuration
- `.github/workflows/ci.yml` — non-e2e CI workflow that still affects the default check set

### Tier 3 — skip silently

Do not label, do not prompt. The change cannot affect e2e outcomes.

- `docs/**`
- root docs (`README.md` / `SECURITY.md` / `CLAUDE.md` / `LICENSE` / `CONTRIBUTING.md`)
- `.claude/**` (skills, agents, settings)
- `packages/cms-client/**` (library scope, validated by its own build/test)
- `designs/**`
- `.gitignore`, `.gitattributes`, similar repo metadata

If a path does not match any tier, treat it as Tier 2 (defer to user). New directories should not auto-label.

## Trigger timing

Inside `/develop`:

- right after creating a new PR
- right after pushing new commits to an existing PR
- right before promoting a draft PR to ready

Do not fire after merge. The post-merge `main` push already triggers the e2e workflow unconditionally as the safety-net layer.

## Execution

1. Resolve the PR number for the current branch:
   ```bash
   PR=$(gh pr view --json number -q .number)
   ```
2. If the `e2e` label is already present, no further work is needed:
   ```bash
   if gh pr view "$PR" --json labels --jq '[.labels[].name]' | grep -q '"e2e"'; then exit 0; fi
   ```
3. List changed files relative to the base branch:
   ```bash
   gh pr diff "$PR" --name-only
   ```
4. Categorise each file into Tier 1, Tier 2, or Tier 3.
5. If any file is in Tier 1, apply the label without prompting:
   ```bash
   gh pr edit "$PR" --add-label "e2e"
   ```
   Then exit (already labelled, Tier 2 prompt would be redundant).
6. If no Tier 1 file but some Tier 2 file: surface the Tier 2 file list and ask the user "Does this change critically affect runtime? Add `e2e` label?". Apply or skip based on the answer.
7. If only Tier 3 files: do nothing.

## After applying the label

- If the PR is still draft: do not promote it. The label addition triggers `pull_request.types: [labeled]` on `ci-e2e.yml`, so `test:e2e` runs even on the draft.
- If the PR is already ready: confirm in the Actions tab that `CI — e2e` has been re-evaluated.

## Label removal

This skill does not remove the label. Even if subsequent commits make `test:e2e` unnecessary (e.g. follow-up commits that only fix typos), running the suite once and confirming green is cheaper than reasoning about removal.

## Related

- `.github/workflows/ci-e2e.yml` — the workflow this skill controls
- `docs/RUNBOOK.md`, section "test:e2e の label-based gate" — operational policy
