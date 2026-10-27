# Hermes Desktop Pet

> Asisten AI interaktif yang hadir secara visual di layar komputer Anda — menggabungkan kecerdasan agen otonom Hermes dengan avatar Live2D dan 3D dalam jendela transparan desktop.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Security](https://img.shields.io/badge/Node.js-v24.22.1%20LTS%20%7C%20v22.23.4%20LTS-green.svg)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/Electron-33.x-47848F.svg)](https://www.electronjs.org/)
[![PixiJS](https://img.shields.io/badge/PixiJS-6.5-E72264.svg)](https://pixijs.com/)
[![Three.js](https://img.shields.io/badge/Three.js-r170-black.svg)](https://threejs.org/)
[![Native Dependencies](https://img.shields.io/badge/C%2B%2B%20Build%20Tools-None%20(Pure%20JS)-success.svg)](#verifikasi-sistem-dan-diagnosa-mandiri)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

<!-- SHOWCASE HERO BANNER -->
<!-- Tempatkan file gambar banner di docs/assets/hero-banner.png -->
<p align="center">
  <img src="docs/assets/hero-banner.png" alt="Hermes Desktop Pet Showcase Banner" width="100%" />
</p>

---

<div align="center">

### 📦 Unduh Hermes Desktop Pet (Rilis Siap Pakai)

Pilih berkas installer resmi yang sesuai dengan sistem operasi dan arsitektur prosesor komputer Anda:

| Sistem Operasi | Arsitektur / Tipe | Berkas Unduhan | Tipe Paket & Keterangan |
| :--- | :--- | :---: | :--- |
| 🍏 **macOS (Apple Silicon)** | Apple M1 / M2 / M3 / M4 (ARM64) | [**Download .dmg (Apple Silicon)**](https://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases/latest) | Installer DMG Resmi (Rekomendasi Mac Modern) |
| 🍏 **macOS (Intel Core)** | Intel x86_64 | [**Download .zip (Mac Intel)**](https://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases/latest) / [Script Terminal](#-metode-1-pemasangan-cepat-via-terminal-macos--linux) | Universal ZIP / Auto Installer |
| 🪟 **Windows 10 / 11** | 64-bit (x64) | [**Download Setup .exe**](https://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases/latest) | Installer NSIS (Pemasangan Otomatis + Shortcut) |
| 🪟 **Windows Portable** | 64-bit (x64) | [**Download Portable .zip**](https://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases/latest) | Versi Portabel (Tinggal Ekstrak & Jalankan) |
| 🐧 **Linux (Universal)** | 64-bit (x86_64) | [**Download .AppImage**](https://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases/latest) | AppImage Standalone (Semua Distro Linux) |
| 🐧 **Linux (Tarball)** | 64-bit (tar.gz) | [**Download .tar.gz**](https://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases/latest) | Arsip Biner Linux Lengkap |

👉 *Semua varian file rilis dapat dilihat langsung di [**Halaman Rilis GitHub (GitHub Releases)**](https://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases/latest)*

---

#### ⚡ Pemasangan Cepat via Terminal (macOS & Linux):
Bagi Anda yang ingin memasang langsung secara otomatis dalam satu baris perintah:
```bash
curl -fsSL https://raw.githubusercontent.com/KarmaSenzu/Hermes-Desktop-Pet/main/install.sh | bash
```

#### 🔄 Pembaruan Cepat ke Versi Terbaru (Bagi yang Sudah Memasang):
Cukup jalankan satu perintah berikut di terminal tanpa perlu download ulang:
* **macOS & Linux (Terminal Bash):**
  ```bash
  curl -fsSL https://raw.githubusercontent.com/KarmaSenzu/Hermes-Desktop-Pet/main/update.sh | bash
  ```
* **Windows (PowerShell):**
  ```powershell
  irm https://raw.githubusercontent.com/KarmaSenzu/Hermes-Desktop-Pet/main/update.ps1 | iex
  ```
*(Atau gunakan tombol **Update Sekarang** langsung di dalam menu Pengaturan aplikasi).*

</div>

---

### 🚀 Apa yang Baru di Versi v0.1.4?
* 🧘 **Pengaturan Kustom Pengingat Idle & Postur Tubuh:** Kustomisasi kalimat motivasi harian (seperti *"Tegakkan badanmu"*, *"Minum air putih"*), sesuaikan frekuensi interval munculnya (1–60 menit), uji audio TTS langsung, dan nikmati sinkronisasi instan ke avatar tanpa perlu restart.
* 🗣️ **Restorasi Suara Sapaan Awal (*Welcome Voice*) + Live2D Lip-Sync:** Karakter kembali menyapa dengan suara ramah saat pertama kali dibuka, dilengkapi sinkronisasi gerak bibir (*lip-sync*) dan perbaikan *autoplay policy* Chromium.
* 🎵 **Perbaikan Hermes Music Player:** Mencegah pemutaran otomatis musik YouTube Lo-Fi (*Midnight Study in Shibuya*) saat startup; pemutaran kini 100% terkendali oleh pengguna.
* ⚡ **Modal Prasyarat Cerdas (*Smart Prerequisites Check*):** Tombol Mulai Avatar langsung meluncur jika semua layanan telah aktif (*4/4 Ready*), dan hanya menampilkan modal panduan jika ada modul yang belum siap.
* 📦 **Seamless In-App & Terminal OTA Updater:** Pembaruan aplikasi kini otomatis mendeteksi rilis `v0.1.4` dan dapat diperbarui dalam 1 klik.

---

## Daftar Isi

- [Pusat Unduhan Installer](#-unduh-hermes-desktop-pet-rilis-siap-pakai)
- [Tentang Proyek](#tentang-proyek)
- [Prinsip Arsitektur](#prinsip-arsitektur)
- [Fitur Utama](#fitur-utama)
- [Galeri Showcase](#galeri-showcase)
- [7 Core Skills Bawaan](#7-core-skills-bawaan)
- [Kebutuhan Sistem & Standar Keamanan](#kebutuhan-sistem--standar-keamanan)
- [Panduan Lengkap Instalasi & Menjalankan](#panduan-lengkap-instalasi--menjalankan)
  - [Metode 1: Pemasangan Cepat via Terminal (macOS & Linux)](#-metode-1-pemasangan-cepat-via-terminal-macos--linux)
  - [Metode 2: Panduan Instalasi Manual Per Sistem Operasi](#-metode-2-panduan-instalasi-manual-per-sistem-operasi)
    - [1. Panduan macOS (Apple Silicon M-Series & Intel)](#1-panduan-instalasi-macos-apple-silicon-m-series--intel)
    - [2. Cara Mengatasi Gatekeeper macOS (`xattr -cr`)](#2-solusi-gatekeeper-macos-aplikasi-rusak-dan-tidak-dapat-dibuka)
    - [3. Panduan Windows 10 & 11 (Installer & Portable)](#3-panduan-instalasi-windows-10--11)
    - [4. Panduan Linux (AppImage & Tarball)](#4-panduan-instalasi-linux-ubuntu-debian-fedora-arch)
  - [Metode 3: Menjalankan dari Kode Sumber (Pengembang / Developer)](#-metode-3-menjalankan-dari-kode-sumber-pengembang--developer)
  - [Panduan Komponen Ekstra (Kokoro-TTS & Chrome Extension)](#-panduan-komponen-ekstra-opsional)
- [Verifikasi Sistem dan Diagnosa Mandiri](#verifikasi-sistem-dan-diagnosa-mandiri)
- [Struktur Direktori](#struktur-direktori)
- [Tata Kelola & Kontribusi](#tata-kelola--kontribusi)
- [Lisensi](#lisensi)

---

## Tentang Proyek

**Hermes Desktop Pet** adalah antarmuka visual desktop (*companion pet*) untuk agen AI [Hermes](https://github.com/). Berbeda dari antarmuka obrolan teks konvensional, Hermes Desktop Pet menghadirkan pendamping kerja visual yang hidup di atas jendela kerja Anda (*transparent overlay*, *always-on-top*).

Aplikasi ini mengadopsi model pemisahan peran yang tegas (*Decoupled Architecture*):
* **Hermes** bertindak sebagai **Otak (*Brain*)**: mengelola penalaran (*reasoning*), eksekusi modul/tools, ingatan jangka panjang, dan percakapan.
* **Hermes Desktop Pet** bertindak sebagai **Aktor (*Actor*)**: merender visual karakter Live2D/3D, menangani interaksi fisik, memutar audio vokal, mengelola ubinan jendela kerja (*tiling window manager*), dan menyediakan pusat kendali pengguna.

---

## Prinsip Arsitektur

```
┌──────────────────────────────────────┐          WebSocket JSON-RPC (Port 9119)          ┌──────────────────────────────────────┐
│            HERMES AGENT              │ ◀──────────────────────────────────────────────▶ │          HERMES DESKTOP PET          │
│               (Otak)                 │                                                  │               (Aktor)                │
│                                      │          HTTP Synthesis Audio (Port 8880)        │                                      │
│  - LLM Reasoning & Tool Execution    │ ◀──────────────────────────────────────────────▶ │  - Electron Desktop Window (Overlay) │
│  - SQLite Long-Term Memory           │                                                  │  - Pixi.js + Live2D Cubism Engine    │
│  - 7 Built-in Core Skills            │          Gateway Proxy AI (Port 20128)           │  - Three.js WebGL 3D Engine          │
│  - JSON-RPC Server (:9119)           │ ◀──────────────────────────────────────────────▶ │  - Tiling Window Manager (Auto-Dock) │
└──────────────────────────────────────┘                                                  │  - Spotify Mini Music Player & DSP   │
                                                                                          │  - macOS-Style Settings Center       │
                                                                                          └──────────────────────────────────────┘
```

Untuk rincian teknis mendalam mengenai arsitektur protokol dan jembatan data, silakan baca [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) dan [docs/API_BRIDGE.md](docs/API_BRIDGE.md).

---

## Fitur Utama

### 1. Karakter Live2D & 3D Adaptif
* Jendela *frameless* transparan dengan dukungan tembus klik mouse (*click-through*) dan penguncian posisi.
* Simulasi fisika mata, rambut, dan busana yang responsif terhadap pergerakan kursor dan status avatar.
* Variasi gestur dan ekspresi dinamis: pose berpikir saat memproses AI, pose fokus jam saat mode kerja, pose menyapa, dan sinkronisasi bibir (*lip-sync*) saat bersuara.
* Kemudahan mengimpor model kustom (`.model3.json`, `.vrm`, `.glb`).

### 2. Tiling Window Manager (TWM) Otomatis
* Penataan otomatis (*auto-layout* dan *auto-adjust*) saat membuka atau menutup jendela pendamping (Timer, Pemutar Musik, Lembar Percakapan AI).
* **Alokasi Bilateral Cerdas:** Mendeteksi posisi avatar di layar secara real-time. Jika avatar berada di tepi kanan monitor, semua jendela otomatis bergeser kaskade ke sebelah kiri tanpa tumpang tindih; begitu pula sebaliknya jika avatar berada di tepi kiri.
* Mencegah benturan jendela (*collision-free*) dengan animasi transisi yang halus.

### 3. Pemutar Musik Mini Bergaya Spotify & Audio Ducking
* Antarmuka *dark glassmorphism* dilengkapi piringan vinyl berputar (*rotating disc*) dan visualizer gelombang audio.
* **Procedural Lofi Synthesizer:** Generator musik instan berbasis Web Audio API murni (progresi akor Rhodes jazz dan efek vinil) tanpa ketergantungan file luar.
* **Pemutar Audio Lokal:** Kemampuan memilih file lagu langsung dari komputer melalui protokol internal legal `model://`.
* **Streaming Radio Internet:** Stasiun live streaming lofi 24/7 bawaan dan input stream audio kustom.
* **Smart Audio Ducking:** Volume musik meredup otomatis (*fade down*) ke 20% saat avatar berbicara, dan pulih kembali (*fade up*) saat avatar selesai berbicara.

### 4. Sintesis Vokal Neural Anime (Kokoro-TTS)
* Menghasilkan vokal karakter anime Jepang yang jernih dan imut.
* Menerapkan pemetaan fonetik vokal murni (*pure vowels*) sehingga pelafalan Bahasa Indonesia dan istilah teknis dibaca secara utuh tanpa jeda mengeja huruf per abjad.
* Pembersihan otomatis terhadap karakter emoji dan normalisasi singkatan percakapan.

### 5. Pusat Pengaturan Bergaya macOS System Settings
* Tata letak panel ganda (navigasi sidebar kiri dan konten detail kanan) yang bersih.
* Pilihan gaya intonasi vokal, pemilihan mikrofon/suara, pengaturan shortcut global, dan manajer skill.
* Pengaturan animasi mandiri yang memungkinkan pengguna memetakan gaya gestur avatar untuk status berpikir, fokus kerja, maupun idle santai.

---

## Galeri Showcase

<!-- SHOWCASE SCREENSHOTS / DEMO MEDIA -->
<!-- Tempatkan media pendukung di docs/assets/ sesuai nama file berikut -->

| Fitur | Tampilan Pratinjau |
| :--- | :--- |
| **Desktop Pet Overlay & Gestur** | ![Desktop Pet Showcase](docs/assets/demo-avatar.png)<br>*(Karakter Live2D transparan selalu di atas jendela kerja)* |
| **Tiling Window Manager** | ![Tiling Window Manager Showcase](docs/assets/demo-tiling.gif)<br>*(Jendela Timer, Musik, dan Chat bergeser otomatis merapat)* |
| **Spotify Mini Music Player** | ![Music Player Showcase](docs/assets/demo-music-player.png)<br>*(Vinyl berputar, equalizer aktif, dan radio online 24/7)* |
| **Pusat Pengaturan macOS-Style** | ![Settings Showcase](docs/assets/demo-settings.png)<br>*(Konfigurasi karakter, suara, animasi kustom, dan shortcut)* |
| **Pemeriksaan Diagnosa Mandiri** | ![Doctor Diagnostic](docs/assets/demo-doctor.png)<br>*(Skrip diagnosa sistem satu ketukan: `npm run doctor`)* |

---

## 7 Core Skills Bawaan

Aplikasi ini menyertakan 7 modul kemampuan inti (*core skills*) yang terpasang secara permanen dan otomatis disinkronkan ke direktori agen Hermes pengguna:

1. **`mnemosyne`** — Penyimpanan memori percakapan jangka panjang berbasis SQLite lokal untuk mengenali preferensi pengguna secara konsisten.
2. **`duckduckgo-search`** — Pencarian informasi internet secara instan tanpa membutuhkan API key pihak ketiga.
3. **`pdf`** — Ekstraksi dokumen, pembacaan berkas referensi, dan tanya-jawab cerdas isi PDF.
4. **`scrapling`** — Pengambilan konten teks artikel web bersih tanpa gangguan iklan atau elemen markup.
5. **`weather-2-0`** — Laporan kondisi cuaca terkini dan prakiraan harian kota-kota di dunia.
6. **`open-application`** — Peluncur program dan aplikasi lokal komputer (seperti VS Code, Spotify, Notepad, Browser).
7. **`kokoro-tts`** — Mesin vokal neural lokal untuk menghasilkan suara sintetis berkarakter anime.

---

## Kebutuhan Sistem & Standar Keamanan

### Spesifikasi Perangkat Keras

| Komponen | Spesifikasi Minimum | Spesifikasi Rekomendasi |
| :--- | :--- | :--- |
| **Sistem Operasi** | Windows 10/11 64-bit, macOS 11+, Linux x64 | Windows 11 64-bit atau macOS (Apple Silicon M-Series) |
| **Prosesor (CPU)** | Intel Core i3 (Gen 8+) / AMD Ryzen 3 / Apple M1 | Intel Core i5/i7 (Gen 10+) / AMD Ryzen 5/7 / Apple M2/M3 |
| **Memori (RAM)** | 8 GB RAM | 16 GB RAM (nyaman untuk multitasking berat) |
| **Kartu Grafis** | Integrated GPU (Intel Iris Xe, Radeon Vega, Intel UHD) | Dedicated GPU (NVIDIA GTX 1650 / RTX Series atau Apple GPU) |
| **Penyimpanan** | 1.5 GB ruang disk kosong | SSD NVMe |
| **Koneksi Internet** | Diperlukan untuk akses LLM Cloud & streaming | Minimal 5 Mbps stabil |

### Standar Keamanan Node.js

Untuk melindungi sistem dari kerentanan keamanan, gunakan versi runtime Node.js resmi yang telah menerima pembaruan patch keamanan (bebas dari 11 CVE):

* **Node.js v24.22.1 (Jalur LTS Krypton — Sangat Direkomendasikan)**
* **Node.js v22.23.4 (Jalur LTS Jod)**
* **Node.js v26.12.1 (Jalur Current)**

---

## Panduan Lengkap Instalasi & Menjalankan

Pilih metode instalasi yang paling sesuai dengan kebutuhan Anda:

---

### ⚡ Metode 1: Pemasangan Cepat via Terminal (macOS & Linux)

Bagi pengguna macOS dan Linux, cara paling mudah dan cepat untuk memasang aplikasi adalah melalui script satu baris otomatis:

```bash
curl -fsSL https://raw.githubusercontent.com/KarmaSenzu/Hermes-Desktop-Pet/main/install.sh | bash
```

#### 📖 Tata Cara Penggunaan (Panduan Pemula):
1. **Buka Aplikasi Terminal:**
   - **Di Mac:** Tekan kombinasi tombol <kbd>Cmd</kbd> + <kbd>Spasi</kbd> untuk membuka Spotlight, ketik `Terminal`, lalu tekan <kbd>Enter</kbd>.
   - **Di Linux:** Tekan <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>T</kbd>.
2. **Ketik / Tempel Perintah:**
   Salin baris perintah `curl` di atas, tempelkan ke dalam jendela Terminal, lalu tekan <kbd>Enter</kbd>.
3. **Apa yang Normalnya Terjadi di Layar:**
   - **Tahap 1 — Deteksi Sistem:** Script otomatis mendeteksi sistem operasi dan tipe prosesor Anda (`darwin arm64` untuk Apple Silicon M1/M2/M3/M4, `x86_64` untuk Intel Mac/Linux).
   - **Tahap 2 — Pemeriksaan Rilis:** Script menghubungi GitHub Releases API untuk mencari installer biner rilis terbaru.
   - **Tahap 3 — Pengunduhan Berkas:** Muncul bilah kemajuan (*progress bar*) pengunduhan:
     ```text
     === Hermes Desktop Pet — Auto Installer ===
     Mendeteksi sistem operasi: darwin (arm64)
     ℹ Memeriksa rilis terbaru dari GitHub...
       ✓ Rilis biner ditemukan: v0.1.2
       ⬇ Mengunduh berkas biner...
     ################################################ 100.0%
     ```
   - **Tahap 4 — Pemasangan Selesai:**
     - **Di macOS:** Script otomatis membuka (*mount*) berkas `.dmg` ke layar Finder. Jendela penggeser aplikasi akan terbuka di layar Anda.
     - **Di Linux:** Berkas langsung dipasang ke `~/.local/bin/hermes-desktop-pet` dan diberi izin eksekusi (`chmod +x`).
4. **Cara Membuka Aplikasi Setelah Selesai:**
   - **Di macOS:** Seret ikon **Hermes Desktop Pet** ke folder **Applications**. Lalu buka aplikasi melalui Launchpad atau Finder. *(Jika muncul dialog proteksi Apple, lihat [solusi Gatekeeper](#2-solusi-gatekeeper-macos-aplikasi-rusak-dan-tidak-dapat-dibuka) di bawah).*
   - **Di Linux:** Buka Terminal kapan saja dan ketik perintah: `hermes-desktop-pet`.

---

### 🔄 Pembaruan Cepat Tanpa Unduh Ulang (Seamless Auto-Updater)

Bila Anda sudah menginstal aplikasi dan ingin memperbarui ke rilis terbaru tanpa perlu unduh ulang secara manual di browser:

* **Di macOS & Linux (Terminal Bash):**
  ```bash
  curl -fsSL https://raw.githubusercontent.com/KarmaSenzu/Hermes-Desktop-Pet/main/update.sh | bash
  ```
* **Di Windows (PowerShell):**
  ```powershell
  irm https://raw.githubusercontent.com/KarmaSenzu/Hermes-Desktop-Pet/main/update.ps1 | iex
  ```
* **Atau Langsung dari Aplikasi:**
  Buka menu **Home** di aplikasi Hermes Desktop Pet, klik tombol **"Update Sekarang ⚡"** pada banner notifikasi rilis. Aplikasi akan mengunduh paket secara online di background, menampilkan bilah kemajuan (*progress bar*), dan memasang pembaruan otomatis begitu selesai!

---

### 📦 Metode 2: Panduan Instalasi Manual Per Sistem Operasi

Bagi Anda yang memilih mengunduh installer biner secara manual dari browser tanpa terminal:

#### 1. Panduan Instalasi macOS (Apple Silicon M-Series & Intel)

1. Buka halaman [**GitHub Releases Resmi**](https://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases/latest).
2. Unduh berkas installer yang sesuai dengan Mac Anda:
   - **Untuk Mac Apple Silicon (M1 / M2 / M3 / M4 / ARM64):**  
     Unduh berkas: `Hermes.Desktop.Pet-x.x.x-arm64.dmg` *(Sangat direkomendasikan untuk efisiensi baterai & performa grafis Apple Silicon).*
   - **Untuk Mac Berprosesor Intel (x86_64):**  
     Unduh berkas: `Hermes.Desktop.Pet-x.x.x-arm64-mac.zip` atau gunakan [Script Terminal Otomatis](#-metode-1-pemasangan-cepat-via-terminal-macos--linux).
3. **Langkah Pemasangan:**
   - Klik ganda pada berkas `.dmg` yang telah selesai diunduh.
   - Pada jendela Finder yang muncul, **seret (*drag-and-drop*)** ikon aplikasi **Hermes Desktop Pet** ke dalam folder shortcut **Applications**.
   - Tunggu proses penyalinan selesai (sekitar 3–5 detik).
   - Keluarkan (*Eject*) disk image installer dari Finder.
   - Buka aplikasi dari **Launchpad** atau cari di Spotlight (<kbd>Cmd</kbd> + <kbd>Spasi</kbd> ketik `Hermes Desktop Pet`).

---

#### 2. Solusi Gatekeeper macOS ("Aplikasi Rusak dan Tidak Dapat Dibuka")

> [!CAUTION]
> **Peringatan Keamanan macOS (Apple Quarantine):**  
> Saat pertama kali membuka aplikasi di macOS, Anda mungkin melihat kotak dialog peringatan:  
> *"Hermes Desktop Pet rusak dan tidak dapat dibuka. Anda harus memindahkannya ke Tong Sampah"*  
> *(Bahasa Inggris: "Hermes Desktop Pet is damaged and can't be opened. You should move it to the Trash")*.

**Mengapa ini terjadi?**  
Ini adalah mekanisme proteksi bawaan sistem keamanan **macOS Gatekeeper**. Setiap aplikasi yang diunduh dari browser luar (bukan dari Mac App Store) akan ditandai dengan atribut karantina (`com.apple.quarantine`). Karena proyek ini adalah aplikasi *open-source* komunitas yang belum didaftarkan sertifikat berbayar Apple Developer ID ($99/tahun), macOS secara otomatis memblokir eksekusinya dan menampilkan pesan tersebut. **Aplikasi Anda sama sekali tidak rusak**.

**Cara Mengatasi dalam 1 Detik (Sangat Mudah):**
1. Klik tombol **Batalkan** (*Cancel*) pada kotak dialog peringatan tersebut (jangan klik pindahkan ke tong sampah).
2. Buka aplikasi **Terminal** di Mac Anda.
3. Ketik atau tempel perintah berikut lalu tekan <kbd>Enter</kbd>:
   ```bash
   xattr -cr "/Applications/Hermes Desktop Pet.app"
   ```
4. *(Perintah ini langsung menghapus tanda karantina Gatekeeper tanpa pesan error).*
5. Buka kembali aplikasi **Hermes Desktop Pet** dari Launchpad atau Finder. Aplikasi akan **langsung terbuka dengan normal 100%**!

*Opsi Alternatif (Melalui Pengaturan Sistem macOS):*  
Buka menu **System Settings** > **Privacy & Security** > gulir ke bawah ke bagian **Security** > klik tombol **"Open Anyway"** (Buka Saja).

---

#### 3. Panduan Instalasi Windows 10 & 11

Tersedia dua opsi pilihan sesuai kenyamanan Anda:

##### Opsi A: Setup Installer Otomatis (.exe — Rekomendasi)
1. Unduh berkas `Hermes.Desktop.Pet.Setup.x.x.x.exe` dari [GitHub Releases](https://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases/latest).
2. Klik ganda berkas installer tersebut.
3. *Catatan Windows SmartScreen:* Jika Windows menampilkan layar biru *"Windows protected your PC"* / *"Windows melindungi PC Anda"*, klik tulisan **"More info"** (*Informasi selengkapnya*), lalu klik tombol **"Run anyway"** (*Tetap jalankan*).
4. Wizard instalasi akan memasang aplikasi ke komputer Anda dan otomatis membuat ikon pintasan di Desktop serta Start Menu.

##### Opsi B: Versi Portable (.zip — Tanpa Instalasi)
1. Unduh berkas `Hermes.Desktop.Pet-x.x.x-win.zip`.
2. Klik kanan berkas zip lalu pilih **Extract All...** (Ekstrak Semua) ke folder pilihan Anda (misalnya `D:\Hermes-Avatar\`).
3. Buka folder hasil ekstrak, lalu klik ganda pada berkas **`Hermes Desktop Pet.exe`** untuk langsung menjalankan aplikasi tanpa perlu hak akses administrator.

---

#### 4. Panduan Instalasi Linux (Ubuntu / Debian / Fedora / Arch)

##### Menggunakan AppImage (Universal Standalone):
1. Unduh berkas `Hermes.Desktop.Pet-x.x.x.AppImage` dari [GitHub Releases](https://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases/latest).
2. Buka Terminal pada direktori tempat berkas diunduh dan beri izin eksekusi:
   ```bash
   chmod +x Hermes.Desktop.Pet-*.AppImage
   ./Hermes.Desktop.Pet-*.AppImage
   ```

##### Menggunakan Arsip Tarball (.tar.gz):
1. Unduh berkas `hermes-desktop-pet-x.x.x.tar.gz`.
2. Ekstrak dan jalankan biner aplikasi:
   ```bash
   tar -xzf hermes-desktop-pet-*.tar.gz
   cd hermes-desktop-pet-*
   ./hermes-desktop-pet
   ```

---

### 💻 Metode 3: Menjalankan dari Kode Sumber (Pengembang / Developer)

Bagi Anda yang ingin memodifikasi kode, menyesuaikan tema antarmuka, atau berkontribusi pada repositori:

#### 1. Kloning Repositori
```bash
git clone https://github.com/KarmaSenzu/Hermes-Desktop-Pet.git
cd Hermes-Desktop-Pet/avatar
```

#### 2. Memasang Dependensi
Proyek ini mengadopsi prinsip **Zero Native C++ Dependencies**. Seluruh pustaka berbasis JavaScript WebGL murni tanpa memerlukan instalasi Visual Studio C++ Build Tools atau Python node-gyp.
```bash
npm install
```

#### 3. Jalankan Pemeriksaan Kesehatan Mandiri
Sebelum menjalankan aplikasi untuk pertama kali, jalankan skrip diagnosa otomatis:
```bash
npm run doctor
```

#### 4. Menjalankan Mode Pengembangan (Hot Reload)
```bash
npm run dev
```

#### 5. Mengompilasi Rilis Produksi Sendiri
```bash
npm run build
```

---

### 🧩 Panduan Komponen Ekstra (Opsional)

Setelah aplikasi terpasang, Anda dapat mengaktifkan modul tambahan berikut untuk pengalaman yang lebih maksimal:

#### 1. Kokoro-TTS (Sintesis Suara Karakter Anime Lokal)
Untuk mengaktifkan suara vokal anime lokal port 8880 secara offline:
1. Pasang dependensi python `kokoro-onnx` dan `soundfile`:
   ```bash
   # Di Windows (CMD / PowerShell):
   py -m pip install kokoro-onnx soundfile

   # Di macOS & Linux (Terminal):
   python3 -m pip install kokoro-onnx soundfile --break-system-packages
   ```
2. Buka aplikasi Hermes Desktop Pet > masuk ke menu **Package Hub** > **Kokoro-TTS Engine** > klik tombol **"Jalankan di Background App"** (atau klik *"⚡ Buka Terminal & Jalankan Server"*).
3. Model suara ONNX (`kokoro-v1.0.onnx` ~340MB) akan otomatis diunduh saat server pertama kali dijalankan.

#### 2. Hermes Web Companion (Ekstensi Browser Chrome & Edge)
Ekstensi pendamping untuk merangkum halaman web dan bertanya langsung ke avatar dari browser:
1. Buka browser Google Chrome atau Microsoft Edge.
2. Di bilah alamat browser, ketik `chrome://extensions` (atau `edge://extensions`) lalu tekan <kbd>Enter</kbd>.
3. Aktifkan sakelar **"Developer mode"** di pojok kanan atas layar.
4. Klik tombol **"Load unpacked"** (Muat yang belum dibongkar) di pojok kiri atas.
5. Pada jendela dialog pemilih file yang muncul:
   - **Di macOS:** Tekan <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>G</kbd>, lalu ketik/tempel path:
     ```text
     ~/.hermes-avatar/extensions/chrome
     ```
     Lalu tekan Enter dan klik tombol **Select / Pilih**.
   - **Di Windows:** Pilih folder `%USERPROFILE%\.hermes-avatar\extensions\chrome`.
6. Ekstensi terpasang! Anda dapat memblok teks di web mana saja dan menekan shortcut <kbd>Alt</kbd> + <kbd>A</kbd> untuk langsung bertanya ke avatar.

---

## Verifikasi Sistem dan Diagnosa Mandiri

Untuk memastikan setiap pengguna baru mendapatkan pengalaman instalasi yang mulus tanpa kendala paket (*First-Time User Experience*), repositori dilengkapi perintah diagnosa komprehensif:

```bash
npm run doctor
```

Skrip ini memverifikasi 5 pilar kesiapan sistem:
1. **Validasi Runtime Node.js:** Memastikan versi Node memenuhi syarat dan menampilkan status patch keamanan CVE.
2. **Integritas Dependensi NPM:** Memastikan seluruh modul terpasang utuh tanpa paket yang terlewat.
3. **Ketersediaan Aset Model:** Memverifikasi ketersediaan berkas model karakter Live2D bawaan di disk.
4. **Kesiapan 7 Core Skills:** Memastikan seluruh modul kemampuan otonom terdaftar di direktori.
5. **Konektivitas Port Layanan:** Memeriksa status port aktif (Port 9119 untuk Hermes, Port 8880 untuk Kokoro-TTS, dan Port 20128 untuk 9Router Gateway).

---

## Struktur Direktori

```
Hermes-Desktop-Pet/
├── avatar/                          # Aplikasi Desktop (Electron + WebGL)
│   ├── assets/                      # Aset model Live2D, 3D, audio, dan default-skills
│   │   ├── live2d/                  # Model Live2D Cubism bawaan
│   │   ├── models/                  # Direktori model 3D (VRM / GLB)
│   │   └── default-skills/          # Cadangan portabel 7 core skills
│   ├── scripts/
│   │   └── doctor.mjs               # Skrip diagnosa mandiri (npm run doctor)
│   ├── src/
│   │   ├── main/                    # Proses Utama Electron (Window, IPC, Protokol model://)
│   │   ├── preload/                 # Jembatan IPC aman (window.hermesAvatar)
│   │   └── renderer/                # Antarmuka Tiga Jendela (index, launcher, settings)
│   │       ├── js/                  # Live2D, Three.js, TWM, Music Player, Hermes Client
│   │       └── styles/              # Token desain CSS dan styling antarmuka
│   ├── electron.vite.config.mjs     # Konfigurasi bundling Vite + Electron
│   └── package.json                 # Konfigurasi dependensi dan skrip
├── docs/                            # Dokumentasi Arsitektur, Standar, & Panduan
│   ├── assets/                      # Media showcase gambar & animasi demonstrasi
│   ├── ARCHITECTURE.md              # Arsitektur sistem dan prinsip decoupled
│   ├── API_BRIDGE.md                # Spesifikasi komunikasi WebSocket JSON-RPC
│   ├── STRATEGI_OPEN_SOURCE_DAN_RILIS.md # Rencana rilis, CI/CD, & open-source
│   └── AUDIT_LOG.md                 # Log riwayat pengembangan komprehensif
├── skills/                          # Direktori induk 7 Core Skills Hermes
│   ├── mnemosyne/                   # Modul memori jangka panjang SQLite
│   ├── duckduckgo-search/           # Modul pencarian web instan
│   ├── pdf/                         # Modul pembaca berkas PDF
│   ├── scrapling/                   # Modul ekstraksi teks web murni
│   ├── weather-2-0/                 # Modul cuaca dunia real-time
│   ├── open-application/           # Modul peluncur aplikasi desktop
│   └── kokoro-tts/                  # Modul sintesis suara anime neural
├── CONTRIBUTING.md                  # Panduan kontribusi dan konvensi penamaan
├── LICENSE                          # Lisensi perangkat lunak terbuka MIT
└── README.md                        # Dokumentasi utama proyek
```

---

## Tata Kelola & Kontribusi

Kami menyambut kontribusi dari komunitas untuk pengembangan Hermes Desktop Pet. Untuk menjaga kualitas dan konsistensi kode:
* Gunakan format **Conventional Commits** dalam bahasa Inggris (contoh: `feat(avatar): ...`, `fix(tiling): ...`, `docs(readme): ...`).
* Seluruh dokumentasi resmi ditulis dalam **Bahasa Indonesia**.
* Pastikan `npm run build` dan `npm run doctor` berhasil dengan kode keluar 0 sebelum mengajukan Pull Request.
* Panduan lengkap dapat dibaca pada [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Lisensi & Atribusi Aset (Split License)

Proyek ini menerapkan ketentuan lisensi terpisah (*Split Licensing*) antara kode program dan aset multimedia:

* **Kode Sumber Perangkat Lunak:** Dilisensikan secara terbuka di bawah [Lisensi MIT](LICENSE). Siapa pun diperbolehkan mempelajari, memodifikasi, dan mengembangkan ulang kode program.
* **Aset Model Karakter & Audio Bawaan ("Mother"):** Disediakan khusus di bawah **Lisensi Non-Komersial (Non-Commercial / Fan Tribute)**.
  * Karakter dan sampel audio bersumber dari dan merupakan bentuk apresiasi tulus (*fan tribute*) terhadap game indie di platform Steam: [**Your Mother (Steam App ID: 3399950)**](https://store.steampowered.com/app/3399950/Your_Mother/).
  * **Hanya untuk pembelajaran pemrograman, eksperimen riset AI, dan penggunaan harian pribadi.**
  * **DILARANG KERAS DIKOMERSIALKAN ATAU DIPERJUALBELIKAN DALAM BENTUK APA PUN.**
  * Kami menyampaikan rasa terima kasih dan apresiasi setinggi-tingginya kepada pengembang game aslinya. Mari dukung kreator aslinya dengan membeli dan memainkan game resminya langsung di Steam:  
    👉 **[Kunjungi Halaman Toko Steam: Your Mother](https://store.steampowered.com/app/3399950/Your_Mother/)**
* **Model Kustom Pengguna:** Model 3D (`.vrm`, `.glb`) atau Live2D pihak ketiga yang dimasukkan sendiri oleh pengguna tetap tunduk pada ketentuan lisensi kreator masing-masing.
