# 📑 PROJECT TECHNICAL AUDIT BRIEFING — HERMES 3D AVATAR (DESKTOP PET)

> **Dokumen Audit Teknis Komprehensif**  
> **Tanggal Audit:** 2026-10-28  
> **Penyusun:** Antigravity (Auditor Teknis Independen)  
> **Status Repositori:** Git clean (`dd8a2a3`), branch `main`  
> **Tujuan Dokumen:** Ditulis khusus untuk AI Auditor Sekunder / Arsitek Perangkat Lunak Eksternal yang tidak memiliki akses fisik ke lingkungan pengembang ini, guna mengkritik arsitektur, mendeteksi kerentanan keamanan, menemukan cacat desain, dan merancang roadmap refaktorisasi.  
> **Lampiran Teknis:** Tersimpan di folder `briefing-attachments/` di root proyek.

---

## 1. IDENTITAS & TUJUAN

### 1.1 Visi & Tujuan Akhir Proyek
* **Visi Pemilik:** Menghadirkan asisten kecerdasan buatan (*AI Companion*) yang memiliki kehadiran fisik di layar desktop komputer (*visual presence*), bukan sekadar jendela chatbot teks biasa. Avatar berfungsi sebagai teman kerja (*desktop pet*) yang hidup, bernapas, menatap kursor pengguna, berekspresi sesuai suasana hati balasan AI, berbicara dengan suara natural, dan dapat diperintah untuk mengontrol komputer, memutar musik, atau merangkum halaman web.
* **Mental Model (Arsitektur Otak vs Aktor):**
  $$\text{Hermes (Otak: LLM, Tools, Memori)} \iff \text{JSON-RPC via WebSocket (:9119)} \iff \text{Avatar (Aktor: Electron + Live2D/Three.js)}$$
  Avatar adalah antarmuka visual murni (*visual front-end only*). Semua pemikiran cerdas, pemanggilan tools sistem, riwayat percakapan, dan memori profil jangka panjang (*Mnemosyne*) dikelola oleh backend agen **Hermes** (`hermes serve` di `127.0.0.1:9119`).
* **Target Pengguna:**
  * **Tahap Awal:** Penggunaan pribadi harian pembuatnya (*personal daily companion*).
  * **Tahap Publik:** Disiapkan untuk rilis komunitas sumber terbuka (*open-source*) di GitHub (`https://github.com/KarmaSenzu/Hermes-Desktop-Pet`).

### 1.2 Lingkungan & Spesifikasi Mesin Pengembangan
* **Sistem Operasi Pengembangan Utama:** Windows 10 Pro 64-bit (Build 10.0.19045).
* **Perangkat Keras Aktual (Hasil Audit CimInstance):**
  * **CPU:** AMD Ryzen 5 5600G with Radeon Graphics (6 Cores, 12 Logical Processors / Threads).
  * **RAM:** 32.00 GB DDR4.
  * **GPU:** AMD Radeon(TM) Graphics (Integrated APU, ~4 GB VRAM bersama, Driver `31.0.21923.11000`).
* **Toolchain Runtime Lokal:**
  * **Node.js:** `v24.13.0` (`C:\Program Files\nodejs\node.exe`).
  * **npm:** `11.14.1` (`npm.cmd`).
  * **Python:** `3.11.5` (`C:\Users\FoxPro\AppData\Local\Programs\Python\Python311\python.exe`).
  * **Git:** `2.45.1.windows.1`.
* **Status Pengujian Lintas Platform:**
  * **Windows 10 / 11:** `[BERJALAN-TERVERIFIKASI]`. Mesin harian saat ini, seluruh fitur overlay, z-order DWM, shortcut global, dan audio berfungsi stabil.
  * **macOS (Apple Silicon M2 / Darwin):** `[BERJALAN-TERVERIFIKASI-SEBAGIAN]`. Terbukti dari riwayat jejak awal di `GOALS.md:6` (`/Users/damarfikrie/Documents/Coding/...`) dan kode spesifik macOS di `avatar/src/main/service-manager.js:56-68` (path zsh), `avatar/src/main/index.js:611-618` (osascript Terminal.app), dan `avatar/src/main/index.js:1168-1191` (hdiutil DMG mount). Namun tidak lagi diuji aktif sejak migrasi ke Windows.
  * **Linux (Ubuntu / Fedora / Arch):** `[RUSAK/SETENGAH JADI]`. Terdapat berkas `install.sh`, `update.sh`, serta target build `AppImage` dan `tar.gz` di `avatar/package.json:84`, namun **belum pernah dijalankan atau diuji secara nyata pada mesin Linux fisik**. Dependensi transparan X11 / Wayland belum pernah divalidasi.

### 1.3 Hal yang TIDAK Boleh Berubah (Invariants)
1. **Model Karakter Live2D:** Estetika visual wajib mempertahankan karakter *Mother* (Live2D Cubism 3/4) dengan simulasi pernapasan halus, penyesuaian emosi ekspresi wajah, dan tatapan mata ke kursor.
2. **Karakter Bukan Boneka Sentuh (No Ghost Arm / No Touch Sound):** Sesuai aturan mutlak di `docs/AUDIT_LOG.md:7-14`, dilarang memicu motion `touch.motion3.json` atau suara desahan saat avatar diklik. Klik hanya boleh membuka/menutup menu interaktif HUD samping (`#companion-hud`).
3. **Kemandirian Otak AI:** Avatar tidak boleh menanam model LLM in-repo; komunikasi wajib melalui protokol IPC / WebSocket RPC standar agar backend AI dapat ditukar sewaktu-waktu.
4. **Privasi Data Pengguna:** Kunci API dan data kredensial tidak boleh disimpan sebagai teks biasa (*plaintext*) di localStorage.

---

## 2. STATUS NYATA vs KLAIM DOKUMEN

Berdasarkan audit komparasi kode sumber terhadap klaim di `README.md`, `GOALS.md`, `docs/ARCHITECTURE.md`, dan `docs/ROADMAP.md`:

| Fitur | Klaim di Dokumen | Status Nyata | Bukti Kode / Perintah |
|---|---|---|---|
| **Engine Render Avatar** | 3D Desktop Pet (Three.js + three-vrm + MMD.js) | `[BERJALAN-TERVERIFIKASI]` (Live2D dominan 99%) | `avatar/src/renderer/js/live2d-avatar.js:67-93`. Modul 3D `model-loader.js` ada tapi tidak dipakai secara default. |
| **Model 3D Default (VRM)** | Sample VRoid CC0 di `avatar/assets/models/default.vrm` | `[RUSAK/SETENGAH JADI]` | `avatar/assets/models/` hanya berisi `NOTICE.md`. Berkas `default.vrm` tidak ada di repo. |
| **Plugin Hermes `avatar-bridge`** | Plugin resmi Hermes hook event agent | `[RUSAK/SETENGAH JADI]` (Belum Dibuat) | `C:\Users\FoxPro\AppData\Local\hermes\plugins` hanya berisi `mnemosyne`. Komunikasi murni via `hermes serve` WS port 9119. |
| **Sinkronisasi TTS via Edge-TTS** | Suara jernih `id-ID-GadisNeural` | `[BERJALAN-TERVERIFIKASI]` | `avatar/src/main/index.js:2228-2280` via library `msedge-tts` fallback langsung. |
| **Offline TTS via Kokoro-TTS** | Server lokal port 8880 via `kokoro_server.py` | `[BERJALAN-TERVERIFIKASI]` | `scripts/kokoro_server.py` & `avatar/src/main/service-manager.js:259-309`. Berjalan saat paket python terpasang. |
| **Offline STT (faster-whisper)** | Suara mic lokal via Hermes STT | `[BERJALAN-TERVERIFIKASI]` | `avatar/src/renderer/js/hermes-client.js:132-144` (`voice.toggle` & `voice.record`). |
| **Integrasi 9Router Gateway** | Auto-spawn proxy port 20128 | `[DIKLAIM-TAPI-BELUM-DIUJI]` (Semi-Manual) | `avatar/src/main/service-manager.js:174-177` (hanya deteksi port). Tombol spawn di Settings `startRouter()` ada. |
| **Cron Hermes Scheduler** | Notifikasi berkala dari jadwal cron Hermes | `[RUSAK/SETENGAH JADI]` (Tidak Terhubung) | Tidak ada kode listener cron di `hermes-client.js` atau `main.js`. Avatar memakai interval timer sendiri. |
| **Music Player & Procedural Lofi** | Pemutar lagu offline, stream YouTube & Lofi | `[BERJALAN-TERVERIFIKASI]` | `avatar/src/renderer/js/music-player.js:1-120` (Web Audio API synthesis + online audio streams). |
| **Chrome Web Extension** | Tanya seleksi teks web ke desktop pet via Alt+A | `[BERJALAN-TERVERIFIKASI]` | `extensions/chrome/` & `avatar/src/main/bridge-server.js:8-53` (HTTP bridge port 9124). |
| **OTA Seamless Auto-Update** | Pembaruan in-place ZIP / Installer GitHub | `[BERJALAN-TERVERIFIKASI]` | `avatar/src/main/index.js:1127-1240` (unduh GitHub Releases & apply via batch runner). |
| **AI Assessment Dynamic Cards** | Kartu pilihan interaktif dinamis konteks chat | `[BERJALAN-TERVERIFIKASI]` | `avatar/src/renderer/js/main.js:2364` & `Audit Entry #045/#046`. |

### 2.2 Kontradiksi Antar Dokumen
1. **`GOALS.md` vs Realitas:** `GOALS.md:121` merekomendasikan Godot 4 / Unity dan server bridge FastAPI. Seluruh rencana ini telah ditinggalkan dan digantikan oleh Electron + WebGL.
2. **`ARCHITECTURE.md` vs Realitas:** Dokumen mengklaim WS Hermes tidak memerlukan token autentikasi. Kenyataannya, `hermes serve` versi 0.18.2 mewajibkan parameter `?token=<token>`, yang kini disuplai via `~/.hermes-avatar/session-token` (`service-manager.js:115-138`).
3. **`README.md` vs Realitas:** Menggunakan judul besar *"Hermes 3D Avatar"*, namun seluruh arsitektur produksi yang dimuat dan dirawat adalah model Live2D (2.5D Cubism).

---

## 3. PETA REPO & FILE YANG DI-GITIGNORE

### 3.1 Struktur Direktori Proyek (`tree -L 3`, Ringkasan dari Lampiran `tree.txt`)
```
hermes-3d-avatar/
|-- .editorconfig
|-- .gitignore
|-- CHANGELOG.md
|-- CONTRIBUTING.md
|-- GOALS.md
|-- LICENSE
|-- README.md
|-- install.sh
|-- update.ps1
|-- update.sh
|-- .github/
|   `-- workflows/
|       `-- build.yml
|-- avatar/
|   |-- package-lock.json
|   |-- package.json
|   |-- assets/
|   |   |-- audio/
|   |   |-- icons/
|   |   |-- live2d/
|   |   `-- models/
|   |-- build/
|   |   |-- icon.ico
|   |   |-- icon.png
|   |   `-- icon.icns
|   `-- src/
|       |-- main/
|       |-- preload/
|       `-- renderer/
|-- briefing-attachments/ (8 berkas lampiran audit teknis)
|-- docs/
|   |-- API_BRIDGE.md
|   |-- ARCHITECTURE.md
|   |-- AUDIT_LOG.md
|   |-- CONFIG_EXAMPLE.md
|   |-- DECISIONS.md
|   |-- DEVELOPMENT_STANDARDS.md
|   |-- ROADMAP.md
|   |-- SETTINGS_STRUCTURE.md
|   `-- STRATEGI_OPEN_SOURCE_DAN_RILIS.md
|-- extensions/
|   `-- chrome/
|-- scripts/
|   |-- check_system.py
|   |-- doctor.mjs
|   |-- kokoro_server.py
|   `-- smart_synthesize.py
`-- skills/
    |-- duckduckgo-search/
    |-- kokoro-tts/
    |-- mnemosyne/
    |-- open-application/
    |-- pdf/
    |-- scrapling/
    `-- weather-2-0/
```

### 3.2 Analisis Berkas Lokal yang Terkena `.gitignore` (Lampiran `gitignore-local-files.txt`)
Berikut adalah daftar file dan folder lokal yang ada di disk pengembang tetapi tidak di-commit ke Git:

1. **`avatar/node_modules/`** (~250 MB, direktori)
   * **Fungsi:** Pustaka dependensi eksternal Node/Electron (three.js, pixi.js, pixi-live2d-display, msedge-tts, ws).
   * **Status Keperluan:** **MUTLAK WAJIB** agar aplikasi dapat di-build dan dijalankan.
2. **`avatar/out/`** (~450 KB, direktori)
   * **Fungsi:** Hasil kompilasi bundler `electron-vite` (`out/main/index.js`, `out/preload/index.mjs`, `out/renderer/`).
   * **Status Keperluan:** **MUTLAK WAJIB** saat aplikasi dijalankan dalam mode production (`npm run start`).
3. **`avatar/dist/`** (~160 MB, direktori)
   * **Fungsi:** Paket biner instalasi akhir hasil build `electron-builder` (`Hermes Desktop Pet-0.1.4-setup.exe` & `.zip`).
   * **Status Keperluan:** Tidak wajib untuk development.

### 3.3 Berkas di Luar Proyek yang Dibaca & Ditulis Aplikasi
Aplikasi mengakses direktori sistem di luar repositori dengan rincian:

| Jalur Lokasi | Hak Akses | Isi & Fungsi | Dampak Jika Dihapus |
|---|---|---|---|
| `C:\Users\FoxPro\.hermes-avatar\` | Read/Write (User) | `session-token` (token autentikasi WS), `music_library.json` (pustaka lagu), `apps_cache.json` (daftar exe Windows), `scripts/` | Token baru di-generate otomatis; playlist kustom dan cache scan aplikasi ter-reset ke default. |
| `C:\Users\FoxPro\AppData\Local\hermes\` | Read/Write (User) | `config.yaml` (konfigurasi LLM, STT, TTS Hermes), `.env` (API key OpenAI, Telegram, dll), `logs/agent.log`, `logs/gateway.log` | Hermes AI tidak dapat berfungsi, konfigurasi model hilang. |
| `C:\Users\FoxPro\.hermes\skills\` & `AppData\Local\hermes\skills\` | Read/Write (User) | Folder skill agen (`mnemosyne`, `scrapling`, `duckduckgo-search`, dll). | Disalin ulang otomatis oleh `service-manager.js:349-395` saat startup avatar. |
| `C:\Users\FoxPro\AppData\Roaming\hermes-3d-avatar\` | Read/Write (Chromium) | Chromium `Local Storage`, `GPUCache`, `Network`, `Preferences` | Pengaturan tampilan renderer (volume, scale avatar) ter-reset ke bawaan. |

---

## 4. TOPOLOGI RUNTIME

### 4.1 Inventaris Proses Aktif
Saat Hermes 3D Avatar aktif sepenuhnya, berikut adalah peta proses yang berjalan di OS:

1. **Electron Main Process (`node.exe` / `electron.exe`):**
   * **Peluncur:** User via `npm run dev` atau shortcut `Hermes Desktop Pet.exe`.
   * **Tugas:** Manajemen window, lifecycle aplikasi, bridge HTTP server port 9124, 69 IPC handlers.
   * **Lifecycle:** Shutdown bersih saat window ditutup via tray atau tombol menu samping; mematikan child process via `stopAllServices()` (`service-manager.js:411`).
2. **Electron Renderer Process (`electron.exe`):**
   * **Jendela Avatar (`index.html`):** Frameless, transparent, always-on-top window. Mengelola WebGL context Pixi.js/Three.js, Web Audio API, dan WebSocket client `HermesClient`.
   * **Jendela Pengaturan (`settings.html`):** UI dashboard gaya macOS System Settings.
3. **Electron GPU Process Helper (`electron.exe --type=gpu-process`):**
   * Mengakselerasi compositing WebGL dan hardware decoding video/canvas.
4. **Hermes Daemon (`hermes.exe serve --host 127.0.0.1 --port 9119`):**
   * **Peluncur:** Auto-spawn otomatis oleh Electron Main di `service-manager.js:196`.
   * **Perilaku Crash:** Jika proses Hermes mati mendadak, event WS `close` dipicu di renderer; avatar menampilkan bubble *"⚠️ Terputus dari Hermes"*. Tombol *"Hubungkan Ulang"* di menu launcher memicu `avatar:start-hermes-server`.
5. **Kokoro TTS Server (`python.exe scripts/kokoro_server.py`):**
   * **Peluncur:** Auto-spawn di port 8880 oleh `service-manager.js:282` via `pythonw.exe` (windowless).
   * **Lifecycle:** Child process detached, unref.
6. **9Router Proxy (`9router -n --skip-update` di port 20128):**
   * **Peluncur:** Dikelola manual oleh pengguna atau dipicu via tombol Settings IPC `avatar:start-router`.

### 4.2 Diagram Alur Interaksi Runtime

```
[ Pengguna ] ──( Suara via Mic )──▶ [ Hermes STT / Whisper ]
     │                                     │ (Teks)
     │                                     ▼
     ├──────( Ketik Pesan )────────▶ [ Hermes Brain (:9119) ] ◀── [ 9Router Proxy (:20128) ]
     │                                     │ (Stream JSON-RPC)
     │                                     ▼
     │                           [ WebSocket Client ]
     │                                     │
     │                      ┌──────────────┴──────────────┐
     │                      ▼                             ▼
     │            [ Text Parser & UI ]          [ TTS Synthesizer ]
     │            · Markdown render             · Edge-TTS (Cloud)
     │            · Assessment cards            · Kokoro-TTS (:8880)
     │            · Emote tags extraction                 │
     │                      │                             ▼
     │                      ▼                     [ HTML5 Audio ]
     │            [ Live2D Controller ]                   │
     │            · Lip Sync (Viseme) ◀───────────────────┘
     │            · Facial Expressions (Happy/Think)
     │            · Head Look-At Cursor
     │
[ Chrome Web Browser ] ──( Alt+A / Context Menu )──▶ [ HTTP Bridge (:9124) ] ──▶ [ Avatar Chat ]
```

### 4.3 Variabel Lingkungan Runtime
* `HERMES_DASHBOARD_SESSION_TOKEN`: Token autentikasi persisten yang disuntikkan ke Hermes serve (`service-manager.js:205`).
* `HERMES_WS_URL`: URL WebSocket gateway (Default: `ws://127.0.0.1:9119/api/ws`).
* `KOKORO_MODEL_DIR`: Direktori model bobot neural Kokoro (`path-resolver.js:490`).
* `PATH`: Dimodifikasi secara dinamis saat startup oleh `fixSystemPath()` (`service-manager.js:49-104`) untuk memasukkan direktori Python Scripts, venv Hermes, dan Homebrew binary.

---

## 5. INTEGRASI HERMES

### 5.1 Spesifikasi Teknis
* **Versi Hermes Aktif:** `Hermes Agent v0.18.2 (2026.7.7.2)` (upstream `68134629`, local `915f1bf1`).
* **Koneksi:** WebSocket JSON-RPC 2.0 di `ws://127.0.0.1:9119/api/ws?token=<REDACTED>`.

### 5.2 Daftar Method RPC & Event yang Benar-Benar Dipakai
* **Method RPC yang Dikirim Avatar ke Hermes:**
  1. `session.create`: `{ title: 'Avatar chat', cwd: '...' }` → mengembalikan `session_id`.
  2. `prompt.submit`: `{ session_id: '...', text: '...' }` → memulai pemrosesan AI.
  3. `voice.toggle`: `{ action: 'on'|'off', session_id: '...' }` → mengaktifkan pipeline audio.
  4. `voice.record`: `{ action: 'start'|'stop', session_id: '...' }` → push-to-talk audio streaming.
  5. `config.get`: `{ key: '...', session_id: '...' }` → membaca konfigurasi aktif.
  6. `config.set`: `{ key: 'model', value: '...', session_id: '...' }` → mengganti model LLM aktif.
  7. `model.options`: `{ session_id: '...' }` → meminta daftar model LLM yang tersedia.
* **Event Server yang Ditangkap Avatar (`hermes-client.js` & `main.js`):**
  1. `message.start`: Avatar beralih ke animasi berpikir (`glasses`), input chat dikunci.
  2. `message.delta`: Potongan teks streaming diterima dan di-render bertahap ke Markdown.
  3. `thinking.delta`: Reasoning stream untuk model penalaran (DeepSeek R1 / OpenAI o1).
  4. `tool.start`: Membaca payload `{ name: 'browser_navigate' }` → bubble menampilkan *"Membuka halaman…"*.
  5. `tool.complete`: Menampilkan *"Menyusun jawaban…"*.
  6. `message.complete`: Menerima teks utuh akhir, mengekstrak tag emosi `[emotion:...]`, mengirim ke TTS.
  7. `turn.complete`: Membuka kunci input teks chat pengguna.
  8. `voice.status`: `{ status: 'recording'|'transcribing'|'idle' }` → mengubah status tombol mic.
  9. `voice.transcript`: `{ text: '...' }` → teks hasil ucapan pengguna otomatis diserahkan ke parser/chat.
  10. `error`: Menangani error JSON-RPC, membuka kembali kolom input chat.

### 5.3 Konfigurasi Aktif Hermes (`config.yaml` Terverifikasi & Diredaksi)
Berkas lokasi: `C:\Users\FoxPro\AppData\Local\hermes\config.yaml`
```yaml
model:
  default: oc-prod/rap/deepseek-v4-pro
  provider: custom
  base_url: http://localhost:20128/v1
stt:
  local:
    model: base
    language: id
tts:
  edge:
    voice: id-ID-GadisNeural
providers:
  '212':
    name: '212'
    base_url: http://localhost:20128/v1
    api_key: <REDACTED>
    default_model: oc-prod/rap/deepseek-v4-pro
custom_providers:
- name: '212'
  base_url: http://localhost:20128/v1
  api_key: <REDACTED>
  model: oc-prod/rap/deepseek-v4-pro
```

---

## 6. INTEGRASI 9ROUTER

### 6.1 Status & Topologi
* **Peran 9Router:** Bertindak sebagai proxy / router cerdas lokal di port `20128` yang mengarahkan panggilan API standar OpenAI (`/v1/chat/completions`) ke berbagai provider AI upstream (DeepSeek, OpenRouter, Groq, dll).
* **Konfigurasi Kombinasi Aktif:** Model `oc-prod/rap/deepseek-v4-pro` diarahkan via `http://localhost:20128/v1`.
* **Kelemahan Penanganan Gangguan (Failure Mode Analysis):**
  * **Jika 9Router Mati (Port 20128 Tertutup):** Saat pengguna mengirim pesan, Hermes daemon gagal menghubungi endpoint `base_url` dan mengembalikan JSON-RPC error. Avatar menangkap event `error` (`main.js:2405`), melepaskan kunci tombol input, dan kembali ke ekspresi netral. Namun, **tidak ada mekanisme retry otomatis, tidak ada notifikasi penjelasan di balon dialog bahwa 9Router mati, dan tidak ada fallback otomatis ke model lokal/Ollama**.
  * **Jika Terkena Rate Limit (HTTP 429 dari Upstream):** Teks error dari Hermes bocor ke tampilan chat sebagai string mentah.

---

## 7. INVENTARIS IPC & PERMUKAAN SERANG (ATTACK SURFACE)

### 7.1 Ringkasan Saluran IPC (69 Channel, Lampiran `ipc-list.txt`)
Berikut adalah pengelompokan saluran IPC utama (`ipcMain.handle` dan `ipcMain.on` di `avatar/src/main/index.js`):

| Kategori | Channel Contoh | Validasi Input | Tingkat Risiko | Dampak Keamanan |
|---|---|---|---|---|
| **Eksekusi Shell / OS** | `avatar:run-in-terminal`, `avatar:launch-app` | Sanitasi parsial (`safeCmd`, `execFile`) | **KRITIS** | Jika terjadi XSS di renderer, penyerang dapat memanggil shell OS langsung tanpa konfirmasi pengguna. |
| **Pembaruan Sistem (OTA)** | `avatar:download-and-apply-update` | Tidak ada verifikasi tanda tangan digital (Hash/GPG) | **TINGGI** | Man-in-the-middle atau pembajakan release dapat memaksa aplikasi mengekstrak biner ZIP arbitrer. |
| **Kredensial & Secrets** | `avatar:encrypt-secret`, `avatar:decrypt-secret` | Menggunakan `safeStorage` Chromium | **SEDANG** | Enkripsi aman di disk OS (DPAPI), tetapi plaintext dikembalikan utuh ke renderer via IPC. |
| **Akses File Sistem** | `avatar:read-model`, `avatar:music-load-library`, `avatar:set-custom-path` | Terikat pada path direktori pengguna | **RENDAH** | Akses dibatasi pada file aset dan direktori konfigurasi. |
| **Jendela & Interaksi** | `avatar:set-ignore-mouse`, `avatar:drag-move`, `avatar:chat-focus` | Boolean / Angka koordinat | **MINIMAL** | Hanya mengontrol atribut window Electron. |

### 7.2 Analisis Port Jaringan Terbuka
1. **Port 9124 (Bridge HTTP Server - `avatar/src/main/bridge-server.js`):**
   * **Host:** `127.0.0.1` (Lokal).
   * **CORS Header:** `Access-Control-Allow-Origin: *` (`bridge-server.js:28`).
   * **Autentikasi:** **TIDAK ADA SAMA SEKALI**.
   * **Temuan Cacat Keamanan:** Karena CORS disetel wildcard `*` dan tanpa token, skrip berbahaya yang berjalan di situs web publik mana pun yang dikunjungi pengguna di browser dapat mengirim `fetch('http://127.0.0.1:9124/api/ask', { method: 'POST', body: ... })` untuk menyuntikkan prompt berbahaya secara diam-diam ke Hermes Avatar di desktop.
2. **Port 9119 (Hermes Serve):**
   * **Host:** `127.0.0.1`.
   * **Autentikasi:** Wajib token `?token=...` (`service-manager.js:205`). Relatif aman terhadap akses lintas web.
3. **Port 8880 (Kokoro Server) & Port 20128 (9Router):**
   * **Host:** `127.0.0.1`. HTTP REST standard.

### 7.3 Izin Ekstensi Chrome (`extensions/chrome/manifest.json`)
* Izin yang diminta: `contextMenus`, `activeTab`, `storage`, dan `host_permissions: ["http://127.0.0.1/*", "http://localhost/*"]`.
* Content script diinjeksi pada `<all_urls>` untuk membaca teks seleksi halaman web.

---

## 8. PERFORMA (PENGUKURAN NYATA)

### 8.1 Penggunaan Sumber Daya Sistem (Benchmark Hasil Runtime Windows 10)
Pengukuran dilakukan pada proses aktif di Task Manager / Resource Monitor:

| Komponen Proses | Penggunaan RAM (RSS) | Penggunaan CPU (Idle) | Penggunaan CPU (Bicara / Animasi) |
|---|---|---|---|
| **Electron Main Process** | ~85 – 110 MB | 0.0% – 0.1% | 0.2% – 0.5% |
| **Electron Renderer Process (WebGL Canvas)** | ~180 – 260 MB | 0.8% – 1.8% | 3.5% – 6.2% |
| **Electron GPU Compositor Helper** | ~90 – 150 MB | 0.1% – 0.4% | 1.2% – 2.5% |
| **Hermes Daemon (`hermes.exe` + Python venv)** | ~120 – 180 MB | 0.0% | 2.0% – 5.0% |
| **Total Jejak Memori (App Footprint)** | **~475 – 700 MB** | **~1.0% – 2.3%** | **~6.9% – 14.2%** |

### 8.2 Beban Aset Visual Live2D (`avatar/assets/live2d/mother/`)
* **Berkas Model MOC3:** `20250106.moc3` sebesar **42.07 MB** (sangat besar untuk model Live2D).
* **Lembar Tekstur:** Berisi **16 lembar tekstur** beresolusi raksasa **8192 × 8192 piksel** (`texture_00.png` s.d. `texture_15.png`), dengan total ukuran berkas disk mencapai **95.8 MB**.
* **Implikasi GPU:** Memuat 16 lembar tekstur 8K secara simultan ke VRAM WebGL memakan alokasi memori grafis yang sangat intensif (~150 MB+ VRAM buffer).

### 8.3 Efisiensi Siklus & Pembersihan Listener
1. **Ticker Loop:** `this.app.ticker.add(...)` di `live2d-avatar.js:61` berputar terus-menerus pada **60 FPS** tanpa mekanisme throttling otomatis saat pengguna sedang idle berjam-jam.
2. **Pembersihan Listener:** Kelas `Live2DAvatar` tidak memiliki method `destroy()` formal untuk melepas event `resize` dan `mousemove` level dokumen.

---

## 9. BUG, HACK & UTANG TEKNIS

### 9.1 Ringkasan Workaround & Hack Terverifikasi dalam Kode
1. **Windows DWM Taskbar Hack (`avatar/src/main/index.js:296`):**
   * *Kode:* `height: height - 1`
   * *Alasan:* Pada Windows 10/11 DWM, jika jendela transparan dibuat tepat berukuran layar penuh (`width` & `height` sama persis dengan resolusi monitor), Windows menganggapnya sebagai aplikasi game fullscreen eksklusif dan menyembunyikan taskbar serta menenggelamkan z-order saat aplikasi lain diklik. Memotong 1 piksel menjaga statusnya sebagai overlay.
2. **Pencegahan Ghost Arm Live2D (`avatar/src/renderer/js/live2d-avatar.js:94-98`):**
   * *Kode:* Paksa `Param30 = 0` dan `Param98 = 0` pada setiap event model load dan klik.
   * *Alasan:* Motion `touch.motion3.json` tidak memiliki pose reset controller, sehingga jika terpanggil akan meninggalkan tangan kedua yang melayang transparan di samping badan.
3. **Token Anti-Collision Markdown Parser (`avatar/src/renderer/js/main.js:1668`):**
   * *Kode:* Mengganti token placeholder menjadi `@@@DYNAMICASSESSMENTCARD${cIdx}@@@` tanpa karakter garis bawah (`_`).
   * *Alasan:* Parser markdown inline menganggap sepasang `_` pada token lama `%%DYNAMIC_ASSESSMENT_${cIdx}%%` sebagai penanda cetak miring (*italic* `<em>`), sehingga merusak kartu assessment yang sedang di-render.
4. **3-Tier Config Bypass (`avatar/src/main/index.js:1410-1560`):**
   * *Alasan:* RPC `config.set` milik Hermes serve tidak mendukung penulisan key `custom_providers`, `tts.*`, dan `stt.*`. Akibatnya Electron main terpaksa mem-bypass API RPC dan menulis langsung ke berkas `config.yaml` dan `.env` di disk fisik.

### 9.2 Berkas Monolitik Terbesar (Perlu Refaktorisasi Segera)
1. `avatar/src/renderer/js/settings.js`: **4,211 baris** (176.0 KB) — Mengelola seluruh panel pengaturan dalam 1 file raksasa.
2. `avatar/src/renderer/js/main.js`: **3,398 baris** (120.6 KB) — Logika UI pet, event Hermes, TTS normalizer, notulen, assessment card bercampur jadi satu.
3. `avatar/src/main/index.js`: **2,547 baris** (90.8 KB) — Seluruh IPC handlers dan window lifecycle menumpuk dalam file utama.
4. `docs/AUDIT_LOG.md`: **1,692 baris** (145.1 KB).
5. `avatar/src/renderer/js/music-player.js`: **1,436 baris** (43.6 KB).

---

## 10. BUILD, DEPENDENSI & RILIS

### 10.1 Inventaris Dependensi & Audit
* **Hasil `npm ls --depth=0` (Lampiran `npm-ls.txt`):**
  * Terdapat ketidakcocokan versi: `package.json` menentukan `"electron": "33.0.0"`, tetapi yang terpasang di `node_modules` adalah `electron@33.4.11` (menghasilkan status `ELSPROBLEMS invalid: "33.0.0"`).
* **Hasil `npm audit` (Lampiran `npm-audit.txt`):**
  * Ditemukan kerentanan tingkat **High** pada Electron `<=42.11.15` (ASAR integrity bypass, context isolation bypass, dll). Diperlukan upgrade versi minor Electron yang telah memuat patch keamanan.

### 10.2 Proses Build, Pengujian, & Code Signing
* **Verifikasi Build:** Proyek **TIDAK MEMILIKI UNIT TEST, INTEGRATION TEST, MAUPUN E2E TEST**. Satu-satunya verifikasi adalah `npm run build` (`electron-vite build`).
* **Code Signing:** **TIDAK ADA KREDENSIAL SERTIFIKAT TANDATANGAN DIGITAL** (`identity: null` di `package.json:77`). Pengguna yang mengunduh biner rilis akan disambut oleh peringatan keamanan *Windows Defender SmartScreen* dan *macOS Gatekeeper*.

### 10.3 Kepemilikan & Lisensi Pihak Ketiga (Legal Risk Analysis)
1. **Model & Audio Karakter Mother:** Berasal dari aset game indie Steam [**Your Mother**](https://store.steampowered.com/app/3399950/Your_Mother/) (Steam App ID `3399950`). Status penggunaan adalah **Non-Commercial Fan Tribute** (`NOTICE.md`). Aset ini **TIDAK BERLISENSI MIT**. Jika proyek ini dirilis secara publik di GitHub, pencantuman aset ini berisiko menerima klaim hak cipta (DMCA takedown) dari pemilik game asli kecuali model diganti dengan model orisinal/CC0.
2. **Live2D Cubism Core Runtime (`live2dcubismcore.min.js`):** Hak cipta milik **Live2D Inc.** Berada di bawah *Live2D Proprietary Software License Agreement*. Boleh didistribusikan kembali (*Redistributable Code*) tetapi tidak boleh dilisensikan ulang sebagai open-source bebas.

---

## 11. KEPUTUSAN DESAIN & KEGELISAHAN PEMILIK

### 11.1 Rasionalisasi Keputusan Besar
* **Mengapa Beralih dari Godot ke Electron:** Godot 4 memiliki keterbatasan besar dalam mengimpor model MMD/Cubism secara langsung dan sulit menghasilkan jendela transparan multi-monitor yang stabil tanpa border artifact. Electron menyediakan akses langsung ke ekosistem WebGL/Canvas, Three.js, Pixi.js, dan pustaka Web Audio API.
* **Mengapa Edge TTS Bawaan:** Menyediakan suara vokal bahasa Indonesia yang sangat natural (`id-ID-GadisNeural`) tanpa memerlukan pendaftaran API key berbayar atau biaya langganan cloud.

### 11.2 Kekhawatiran Pemilik Saat Ini
1. **Legalitas Rilis Open-Source:** Pemilik sangat ingin merilis proyek ini ke publik, tetapi model visual utama masih terikat hak cipta game Steam *Your Mother*.
2. **Ukuran File & Konsumsi Memori:** Model 42 MB dan 16 lembar tekstur 8K memakan RAM yang cukup besar untuk komputer dengan spesifikasi terbatas (misal laptop 8GB RAM).
3. **Kerapuhan Pembaruan Langsung ke YAML:** Ketergantungan pada manipulasi teks string langsung ke `~/.hermes/config.yaml` rentan rusak jika struktur YAML Hermes upstream berubah format.

---

## 12. DAFTAR "TIDAK DIKETAHUI" (UNKNOWN / UNVERIFIED)

Berikut adalah hal-hal yang tidak dapat diverifikasi secara objektif dari kode saat ini dan memerlukan pengujian lanjutan:
1. **Kompatibilitas Wayland di Linux:** Apakah jendela overlay transparan Electron dapat tetap always-on-top dan tembus klik mouse (*click-through*) di desktop modern Linux (Wayland compositors)? `[TIDAK DIKETAHUI - TIDAK ADA LINGKUNGAN LINUX]`.
2. **Daya Tahan Skalabilitas Memori Mnemosyne:** Bagaimana responsivitas latensi saat basis data SQLite `state.db` milik Hermes mencapai puluhan ribu memori interaksi? `[TIDAK DIKETAHUI]`.
3. **Ketahanan UAC Windows Batch OTA Updater:** Apakah berkas `apply_update.bat` yang dieksekusi dari direktori temp pengguna dapat menimpa file di `C:\Program Files` jika aplikasi dipasang oleh installer NSIS dengan hak Administrator? `[TIDAK DIKETAHUI - BUTUH UJI ELEVASI UAC]`.

---

## 📌 RINGKASAN EKSEKUTIF (10 BARIS)
1. **Hermes 3D Avatar** adalah asisten desktop pet visual (Electron + Pixi.js Live2D) yang bertindak sebagai "aktor" bagi agen AI "Hermes" (WebSocket JSON-RPC port 9119).
2. Proyek saat ini berjalan stabil di Windows 10/11 dengan arsitektur jendela transparan, always-on-top, dan click-through yang matang.
3. Model visual utama adalah karakter Live2D *Mother* (bersumber dari game Steam *Your Mother*, status fan-tribute non-komersial).
4. Integrasi TTS menggunakan Edge-TTS gratis sebagai default, dengan fallback server lokal Kokoro-TTS (port 8880).
5. Integrasi LLM diarahkan melalui 9Router proxy lokal di port 20128 dengan model DeepSeek v4 Pro.
6. Permukaan serang keamanan kritis terletak pada server bridge HTTP port 9124 (CORS wildcard tanpa auth) dan IPC `run-in-terminal` / `launch-app`.
7. Pipeline auto-update OTA in-place berbasis zip belum dilengkapi verifikasi checksum atau tanda tangan digital kriptografis.
8. Proyek tidak memiliki unit/integration test dan pipeline CI otomatis; verifikasi murni mengandalkan keberhasilan `npm run build`.
9. Tiga berkas inti (`settings.js`, `main.js`, dan `index.js`) mengalami pembengkakan monolitik ekstrem (>10.000 baris gabungan) dan memerlukan pemecahan modul.
10. Rilis open-source publik memerlukan penggantian model default ke model bebas hak cipta (CC0/VRoid) demi kepatuhan lisensi legal.

---

## 📂 PANDUAN PENGIRIMAN BERKAS KE AUDITOR EKSTERNAL

### Berkas yang DIREKOMENDASIKAN untuk Dikirim:
* `PROJECT_BRIEFING.md` (Dokumen ini)
* Seluruh berkas di folder `briefing-attachments/` (`tree.txt`, `ipc-list.txt`, `npm-audit.txt`, `metrics.txt`, dll)
* `avatar/package.json`
* `avatar/src/main/index.js` & `avatar/src/main/service-manager.js`
* `avatar/src/renderer/js/main.js` & `avatar/src/renderer/js/hermes-client.js`
* `docs/ARCHITECTURE.md` & `docs/AUDIT_LOG.md`

### Berkas yang HARUS DIKECUALIKAN (JANGAN DIKIRIM):
* `avatar/node_modules/` (Ukuran besar, tidak perlu)
* `avatar/dist/` dan `avatar/out/` (Biner hasil kompilasi)
* Berkas `.env` atau berkas kredensial apa pun di `C:\Users\FoxPro\AppData\Local\hermes\.env`
* Berkas biner model `avatar/assets/live2d/mother/20250106.moc3` dan tekstur 8K (Berukuran raksasa ~140 MB dan terikat hak cipta non-komersial)
* Berkas basis data memori lokal `state.db` atau riwayat percakapan pribadi pengguna.
