#requires -Version 7.0
param(
    [string]$NodePath,
    [switch]$BundleNode,
    [switch]$NativeExperiment,
    [switch]$LegacyNode
)
$ErrorActionPreference = 'Stop'
if (-not ($BundleNode -or $NativeExperiment -or $LegacyNode)) { & (Join-Path $PSScriptRoot 'build-portable.ps1'); return }
if (-not $NodePath) { $NodePath = (Get-Command node.exe -ErrorAction Stop).Source }
$nodeVersion = (& $NodePath --version).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 24) { throw '打包运行时需要 Node.js 24 或更新版本。' }
$projectRoot = Split-Path -Parent $PSScriptRoot
if ($NativeExperiment) { & (Join-Path $PSScriptRoot 'build-native-probe.ps1') | Out-Null }
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$profile = Get-Content -LiteralPath (Join-Path $projectRoot 'client-profile.json') -Raw | ConvertFrom-Json
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'dist/manifest.json') -Raw | ConvertFrom-Json
if ($manifest.version -ne $package.version) { throw '请先构建与源码版本相符的浏览器组件。' }
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) { throw '需要 Windows 内置 .NET Framework 4.x C# 编译器。' }
$desktopBuild = Join-Path $projectRoot ('.desktop-build/' + [guid]::NewGuid().ToString('N'))
$release = Join-Path $projectRoot 'release'
New-Item -ItemType Directory -Path $desktopBuild, $release -Force | Out-Null
try {
$payloadFile = Join-Path $desktopBuild 'payload.zip'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$payloadFiles = @()
foreach ($directory in @('src', 'dist')) {
    $payloadFiles += Get-ChildItem -LiteralPath (Join-Path $projectRoot $directory) -File | Where-Object { $_.Extension -in '.mjs', '.js', '.json' }
}
foreach ($name in @('asar.mjs', 'cdp-session.mjs', 'manager-artifacts.mjs', 'manager-core.mjs', 'statusbar-manager.mjs', 'settings-store.mjs', 'verify-client.mjs')) {
    $payloadFiles += Get-Item -LiteralPath (Join-Path $projectRoot ('tools/' + $name))
}
if ($NativeExperiment) {
    foreach ($name in @('native-session.mjs', 'native-worker.mjs', 'native-loader.mjs')) {
        $payloadFiles += Get-Item -LiteralPath (Join-Path $projectRoot ('tools/' + $name))
    }
    $payloadFiles += Get-Item -LiteralPath (Join-Path $projectRoot 'native/main-bridge.cjs')
}
foreach ($name in @('package.json', 'client-profile.json', 'statusbar.config.json')) { $payloadFiles += Get-Item -LiteralPath (Join-Path $projectRoot $name) }
$archive = [System.IO.Compression.ZipFile]::Open($payloadFile, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in $payloadFiles) {
        $relative = [System.IO.Path]::GetRelativePath($projectRoot, $file.FullName).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $relative, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
    if ($NativeExperiment) {
        foreach ($name in @('native-probe.exe', 'statusbar-probe.dll')) {
            $file = Join-Path $projectRoot ('.native-build/probe/' + $name)
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file, ('native/bin/' + $name), [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    }
    if ($BundleNode) {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $NodePath, 'runtime/node.exe', [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        $nodeLicense = Join-Path $projectRoot ('desktop/licenses/node-' + $nodeVersion + '-LICENSE')
        if (-not (Test-Path -LiteralPath $nodeLicense -PathType Leaf)) { throw '需要与 Node.js 版本对应的完整许可证。' }
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $nodeLicense, 'runtime/LICENSE', [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
    $iconLicense = Join-Path $projectRoot 'desktop/licenses/lucide-0.468.0-LICENSE'
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $iconLicense, 'licenses/lucide-LICENSE', [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
} finally { $archive.Dispose() }
$payloadHash = (Get-FileHash -LiteralPath $payloadFile -Algorithm SHA256).Hash.ToLowerInvariant()
$infoFile = Join-Path $desktopBuild 'BuildInfo.cs'
$infoSource = @"
using System.Reflection;
[assembly: AssemblyTitle("Codex Token Statusbar")]
[assembly: AssemblyDescription("Codex 客户端内部状态栏加载器")]
[assembly: AssemblyVersion("$($package.version).0")]
namespace CodexTokenStatusbar {
    internal static class BuildInfo {
        internal const string Version = "$($package.version)";
        internal const string PayloadHash = "$payloadHash";
        internal const string BundleBuildId = "$($manifest.buildId)";
        internal static readonly bool BundlesNode = $($BundleNode.IsPresent.ToString().ToLowerInvariant());
    }
}
"@
[System.IO.File]::WriteAllText($infoFile, $infoSource, [System.Text.UTF8Encoding]::new($false))
$suffix = $(if ($BundleNode) { '-standalone' } else { '' }) + $(if ($NativeExperiment) { '-native-preview' } else { '' })
$outputFile = Join-Path $release ('CodexTokenStatusbar-' + $package.version + $suffix + '.exe')
$iconArguments = @('speed', 'cache', 'total', 'cost') | ForEach-Object { '/resource:' + (Join-Path $projectRoot ('desktop/assets/' + $_ + '.png')) + ',statusbar.icon.' + $_ }
[string[]]$featureArguments = @()
if ($NativeExperiment) { $featureArguments += '/define:NATIVE_EXPERIMENT' }
& $compiler @iconArguments @featureArguments /nologo /target:winexe /platform:x64 /optimize+ /codepage:65001 "/out:$outputFile" "/win32manifest:$(Join-Path $projectRoot 'desktop/app.manifest')" "/resource:$payloadFile,statusbar.payload" /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Management.dll /reference:System.Web.Extensions.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll (Join-Path $projectRoot 'desktop/Launcher.cs') (Join-Path $projectRoot 'desktop/DashboardView.cs') $infoFile
if ($LASTEXITCODE -ne 0) { throw 'EXE 编译失败。' }
$result = [ordered]@{
    version = $package.version
    executable = $outputFile
    bytes = (Get-Item -LiteralPath $outputFile).Length
    sha256 = (Get-FileHash -LiteralPath $outputFile -Algorithm SHA256).Hash.ToLowerInvariant()
    payloadSha256 = $payloadHash
    runtimeMode = if ($BundleNode) { 'bundled' } else { 'local' }
    minimumNodeMajor = 24
    nodeVersion = if ($BundleNode) { $nodeVersion } else { $null }
    nodeSha256 = if ($BundleNode) { (Get-FileHash -LiteralPath $NodePath -Algorithm SHA256).Hash.ToLowerInvariant() } else { $null }
    payloadEntries = $payloadFiles.Count + $(if ($BundleNode) { 3 } else { 1 }) + $(if ($NativeExperiment) { 2 } else { 0 })
    backend = if ($NativeExperiment) { 'native-pipe' } else { 'cdp' }
    experimental = $NativeExperiment.IsPresent
    modifiesClientPackage = $false
    overridesUserProfile = $false
    signed = $false
}
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $release ('CodexTokenStatusbar-' + $package.version + $suffix + '.json')) -Encoding utf8
$result | ConvertTo-Json
} finally {
    # 只删除本次创建且已核对位于构建目录内的暂存文件，失败时同样清理。
    $buildPrefix = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '.desktop-build')).TrimEnd('\') + '\'
    $resolvedBuild = [System.IO.Path]::GetFullPath($desktopBuild)
    if (-not $resolvedBuild.StartsWith($buildPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $resolvedBuild) -notmatch '^[a-f0-9]{32}$') { throw '构建暂存目录校验失败，未执行清理。' }
    Remove-Item -LiteralPath $resolvedBuild -Recurse -Force
}
