$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$gameRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$carsRoot = [IO.Path]::GetFullPath((Join-Path $gameRoot "assets\circuit-cars"))
$carsPrefix = $carsRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$catalogPath = Join-Path $carsRoot "catalog.json"
$catalog = Get-Content -LiteralPath $catalogPath -Raw | ConvertFrom-Json

$frameSize = 64
$repairs = @(
  [PSCustomObject]@{
    targetFrame = 2
    targetHeading = "east"
    mirroredFromFrame = 6
    mirroredFromHeading = "west"
    transform = "mirror-x"
    reason = "generated opposite-side view did not preserve the canonical vehicle body"
  },
  [PSCustomObject]@{
    targetFrame = 1
    targetHeading = "north-east"
    mirroredFromFrame = 7
    mirroredFromHeading = "north-west"
    transform = "mirror-x"
    reason = "generated opposite-side view did not preserve the canonical vehicle body"
  },
  [PSCustomObject]@{
    targetFrame = 3
    targetHeading = "south-east"
    mirroredFromFrame = 5
    mirroredFromHeading = "south-west"
    transform = "mirror-x"
    reason = "generated opposite-side view did not preserve the canonical vehicle body"
  }
)

foreach ($model in $catalog.models) {
  $modelRoot = [IO.Path]::GetFullPath((Join-Path $carsRoot $model.modelId))
  if (-not $modelRoot.StartsWith($carsPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to repair a model outside the circuit-car directory: $modelRoot"
  }

  $manifestPath = [IO.Path]::GetFullPath((Join-Path $carsRoot $model.manifest))
  $imagePath = [IO.Path]::GetFullPath((Join-Path $carsRoot $model.spritesheet))
  foreach ($path in @($manifestPath, $imagePath)) {
    if (-not $path.StartsWith($carsPrefix, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to repair a file outside the circuit-car directory: $path"
    }
  }

  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if (
    $manifest.headingConvention -ne "physical-nose-clockwise-from-north" -or
    $manifest.frameWidth -ne $frameSize -or
    $manifest.frameHeight -ne $frameSize -or
    $manifest.frameCount -ne 8
  ) {
    throw "Unexpected atlas contract for $($model.modelId)"
  }

  $source = [Drawing.Bitmap]::FromFile($imagePath)
  try {
    if ($source.Width -ne ($frameSize * 8) -or $source.Height -ne $frameSize) {
      throw "Unexpected atlas dimensions for $($model.modelId): $($source.Width)x$($source.Height)"
    }

    $output = New-Object Drawing.Bitmap(
      $source.Width,
      $source.Height,
      [Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    try {
      for ($y = 0; $y -lt $source.Height; $y += 1) {
        for ($x = 0; $x -lt $source.Width; $x += 1) {
          $output.SetPixel($x, $y, $source.GetPixel($x, $y))
        }
      }

      foreach ($repair in $repairs) {
        for ($y = 0; $y -lt $frameSize; $y += 1) {
          for ($x = 0; $x -lt $frameSize; $x += 1) {
            $pixel = $source.GetPixel($repair.mirroredFromFrame * $frameSize + $x, $y)
            $targetX = $repair.targetFrame * $frameSize + ($frameSize - 1 - $x)
            $output.SetPixel($targetX, $y, $pixel)
          }
        }
      }

      $temporaryImage = Join-Path $modelRoot ".lateral-continuity.png"
      $output.Save($temporaryImage, [Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $output.Dispose()
    }
  } finally {
    $source.Dispose()
  }

  $nonLateralRepairs = if ($null -eq $manifest.PSObject.Properties["repairs"]) {
    @()
  } else {
    @($manifest.repairs | Where-Object { $null -ne $_ -and $_.targetFrame -notin @(1, 2, 3) })
  }
  $updatedRepairs = @($repairs) + $nonLateralRepairs
  if ($null -eq $manifest.PSObject.Properties["repairs"]) {
    $manifest | Add-Member -NotePropertyName repairs -NotePropertyValue $updatedRepairs
  } else {
    $manifest.repairs = $updatedRepairs
  }
  if ($null -eq $manifest.repairFrameConvention) {
    $manifest | Add-Member -NotePropertyName repairFrameConvention -NotePropertyValue $manifest.headingConvention
  } else {
    $manifest.repairFrameConvention = $manifest.headingConvention
  }

  $temporaryManifest = Join-Path $modelRoot ".lateral-continuity.json"
  $manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $temporaryManifest -Encoding utf8
  Move-Item -LiteralPath $temporaryImage -Destination $imagePath -Force
  Move-Item -LiteralPath $temporaryManifest -Destination $manifestPath -Force
  Write-Output "Repaired lateral continuity: $($model.modelId)"
}
