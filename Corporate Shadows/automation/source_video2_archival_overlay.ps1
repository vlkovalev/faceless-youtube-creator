$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
$AssetsDir = Join-Path $Root 'assets\video_2_assets'
$PlanPath = Join-Path $AssetsDir 'visual_plan.json'
$AttributionPath = Join-Path $AssetsDir 'asset_attribution.json'
$Plan = Get-Content -LiteralPath $PlanPath -Raw | ConvertFrom-Json
$Attribution = @(Get-Content -LiteralPath $AttributionPath -Raw | ConvertFrom-Json)

$CommonsFiles = @{
  '1c' = "Nestle's Milk Food for Infants - Substitutes for Mother's Milk 1888 ad - from, The chemist and druggist (electronic resource) (IA b19974760M0463) (page 18 crop).jpg"
  '4c' = 'Unsafe drinking water 03.jpg'
  '5b' = 'Africa Watsan 14 (10665635346).jpg'
}

function Get-CommonsByTitle($fileTitle) {
  $title = if ($fileTitle.StartsWith('File:')) { $fileTitle } else { "File:$fileTitle" }
  $api = 'https://commons.wikimedia.org/w/api.php?action=query&titles=' + [uri]::EscapeDataString($title) + '&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1920&format=json&origin=*'
  $res = Invoke-RestMethod -Uri $api -Headers @{ 'User-Agent'='CorporateShadowsAssetPlanner/1.0' } -TimeoutSec 45
  $page = @($res.query.pages.PSObject.Properties.Value)[0]
  $info = @($page.imageinfo)[0]
  if (-not $info) { throw "No imageinfo for $fileTitle" }
  $url = if ($info.thumburl) { $info.thumburl } else { $info.url }
  return [ordered]@{
    title = $page.title
    source_url = $info.descriptionurl
    download_url = $url
    author = if ($info.extmetadata.Artist) { ($info.extmetadata.Artist.Value -replace '<[^>]+>', '') } else { '' }
    license = if ($info.extmetadata.LicenseShortName) { $info.extmetadata.LicenseShortName.Value } else { '' }
    credit = if ($info.extmetadata.Credit) { ($info.extmetadata.Credit.Value -replace '<[^>]+>', '') } else { '' }
  }
}

function Set-BeatAsset($beatId, $assetFile, $sourceUrl, $title, $license) {
  foreach ($scene in $Plan.scenes) {
    foreach ($beat in $scene.beats) {
      if ([string]$beat.beat_id -eq [string]$beatId) {
        $beat.asset_file = "assets/video_2_assets/$assetFile"
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
foreach ($beatId in $CommonsFiles.Keys) {
  try {
    $asset = Get-CommonsByTitle $CommonsFiles[$beatId]
    $ext = if ($asset.download_url -match '\.png(\?|$)') { '.png' } elseif ($asset.download_url -match '\.webp(\?|$)') { '.webp' } else { '.jpg' }
    $file = "beat_${beatId}_commons$ext"
    $outPath = Join-Path $AssetsDir $file
    Invoke-WebRequest -Uri $asset.download_url -OutFile $outPath -Headers @{ 'User-Agent'='CorporateShadowsAssetPlanner/1.0' } -TimeoutSec 60
    $sceneTitle = Set-BeatAsset $beatId $file $asset.source_url $asset.title $asset.license
    $Attribution += [ordered]@{
      beat_id = $beatId
      scene = $sceneTitle
      file = "assets/video_2_assets/$file"
      source_url = $asset.source_url
      download_url = $asset.download_url
      title = $asset.title
      author = $asset.author
      license = $asset.license
      credit = $asset.credit
    }
    $updated++
    Write-Output "Commons covered beat $beatId -> $file | $($asset.title) | $($asset.license)"
  } catch {
    Write-Output "Commons failed ${beatId}: $($_.Exception.Message)"
  }
  Start-Sleep -Milliseconds 700
}

$Plan | Add-Member -MemberType NoteProperty -Name archival_overlay -Value ([ordered]@{ updated_beats=$updated; completed_at=(Get-Date).ToString('o'); note='1c formula ad, 4c unsafe water, 5b water access; 6c remains non-graphic generated due sensitive child-health imagery risk.' }) -Force
$Plan | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $PlanPath -Encoding UTF8
$Attribution | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $AttributionPath -Encoding UTF8
Write-Output "Video 2 archival overlay complete: $updated beats replaced."