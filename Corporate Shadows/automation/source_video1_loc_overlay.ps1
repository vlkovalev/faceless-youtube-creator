$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
$AssetsDir = Join-Path $Root 'assets\video_1_assets'
$PlanPath = Join-Path $AssetsDir 'visual_plan.json'
$AttributionPath = Join-Path $AssetsDir 'asset_attribution.json'
$Plan = Get-Content -LiteralPath $PlanPath -Raw | ConvertFrom-Json
$Attribution = @(Get-Content -LiteralPath $AttributionPath -Raw | ConvertFrom-Json)

$LocSpecs = @{
  '2b'='Great Depression unemployment line 1930s'
  '3a'='diamond mine South Africa Kimberley'
  '3b'='Cecil Rhodes portrait'
  '3c'='De Beers diamond mines Kimberley South Africa'
  '3d'='South African diamond fields journey mines'
  '4a'='diamond mines Kimberley South Africa'
  '4b'='Harry Oppenheimer De Beers'
  '6a'='Frances Gerety diamond forever'
  '7b'='Marilyn Monroe diamonds'
  '8a'='diamond sorting South Africa'
  '9b'='diamond mine Canada'
  '10b'='synthetic diamond laboratory'
  '12b'='diamond ring close up'
}

function Get-LocResult($query) {
  $search = 'https://www.loc.gov/pictures/search/?fo=json&q=' + [uri]::EscapeDataString($query)
  $res = Invoke-RestMethod -Uri $search -Headers @{ 'User-Agent'='CorporateShadowsAssetPlanner/1.0' } -TimeoutSec 30
  foreach ($r in @($res.results)) {
    if (-not $r.links.resource) { continue }
    $resourceJson = $r.links.resource
    if ($resourceJson -notmatch 'fo=json') {
      $resourceJson = $resourceJson.TrimEnd('/') + '/?fo=json'
    }
    try {
      $detail = Invoke-RestMethod -Uri $resourceJson -Headers @{ 'User-Agent'='CorporateShadowsAssetPlanner/1.0' } -TimeoutSec 30
      $url = $detail.resource.larger
      if (-not $url -or $url -match 'notdig') { $url = $detail.resource.medium }
      if (-not $url -or $url -match 'notdig') { $url = $detail.item.service_medium }
      if (-not $url -or $url -match 'notdig') { continue }
      if ($url -notmatch '\.(jpg|jpeg|png|tif|tiff)(\?|$)') { continue }
      return [ordered]@{
        title = $detail.item.title
        item_url = $detail.item.link
        download_url = $url
        rights = $detail.item.rights_information
        date = $detail.item.date
        repository = $detail.item.repository
      }
    } catch { continue }
  }
  return $null
}

function Set-BeatAsset($beatId, $assetFile, $sourceUrl, $title, $license) {
  foreach ($scene in $Plan.scenes) {
    foreach ($beat in $scene.beats) {
      if ([string]$beat.beat_id -eq [string]$beatId) {
        $beat.asset_file = "assets/video_1_assets/$assetFile"
        $beat.status = 'downloaded'
        $beat.source_url = $sourceUrl
        $beat.selected_source_title = $title
        $beat.selected_source_license = $license
        return $scene.title
      }
    }
  }
  return ''
}

$updated = 0
foreach ($beatId in $LocSpecs.Keys) {
  $query = $LocSpecs[$beatId]
  try {
    $result = Get-LocResult $query
    if (-not $result) { Write-Output "LOC miss ${beatId}: $query"; continue }
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
      file = "assets/video_1_assets/$finalFile"
      source_url = $result.item_url
      download_url = $result.download_url
      title = $result.title
      author = $result.repository
      license = $result.rights
      credit = 'Library of Congress'
    }
    $updated++
    Write-Output "LOC covered beat $beatId -> $finalFile | $($result.title)"
  } catch {
    Write-Output "LOC failed ${beatId}: $($_.Exception.Message)"
  }
}

$Plan | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $PlanPath -Encoding UTF8
$Attribution | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $AttributionPath -Encoding UTF8
Write-Output "LOC overlay complete: $updated beats replaced with archival assets."