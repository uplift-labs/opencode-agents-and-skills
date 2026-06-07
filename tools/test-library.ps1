param(
    [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$validator = Join-Path $Root "tools/validate-library.ps1"
$installer = Join-Path $Root "tools/install-opencode-global.js"

function New-TempDir([string]$name) {
    $parent = Join-Path ([System.IO.Path]::GetTempPath()) "agents-and-skills-tests"
    [System.IO.Directory]::CreateDirectory($parent) | Out-Null
    $dir = Join-Path $parent "$name-$([System.Guid]::NewGuid().ToString('N'))"
    [System.IO.Directory]::CreateDirectory($dir) | Out-Null
    return $dir
}

function Write-Text([string]$path, [string]$content) {
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($path)) | Out-Null
    [System.IO.File]::WriteAllText($path, $content.Replace("`n", [System.Environment]::NewLine))
}

function New-LibraryFixture([string]$name) {
    $dir = New-TempDir $name
    Write-Text (Join-Path $dir ".gitignore") ".serena/`n"
    Write-Text (Join-Path $dir ".opencode/skills/demo-skill/SKILL.md") @"
---
name: demo-skill
description: Use when testing a demo reusable skill.
license: MIT
---

# Demo Skill
"@
    Write-Text (Join-Path $dir ".opencode/agents/demo-reviewer.md") @"
---
description: Reviews demo fixture behavior.
mode: subagent
permission:
  read: allow
  glob: allow
  grep: allow
  list: allow
  bash: deny
  edit: deny
  task: deny
  question: deny
  skill: deny
  webfetch: deny
  websearch: deny
  todowrite: deny
  external_directory: deny
  lsp: deny
  doom_loop: deny
---

You are a read-only demo reviewer.
"@
    Write-Text (Join-Path $dir "instructions/example.md") "# Example`n"
    Write-Text (Join-Path $dir "AGENTS.md") @"
# Repository Instructions

## Completion Handoff

- Ask the user only for real blockers, remote/destructive actions, scope or risk decisions, credentials, and MR/PR outcomes.
- When asking, offer 2-4 self-contained next actions via ``question`` when available.
- Put the recommended option first and end its label with ``(Recommended)``.
- In read-only, no-question, or subagent contexts, return ``Suggested Next Options`` or ``Actionable Continuation Items`` instead of asking the user directly.

## Autonomous Work Contract

- The main session owns skill selection, decomposition, validation, reviewer gates, and ready-to-land handoff.
"@
    Write-Text (Join-Path $dir "README.md") @"
# Fixture

## Routing Map

- Default broad work -> ``adaptive-delivery``.
- Instruction artifacts -> ``instruction-artifact-tuning``; broad audits -> ``instruction-artifact-audit-runbook.md``.

## Reviewer Gate Map

- Instruction artifacts -> ``instruction-artifact-reviewer``.

## Skill Catalog

- ``demo-skill``: Demo skill.

## Agent Catalog

- ``demo-reviewer``: Demo reviewer.

## Instruction Templates

- ``example.md``: Demo instruction.

## Porting Notes
"@
    return $dir
}

function Invoke-ProcessCapture([string]$file, [string[]]$arguments, [string]$workingDirectory) {
    $oldLocation = Get-Location
    try {
        Set-Location -LiteralPath $workingDirectory
        $output = & $file @arguments 2>&1
        $exitCode = $LASTEXITCODE
        if ($null -eq $exitCode) {
            $exitCode = 0
        }
        return [pscustomobject]@{
            ExitCode = $exitCode
            Output = ($output | Out-String)
        }
    } finally {
        Set-Location -LiteralPath $oldLocation
    }
}

function Invoke-Validator([string]$fixtureRoot) {
    return Invoke-ProcessCapture "pwsh" @("-NoProfile", "-File", $validator, "-Root", $fixtureRoot) $Root
}

function Invoke-Installer([string[]]$arguments) {
    $allArguments = @($installer) + $arguments
    return Invoke-ProcessCapture "node" $allArguments $Root
}

function Assert-Success([object]$result, [string]$message) {
    if ($result.ExitCode -ne 0) {
        throw "$message`nExitCode: $($result.ExitCode)`nOutput:`n$($result.Output)"
    }
}

function Assert-Failure([object]$result, [string]$message) {
    if ($result.ExitCode -eq 0) {
        throw "$message`nExpected failure but command succeeded.`nOutput:`n$($result.Output)"
    }
}

function Assert-OutputContains([object]$result, [string]$needle, [string]$message) {
    if (-not $result.Output.Contains($needle)) {
        throw "$message`nExpected output to contain: $needle`nOutput:`n$($result.Output)"
    }
}

$tests = @(
    @{
        Name = "validator accepts valid fixture"
        Run = {
            $fixture = New-LibraryFixture "valid"
            Assert-Success (Invoke-Validator $fixture) "Valid fixture should pass validation."
        }
    },
    @{
        Name = "validator rejects invalid YAML-like frontmatter"
        Run = {
            $fixture = New-LibraryFixture "invalid-frontmatter"
            Write-Text (Join-Path $fixture ".opencode/skills/demo-skill/SKILL.md") @"
---
name: demo-skill
description: Invalid: unquoted colon-space scalar.
license: MIT
---

# Demo Skill
"@
            Assert-Failure (Invoke-Validator $fixture) "Invalid frontmatter should fail validation."
        }
    },
    @{
        Name = "validator ignores body-only metadata"
        Run = {
            $fixture = New-LibraryFixture "body-metadata"
            Write-Text (Join-Path $fixture ".opencode/skills/demo-skill/SKILL.md") @"
# Demo Skill

name: demo-skill
description: Body metadata must not count as frontmatter.
"@
            Assert-Failure (Invoke-Validator $fixture) "Body-only metadata should not satisfy frontmatter requirements."
        }
    },
    @{
        Name = "validator rejects bare required scalars"
        Run = {
            $fixture = New-LibraryFixture "bare-description"
            Write-Text (Join-Path $fixture ".opencode/skills/demo-skill/SKILL.md") @"
---
name: demo-skill
description:
license: MIT
---

# Demo Skill
"@
            Assert-Failure (Invoke-Validator $fixture) "Bare required scalar fields should fail validation."
        }
    },
    @{
        Name = "validator rejects unsafe reviewer permissions"
        Run = {
            $fixture = New-LibraryFixture "unsafe-permissions"
            Write-Text (Join-Path $fixture ".opencode/agents/demo-reviewer.md") @"
---
description: Reviews demo fixture behavior.
mode: subagent
permission:
  read: allow
  glob: allow
  grep: allow
  list: allow
  bash: ask
  edit: deny
  task: deny
  question: deny
  skill: allow
---

You are a read-only demo reviewer.
"@
            Assert-Failure (Invoke-Validator $fixture) "Unsafe reviewer permissions should fail validation."
        }
    },
    @{
        Name = "validator rejects incomplete reviewer permissions"
        Run = {
            $fixture = New-LibraryFixture "incomplete-reviewer-permissions"
            Write-Text (Join-Path $fixture ".opencode/agents/demo-reviewer.md") @"
---
description: Reviews demo fixture behavior.
mode: subagent
permission:
  read: allow
  glob: allow
  grep: allow
  list: allow
  bash: deny
  edit: deny
  task: deny
  question: deny
  skill: deny
---

You are a read-only demo reviewer.
"@
            $result = Invoke-Validator $fixture
            Assert-Failure $result "Incomplete reviewer permissions should fail validation."
            Assert-OutputContains $result "webfetch: deny" "Incomplete reviewer permissions should name the missing deny key."
        }
    },
    @{
        Name = "validator rejects catalog drift"
        Run = {
            $fixture = New-LibraryFixture "catalog-drift"
            Write-Text (Join-Path $fixture "README.md") @"
# Fixture

## Routing Map

- Default broad work -> ``adaptive-delivery``.

## Reviewer Gate Map

- Instruction artifacts -> ``instruction-artifact-reviewer``.

## Skill Catalog

## Agent Catalog

- ``demo-reviewer``: Demo reviewer.

## Instruction Templates

- ``example.md``: Demo instruction.

## Porting Notes
"@
            Assert-Failure (Invoke-Validator $fixture) "README catalog drift should fail validation."
        }
    },
    @{
        Name = "validator rejects missing routing map"
        Run = {
            $fixture = New-LibraryFixture "missing-routing-map"
            Write-Text (Join-Path $fixture "README.md") @"
# Fixture

## Reviewer Gate Map

- Instruction artifacts -> ``instruction-artifact-reviewer``.

## Skill Catalog

- ``demo-skill``: Demo skill.

## Agent Catalog

- ``demo-reviewer``: Demo reviewer.

## Instruction Templates

- ``example.md``: Demo instruction.

## Porting Notes
"@
            $result = Invoke-Validator $fixture
            Assert-Failure $result "Missing routing map should fail validation."
            Assert-OutputContains $result "Missing README section 'Routing Map'" "Missing routing map should explain the section gap."
        }
    },
    @{
        Name = "validator rejects empty reviewer gate map"
        Run = {
            $fixture = New-LibraryFixture "empty-reviewer-map"
            Write-Text (Join-Path $fixture "README.md") @"
# Fixture

## Routing Map

- Default broad work -> ``adaptive-delivery``.

## Reviewer Gate Map

## Skill Catalog

- ``demo-skill``: Demo skill.

## Agent Catalog

- ``demo-reviewer``: Demo reviewer.

## Instruction Templates

- ``example.md``: Demo instruction.

## Porting Notes
"@
            $result = Invoke-Validator $fixture
            Assert-Failure $result "Empty reviewer gate map should fail validation."
            Assert-OutputContains $result "README reviewer gate map must include at least one bullet" "Empty reviewer gate map should explain the bullet gap."
        }
    },
    @{
        Name = "validator rejects missing instruction audit route"
        Run = {
            $fixture = New-LibraryFixture "missing-instruction-audit-route"
            Write-Text (Join-Path $fixture "README.md") @"
# Fixture

## Routing Map

- Default broad work -> ``adaptive-delivery``.

## Reviewer Gate Map

- Instruction artifacts -> ``instruction-artifact-reviewer``.

## Skill Catalog

- ``demo-skill``: Demo skill.

## Agent Catalog

- ``demo-reviewer``: Demo reviewer.

## Instruction Templates

- ``example.md``: Demo instruction.

## Porting Notes
"@
            $result = Invoke-Validator $fixture
            Assert-Failure $result "Missing instruction audit route should fail validation."
            Assert-OutputContains $result "instruction-artifact-audit-runbook.md" "Missing instruction audit route should explain the route gap."
        }
    },
    @{
        Name = "validator rejects missing completion handoff"
        Run = {
            $fixture = New-LibraryFixture "missing-completion-handoff"
            Write-Text (Join-Path $fixture "AGENTS.md") @"
# Repository Instructions

- Keep artifacts reusable.
"@
            Assert-Failure (Invoke-Validator $fixture) "Missing completion handoff should fail validation."
        }
    },
    @{
        Name = "validator rejects routine question handoff"
        Run = {
            $fixture = New-LibraryFixture "routine-question-handoff"
            Write-Text (Join-Path $fixture "AGENTS.md") @"
# Repository Instructions

## Completion Handoff

- After non-trivial user-visible work, the main session offers 2-4 self-contained next actions via ``question`` when available.
- Put the recommended option first and end its label with ``(Recommended)``.
- In read-only, no-question, or subagent contexts, return ``Suggested Next Options`` or ``Actionable Continuation Items`` instead of asking the user directly.

## Autonomous Work Contract

- Ask the user only for real blockers, remote/destructive actions, scope or risk decisions, credentials, and MR/PR outcomes.
"@
            $result = Invoke-Validator $fixture
            Assert-Failure $result "Routine question handoff should fail validation."
            Assert-OutputContains $result "routine post-task question handoff" "Routine question handoff should explain the autonomy regression."
        }
    },
    @{
        Name = "validator rejects self-improvement loops"
        Run = {
            $fixture = New-LibraryFixture "self-improvement-loop"
            Write-Text (Join-Path $fixture ".opencode/skills/demo-skill/SKILL.md") @"
---
name: demo-skill
description: Use when testing a demo reusable skill.
---

# Demo Skill

### Step 4 - Self-Improvement

> Core principle - do not remove.

Update this skill after every run.
"@
            $result = Invoke-Validator $fixture
            Assert-Failure $result "Self-improvement loops should fail validation."
            Assert-OutputContains $result "automatic self-improvement/self-edit loops" "Self-improvement loop should explain the autonomy regression."
        }
    },
    @{
        Name = "validator ignores local serena markdown"
        Run = {
            $fixture = New-LibraryFixture "ignored-serena"
            Write-Text (Join-Path $fixture ".serena/memory.md") "# Local Memory   `n"
            Assert-Success (Invoke-Validator $fixture) "Ignored .serena markdown should not affect validation."
        }
    },
    @{
        Name = "validator warns on implementation language without TDD"
        Run = {
            $fixture = New-LibraryFixture "tdd-warning"
            Write-Text (Join-Path $fixture ".opencode/skills/demo-skill/SKILL.md") @"
---
name: demo-skill
description: Use when testing a demo reusable skill.
---

# Demo Skill

This skill can implement code changes.
"@
            $result = Invoke-Validator $fixture
            Assert-Success $result "TDD warning should not fail validation."
            Assert-OutputContains $result "WARN:" "TDD warning should be visible."
        }
    },
    @{
        Name = "validator rejects retro shared-url and ledger ambiguity"
        Run = {
            $fixture = New-LibraryFixture "retro-privacy-boundary"
            Write-Text (Join-Path $fixture ".opencode/skills/demo-skill/SKILL.md") @"
---
name: demo-skill
description: Analyze bounded OpenCode session history for workflow improvements.
---

# Demo Skill

Use this skill for session retros.

- Exported transcripts, copied chat logs, shared URLs, or user-provided archives.

1. Build an evidence ledger for all sessions in scope.
"@
            $result = Invoke-Validator $fixture
            Assert-Failure $result "Retro skills with shared URLs and ledgers need explicit privacy boundaries."
            Assert-OutputContains $result "remote/shared URL access" "Shared URL ambiguity should explain the approval requirement."
            Assert-OutputContains $result "session ledger" "Session ledger ambiguity should explain redaction and write approval."
        }
    },
    @{
        Name = "validator accepts retro approved privacy boundaries"
        Run = {
            $fixture = New-LibraryFixture "retro-approved-privacy"
            Write-Text (Join-Path $fixture ".opencode/skills/demo-skill/SKILL.md") @"
---
name: demo-skill
description: Analyze bounded OpenCode session history for workflow improvements.
---

# Demo Skill

Default mode is read-only analysis. Write generated ledgers, fetch remote/shared URLs, or use authenticated remote sources only when the user explicitly grants that scope.

- Exported transcripts, copied chat logs, user-approved shared URLs, or user-provided archives.

1. Build a redacted evidence ledger for all sessions in scope. Keep it inline by default; write a generated ledger file only when the user approved the path and write scope.
"@
            Assert-Success (Invoke-Validator $fixture) "Approved retro privacy boundaries should pass validation."
        }
    },
    @{
        Name = "validator accepts retro prohibition privacy boundaries"
        Run = {
            $fixture = New-LibraryFixture "retro-prohibition-privacy"
            Write-Text (Join-Path $fixture ".opencode/skills/demo-skill/SKILL.md") @"
---
name: demo-skill
description: Analyze bounded OpenCode session history for workflow improvements.
---

# Demo Skill

This skill reviews session history.

Shared URLs are out of scope.

Do not build a ledger for session history.
"@
            Assert-Success (Invoke-Validator $fixture) "Explicitly prohibited shared URLs and ledgers should pass validation."
        }
    },
    @{
        Name = "validator rejects forbidden anchors"
        Run = {
            $fixture = New-LibraryFixture "forbidden-anchor"
            Write-Text (Join-Path $fixture "instructions/example.md") "# Example`nOldProductName`n"
            $result = Invoke-ProcessCapture "pwsh" @("-NoProfile", "-File", $validator, "-Root", $fixture, "-ForbiddenAnchor", "OldProductName") $Root
            Assert-Failure $result "Forbidden anchors should fail validation."
            Assert-OutputContains $result "Forbidden anchor 'OldProductName'" "Forbidden anchor failure should name the anchor."
        }
    },
    @{
        Name = "installer dry-run writes nothing"
        Run = {
            $configDir = Join-Path (New-TempDir "installer-dry-run") "config"
            $result = Invoke-Installer @("--dry-run", "--config-dir", $configDir)
            Assert-Success $result "Installer dry-run should succeed."
            if ([System.IO.Directory]::Exists($configDir)) {
                throw "Installer dry-run created config directory: $configDir"
            }
        }
    },
    @{
        Name = "installer rejects source-nested config dir"
        Run = {
            $configDir = Join-Path $Root ".opencode/skills/adaptive-delivery/install-target"
            Assert-Failure (Invoke-Installer @("--dry-run", "--config-dir", $configDir)) "Installer should reject config paths nested inside source skills."
        }
    },
    @{
        Name = "installer rejects source-parent config dirs"
        Run = {
            Assert-Failure (Invoke-Installer @("--dry-run", "--config-dir", (Join-Path $Root ".opencode"))) "Installer should reject config paths that contain source artifacts."
            Assert-Failure (Invoke-Installer @("--dry-run", "--config-dir", $Root)) "Installer should reject repository root as config path."
        }
    },
    @{
        Name = "installer rejects duplicate AGENTS markers"
        Run = {
            $configDir = Join-Path (New-TempDir "installer-markers") "config"
            Write-Text (Join-Path $configDir "AGENTS.md") @"
before
<!-- agents-and-skills:begin -->
old
<!-- agents-and-skills:end -->
middle
<!-- agents-and-skills:begin -->
older
<!-- agents-and-skills:end -->
"@
            Assert-Failure (Invoke-Installer @("--dry-run", "--config-dir", $configDir)) "Duplicate AGENTS.md markers should fail."
        }
    }
)

$failed = 0
foreach ($test in $tests) {
    try {
        & $test.Run
        "PASS: $($test.Name)"
    } catch {
        $failed++
        "FAIL: $($test.Name)"
        $_.Exception.Message
    }
}

if ($failed -gt 0) {
    throw "$failed library test(s) failed."
}

"OK: library tests=$($tests.Count)"
