param(
  [string]$EmoteDirectory = (Join-Path $PSScriptRoot "..\assets\emotes")
)

$ErrorActionPreference = "Stop"
$resolvedDirectory = (Resolve-Path -LiteralPath $EmoteDirectory).Path
$workspaceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
if (-not $resolvedDirectory.StartsWith($workspaceRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Emote directory must stay inside the Yam Bowling workspace."
}

Add-Type -AssemblyName System.Drawing
$drawingAssembly = [System.Drawing.Bitmap].Assembly.Location
$drawingPrimitivesAssembly = [System.Drawing.Rectangle].Assembly.Location
$gdiPlusAssembly = [System.Reflection.Assembly]::Load("System.Private.Windows.GdiPlus").Location
$windowsCoreAssembly = [System.Reflection.Assembly]::Load("System.Private.Windows.Core").Location
Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class EmoteTransparencyCleaner
{
    private const int MinimumBackgroundBrightness = 205;
    private const int MaximumBackgroundChroma = 14;

    public static bool Clean(string path)
    {
        using (var source = new Bitmap(path))
        using (var bitmap = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb))
        {
            using (var graphics = Graphics.FromImage(bitmap))
            {
                graphics.DrawImageUnscaled(source, 0, 0);
            }

            var bounds = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
            var locked = bitmap.LockBits(bounds, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
            var bytes = new byte[Math.Abs(locked.Stride) * bitmap.Height];
            Marshal.Copy(locked.Scan0, bytes, 0, bytes.Length);

            var pixelCount = bitmap.Width * bitmap.Height;
            var candidate = new bool[pixelCount];
            var outside = new bool[pixelCount];
            var alreadyTransparent = false;
            for (var y = 0; y < bitmap.Height; y++)
            {
                for (var x = 0; x < bitmap.Width; x++)
                {
                    var pixel = y * bitmap.Width + x;
                    var offset = y * locked.Stride + x * 4;
                    var blue = bytes[offset];
                    var green = bytes[offset + 1];
                    var red = bytes[offset + 2];
                    var alpha = bytes[offset + 3];
                    if (alpha < 255) alreadyTransparent = true;
                    var maximum = Math.Max(red, Math.Max(green, blue));
                    var minimum = Math.Min(red, Math.Min(green, blue));
                    candidate[pixel] = alpha > 0
                        && (red + green + blue) / 3 >= MinimumBackgroundBrightness
                        && maximum - minimum <= MaximumBackgroundChroma;
                }
            }

            if (alreadyTransparent)
            {
                bitmap.UnlockBits(locked);
                return false;
            }

            var queue = new int[pixelCount];
            var head = 0;
            var tail = 0;
            Action<int> enqueue = pixel =>
            {
                if (!candidate[pixel] || outside[pixel]) return;
                outside[pixel] = true;
                queue[tail++] = pixel;
            };
            for (var x = 0; x < bitmap.Width; x++)
            {
                enqueue(x);
                enqueue((bitmap.Height - 1) * bitmap.Width + x);
            }
            for (var y = 0; y < bitmap.Height; y++)
            {
                enqueue(y * bitmap.Width);
                enqueue(y * bitmap.Width + bitmap.Width - 1);
            }

            while (head < tail)
            {
                var pixel = queue[head++];
                var x = pixel % bitmap.Width;
                var y = pixel / bitmap.Width;
                if (x > 0) enqueue(pixel - 1);
                if (x + 1 < bitmap.Width) enqueue(pixel + 1);
                if (y > 0) enqueue(pixel - bitmap.Width);
                if (y + 1 < bitmap.Height) enqueue(pixel + bitmap.Width);
            }

            for (var y = 0; y < bitmap.Height; y++)
            {
                for (var x = 0; x < bitmap.Width; x++)
                {
                    var pixel = y * bitmap.Width + x;
                    if (!outside[pixel]) continue;
                    var offset = y * locked.Stride + x * 4;
                    bytes[offset] = 0;
                    bytes[offset + 1] = 0;
                    bytes[offset + 2] = 0;
                    bytes[offset + 3] = 0;
                }
            }

            Marshal.Copy(bytes, 0, locked.Scan0, bytes.Length);
            bitmap.UnlockBits(locked);
            var temporary = path + ".cleaned.png";
            bitmap.Save(temporary, ImageFormat.Png);
            source.Dispose();
            File.Move(temporary, path, true);
            return true;
        }
    }
}
'@ -ReferencedAssemblies $drawingAssembly,$drawingPrimitivesAssembly,$gdiPlusAssembly,$windowsCoreAssembly

$cleaned = 0
$skipped = 0
Get-ChildItem -LiteralPath $resolvedDirectory -Filter "*.png" -File | Sort-Object Name | ForEach-Object {
  if ([EmoteTransparencyCleaner]::Clean($_.FullName)) {
    $cleaned += 1
    Write-Output "Cleaned $($_.Name)"
  } else {
    $skipped += 1
  }
}
Write-Output "Cleaned $cleaned opaque emotes; kept $skipped existing transparent emotes."
