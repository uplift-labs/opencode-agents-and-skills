param(
    [string]$Root = (Split-Path -Parent $PSScriptRoot),
    [string[]]$ForbiddenAnchor = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$errors = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

function Add-Error([string]$message) {
    $errors.Add($message) | Out-Null
}

function Add-Warning([string]$message) {
    $warnings.Add($message) | Out-Null
}

function Read-Text([string]$path) {
    return [System.IO.File]::ReadAllText($path)
}

function ConvertFrom-FrontmatterScalar([string]$value, [string]$file, [int]$lineNumber) {
    $trimmed = $value.Trim()
    $doubleQuoted = $trimmed.StartsWith('"') -or $trimmed.EndsWith('"')
    $singleQuoted = $trimmed.StartsWith("'") -or $trimmed.EndsWith("'")
    if (($doubleQuoted -and -not ($trimmed.StartsWith('"') -and $trimmed.EndsWith('"'))) -or
        ($singleQuoted -and -not ($trimmed.StartsWith("'") -and $trimmed.EndsWith("'")))) {
        Add-Error "Invalid frontmatter quoting: ${file}:$lineNumber"
        return $trimmed
    }
    if (-not $doubleQuoted -and -not $singleQuoted -and $trimmed -match ':\s') {
        Add-Error "Invalid unquoted frontmatter scalar containing ': ': ${file}:$lineNumber"
    }
    if (($trimmed.StartsWith('"') -and $trimmed.EndsWith('"')) -or
        ($trimmed.StartsWith("'") -and $trimmed.EndsWith("'"))) {
        return $trimmed.Substring(1, $trimmed.Length - 2)
    }
    return $trimmed
}

function Get-FrontmatterMap([string]$text, [string]$file) {
    $match = [regex]::Match($text, "\A---\r?\n(?<body>[\s\S]*?)\r?\n---(?:\r?\n|\z)")
    $values = @{}
    if (-not $match.Success) {
        Add-Error "Missing leading frontmatter block: $file"
        return $values
    }

    $currentMap = $null
    $lines = $match.Groups['body'].Value -split "\r?\n"
    for ($i = 0; $i -lt $lines.Length; $i++) {
        $lineNumber = $i + 2
        $line = $lines[$i]
        if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith('#')) {
            continue
        }
        if ($line -match '^([A-Za-z_][A-Za-z0-9_-]*):\s*$') {
            $currentMap = $matches[1]
            $values[$currentMap] = @{}
        } elseif ($line -match '^([A-Za-z_][A-Za-z0-9_-]*):\s*(.+?)\s*$') {
            $currentMap = $null
            $values[$matches[1]] = ConvertFrom-FrontmatterScalar $matches[2] $file $lineNumber
        } elseif ($line -match '^\s{2,}([A-Za-z_][A-Za-z0-9_-]*):\s*(.+?)\s*$') {
            if ([string]::IsNullOrWhiteSpace($currentMap)) {
                Add-Error "Nested frontmatter value without parent map: ${file}:$lineNumber"
            } else {
                $values["$currentMap.$($matches[1])"] = ConvertFrom-FrontmatterScalar $matches[2] $file $lineNumber
            }
        } else {
            Add-Error "Unsupported frontmatter syntax: ${file}:$lineNumber"
        }
    }
    return $values
}

function Get-MarkdownFiles([string]$root) {
    $git = Get-Command git -ErrorAction SilentlyContinue
    $gitDir = Join-Path $root ".git"
    if ($git -and ([System.IO.Directory]::Exists($gitDir) -or [System.IO.File]::Exists($gitDir))) {
        $relativeFiles = & git -C $root ls-files --cached --others --exclude-standard "*.md" 2>$null
        if ($LASTEXITCODE -eq 0) {
            return @($relativeFiles |
                Where-Object { $_ -and ($_ -replace '\\', '/') -notmatch '(^|/)\.serena/' } |
                ForEach-Object { Join-Path $root $_ })
        }
    }

    return @([System.IO.Directory]::GetFiles($root, "*.md", [System.IO.SearchOption]::AllDirectories) |
        Where-Object { $_ -notmatch "[\\/]\.git[\\/]" -and $_ -notmatch "[\\/]\.serena[\\/]" })
}

function Get-CatalogEntries([string]$readmeText, [string]$startHeading, [string]$endHeading, [string]$readmePath) {
    $pattern = '(?ms)^##\s+' + [regex]::Escape($startHeading) + '\s*$\r?\n(?<body>.*?)^##\s+' + [regex]::Escape($endHeading) + '\s*$'
    $match = [regex]::Match($readmeText, $pattern)
    if (-not $match.Success) {
        Add-Error "Missing README catalog section '$startHeading': $readmePath"
        return @()
    }

    $entries = New-Object System.Collections.Generic.List[string]
    foreach ($entry in [regex]::Matches($match.Groups['body'].Value, '(?m)^-\s+`([^`]+)`:')) {
        $entries.Add($entry.Groups[1].Value) | Out-Null
    }
    return @($entries)
}

function Get-RequiredHeadingSection([string]$readmeText, [string]$heading, [string]$readmePath) {
    $pattern = '(?ms)^##\s+' + [regex]::Escape($heading) + '\s*$\r?\n(?<body>.*?)(?=^##\s+|\z)'
    $match = [regex]::Match($readmeText, $pattern)
    if (-not $match.Success) {
        Add-Error "Missing README section '$heading': $readmePath"
        return ""
    }
    return $match.Groups['body'].Value
}

function Require-BulletedSection([string]$body, [string]$label, [string]$file) {
    if ($body -notmatch '(?m)^-\s+\S') {
        Add-Error "$label must include at least one bullet: $file"
    }
}

function Compare-Catalog([string]$label, [string[]]$expected, [string[]]$actual, [string]$readmePath) {
    $expectedSorted = @($expected | Sort-Object)
    $actualSorted = @($actual | Sort-Object)
    foreach ($name in $expectedSorted) {
        if ($actualSorted -notcontains $name) {
            Add-Error "$label catalog missing '$name': $readmePath"
        }
    }
    foreach ($name in $actualSorted) {
        if ($expectedSorted -notcontains $name) {
            Add-Error "$label catalog references missing artifact '$name': $readmePath"
        }
    }
}

function Require-TextContains([string]$text, [string]$needle, [string]$label, [string]$file) {
    if (-not $text.Contains($needle)) {
        Add-Error "$label must include '$needle': $file"
    }
}

function Get-RequiredScalar([hashtable]$frontmatter, [string]$key, [string]$file) {
    if (-not $frontmatter.ContainsKey($key)) {
        return $null
    }
    $value = $frontmatter[$key]
    if ($value -is [System.Collections.IDictionary]) {
        Add-Error "Frontmatter field must be a scalar: ${file}:$key"
        return $null
    }
    return [string]$value
}

$skillsDir = Join-Path $Root ".opencode/skills"
$agentsDir = Join-Path $Root ".opencode/agents"

if (-not [System.IO.Directory]::Exists($skillsDir)) {
    Add-Error "Missing skills directory: $skillsDir"
}

if (-not [System.IO.Directory]::Exists($agentsDir)) {
    Add-Error "Missing agents directory: $agentsDir"
}

$skillCount = 0
$skillNames = New-Object System.Collections.Generic.List[string]
if ([System.IO.Directory]::Exists($skillsDir)) {
    $skillDirs = [System.IO.Directory]::GetDirectories($skillsDir)
    foreach ($dir in $skillDirs) {
        $skillCount++
        $folderName = [System.IO.Path]::GetFileName($dir)
        $skillNames.Add($folderName) | Out-Null
        $file = Join-Path $dir "SKILL.md"
        if (-not [System.IO.File]::Exists($file)) {
            Add-Error "Missing SKILL.md for skill folder: $folderName"
            continue
        }
        $text = Read-Text $file
        $frontmatter = Get-FrontmatterMap $text $file
        $name = Get-RequiredScalar $frontmatter "name" $file
        $description = Get-RequiredScalar $frontmatter "description" $file
        if ([string]::IsNullOrWhiteSpace($name)) {
            Add-Error "Missing skill name: $file"
        } elseif ($name -ne $folderName) {
            Add-Error "Skill name mismatch: folder=$folderName name=$name"
        } elseif ($name -notmatch '^[a-z0-9]+(-[a-z0-9]+)*$') {
            Add-Error "Invalid skill name format: $name"
        }
        if ([string]::IsNullOrWhiteSpace($description)) {
            Add-Error "Missing skill description: $file"
        } elseif ($description.Length -gt 1024) {
            Add-Error "Skill description exceeds 1024 chars: $file"
        }
    }
}

$agentCount = 0
$agentNames = New-Object System.Collections.Generic.List[string]
if ([System.IO.Directory]::Exists($agentsDir)) {
    $agentFiles = [System.IO.Directory]::GetFiles($agentsDir, "*.md")
    foreach ($file in $agentFiles) {
        $agentCount++
        $agentNames.Add([System.IO.Path]::GetFileNameWithoutExtension($file)) | Out-Null
        $text = Read-Text $file
        $frontmatter = Get-FrontmatterMap $text $file
        $description = Get-RequiredScalar $frontmatter "description" $file
        $mode = Get-RequiredScalar $frontmatter "mode" $file
        if ([string]::IsNullOrWhiteSpace($description)) {
            Add-Error "Missing agent description: $file"
        }
        if ($mode -ne "subagent") {
            Add-Error "Reusable reviewer agent must use mode: subagent: $file"
        }
        foreach ($permission in @("read", "glob", "grep", "list")) {
            $key = "permission.$permission"
            if ($frontmatter[$key] -ne "allow") {
                Add-Error "Agent permission must set ${permission}: allow: $file"
            }
        }
        foreach ($permission in @("bash", "edit", "task", "question", "skill", "webfetch", "websearch", "todowrite", "external_directory", "lsp", "doom_loop")) {
            $key = "permission.$permission"
            if ($frontmatter[$key] -ne "deny") {
                Add-Error "Agent permission must set ${permission}: deny: $file"
            }
        }
    }
}

$instructionsDir = Join-Path $Root "instructions"
$instructionNames = @()
if ([System.IO.Directory]::Exists($instructionsDir)) {
    $instructionNames = @([System.IO.Directory]::GetFiles($instructionsDir, "*.md") |
        ForEach-Object { [System.IO.Path]::GetFileName($_) })
}

$readmePath = Join-Path $Root "README.md"
if ([System.IO.File]::Exists($readmePath)) {
    $readmeText = Read-Text $readmePath
    $routingMap = Get-RequiredHeadingSection $readmeText "Routing Map" $readmePath
    $reviewerGateMap = Get-RequiredHeadingSection $readmeText "Reviewer Gate Map" $readmePath
    Require-BulletedSection $routingMap "README routing map" $readmePath
    Require-BulletedSection $reviewerGateMap "README reviewer gate map" $readmePath
    Require-TextContains $routingMap "instruction-artifact-tuning" "README instruction-artifact route" $readmePath
    Require-TextContains $routingMap "instruction-artifact-audit-runbook.md" "README instruction-artifact route" $readmePath
    Require-TextContains $reviewerGateMap "instruction-artifact-reviewer" "README reviewer gate map" $readmePath
    Compare-Catalog "Skill" @($skillNames) (Get-CatalogEntries $readmeText "Skill Catalog" "Agent Catalog" $readmePath) $readmePath
    Compare-Catalog "Agent" @($agentNames) (Get-CatalogEntries $readmeText "Agent Catalog" "Instruction Templates" $readmePath) $readmePath
    Compare-Catalog "Instruction template" @($instructionNames) (Get-CatalogEntries $readmeText "Instruction Templates" "Porting Notes" $readmePath) $readmePath
} else {
    Add-Error "Missing README.md: $readmePath"
}

$agentsPath = Join-Path $Root "AGENTS.md"
if ([System.IO.File]::Exists($agentsPath)) {
    $agentsText = Read-Text $agentsPath
    Require-TextContains $agentsText "## Autonomous Work Contract" "AGENTS.md autonomous work contract" $agentsPath
    Require-TextContains $agentsText "Ask the user only" "AGENTS.md autonomous work contract" $agentsPath
    Require-TextContains $agentsText "## Completion Handoff" "AGENTS.md completion handoff contract" $agentsPath
    Require-TextContains $agentsText '`question`' "AGENTS.md completion handoff contract" $agentsPath
    Require-TextContains $agentsText "(Recommended)" "AGENTS.md completion handoff contract" $agentsPath
    Require-TextContains $agentsText "Suggested Next Options" "AGENTS.md completion handoff contract" $agentsPath
    Require-TextContains $agentsText "Actionable Continuation Items" "AGENTS.md completion handoff contract" $agentsPath
    if ($agentsText -match '(?i)after (a )?non-trivial user-visible work( cycle)?,? (the main session offers|offer|use the built-in `?question`?|before stopping)') {
        Add-Error "AGENTS.md must not require routine post-task question handoff: $agentsPath"
    }
} else {
    Add-Error "Missing AGENTS.md: $agentsPath"
}

$markdownFiles = Get-MarkdownFiles $Root

foreach ($file in $markdownFiles) {
    $lines = [System.IO.File]::ReadAllLines($file)
    $text = [string]::Join("`n", $lines)
    for ($i = 0; $i -lt $lines.Length; $i++) {
        if ($lines[$i] -match '[ \t]+$') {
            Add-Error "Trailing whitespace: ${file}:$($i + 1)"
        }
    }
    if ($ForbiddenAnchor.Count -gt 0) {
        foreach ($anchor in $ForbiddenAnchor) {
            if (-not [string]::IsNullOrWhiteSpace($anchor) -and $text.Contains($anchor)) {
                Add-Error "Forbidden anchor '$anchor' found in $file"
            }
        }
    }

    $relative = [System.IO.Path]::GetRelativePath($Root, $file) -replace '\\', '/'
    $isInstructionArtifact = $relative -match '^\.opencode/(skills|agents)/' -or
        $relative -match '^instructions/' -or
        $relative -in @('AGENTS.md', 'README.md')
    $mentionsImplementation = $text -match '(?i)\b(implement|implementation|code changes?|behavior-changing|behavior changes?|fixes are allowed|edit workers?|write scope|make the smallest correct change)\b'
    $mentionsTdd = $text -match '(?is)\b(TDD|test-first|validation-first|tests? before|failing tests?[^\.\n]{0,80}\bbefore\b|(?:tests?|benchmarks?|manual gates?|golden vectors?|fixtures?)[^\.\n]{0,120}\bbefore\b|\bbefore\b[^\.\n]{0,120}(?:tests?|benchmarks?|manual gates?|golden vectors?|fixtures?))\b'

    if ($isInstructionArtifact -and $mentionsImplementation -and -not $mentionsTdd) {
        Add-Warning "Implementation-related artifact language lacks TDD/test-first language: $file"
    }
    if ($isInstructionArtifact -and $text -match '(?i)after (a )?non-trivial user-visible work( cycle)?,? (the main session offers|offer|use the built-in `?question`?|before stopping)') {
        Add-Error "Instruction artifact must not require routine post-task question handoff: $file"
    }
    if ($isInstructionArtifact -and $text -match '(?im)(^#{2,4}\s+.*Self-Improvement\s*$|Self-improvement while context is hot|Core principle\s+[-—]\s+do not remove)') {
        Add-Error "Instruction artifact must not include automatic self-improvement/self-edit loops: $file"
    }
    if ($isInstructionArtifact -and $text -match '(?i)\bshared URLs?\b') {
        $hasSharedUrlApproval = $text -match '(?i)user-approved shared URLs?' -or
            $text -match '(?is)fetch remote/shared URLs?.{0,160}(explicitly grants|explicit permission|user approved|user-approved|approved)'
        $hasSharedUrlProhibition = $text -match '(?is)(never|do not|must not|out of scope|exclude|excluded|not in scope).{0,120}shared URLs?' -or
            $text -match '(?is)shared URLs?.{0,120}(out of scope|excluded|not in scope|must not|never)'
        if (-not $hasSharedUrlApproval -and -not $hasSharedUrlProhibition) {
            Add-Error "Instruction artifact mentioning shared URLs must require user-approved remote/shared URL access: $file"
        }
    }
    $isSkillArtifact = $relative -match '^\.opencode/skills/[^/]+/SKILL\.md$'
    $isSessionRetroArtifact = $isSkillArtifact -and (
        $relative -match '^\.opencode/skills/[^/]*(session|retro)[^/]*/SKILL\.md$' -or
        $text -match '(?i)\b(OpenCode sessions?|session (archive|history|retros?|artifacts?|transcripts?))\b'
    )
    if ($isSessionRetroArtifact -and $text -match '(?i)\bledger\b') {
        $hasRedactedLedger = $text -match '(?i)redacted.{0,80}ledger|ledger.{0,80}redacted'
        $hasLedgerWriteApproval = $text -match '(?is)(write generated ledgers|write a generated ledger file|generated ledger|ledger file).{0,200}(explicitly grants|explicit permission|user approved|user-approved|approved|approval)' -or
            $text -match '(?is)(explicitly grants|explicit permission|user approved|user-approved|approved|approval).{0,200}(write generated ledgers|write a generated ledger file|generated ledger|ledger file)'
        $hasLedgerProhibition = $text -match '(?is)(never|do not|must not|out of scope|exclude|excluded|not in scope).{0,120}ledger' -or
            $text -match '(?is)ledger.{0,120}(out of scope|excluded|not in scope|must not|never)'
        if (-not $hasLedgerProhibition -and (-not $hasRedactedLedger -or -not $hasLedgerWriteApproval)) {
            Add-Error "Session retro artifact with a session ledger must require redaction and user-approved generated ledger writes: $file"
        }
    }
}

if ($warnings.Count -gt 0) {
    $warnings | ForEach-Object { "WARN: $_" }
}

if ($errors.Count -gt 0) {
    $errors | ForEach-Object { "ERROR: $_" }
    exit 1
}

"OK: skills=$skillCount agents=$agentCount markdown=$($markdownFiles.Count) warnings=$($warnings.Count)"
