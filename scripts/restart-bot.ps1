Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $Root "logs\telegram-bot"
$StdoutPath = Join-Path $LogDir "stdout.log"
$StderrPath = Join-Path $LogDir "stderr.log"
$PidPath = Join-Path $LogDir "bot.pid"
$BotPath = Join-Path $Root "src\bot.mjs"

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

Push-Location $Root
try {
  npm run check
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  $processes = @(Get-BotProcesses)
  foreach ($process in $processes) {
    Stop-Process -Id $process.ProcessId -Force
  }

  Start-Sleep -Seconds 1
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

  $node = (Get-Command node).Source
  $started = Start-Process `
    -FilePath $node `
    -ArgumentList @($BotPath) `
    -WorkingDirectory $Root `
    -RedirectStandardOutput $StdoutPath `
    -RedirectStandardError $StderrPath `
    -WindowStyle Hidden `
    -PassThru

  Set-Content -LiteralPath $PidPath -Value $started.Id
  Start-Sleep -Seconds 3

  & (Join-Path $PSScriptRoot "status-bot.ps1")
  $running = Get-Process -Id $started.Id -ErrorAction SilentlyContinue
  if (!$running) {
    $started.Refresh()
    $exitCode = if ($started.HasExited -and $started.ExitCode -ne $null) { $started.ExitCode } else { 1 }
    exit $exitCode
  }
} finally {
  Pop-Location
}
