#!/usr/bin/env bash
# ==============================================================================
# Hermes Desktop Pet — Fast Terminal Installer Script (Linux & macOS)
# Repository: https://github.com/KarmaSenzu/Hermes-Desktop-Pet
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

echo -e "\n${BOLD}${CYAN}=== Hermes Desktop Pet — Auto Installer ===${NC}"
echo -e "Mendeteksi sistem operasi: ${BOLD}${OS}${NC} (${ARCH})"

INSTALL_DIR="${HOME}/.local/share/hermes-desktop-pet"
BIN_DIR="${HOME}/.local/bin"

mkdir -p "${INSTALL_DIR}" "${BIN_DIR}"

API_URL="https://api.github.com/repos/${REPO}/releases/latest"
echo -e "\n${CYAN}ℹ${NC} Memeriksa rilis terbaru dari GitHub..."

HTTP_STATUS=$(curl -s -o /tmp/hermes_release.json -w "%{http_code}" "${API_URL}" || true)

if [ "${HTTP_STATUS}" -eq 200 ] && [ -f /tmp/hermes_release.json ]; then
  VERSION=$(grep -m 1 '"tag_name":' /tmp/hermes_release.json | cut -d '"' -f 4)
  echo -e "  ${GREEN}✓${NC} Rilis biner ditemukan: ${BOLD}${VERSION}${NC}"
  
  DOWNLOAD_URL=""
  if [ "${OS}" = "darwin" ]; then
    DOWNLOAD_URL=$(grep 'browser_download_url' /tmp/hermes_release.json | grep -i '\.dmg' | cut -d '"' -f 4 | head -n 1)
  elif [ "${OS}" = "linux" ]; then
    DOWNLOAD_URL=$(grep 'browser_download_url' /tmp/hermes_release.json | grep -i '\.AppImage' | cut -d '"' -f 4 | head -n 1)
  fi

  if [ -n "${DOWNLOAD_URL}" ]; then
    if [ "${OS}" = "darwin" ]; then
      TARGET_FILE="/tmp/Hermes-Desktop-Pet-Installer.dmg"
    else
      TARGET_FILE="/tmp/hermes-installer-asset"
    fi
    echo -e "  ${CYAN}⬇${NC} Mengunduh berkas biner (${DOWNLOAD_URL})..."
    curl -fL --progress-bar -o "${TARGET_FILE}" "${DOWNLOAD_URL}"
    
    if [ "${OS}" = "darwin" ]; then
      echo -e "  ${GREEN}✓${NC} Berkas .dmg terunduh. Membuka jendela installer..."
      hdiutil attach "${TARGET_FILE}" || true
      echo -e "\n${GREEN}${BOLD}✓ Berkas installer DMG berhasil dibuka!${NC}"
      echo -e "Silakan seret ikon ${BOLD}Hermes Desktop Pet${NC} ke folder ${BOLD}Applications${NC} di jendela yang terbuka."
      echo -e "\n${YELLOW}💡 CATATAN PENTING MACOS (Gatekeeper):${NC}"
      echo -e "Jika saat dibuka muncul peringatan: ${YELLOW}'Aplikasi rusak dan tidak dapat dibuka'${NC},"
      echo -e "cukup jalankan perintah ini di Terminal Mac Anda:"
      echo -e "  ${BOLD}${CYAN}xattr -cr \"/Applications/Hermes Desktop Pet.app\"${NC}\n"
      exit 0
    elif [ "${OS}" = "linux" ]; then
      mv "${TARGET_FILE}" "${BIN_DIR}/hermes-desktop-pet"
      chmod +x "${BIN_DIR}/hermes-desktop-pet"
      echo -e "  ${GREEN}✓${NC} Aplikasi terpasang di: ${BOLD}${BIN_DIR}/hermes-desktop-pet${NC}"
      echo -e "\nJalankan langsung dengan perintah: ${BOLD}hermes-desktop-pet${NC}\n"
      exit 0
    fi
  fi
fi

# Fallback ke instalasi mode developer jika biner GitHub release belum diunggah
echo -e "\n${YELLOW}⚠ Rilis biner langsung belum tersedia di GitHub Releases.${NC}"
echo -e "Mengalihkan ke instalasi otomatis via kloning kode sumber...\n"

if ! command -v git &> /dev/null; then
  echo -e "${RED}✗ Git belum terpasang.${NC} Silakan pasang git terlebih dahulu."
  exit 1
fi

if ! command -v node &> /dev/null; then
  echo -e "${RED}✗ Node.js belum terpasang.${NC} Diperlukan Node.js >= v18 (Rekomendasi: v24 LTS)."
  exit 1
fi

CLONE_DIR="${INSTALL_DIR}/source"
if [ -d "${CLONE_DIR}" ]; then
  echo -e "Memperbarui repositori lokal..."
  cd "${CLONE_DIR}" && git pull origin main
else
  echo -e "Mengkloning repositori..."
  git clone "https://github.com/${REPO}.git" "${CLONE_DIR}"
fi

cd "${CLONE_DIR}/avatar"
echo -e "Memasang dependensi JavaScript (Zero Native C++)..."
npm install

echo -e "Menjalankan diagnosa mandiri..."
npm run doctor

cat << 'EOF' > "${BIN_DIR}/hermes-pet"
#!/usr/bin/env bash
cd "$HOME/.local/share/hermes-desktop-pet/source/avatar" && npm run dev
EOF
chmod +x "${BIN_DIR}/hermes-pet"

echo -e "\n${GREEN}${BOLD}✓ Pemasangan Berhasil!${NC}"
echo -e "Jalankan avatar kapan saja dengan mengetik: ${BOLD}hermes-pet${NC}\n"
