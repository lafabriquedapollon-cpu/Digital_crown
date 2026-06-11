# setup-https-local.ps1 — Génère des certificats TLS auto-signés pour le LAN
# Prérequis : mkcert installé (choco install mkcert)

param(
    [string]$IP = "127.0.0.1"
)

Write-Host "=== Setup HTTPS Local — Digital Crown ===" -ForegroundColor Cyan

if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
    Write-Host "mkcert non trouve. Installez-le : choco install mkcert" -ForegroundColor Red
    Write-Host "   Ou : https://github.com/FiloSottile/mkcert/releases" -ForegroundColor Yellow
    exit 1
}

mkcert -install

$certsDir = Join-Path $PSScriptRoot "..\certs"
New-Item -ItemType Directory -Force -Path $certsDir | Out-Null

Push-Location $certsDir
mkcert localhost 127.0.0.1 $IP ::1
Pop-Location

Write-Host "Certificats generes dans : $certsDir" -ForegroundColor Green
Write-Host "Pour demarrer uvicorn HTTPS :" -ForegroundColor Cyan
Write-Host "  uvicorn backend.main:app --host 0.0.0.0 --port 443 --ssl-keyfile certs/localhost+3-key.pem --ssl-certfile certs/localhost+3.pem" -ForegroundColor White
