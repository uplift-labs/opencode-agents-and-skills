# Tasks: Add Autopilot Programmatic Triggers

## Tests First

- [ ] Add TypeScript tests for trigger event classification covering supported OpenSpec paths, unsupported paths, worker session events, blocker replies, permission replies, workspace/worktree events, and TUI command intent categories.
- [ ] Add scheduler tests for debounce, single-flight execution, cooldowns, normalized scope keys, source tags, disposal cancellation, and recursion suppression.
- [ ] Add tests proving passive events schedule only status or cheap checks and never call `autopilot_run_next` by default.
- [ ] Add tests proving `triggerMode: off|observe|controlled|autonomous` gates behavior exactly as specified.
- [ ] Add tests proving worker `session.status: idle` schedules `autopilot_collect` only for plugin-owned worker sessions and only once per unconsumed worker report id.
- [ ] Add tests proving `message.updated` and `message.part.updated` report markers do not trigger collection until the worker is idle or report completion is proven.
- [ ] Add tests proving `question.replied`, `question.rejected`, and `permission.replied` affect only plugin-owned pending blocker/action state.
- [ ] Add tests proving `tool.execute.after` schedules cheap checkpoints for `advanced` Autopilot outputs and suppresses no-progress loops.
- [ ] Add protected-path guard tests for `apply_patch`, edit/write tools, and `bash` commands that target `.autopilot/**` or `openspec/changes/*/automation/**`.
- [ ] Add source-equivalent plugin tests for server `event`, `tool.execute.before`, and `tool.execute.after` handlers with fake OpenCode event/tool envelopes.
- [ ] Add instruction/config drift tests if new trigger options, TUI command names, README guidance, or skill wording are documented.

## Implementation

- [ ] Extract or wrap the existing Autopilot public tool logic behind a shared TypeScript controller without changing current tool output behavior.
- [ ] Add a deterministic trigger scheduler module with debounce, single-flight, cooldown, source tagging, recursion guard, safe logging summaries, and disposal support.
- [ ] Add trigger configuration parsing with safe defaults for `off`, `observe`, `controlled`, and `autonomous` modes.
- [ ] Implement observe-mode `event` hook handling for `file.watcher.updated` on `tasks.md`, `automation/task.json`, reports, and retrospectives.
- [ ] Wire observe-mode file triggers to `autopilot_status` or `autopilot:check --level cheap` when the check helper exists, without protected writes.
- [ ] Implement `tool.execute.after` checkpoints for `autopilot_run_next` and `autopilot_collect` advanced/conflict outputs.
- [ ] Implement controlled worker idle/report-marker collection using plugin-owned runtime session/task/report evidence.
- [ ] Implement controlled blocker question and permission reply handling using plugin-owned request/action evidence.
- [ ] Implement workspace/worktree ready/failed handling only for plugin-owned runtime waits.
- [ ] Implement protected-path write guard through `tool.execute.before` or an equivalent permission-backed enforcement path.
- [ ] Add optional TUI status/check command entrypoint only after confirming the server/TUI split and bridge behavior for the current OpenCode version.
- [ ] Add explicit TUI run/stop command behavior with prompt-mediated fallback unless a direct server-owned bridge is proven in tests or smoke output.
- [ ] Keep autonomous `run_next` event behavior disabled unless explicit config, runtime ownership, lock, cooldown, and no-blocker/no-MR prerequisites are all present.

## Documentation And Routing

- [ ] Update README Autopilot installation/runtime guidance with trigger modes, default safety policy, and restart requirements for plugin/TUI changes.
- [ ] Update README Routing Map to distinguish explicit `/autopilot`, TUI zero-LLM status/check commands, passive observe-mode triggers, controlled runtime triggers, and autonomous opt-in behavior.
- [ ] Update `openspec-autopilot` skill guidance so agents understand event-triggered status/check/collect outputs and do not repeat no-progress calls.
- [ ] Update `/autopilot` command wording only if explicit command behavior changes or needs to reference programmatic trigger boundaries.
- [ ] Document protected-path guard behavior and how plugin-owned controller paths remain the only allowed protected-state writer.
- [ ] Review relevant artifact frontmatter and command descriptions for discoverability if TUI commands or new plugin entrypoints are added.

## Review Gates

- [ ] Run `code-quality-reviewer` for the controller extraction, scheduler, plugin hooks, and protected-path guard.
- [ ] Run `test-coverage-reviewer` for event classification, scheduler behavior, runtime ownership gates, and negative safety cases.
- [ ] Run `instruction-artifact-reviewer` after README, skill, command, or TUI command wording changes.
- [ ] Run `deployment-config-reviewer` if trigger options or plugin packaging/config shape changes materially.
- [ ] Run `openspec-consistency-review` before archive because this changes Autopilot/OpenCode lifecycle routing.

## Validation

- [ ] `npm run validate`
- [ ] `npm test`
- [ ] `npm run openspec:validate`
- [ ] `openspec validate --all`
- [ ] `node tools/test-autopilot-bundle-smoke.ts` or updated bundle smoke covering new plugin hook surfaces
- [ ] `npm run autopilot:validate -- <task-ledger.json>` for any new or modified Autopilot ledger fixtures, or record not-applicable when no ledger fixtures changed
- [ ] Manual/source-equivalent smoke: emit fake supported `file.watcher.updated` events and confirm one debounced status/check job is logged without `autopilot_run_next`
- [ ] Manual/source-equivalent smoke: emit plugin-owned worker idle/report events and confirm exactly one scoped collect job is scheduled
- [ ] Manual TUI smoke after restart if TUI commands are implemented: command appears, status/check runs without LLM turn, scoped run uses dialog or prompt-mediated fallback

## Acceptance Criteria

- [ ] Existing `autopilot_*` tool output behavior remains compatible with current contract tests.
- [ ] Passive events can refresh status or cheap checks but cannot start claim-capable work by default.
- [ ] Controlled collect/blocker/permission/workspace triggers require plugin-owned runtime evidence and ignore unrelated OpenCode events.
- [ ] Scheduler prevents event storms, duplicate in-flight jobs, and recursion from Autopilot-generated events.
- [ ] Protected Autopilot paths cannot be mutated directly by model-facing write/shell tools outside plugin-owned controller paths.
- [ ] TUI status/check commands, if implemented, run without an LLM turn and clearly report results or fallback behavior.
- [ ] Autonomous `run_next` from events is disabled by default and guarded by explicit config plus runtime ownership evidence when enabled.

## Retrospective Before Archive

- [ ] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, and token-heavy steps.
- [ ] Write `retrospective.md` with evidence, problems, improvements, and archive gate decision.
- [ ] Create or update project-local OpenSpec follow-up changes for project-local findings.
- [ ] For reusable findings, create or update `opencode-dev-kit` OpenSpec proposals/changes only when the current repository owns them; otherwise record a local handoff and do not write cross-repo without explicit approval.
- [ ] Run `npm run openspec:retro-followups -- add-autopilot-programmatic-triggers` when available so actionable retrospective findings create or update OpenSpec follow-up changes before archive.
- [ ] Confirm archive is allowed only after the retro gate passes or an approved skip reason is recorded.
