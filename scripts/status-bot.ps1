Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $Root "logs\telegram-bot"
$StdoutPath = Join-Path $LogDir "stdout.log"
$StderrPath = Join-Path $LogDir "stderr.log"
$PidPath = Join-Path $LogDir "bot.pid"
$EnvPath = Join-Path $Root ".env.local"
$BotPath = Join-Path $Root "src\bot.mjs"

function Read-EnvFile {
  param([string]$Path)

  $values = @{}
  if (!(Test-Path -LiteralPath $Path)) {
    return $values
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if ($trimmed.Length -eq 0 -or $trimmed.StartsWith("#")) {
      continue
    }

    $index = $trimmed.IndexOf("=")
    if ($index -lt 1) {
      continue
    }

    $name = $trimmed.Substring(0, $index).Trim()
    $value = $trimmed.Substring($index + 1).Trim().Trim('"').Trim("'")
    $values[$name] = $value
  }

  return $values
}

function Get-BotProcesses {
  $seen = @{}
  $processes = @()

  if (Test-Path -LiteralPath $PidPath) {
    $pidValue = (Get-Content -LiteralPath $PidPath -TotalCount 1).Trim()
    if ($pidValue -match '^\d+$') {
      $pidProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$pidValue" -ErrorAction SilentlyContinue
      if ($pidProcess -and $pidProcess.Name -eq "node.exe" -and $pidProcess.CommandLine -match 'bot\.mjs') {
        $seen[$pidProcess.ProcessId] = $true
        $processes += $pidProcess
      }
    }
  }

  $escapedBotPath = [regex]::Escape($BotPath)
  $pathProcesses = Get-CimInstance Win32_Process -Filter "name='node.exe'" |
    Where-Object { $_.CommandLine -match $escapedBotPath }
  foreach ($process in $pathProcesses) {
    if (!$seen.ContainsKey($process.ProcessId)) {
      $seen[$process.ProcessId] = $true
      $processes += $process
    }
  }

  return $processes
}

function Redact-LogLine {
  param([string]$Line)

  return $Line `
    -replace '\d{8,}:[A-Za-z0-9_-]{20,}', '***' `
    -replace 'https://api\.telegram\.org/bot[^/\s]+', 'https://api.telegram.org/bot***' `
    -replace 'sk-(proj-)?[A-Za-z0-9_-]{20,}', '***'
}

Write-Host "[bot process]"
$processes = @(Get-BotProcesses)
if ($processes.Count -eq 0) {
  Write-Host "running=false"
} else {
  foreach ($process in $processes) {
    Write-Host ("running=true pid={0} started={1}" -f $process.ProcessId, $process.CreationDate)
  }
}

Write-Host ""
Write-Host "[pid file]"
if (Test-Path -LiteralPath $PidPath) {
  $pidValue = (Get-Content -LiteralPath $PidPath -TotalCount 1).Trim()
  $alive = $false
  if ($pidValue -match '^\d+$') {
    $alive = [bool](Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue)
  }
  Write-Host ("path={0} pid={1} alive={2}" -f $PidPath, $pidValue, $alive)
} else {
  Write-Host ("path={0} present=false" -f $PidPath)
}

Write-Host ""
Write-Host "[logs]"
Write-Host ("stdout={0} present={1}" -f $StdoutPath, (Test-Path -LiteralPath $StdoutPath))
Write-Host ("stderr={0} present={1}" -f $StderrPath, (Test-Path -LiteralPath $StderrPath))
if (Test-Path -LiteralPath $StderrPath) {
  $stderrLength = (Get-Item -LiteralPath $StderrPath).Length
  Write-Host ("stderr_bytes={0}" -f $stderrLength)
}
if (Test-Path -LiteralPath $StdoutPath) {
  Write-Host ""
  Write-Host "[stdout tail redacted]"
  Get-Content -LiteralPath $StdoutPath -Tail 12 | ForEach-Object { Redact-LogLine $_ }
}
if ((Test-Path -LiteralPath $StderrPath) -and (Get-Item -LiteralPath $StderrPath).Length -gt 0) {
  Write-Host ""
  Write-Host "[stderr tail redacted]"
  Get-Content -LiteralPath $StderrPath -Tail 12 | ForEach-Object { Redact-LogLine $_ }
}

Write-Host ""
Write-Host "[telegram webhook]"
$envValues = Read-EnvFile -Path $EnvPath
if (!$envValues.ContainsKey("TELEGRAM_BOT_TOKEN") -or [string]::IsNullOrWhiteSpace($envValues["TELEGRAM_BOT_TOKEN"])) {
  Write-Host "checked=false reason=missing_TELEGRAM_BOT_TOKEN"
  exit 0
}

try {
  $token = $envValues["TELEGRAM_BOT_TOKEN"]
  $uri = "https://api.telegram.org/bot$token/getWebhookInfo"
  $response = Invoke-RestMethod -Method Get -Uri $uri -TimeoutSec 15
  $info = $response.result
  $urlPresent = ![string]::IsNullOrWhiteSpace($info.url)
  Write-Host ("checked=true url_present={0} pending_update_count={1}" -f $urlPresent, $info.pending_update_count)
  $lastErrorMessage = $null
  if ($info.PSObject.Properties["last_error_message"]) {
    $lastErrorMessage = $info.PSObject.Properties["last_error_message"].Value
  }
  if ($lastErrorMessage) {
    $lastErrorDate = $null
    if ($info.PSObject.Properties["last_error_date"]) {
      $lastErrorDate = $info.PSObject.Properties["last_error_date"].Value
    }
    Write-Host ("last_error_date={0} last_error_message={1}" -f $lastErrorDate, $lastErrorMessage)
  }
} catch {
  Write-Host ("checked=false reason={0}" -f (Redact-LogLine $_.Exception.Message))
}
