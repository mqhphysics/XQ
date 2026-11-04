[CmdletBinding()]
param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$logDirectory = Join-Path $repoRoot 'private-data\runtime\launcher'
$mutex = $null
$ownsMutex = $false
$transcribing = $false
$exitCode = 0

try {
  $startScript = Join-Path $repoRoot 'scripts\start-local-demo.ps1'
  if (-not (Test-Path -LiteralPath $startScript -PathType Leaf)) {
    throw "找不到项目启动脚本：$startScript。请检查项目文件夹是否被移动。"
  }

  $hash = [Security.Cryptography.SHA256]::Create()
  try {
    $repoKey = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($repoRoot.ToLowerInvariant()))).Replace('-', '')
  } finally {
    $hash.Dispose()
  }
  $mutex = New-Object Threading.Mutex($false, "Local\Xiaoqiu.OpenWebsite.$repoKey")
  try {
    $ownsMutex = $mutex.WaitOne(0)
  } catch [Threading.AbandonedMutexException] {
    $ownsMutex = $true
  }
  if (-not $ownsMutex) {
    Write-Host '晓球正在另一个窗口启动，请等待那个窗口完成。' -ForegroundColor Yellow
    exit 0
  }

  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
  $logFile = Join-Path $logDirectory ('启动-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
  Start-Transcript -LiteralPath $logFile -Force | Out-Null
  $transcribing = $true

  # Docker Desktop may be installed before its CLI directory reaches PATH.
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    $dockerCliDirectory = Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin'
    if (Test-Path -LiteralPath (Join-Path $dockerCliDirectory 'docker.exe')) {
      $env:PATH = $dockerCliDirectory + ';' + $env:PATH
    }
  }

  Write-Host '正在打开晓球网站……' -ForegroundColor Cyan
  Write-Host '将检查本机服务并准备网站，已运行的健康服务会复用；首次编译可能需要几分钟。'
  Write-Host '日常启动会保留现有数据。请等浏览器自动打开。'
  Write-Host ''

  # Use the live checkout, including its uncommitted product changes.
  # A separate process also isolates the existing script's exit statements.
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $startScript -NoBrowser
  if ($LASTEXITCODE -ne 0) {
    throw "服务启动失败（退出码 $LASTEXITCODE），上方是具体错误。"
  }

  if (-not $NoBrowser) {
    Start-Process 'http://127.0.0.1:3000/'
    Write-Host '网站已打开。服务在后台运行，可以关闭此窗口。' -ForegroundColor Green
  } else {
    Write-Host '网站已就绪：http://127.0.0.1:3000/（本次未打开浏览器）。' -ForegroundColor Green
  }
} catch {
  $exitCode = 1
  Write-Host ''
  Write-Host ('启动未完成：' + $_.Exception.Message) -ForegroundColor Red
  Write-Host ('启动日志：' + $logDirectory)
  if ($repoRoot) {
    $serviceLogDirectory = if (Test-Path -LiteralPath (Join-Path $repoRoot 'private-data\shared-runtime\config.json')) {
      Join-Path $repoRoot 'private-data\shared-runtime'
    } else {
      Join-Path $repoRoot 'private-data\runtime'
    }
    Write-Host ('服务日志：' + $serviceLogDirectory)
  }
} finally {
  if ($transcribing) { Stop-Transcript | Out-Null }
  if ($ownsMutex) { $mutex.ReleaseMutex() }
  if ($mutex) { $mutex.Dispose() }
}

exit $exitCode
