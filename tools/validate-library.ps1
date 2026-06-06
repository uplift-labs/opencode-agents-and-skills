param(
    [string]$Root = (Split-Path -Parent $PSScriptRoot),
    [string[]]$ForbiddenAnchor = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$errors = New-Object System.Collections.Generic.List[string]

function Add-Error([string]$message) {
    $errors.Add($message) | Out-Null
}

function Read-Text([string]$path) {
    return [System.IO.File]::ReadAllText($path)
}

function Get-FrontmatterValue([string]$text, [string]$key) {
    $pattern = "(?m)^$([regex]::Escape($key)):\s*(.+?)\s*$"
    $match = [regex]::Match($text, $pattern)
    if (-not $match.Success) {
        return $null
    }
    return $match.Groups[1].Value.Trim().Trim('"')
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
if ([System.IO.Directory]::Exists($skillsDir)) {
    $skillDirs = [System.IO.Directory]::GetDirectories($skillsDir)
    foreach ($dir in $skillDirs) {
        $skillCount++
        $folderName = [System.IO.Path]::GetFileName($dir)
        $file = Join-Path $dir "SKILL.md"
        if (-not [System.IO.File]::Exists($file)) {
            Add-Error "Missing SKILL.md for skill folder: $folderName"
            continue
        }
        $text = Read-Text $file
        $name = Get-FrontmatterValue $text "name"
        $description = Get-FrontmatterValue $text "description"
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
if ([System.IO.Directory]::Exists($agentsDir)) {
    $agentFiles = [System.IO.Directory]::GetFiles($agentsDir, "*.md")
    foreach ($file in $agentFiles) {
        $agentCount++
        $text = Read-Text $file
        $description = Get-FrontmatterValue $text "description"
        $mode = Get-FrontmatterValue $text "mode"
        if ([string]::IsNullOrWhiteSpace($description)) {
            Add-Error "Missing agent description: $file"
        }
        if ($mode -ne "subagent") {
            Add-Error "Reusable reviewer agent must use mode: subagent: $file"
        }
        foreach ($required in @("(?m)^permission:\s*$", "(?m)^\s*edit:\s*deny\s*$", "(?m)^\s*task:\s*deny\s*$", "(?m)^\s*question:\s*deny\s*$")) {
            if (-not [regex]::IsMatch($text, $required)) {
                Add-Error "Agent missing read-only permission guard '$required': $file"
            }
        }
    }
}

$markdownFiles = [System.IO.Directory]::GetFiles($Root, "*.md", [System.IO.SearchOption]::AllDirectories) |
    Where-Object { $_ -notmatch "[\\/]\.git[\\/]" }

foreach ($file in $markdownFiles) {
    $lines = [System.IO.File]::ReadAllLines($file)
    for ($i = 0; $i -lt $lines.Length; $i++) {
        if ($lines[$i] -match '[ \t]+$') {
            Add-Error "Trailing whitespace: ${file}:$($i + 1)"
        }
    }
    if ($ForbiddenAnchor.Count -gt 0) {
        $text = [string]::Join("`n", $lines)
        foreach ($anchor in $ForbiddenAnchor) {
            if (-not [string]::IsNullOrWhiteSpace($anchor) -and $text.Contains($anchor)) {
                Add-Error "Forbidden anchor '$anchor' found in $file"
            }
        }
    }
}

if ($errors.Count -gt 0) {
    $errors | ForEach-Object { "ERROR: $_" }
    exit 1
}

"OK: skills=$skillCount agents=$agentCount markdown=$($markdownFiles.Count)"
