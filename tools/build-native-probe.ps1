param()
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $projectRoot 'native\probe'
$outputRoot = Join-Path $projectRoot '.native-build\probe'
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$compiler = (Get-Command gcc -ErrorAction Stop).Source
$arguments = @('-std=c11', '-O2', '-s', '-Wall', '-Wextra', '-Werror', '-static-libgcc', '-I', 'native/probe')
Push-Location $projectRoot
try {
    # MinGW 链接器无法处理本机中文绝对路径，统一从项目目录传入相对路径。
    & $compiler @arguments '-shared' 'native/probe/probe.c' 'native/probe/script.c' '-o' '.native-build/probe/statusbar-probe.dll' '-luser32'
    if ($LASTEXITCODE -ne 0) { throw '原生探针 DLL 编译失败。' }
    & $compiler @arguments '-municode' 'native/probe/host.c' '-o' '.native-build/probe/native-probe.exe' '-luser32'
    if ($LASTEXITCODE -ne 0) { throw '原生探针主程序编译失败。' }
} finally { Pop-Location }
Get-ChildItem -LiteralPath $outputRoot -File | Select-Object Name, Length
