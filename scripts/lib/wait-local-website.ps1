function Wait-LocalWebsite {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$Uri,
    [Parameter(Mandatory)][string]$LogDirectory,
    [System.Diagnostics.Process]$StartupProcess,
    [ValidateRange(1, 600)][int]$TimeoutSeconds = 180
  )

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $nextProgress = [DateTime]::UtcNow.AddSeconds(15)
  $stdoutPath = Join-Path $LogDirectory 'h5.log'
  $stderrPath = Join-Path $LogDirectory 'h5.error.log'
  Write-Host '正在等待网站编译完成；首次启动可能需要一至两分钟。'
  while ([DateTime]::UtcNow -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) { return }
    } catch { }

    if ($StartupProcess) {
      $StartupProcess.Refresh()
      if ($StartupProcess.HasExited) {
        $details = foreach ($file in @($stderrPath, $stdoutPath)) {
          if (Test-Path -LiteralPath $file) {
            "日志：$file"
            Get-Content -LiteralPath $file -Tail 12 -ErrorAction SilentlyContinue
          }
        }
        throw "网站启动进程已退出（退出码 $($StartupProcess.ExitCode)）。`n$($details | Out-String)"
      }
    }
    if ([DateTime]::UtcNow -ge $nextProgress) {
      Write-Host "网站仍在准备中，编译日志：$stdoutPath"
      $nextProgress = [DateTime]::UtcNow.AddSeconds(15)
    }
    Start-Sleep -Milliseconds 500
  }
  throw "网站在 $TimeoutSeconds 秒内未就绪：$Uri。请查看 $stderrPath 和 $stdoutPath。"
}
