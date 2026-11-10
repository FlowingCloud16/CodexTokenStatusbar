#requires -Version 7.0
param([string]$Executable, [string]$ReportPrefix = 'dotnet')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $Executable) {
    $version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
    $Executable = Join-Path $projectRoot ("release/CodexTokenStatusbar-$version.exe")
}
$Executable = [IO.Path]::GetFullPath($Executable)
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$buildRoot = Join-Path $projectRoot '.desktop-build'
$reportRoot = Join-Path $projectRoot 'reports'
New-Item -ItemType Directory -Path $buildRoot, $reportRoot -Force | Out-Null
$selfReport = Join-Path $reportRoot ($ReportPrefix + '-self-test.json')
$info = [Diagnostics.ProcessStartInfo]::new($Executable)
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
$info.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
$info.Arguments = '--self-test "' + $selfReport + '"'
# 仅更改本次自检进程的搜索路径，不改用户或系统环境变量。
$info.EnvironmentVariables['PATH'] = $env:SystemRoot + '\System32;' + $env:SystemRoot
$info.EnvironmentVariables['NODE_PATH'] = ''
$info.EnvironmentVariables['NODE_OPTIONS'] = ''
$process = [Diagnostics.Process]::Start($info)
try {
    if (-not $process.WaitForExit(15000)) { throw '免安装版自检超时。' }
    if ($process.ExitCode -ne 0) { throw '免安装版自检失败。' }
} finally { $process.Dispose() }
$selfTest = Get-Content -LiteralPath $selfReport -Raw | ConvertFrom-Json
if ($selfTest.requiresNode -or $selfTest.nodeRuntime -ne 'none') { throw '成品仍依赖 Node。' }
foreach ($test in @(
    @{ source = 'Launcher.Tests.cs'; report = 'dotnet-desktop-checks.json' },
    @{ source = 'Dashboard.Tests.cs'; report = 'dotnet-view-checks.json' },
    @{ source = 'NativePipe.Tests.cs'; report = 'dotnet-pipe-checks.json' },
    @{ source = 'DesktopIdentity.Tests.cs'; report = 'dotnet-identity-static-checks.json' }
)) {
    $testExecutable = Join-Path $buildRoot ($test.source -replace '\.cs$', '.exe')
    & $compiler /nologo /target:exe /platform:x64 /codepage:65001 "/out:$testExecutable" /reference:System.dll /reference:System.Core.dll /reference:System.Xml.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll /reference:System.IO.Compression.dll (Join-Path $projectRoot ('desktop/' + $test.source))
    if ($LASTEXITCODE -ne 0) { throw ('检查程序编译失败：' + $test.source) }
    $report = Join-Path $reportRoot ($test.report.Replace('dotnet-', $ReportPrefix + '-'))
    if ($test.source -eq 'Dashboard.Tests.cs') { & $testExecutable $Executable $reportRoot $report }
    else { & $testExecutable $Executable $report }
    if ($LASTEXITCODE -ne 0) { throw ('检查失败：' + $test.source) }
}
[ordered]@{ selfTest = '通过'; requiresNode = $false; basic = (Get-Content (Join-Path $reportRoot ($ReportPrefix + '-desktop-checks.json')) -Raw | ConvertFrom-Json).passed; view = (Get-Content (Join-Path $reportRoot ($ReportPrefix + '-view-checks.json')) -Raw | ConvertFrom-Json).passed; pipe = (Get-Content (Join-Path $reportRoot ($ReportPrefix + '-pipe-checks.json')) -Raw | ConvertFrom-Json).passed; identity = (Get-Content (Join-Path $reportRoot ($ReportPrefix + '-identity-static-checks.json')) -Raw | ConvertFrom-Json).passed; operatesCodex = $false } | ConvertTo-Json
