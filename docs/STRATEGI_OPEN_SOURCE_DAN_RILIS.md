# Strategi Distribusi, Komunitas Open Source, & Rilis Aplikasi

Dokumen ini merangkum cetak biru (*blueprint*) dan panduan strategis untuk persiapan publikasi **Hermes 3D Avatar** ke GitHub, pengelolaan komunitas kontributor berbasis *Pull Request* (PR), perlindungan data privasi/kode rahasia, otomasi rilis multi-platform, serta spesifikasi kebutuhan sistem.

> **Catatan Pelaksanaan:** Dokumen ini merupakan panduan rencana strategis yang disiapkan untuk dieksekusi setelah seluruh pengujian bug (*bug testing*) dan pematangan fitur lokal selesai 100%.

---

## 1. Arsitektur "Open-Core" & Perlindungan Privasi

Untuk membangun komunitas open source yang aktif sembari tetap menjaga keamanan kredensial dan kerahasiaan logika tertentu, proyek ini mengadopsi model **Open-Core Hybrid**:

```
┌────────────────────────────────────────────────────────┐
│             REPO PUBLIK (Open Source)                  │
│  - Electron Main & Preload                             │
│  - Three.js / Live2D Renderer                          │
│  - Tiling Window Manager (TWM)                         │
│  - Music Player (Local, Lofi Synth, YouTube Embed)     │
│  - Settings UI & Theme macOS Style                     │
│  - Speech Normalizer & Audio Ducking                   │
│  - Template Konfigurasi (*.example)                    │
└──────────────────────────┬─────────────────────────────┘
                           │ WebSocket / IPC
┌──────────────────────────▼─────────────────────────────┐
│          AREA PRIVAT / TERLINDUNGI (User/Dev)          │
│  - Kredensial & Token Sesi (~/.hermes-avatar/)         │
│  - API Keys AI (safeStorage terenkripsi)               │
│  - Prompts Rahasia / Skill Agent Privat                │
│  - Riwayat Memori Percakapan Pribadi                   │
│  - Model / Aset dengan Lisensi Komersial Terbatas      │
└────────────────────────────────────────────────────────┘
```

### A. Kebijakan Anti-Kebocoran Data (.gitignore)
Sebelum repository dipublikasikan ke GitHub, file `.gitignore` wajib memastikan data berikut tidak pernah ter-commit:

1. **Kredensial & Token:**
   - `~/.hermes-avatar/session-token`
   - `.env`, `.env.local`, `*.key`
2. **Konfigurasi Lokal & Riwayat:**
   - `shortcuts.json`
   - Riwayat chat `.jsonl` / database memori pengguna
   - File log debug lokal (`*.log`)
3. **Model Berlisensi Non-Redistribusi:**
   - File model 3D/Live2D pribadi pengguna (`avatar/assets/models/*` kecuali placeholder/panduan `NOTICE.md`).
4. **File Template Publik:**
   - Menggunakan `config.example.yaml` dan `env.example` sebagai acuan bagi pengguna baru tanpa membeberkan kredensial asli.

### B. Opsi Proteksi Logika Bisnis (*Secret Sauce*)
Jika di masa depan terdapat algoritma atau logika khusus yang ingin tetap tertutup:
- **Private Git Submodule:** Bagian proprietary diletakkan di repositori GitHub private terpisah yang hanya dapat diakses oleh core developer.
- **Pre-Compiled Binary:** Mengompilasi modul sensitif menjadi binary (`.node` C++ addon atau executable terproteksi) sehingga publik menerima file binary tanpa melihat *source code* mentahnya.

---

## 2. Desain Download Center & Halaman Rilis

Inspirasi antarmuka mengadopsi gaya modern *landing page* (seperti Raycast, Ollama, Ghostty, Zed, dan Enow) dengan 3 kartu unduhan sistem operasi utama dan terminal command.

### A. Format Kartu Download di `README.md`
Tampilan tabel modern berbasis Markdown/HTML di repository:

```markdown
<div align="center">

### Unduh Hermes Desktop Pet

| Windows | macOS | Linux |
| :---: | :---: | :---: |
| **Windows 10 / 11 (x64)** | **Apple Silicon & Intel** | **Ubuntu / Debian / Fedora** |
| [**Download Setup .exe**](https://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases/latest) | [**Download .dmg**](https://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases/latest) | [**Download .deb**](https://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases/latest) |
| *Installer NSIS & Portable* | *Universal Binary* | *AppImage & .tar.gz* |

**Atau pasang via Terminal Linux / macOS:**
```bash
curl -fsSL https://raw.githubusercontent.com/KarmaSenzu/Hermes-Desktop-Pet/main/install.sh | bash
```

</div>
```

### B. Website Landing Page Gratis (GitHub Pages)
- Membuat branch `gh-pages` berisi satu file `index.html` dan CSS bergaya *Dark Glassmorphism*.
- Otomatis online di alamat: `https://karmasenzu.github.io/Hermes-Desktop-Pet/`.
- Tombol unduh otomatis mendeteksi sistem operasi pengunjung (`navigator.userAgent`) untuk menyorot tombol yang sesuai.

### C. Mekanisme Script Terminal `install.sh`
Alur kerja script satu baris `curl ... | bash`:
1. Mendeteksi OS (`uname -s`) dan arsitektur CPU (`x86_64` vs `aarch64/arm64`).
2. Menghubungi GitHub API: `https://api.github.com/repos/KarmaSenzu/Hermes-Desktop-Pet/releases/latest`.
3. Mengunduh arsip binary rilis terbaru.
4. Mengekstrak ke direktori `~/.local/share/hermes-desktop-pet/`.
5. Membuat shortcut command `hermes-pet` di `~/.local/bin/` serta ikon launcher desktop.

---

## 3. Otomasi Build Multi-Platform (CI/CD GitHub Actions)

Tidak diperlukan laptop Mac atau Linux fisik untuk memproduksi file `.dmg` atau `.deb`. GitHub Actions menyediakan Virtual Machine gratis untuk mengompilasi rilis secara otomatis.

### Alur Kerja Rilis (`.github/workflows/release.yml`)
1. **Pemicu Rilis:** Developer membuat git tag versi baru di branch utama:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
2. **Matrix Build Paralel:** GitHub Actions menjalankan 3 runner sekaligus:
   - `windows-latest` → Menjalankan `electron-builder` menghasilkan `Hermes-Avatar-Setup-0.2.0.exe`.
   - `macos-latest` → Menjalankan `electron-builder` menghasilkan `Hermes-Avatar-0.2.0.dmg`.
   - `ubuntu-latest` → Menjalankan `electron-builder` menghasilkan `.deb` dan `.AppImage`.
3. **Penerbitan Otomatis:** Seluruh file installer otomatis diunggah ke menu **GitHub Releases** lengkap dengan catatan rilis (*release notes*).

---

## 4. Sistem Deteksi & Notifikasi Pembaruan (*Update Checker*)

Agar pengguna yang sudah memasang aplikasi otomatis mengetahui saat rilis baru keluar:

```
[Aplikasi Terbuka] ──▶ Cek Versi Lokal (package.json v0.1.0)
                            │
                            ▼
           Query GitHub Releases API (Non-blocking)
           GET /repos/<user>/<repo>/releases/latest
                            │
         ┌──────────────────┴──────────────────┐
   [Versi Sama / Baru]                   [Ada Versi Baru (v0.2.0)]
         │                                     │
    State: Idle                       1. Avatar menyapa:
                                         "Versi baru v0.2.0 sudah rilis! ✨"
                                      2. Badge di Settings & HUD:
                                         "Update Tersedia 🚀"
                                      3. Klik tombol ──▶ Buka Rilis / Unduh
```

### Keunggulan Metode Ini:
- **Ringan & Aman:** Tidak memerlukan server hosting perantara; langsung memanfaatkan infrastruktur resmi GitHub.
- **Bebas Masalah Sertifikat:** Tidak terblokir oleh kendala sertifikat berbayar (*code-signing*) Windows SmartScreen / Apple Notarization yang sering menggagalkan *silent auto-installer*.
- **Sentuhan Interaktif Avatar:** Menjadikan avatar terasa lebih hidup karena avatar sendiri yang memberitahu tuannya ketika ia memiliki "kemampuan/update baru".

---

## 5. Analisis Beban & Kebutuhan Sistem (*System Requirements*)

Sistem Hermes 3D Avatar didesain dengan prinsip efisiensi WebGL dan decoupled architecture sehingga jauh lebih hemat sumber daya dibanding game engine monolitik.

### Rincian Beban Komponen Riil

| Komponen | Konsumsi RAM | Beban CPU | Keterangan |
| :--- | :--- | :--- | :--- |
| **Electron + Three.js / Live2D** | ~120 – 220 MB | 1% – 3% (Idle) / 5% – 7% (Aktif) | Akselerasi GPU WebGL hemat daya |
| **Music Player & TWM** | ~15 – 30 MB | ~0% | Web Audio API murni & YouTube embed |
| **Kokoro-TTS Engine** | ~150 – 250 MB | Aktif hanya saat sintesis (milidetik) | ONNX Runtime CPU murni (~80MB model) |
| **Hermes Agent (Bridge)** | ~40 – 80 MB | ~0% (Idle) | Node / WebSocket IPC ringan |
| **LLM Cloud (9Router / API)** | 0 MB lokal | 0% lokal | Pemrosesan terjadi di cloud |

### Tabel Spesifikasi Komputer Pengguna

| Kategori | Spesifikasi Minimal (Office/Laptop Hemat) | Spesifikasi Rekomendasi (Multitasking Lancar) |
| :--- | :--- | :--- |
| **Sistem Operasi** | Windows 10/11 64-bit, macOS 11+, Linux x64 | Windows 11 64-bit atau macOS (Apple Silicon M1/M2/M3) |
| **Node.js Runtime** | Node.js >= v18.0.0 (Bebas Native C++) | **Versi Aman Patch Oktober 2026 (Bebas 11 CVE):**<br>• Node.js v24.22.1 (LTS Krypton)<br>• Node.js v22.23.4 (LTS Jod)<br>• Node.js v26.12.1 (Current) |
| **Prosesor (CPU)** | Intel Core i3 (Gen 8+) / AMD Ryzen 3 / Apple M1 | Intel Core i5/i7 (Gen 10+) / AMD Ryzen 5/7 / Apple M-series |
| **Memori (RAM)** | **8 GB RAM** *(kebutuhan OS + Avatar + Browser)* | **16 GB RAM** *(nyaman sambil bekerja/coding/gaming)* |
| **Kartu Grafis (GPU)** | Integrated Graphics (Intel UHD 620, Iris Xe, Radeon Vega) | Dedicated GPU (GTX 1650, RTX 3050, atau GPU bawaan Mac) |
| **Penyimpanan** | ~1.5 GB ruang kosong | SSD NVMe |
| **Internet** | Diperlukan untuk akses LLM AI & musik YouTube | Koneksi stabil minimal 5 Mbps |

---

## 6. Tata Kelola Komunitas & Alur Pull Request (PR)

Untuk menjaga kualitas kode ketika komunitas mulai bergabung:
1. **Branch Protection:** Cabang `main` dikunci; tidak ada yang bisa melakukan direct push tanpa melalui Pull Request.
2. **Template Pull Request (`.github/PULL_REQUEST_TEMPLATE.md`):**
   - Mengharuskan kontributor menjelaskan perubahan yang dibuat.
   - Menyertakan checklist uji coba dan konfirmasi bahwa `npm run build` berhasil dengan exit code 0.
3. **Standar Penamaan & Bahasa:**
   - Dokumentasi resmi dan catatan rilis menggunakan **Bahasa Indonesia**.
   - Commit history menggunakan format **Conventional Commits** (contoh: `feat(avatar): ...`, `fix(tts): ...`).
   - Kode sumber JavaScript/CSS berindentasi 2 spasi; Python 4 spasi.

---

## 7. Verifikasi Pengguna Baru (First-Time User Experience & Diagnostic Doctor)

Untuk mencegah *"dependency hell"*, paket kurang, atau versi runtime yang tidak cocok saat orang lain meng-clone atau menginstal repositori untuk pertama kali:

### 7.1 Skrip Diagnosa Mandiri (`npm run doctor`)
Repositori dilengkapi dengan skrip pra-penerbangan (*pre-flight healthcheck*) yang memverifikasi 5 pilar sistem secara otomatis:
```bash
npm run doctor
```
- **Node.js Environment:** Memvalidasi versi Node (`>= v18.0.0`) serta memverifikasi status keamanan terhadap patch resmi Oktober 2026 (v24.22.1 LTS / v22.23.4 LTS / v26.12.1 Current yang telah menambal 11 celah keamanan CVE).
- **NPM Modules Integrity:** Memeriksa seluruh dependensi terpasang tanpa membutuhkan tool kompilasi C++ lokal (*Zero Native C++ dependencies*).
- **Aset Karakter Model:** Memastikan model Live2D bawaan (`mother/20250106.model3.json`) tersedia di disk.
- **7 Core Skills Hermes:** Memastikan modul penting terpasang lengkap di `skills/`.
- **Port & Connectivity:** Memeriksa status port 9119 (Hermes AI), 8880 (Kokoro-TTS), dan 20128 (9Router).

### 7.2 Standarisasi 7 Core Skills Bawaan (Permanent Built-in)
Semua skill inti telah distandardisasi dan didistribusikan permanen bersama aplikasi:
1. `mnemosyne` — Memori percakapan jangka panjang SQLite lokal.
2. `duckduckgo-search` — Pencarian web instan tanpa API key pihak ketiga.
3. `pdf` — Ekstraksi dan analisis isi dokumen PDF secara cerdas.
4. `scrapling` — Ekstraksi teks web murni bebas gangguan iklan & markup.
5. `weather-2-0` — Laporan cuaca dan prakiraan real-time kota-kota dunia.
6. `open-application` — Peluncur aplikasi desktop lokal (Notepad, Spotify, VS Code, dll).
7. `kokoro-tts` — Sintesis vokal anime lokal dengan Spanish phonetic mapping.

---

## 8. Checklist Kesiapan Sebelum Rilis Publik (*Launch Checklist*)

Gunakan daftar periksa ini saat nanti memasuki tahap eksekusi rilis publik:

- [x] **Zero C++ Dependencies:** Seluruh package berbasis JavaScript WebGL murni tanpa memerlukan Visual Studio Build Tools.
- [x] **Alat Diagnosa Onboarding:** Skrip `npm run doctor` siap pakai untuk verifikasi kesiapan sistem mandiri.
- [x] **Core Skills Permanen:** 7 core skills dibundel resmi di `skills/` dan `avatar/assets/default-skills/`.
- [x] **Aset Terbuka Resmi:** Aset model dan audio Live2D dibuka di `.gitignore` untuk kelengkapan repo awal.
- [ ] **Bug & Stability Testing:** Sesi pengujian menyeluruh pada transparansi window, drag-and-drop, tiling layout, dan responsivitas audio.
- [ ] **Audit File Rahasia:** Verifikasi bahwa `git status` tidak melacak file token, API key, atau data pribadi.
- [ ] **Penyegaran README.md:** Memasang badge, demo gif/video, tabel spesifikasi, dan tombol unduh.
- [ ] **Konfigurasi GitHub Actions Workflow:** Memasang file `.github/workflows/release.yml`.
- [ ] **Uji Coba Build Installer:** Memverifikasi file `Setup.exe` berhasil di-install dan dijalankan pada komputer bersih.
- [ ] **Aktivasi Update Checker:** Memastikan modul pengecek rilis GitHub berfungsi menampilkan notifikasi update di avatar.
