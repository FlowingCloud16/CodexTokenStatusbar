#requires -Version 7.0
param([switch]$Standalone)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$suffix = if ($Standalone) { '-standalone' } else { '' }
$executable = Join-Path $projectRoot ('release/CodexTokenStatusbar-' + $version + $suffix + '.exe')
$buildRoot = Join-Path $projectRoot '.desktop-build'
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
$testExecutable = Join-Path $buildRoot 'Launcher.Tests.exe'
$uiExecutable = Join-Path $buildRoot 'Launcher.UiTests.exe'
$viewExecutable = Join-Path $buildRoot 'Dashboard.Tests.exe'
$report = Join-Path $projectRoot ('reports/desktop-checks' + $suffix + '.json')
$selfReport = Join-Path $projectRoot ('reports/desktop-self-test' + $suffix + '.json')
$uiReport = Join-Path $projectRoot ('reports/desktop-ui-checks' + $suffix + '.json')
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
try {
& $compiler /nologo /target:exe /platform:x64 /codepage:65001 "/out:$testExecutable" /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll /reference:System.IO.Compression.dll (Join-Path $projectRoot 'desktop/Launcher.Tests.cs')
if ($LASTEXITCODE -ne 0) { throw 'EXE 专项测试编译失败。' }
& $testExecutable $executable $report
if ($LASTEXITCODE -ne 0) { throw 'EXE 专项测试失败。' }
# 两种资源自检均不启动 Codex，也不发送按键。
$selfTest = Start-Process -FilePath $executable -ArgumentList @('--self-test', ('"' + $selfReport + '"')) -WindowStyle Hidden -PassThru -Wait
if ($selfTest.ExitCode -ne 0) { throw 'EXE 随附资源自检失败。' }
Get-Content -LiteralPath $selfReport -Raw
# 使用真实窗口消息循环验证首次检测，覆盖无窗口自检无法发现的同步等待死锁。
& $compiler /nologo /target:exe /platform:x64 /codepage:65001 "/out:$uiExecutable" /reference:System.dll /reference:System.Core.dll /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll (Join-Path $projectRoot 'desktop/Launcher.UiTests.cs')
if ($LASTEXITCODE -ne 0) { throw '窗口响应测试编译失败。' }
$selfResult = Get-Content -LiteralPath $selfReport -Raw | ConvertFrom-Json
& $uiExecutable $executable $selfResult.payloadDirectory $uiReport
if ($LASTEXITCODE -ne 0) { throw '真实窗口消息循环测试失败。' }
& $compiler /nologo /target:exe /platform:x64 /codepage:65001 "/out:$viewExecutable" /reference:System.dll /reference:System.Core.dll /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll (Join-Path $projectRoot 'desktop/Dashboard.Tests.cs')
if ($LASTEXITCODE -ne 0) { throw '主窗口交互测试编译失败。' }
& $viewExecutable $executable (Join-Path $projectRoot 'reports') (Join-Path $projectRoot 'reports/desktop-view-checks.json')
if ($LASTEXITCODE -ne 0) { throw '主窗口交互测试失败。' }

} finally {
    # 测试结束即删除可重建的测试程序，不保留历次二进制产物。
    $buildPrefix = [System.IO.Path]::GetFullPath($buildRoot).TrimEnd('\') + '\'
    foreach ($temporaryTest in @($testExecutable, $uiExecutable, $viewExecutable)) {
        $resolvedTest = [System.IO.Path]::GetFullPath($temporaryTest)
        if (-not $resolvedTest.StartsWith($buildPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $resolvedTest) -notin @('Launcher.Tests.exe', 'Launcher.UiTests.exe', 'Dashboard.Tests.exe')) { throw '测试暂存路径校验失败，未执行清理。' }
        if (Test-Path -LiteralPath $resolvedTest -PathType Leaf) { Remove-Item -LiteralPath $resolvedTest -Force }
    }
    if (@(Get-ChildItem -LiteralPath $buildRoot -Force).Count -eq 0) { Remove-Item -LiteralPath $buildRoot -Force }
}
