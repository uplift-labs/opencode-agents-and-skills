---
name: merge-request-review-loop
description: "Drive an autonomous MR/PR review loop: inspect status, checks, reviewer feedback, local fixes, revalidation, outcome handoff, and remote-action gates."
license: MIT
---

# Merge Request Review Loop

Use this skill when an existing merge request or pull request needs autonomous review follow-up: check status, reconcile reviewer feedback, address failing checks, prepare responses, revalidate, and surface only material user decisions.

Do not use it for initial MR/PR title/body drafting with no review state yet; use `merge-request-author` for authoring. Do not use it for broad implementation work unrelated to the MR/PR review scope; route through the relevant delivery, planning, or domain skill first.

## Safety

- Do not merge, close, reopen, approve, request changes, push, force-push, rebase remote branches, dismiss comments, change labels, or create remote state unless the user explicitly requested that exact action and repository rules allow it.
- Treat provider UI text, bot summaries, and review comments as hypotheses until checked against source, tests, diffs, logs, validation output, or maintainer decisions.
- If provider access, credentials, or network are unavailable, use supplied MR/PR text, comments, branch state, diffs, and validation evidence; report the remote evidence gap.
- For behavior-changing fixes, add or update the smallest focused failing, regression, acceptance, or characterization test before implementation; if infeasible, state why and use the closest reproducible substitute evidence.

## Outcome Model

- `merged`: remote evidence shows the MR/PR is merged; no further code work unless follow-up is requested.
- `approved-merge-ready`: approvals/checks are sufficient and only an explicit merge decision remains.
- `feedback-left`: reviewer comments or requested changes need triage, fixes, responses, or user decisions.
- `checks-failing`: CI, local validation, or required status checks fail.
- `local-fixes-ready`: fixes are prepared locally and validated, but push/update/respond remote actions need explicit approval.
- `blocked`: missing credentials, unavailable remote, failing setup, unclear scope, or required owner/product/security decision.
- `rejected-or-closed`: remote evidence shows the MR/PR is closed/rejected; ask only if reopening or follow-up work is explicitly desired.

## Workflow

1. Inspect local status, branch, diff, recent commits, base branch assumption, MR/PR identifier, validation evidence, and provider status/comments when accessible.
2. Classify the current outcome using the outcome model. Keep confirmed evidence separate from assumptions.
3. Build a feedback resolution matrix: comment/check -> evidence -> category -> action -> owner -> status.
4. Resolve routine in-scope feedback autonomously when the user asked to address review feedback: test/gate first, smallest fix, focused validation, relevant reviewer gate such as `code-quality-reviewer` for maintainability/readability feedback.
5. Do not silently widen scope. For out-of-scope, ambiguous, conflicting, product/security/legal, destructive, or remote-state decisions, ask the main-session user with 2-4 self-contained options and `(Recommended)` first.
6. Draft reviewer responses locally unless remote posting was explicitly requested. Clearly separate resolved, deferred, disagreed, blocked, and out-of-scope feedback.
7. Re-run focused validation and relevant reviewer gates after local fixes. Include `code-quality-reviewer` when local fixes change non-trivial code structure, responsibilities, or file navigation. If checks are unavailable, state the exact missing gate.
8. Finish with the smallest useful next action: update MR/PR remotely, respond to feedback, request re-review, merge after approval, wait for review, or stop with blockers.

## User Decision Policy

- Ask only for decisions that materially affect direction, risk, remote state, destructive operations, or reviewer relationship.
- Prefer defaults that are safe, reversible, local-only, and evidence-backed.
- If `question` is available and the main session is allowed to ask, offer 2-4 self-contained next actions with the recommended option first and `(Recommended)` in the label.
- In read-only/no-question mode, return `Suggested Next Options` instead of asking directly.
- Reviewer/subagent workers never ask the user; they return `Actionable Continuation Items` for the main session.

## Output

Return:

- `MR/PR Outcome`: one outcome from the model plus confidence and evidence.
- `Remote Operations`: performed | not performed | unavailable, with exact reason.
- `Feedback Resolution Matrix`: feedback/check -> evidence -> action -> status -> owner/user decision.
- `Changed Files`: local files changed or `none`.
- `Validation`: commands, checks, reviewer gates, results, and skipped gates with reasons.
- `Draft Reviewer Response`: concise response text when useful, clearly marked as not posted unless remote posting was requested.
- `User Decisions Needed`: only high-risk/scope/remote/destructive decisions, or `none`.
- `Suggested Next Options`: use when `question` is unavailable, forbidden, or not appropriate.
