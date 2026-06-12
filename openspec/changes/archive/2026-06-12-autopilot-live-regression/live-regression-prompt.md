# New Session Prompt: Autopilot Live Regression And E2E Evaluation

Use this as a two-turn fresh-session handoff after restarting OpenCode in `D:\uplift-labs\agents-and-skills`.

## Turn 1

Send exactly:

```text
/autopilot
```

Capture whether the first substantive model/tool behavior loads `openspec-autopilot` and calls `autopilot_run_next`. If the tool/plugin is unavailable, capture the exact blocker.

## Turn 2

After Turn 1 produces output or a blocker, paste this continuation prompt:

```text
Ты работаешь в репозитории `D:\uplift-labs\agents-and-skills`.

Цель: провести live regression и e2e evaluation OpenSpec Autopilot MVP как tracked OpenSpec work.

Отвечай пользователю на русском языке. Код, команды, OpenCode terms, API names, paths и filenames оставляй в оригинале.

Главный принцип теста: понять, есть ли баги, где Autopilot удобен или неудобен для AI-agent workflow, и насколько хорошо он помогает соблюдать process gates для конкретных типов задач и эффективно распараллеливать работу.

Стартовые артефакты:
- OpenSpec guide: `openspec/project.md`
- Regression change: `openspec/changes/autopilot-live-regression/`
- Regression report: `openspec/changes/autopilot-live-regression/live-regression-report.md`
- Regression task ledger: `openspec/changes/autopilot-live-regression/automation/task.json`
- Regression tasks: `openspec/changes/autopilot-live-regression/tasks.md`
- Regression spec: `openspec/changes/autopilot-live-regression/specs/autopilot-regression/spec.md`

Сначала зафиксируй Turn 1 evidence: был ли вызван `autopilot_run_next`, какой JSON/output вернулся, или какой blocker помешал.

Дальше:
1. Проверь `git status --short` и не трогай чужие изменения.
2. Прочитай `openspec/project.md`, `proposal.md`, `design.md`, `tasks.md`, `spec.md`, `live-regression-report.md` и `automation/task.json` для `autopilot-live-regression`.
3. Запусти baseline validation:
   - `npm run autopilot:evidence -- --change autopilot-live-regression --mode collect`
   - `npm run validate`
   - `npm test`
   - `npm run autopilot:validate -- openspec/changes/autopilot-live-regression/automation/task.json`
   - `openspec validate --all`
   - `npm run openspec:retro-gate -- autopilot-live-regression` только после появления `retrospective.md`.
4. Используй `openspec-autopilot` skill и вызывай `autopilot_status`, `autopilot_collect`, `autopilot_answer_blocker`, `autopilot_stop` только когда сценарий требует этого или `nextActions[]` безопасно рекомендует; `nextRecommendedCall` используй только как compatibility fallback.
5. Не симулируй plugin-owned state transitions вручную.
6. Для `ready_runtime_deferred`, `no_ledgers`, `no_actionable_tasks`, stale evidence или evidence conflict не повторяй эквивалентный no-progress tool call; фиксируй stop/handoff path: `next-step`, `openspec-apply-change`, manual direct work, prompt-only `orchestrator`, или follow-up OpenSpec.

Scenario tiers:
- P0: command smoke, `autopilot_run_next`, status/collect/stop, current regression ledger discovery, baseline validation, durable report. P0 должен завершиться или получить явный blocker.
- P1: task-type scenarios using static fixtures, validator output, source/config evidence, and any available plugin-owned runtime output.
- P2: real MR/provider checks, plugin-owned prototype ledgers, branch/MR behavior, and multi-worker dispatch. Выполняй только если tools/credentials/state безопасно доступны.

Обязательные сценарии:
- Startup and command smoke: `/autopilot`, skill trigger, plugin load, `autopilot_run_next`, output JSON shape.
- Tool API smoke: `autopilot_status`, `autopilot_collect`, safe `autopilot_answer_blocker` envelope if a real/synthetic blocker question is available, and `autopilot_stop` on a safe target.
- Ledger discovery: existing `openspec/changes/*/automation/task.json`; inspect `.autopilot/prototype/tasks/*.json` only if plugin-owned state already exists.
- Bugfix workflow: reproduction/characterization-first gate.
- Research workflow: evidence artifact/no-product-code flow.
- Small feature workflow: whether Autopilot is helpful or too heavy.
- Large epic workflow: ready queues/parallel workstreams vs prompt-only orchestration.
- Codebase exploration: verify Autopilot does not over-trigger for casual exploration.
- Routing escape hatch: verify `ready_runtime_deferred`, `no_ledgers`, `no_actionable_tasks`, stale evidence, and evidence conflict wording stops or hands off instead of repeating `autopilot_run_next`.
- Docs/typo: cheap Analyze, `testDecision: not-applicable`, explicit reviewer skip reasons.
- Tooling/config: fixture/schema/validator gate and deployment-config reviewer routing.
- Performance/protocol-style: benchmark/golden evidence and domain reviewer routing without fake claims.
- Blocker questions: recommended options and pass-through into `autopilot_answer_blocker`.
- MR wait/merge gate: no auto-merge and correct stop behavior.
- Stop/pause: `autopilot_stop` without destructive actions.

Protected-path policy:
- Do not manually write `.autopilot/**` or `openspec/changes/*/automation/**`.
- If a scenario needs protected-path fixture creation or unimplemented plugin seeding, record it as blocked and create/update a follow-up OpenSpec change for a plugin-owned harness.

Default write policy:
- Update only `openspec/changes/autopilot-live-regression/live-regression-report.md` and OpenSpec follow-up changes.
- Do not edit `.opencode/**`, `tools/**`, `README.md`, package/config files, or runtime implementation code unless the user separately approves that fix scope.

Findings tracking:
- Every confirmed bug, UX friction, unsafe behavior, missing gate, or unclear workflow must be fixed only with separate approval or tracked as OpenSpec follow-up.
- Group findings by coherent outcome/risk area. Не создавай отдельный change для каждого мелкого пункта.
- Минимум для follow-up change: `proposal.md` + `tasks.md`; добавляй `design.md` или `specs/**/spec.md`, если есть нормативное поведение или архитектурное решение.
- В каждом finding укажи evidence, impact, recommendation, confidence, validation path.

Stop rules:
- Complete all P0 scenarios unless blocked.
- Attempt each P1 family once with the cheapest reliable evidence.
- Stop before P2 if credentials, provider access, MR target, plugin-owned harness, or safe runtime state are unavailable.
- Stop if validation fails and cannot be fixed inside approved scope.

Reviewer gates:
- After material instruction/config/plugin/tooling changes, run relevant reviewers.
- For this regression-only run, default reviewer action is to create follow-up changes unless fixes are separately approved.
- Relevant reviewers by signal: `instruction-artifact-reviewer`, `test-coverage-reviewer`, `code-quality-reviewer`, `deployment-config-reviewer`.

Durable report:
- Write `openspec/changes/autopilot-live-regression/live-regression-report.md` with scenario matrix, exact evidence, findings, follow-up changes, validation, reviewer gates, residual risks, and ready-to-land status.
- Prefer `npm run autopilot:evidence -- --change autopilot-live-regression --mode collect` for compact scenario/reviewer/freshness/retro evidence before manual report synthesis.

Финальный ответ должен включать:
- Scenarios completed/skipped/blocked with reasons.
- Был ли Autopilot удобен и где именно.
- Где Autopilot лучше direct path, `next-step`, `openspec-apply-change`, или prompt-only `orchestrator`.
- Где Autopilot обязан остановиться по escape hatch и какой handoff был выбран.
- Confirmed bugs and UX findings.
- OpenSpec follow-up changes created/updated.
- Changed files.
- Validation commands and results.
- Reviewer gates run/skipped with reasons.
- Residual risks.
- Ready-to-land status.

Не останавливайся на концептуальном плане. Проведи regression максимально далеко до реального blocker, MR wait/merge decision, missing tool/credential, unsafe state, failed validation, или P0/P1 completion. Если runtime plugin не загрузился, это finding; продолжай static/validator/OpenSpec regression настолько далеко, насколько возможно.
```
