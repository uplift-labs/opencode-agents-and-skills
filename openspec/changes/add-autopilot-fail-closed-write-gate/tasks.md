# Tasks: Add Autopilot Fail-Closed Write Gate

## Tests First

- [x] Add `tools/test-autopilot-write-gate.ts` covering no active lock, active main-session block, active worker scoped allow, active worker out-of-scope block, inactive worker block, protected-path block, corrupt runtime fail-closed, read-only validation allow, and unknown tool block.
- [ ] Add shell-classification tests for redirection, removal, move/copy, write cmdlets, script-generated writes, shell control syntax, cwd-relative paths, Windows separators, absolute paths, traversal, and safe validation commands.
- [ ] Add runtime-store schema tests for active write locks or equivalent derived lock evidence, including unknown-field rejection, sorted/unique worker sessions, invalid scope rejection, stale archived-change references, and corrupt-state recovery diagnostics.
- [x] Add source-equivalent plugin hook smoke tests proving a main session cannot mutate ordinary repository files while an active Autopilot lock exists.
- [x] Add source-equivalent plugin hook smoke tests proving a plugin-owned worker session can mutate only `scope.write` while `running` and is blocked after `collecting`, `blocked`, `waiting_mr`, `stopped`, `failed`, or `done`.
- [ ] Add controller tests proving `autopilot_run_next` creates active write ownership before worker prompt execution when dispatch starts.
- [ ] Add controller tests proving disabled/unavailable worker dispatch in fail-closed mode records an intent lock or equivalent ownership evidence and blocks silent manual implementation.
- [ ] Add `autopilot_stop` tests proving active write locks are released or marked inactive without deleting diagnostic evidence.
- [ ] Add `autopilot_collect` tests proving lock release/update occurs only after report parsing, legal transition validation, protected ledger mutation, and runtime-state update complete.
- [x] Add `autopilot_status` and `autopilot:check` tests for compact lock evidence, corrupt/stale lock diagnostics, and no prompt/report leakage.

## Implementation

- [x] Implement `tools/autopilot-write-gate.ts` as a pure deterministic decision helper that composes tool classification, runtime lock evidence, protected-path policy, and existing worker-scope guard results.
- [ ] Extend `tools/autopilot-runtime-store.ts` or derived runtime evidence helpers with active write-lock validation, normalization, and recovery behavior.
- [ ] Extend `tools/openspec-autopilot-controller.ts` so dispatch, deferred explicit ownership, collect, status, and stop maintain lock lifecycle evidence.
- [x] Update `.opencode/plugins/openspec-autopilot.ts` `tool.execute.before` to enforce the write gate for active locks and corrupt runtime state.
- [x] Keep existing protected-path guard behavior always-on for `.autopilot/**` and `openspec/changes/*/automation/**` regardless of active lock state.
- [x] Add fail-closed classification for mutating shell commands while preserving explicit read-only validation command allowlisting.
- [x] Ensure worker sessions are recognized only from plugin-owned runtime evidence and only while run status is `running`.
- [x] Add `writeGate` options with safe defaults for explicit Autopilot and compatibility mode for protect-state-only installs.
- [x] Extend `autopilot_status` output with compact write-gate/lock summaries and safe next actions.
- [x] Extend `npm run autopilot:check` with lock consistency checks and blocking diagnostics for corrupt or contradictory active lock evidence.

## Documentation And Routing

- [x] Update `.opencode/skills/openspec-autopilot/SKILL.md` so agents treat active write-gate blocks as authoritative and do not continue with manual implementation under Autopilot.
- [ ] Update `opencode.json` `/autopilot` command guidance so unavailable worker dispatch in fail-closed mode stops at explicit next actions instead of handoff-by-habit.
- [x] Update `README.md` Autopilot runtime guidance with write-gate modes, active-lock recovery, restart requirements, and single-runtime boundary.
- [ ] Update `openspec/project.md` validation guidance if `autopilot:check` gains new lock consistency gates.
- [x] Update drift/contract tests for new option names, status fields, reason wording, and protected write-gate behavior.

## Review Gates

- [ ] Run `code-quality-reviewer` for write-gate helper, runtime-store changes, controller lock lifecycle, plugin hook integration, and shell classifier complexity.
- [ ] Run `test-coverage-reviewer` for bypass attempts, corrupt runtime, stale locks, inactive workers, shell commands, and status/check diagnostics.
- [ ] Run `instruction-artifact-reviewer` after skill, command, README, or routing wording changes.
- [ ] Run `deployment-config-reviewer` for plugin option defaults, Desktop/server restart expectations, runtime-store recovery behavior, and compatibility mode.
- [ ] Run `openspec-consistency-review` before implementation handoff or archive because this changes Autopilot enforcement semantics.

## Validation

- [x] `npm run validate`.
- [x] `npm test`.
- [x] `npm run openspec:validate`.
- [x] `npm run autopilot:check -- --level standard --change add-autopilot-fail-closed-write-gate`.
- [x] Source-equivalent plugin smoke proving main-session ordinary file mutation is blocked under active Autopilot lock.
- [x] Source-equivalent plugin smoke proving worker scoped mutation remains allowed only while actively `running`.
- [ ] Manual restarted OpenCode smoke only when safe worker-dispatch/plugin options are available; otherwise record capability-missing evidence and keep fail-closed behavior proven by source-equivalent tests.

## Acceptance Criteria

- [ ] During active Autopilot ownership, main-session mutating tools cannot edit ordinary source/docs files.
- [ ] During active Autopilot ownership, main-session shell writes are blocked unless proven read-only validation.
- [ ] Plugin-owned worker sessions can write only assigned `scope.write` while run status is `running`.
- [ ] Worker sessions are blocked outside scope, inside forbidden/protected paths, and after active write ownership expires.
- [ ] Corrupt, stale, or unknown runtime/tool evidence blocks mutations instead of allowing best-effort writes.
- [ ] `automation/task.json` remains mutated only through plugin-owned transition writer code.
- [ ] `autopilot_status` and `autopilot:check` expose enough compact lock evidence for audit and recovery without leaking prompts or secrets.
- [ ] Normal non-Autopilot development remains unaffected when no active lock exists.

## Retrospective Before Archive

- [ ] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, token-heavy steps, and likely root causes.
- [ ] Write `automation/retro.json` with evidence, problems, root causes, improvements, and archive gate decision.
- [ ] Create or update project-local OpenSpec follow-up changes for project-local findings.
- [ ] For reusable findings, create or update `opencode-dev-kit` OpenSpec proposals/changes only when the current repository owns them; otherwise record a local handoff and do not write cross-repo without explicit approval.
- [ ] Run `npm run openspec:retro-followups -- add-autopilot-fail-closed-write-gate` when available so actionable retrospective findings create or update follow-up OpenSpec changes before archive.
- [ ] Confirm archive is allowed only after the retro gate passes or an approved skip reason is recorded.
