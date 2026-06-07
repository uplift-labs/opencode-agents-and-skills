# Instruction Artifact Audit Runbook

Use this runbook for broad audits of OpenCode skills, agents, `AGENTS.md`, config, prompts, installed copies, or other model-facing instruction artifacts. Keep quick single-artifact reviews in the main `instruction-artifact-tuning` checklist.

## Scope Contract

Before deep work, define:

- `Goal`: one bounded audit objective.
- `Source Scope`: repo artifacts, project-local config, global config, personal skill folders, installed copies, or selected diffs.
- `Runtime Scope`: startup rules, skill discovery, agent invocation, permissions, loader behavior, or provider/remote behavior in scope.
- `Non-goals`: adjacent repositories, unrelated skills, plugin implementation, or runtime enforcement work not included.
- `Mode`: review-only | audit-and-fix | install-sync | runtime-policy-review.
- `Stop Line`: when remaining work is speculative, requires restart/live provider access, or belongs to a separate runtime guard/plugin project.

## Evidence Lanes

Cover every lane that applies; mark non-applicable lanes explicitly.

- `Repo Source`: committed skills, agents, README, instruction templates, validators, tests, installer scripts.
- `Installed State`: global/project installed copies under OpenCode config directories, personal skill folders, backups, and copy drift.
- `Runtime Policy`: official docs, local docs mirror, schema/source, `opencode debug config`, and live loader output when available.
- `Context Cost`: line counts or token proxy for global `AGENTS.md`, heavy skills, available skill catalog size, and repeated boilerplate.
- `Autonomy Policy`: when the main session proceeds, asks the user, launches reviewers, creates/updates PR/MR text, or stops.
- `Permission Semantics`: prose-only, wildcard config, explicit config, semantic hook/plugin, or managed policy enforcement.
- `Reviewer Gates`: which read-only reviewers ran, what evidence they checked, and which gates were skipped with reasons.
- `Non-Repo Changes`: global config, global rules, installed copies, personal skills, backups, or external docs changed outside the current git worktree.

## Inventory Checklist

- List repo skills: `.opencode/skills/*/SKILL.md` with line counts and trigger summaries.
- List repo agents: `.opencode/agents/*.md` with mode, permissions, and role boundaries.
- List instruction templates: `instructions/*.md` and README catalog entries.
- List global installed library copies: `~/.config/opencode/skills`, `~/.config/opencode/agents`, and marker block in `~/.config/opencode/AGENTS.md`.
- List personal/global extra skills such as `~/.opencode/skills`, `~/.claude/skills`, or `~/.agents/skills` when loader-visible.
- List active config files and relevant fields: `opencode.json`, `opencode.jsonc`, `instructions`, `skills.paths`, `agent`, `permission`, `plugin`, `mcp`.

## Fast Grep Gate

Search for proven drift patterns before detailed review:

- Routine handoff: broad post-task `question` requirements instead of blocker-only questions.
- Auto self-edit loops: instructions that tell skills/agents to rewrite themselves after ordinary runs.
- Project anchors in reusable/global artifacts: local product names, internal paths, issue trackers, hardcoded validation commands.
- Tool assumptions: references to unavailable tools such as web search, provider CLIs, or shell commands without fallback.
- Permission shortcuts: blanket allow policies, prose-only remote/destructive safety, or wildcard shell policies presented as hard enforcement.
- Runtime overclaims: skills promising durable state, event subscriptions, workspace management, or enforcement that only plugins/tools can provide.

## Decision Rules

- Keep artifacts that are cohesive, short, and have accurate triggers.
- Scope artifacts that are useful but project-specific and still loader-visible outside their intended repository.
- Move/delete global project-specific artifacts when a project-local copy exists and no cross-repo use remains.
- Split artifacts when triggers, permissions, or output contracts differ materially.
- Compress artifacts when safety boilerplate repeats global/repo rules without adding local decision value.
- Replace prose safety claims with validators, fixtures, config, hooks, or explicit reviewer gates where practical.

## Permission Semantics Rubric

Classify each safety policy:

| Level | Meaning | Audit confidence |
| --- | --- | --- |
| `prose-only` | Instructions tell the model what not to do. | Low; advisory only. |
| `wildcard-config` | Permission patterns ask/deny common command strings. | Medium-low; useful friction, bypassable. |
| `explicit-config` | Tool/agent permissions deny or ask broad risky surfaces with narrow allowlists. | Medium; depends on precedence and live config. |
| `semantic-guard` | Hook/plugin parses operation semantics before tool execution. | High when tested with TP/TN fixtures. |
| `managed-policy` | Admin/managed config enforces non-overridable policy. | High when resolved config proves it. |

Do not describe wildcard shell patterns as hard enforcement. Report them as best-effort unless a semantic guard or managed policy exists.

## Metrics To Capture

- `Global Rules Lines`: before -> after, if edited.
- `Heavy Skill Lines`: top 5 skills by line count before -> after.
- `Available Skills`: repo/global/personal counts and project-specific global skills count.
- `Installed Drift`: source vs installed `same/diff/missing` counts.
- `Validator Tests`: before -> after test count and new failure modes.
- `Reviewer Gates`: reviewers run, findings fixed, findings deferred.

## Output Contract

Return:

- `Verdict`: clean | minor tuning | material tuning needed | blocked | fixed.
- `Scope Coverage`: repo source, installed state, runtime policy, personal/global extras, and non-applicable lanes.
- `Runtime Policy`: what loads at session start, what is discovered, and what is injected on demand.
- `Context Cost Matrix`: artifact -> size/cost -> action.
- `Installed State Matrix`: source -> installed path -> status -> action.
- `Permission Semantics Matrix`: policy -> level -> evidence -> gap.
- `Findings`: severity, evidence, evidence type, impact, recommendation, confidence.
- `Redundancy Matrix`: keep | scope | move | merge | split | delete candidates.
- `Validation`: commands, reviewer gates, live checks, and skipped gates with reasons.
- `Non-Repo Changes`: exact external files changed or inspected.
- `Residual Risks`: restart gaps, unresolved runtime evidence, model-version sensitivity, or semantic guard gaps.
- `Actionable Continuation Items`: concrete follow-up tasks or `none`.

## Completion Gate

Do not call an audit complete while in-scope artifact classes are unreviewed, in-scope installed drift is unknown, in-scope runtime claims lack source/docs/live evidence, non-repo changes are missing from the report, or material reviewer findings are untriaged. For lanes outside the agreed scope, mark `N/A` with a short rationale instead of blocking the audit.
