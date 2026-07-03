$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
$AssetsDir = Join-Path $Root 'assets\video_1_assets'
$PlanPath = Join-Path $AssetsDir 'visual_plan.json'
$AttributionPath = Join-Path $AssetsDir 'asset_attribution.json'
$Plan = Get-Content -LiteralPath $PlanPath -Raw | ConvertFrom-Json

$Specs = @{
  '1a'=@{kind='generated';title='THE DIAMOND ILLUSION';subtitle='Rare, priceless, manufactured'}
  '1b'=@{kind='commons';query='De Beers diamond advertisement engagement ring'}
  '1c'=@{kind='generated';title='COMMON CARBON';subtitle='Scarcity was the product'}
  '2a'=@{kind='generated';title='LONDON, 1938';subtitle='The cartel faces a collapse'}
  '2b'=@{kind='commons';query='Great Depression unemployment line 1930s'}
  '2c'=@{kind='commons';query='De Beers building Kimberley South Africa'}
  '2d'=@{kind='generated';title='TARGET: AMERICA';subtitle='A psychological campaign begins'}
  '3a'=@{kind='commons';query='Kimberley Mine South Africa diamond rush'}
  '3b'=@{kind='commons';query='Cecil Rhodes De Beers'}
  '3c'=@{kind='commons';query='Kimberley diamond mine South Africa Big Hole'}
  '3d'=@{kind='generated';title='SCARCITY BY DESIGN';subtitle='Store. Ration. Release.'}
  '4a'=@{kind='generated';title='SUPPLY WAS NOT ENOUGH';subtitle='Demand had to be invented'}
  '4b'=@{kind='commons';query='Harry Oppenheimer De Beers'}
  '4c'=@{kind='generated';title='THE MISSION';subtitle='Make the ring mandatory'}
  '4d'=@{kind='generated';title='SELL ANXIETY';subtitle='What will people think?'}
  '4e'=@{kind='generated';title='A PUBLIC TEST';subtitle='Love measured in carats'}
  '5a'=@{kind='generated';title='STATUS + SELF-WORTH';subtitle='Advertising found the pressure point'}
  '5b'=@{kind='generated';title='TWO MONTHS SALARY';subtitle='A social rule, not a law'}
  '5c'=@{kind='generated';title='THE TRAP SPRUNG';subtitle='Millions walked into it'}
  '6a'=@{kind='generated';title='1947';subtitle='Four words changed the market'}
  '6b'=@{kind='generated';title='A DIAMOND IS FOREVER';subtitle='A slogan became a lock'}
  '6c'=@{kind='generated';title='NO RESALE MARKET';subtitle='Never compete with past sales'}
  '7a'=@{kind='generated';title='HOLLYWOOD GLAMOUR';subtitle='The illusion gets a spotlight'}
  '7b'=@{kind='commons';query='Marilyn Monroe diamonds are a girls best friend publicity'}
  '7c'=@{kind='generated';title='COMMON STONE, UNIVERSAL OBSESSION';subtitle='Glamour did the selling'}
  '8a'=@{kind='commons';query='rough diamonds sorting table'}
  '8b'=@{kind='generated';title='90% CONTROL';subtitle='Supply, price, distribution'}
  '8c'=@{kind='generated';title='GLOBAL MONOPOLY';subtitle='A market managed like a state secret'}
  '8d'=@{kind='generated';title='PERCEPTION ACROSS CONTINENTS';subtitle='Every dealer depended on the illusion'}
  '8e'=@{kind='generated';title='THE PRICE WAS CURATED';subtitle='Not natural. Protected.'}
  '9a'=@{kind='generated';title='THE CARTEL CRACKS';subtitle='No monopoly lasts forever'}
  '9b'=@{kind='commons';query='Ekati diamond mine Canada'}
  '9c'=@{kind='generated';title='BLOOD DIAMONDS';subtitle='The romance begins to rot'}
  '10a'=@{kind='generated';title='THE LAB-GROWN THREAT';subtitle='Same sparkle, different supply'}
  '10b'=@{kind='commons';query='synthetic diamond laboratory'}
  '10c'=@{kind='generated';title='A NEW GENERATION ASKS';subtitle='Why pay for the old illusion?'}
  '11a'=@{kind='generated';title='NOT RARE. NOT AN INVESTMENT.';subtitle='A symbol made profitable'}
  '11b'=@{kind='generated';title='THE SCRIPT STILL RUNS';subtitle='Jewelry stores sell an emotion'}
  '11c'=@{kind='generated';title='THE PSYCHOLOGICAL TRICK';subtitle='Love turned into obligation'}
  '11d'=@{kind='generated';title='QUESTION THE RING';subtitle='And you question the relationship'}
  '12a'=@{kind='generated';title='THEY DID NOT SELL A ROCK';subtitle='They bought culture'}
  '12b'=@{kind='commons';query='diamond ring close up'}
  '12c'=@{kind='generated';title='CORPORATE SHADOWS';subtitle='The truth is in the fine print'}
}

function ConvertTo-SafeName($text) {
  return ($text -replace '[^a-zA-Z0-9._-]', '_')
}

function Wrap-Text($graphics, $text, $font, $maxWidth) {
  $words = $text -split '\s+'
  $lines = New-Object System.Collections.Generic.List[string]
  $line = ''
  foreach ($word in $words) {
    $test = if ($line) { "$line $word" } else { $word }
    if ($graphics.MeasureString($test, $font).Width -le $maxWidth) { $line = $test }
    else {
      if ($line) { $lines.Add($line) }
      $line = $word
    }
  }
  if ($line) { $lines.Add($line) }
  return $lines
}

function New-Graphic($beatId, $title, $subtitle, $outPath) {
  $w = 1920; $h = 1080
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Rectangle 0,0,$w,$h),
    ([System.Drawing.Color]::FromArgb(8,10,14)),
    ([System.Drawing.Color]::FromArgb(38,28,24)),
    35
  )
  $g.FillRectangle($bg,0,0,$w,$h)

  $accent = [System.Drawing.Color]::FromArgb(216,172,72)
  $red = [System.Drawing.Color]::FromArgb(150,26,32)
  $penGold = New-Object System.Drawing.Pen $accent, 4
  $penRed = New-Object System.Drawing.Pen $red, 8
  for ($i=0; $i -lt 9; $i++) {
    $x = 120 + ($i * 210)
    $g.DrawLine($penGold, $x, 0, $x - 420, $h)
  }
  $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(155,0,0,0))), 0, 0, $w, $h)
  $g.DrawLine($penRed, 120, 185, 1800, 185)
  $g.DrawLine($penGold, 120, 895, 1800, 895)

  $fontSmall = New-Object System.Drawing.Font 'Arial', 32, ([System.Drawing.FontStyle]::Regular)
  $fontTitle = New-Object System.Drawing.Font 'Arial', 86, ([System.Drawing.FontStyle]::Bold)
  $fontSub = New-Object System.Drawing.Font 'Arial', 42, ([System.Drawing.FontStyle]::Regular)
  $brushWhite = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(242,242,238))
  $brushMuted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(198,190,174))
  $brushGold = New-Object System.Drawing.SolidBrush $accent

  $g.DrawString("BEAT $beatId", $fontSmall, $brushGold, 120, 115)
  $y = 350
  foreach ($line in (Wrap-Text $g $title $fontTitle 1500)) {
    $g.DrawString($line, $fontTitle, $brushWhite, 120, $y)
    $y += 98
  }
  $y += 25
  foreach ($line in (Wrap-Text $g $subtitle $fontSub 1500)) {
    $g.DrawString($line, $fontSub, $brushMuted, 124, $y)
    $y += 58
  }
  $g.DrawString('CORPORATE SHADOWS', $fontSmall, $brushGold, 120, 925)

  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $bg.Dispose(); $penGold.Dispose(); $penRed.Dispose()
}

function Get-CommonsAsset($query, $outBase) {
  $api = 'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1920&format=json&origin=*&gsrsearch=' + [uri]::EscapeDataString($query)
  $res = Invoke-RestMethod -Uri $api -Headers @{ 'User-Agent' = 'CorporateShadowsAssetPlanner/1.0' } -TimeoutSec 30
  if (-not $res.query.pages) { return $null }
  foreach ($prop in $res.query.pages.PSObject.Properties) {
    $page = $prop.Value
    $info = @($page.imageinfo)[0]
    if (-not $info) { continue }
    $url = if ($info.thumburl) { $info.thumburl } else { $info.url }
    if ($url -notmatch '\.(jpg|jpeg|png|webp)(\?|$)') { continue }
    $ext = if ($url -match '\.png(\?|$)') { '.png' } elseif ($url -match '\.webp(\?|$)') { '.webp' } else { '.jpg' }
    $outPath = $outBase + $ext
    Invoke-WebRequest -Uri $url -OutFile $outPath -Headers @{ 'User-Agent' = 'CorporateShadowsAssetPlanner/1.0' } -TimeoutSec 45
    return [ordered]@{
      file = (Split-Path $outPath -Leaf)
      source_url = $info.descriptionurl
      download_url = $url
      title = $page.title
      author = if ($info.extmetadata.Artist) { ($info.extmetadata.Artist.Value -replace '<[^>]+>', '') } else { '' }
      license = if ($info.extmetadata.LicenseShortName) { $info.extmetadata.LicenseShortName.Value } else { '' }
      credit = if ($info.extmetadata.Credit) { ($info.extmetadata.Credit.Value -replace '<[^>]+>', '') } else { '' }
    }
  }
  return $null
}

$Attribution = New-Object System.Collections.Generic.List[object]
$covered = 0
foreach ($scene in $Plan.scenes) {
  foreach ($beat in $scene.beats) {
    $id = [string]$beat.beat_id
    $spec = $Specs[$id]
    if (-not $spec) { $spec = @{kind='generated';title=$scene.title.ToUpper();subtitle='Documentary visual beat'} }
    $base = Join-Path $AssetsDir ("beat_$id")
    $asset = $null
    if ($spec.kind -eq 'commons') {
      try { $asset = Get-CommonsAsset $spec.query $base } catch { $asset = $null }
    }
    if (-not $asset) {
      $png = "$base.png"
      New-Graphic $id $spec.title $spec.subtitle $png
      $asset = [ordered]@{
        file = (Split-Path $png -Leaf)
        source_url = $null
        download_url = $null
        title = $spec.title
        author = 'Generated locally by Corporate Shadows pipeline'
        license = 'Original generated production graphic'
        credit = 'Corporate Shadows'
      }
    }

    $beat.asset_file = "assets/video_1_assets/$($asset.file)"
    $beat.status = 'downloaded'
    $beat.source_url = $asset.source_url
    $beat | Add-Member -MemberType NoteProperty -Name selected_source_title -Value $asset.title -Force
    $beat | Add-Member -MemberType NoteProperty -Name selected_source_license -Value $asset.license -Force
    $Attribution.Add([ordered]@{
      beat_id = $id
      scene = $scene.title
      file = $beat.asset_file
      source_url = $asset.source_url
      download_url = $asset.download_url
      title = $asset.title
      author = $asset.author
      license = $asset.license
      credit = $asset.credit
    })
    $covered++
    Write-Output "Covered beat $id -> $($asset.file)"
  }
}

$Plan | Add-Member -MemberType NoteProperty -Name asset_coverage -Value ([ordered]@{ covered_beats=$covered; total_beats=$Plan.total_beats; completed_at=(Get-Date).ToString('o') }) -Force
$Plan | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $PlanPath -Encoding UTF8
$Attribution | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $AttributionPath -Encoding UTF8
Write-Output "Video 1 asset sourcing complete: $covered/$($Plan.total_beats) beats covered."