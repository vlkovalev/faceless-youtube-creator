param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$ScriptPath,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ScriptArgs
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$PreferredNode = 'C:\Users\heliu\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'

if (Test-Path -LiteralPath $PreferredNode) {
    $NodePath = $PreferredNode
} else {
    $NodeCommand = Get-Command node -ErrorAction Stop
    $NodePath = $NodeCommand.Source
}

$ResolvedScriptPath = if ([System.IO.Path]::IsPathRooted($ScriptPath)) {
    $ScriptPath
} else {
    Join-Path $RepoRoot $ScriptPath
}

if (-not (Test-Path -LiteralPath $ResolvedScriptPath)) {
    throw "Script not found: $ResolvedScriptPath"
}

Write-Host "Using Node: $NodePath"
Write-Host "Running: $ResolvedScriptPath $($ScriptArgs -join ' ')"

& $NodePath $ResolvedScriptPath @ScriptArgs
exit $LASTEXITCODE
