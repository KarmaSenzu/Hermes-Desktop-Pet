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

### Unduh Hermes Desktop Pet (Rilis Siap Pakai)

| Windows | macOS | Linux |
| :---: | :---: | :---: |
| **Windows 10 / 11 (x64)** | **Apple Silicon (M-Series) & Intel** | **Ubuntu / Debian / Fedora** |
| [**Download Setup .exe**](https://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases/latest) | [**Download .dmg**](https://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases/latest) | [**Download .deb**](https://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases/latest) |
| *Installer NSIS & Versi Portable* | *Universal Binary (.dmg)* | *AppImage & .deb Package* |

**Pemasangan Cepat via Terminal (Linux & macOS):**
```bash
curl -fsSL https://raw.githubusercontent.com/KarmaSenzu/Hermes-Desktop-Pet/main/install.sh | bash
```

</div>

---

## Daftar Isi

- [Unduh Installer Multi-Platform](#unduh-hermes-desktop-pet-rilis-siap-pakai)
- [Tentang Proyek](#tentang-proyek)
- [Prinsip Arsitektur](#prinsip-arsitektur)
- [Fitur Utama](#fitur-utama)
- [Galeri Showcase](#galeri-showcase)
- [7 Core Skills Bawaan](#7-core-skills-bawaan)
- [Kebutuhan Sistem & Standar Keamanan](#kebutuhan-sistem--standar-keamanan)
- [Panduan Instalasi & Menjalankan](#panduan-instalasi--menjalankan)
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

## Panduan Instalasi & Menjalankan

Anda dapat menjalankan Hermes Desktop Pet menggunakan salah satu dari dua cara berikut:

### Metode 1: Menggunakan Installer Biner (Pengguna Umum)

Bagi pengguna yang ingin langsung memakai aplikasi tanpa menyentuh kode program atau memasang Node.js:
1. Buka halaman rilis resmi: [**GitHub Releases — Hermes Desktop Pet**](https://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases/latest).
2. Unduh paket installer yang cocok dengan sistem operasi Anda:
   * **Windows 10/11:** Unduh file `Hermes-Desktop-Pet-Setup-x.x.x.exe` (klik 2x untuk memasang otomatis) atau versi Portable `.zip`.
   * **macOS (Apple Silicon & Intel):** Unduh file `Hermes-Desktop-Pet-x.x.x.dmg`, buka berkas, dan seret ikon Hermes ke folder *Applications*.
   * **Linux (Ubuntu/Debian/Fedora):** Unduh paket `Hermes-Desktop-Pet-x.x.x.AppImage` (beri izin eksekusi `chmod +x` lalu klik) atau berkas `.deb`.
3. Buka aplikasi, dan karakter avatar interaktif akan seketika hadir di layar komputer Anda.

> **Tips Pengguna Linux & macOS:** Anda juga dapat memasang otomatis melalui satu baris perintah terminal:
> ```bash
> curl -fsSL https://raw.githubusercontent.com/KarmaSenzu/Hermes-Desktop-Pet/main/install.sh | bash
> ```

> [!TIP]
> **Khusus Pengguna macOS (Peringatan Gatekeeper / "Aplikasi Rusak & Pindahkan ke Tong Sampah"):**
> Jika macOS menampilkan peringatan *"Hermes Desktop Pet rusak dan tidak dapat dibuka. Anda harus memindahkannya ke Tong Sampah"*, ini adalah proteksi keamanan bawaan **macOS Gatekeeper (Quarantine)** untuk aplikasi yang diunduh dari internet tanpa sertifikat berbayar Apple Developer. Aplikasi Anda **tidak rusak sama sekali**.
>
> **Solusi Cepat (Cukup 1 Baris di Terminal Mac):**
> 1. Klik **Batalkan** pada peringatan tersebut.
> 2. Buka aplikasi **Terminal** di Mac Anda, lalu ketik/tempel perintah berikut dan tekan **Enter**:
>    ```bash
>    xattr -cr "/Applications/Hermes Desktop Pet.app"
>    ```
> 3. Buka kembali aplikasi, dan Hermes Avatar akan seketika terbuka normal 100%!
>
> *(Atau buka **System Settings** > **Privacy & Security** > scroll ke bawah ke bagian Security > klik tombol **"Open Anyway"**).*

---

### Metode 2: Menjalankan dari Kode Sumber (Pengembang / Developer)

Bagi Anda yang ingin memodifikasi kode, menyesuaikan tema, atau berkontribusi pada pengembangan:

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
