$ErrorActionPreference = "Stop"

$port = 5176
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$webShellPath = Join-Path $repoRoot "packages\web-shell"

Get-Process -Name "electron" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$viteUp = $false
try {
    Invoke-WebRequest -Uri "http://localhost:$port" -TimeoutSec 2 -UseBasicParsing | Out-Null
    $viteUp = $true
}
catch {
    $viteUp = $false
}

if (-not $viteUp) {
    $viteCommand = "Set-Location `"$webShellPath`"; npx vite --port $port"
    Start-Process pwsh -ArgumentList "-NoExit", "-Command", $viteCommand | Out-Null
    Start-Sleep -Seconds 2
}

Push-Location $webShellPath
$env:NODE_ENV = "development"
$env:VITE_DEV_SERVER_URL = "http://localhost:$port"
npx electron .
Pop-Location
