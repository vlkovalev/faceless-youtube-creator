param(
  [int[]]$VideoIds = @(13, 14, 15, 16, 17, 18, 19, 20, 2, 3, 4, 5, 6, 7)
)

Add-Type -AssemblyName System.Drawing
$saintsRoot = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $saintsRoot 'assets\Thumbnails'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$copy = @{
  13 = @('SAINT AMBROSE', 'PRAYER FOR GUIDANCE')
  14 = @('SAINT PAISIOS', 'PRAYER FOR PEACE')
  15 = @('SAINT SILOUAN', 'PRAYER AGAINST DESPAIR')
  16 = @('OPTINA ELDERS', 'PRAYER FOR WISDOM')
  17 = @('SAINT HERMAN', 'PRAYER FOR PROTECTION')
  18 = @('SAINT SERGIUS', 'PRAYER FOR HELP')
  19 = @('SAINT PAISIOS', 'PRAYER OF THE HEART')
  20 = @('AKATHIST OF REPENTANCE', 'PRAY WITH TEXT')
  2  = @('SAINT SERAPHIM', 'PRAYER FOR PEACE OF HEART')
  3  = @('SAINT NIL SORSKY', 'PRAYER FOR SIMPLICITY')
  4  = @('SAINT THEOPHAN', 'PRAYER FOR CONSTANT PRAYER')
  5  = @('SAINT INNOCENT', 'PRAYER FOR TRAVEL')
  6  = @('SAINT NICHOLAS', 'PRAYER FOR HELP')
  7  = @('SAINT MARY OF EGYPT', 'PRAYER OF REPENTANCE')
}

function Find-IconCard([int]$videoId) {
  $dir = Join-Path $saintsRoot "assets\saints_video_${videoId}_assets"
  foreach ($name in @('scene_1_image.png', 'scene_1_beat_1a_image.png', 'scene_1_beat_1_image.png')) {
    $candidate = Join-Path $dir $name
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  throw "No verified icon card found for Saints prayer $videoId"
}

function Fit-Font([System.Drawing.Graphics]$graphics, [string]$text, [float]$maxSize, [float]$minSize, [float]$maxWidth) {
  for ($size = $maxSize; $size -ge $minSize; $size -= 2) {
    $font = New-Object System.Drawing.Font('Arial', $size, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    if ($graphics.MeasureString($text, $font).Width -le $maxWidth) { return $font }
    $font.Dispose()
  }
  return New-Object System.Drawing.Font('Arial', $minSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
}

foreach ($videoId in $VideoIds) {
  $sourcePath = Find-IconCard $videoId
  $source = [System.Drawing.Image]::FromFile($sourcePath)
  try {
    $canvas = New-Object System.Drawing.Bitmap 1280, 720
    try {
      $g = [System.Drawing.Graphics]::FromImage($canvas)
      try {
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
        $g.DrawImage($source, 0, 0, 1280, 720)

        $black = [System.Drawing.Color]::FromArgb(255, 9, 9, 11)
        $gold = [System.Drawing.Color]::FromArgb(255, 205, 179, 109)
        $white = [System.Drawing.Color]::FromArgb(255, 247, 242, 232)
        $blue = [System.Drawing.Color]::FromArgb(255, 106, 176, 207)
        $g.FillRectangle((New-Object System.Drawing.SolidBrush $black), 0, 0, 742, 720)
        $g.FillRectangle((New-Object System.Drawing.SolidBrush $black), 0, 668, 1280, 52)
        $g.FillRectangle((New-Object System.Drawing.SolidBrush $gold), 58, 55, 490, 5)

        $labelFont = New-Object System.Drawing.Font('Arial', 31, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
        $titleFont = Fit-Font $g $copy[$videoId][0] 78 44 630
        $subFont = Fit-Font $g $copy[$videoId][1] 38 25 630
        $footerFont = New-Object System.Drawing.Font('Arial', 24, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
        try {
          $g.DrawString('PRAYER WITH TEXT', $labelFont, (New-Object System.Drawing.SolidBrush $blue), 58, 86)
          $titleRect = New-Object System.Drawing.RectangleF 58, 190, 635, 240
          $g.DrawString($copy[$videoId][0], $titleFont, (New-Object System.Drawing.SolidBrush $white), $titleRect)
          $g.DrawString($copy[$videoId][1], $subFont, (New-Object System.Drawing.SolidBrush $gold), 62, 475)
          $g.DrawString('THE SAINTS  |  ICON AND PRAYER', $footerFont, (New-Object System.Drawing.SolidBrush $gold), 58, 680)
        }
        finally {
          $labelFont.Dispose(); $titleFont.Dispose(); $subFont.Dispose(); $footerFont.Dispose()
        }
      }
      finally { $g.Dispose() }
      $output = Join-Path $outDir "saints_prayer_${videoId}_thumbnail.png"
      $canvas.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
      Write-Output $output
    }
    finally { $canvas.Dispose() }
  }
  finally { $source.Dispose() }
}

