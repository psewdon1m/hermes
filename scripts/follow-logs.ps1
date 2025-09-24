param(
  [string]$File = '..\log-output\observer.log'
)

$fullPath = Resolve-Path -Path (Join-Path $PSScriptRoot $File) -ErrorAction SilentlyContinue
if (-not $fullPath) {
  $fullPath = Join-Path $PSScriptRoot $File
  if (-not (Test-Path $fullPath)) {
    Write-Host "Log file not found yet at $fullPath. Waiting for logger to create it..."
    while (-not (Test-Path $fullPath)) {
      Start-Sleep -Seconds 1
    }
  }
}

Write-Host "Tailing $fullPath`nPress Ctrl+C to stop." -ForegroundColor Cyan
Get-Content -Path $fullPath -Wait -Tail 200
