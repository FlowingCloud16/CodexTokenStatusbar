#requires -Version 7.0
[CmdletBinding()]
param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd('\')
$projectPrefix = $projectRoot + '\'

function Assert-SafePath([string]$Path, [switch]$AllowProjectRoot) {
    $absolute = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    $isProjectRoot = $absolute.Equals($projectRoot, [StringComparison]::OrdinalIgnoreCase)
    if (-not $absolute.StartsWith($projectPrefix, [StringComparison]::OrdinalIgnoreCase) -and
        -not ($AllowProjectRoot -and $isProjectRoot)) {
        throw ('目标不在本项目内：' + $absolute)
    }
    # 同时检查父目录，避免通过目录链接清理到项目之外。
    $checkedPath = $absolute
    while ($checkedPath) {
        $item = Get-Item -LiteralPath $checkedPath -Force
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw ('路径包含链接或重解析点：' + $checkedPath)
        }
        $checkedPath = Split-Path -Parent $checkedPath
    }
    $resolved = (Resolve-Path -LiteralPath $absolute).ProviderPath.TrimEnd('\')
    if (-not $resolved.Equals($absolute, [StringComparison]::OrdinalIgnoreCase)) {
        throw ('实际路径与预期不符：' + $absolute)
    }
}

function Get-SafeInventory([string]$Path) {
    Assert-SafePath $Path
    $pending = [Collections.Generic.Stack[string]]::new()
    $pending.Push($Path)
    $fileCount = 0L
    $byteCount = 0L
    while ($pending.Count) {
        $item = Get-Item -LiteralPath $pending.Pop() -Force
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw ('目标包含链接或重解析点：' + $item.FullName)
        }
        if (-not $item.FullName.StartsWith($projectPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw ('目录内容越过项目范围：' + $item.FullName)
        }
        if ($item.PSIsContainer) {
            # 逐层检查后才进入子目录，不跟随目录链接。
            foreach ($child in Get-ChildItem -LiteralPath $item.FullName -Force) {
                if ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                    throw ('目标包含链接或重解析点：' + $child.FullName)
                }
                $pending.Push($child.FullName)
            }
        } else {
            $fileCount++
            $byteCount += $item.Length
        }
    }
    [pscustomobject]@{ Files = $fileCount; Bytes = $byteCount }
}

function Get-ActiveReferences([string]$Path, [object[]]$Processes) {
    $prefix = $Path.TrimEnd('\') + '\'
    @($Processes | Where-Object {
        $_.ProcessId -ne $PID -and (
            ($_.ExecutablePath -and (
                $_.ExecutablePath.Equals($Path, [StringComparison]::OrdinalIgnoreCase) -or
                $_.ExecutablePath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase))) -or
            ($_.CommandLine -and $_.CommandLine.Replace('/', '\').IndexOf($Path, [StringComparison]::OrdinalIgnoreCase) -ge 0)
        )
    })
}

try {
    Assert-SafePath $projectRoot -AllowProjectRoot
    $packagePath = Join-Path $projectRoot 'package.json'
    Assert-SafePath $packagePath
    $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
    if ($package.name -ne 'codex-token-statusbar' -or $package.version -notmatch '^\d+\.\d+\.\d+$') {
        throw '项目名称或版本不符合预期，已停止。'
    }
    $version = [version]$package.version
    $latestExe = Join-Path $projectRoot ('release\CodexTokenStatusbar-' + $package.version + '.exe')
    Assert-SafePath $latestExe
    if ((Get-Item -LiteralPath $latestExe).PSIsContainer -or (Get-Item -LiteralPath $latestExe).Length -eq 0) {
        throw '当前版本 EXE 不完整，已停止。'
    }

    $targets = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($relative in @('.desktop-build', '.native-build', 'node_modules', '.probe', '.run', 'dist\statusbar.bundle.js.map')) {
        $null = $targets.Add((Join-Path $projectRoot $relative))
    }

    $releaseDirectory = Join-Path $projectRoot 'release'
    Assert-SafePath $releaseDirectory
    foreach ($file in Get-ChildItem -LiteralPath $releaseDirectory -File -Force) {
        if ($file.Name -notmatch '^CodexTokenStatusbar-(?<version>\d+\.\d+\.\d+)(?:-(?:native-preview|standalone|lightweight))?\.(?<extension>exe|json)$') { continue }
        $fileVersion = [version]$Matches.version
        $extension = $Matches.extension
        if ($fileVersion -gt $version -or $file.FullName.Equals($latestExe, [StringComparison]::OrdinalIgnoreCase)) { continue }
        if ($extension -eq 'json' -or $fileVersion -lt $version -or $file.Name -like '*-native-preview.exe') {
            $null = $targets.Add($file.FullName)
        }
    }

    # 保留源码、测试、许可证、文字记录、当前版和免 Node 迁移的验收记录。
    $oldReportNames = @(
        'component-preview.png', 'native-component-preview.png', 'native-preview-window.png',
        'cleanup-result.json', 'cleanup-and-lightweight-0-5-3.json',
        'cost-ui-checks.json', 'desktop-checks.json', 'desktop-checks-standalone.json',
        'desktop-self-test.json', 'desktop-self-test-standalone.json', 'desktop-ui-checks.json',
        'desktop-ui-checks-standalone.json', 'desktop-view-checks.json', 'integration-checks.json',
        'layout-ui-checks.json', 'manager-checks.json', 'motion-ui-checks.json',
        'rate-ui-checks.json', 'ui-checks.json', 'ui-deadlock-reproduction-0-5-3.json'
    )
    $oldReportPattern = '^(?:(?:release-checks|native-(?:format-validation|layout-validation|motion-validation|rate-validation|startup-validation)|rate-replay|rate-drop-diagnosis)-0-5-\d+|native-(?:0\.5\.14|preview)-(?:desktop-checks|release-checks|self-test|view-checks|smoke-checks))\.json$'
    $reportDirectory = Join-Path $projectRoot 'reports'
    if (Test-Path -LiteralPath $reportDirectory) {
        Assert-SafePath $reportDirectory
        foreach ($file in Get-ChildItem -LiteralPath $reportDirectory -File -Force) {
            $isOldScreenshot = $false
            if ($file.Name -match '^(?:desktop|chinese|native|api-cost)-.+-(?<major>\d+)-(?<minor>\d+)-(?<patch>\d+)\.png$') {
                $imageVersion = [version]('{0}.{1}.{2}' -f $Matches.major, $Matches.minor, $Matches.patch)
                $isOldScreenshot = $imageVersion -lt $version
            }
            if ($isOldScreenshot -or $file.Name -in $oldReportNames -or $file.Name -match $oldReportPattern) {
                $null = $targets.Add($file.FullName)
            }
        }
    }

    Write-Host ('保留当前版本：CodexTokenStatusbar-' + $package.version + '.exe')
    $processes = @(Get-CimInstance Win32_Process)
    $records = @(
        foreach ($target in ($targets | Sort-Object)) {
            if (-not (Test-Path -LiteralPath $target)) { continue }
            $record = [pscustomobject]@{ Path = $target; Files = 0L; Bytes = 0L; Status = '计划删除'; Reason = '' }
            try {
                $inventory = Get-SafeInventory $target
                $record.Files = $inventory.Files
                $record.Bytes = $inventory.Bytes
                $references = @(Get-ActiveReferences $target $processes)
                if ($references.Count) {
                    $record.Status = '跳过'
                    $record.Reason = '程序仍在使用：' + (($references | Select-Object -ExpandProperty Name -Unique) -join '、')
                }
            } catch {
                $record.Status = '跳过'
                $record.Reason = $_.Exception.Message
            }
            $record
        }
    )
    $records | Format-Table @{Label='项目';Expression={$_.Path.Substring($projectPrefix.Length)}},
        @{Label='MiB';Expression={'{0:N2}' -f ($_.Bytes / 1MB)}},
        @{Label='状态';Expression={$_.Status}}, @{Label='原因';Expression={$_.Reason}} -AutoSize
    $planned = @($records | Where-Object Status -eq '计划删除')
    $plannedBytes = [long](($planned | Measure-Object Bytes -Sum).Sum)
    Write-Host ('可清理 {0} 项，约 {1:N2} MiB。' -f $planned.Count, ($plannedBytes / 1MB))
    if (-not $Apply) {
        Write-Host '当前仅预览。添加 -Apply 才会删除。'
        exit 0
    }

    $deletedBytes = 0L
    $failed = 0
    foreach ($record in $planned) {
        try {
            if (-not (Test-Path -LiteralPath $record.Path)) { continue }
            # 删除前重新检查完整目录、绝对路径和进程，不终止任何程序。
            Assert-SafePath $projectRoot -AllowProjectRoot
            $inventory = Get-SafeInventory $record.Path
            $currentProcesses = @(Get-CimInstance Win32_Process)
            if (@(Get-ActiveReferences $record.Path $currentProcesses).Count) {
                Write-Host ('跳过仍在使用的项目：' + $record.Path)
                continue
            }
            if ($record.Path.Equals($latestExe, [StringComparison]::OrdinalIgnoreCase)) { throw '拒绝删除当前版本 EXE。' }
            Remove-Item -LiteralPath $record.Path -Recurse -Force
            if (Test-Path -LiteralPath $record.Path) { throw '删除后仍然存在。' }
            $deletedBytes += $inventory.Bytes
        } catch {
            $failed++
            Write-Warning ('未清理：{0}；{1}' -f $record.Path, $_.Exception.Message)
        }
    }
    Write-Host ('清理完成，释放约 {0:N2} MiB。' -f ($deletedBytes / 1MB))
    if ($failed) { exit 1 }
} catch {
    Write-Error ('清理已停止：' + $_.Exception.Message)
    exit 1
}
