#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

type ProcessResult = {
  exitCode: number;
  output: string;
};

type TestCase = {
  name: string;
  run: () => void;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validator = path.join(root, "tools", "validate-library.ts");

const requiredScripts = {
  "install:global": "node tools/install-opencode-global.ts",
  "init:project": "node tools/init-project.ts",
  doctor: "node tools/doctor.ts",
  "project:inventory": "node tools/project-inventory.ts",
  "instruction:inventory": "node tools/instruction-artifacts-inventory.ts",
  "code-quality:inventory": "node tools/code-quality-inventory.ts",
  "autopilot:validate": "node tools/autopilot-ledger.ts",
  "autopilot:evidence": "node tools/autopilot-evidence.ts",
  "autopilot:check": "node tools/autopilot-check.ts",
  "openspec:validate": "openspec validate --all",
  "openspec:gate": "node tools/openspec-operation-gate.ts",
  "openspec:retro-gate": "node tools/openspec-retro-gate.ts",
  "openspec:retro-followups": "node tools/openspec-retro-followups.ts",
  "prepush:validate": "node tools/pre-push-validate.ts",
  validate: "node tools/validate-library.ts",
  "validate:strict": "node tools/validate-library.ts --fail-on-warnings",
  test: "node tools/test-library.ts",
} as const;

function newTempDir(name: string): string {
  const parent = path.join(os.tmpdir(), "agents-and-skills-validation-script-tests");
  fs.mkdirSync(parent, { recursive: true });
  const dir = path.join(parent, `${name}-${crypto.randomUUID().replace(/-/g, "")}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function withTempDir(name: string, run: (fixture: string) => void): void {
  const fixture = newTempDir(name);
  try {
    run(fixture);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

function writePackageJson(fixtureRoot: string, scripts: Record<string, string>): void {
  fs.writeFileSync(path.join(fixtureRoot, "package.json"), `${JSON.stringify({ name: "opencode-dev-kit-fixture", private: true, type: "module", scripts }, null, 2)}\n`, "utf8");
}

function invokeValidator(fixtureRoot: string): ProcessResult {
  const result = spawnSync("node", [validator, "--root", fixtureRoot], { cwd: root, encoding: "utf8", shell: false });
  if (result.error) {
    throw result.error;
  }
  return {
    exitCode: result.status ?? 0,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function assertFailure(result: ProcessResult, message: string): void {
  if (result.exitCode === 0) {
    throw new Error(`${message}\nOutput:\n${result.output}`);
  }
}

function assertOutputContains(result: ProcessResult, expected: string, message: string): void {
  if (!result.output.includes(expected)) {
    throw new Error(`${message}\nExpected output to include: ${expected}\nActual output:\n${result.output}`);
  }
}

function withoutScript(name: keyof typeof requiredScripts): Record<string, string> {
  const scripts = { ...requiredScripts };
  delete scripts[name];
  return scripts;
}

function withScript(name: keyof typeof requiredScripts, command: string): Record<string, string> {
  return { ...requiredScripts, [name]: command };
}

const tests: TestCase[] = [
  {
    name: "validator rejects missing documented Autopilot validation script",
    run: () => {
      withTempDir("missing-autopilot-validation-script", (fixture) => {
        writePackageJson(fixture, withoutScript("autopilot:validate"));
        const result = invokeValidator(fixture);
        assertFailure(result, "Missing documented Autopilot validation script should fail validation.");
        assertOutputContains(result, "autopilot:validate", "Missing Autopilot validation script should name the required script.");
      });
    },
  },
  {
    name: "validator rejects missing documented OpenSpec validation script",
    run: () => {
      withTempDir("missing-openspec-validation-script", (fixture) => {
        writePackageJson(fixture, withoutScript("openspec:validate"));
        const result = invokeValidator(fixture);
        assertFailure(result, "Missing documented OpenSpec validation script should fail validation.");
        assertOutputContains(result, "openspec:validate", "Missing OpenSpec validation script should name the required script.");
      });
    },
  },
  {
    name: "validator rejects missing documented Autopilot evidence script",
    run: () => {
      withTempDir("missing-autopilot-evidence-script", (fixture) => {
        writePackageJson(fixture, withoutScript("autopilot:evidence"));
        const result = invokeValidator(fixture);
        assertFailure(result, "Missing documented Autopilot evidence script should fail validation.");
        assertOutputContains(result, "autopilot:evidence", "Missing Autopilot evidence script should name the required script.");
      });
    },
  },
  {
    name: "validator rejects missing documented Autopilot check script",
    run: () => {
      withTempDir("missing-autopilot-check-script", (fixture) => {
        writePackageJson(fixture, withoutScript("autopilot:check"));
        const result = invokeValidator(fixture);
        assertFailure(result, "Missing documented Autopilot check script should fail validation.");
        assertOutputContains(result, "autopilot:check", "Missing Autopilot check script should name the required script.");
      });
    },
  },
  {
    name: "validator rejects wrong documented OpenSpec validation script",
    run: () => {
      withTempDir("wrong-openspec-validation-script", (fixture) => {
        writePackageJson(fixture, withScript("openspec:validate", "openspec validate"));
        const result = invokeValidator(fixture);
        assertFailure(result, "Wrong documented OpenSpec validation script should fail validation.");
        assertOutputContains(result, "openspec:validate", "Wrong OpenSpec validation script should name the script.");
        assertOutputContains(result, "openspec validate --all", "Wrong OpenSpec validation script should name the required command.");
      });
    },
  },
  {
    name: "validator rejects missing documented OpenSpec retro gate script",
    run: () => {
      withTempDir("missing-openspec-retro-gate-script", (fixture) => {
        writePackageJson(fixture, withoutScript("openspec:retro-gate"));
        const result = invokeValidator(fixture);
        assertFailure(result, "Missing documented OpenSpec retro gate script should fail validation.");
        assertOutputContains(result, "openspec:retro-gate", "Missing OpenSpec retro gate script should name the required script.");
      });
    },
  },
  {
    name: "validator rejects missing documented OpenSpec retro followups script",
    run: () => {
      withTempDir("missing-openspec-retro-followups-script", (fixture) => {
        writePackageJson(fixture, withoutScript("openspec:retro-followups"));
        const result = invokeValidator(fixture);
        assertFailure(result, "Missing documented OpenSpec retro followups script should fail validation.");
        assertOutputContains(result, "openspec:retro-followups", "Missing OpenSpec retro followups script should name the required script.");
      });
    },
  },
  {
    name: "validator rejects markdown automation wrapper artifacts",
    run: () => {
      withTempDir("markdown-automation-wrapper", (fixture) => {
        writePackageJson(fixture, { ...requiredScripts });
        const wrapper = path.join(fixture, "openspec", "changes", "example", "automation", "review.md");
        fs.mkdirSync(path.dirname(wrapper), { recursive: true });
        fs.writeFileSync(wrapper, "# Review\n\nMachine-read wrapper that should be JSON.\n", "utf8");
        const result = invokeValidator(fixture);
        assertFailure(result, "Markdown automation wrapper must fail validation.");
        assertOutputContains(result, "automation wrapper Markdown artifact is not allowed", "Wrapper error should explain JSON-only rule.");
        assertOutputContains(result, "automation/review.json", "Wrapper error should name canonical JSON replacement.");
      });
    },
  },
];

let failed = 0;
for (const test of tests) {
  try {
    test.run();
    console.log(`PASS: ${test.name}`);
  } catch (error) {
    failed++;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL: ${test.name}\n${message}`);
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log(`OK: library validation script tests=${tests.length}`);
