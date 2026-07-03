<#
  Saints thumbnail agent.
  Hard rule: use The Saints/assets/Thumbnails first. If a matching thumbnail is
  missing, create a cinematic saint/elder thumbnail, save it into that folder,
  then copy it to the upload filename.
#>
param(
  [string]$VideoId,
  [string]$Text = ''
)

$ErrorActionPreference = 'Stop'
if (-not $VideoId) { throw 'Usage: powershell -File automation\saints_thumbnail_agent.ps1 <video_id> [-Text "TEXT"]' }
Add-Type -AssemblyName System.Drawing

$repoRootPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if ((Split-Path -Leaf $repoRootPath) -eq 'The Saints') {
  $root = $repoRootPath
} else {
  $root = Join-Path $repoRootPath 'The Saints'
}

$numericId = ($VideoId -replace '[^0-9]', '')
$outputId = if ($VideoId -match '^\d+$') { $numericId } else { ($VideoId -replace '[^A-Za-z0-9_-]', '_') }
$out = Join-Path $root "assets\saints_thumbnail_video_${outputId}.png"
$thumbRoot = Join-Path $root 'assets\Thumbnails'
if (-not (Test-Path -LiteralPath $thumbRoot)) { New-Item -ItemType Directory -Force -Path $thumbRoot | Out-Null }

$storyThumbs = @{
  '1' = 'saints_video_1_generated_cinematic.png'
  '2' = 'saints_video_2_generated_cinematic.png'
  '3' = 'saints_video_3_generated_cinematic.png'
  '4' = 'saints_video_4_generated_cinematic.png'
  '5' = 'saints_video_5_generated_cinematic.png'
  '6' = 'saints_video_6_generated_cinematic.png'
  '7' = 'saints_video_7_generated_cinematic.png'
  '13' = 'IMDPK7f14wRX8.png'
  '14' = 'IMDJP6iX6oElw.png'
  '15' = 'IMbIutKtAvOXw.png'
  '16' = 'IMFOZfNOaP3HY.png'
  '17' = 'IMEVTu--_w3E8.png'
  '18' = 'IMAONiSrmYsgc.png'
  '19' = 'IMdWWrhNhywFU.png'
  '20' = 'IMa5r3HeMv3mk.png'
  '21' = 'saints_video_21_generated_cinematic.png'
  '22' = 'saints_video_22_generated_cinematic.png'
}
$prayerThumbs = @{
  '13' = 'IMeaTGslk9ewE.png'
  '20' = 'IMEcA-FkytyCg.png'
}

$isPrayer = $VideoId -match '(?i)prayer|akathist|akathis'
$selected = if ($isPrayer) { $prayerThumbs[$numericId] } else { $storyThumbs[$numericId] }
if ($selected) {
  $selectedPath = Join-Path $thumbRoot $selected
  if (Test-Path -LiteralPath $selectedPath) {
    Copy-Item -LiteralPath $selectedPath -Destination $out -Force
    Write-Output "Selected thumbnail from Thumbnails folder: $selectedPath -> $out"
    return
  }
}

$assetDir = Join-Path $root "assets\saints_video_${numericId}_assets"
$realDir = Join-Path $assetDir 'real_sources'
$portrait = $null
if (Test-Path -LiteralPath $realDir) {
  $portrait = Get-ChildItem -LiteralPath $realDir -File |
    Where-Object { $_.Extension -match '\.(jpg|jpeg|png)$' } |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $portrait -or -not (Test-Path -LiteralPath $portrait)) {
  throw "Missing saint/elder source image in $realDir. Cannot create Saints thumbnail without the saint/elder picture."
}

if (-not $Text) {
  if ($numericId -eq '13') { $Text = 'THE ELDER WHO ANSWERED' }
  elseif ($numericId -eq '14') { $Text = 'SAINT PAISIOS' }
  elseif ($numericId -eq '15') { $Text = 'SAINT SILOUAN' }
  elseif ($numericId -eq '16') { $Text = 'SPIRITUAL HOSPITAL' }
  elseif ($numericId -eq '17') { $Text = 'THE HOLY ELDER' }
  elseif ($numericId -eq '18') { $Text = 'SOUL OF RUSSIA' }
  elseif ($numericId -eq '19') { $Text = 'MONASTIC PRAYER' }
  elseif ($numericId -eq '20') { $Text = 'TEACHER OF REPENTANCE' }
  else { $Text = 'THE SAINTS' }
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

$generatedName = "saints_video_${numericId}_generated_cinematic.png"
$generatedPath = Join-Path $thumbRoot $generatedName

$bmp = [System.Drawing.Bitmap]::new(1280,720)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::FromArgb(10, 9, 12))

$gold = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(210, 170, 82))
$cream = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(250, 242, 220))
$red = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(92, 18, 17))
$shadow = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(132, 0, 0, 0))
$panel = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(58, 30, 24, 30))
$linePen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(210, 170, 82), 5)

$g.FillRectangle($panel, 38, 36, 1204, 648)
$g.FillRectangle($red, 55, 482, 760, 126)

$img = [System.Drawing.Image]::FromFile($portrait)
$g.DrawImage($img, [System.Drawing.Rectangle]::new(770, 68, 390, 542))
$img.Dispose()
$g.FillRectangle($shadow, 0, 0, 1280, 720)
$g.DrawLine($linePen, 70, 76, 356, 76)
$g.DrawLine($linePen, 70, 632, 546, 632)

$fontSmall = [System.Drawing.Font]::new('Georgia', [single]34, [System.Drawing.FontStyle]::Bold)
$fontMain = [System.Drawing.Font]::new('Georgia', [single]78, [System.Drawing.FontStyle]::Bold)
$fontSub = [System.Drawing.Font]::new('Georgia', [single]36, [System.Drawing.FontStyle]::Regular)
$g.DrawString('THE SAINTS', $fontSmall, $gold, [single]70, [single]96)
DrawWrapped $g $Text.ToUpperInvariant() $fontMain $cream 70 210 12 88 3

$subtext = 'THE SAINTS'
if ($numericId -eq '13' -or $numericId -eq '16') { $subtext = 'OPTINA ELDERS' }
elseif ($numericId -eq '14') { $subtext = 'SAINT PAISIOS' }
elseif ($numericId -eq '15') { $subtext = 'SAINT SILOUAN' }
elseif ($numericId -eq '17') { $subtext = 'SAINT HERMAN' }
elseif ($numericId -eq '18') { $subtext = 'SAINT SERGIUS' }
elseif ($numericId -eq '19') { $subtext = 'SAINT PAISIUS' }
elseif ($numericId -eq '20') { $subtext = 'ABBOT NIKON' }
$g.DrawString($subtext, $fontSub, $cream, [single]82, [single]520)

$bmp.Save($generatedPath, [System.Drawing.Imaging.ImageFormat]::Png)
Copy-Item -LiteralPath $generatedPath -Destination $out -Force

$fontSmall.Dispose(); $fontMain.Dispose(); $fontSub.Dispose()
$gold.Dispose(); $cream.Dispose(); $red.Dispose(); $shadow.Dispose(); $panel.Dispose(); $linePen.Dispose()
$g.Dispose(); $bmp.Dispose()
Write-Output "Created cinematic thumbnail in Thumbnails folder: $generatedPath -> $out"
