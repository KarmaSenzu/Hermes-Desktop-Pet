# ==============================================================================
# Hermes Desktop Pet — Fast One-Liner Auto-Updater Script (Windows PowerShell)
# Repository: https://github.com/KarmaSenzu/Hermes-Desktop-Pet
# Usage:
#   irm https://raw.githubusercontent.com/KarmaSenzu/Hermes-Desktop-Pet/main/update.ps1 | iex
# ==============================================================================

$ErrorActionPreference = "Stop"
$Repo = "KarmaSenzu/Hermes-Desktop-Pet"

Write-Host "`n=== Hermes Desktop Pet — Seamless Auto-Updater (Windows) ===" -ForegroundColor Cyan

# 1. Periksa rilis terbaru dari GitHub
$ApiUrl = "https://api.github.com/repos/$Repo/releases/latest"
Write-Host "🔍 Memeriksa versi terbaru dari GitHub..." -ForegroundColor Cyan

try {
    $Release = Invoke-RestMethod -Uri $ApiUrl -Headers @{ "User-Agent" = "Hermes-Updater" }
} catch {
    Write-Host "✗ Gagal menghubungi GitHub Releases API: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$LatestTag = $Release.tag_name
$ReleaseName = $Release.name
Write-Host "  ✓ Rilis terbaru ditemukan: $LatestTag ($ReleaseName)" -ForegroundColor Green

# 2. Cari aset installer Windows (.exe) atau .zip
$Asset = $Release.assets | Where-Object { $_.name -like "*.exe" } | Select-Object -First 1
if (-not $Asset) {
    $Asset = $Release.assets | Where-Object { $_.name -like "*win*.zip" } | Select-Object -First 1
}

if (-not $Asset) {
    Write-Host "✗ Berkas installer Windows tidak ditemukan di rilis $LatestTag." -ForegroundColor Red
    exit 1
}

$DownloadUrl = $Asset.browser_download_url
$AssetName = $Asset.name
$TempDir = Join-Path $env:TEMP ("hermes_update_" + [System.Guid]::NewGuid().ToString().Substring(0, 8))
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
$TargetFile = Join-Path $TempDir $AssetName

Write-Host "⬇ Mengunduh $AssetName..." -ForegroundColor Cyan
Start-BitsTransfer -Source $DownloadUrl -Destination $TargetFile -ErrorAction SilentlyContinue
if (-not (Test-Path $TargetFile)) {
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $TargetFile
}

# 3. Tutup aplikasi yang sedang berjalan
Write-Host "⚡ Menutup aplikasi Hermes Desktop Pet jika sedang terbuka..." -ForegroundColor Cyan
Get-Process "Hermes Desktop Pet" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# 4. Jalankan installer
Write-Host "📦 Menjalankan pembaruan..." -ForegroundColor Cyan
if ($TargetFile.EndsWith(".exe")) {
    Start-Process -FilePath $TargetFile -ArgumentList "/S" -Wait
} elseif ($TargetFile.EndsWith(".zip")) {
    $DestDir = Join-Path $env:LOCALAPPDATA "Programs\Hermes Desktop Pet"
    Expand-Archive -Path $TargetFile -DestinationPath $DestDir -Force
}

Write-Host "`n✓ PEMBARUAN BERHASIL DIPASANG! Versi $LatestTag aktif." -ForegroundColor Green
Write-Host "🚀 Membuka Hermes Desktop Pet..." -ForegroundColor Cyan

$AppPath = Join-Path $env:LOCALAPPDATA "Programs\Hermes Desktop Pet\Hermes Desktop Pet.exe"
if (Test-Path $AppPath) {
    Start-Process -FilePath $AppPath
}
