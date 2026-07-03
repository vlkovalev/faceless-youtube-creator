$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
$AssetsDir = Join-Path $Root 'assets\video_3_assets'
$PlanPath = Join-Path $AssetsDir 'visual_plan.json'
$AttributionPath = Join-Path $AssetsDir 'asset_attribution.json'
$Plan = Get-Content -LiteralPath $PlanPath -Raw | ConvertFrom-Json
$Attribution = @(Get-Content -LiteralPath $AttributionPath -Raw | ConvertFrom-Json)

$CommonsMap = @{
  '2b' = 'Livermore Centennial Light Bulb.jpg'
  '2c' = 'Edison and Shelby Light Bulbs (1899) (ADVERT 289).jpeg'
  '3a' = 'Thomas Edison in lab with "Edison Effect" bulbs. (249e775dda1f47b4922ec91d0b16b25e).jpg'
  '3c' = 'Thomas Edison with Edison Effect bulbs. (668af4a1f3f241e3b199ba132ef1c7b3).jpg'
  '5b' = 'Philips Arga Lampen.jpg'
  '5c' = 'Philips Bi-Arlita.jpg'
  '8b' = 'The Saturday evening post (1920) (14784009822).jpg'
}
$LocMap = @{
  '5a' = '2018694401'
  '7b' = '2018694401'
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

function Get-LocItem($itemId) {
  $detail = Invoke-RestMethod -Uri "https://www.loc.gov/pictures/item/$itemId/?fo=json" -Headers @{ 'User-Agent'='CorporateShadowsAssetPlanner/1.0' } -TimeoutSec 30
  $url = $detail.resource.larger
  if (-not $url -or $url -match 'notdig') { $url = $detail.resource.medium }
  if (-not $url -or $url -match 'notdig') { $url = $detail.item.service_medium }
  if (-not $url -or $url -match 'notdig') { throw "No usable image for LOC item $itemId" }
  return [ordered]@{
    title = $detail.item.title
    source_url = $detail.item.link
    download_url = $url
    author = $detail.item.repository
    license = $detail.item.rights_information
    credit = 'Library of Congress'
  }
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

$updated = 0
foreach ($beatId in $CommonsMap.Keys) {
  try {
    $asset = Get-CommonsByTitle $CommonsMap[$beatId]
    $ext = if ($asset.download_url -match '\.png(\?|$)') { '.png' } elseif ($asset.download_url -match '\.webp(\?|$)') { '.webp' } elseif ($asset.download_url -match '\.jpeg(\?|$)') { '.jpeg' } else { '.jpg' }
    $file = "beat_${beatId}_commons$ext"
    $outPath = Join-Path $AssetsDir $file
    Invoke-WebRequest -Uri $asset.download_url -OutFile $outPath -Headers @{ 'User-Agent'='CorporateShadowsAssetPlanner/1.0' } -TimeoutSec 60
    $sceneTitle = Set-BeatAsset $beatId $file $asset.source_url $asset.title $asset.license
    $Attribution += [ordered]@{ beat_id=$beatId; scene=$sceneTitle; file="assets/video_3_assets/$file"; source_url=$asset.source_url; download_url=$asset.download_url; title=$asset.title; author=$asset.author; license=$asset.license; credit=$asset.credit }
    $updated++
    Write-Output "Commons covered beat $beatId -> $file | $($asset.title) | $($asset.license)"
  } catch { Write-Output "Commons failed ${beatId}: $($_.Exception.Message)" }
  Start-Sleep -Milliseconds 800
}

foreach ($beatId in $LocMap.Keys) {
  try {
    $asset = Get-LocItem $LocMap[$beatId]
    $ext = if ($asset.download_url -match '\.png(\?|$)') { '.png' } elseif ($asset.download_url -match '\.tif|\.tiff') { '.tif' } else { '.jpg' }
    $rawPath = Join-Path $AssetsDir ("beat_${beatId}_loc$ext")
    Invoke-WebRequest -Uri $asset.download_url -OutFile $rawPath -Headers @{ 'User-Agent'='CorporateShadowsAssetPlanner/1.0' } -TimeoutSec 60
    $finalFile = "beat_${beatId}_loc$ext"
    if ($ext -eq '.tif') {
      $jpgPath = Join-Path $AssetsDir ("beat_${beatId}_loc.jpg")
      & (Join-Path $Root 'automation\ffmpeg\bin\ffmpeg.exe') -y -i $rawPath -q:v 2 $jpgPath | Out-Null
      if (Test-Path $jpgPath) { Remove-Item -LiteralPath $rawPath -Force; $finalFile = "beat_${beatId}_loc.jpg" }
    }
    $sceneTitle = Set-BeatAsset $beatId $finalFile $asset.source_url $asset.title $asset.license
    $Attribution += [ordered]@{ beat_id=$beatId; scene=$sceneTitle; file="assets/video_3_assets/$finalFile"; source_url=$asset.source_url; download_url=$asset.download_url; title=$asset.title; author=$asset.author; license=$asset.license; credit=$asset.credit }
    $updated++
    Write-Output "LOC covered beat $beatId -> $finalFile | $($asset.title) | $($asset.license)"
  } catch { Write-Output "LOC failed ${beatId}: $($_.Exception.Message)" }
}

$Plan | Add-Member -MemberType NoteProperty -Name archival_overlay -Value ([ordered]@{ updated_beats=$updated; completed_at=(Get-Date).ToString('o'); note='Centennial Light, Edison/Shelby, Edison lab, Philips lamps, GE lamp factory, 1920 magazine visual.' }) -Force
$Plan | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $PlanPath -Encoding UTF8
$Attribution | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $AttributionPath -Encoding UTF8
Write-Output "Video 3 archival overlay complete: $updated beats replaced."