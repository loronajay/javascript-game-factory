$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$gameRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$carsRoot = [IO.Path]::GetFullPath((Join-Path $gameRoot "assets\circuit-cars"))
$carsPrefix = $carsRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$frameSize = 64
$repairs = @(
  @{ Target = 1; Source = 5; Transform = "rotate-180" },
  @{ Target = 2; Source = 6; Transform = "mirror-x" },
  @{ Target = 3; Source = 7; Transform = "rotate-180" },
  @{ Target = 4; Source = 0; Transform = "mirror-y" }
)

foreach ($modelId in @("meridian-rs", "skyward-r")) {
  $target = [IO.Path]::GetFullPath((Join-Path $carsRoot "$modelId\spritesheet-clockwise-from-north.png"))
  if (-not $target.StartsWith($carsPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to write outside the circuit-car directory: $target"
  }

  $source = [Drawing.Bitmap]::FromFile($target)
  try {
    if ($source.Width -ne 512 -or $source.Height -ne 64) {
      throw "Unexpected $modelId atlas dimensions: $($source.Width)x$($source.Height)"
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

      foreach ($repair in $repairs) {
        for ($y = 0; $y -lt $frameSize; $y += 1) {
          for ($x = 0; $x -lt $frameSize; $x += 1) {
            $sourceX = if ($repair.Transform -in @("mirror-x", "rotate-180")) { $frameSize - 1 - $x } else { $x }
            $sourceY = if ($repair.Transform -in @("mirror-y", "rotate-180")) { $frameSize - 1 - $y } else { $y }
            $pixel = $source.GetPixel($repair.Source * $frameSize + $sourceX, $sourceY)
            $output.SetPixel($repair.Target * $frameSize + $x, $y, $pixel)
          }
        }
      }

      $temporary = Join-Path ([IO.Path]::GetDirectoryName($target)) ".repaired-duplicated-headings.png"
      $output.Save($temporary, [Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $output.Dispose()
    }
  } finally {
    $source.Dispose()
  }

  Move-Item -LiteralPath $temporary -Destination $target -Force
  Write-Output "Repaired duplicated physical headings: $modelId"
}
