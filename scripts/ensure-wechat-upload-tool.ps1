[CmdletBinding()]
param(
  [string]$DevToolsRoot = '',
  [string]$ProjectPath = '',
  [int]$Port = 60187,
  [switch]$ConnectionOnly,
  [switch]$Quit
)

$ErrorActionPreference = 'Stop'
$repoPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (-not $ProjectPath) { $ProjectPath = Join-Path $repoPath 'apps\weapp' }
$project = (Resolve-Path -LiteralPath $ProjectPath).Path
if (-not (Test-Path -LiteralPath (Join-Path $project 'project.config.json'))) {
  throw 'The requested directory is not a WeChat project.'
}

# Prefer the installation actually used by the visible desktop application.
# This launcher must run in the desktop user's normal process/network context.
$processes = @(Get-Process -Name '微信开发者工具','wechatdevtools' -ErrorAction SilentlyContinue)
if (-not $DevToolsRoot) {
  $running = $processes | Sort-Object @{Expression={ $_.MainWindowHandle -ne 0 };Descending=$true} |
    Where-Object { $_.Path -and (Test-Path -LiteralPath (Join-Path (Split-Path -Parent $_.Path) 'cli.bat')) } |
    Select-Object -First 1
  if ($running) { $DevToolsRoot = Split-Path -Parent $running.Path }
}
if (-not $DevToolsRoot) {
  $candidates = @('D:\software\WeChatDevTools-Nightly-2609292','D:\software\WeChatDevTools')
  $DevToolsRoot = $candidates | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'cli.bat') } | Select-Object -First 1
}
if (-not $DevToolsRoot) { throw 'A WeChat Developer Tools installation with cli.bat is required.' }
$cli = Join-Path $DevToolsRoot 'cli.bat'

function Test-UploadPort {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $request = $client.ConnectAsync('127.0.0.1', $Port)
    if (-not $request.Wait(1000)) { return $false }
    $request.GetAwaiter().GetResult()
    return $client.Connected
  } catch { return $false } finally { $client.Dispose() }
}

if ($Quit) {
  if (Test-UploadPort) {
    & $cli quit --port $Port
    $deadline = [DateTime]::UtcNow.AddSeconds(6)
    while ([DateTime]::UtcNow -lt $deadline -and (Test-UploadPort)) { Start-Sleep -Milliseconds 400 }
    if (Test-UploadPort) { throw 'The IDE has not exited; inspect its normal save/close prompt rather than terminating processes.' }
  }
  [pscustomobject]@{ CliPath=$cli; Port=$Port; Connected=$false; QuitRequested=$true }
  return
}

$started = $false
if (-not (Test-UploadPort)) {
  if ($processes.Count) { Write-Host 'Tool processes exist, but the upload port is not reachable in this execution context.' }
  $gui = Get-ChildItem -LiteralPath $DevToolsRoot -File -Filter '*.exe' |
    Where-Object { $_.Length -gt 50MB } | Sort-Object Length -Descending | Select-Object -First 1
  if (-not $gui) { throw 'The interactive WeChat executable is missing.' }
  # Reuse a visible window while it initializes; cold Electron startup can exceed 20 seconds.
  if (-not ($processes | Where-Object { $_.MainWindowHandle -ne 0 })) {
    Start-Process -FilePath $gui.FullName -WindowStyle Normal | Out-Null
    $started = $true
  }
  $deadline = [DateTime]::UtcNow.AddSeconds(45)
  while ([DateTime]::UtcNow -lt $deadline -and -not (Test-UploadPort)) { Start-Sleep -Milliseconds 500 }
  if (-not (Test-UploadPort)) {
    throw 'The upload port did not become reachable after one normal launch. Do not repeatedly start hidden instances; inspect the visible tool or its login prompt.'
  }
}
if (-not $ConnectionOnly) {
  $cliOutput = & $cli open --project $project 2>&1
  $cliExitCode = $LASTEXITCODE
  $cliOutput | ForEach-Object { Write-Output $_ }
  $cliText = [regex]::Replace(($cliOutput | Out-String), '\x1B\[[0-?]*[ -/]*[@-~]', '')
  if ($cliExitCode -ne 0 -or $cliText -match '\[error\]|需要重新登录') {
    throw 'The IDE is reachable but the project did not open. Inspect ordinary allow/trust prompts before requesting a new login.'
  }
}
[pscustomobject]@{ CliPath=$cli; Port=$Port; Connected=$true; Started=$started; Project=$project }
