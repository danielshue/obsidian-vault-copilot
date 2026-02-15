$ErrorActionPreference = "Stop"

$port = 5176
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$webShellPath = Join-Path $repoRoot "packages\web-shell"

Get-Process -Name "electron" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Stop existing Vite servers for this web-shell so dependency prebundling refreshes
try {
    $viteProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
        Where-Object {
            ($_.CommandLine -like "*packages\\web-shell*") -and ($_.CommandLine -like "*vite*")
        }

    foreach ($proc in $viteProcesses) {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }
}
catch {
    # Best-effort cleanup
}

$viteUp = $false
try {
    Invoke-WebRequest -Uri "http://localhost:$port" -TimeoutSec 2 -UseBasicParsing | Out-Null
    $viteUp = $true
}
catch {
    $viteUp = $false
}

$viteCommand = "Set-Location `"$webShellPath`"; npx vite --force --port $port"
Start-Process pwsh -ArgumentList "-NoExit", "-Command", $viteCommand | Out-Null
Start-Sleep -Seconds 2

Push-Location $webShellPath
$env:NODE_ENV = "development"
$env:VITE_DEV_SERVER_URL = "http://localhost:$port"
npx electron .
Pop-Location
