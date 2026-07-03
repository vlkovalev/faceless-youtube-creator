$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
$AssetsDir = Join-Path $Root 'assets\video_3_assets'
$PlanPath = Join-Path $AssetsDir 'visual_plan.json'
$AttributionPath = Join-Path $AssetsDir 'asset_attribution.json'
$Plan = Get-Content -LiteralPath $PlanPath -Raw | ConvertFrom-Json
$Attribution = @(Get-Content -LiteralPath $AttributionPath -Raw | ConvertFrom-Json)
$LocMap = @{
  '3a' = '2007682977'
  '3c' = '2004667780'
  '6b' = '2023705850'
  '8b' = '2004679729'
}
function Get-LocItem($itemId) {
  $detail = Invoke-RestMethod -Uri "https://www.loc.gov/pictures/item/$itemId/?fo=json" -Headers @{ 'User-Agent'='CorporateShadowsAssetPlanner/1.0' } -TimeoutSec 30
  $url = $detail.resource.larger
  if (-not $url -or $url -match 'notdig') { $url = $detail.resource.medium }
  if (-not $url -or $url -match 'notdig') { $url = $detail.item.service_medium }
  if (-not $url -or $url -match 'notdig') { throw "No usable image for LOC item $itemId" }
  return [ordered]@{ title=$detail.item.title; source_url=$detail.item.link; download_url=$url; author=$detail.item.repository; license=$detail.item.rights_information; credit='Library of Congress' }
}
function Set-BeatAsset($beatId, $assetFile, $sourceUrl, $title, $license) {
  foreach ($scene in $Plan.scenes) {
    foreach ($beat in $scene.beats) {
      if ([string]$beat.beat_id -eq [string]$beatId) {
        $beat.asset_file = "assets/video_3_assets/$assetFile"
        $beat.status = 'downloaded'
        $beat.source_url = $sourceUrl
        $beat | Add-Member -MemberType NoteProperty -Name selected_source_title -Value $title -Force
        $beat | Add-Member -MemberType NoteProperty -Name selected_source_license -Value $license -Force
        return $scene.title
      }
    }
  }
  return ''
}
$updated=0
foreach ($beatId in $LocMap.Keys) {
  try {
    $asset=Get-LocItem $LocMap[$beatId]
    $ext = if ($asset.download_url -match '\.png(\?|$)') { '.png' } elseif ($asset.download_url -match '\.tif|\.tiff') { '.tif' } else { '.jpg' }
    $rawPath=Join-Path $AssetsDir ("beat_${beatId}_loc$ext")
    Invoke-WebRequest -Uri $asset.download_url -OutFile $rawPath -Headers @{ 'User-Agent'='CorporateShadowsAssetPlanner/1.0' } -TimeoutSec 60
    $finalFile="beat_${beatId}_loc$ext"
    if ($ext -eq '.tif') {
      $jpgPath=Join-Path $AssetsDir ("beat_${beatId}_loc.jpg")
      & (Join-Path $Root 'automation\ffmpeg\bin\ffmpeg.exe') -y -i $rawPath -q:v 2 $jpgPath | Out-Null
      if (Test-Path $jpgPath) { Remove-Item -LiteralPath $rawPath -Force; $finalFile="beat_${beatId}_loc.jpg" }
    }
    $sceneTitle=Set-BeatAsset $beatId $finalFile $asset.source_url $asset.title $asset.license
    $Attribution += [ordered]@{ beat_id=$beatId; scene=$sceneTitle; file="assets/video_3_assets/$finalFile"; source_url=$asset.source_url; download_url=$asset.download_url; title=$asset.title; author=$asset.author; license=$asset.license; credit=$asset.credit }
    $updated++
    Write-Output "LOC covered beat $beatId -> $finalFile | $($asset.title) | $($asset.license)"
  } catch { Write-Output "LOC failed ${beatId}: $($_.Exception.Message)" }
}
$Plan | Add-Member -MemberType NoteProperty -Name loc_overlay_extra -Value ([ordered]@{ updated_beats=$updated; completed_at=(Get-Date).ToString('o'); note='Edison lab, Menlo Park, Edison-Swan trademark, electric light political cartoon.' }) -Force
$Plan | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $PlanPath -Encoding UTF8
$Attribution | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $AttributionPath -Encoding UTF8
Write-Output "Video 3 extra LOC overlay complete: $updated beats replaced."