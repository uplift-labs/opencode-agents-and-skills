# Quality Gates

Quality gates make the Universal Development Loop executable and reviewable.

## Default Gates

| Gate | When | Evidence |
| --- | --- | --- |
| Focused validation | After each meaningful edit | Nearest test/build/lint command result |
| Test-first gate | Behavior-changing code | Failing, acceptance, or characterization test before implementation |
| Code-quality reviewer | Non-trivial code edits or large-file/navigation risk | Read-only reviewer findings or skipped reason |
| Test-coverage reviewer | New behavior, weak assertions, or missing acceptance evidence | Requirement-to-test matrix and gaps |
| Implementation-readiness reviewer | Risky plans/specs or blocked requirements | Scope, decisions, blockers, validation path |
| Final validation | Boundary/API/data/deployment/compatibility change | Broader project command result |

## Adapter Commands

Store project commands in `opencode-dev-kit/adapter.json` or project docs:

```json
{
  "validation": {
    "focusedTest": "unknown",
    "test": "unknown",
    "typecheck": "unknown",
    "lint": "unknown",
    "build": "unknown"
  }
}
```

Use `unknown` when a command cannot be determined from local evidence. Do not invent commands.
