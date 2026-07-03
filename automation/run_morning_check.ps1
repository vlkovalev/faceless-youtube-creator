# Daily Morning YouTube Health Check Runner Wrapper
# This script executes the Node.js coordinator and logs outputs.

$Disabled = $true
if ($Disabled) {
    Write-Host "Daily morning brief/check generation is disabled by user request." -ForegroundColor Yellow
    exit 0
}

$ScriptName = "daily_morning_health_check.js"
$ScriptPath = Join-Path $PSScriptRoot $ScriptName
$LogPath = Join-Path $PSScriptRoot "..\metadata\daily_morning_health_check.log"

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "🌅 Running Daily Morning YouTube Health Check..." -ForegroundColor Cyan
Write-Host "Script: $ScriptPath" -ForegroundColor Gray
Write-Host "Log:    $LogPath" -ForegroundColor Gray
Write-Host "=====================================================" -ForegroundColor Cyan

# Run Node.js script and output/log results
Start-Transcript -Path $LogPath -Append -Force -ErrorAction SilentlyContinue

node $ScriptPath

$ExitCode = $LASTEXITCODE

Stop-Transcript -ErrorAction SilentlyContinue

if ($ExitCode -eq 0) {
    Write-Host "`n✅ Morning Health Check completed successfully!" -ForegroundColor Green
} else {
    Write-Host "`n❌ Morning Health Check failed or detected issues (Exit Code: $ExitCode)." -ForegroundColor Red
}

exit $ExitCode
