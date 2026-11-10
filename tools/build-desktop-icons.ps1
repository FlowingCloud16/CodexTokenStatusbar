#requires -Version 7.0
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Add-Type -AssemblyName PresentationCore, WindowsBase
$source = Get-Content -LiteralPath (Join-Path $projectRoot 'src/statusbar.js') -Raw
$assetDirectory = Join-Path $projectRoot 'desktop/assets'
New-Item -ItemType Directory -Path $assetDirectory -Force | Out-Null
foreach ($name in @('speed', 'cache', 'total', 'cost')) {
    # 从现有 Lucide 图标读取原始几何，开发时生成小图片；运行时无需 WPF 或浏览器。
    $fragment = [regex]::Match($source, 'data-metric="' + $name + '"><svg[^>]*>(.*?)</svg>')
    if (-not $fragment.Success) { throw "未找到图标：$name" }
    $svg = [xml]('<svg>' + $fragment.Groups[1].Value + '</svg>')
    $size = if ($name -eq 'total') { 16 } else { 24 }
    $visual = [System.Windows.Media.DrawingVisual]::new()
    $drawing = $visual.RenderOpen()
    $drawing.PushTransform([System.Windows.Media.ScaleTransform]::new(48 / $size, 48 / $size))
    $pen = [System.Windows.Media.Pen]::new([System.Windows.Media.Brushes]::White, $(if ($size -eq 16) { 1.4 } else { 1.8 }))
    $pen.StartLineCap = $pen.EndLineCap = [System.Windows.Media.PenLineCap]::Round
    $pen.LineJoin = [System.Windows.Media.PenLineJoin]::Round
    foreach ($node in $svg.svg.ChildNodes) {
        switch ($node.Name) {
            'path' { $drawing.DrawGeometry($null, $pen, [System.Windows.Media.Geometry]::Parse($node.d)) }
            'rect' { $drawing.DrawRoundedRectangle($null, $pen, [System.Windows.Rect]::new([double]$node.x, [double]$node.y, [double]$node.width, [double]$node.height), [double]$node.rx, [double]$node.ry) }
            'line' { $drawing.DrawLine($pen, [System.Windows.Point]::new([double]$node.x1, [double]$node.y1), [System.Windows.Point]::new([double]$node.x2, [double]$node.y2)) }
            default { throw "不支持的图标元素：$($node.Name)" }
        }
    }
    $drawing.Pop(); $drawing.Close()
    $bitmap = [System.Windows.Media.Imaging.RenderTargetBitmap]::new(48, 48, 96, 96, [System.Windows.Media.PixelFormats]::Pbgra32)
    $bitmap.Render($visual)
    $encoder = [System.Windows.Media.Imaging.PngBitmapEncoder]::new()
    $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
    $stream = [System.IO.File]::Create((Join-Path $assetDirectory ($name + '.png')))
    try { $encoder.Save($stream) } finally { $stream.Dispose() }
}
