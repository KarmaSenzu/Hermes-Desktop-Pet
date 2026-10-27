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

# 2. Prioritaskan paket pembaruan portabel (.zip) agar tidak perlu menjalankan installer .exe ulang
$Asset = $Release.assets | Where-Object { $_.name -like "*win*.zip" } | Select-Object -First 1
if (-not $Asset) {
    $Asset = $Release.assets | Where-Object { $_.name -like "*.zip" -and $_.name -notlike "*mac*" -and $_.name -notlike "*linux*" } | Select-Object -First 1
}
if (-not $Asset) {
    $Asset = $Release.assets | Where-Object { $_.name -like "*.exe" } | Select-Object -First 1
}

if (-not $Asset) {
    Write-Host "✗ Berkas rilis Windows tidak ditemukan di rilis $LatestTag." -ForegroundColor Red
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

# 4. Terapkan pembaruan langsung
Write-Host "📦 Menerapkan pembaruan..." -ForegroundColor Cyan
$DestDir = Join-Path $env:LOCALAPPDATA "Programs\Hermes Desktop Pet"
if (-not (Test-Path $DestDir)) {
    New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
}

if ($TargetFile.EndsWith(".zip")) {
    $ExtractTemp = Join-Path $TempDir "extracted"
    Expand-Archive -Path $TargetFile -DestinationPath $ExtractTemp -Force
    $InnerDir = Get-ChildItem -Path $ExtractTemp | Where-Object { $_.PSIsContainer -and (Test-Path (Join-Path $_.FullName "Hermes Desktop Pet.exe")) } | Select-Object -First 1
    $SourceDir = if ($InnerDir) { $InnerDir.FullName } else { $ExtractTemp }
    Copy-Item -Path "$SourceDir\*" -Destination $DestDir -Recurse -Force
} else {
    Start-Process -FilePath $TargetFile -ArgumentList "/S" -Wait
}

Write-Host "`n✓ PEMBARUAN BERHASIL DIPASANG! Versi $LatestTag aktif." -ForegroundColor Green
Write-Host "🚀 Membuka Hermes Desktop Pet..." -ForegroundColor Cyan

$AppPath = Join-Path $env:LOCALAPPDATA "Programs\Hermes Desktop Pet\Hermes Desktop Pet.exe"
if (Test-Path $AppPath) {
    Start-Process -FilePath $AppPath
}
