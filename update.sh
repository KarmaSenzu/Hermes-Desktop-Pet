#!/usr/bin/env bash
# ==============================================================================
# Hermes Desktop Pet — Fast One-Liner Auto-Updater Script (macOS & Linux)
# Repository: https://github.com/KarmaSenzu/Hermes-Desktop-Pet
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/KarmaSenzu/Hermes-Desktop-Pet/main/update.sh | bash
# ==============================================================================

set -e

REPO="KarmaSenzu/Hermes-Desktop-Pet"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "\n${BOLD}${CYAN}=== Hermes Desktop Pet — Seamless Auto-Updater ===${NC}"
echo -e "Sistem terdeteksi: ${BOLD}${OS}${NC} (${ARCH})"

# 1. Periksa rilis terbaru dari GitHub Releases API
API_URL="https://api.github.com/repos/${REPO}/releases/latest"
echo -e "\n${CYAN}🔍 Memeriksa versi terbaru dari GitHub...${NC}"

RELEASE_TMP="/tmp/hermes_latest_release.json"
HTTP_STATUS=$(curl -s -H "User-Agent: Hermes-Updater" -o "${RELEASE_TMP}" -w "%{http_code}" "${API_URL}" || true)

if [ "${HTTP_STATUS}" -ne 200 ] || [ ! -f "${RELEASE_TMP}" ]; then
  echo -e "${RED}✗ Gagal menghubungi GitHub Releases API (HTTP ${HTTP_STATUS}). Periksa koneksi internet Anda.${NC}"
  exit 1
fi

LATEST_TAG=$(grep -m 1 '"tag_name":' "${RELEASE_TMP}" | cut -d '"' -f 4)
RELEASE_NAME=$(grep -m 1 '"name":' "${RELEASE_TMP}" | cut -d '"' -f 4)

if [ -z "${LATEST_TAG}" ]; then
  echo -e "${RED}✗ Tidak dapat membaca tag rilis terbaru dari respons GitHub.${NC}"
  exit 1
fi

echo -e "  ${GREEN}✓${NC} Rilis terbaru ditemukan: ${BOLD}${LATEST_TAG}${NC} (${RELEASE_NAME})"

# 2. Periksa versi yang saat ini terpasang di sistem
CURRENT_VER="tidak diketahui"
if [ "${OS}" = "darwin" ] && [ -d "/Applications/Hermes Desktop Pet.app" ]; then
  INFO_PLIST="/Applications/Hermes Desktop Pet.app/Contents/Info.plist"
  if [ -f "${INFO_PLIST}" ]; then
    CURRENT_VER=$(defaults read "${INFO_PLIST}" CFBundleShortVersionString 2>/dev/null || echo "terpasang")
  fi
elif [ "${OS}" = "linux" ] && [ -f "${HOME}/.local/bin/hermes-desktop-pet" ]; then
  CURRENT_VER="terpasang"
fi

echo -e "  ℹ Versi di komputer Anda: ${BOLD}v${CURRENT_VER#v}${NC}"

# 3. Cari URL aset biner yang cocok untuk OS saat ini
DOWNLOAD_URL=""
ASSET_NAME=""

if [ "${OS}" = "darwin" ]; then
  # Prioritaskan .dmg atau -mac.zip
  DOWNLOAD_URL=$(grep 'browser_download_url' "${RELEASE_TMP}" | grep -i '\.dmg' | cut -d '"' -f 4 | head -n 1)
  if [ -z "${DOWNLOAD_URL}" ]; then
    DOWNLOAD_URL=$(grep 'browser_download_url' "${RELEASE_TMP}" | grep -i '\-mac\.zip' | cut -d '"' -f 4 | head -n 1)
  fi
elif [ "${OS}" = "linux" ]; then
  DOWNLOAD_URL=$(grep 'browser_download_url' "${RELEASE_TMP}" | grep -i '\.AppImage' | cut -d '"' -f 4 | head -n 1)
fi

if [ -z "${DOWNLOAD_URL}" ]; then
  echo -e "${RED}✗ Berkas biner untuk sistem operasi ${OS} tidak ditemukan di rilis ${LATEST_TAG}.${NC}"
  exit 1
fi

ASSET_NAME=$(basename "${DOWNLOAD_URL}")
WORK_DIR=$(mktemp -d /tmp/hermes_update_XXXXXX)
TARGET_FILE="${WORK_DIR}/${ASSET_NAME}"

echo -e "\n${CYAN}⬇ Mengunduh paket pembaruan ${BOLD}${ASSET_NAME}${NC}..."
curl -fL --progress-bar -o "${TARGET_FILE}" "${DOWNLOAD_URL}"

# 4. Tutup aplikasi yang sedang berjalan dengan rapi
echo -e "\n${CYAN}⚡ Menutup aplikasi Hermes Desktop Pet jika sedang terbuka...${NC}"
if [ "${OS}" = "darwin" ]; then
  osascript -e 'quit app "Hermes Desktop Pet"' 2>/dev/null || true
  killall "Hermes Desktop Pet" 2>/dev/null || true
  sleep 1
elif [ "${OS}" = "linux" ]; then
  killall "hermes-desktop-pet" 2>/dev/null || true
  sleep 1
fi

# 5. Terapkan pembaruan ke direktori aplikasi
if [ "${OS}" = "darwin" ]; then
  echo -e "${CYAN}📦 Memasang versi baru ke /Applications...${NC}"
  
  if [[ "${TARGET_FILE}" == *.dmg ]]; then
    MOUNT_DIR="${WORK_DIR}/mount"
    mkdir -p "${MOUNT_DIR}"
    hdiutil attach -nobrowse -readonly "${TARGET_FILE}" -mountpoint "${MOUNT_DIR}" > /dev/null 2>&1
    
    # Salin file .app baru
    if [ -d "${MOUNT_DIR}/Hermes Desktop Pet.app" ]; then
      rm -rf "/Applications/Hermes Desktop Pet.app" 2>/dev/null || true
      cp -R "${MOUNT_DIR}/Hermes Desktop Pet.app" "/Applications/"
    fi
    
    # Unmount installer DMG
    hdiutil detach "${MOUNT_DIR}" -force > /dev/null 2>&1 || true
  elif [[ "${TARGET_FILE}" == *.zip ]]; then
    rm -rf "/Applications/Hermes Desktop Pet.app" 2>/dev/null || true
    unzip -q -o "${TARGET_FILE}" -d "/Applications/"
  fi

  # Bersihkan karantina Gatekeeper macOS agar langsung bisa dibuka
  echo -e "${CYAN}🛡 Membersihkan atribut karantina macOS (xattr)...${NC}"
  xattr -cr "/Applications/Hermes Desktop Pet.app" 2>/dev/null || true

  # Bersihkan berkas sementara
  rm -rf "${WORK_DIR}" "${RELEASE_TMP}" 2>/dev/null || true

  echo -e "\n${GREEN}${BOLD}✓ PEMBARUAN BERHASIL DIPASANG! Versi ${LATEST_TAG} aktif.${NC}"
  echo -e "${CYAN}🚀 Membuka kembali Hermes Desktop Pet...${NC}\n"
  open "/Applications/Hermes Desktop Pet.app"
  exit 0

elif [ "${OS}" = "linux" ]; then
  BIN_DIR="${HOME}/.local/bin"
  mkdir -p "${BIN_DIR}"
  mv "${TARGET_FILE}" "${BIN_DIR}/hermes-desktop-pet"
  chmod +x "${BIN_DIR}/hermes-desktop-pet"
  
  rm -rf "${WORK_DIR}" "${RELEASE_TMP}" 2>/dev/null || true

  echo -e "\n${GREEN}${BOLD}✓ PEMBARUAN BERHASIL DIPASANG! Versi ${LATEST_TAG} aktif di ${BIN_DIR}/hermes-desktop-pet.${NC}"
  echo -e "${CYAN}🚀 Menjalankan Hermes Desktop Pet...${NC}\n"
  nohup "${BIN_DIR}/hermes-desktop-pet" > /dev/null 2>&1 &
  exit 0
fi
