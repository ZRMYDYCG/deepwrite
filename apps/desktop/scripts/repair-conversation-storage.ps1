param(
  [string]$UserDataPath = '__USER_DATA_PATH__',
  [string]$AppPath = '',
  [switch]$ResetConversations
)

$ErrorActionPreference = 'Stop'
$runtimeDirectory = $null
$previousNodeMode = $env:ELECTRON_RUN_AS_NODE
$previousNodeOptions = $env:NODE_OPTIONS

try {
  if ([Environment]::OSVersion.Platform -ne 'Win32NT') {
    throw 'This launcher is for Windows only.'
  }
  $running = @(Get-Process -Name 'DeepWrite' -ErrorAction SilentlyContinue)
  if ($running.Count -gt 0) {
    throw '请完全退出 DeepWrite（包括托盘图标），再运行修复脚本。脚本没有修改数据。'
  }
  if (-not (Test-Path -LiteralPath $UserDataPath -PathType Container)) {
    throw "用户数据目录不存在：$UserDataPath"
  }

  if (-not $AppPath) {
    $candidates = @(
      (Join-Path $env:LOCALAPPDATA 'Programs\DeepWrite\DeepWrite.exe'),
      (Join-Path $env:ProgramFiles 'DeepWrite\DeepWrite.exe')
    )
    $registryRoots = @(
      'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
      'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
      'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    foreach ($root in $registryRoots) {
      foreach ($entry in @(Get-ItemProperty $root -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq 'DeepWrite' })) {
        if ($entry.InstallLocation) {
          $candidates += Join-Path $entry.InstallLocation 'DeepWrite.exe'
        }
        if ($entry.DisplayIcon) {
          $candidates += ($entry.DisplayIcon -replace ',\s*-?\d+$', '').Trim('"')
        }
      }
    }
    $AppPath = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  }
  if (-not $AppPath -or -not (Test-Path -LiteralPath $AppPath -PathType Leaf)) {
    throw '未找到 DeepWrite.exe。请用 -AppPath "安装目录\DeepWrite.exe" 指定程序位置。'
  }
  $AppPath = (Resolve-Path -LiteralPath $AppPath).ProviderPath
  if ([IO.Path]::GetFileName($AppPath) -ine 'DeepWrite.exe') {
    throw '-AppPath 必须指向已安装的 DeepWrite.exe，不能是安装包。'
  }
  $UserDataPath = (Resolve-Path -LiteralPath $UserDataPath).ProviderPath
  $version = [Diagnostics.FileVersionInfo]::GetVersionInfo($AppPath).ProductVersion
  Write-Host "DeepWrite 版本：$version"
  Write-Host "用户数据目录：$UserDataPath"
  if ($ResetConversations) {
    Write-Host '当前为重新初始化模式：旧会话将完整备份，应用中的历史列表会暂时为空。'
  } else {
    Write-Host '当前为保留历史修复模式：先备份，再校验并修复已知迁移故障。'
  }

  $runtimeDirectory = Join-Path ([IO.Path]::GetTempPath()) ('deepwrite-storage-repair-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $runtimeDirectory | Out-Null
  $helper = Join-Path $runtimeDirectory 'repair.mjs'
  $resultFile = Join-Path $runtimeDirectory 'result.json'
  $payload = '__REPAIR_PAYLOAD_BASE64__'
  [IO.File]::WriteAllBytes($helper, [Convert]::FromBase64String($payload))
  $env:ELECTRON_RUN_AS_NODE = '1'
  $env:NODE_OPTIONS = $null
  $mode = 'repair'
  if ($ResetConversations) { $mode = 'reset' }
  & $AppPath $helper $UserDataPath $mode $resultFile
  $runtimeExitCode = $LASTEXITCODE
  if (-not (Test-Path -LiteralPath $resultFile -PathType Leaf)) {
    throw "修复程序未能运行（退出码 $runtimeExitCode），请把上方输出发给开发者。"
  }
  $result = Get-Content -LiteralPath $resultFile -Raw -Encoding UTF8 | ConvertFrom-Json
  $reportPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'DeepWrite-storage-repair-result.txt'
  $report = @{
    appVersion = $version
    userDataPath = $UserDataPath
    result = $result
  } | ConvertTo-Json -Depth 6
  try { [IO.File]::WriteAllText($reportPath, $report, (New-Object Text.UTF8Encoding($true))) } catch { $reportPath = $null }
  if ($result.backupPath) { Write-Host "会话备份目录：$($result.backupPath)" }
  if ($result.backupVerified) { Write-Host '原始会话备份已通过校验。' }
  if ($reportPath) { Write-Host "诊断结果已保存：$reportPath" }
  if ($result.status -eq 'failed') {
    Write-Host "修复未完成：$($result.code)；阶段：$($result.phase)；系统码：$($result.nativeCode)；SQLite：$($result.sqliteCode)"
    Write-Host '原始会话文件已保留。请把诊断结果发给开发者，不要删除备份。'
    exit 1
  }
  if ($result.status -eq 'reset') {
    Write-Host '会话存储已重新初始化，可以重新打开 DeepWrite。旧会话完整保存在上方备份目录。'
  } else {
    Write-Host "存储校验和迁移修复已完成，保留 $($result.sessions) 个会话、$($result.messages) 条消息。请重新打开 DeepWrite 验证。"
  }
} catch {
  Write-Host $_.Exception.Message
  exit 1
} finally {
  $env:ELECTRON_RUN_AS_NODE = $previousNodeMode
  $env:NODE_OPTIONS = $previousNodeOptions
  if ($runtimeDirectory) { Remove-Item -LiteralPath $runtimeDirectory -Recurse -Force -ErrorAction SilentlyContinue }
}
