$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$gameRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$target = [IO.Path]::GetFullPath((Join-Path $gameRoot "assets\circuit-cars\tsunami-rz\spritesheet-clockwise-from-north.png"))
$targetPrefix = $gameRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $target.StartsWith($targetPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to write outside the Speed Demon workspace: $target"
}

$sourceFrame = 2
$targetFrame = 6
$frameSize = 64
$source = [Drawing.Bitmap]::FromFile($target)
try {
  if ($source.Width -ne 512 -or $source.Height -ne 64) {
    throw "Unexpected Tsunami atlas dimensions: $($source.Width)x$($source.Height)"
  }
  $output = New-Object Drawing.Bitmap($source.Width, $source.Height, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $graphics = [Drawing.Graphics]::FromImage($output)
    try {
      $graphics.CompositingMode = [Drawing.Drawing2D.CompositingMode]::SourceCopy
      $graphics.DrawImageUnscaled($source, 0, 0)
    } finally {
      $graphics.Dispose()
    }

    for ($y = 0; $y -lt $frameSize; $y += 1) {
      for ($x = 0; $x -lt $frameSize; $x += 1) {
        $pixel = $source.GetPixel($sourceFrame * $frameSize + $x, $y)
        $output.SetPixel($targetFrame * $frameSize + ($frameSize - 1 - $x), $y, $pixel)
      }
    }

    $temporary = Join-Path ([IO.Path]::GetDirectoryName($target)) ".tsunami-rz-repaired.png"
    $output.Save($temporary, [Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $output.Dispose()
  }
} finally {
  $source.Dispose()
}

Move-Item -LiteralPath $temporary -Destination $target -Force
Write-Output "Repaired Tsunami frame 6 from mirrored frame 2: $target"
