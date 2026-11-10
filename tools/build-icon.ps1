#requires -Version 7.0
param()
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$source = [Drawing.Image]::FromFile((Join-Path $projectRoot 'desktop/assets/speed.png'))
$frames = [Collections.Generic.List[object]]::new()
try {
    foreach ($size in @(16, 20, 24, 32, 40, 48, 64, 128, 256)) {
        $bitmap = [Drawing.Bitmap]::new($size, $size, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [Drawing.Graphics]::FromImage($bitmap)
        $shape = [Drawing.Drawing2D.GraphicsPath]::new()
        $brush = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(39, 39, 39))
        $memory = [IO.MemoryStream]::new()
        try {
            $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
            $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $inset = [single]($size * 0.04)
            $width = [single]($size - 2 * $inset)
            $corner = [single]($size * 0.32)
            $shape.AddArc($inset, $inset, $corner, $corner, 180, 90)
            $shape.AddArc(($inset + $width - $corner), $inset, $corner, $corner, 270, 90)
            $shape.AddArc(($inset + $width - $corner), ($inset + $width - $corner), $corner, $corner, 0, 90)
            $shape.AddArc($inset, ($inset + $width - $corner), $corner, $corner, 90, 90)
            $shape.CloseFigure()
            $graphics.FillPath($brush, $shape)
            $padding = [single]($size * 0.22)
            $graphics.DrawImage($source, [Drawing.RectangleF]::new($padding, $padding, ($size - 2 * $padding), ($size - 2 * $padding)))
            $bitmap.Save($memory, [Drawing.Imaging.ImageFormat]::Png)
            $frames.Add([pscustomobject]@{ size = $size; bytes = $memory.ToArray() })
        } finally { $memory.Dispose(); $brush.Dispose(); $shape.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
    }
} finally { $source.Dispose() }
$iconFile = Join-Path $projectRoot 'desktop/assets/app.ico'
$stream = [IO.File]::Create($iconFile)
$writer = [IO.BinaryWriter]::new($stream)
try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$frames.Count)
    $offset = 6 + 16 * $frames.Count
    foreach ($frame in $frames) {
        $dimension = if ($frame.size -eq 256) { 0 } else { $frame.size }
        $writer.Write([byte]$dimension); $writer.Write([byte]$dimension); $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$frame.bytes.Length); $writer.Write([uint32]$offset)
        $offset += $frame.bytes.Length
    }
    foreach ($frame in $frames) { $writer.Write([byte[]]$frame.bytes) }
} finally { $writer.Dispose(); $stream.Dispose() }
Get-Item -LiteralPath $iconFile | Select-Object Name, Length
