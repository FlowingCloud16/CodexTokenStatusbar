#requires -Version 7.0
param()
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'build-native-probe.ps1') | Out-Null
& (Join-Path $PSScriptRoot 'build-icon.ps1') | Out-Null
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'dist/manifest.json') -Raw | ConvertFrom-Json
$bundleFile = Join-Path $projectRoot 'dist/statusbar.bundle.js'
if ($package.version -ne $manifest.version -or (Get-FileHash -LiteralPath $bundleFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.bundleSha256) { throw '页面组件版本或摘要不匹配，请先构建页面组件。' }
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$buildRoot = Join-Path $projectRoot ('.desktop-build/' + [guid]::NewGuid().ToString('N'))
$releaseRoot = Join-Path $projectRoot 'release'
New-Item -ItemType Directory -Path $buildRoot, $releaseRoot -Force | Out-Null
try {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $payloadFile = Join-Path $buildRoot 'payload.zip'
    $entries = [ordered]@{
        'dist/manifest.json' = 'dist/manifest.json'
        'dist/statusbar.bundle.js' = 'dist/statusbar.bundle.js'
        'src/api-prices.json' = 'src/api-prices.json'
        'native/main-bridge.cjs' = 'native/main-bridge.cjs'
        'native/bin/native-probe.exe' = '.native-build/probe/native-probe.exe'
        'native/bin/statusbar-probe.dll' = '.native-build/probe/statusbar-probe.dll'
        'licenses/lucide-LICENSE' = 'desktop/licenses/lucide-0.468.0-LICENSE'
    }
    $archive = [IO.Compression.ZipFile]::Open($payloadFile, [IO.Compression.ZipArchiveMode]::Create)
    try { foreach ($entry in $entries.GetEnumerator()) { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $projectRoot $entry.Value), $entry.Key, [IO.Compression.CompressionLevel]::Optimal) | Out-Null } }
    finally { $archive.Dispose() }
    $payloadHash = (Get-FileHash -LiteralPath $payloadFile -Algorithm SHA256).Hash.ToLowerInvariant()
    $infoFile = Join-Path $buildRoot 'BuildInfo.cs'
    @"
using System.Reflection;
[assembly: AssemblyTitle("Codex Token Statusbar")]
[assembly: AssemblyDescription("Codex 状态栏")]
[assembly: AssemblyVersion("$($package.version).0")]
namespace CodexTokenStatusbar {
    internal static class BuildInfo {
        internal const string Version = "$($package.version)";
        internal const string PayloadHash = "$payloadHash";
        internal const string BundleBuildId = "$($manifest.buildId)";
        internal static readonly bool BundlesNode = false;
    }
}
"@ | Set-Content -LiteralPath $infoFile -Encoding utf8
    $outputFile = Join-Path $releaseRoot ('CodexTokenStatusbar-' + $package.version + '.exe')
    $icons = @('speed', 'cache', 'total', 'cost') | ForEach-Object { '/resource:' + (Join-Path $projectRoot ('desktop/assets/' + $_ + '.png')) + ',statusbar.icon.' + $_ }
    $sources = @('Launcher.cs', 'DashboardView.cs', 'UsageBackend.cs', 'SessionReader.cs', 'NativeBackend.cs', 'DesktopIdentity.cs') | ForEach-Object { Join-Path $projectRoot ('desktop/' + $_) }
    & $compiler @icons /nologo /target:winexe /platform:x64 /optimize+ /codepage:65001 /define:NO_NODE,NATIVE_EXPERIMENT "/out:$outputFile" "/win32icon:$(Join-Path $projectRoot 'desktop/assets/app.ico')" "/win32manifest:$(Join-Path $projectRoot 'desktop/app.manifest')" "/resource:$payloadFile,statusbar.payload" /reference:System.dll /reference:System.Core.dll /reference:System.Numerics.dll /reference:System.Xml.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Management.dll /reference:System.Web.Extensions.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll @sources $infoFile
    if ($LASTEXITCODE -ne 0) { throw 'EXE 编译失败。' }
    $result = [ordered]@{
        version = $package.version
        executable = $outputFile
        bytes = (Get-Item -LiteralPath $outputFile).Length
        sha256 = (Get-FileHash -LiteralPath $outputFile -Algorithm SHA256).Hash.ToLowerInvariant()
        payloadSha256 = $payloadHash
        payloadEntries = $entries.Count
        runtimeMode = 'dotnet-framework'
        requiresNode = $false
        bundlesNode = $false
        sqlite = 'Windows 系统组件'
        backend = 'native-pipe'
        operatingSystem = 'Windows 11 x64'
        modifiesClientPackage = $false
        overridesUserProfile = $false
        signed = $false
    }
    $result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $releaseRoot ('CodexTokenStatusbar-' + $package.version + '.json')) -Encoding utf8
    $result | ConvertTo-Json
} finally {
    # 只清理本次随机暂存目录，先核对它确实位于项目构建目录内。
    $prefix = [IO.Path]::GetFullPath((Join-Path $projectRoot '.desktop-build')).TrimEnd('\') + '\'
    $target = [IO.Path]::GetFullPath($buildRoot)
    if (-not $target.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $target) -notmatch '^[a-f0-9]{32}$') { throw '构建暂存路径校验失败，未清理。' }
    try { Remove-Item -LiteralPath $target -Recurse -Force }
    catch { Write-Warning ('暂存目录未能清理：' + $target) }
}
