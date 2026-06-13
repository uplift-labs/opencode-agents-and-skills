---
name: code-quality-audit
description: Use after non-trivial code changes or maintainability reviews to catch code smells, file bloat, duplication, overengineering, weak boundaries, and readability risks with pragmatic refactoring guidance.
license: MIT
---

# Code Quality Audit

Use this skill after non-trivial code changes, before acceptance/merge, or when the user asks about maintainability, readability, DRY, SOLID, YAGNI, Design Patterns, large files, code smells, or refactoring.

Do not use this skill for pure documentation edits, generated/vendor code, tiny mechanical edits, or broad exhaustive audits. Use `codebase-audit-loop` for whole-codebase audits and `file-review-quest` for block-by-block explanation of one file.

## Core Standard

- Code quality means future changes are easier and safer for both the agent and the human reader.
- Prefer the smallest design that keeps the code understandable, testable, and locally changeable.
- Treat smells as signals, not automatic guilt. A finding needs evidence, impact, likely root cause, and a minimal remedy.
- Do not require perfection. Block only when the change worsens code health or creates a likely future defect/change-cost trap.
- Do not apply Design Patterns by default. Use a pattern only when it removes concrete duplication, branching, coupling, lifecycle complexity, or boundary confusion.
- For behavior-changing fixes, add or update the smallest useful test-first gate before refactoring or implementation unless infeasible; if infeasible, state the substitute evidence.

## Evidence Basis

- Google engineering review practice: review design, functionality, complexity, tests, naming, comments, context, and every relevant line; do not accept changes that degrade code health.
- Fowler code smell principle: smells are quick indicators of possible deeper problems, not proof by themselves.
- Refactoring catalog practice: long methods, large classes, duplication, shotgun surgery, speculative generality, and coupling smells should map to small refactorings such as Extract Method, Extract Class, Move Method, Introduce Parameter Object, Strategy, State, Facade, or Adapter.

## When To Force Engineering Practice

Force a fix, split, or explicit justification before acceptance when one or more of these is true:

- The reviewer cannot explain the changed behavior, ownership, and data flow after one careful pass through the touched code.
- The change adds a new responsibility to a file/class/module that already mixes unrelated responsibilities.
- The change makes a future likely edit require touching multiple unrelated places for one concept.
- The same behavior, branching shape, validation rule, mapping, fixture, or protocol detail appears for the third time without a shared owner.
- A method/function grows multiple phases, nested branches, local mutable state, or comments that compensate for unclear structure.
- A public API, abstraction, interface, factory, generic type, or plugin point is added for hypothetical future needs rather than current requirements.
- New code hides side effects, temporal coupling, global mutation, IO, caching, retries, or concurrency behind names that do not reveal those costs.
- Tests or validation cannot prove the behavior after the refactor, or the code structure makes a focused test impractical.
- The file reaches a `split-candidate` navigation band and the touched change does not either split a coherent responsibility or justify why the file is still cohesive.

Do not force a fix when the issue is generated code, vendor code, local style preference, a cohesive data table, a one-off emergency workaround with explicit follow-up, or a refactor that would be larger/riskier than the scoped change.

## File Size And Navigation Signals

Line count is a radar, not a rule. Use explicit bands to decide how much review pressure to apply:

- `normal`: file is small enough that local review usually works without extra inventory.
- `attention`: inspect top-level responsibilities, public exports, long functions, duplicated blocks, and whether the change makes navigation harder.
- `split-candidate`: require a `split-or-justify` decision for human-written touched files.

Default helper bands are intentionally adjustable: `attention-lines=400`, `split-lines=800`. Lower them for dense languages, complex UI/state files, protocol implementations, or agent-hostile code; raise them for generated files, fixtures, cohesive lookup tables, or intentionally flat data declarations.

If this library tooling is available, gather deterministic evidence with:

```sh
npm run code-quality:inventory -- --format markdown
```

For stricter local gates, use:

```sh
npm run code-quality:inventory -- --attention-lines 400 --split-lines 800 --fail-on-split-candidates
```

If the command is not available in the target repository, use repository-native metrics or manually inventory touched files and top-level responsibilities. Never present line count as the finding by itself.

## Smell-To-Remedy Map

| Smell / Anti-pattern | Force When | Preferred Remedy |
| --- | --- | --- |
| Long method/function | Multiple phases, nested branches, unclear locals, or explanatory comments hide intent. | Extract Method, guard clauses, Decompose Conditional, Replace Method with Method Object only when extraction fails. |
| Large file/class/module | Touched code mixes unrelated ownership such as IO, parsing, validation, UI, state, and persistence. | Extract Class/Module, Move Method, isolate domain model, keep a thin Facade if callers need one entrypoint. |
| Duplicate code | Third occurrence or duplicated rules can drift and cause divergent fixes. | Extract Function, shared table, Template Method, Strategy only when variants truly differ. |
| Shotgun surgery | One concept requires scattered edits across unrelated files. | Create a single owner, central registry/table, Facade, Adapter, or domain service boundary. |
| Divergent change | One file changes for unrelated reasons across features. | Split by responsibility, move cohesive behavior, reduce public surface. |
| Speculative generality | Abstraction exists for imagined future variants. | Inline Class/Method, delete unused extension points, keep concrete implementation. |
| Primitive obsession / data clumps | Repeated groups of fields or raw strings/numbers carry domain meaning. | Value Object, Introduce Parameter Object, named constants, validated config/schema. |
| Long parameter list | Callers must remember ordering or pass repeated groups. | Parameter Object, Preserve Whole Object, Builder only when construction has many optional named fields. |
| Switch/if ladder by type/state | New variants require editing branches in several places or branches hide behavior. | Lookup table, Strategy, State, polymorphism, or explicit state machine. Keep a simple switch when variants are fixed and local. |
| Feature envy / inappropriate intimacy | Code reads/mutates another module's internals more than its own. | Move Method, Encapsulate Field, narrow API, domain method on the owner. |
| Message chain / hidden dependency walk | Callers know too much about object graph shape. | Hide Delegate, Facade, explicit query method, but avoid pointless middlemen. |
| Middle man / wrapper soup | Abstractions only forward calls and add navigation cost. | Inline wrapper, remove lazy class, collapse hierarchy. |
| Magic values | Reused constants or domain thresholds lack names/validation. | Named constant, enum, config schema with limits/defaults. |
| Dead code / unused exports | Code is not reachable or maintained and increases review surface. | Delete, or mark explicit compatibility requirement if external consumers need it. |
| Comment-dependent code | Comments explain what unclear code does rather than why it exists. | Rename, extract, simplify; keep comments for rationale, invariants, algorithms, and external contracts. |
| Hidden side effects | Name looks pure but performs IO, mutation, caching, retries, or scheduling. | Rename, separate query from command, Command pattern for queued work, explicit effect boundary. |

## Pattern Discipline

- `Adapter`: use to isolate incompatible external/legacy APIs or SDKs.
- `Facade`: use to hide a complex subsystem behind a small stable boundary, not to create pass-through layers.
- `Strategy`: use when interchangeable algorithms or policies vary independently and are selected at runtime/config/test time.
- `State`: use when state transitions are explicit and conditional logic is spreading.
- `Factory Method` / small factory function: use when creation details are repeated, conditional, or dependency-heavy.
- `Builder`: use for complex construction with many optional named fields or staged validation, not for simple data objects.
- `Command`: use for queued, retryable, cancellable, auditable, or delayed operations.
- `Observer` / event emitter: use for decoupled notifications, but require lifecycle/unsubscribe ownership.
- Avoid `Singleton` unless process-wide identity is intrinsic and tests can isolate/reset it.

## Review Workflow

- Inspect the diff first, then enough surrounding code to understand ownership and data flow.
- Run or request deterministic inventory when file size/navigation is a material risk.
- Identify smells only when they affect change cost, readability, testability, or defect risk.
- Prefer local refactors that reduce the current change's complexity before adding new abstractions.
- If a refactor changes behavior, add/update the focused test-first gate before the refactor when practical.
- Use `code-quality-reviewer` as the read-only post-change reviewer after non-trivial code edits when feasible.
- Escalate to `test-coverage-reviewer`, `performance-reliability-reviewer`, `rust-concurrency-reviewer`, or protocol/deployment reviewers when the finding is primarily in those domains.
- If the review yields several concrete out-of-scope follow-ups from the current session, recommend grouping them into OpenSpec follow-up changes; do not do this for isolated nits, local style preferences, or one obvious next step.

## Output

Return:

- `Verdict`: clean | minor findings | material findings | blocked | fixed | not applicable.
- `Code Health Delta`: improves | neutral | worsens, with evidence.
- `Findings`: severity, file/line, evidence, impact on agent work and human readability, likely root cause, minimal remedy, pattern/refactoring if useful, confidence.
- `Navigation Signals`: attention/split-candidate files, responsibility map, and split-or-justify decisions.
- `Smell Matrix`: smell -> evidence -> remedy -> force/optional/nit.
- `Validation`: tests, inventory commands, reviewer gates, or skipped checks with reason.
- `Residual Risks`: remaining maintainability risks or low-confidence areas.
- `Actionable Continuation Items`: concrete fixes/gates, including OpenSpec follow-up candidates when several session-scoped items remain, or `none`.
