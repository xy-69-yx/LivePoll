$ErrorActionPreference = 'Stop'

$TargetUrl = $args[0]
if (-not $TargetUrl) {
  $TargetUrl = 'https://127.0.0.1:4173/'
}

$OutputPath = $args[1]
if (-not $OutputPath) {
  $OutputPath = Join-Path $PSScriptRoot 'mobile-responsive.png'
}

node (Join-Path $PSScriptRoot 'capture-mobile-screenshot.mjs') $TargetUrl $OutputPath

if ($LASTEXITCODE -ne 0) {
  throw "Screenshot capture failed with exit code $LASTEXITCODE"
}
