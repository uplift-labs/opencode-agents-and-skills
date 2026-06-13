#!/usr/bin/env node
import { autopilotProtectedPathPatterns } from "./autopilot-contract.ts";
import { guardAutopilotProtectedPathToolCall, type AutopilotProtectedPathGuardDecision } from "./autopilot-protected-path-guard.ts";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertGuardBlocked(decision: AutopilotProtectedPathGuardDecision, pathIncludes: string): void {
  assert(decision.action === "block", `Expected protected path guard block, got ${decision.action}: ${JSON.stringify(decision)}`);
  assert(decision.paths.some((guardedPath) => guardedPath.includes(pathIncludes)), `Expected blocked paths to include ${pathIncludes}, got ${JSON.stringify(decision.paths)}.`);
  assert(decision.reason.includes("protected Autopilot state"), `Expected protected-state reason, got ${decision.reason}.`);
}

function assertGuardAllowed(decision: AutopilotProtectedPathGuardDecision): void {
  assert(decision.action === "allow", `Expected protected path guard allow, got ${decision.action}: ${JSON.stringify(decision)}`);
  assert(decision.paths.length === 0, `Allowed decision must not expose paths, got ${JSON.stringify(decision.paths)}.`);
}

const tests: TestCase[] = [
  {
    name: "protected path guard covers shared contract patterns",
    run: () => {
      assert(JSON.stringify(autopilotProtectedPathPatterns) === JSON.stringify(["openspec/changes/*/automation/**", ".autopilot/**"]), `Unexpected protected path contract: ${JSON.stringify(autopilotProtectedPathPatterns)}.`);
      assertGuardBlocked(
        guardAutopilotProtectedPathToolCall("write", { filePath: "openspec/changes/change-a/automation/runtime.json", content: "{}" }),
        "openspec/changes/change-a/automation/runtime.json",
      );
      assertGuardBlocked(
        guardAutopilotProtectedPathToolCall("write", { filePath: ".autopilot/state.json", content: "{}" }),
        ".autopilot/state.json",
      );
    },
  },
  {
    name: "protected path guard blocks apply_patch edits to Autopilot state",
    run: () => {
      assertGuardBlocked(
        guardAutopilotProtectedPathToolCall("apply_patch", {
          patchText: "*** Begin Patch\n*** Update File: openspec/changes/change-a/automation/task.json\n@@\n-{}\n+{}\n*** End Patch",
        }),
        "openspec/changes/change-a/automation/task.json",
      );
      assertGuardBlocked(
        guardAutopilotProtectedPathToolCall("apply_patch", {
          patchText: "*** Begin Patch\n*** Add File: .autopilot/state.json\n+{}\n*** End Patch",
        }),
        ".autopilot/state.json",
      );
      assertGuardBlocked(
        guardAutopilotProtectedPathToolCall("apply_patch", { text: "missing canonical patchText" }),
        "unclassified",
      );
      assertGuardAllowed(guardAutopilotProtectedPathToolCall("apply_patch", {
        patchText: "*** Begin Patch\n*** Update File: openspec/changes/change-a/tasks.md\n@@\n-- [ ] Task\n+- [x] Task\n*** End Patch",
      }));
    },
  },
  {
    name: "protected path guard blocks direct edit and write tool paths",
    run: () => {
      assertGuardBlocked(
        guardAutopilotProtectedPathToolCall("write", { filePath: "openspec/changes/change-a/automation/feedback/reviewer.json", content: "{}" }),
        "automation/feedback/reviewer.json",
      );
      assertGuardBlocked(
        guardAutopilotProtectedPathToolCall("serena_create_text_file", { relative_path: ".autopilot/prototype/tasks/task.json", content: "{}" }),
        ".autopilot/prototype/tasks/task.json",
      );
      for (const tool of ["serena_insert_after_symbol", "serena_insert_before_symbol", "serena_rename_symbol", "serena_safe_delete_symbol"] as const) {
        assertGuardBlocked(
          guardAutopilotProtectedPathToolCall(tool, { relative_path: "openspec/changes/change-a/automation/task.json", name_path: "Task" }),
          "openspec/changes/change-a/automation/task.json",
        );
      }
      assertGuardBlocked(
        guardAutopilotProtectedPathToolCall("write", { content: "{}" }),
        "unclassified",
      );
      assertGuardBlocked(
        guardAutopilotProtectedPathToolCall("write", { filePath: "C:/repo/.autopilot/state.json", content: "{}" }),
        ".autopilot/state.json",
      );
      assertGuardBlocked(
        guardAutopilotProtectedPathToolCall("write", { filePath: "openspec/changes/change-a/tmp/../automation/task.json", content: "{}" }),
        "openspec/changes/change-a/automation/task.json",
      );
      assertGuardBlocked(
        guardAutopilotProtectedPathToolCall("future_write_tool", { filePath: "openspec/changes/change-a/automation/runtime.json", content: "{}" }),
        "openspec/changes/change-a/automation/runtime.json",
      );
      for (const key of ["target", "filename", "destination"] as const) {
        assertGuardBlocked(
          guardAutopilotProtectedPathToolCall("future_write_tool", { [key]: "openspec/changes/change-a/automation/runtime.json", content: "{}" }),
          "openspec/changes/change-a/automation/runtime.json",
        );
      }
      assertGuardAllowed(guardAutopilotProtectedPathToolCall("edit", { filePath: "openspec/changes/change-a/tasks.md", oldString: "- [ ]", newString: "- [x]" }));
      assertGuardAllowed(guardAutopilotProtectedPathToolCall("write", { filePath: "docs/autopilot.md", content: "safe" }));
    },
  },
  {
    name: "protected path guard blocks mutating bash commands targeting Autopilot state",
    run: () => {
      assertGuardBlocked(
        guardAutopilotProtectedPathToolCall("bash", { command: "Set-Content -LiteralPath \"openspec/changes/change-a/automation/task.json\" -Value '{}'" }),
        "openspec/changes/change-a/automation/task.json",
      );
      assertGuardBlocked(
        guardAutopilotProtectedPathToolCall("bash", { command: "Remove-Item -LiteralPath .autopilot/state.json" }),
        ".autopilot/state.json",
      );
      assertGuardBlocked(
        guardAutopilotProtectedPathToolCall("bash", { command: "node -e \"require('fs').writeFileSync('openspec/changes/change-a/automation/task.json','{}')\"" }),
        "openspec/changes/change-a/automation/task.json",
      );
      assertGuardBlocked(
        guardAutopilotProtectedPathToolCall("bash", { command: "printf '{}' | tee openspec/changes/change-a/automation/task.json" }),
        "openspec/changes/change-a/automation/task.json",
      );
      assertGuardBlocked(
        guardAutopilotProtectedPathToolCall("bash", { command: "sed -i s/a/b/ C:/repo/.autopilot/state.json" }),
        ".autopilot/state.json",
      );
      assertGuardBlocked(
        guardAutopilotProtectedPathToolCall("bash", { command: "rg foo docs > openspec/changes/change-a/automation/task.json" }),
        "openspec/changes/change-a/automation/task.json",
      );
      assertGuardBlocked(
        guardAutopilotProtectedPathToolCall("bash", { command: "Get-Content safe.txt | Set-Content openspec/changes/change-a/automation/task.json" }),
        "openspec/changes/change-a/automation/task.json",
      );
      assertGuardBlocked(guardAutopilotProtectedPathToolCall("bash", {}), "unclassified");
      assertGuardBlocked(guardAutopilotProtectedPathToolCall("bash", { cmd: "Set-Content openspec/changes/change-a/automation/task.json" }), "openspec/changes/change-a/automation/task.json");
      assertGuardAllowed(guardAutopilotProtectedPathToolCall("bash", { command: "Get-Content -LiteralPath \"openspec/changes/change-a/automation/task.json\"" }));
      assertGuardAllowed(guardAutopilotProtectedPathToolCall("bash", { command: "npm run autopilot:validate -- openspec/changes/change-a/automation/task.json" }));
      assertGuardAllowed(guardAutopilotProtectedPathToolCall("bash", { command: "Set-Content -LiteralPath docs/autopilot.md -Value safe" }));
    },
  },
  {
    name: "protected path guard blocks shell-like command tool aliases",
    run: () => {
      for (const [tool, args] of [
        ["serena_execute_shell_command", { command: "Set-Content openspec/changes/change-a/automation/task.json '{}'" }],
        ["execute_shell_command", { command: "Set-Content openspec/changes/change-a/automation/task.json '{}'" }],
        ["future_command_tool", { cmd: "Set-Content openspec/changes/change-a/automation/task.json '{}'" }],
        ["future_shell_tool", { script: "Set-Content openspec/changes/change-a/automation/task.json '{}'" }],
      ] as const) {
        assertGuardBlocked(guardAutopilotProtectedPathToolCall(tool, args), "openspec/changes/change-a/automation/task.json");
      }
      assertGuardAllowed(guardAutopilotProtectedPathToolCall("serena_execute_shell_command", { command: "Get-Content openspec/changes/change-a/automation/task.json" }));
    },
  },
  {
    name: "protected path guard rejects compound and cwd-relative shell bypasses",
    run: () => {
      for (const command of [
        "Get-Content openspec/changes/change-a/automation/task.json; Set-Content openspec/changes/change-a/automation/task.json '{}'",
        "Get-Content openspec/changes/change-a/automation/task.json && Set-Content openspec/changes/change-a/automation/task.json '{}'",
        "Get-Content openspec/changes/change-a/automation/task.json || Set-Content openspec/changes/change-a/automation/task.json '{}'",
        "Get-Content openspec/changes/change-a/automation/task.json\nSet-Content openspec/changes/change-a/automation/task.json '{}'",
        "Get-Content $(Set-Content openspec/changes/change-a/automation/task.json '{}')",
        "Get-Content `Set-Content openspec/changes/change-a/automation/task.json '{}'`",
      ] as const) {
        assertGuardBlocked(guardAutopilotProtectedPathToolCall("bash", { command }), "openspec/changes/change-a/automation/task.json");
      }
      assertGuardBlocked(
        guardAutopilotProtectedPathToolCall("bash", { command: "Set-Content task.json '{}'", workdir: "openspec/changes/change-a/automation" }),
        "openspec/changes/change-a/automation",
      );
      assertGuardBlocked(
        guardAutopilotProtectedPathToolCall("bash", { command: "Set-Content task.json '{}'", cwd: "openspec/changes/change-a/automation" }),
        "openspec/changes/change-a/automation",
      );
      assertGuardBlocked(
        guardAutopilotProtectedPathToolCall("bash", { command: "Set-Content automation/task.json '{}'", workdir: "openspec/changes/change-a" }),
        "openspec/changes/change-a/automation/task.json",
      );
      assertGuardAllowed(guardAutopilotProtectedPathToolCall("bash", { command: "Get-Content task.json", workdir: "openspec/changes/change-a/automation" }));
    },
  },
];

let failed = 0;
for (const test of tests) {
  try {
    await test.run();
    console.log(`PASS ${test.name}`);
  } catch (error) {
    failed++;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${test.name}\n${message}`);
  }
}

if (failed > 0) {
  console.error(`${failed} autopilot protected path guard test(s) failed.`);
  process.exit(1);
}

console.log(`OK: autopilot protected path guard tests=${tests.length}`);
