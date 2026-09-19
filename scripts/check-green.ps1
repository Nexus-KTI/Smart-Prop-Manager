# Requires: PowerShell, python, node/npm in PATH
# Usage: .\scripts\check-green.ps1
# Optional: .\scripts\check-green.ps1 -SkipWeb

param(
  [switch]$SkipWeb,
  [switch]$SkipApi
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "== API tests ==" -ForegroundColor Cyan
if (-not $SkipApi) {
  python -m pytest tests/ -q --tb=line
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
  Write-Host "skipped"
}

Write-Host "== Web lint ==" -ForegroundColor Cyan
if (-not $SkipWeb) {
  Push-Location (Join-Path $root "web")
  try {
    npm run lint
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  } finally {
    Pop-Location
  }
} else {
  Write-Host "skipped"
}

Write-Host "GREEN" -ForegroundColor Green
