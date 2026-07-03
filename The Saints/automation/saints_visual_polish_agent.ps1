<#
  saints_visual_polish_agent.ps1
  Regenerates Saints beat cards without internal debug labels.
#>
param([string]$VideoId = '13')

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$parentRootPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if ((Split-Path -Leaf $parentRootPath) -eq 'The Saints') {
  $root = $parentRootPath
} else {
  $root = Join-Path $parentRootPath 'The Saints'
}
$assetDir = Join-Path $root "assets\saints_video_${VideoId}_assets"
$planFile = Join-Path $assetDir 'visual_plan.json'
if (-not (Test-Path $planFile)) { throw "Missing visual plan: $planFile" }
$plan = Get-Content -LiteralPath $planFile -Raw | ConvertFrom-Json
$saintName = if ($plan.saint_target) { [string]$plan.saint_target } else { 'The Saints' }
$realDir = Join-Path $assetDir 'real_sources'
$portraits = @()
if (Test-Path $realDir) {
  $portraits = @(Get-ChildItem -LiteralPath $realDir -File |
    Where-Object { $_.Extension -match '\.(jpg|jpeg|png)$' } |
    Select-Object -ExpandProperty FullName)
}
if ($portraits.Count -lt 1) {
  throw "Missing required saint/elder image source in $realDir. Saints videos must show the saint/elder picture; abstract fallback cards are not allowed."
}

function Shorten([string]$text, [int]$max) {
  if (-not $text) { return '' }
  $clean = ($text -replace '\s+', ' ').Trim()
  if ($clean.Length -le $max) { return $clean }
  return $clean.Substring(0, $max).Trim() + '...'
}

function DrawWrapped($g, [string]$text, $font, $brush, [single]$x, [single]$y, [int]$maxChars, [int]$lineHeight, [int]$maxLines) {
  $words = ($text -split '\s+') | Where-Object { $_ }
  $lines = New-Object System.Collections.Generic.List[string]
  $line = ''
  foreach ($word in $words) {
    $try = if ($line) { "$line $word" } else { $word }
    if ($try.Length -gt $maxChars -and $line) { $lines.Add($line); $line = $word } else { $line = $try }
  }
  if ($line) { $lines.Add($line) }
  for ($i = 0; $i -lt [Math]::Min($lines.Count, $maxLines); $i++) {
    $g.DrawString($lines[$i], $font, $brush, $x, $y + ($i * $lineHeight))
  }
}

function New-Card([string]$out, [string]$title, [string]$subtitle, [string]$footer, [string]$portraitPath, [int]$variant) {
  if (-not $portraitPath -or -not (Test-Path $portraitPath)) {
    throw "Missing required saint/elder portrait while rendering $out"
  }
  $bmp = [System.Drawing.Bitmap]::new(1920,1080)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $palettes = @(
    [System.Drawing.Color]::FromArgb(14, 11, 17),
    [System.Drawing.Color]::FromArgb(18, 15, 22),
    [System.Drawing.Color]::FromArgb(12, 16, 18),
    [System.Drawing.Color]::FromArgb(20, 15, 14)
  )
  $g.Clear($palettes[$variant % $palettes.Count])

  $panel = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(36, 26, 24, 29))
  $gold = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(190, 158, 88))
  $cream = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(246, 239, 222))
  $muted = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(184, 190, 198))
  $shadow = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(76, 0, 0, 0))
  $linePen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(190, 158, 88), 4)

  $g.FillRectangle($panel, 80, 78, 1760, 902)
  $g.DrawLine($linePen, 116, 126, 520, 126)
  $g.DrawLine($linePen, 116, 922, 620, 922)
  if (-not $portraitPath -or -not (Test-Path $portraitPath)) {
    throw "Missing required saint/elder portrait while rendering $out"
  }
  $img = [System.Drawing.Image]::FromFile($portraitPath)
  $dest = [System.Drawing.Rectangle]::new(1210, 130, 540, 735)
  $g.DrawImage($img, $dest)
  $img.Dispose()
  $g.FillRectangle($shadow, 1120, 90, 730, 845)

  $fontBrand = [System.Drawing.Font]::new('Georgia', [single]28, [System.Drawing.FontStyle]::Regular)
  $fontTitle = [System.Drawing.Font]::new('Georgia', [single]54, [System.Drawing.FontStyle]::Bold)
  $fontSub = [System.Drawing.Font]::new('Georgia', [single]38, [System.Drawing.FontStyle]::Regular)
  $fontFooter = [System.Drawing.Font]::new('Georgia', [single]28, [System.Drawing.FontStyle]::Regular)

  $g.DrawString('THE SAINTS', $fontBrand, $gold, [single]116, [single]156)
  DrawWrapped $g $title.ToUpperInvariant() $fontTitle $cream 116 355 17 66 4
  DrawWrapped $g $subtitle $fontSub $muted 120 640 38 50 4
  $g.DrawString($footer, $fontFooter, $gold, [single]120, [single]944)

  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $fontBrand.Dispose(); $fontTitle.Dispose(); $fontSub.Dispose(); $fontFooter.Dispose()
  $linePen.Dispose(); $shadow.Dispose(); $panel.Dispose(); $gold.Dispose(); $cream.Dispose(); $muted.Dispose()
  $g.Dispose(); $bmp.Dispose()
}

$count = 0
$variant = 0
foreach ($scene in $plan.scenes) {
  foreach ($beat in $scene.beats) {
    $portrait = $null
    if ($portraits.Count -gt 0) {
      $portrait = $portraits[$variant % $portraits.Count]
    }
    $out = Join-Path $assetDir ("scene_{0}_beat_{1}_image.png" -f $scene.scene_number, $beat.beat_id)
    $subtitle = Shorten $beat.narration_excerpt 145
    $footer = if ($beat.visual_type -match 'monastery|location') { 'Monastery, silence, and prayer' } elseif ($beat.visual_type -match 'manuscript|letter|book') { 'Counsel, memory, and spiritual tradition' } elseif ($beat.visual_type -match 'portrait|icon') { $saintName } else { 'Witness, tradition, and grace' }
    New-Card $out $scene.title $subtitle $footer $portrait $variant
    $count++
    $variant++
  }
}

if ($VideoId -eq '13') {
  $scene11 = @(
    @{ id='11a'; title='Miracles Remembered'; sub='Pilgrims spoke of help received through Saint Ambrose prayers.'; footer='Witness accounts, carefully framed as tradition' },
    @{ id='11b'; title='Witness, Not Spectacle'; sub='The Church remembers mercy, courage, repentance, and peace.'; footer='No sensational claims, no production labels' },
    @{ id='11c'; title='Mercy In Suffering'; sub='A hardened heart softened. A desperate family given strength.'; footer='Grace entering ordinary suffering' },
    @{ id='11d'; title='The Door Of Grace'; sub='Holiness, suffering, courage, and grace.'; footer='The Saints' }
  )
  foreach ($card in $scene11) {
    $portrait = if ($portraits.Count -gt 0) { $portraits[$variant % $portraits.Count] } else { $null }
    $out = Join-Path $assetDir ("scene_11_beat_{0}_image.png" -f $card.id)
    New-Card $out $card.title $card.sub $card.footer $portrait $variant
    $count++
    $variant++
  }
  Copy-Item -LiteralPath (Join-Path $assetDir 'scene_11_beat_11a_image.png') -Destination (Join-Path $assetDir 'scene_11_image.png') -Force
}

Write-Output "Regenerated $count clean Saints beat cards without scene/beat debug labels."
