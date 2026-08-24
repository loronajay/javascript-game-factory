$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$gameRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$carsRoot = [IO.Path]::GetFullPath((Join-Path $gameRoot "assets\circuit-cars"))
$rootPrefix = $carsRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$directions = @(
  "north", "north-east", "east", "south-east",
  "south", "south-west", "west", "north-west"
)
$canonicalConvention = "physical-nose-clockwise-from-north"
$cameraSideConvention = "camera-side-opposite-physical-nose"

Get-ChildItem -LiteralPath $carsRoot -Filter "spritesheet.json" -Recurse | ForEach-Object {
  $manifestPath = [IO.Path]::GetFullPath($_.FullName)
  if (-not $manifestPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to rewrite a manifest outside the circuit-car directory: $manifestPath"
  }

  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ($manifest.headingConvention -eq $canonicalConvention) {
    Write-Output "Already canonical: $($manifest.modelId)"
    return
  }
  if ($null -ne $manifest.headingConvention) {
    throw "Unknown heading convention for $($manifest.modelId): $($manifest.headingConvention)"
  }
  if ($manifest.frameWidth -ne 64 -or $manifest.frameHeight -ne 64 -or $manifest.frameCount -ne 8) {
    throw "Unexpected atlas shape for $($manifest.modelId)"
  }
  $sourceConvention = $manifest.source.headingConvention
  if ($sourceConvention -eq $canonicalConvention) {
    $sourceFrameOffset = 0
  } elseif ($sourceConvention -eq $cameraSideConvention) {
    $sourceFrameOffset = 4
  } else {
    throw "Unknown source heading convention for $($manifest.modelId): $sourceConvention"
  }

  $imagePath = [IO.Path]::GetFullPath((Join-Path $_.DirectoryName $manifest.image))
  if (-not $imagePath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to rewrite an atlas outside the circuit-car directory: $imagePath"
  }
  $source = [Drawing.Bitmap]::FromFile($imagePath)
  try {
    if ($source.Width -ne 512 -or $source.Height -ne 64) {
      throw "Unexpected atlas dimensions for $($manifest.modelId): $($source.Width)x$($source.Height)"
    }
    $output = New-Object Drawing.Bitmap(512, 64, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      for ($targetFrame = 0; $targetFrame -lt 8; $targetFrame += 1) {
        $sourceFrame = ($targetFrame + $sourceFrameOffset) % 8
        for ($y = 0; $y -lt 64; $y += 1) {
          for ($x = 0; $x -lt 64; $x += 1) {
            $output.SetPixel($targetFrame * 64 + $x, $y, $source.GetPixel($sourceFrame * 64 + $x, $y))
          }
        }
      }
      $temporaryImage = Join-Path $_.DirectoryName ".canonical-spritesheet.png"
      $output.Save($temporaryImage, [Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $output.Dispose()
    }
  } finally {
    $source.Dispose()
  }

  $oldFrames = @($manifest.frames)
  $manifest.frames = @(
    for ($targetFrame = 0; $targetFrame -lt 8; $targetFrame += 1) {
      $frame = $oldFrames[($targetFrame + $sourceFrameOffset) % 8]
      $frame.direction = $directions[$targetFrame]
      $frame
    }
  )
  foreach ($repair in @($manifest.repairs)) {
    if ($null -eq $repair) { continue }
    $repair.targetFrame = ($repair.targetFrame - $sourceFrameOffset + 8) % 8
    $repair.targetHeading = $directions[$repair.targetFrame]
    $repair.mirroredFromFrame = ($repair.mirroredFromFrame - $sourceFrameOffset + 8) % 8
    $repair.mirroredFromHeading = $directions[$repair.mirroredFromFrame]
  }
  $manifest | Add-Member -NotePropertyName headingConvention -NotePropertyValue $canonicalConvention

  $temporaryManifest = Join-Path $_.DirectoryName ".canonical-spritesheet.json"
  $manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $temporaryManifest -Encoding utf8
  Move-Item -LiteralPath $temporaryImage -Destination $imagePath -Force
  Move-Item -LiteralPath $temporaryManifest -Destination $manifestPath -Force
  Write-Output "Canonicalized physical headings: $($manifest.modelId)"
}
