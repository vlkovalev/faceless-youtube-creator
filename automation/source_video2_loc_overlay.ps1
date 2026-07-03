$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
$AssetsDir = Join-Path $Root 'assets\video_2_assets'
$PlanPath = Join-Path $AssetsDir 'visual_plan.json'
$AttributionPath = Join-Path $AssetsDir 'asset_attribution.json'
$Plan = Get-Content -LiteralPath $PlanPath -Raw | ConvertFrom-Json
$Attribution = @(Get-Content -LiteralPath $AttributionPath -Raw | ConvertFrom-Json)

function Get-LocItem($itemId) {
  $resourceJson = "https://www.loc.gov/pictures/item/$itemId/?fo=json"
  $detail = Invoke-RestMethod -Uri $resourceJson -Headers @{ 'User-Agent'='CorporateShadowsAssetPlanner/1.0' } -TimeoutSec 30
  $url = $detail.resource.larger
  if (-not $url -or $url -match 'notdig') { $url = $detail.resource.medium }
  if (-not $url -or $url -match 'notdig') { $url = $detail.item.service_medium }
  if (-not $url -or $url -match 'notdig') { throw "No usable image for LOC item $itemId" }
  return [ordered]@{
    title = $detail.item.title
    item_url = $detail.item.link
    download_url = $url
    rights = $detail.item.rights_information
    date = $detail.item.date
    repository = $detail.item.repository
  }
}
function Set-BeatAsset($beatId, $assetFile, $sourceUrl, $title, $license) {
  foreach ($scene in $Plan.scenes) {
    foreach ($beat in $scene.beats) {
      if ([string]$beat.beat_id -eq [string]$beatId) {
        $beat.asset_file = "assets/video_2_assets/$assetFile"
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

$updated = 0
$locMap = @{ '1c' = '93515016' }
foreach ($beatId in $locMap.Keys) {
  try {
    $result = Get-LocItem $locMap[$beatId]
    $ext = if ($result.download_url -match '\.png(\?|$)') { '.png' } elseif ($result.download_url -match '\.tif|\.tiff') { '.tif' } else { '.jpg' }
    $rawPath = Join-Path $AssetsDir ("beat_${beatId}_loc$ext")
    Invoke-WebRequest -Uri $result.download_url -OutFile $rawPath -Headers @{ 'User-Agent'='CorporateShadowsAssetPlanner/1.0' } -TimeoutSec 60
    $finalFile = "beat_${beatId}_loc$ext"
    if ($ext -eq '.tif') {
      $jpgPath = Join-Path $AssetsDir ("beat_${beatId}_loc.jpg")
      & (Join-Path $Root 'automation\ffmpeg\bin\ffmpeg.exe') -y -i $rawPath -q:v 2 $jpgPath | Out-Null
      if (Test-Path $jpgPath) { Remove-Item -LiteralPath $rawPath -Force; $finalFile = "beat_${beatId}_loc.jpg" }
    }
    $sceneTitle = Set-BeatAsset $beatId $finalFile $result.item_url $result.title $result.rights
    $Attribution += [ordered]@{
      beat_id = $beatId
      scene = $sceneTitle
      file = "assets/video_2_assets/$finalFile"
      source_url = $result.item_url
      download_url = $result.download_url
      title = $result.title
      author = $result.repository
      license = $result.rights
      credit = 'Library of Congress'
    }
    $updated++
    Write-Output "LOC covered beat $beatId -> $finalFile | $($result.title) | $($result.rights)"
  } catch {
    Write-Output "LOC failed ${beatId}: $($_.Exception.Message)"
  }
}
$Plan | Add-Member -MemberType NoteProperty -Name loc_overlay -Value ([ordered]@{ updated_beats=$updated; completed_at=(Get-Date).ToString('o'); note='LOC contextual archival image added where safe; Wikimedia still rate-limited.' }) -Force
$Plan | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $PlanPath -Encoding UTF8
$Attribution | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $AttributionPath -Encoding UTF8
Write-Output "Video 2 LOC overlay complete: $updated beats replaced."