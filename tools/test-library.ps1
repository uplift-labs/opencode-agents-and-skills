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
---

You are a read-only demo reviewer.
"@
    Write-Text (Join-Path $dir "instructions/example.md") "# Example`n"
    Write-Text (Join-Path $dir "README.md") @"
# Fixture

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
        Name = "validator rejects catalog drift"
        Run = {
            $fixture = New-LibraryFixture "catalog-drift"
            Write-Text (Join-Path $fixture "README.md") @"
# Fixture

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
        Name = "validator ignores local serena markdown"
        Run = {
            $fixture = New-LibraryFixture "ignored-serena"
            Write-Text (Join-Path $fixture ".serena/memory.md") "# Local Memory   `n"
            Assert-Success (Invoke-Validator $fixture) "Ignored .serena markdown should not affect validation."
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
