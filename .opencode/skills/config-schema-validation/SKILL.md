---
name: config-schema-validation
description: Design, review, or implement configuration schema and validation for services, including defaults, limits, aliases, reload policy, generated config, and operational diagnostics.
license: MIT
---

# Config Schema Validation

Use this skill when work touches configuration loading, schema shape, validation rules, defaults, generated config, reload/restart behavior, limits, or deployment-facing config docs.

## Principles

- Prefer explicit config over hidden defaults for production-critical behavior.
- Validate early and fail with actionable diagnostics.
- Keep schema, docs, generated examples, tests, and runtime behavior synchronized.
- Add accepted/rejected fixtures plus default and boundary tests before schema or runtime config behavior changes.
- Treat unsafe defaults, duplicate aliases, ambiguous precedence, and silent truncation as material risks.
- Do not add speculative roles, leases, auth, or dynamic policy fields unless the accepted spec requires them.

## Checks

- Schema accepts valid minimal and full examples.
- Schema rejects unknown, duplicate, contradictory, unsafe, and out-of-range values.
- Defaults are documented and tested.
- Limits have boundary tests and operational rationale.
- Reload policy is explicit: hot reload, restart required, partial reload, or unsupported.
- Generated config is deterministic and does not include secrets.
- Error messages identify path, invalid value, and allowed alternatives.

## Output

Return config files touched, validation tests, rejected/accepted example matrix, reload/restart notes, operational risks, and residual gaps.
