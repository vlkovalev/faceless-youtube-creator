param(
  [int[]]$VideoIds = @(14, 15, 16, 17, 18, 19, 20, 2, 3, 4, 5, 6, 7),
  [switch]$SkipAudio
)

$ErrorActionPreference = 'Continue'
$saintsRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent $saintsRoot
$logDir = Join-Path $saintsRoot 'metadata\prayer_batch_logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

foreach ($videoId in $VideoIds) {
  $logPath = Join-Path $logDir "saints_prayer_${videoId}.log"
  try {
    "[$(Get-Date -Format o)] Starting prayer companion $videoId" | Out-File -Encoding utf8 $logPath

    if (-not $SkipAudio) {
      & node (Join-Path $PSScriptRoot 'saints_generate_prayer_assets.js') $videoId *>&1 |
        Out-File -Encoding utf8 -Append $logPath
      if ($LASTEXITCODE -ne 0) { throw "Prayer audio generation failed for $videoId" }
    }

    & node (Join-Path $PSScriptRoot 'saints_prayer_renderer.js') $videoId *>&1 |
      Out-File -Encoding utf8 -Append $logPath
    if ($LASTEXITCODE -ne 0) { throw "Prayer render failed for $videoId" }

    "[$(Get-Date -Format o)] Completed prayer companion $videoId" |
      Out-File -Encoding utf8 -Append $logPath
  }
  catch {
    "[$(Get-Date -Format o)] FAILED: $($_.Exception.Message)" |
      Out-File -Encoding utf8 -Append $logPath
  }
}
