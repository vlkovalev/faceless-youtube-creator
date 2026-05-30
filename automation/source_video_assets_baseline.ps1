param(
  [int]$VideoId = 2
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
$AssetsDir = Join-Path $Root "assets\video_${VideoId}_assets"
$PlanPath = Join-Path $AssetsDir 'visual_plan.json'
$AttributionPath = Join-Path $AssetsDir 'asset_attribution.json'
$Plan = Get-Content -LiteralPath $PlanPath -Raw | ConvertFrom-Json

function Wrap-Text($graphics, $text, $font, $maxWidth) {
  $words = ($text -replace '[\r\n]+',' ') -split '\s+'
  $lines = New-Object System.Collections.Generic.List[string]
  $line = ''
  foreach ($word in $words) {
    if (-not $word) { continue }
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

function New-Graphic($beatId, $sceneTitle, $excerpt, $outPath) {
  $w = 1920; $h = 1080
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Rectangle 0,0,$w,$h),
    ([System.Drawing.Color]::FromArgb(8,10,14)),
    ([System.Drawing.Color]::FromArgb(27,33,29)),
    30
  )
  $g.FillRectangle($bg,0,0,$w,$h)

  $gold = [System.Drawing.Color]::FromArgb(211,166,70)
  $red = [System.Drawing.Color]::FromArgb(134,28,32)
  $green = [System.Drawing.Color]::FromArgb(54,92,76)
  $penGold = New-Object System.Drawing.Pen $gold, 3
  $penRed = New-Object System.Drawing.Pen $red, 7
  $brushShade = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(160,0,0,0))
  $brushPanel = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(88,12,15,18))
  $brushWhite = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(240,238,230))
  $brushMuted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(190,188,176))
  $brushGold = New-Object System.Drawing.SolidBrush $gold
  $brushGreen = New-Object System.Drawing.SolidBrush $green

  for ($i=0; $i -lt 12; $i++) {
    $x = 90 + ($i * 175)
    $g.DrawLine($penGold, $x, 0, $x - 350, $h)
  }
  $g.FillRectangle($brushShade, 0, 0, $w, $h)
  $g.FillRectangle($brushPanel, 95, 210, 1730, 650)
  $g.FillRectangle($brushGreen, 95, 210, 18, 650)
  $g.DrawLine($penRed, 120, 174, 1800, 174)
  $g.DrawLine($penGold, 120, 900, 1800, 900)

  $fontSmall = New-Object System.Drawing.Font 'Arial', 30, ([System.Drawing.FontStyle]::Regular)
  $fontTitle = New-Object System.Drawing.Font 'Arial', 76, ([System.Drawing.FontStyle]::Bold)
  $fontSub = New-Object System.Drawing.Font 'Arial', 38, ([System.Drawing.FontStyle]::Regular)

  $scene = ($sceneTitle -replace '[^a-zA-Z0-9 \-:]', '').ToUpper()
  $g.DrawString("VIDEO $VideoId / BEAT $beatId", $fontSmall, $brushGold, 120, 105)
  $y = 305
  foreach ($line in (Wrap-Text $g $scene $fontTitle 1500)) {
    $g.DrawString($line, $fontTitle, $brushWhite, 140, $y)
    $y += 88
  }
  $y += 25
  $sub = ($excerpt -replace '\s+', ' ').Trim()
  if ($sub.Length -gt 150) { $sub = $sub.Substring(0,150).Trim() + '...' }
  foreach ($line in (Wrap-Text $g $sub $fontSub 1450)) {
    $g.DrawString($line, $fontSub, $brushMuted, 145, $y)
    $y += 52
  }
  $g.DrawString('CORPORATE SHADOWS', $fontSmall, $brushGold, 120, 930)
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $g.Dispose(); $bmp.Dispose(); $bg.Dispose(); $penGold.Dispose(); $penRed.Dispose()
  $brushShade.Dispose(); $brushPanel.Dispose(); $brushWhite.Dispose(); $brushMuted.Dispose(); $brushGold.Dispose(); $brushGreen.Dispose()
}

$Attribution = New-Object System.Collections.Generic.List[object]
$covered = 0
foreach ($scene in $Plan.scenes) {
  foreach ($beat in $scene.beats) {
    $id = [string]$beat.beat_id
    $png = Join-Path $AssetsDir ("beat_${id}.png")
    New-Graphic $id $scene.title $beat.narration_excerpt $png
    $beat.asset_file = "assets/video_${VideoId}_assets/beat_${id}.png"
    $beat.status = 'downloaded'
    $beat.source_url = $null
    $beat | Add-Member -MemberType NoteProperty -Name selected_source_title -Value "Generated documentary beat: $($scene.title)" -Force
    $beat | Add-Member -MemberType NoteProperty -Name selected_source_license -Value 'Original generated production graphic' -Force
    $Attribution.Add([ordered]@{
      beat_id = $id
      scene = $scene.title
      file = $beat.asset_file
      source_url = $null
      download_url = $null
      title = "Generated documentary beat: $($scene.title)"
      author = 'Generated locally by Corporate Shadows pipeline'
      license = 'Original generated production graphic'
      credit = 'Corporate Shadows'
    })
    $covered++
    Write-Output "Covered beat $id -> beat_${id}.png"
  }
}

$Plan | Add-Member -MemberType NoteProperty -Name asset_coverage -Value ([ordered]@{ covered_beats=$covered; total_beats=$Plan.total_beats; completed_at=(Get-Date).ToString('o'); strategy='local_generated_baseline' }) -Force
$Plan | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $PlanPath -Encoding UTF8
$Attribution | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $AttributionPath -Encoding UTF8
Write-Output "Video $VideoId baseline asset sourcing complete: $covered/$($Plan.total_beats) beats covered."