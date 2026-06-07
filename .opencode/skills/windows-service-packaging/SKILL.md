---
name: windows-service-packaging
description: Plan, implement, or review Windows service, tray app, installer, lifecycle, logging, permissions, and deployment packaging for a desktop/server component.
license: MIT
---

# Windows Service Packaging

Use this skill when work touches Windows service deployment, tray UI, installer, service account, logging, event log, firewall, startup, upgrade, or uninstall behavior.

## Principles

- Keep Windows service and user tray UI separate unless an accepted design explicitly chooses another model.
- Services must not depend on an interactive desktop session.
- Installer behavior must be reversible: install, upgrade, repair, uninstall, rollback.
- Startup, shutdown, crash recovery, logs, diagnostics, permissions, and firewall rules are part of the production contract.
- Define automated lifecycle tests or manual gate checklists before service/installer behavior changes.
- Never assume admin privileges without documenting how they are requested and verified.

## Checks

- Service name, display name, account, dependencies, recovery policy, and start mode are explicit.
- Tray app communicates through a documented local IPC/API boundary.
- Installer writes only intended files, registry keys, services, firewall rules, and shortcuts.
- Upgrade preserves config/data and handles running processes.
- Logs and diagnostics are available without attaching a debugger.
- Tests or manual gates cover install, start, stop, restart, upgrade, uninstall, and failure cases.

## Output

Return deployment model, changed artifacts, validation/manual gates, security/permissions notes, and residual risks.
