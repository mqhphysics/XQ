[CmdletBinding()]
param([Parameter(Mandatory)][string]$EvidenceDirectory)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../lib/wait-local-website.ps1')
New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
$closedUri = 'http://127.0.0.1:1/'
$shell = (Get-Command powershell.exe).Source
$stderrPath = Join-Path $EvidenceDirectory 'h5.error.log'
$stdoutPath = Join-Path $EvidenceDirectory 'h5.log'
$command = "[Console]::Error.WriteLine('FICTIONAL_STARTUP_FAILURE'); exit 7"
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
$child = Start-Process -FilePath $shell -ArgumentList '-NoProfile','-EncodedCommand',$encoded -WindowStyle Hidden -RedirectStandardError $stderrPath -RedirectStandardOutput $stdoutPath -PassThru
$null = $child.Handle
$child.WaitForExit()
$timer = [Diagnostics.Stopwatch]::StartNew()
$message = ''
try { Wait-LocalWebsite -Uri $closedUri -LogDirectory $EvidenceDirectory -StartupProcess $child -TimeoutSeconds 20 }
catch { $message = $_.Exception.Message }
if ($message -notmatch 'FICTIONAL_STARTUP_FAILURE' -or $message -notmatch '7' -or $timer.Elapsed.TotalSeconds -ge 6) {
  throw "Failed child must surface its exit and actual log without waiting for timeout. Elapsed=$($timer.Elapsed.TotalSeconds); actual=$message"
}
$timeoutMessage = ''
try { Wait-LocalWebsite -Uri $closedUri -LogDirectory $EvidenceDirectory -TimeoutSeconds 1 }
catch { $timeoutMessage = $_.Exception.Message }
if ($timeoutMessage -notmatch [regex]::Escape($stderrPath) -or $timeoutMessage -notmatch [regex]::Escape($stdoutPath)) {
  throw 'Timeout must identify both actual website logs.'
}
$timer.Restart()
Wait-LocalWebsite -Uri 'http://127.0.0.1:3000/' -LogDirectory $EvidenceDirectory
if ($timer.Elapsed.TotalSeconds -ge 6) { throw 'Healthy existing website must be reused immediately.' }
[pscustomobject]@{checks=3;status='passed';failedChild='exit and log surfaced immediately';timeout='actual log paths';reuse='existing 3000 ready'} | ConvertTo-Json
