# REAL-RUNTIME-IMMUTABILITY-GUARD-1
# Snapshot the working repo (backend/ + current frontend/dist) into an IMMUTABLE release
# folder, outside the repo, so the real runtime never again follows edits made in
# C:\Users\lenovo\Documents\Cabinet\DigitalCrown.
#
# Touches NO file in the working repo (read + copy only). Activates NOTHING: this script
# produces a release candidate, it does not put it into service.

param(
    [string]$RuntimeRoot = "C:\Users\lenovo\DigitalCrown-Runtime",
    [string]$RepoRoot = "C:\Users\lenovo\Documents\Cabinet\DigitalCrown"
)

$ErrorActionPreference = "Stop"
Write-Host "=== create_release.ps1 - immutable snapshot ===" -ForegroundColor Yellow

if (-not (Test-Path $RepoRoot)) {
    Write-Host "ERROR: repo not found: $RepoRoot" -ForegroundColor Red
    exit 1
}

$distIndex = Join-Path $RepoRoot "frontend\dist\index.html"
if (-not (Test-Path $distIndex)) {
    Write-Host "ERROR: frontend/dist not found or empty - build first (safe npm run build, or explicit build:real)." -ForegroundColor Red
    exit 1
}

$commit = (git -C $RepoRoot rev-parse HEAD 2>$null)
if (-not $commit) { $commit = "unknown" }
$dirty = git -C $RepoRoot status --porcelain --untracked-files=no 2>$null
if ($dirty) {
    Write-Host "ERROR: source worktree contains tracked modifications. Release refused." -ForegroundColor Red
    exit 1
}
$commitShort = $commit.Substring(0, [Math]::Min(12, $commit.Length))
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$releaseId = "$timestamp-$commitShort"
$releaseDir = Join-Path (Join-Path $RuntimeRoot "releases") $releaseId

if (Test-Path $releaseDir) {
    Write-Host "ERROR: release $releaseId already exists." -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null

# /R:2 /W:5 : sans ces flags, robocopy retente 1 million de fois (30s d'attente) sur un
# fichier verrouille -- blocage silencieux constate le 2026-07-11 sur un backup .enc en
# cours d'ecriture. "backups" est exclu : les sauvegardes chiffrees (~800MB) n'ont rien a
# faire dans une release de code immuable.
Write-Host "Copying backend/ -> $releaseDir\backend (excluding .env*, __pycache__, venv, backups)..." -ForegroundColor Cyan
robocopy "$RepoRoot\backend" "$releaseDir\backend" /E /R:2 /W:5 /XD "__pycache__" ".pytest_cache" "venv" "backups" /XF ".env" ".env.*" | Out-Null
if ($LASTEXITCODE -ge 8) {
    Write-Host "ERROR: robocopy backend failed (code $LASTEXITCODE)." -ForegroundColor Red
    exit 1
}

Write-Host "Copying frontend/dist/ -> $releaseDir\frontend\dist..." -ForegroundColor Cyan
robocopy "$RepoRoot\frontend\dist" "$releaseDir\frontend\dist" /E /R:2 /W:5 | Out-Null
if ($LASTEXITCODE -ge 8) {
    Write-Host "ERROR: robocopy frontend/dist failed (code $LASTEXITCODE)." -ForegroundColor Red
    exit 1
}

$distManifestPath = Join-Path "$releaseDir\frontend\dist" "build-manifest.json"
$frontendManifest = if (Test-Path $distManifestPath) { Get-Content $distManifestPath -Raw | ConvertFrom-Json } else { $null }

$releaseManifest = [ordered]@{
    environment        = "cabinet-real"
    commit             = $commit
    built_at           = (Get-Date).ToString("o")
    release_id         = $releaseId
    backend_path       = "$releaseDir\backend"
    frontend_dist_path = "$releaseDir\frontend\dist"
    frontend_manifest  = $frontendManifest
    source_repo        = $RepoRoot
    created_by_script  = "create_release.ps1"
}

$releaseManifest | ConvertTo-Json -Depth 6 | Set-Content -Path (Join-Path $releaseDir "release-manifest.json") -Encoding utf8

Write-Host ""
Write-Host "=== Release created (NOT ACTIVATED) ===" -ForegroundColor Green
Write-Host "release_id : $releaseId"
Write-Host "path       : $releaseDir"
Write-Host "commit     : $commit"
Write-Host ""
Write-Host "This release is NOT in service. To activate it, use run_real_backend.ps1" -ForegroundColor Yellow
Write-Host "-ReleaseId $releaseId with explicit confirmation, during the planned controlled window." -ForegroundColor Yellow

# robocopy's own exit code (0-7 = various shades of success) would otherwise leak out as
# this script's exit code and be misread as a failure by callers checking $LASTEXITCODE.
exit 0
