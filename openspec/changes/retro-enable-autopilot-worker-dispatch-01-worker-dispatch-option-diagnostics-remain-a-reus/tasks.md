# Tasks: Worker-dispatch option diagnostics remain a reusable hardening item

## Follow-Up Scope

- [ ] Confirm the retrospective finding from `enable-autopilot-worker-dispatch` is still current.
- [ ] Confirm the retrospective root cause is still correct or update it before designing the fix: Deployment review identified live-enable diagnostics as intentionally deferred beyond the serial dispatch implementation slice
- [ ] Define the smallest implementation or documentation slice for: Tighten `workerDispatch` option diagnostics and live-enable preflight evidence before recommending target deployment
- [ ] Add or update the focused test, fixture, validator, or review evidence needed for this finding.
- [ ] Implement the minimal change and update docs/specs if behavior changes.

## Validation

- [ ] Run the focused validation command for this change.
- [ ] Run `openspec validate --all`.

## Retrospective Before Archive

- [ ] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, token-heavy steps, and likely root causes.
- [ ] Write `retrospective.md` with evidence, problems, root causes, improvements, and archive gate decision.
- [ ] Create or update project-local OpenSpec follow-up changes for project-local findings.
- [ ] For reusable findings, create or update `opencode-dev-kit` OpenSpec proposals/changes only when the current repository owns them; otherwise record a local handoff and do not write cross-repo without explicit approval.
- [ ] Run `npm run openspec:retro-followups -- <change-id>` when available so actionable retrospective findings create or update follow-up OpenSpec changes before archive.
- [ ] Confirm archive is allowed only after the retro gate passes or an approved skip reason is recorded.
