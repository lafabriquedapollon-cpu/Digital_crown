# Lanceur utilisateur silencieux Digital Crown.
# - Si le serveur cabinet répond déjà, ouvre simplement l'interface.
# - Sinon, démarre la release immuable cabinet la plus récente via le
#   lanceur contrôlé (jamais le dépôt, jamais --reload), attend le port puis
#   ouvre l'interface.
[CmdletBinding()]
param(
    [string]$RuntimeRoot = 'C:\Users\lenovo\DigitalCrown-Runtime',
    [string]$RepoRoot = 'C:\Users\lenovo\Documents\Cabinet\DigitalCrown',
    [string]$RealEnvFile = 'C:\Users\lenovo\Documents\Cabinet\DigitalCrown\backend\.env.local',
    [int]$Port = 8005
)

$ErrorActionPreference = 'Stop'

function Test-LocalPort([int]$PortNumber) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $async = $client.BeginConnect('127.0.0.1', $PortNumber, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne(700)) { return $false }
        $client.EndConnect($async)
        return $true
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

function Get-FrontendUrl {
    $httpsEnabled = $false
    if (Test-Path -LiteralPath $RealEnvFile) {
        $httpsLine = Get-Content -LiteralPath $RealEnvFile |
            Where-Object { $_ -match '^CABINET_HTTPS_ENABLED=' } |
            Select-Object -First 1
        if ($httpsLine) {
            $value = ($httpsLine -replace '^CABINET_HTTPS_ENABLED=', '').Trim().ToLower()
            $httpsEnabled = $value -in @('1', 'true', 'yes')
        }
    }
    $scheme = if ($httpsEnabled) { 'https' } else { 'http' }
    return "${scheme}://127.0.0.1:$Port"
}

$frontendUrl = Get-FrontendUrl
if (Test-LocalPort $Port) {
    Start-Process $frontendUrl
    exit 0
}

$releasesRoot = Join-Path $RuntimeRoot 'releases'
$release = Get-ChildItem -LiteralPath $releasesRoot -Directory |
    Sort-Object Name -Descending |
    Where-Object {
        $manifestPath = Join-Path $_.FullName 'release-manifest.json'
        if (-not (Test-Path -LiteralPath $manifestPath)) { return $false }
        try {
            $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
            return $manifest.environment -eq 'cabinet-real' -and $manifest.frontend_dist_path -notmatch 'rehearsal|dist-test'
        } catch {
            return $false
        }
    } |
    Select-Object -First 1

if (-not $release) {
    throw 'Aucune release immuable cabinet valide trouvée.'
}

$controlledLauncher = Join-Path $RepoRoot 'backend\scripts\run_real_backend.ps1'
if (-not (Test-Path -LiteralPath $controlledLauncher)) {
    throw "Lanceur contrôlé introuvable : $controlledLauncher"
}

$arguments = @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
    '-File', $controlledLauncher,
    '-ReleaseId', $release.Name,
    '-ConfirmRealActivation', 'YES'
)
Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -WindowStyle Hidden

for ($attempt = 0; $attempt -lt 120; $attempt++) {
    if (Test-LocalPort $Port) {
        Start-Process $frontendUrl
        exit 0
    }
    Start-Sleep -Milliseconds 500
}

throw 'Digital Crown ne répond pas après 60 secondes. Consultez les logs du runtime.'
