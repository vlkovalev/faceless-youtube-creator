$VideoId = '20'
$root = 'c:\Users\heliu\Desktop\WebSItes\faceless-youtube-creator-clean\The Saints'
$assetDir = Join-Path $root "assets\saints_video_${VideoId}_assets"
$realDir = Join-Path $assetDir 'real_sources'
$planFile = Join-Path $assetDir 'visual_plan.json'
$plan = Get-Content -LiteralPath $planFile -Raw | ConvertFrom-Json

$portraits = @()
if (Test-Path $realDir) {
  $portraits = Get-ChildItem -LiteralPath $realDir -File |
    Where-Object { $_.Extension -match '\.(jpg|jpeg|png)$' } |
    Select-Object -ExpandProperty FullName
}

Write-Output "Real directory: $realDir"
Write-Output "Portraits found: $portraits"
Write-Output "Portraits class: $($portraits.GetType().FullName)"
Write-Output "Portraits count: $($portraits.Count)"

$variant = 0
foreach ($scene in $plan.scenes) {
  foreach ($beat in $scene.beats) {
    $hasPortrait = $false
    if ($portraits.Count -gt 0 -and (($variant % 2) -eq 0 -or $beat.visual_type -match 'portrait|icon')) {
      $hasPortrait = $true
    }
    Write-Output "Scene $($scene.scene_number) Beat $($beat.beat_id): visual_type='$($beat.visual_type)', variant=$variant, hasPortrait=$hasPortrait"
    $variant++
  }
}
