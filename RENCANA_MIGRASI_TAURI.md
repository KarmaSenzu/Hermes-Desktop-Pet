# 🦀 RENCANA OPSI B-ALTERNATIF: Migrasi Shell ke Tauri (Electron → Tauri)

> **Status:** 💡 **IDE / RENCANA BELUM DIKERJAKAN** — hanya dokumen referensi.
> **Tanggal dibuat:** 2026-11-21
> **Konteks:** Hasil sesi brainstorming performa. Ini adalah "Plan B" bila
> optimasi ringan di Electron (Opsi A/B/C) dianggap belum cukup.
> **Keputusan:** Ditunda. Dicatat agar bila nanti berubah pikiran, semua pertimbangan
> & risiko sudah terdokumentasi (tanpa perlu mengulang analisis).

---

## 0. TL;DR (Ringkasan 30 detik)

| Pertanyaan | Jawaban singkat |
|---|---|
| Apakah Tauri bisa menjalankan sistem ini? | **Ya** — renderer (Live2D/Pixi/three/HTML/JS) hampir 100% utuh. |
| Apakah parity 100% dijamin? | **Tidak.** Beberapa fitur desktop-pet **berisiko beda perilaku** dan wajib uji ulang. |
| Efek ke RAM? | Shell: ~300–400 MB (Electron) → ~50–80 MB (Tauri WebView2). **Tapi** beban utama (model 133 MB + VRAM 76 MB) **tidak ikut turun** karena itu di renderer/GPU. |
| Beban kerja? | ~**1–3 minggu full-time** untuk parity (bukan sehari). |
| Rekomendasi | **Optimasi aset Electron dulu (Opsi A/B/C).** Tauri baru dipertimbangkan bila itu belum cukup, dan lewat **spike kecil** dulu. |

---

## 1. Latar Belakang & Mengapa Tauri

Sistem saat ini = **Electron + three.js/Pixi/Live2D**, dengan otak **Hermes (Python sidecar)**.
Keluhan yang memicu ide ini: dirasa **berat di RAM** dan kurang ramah untuk dipakai harian.

> ⚠️ **Fakta penting dari pengukuran:** beban terbesar sistem **bukan** di runtime shell,
> melainkan di **aset & render GPU**:

| Sumber beban | Ukuran |
|---|---|
| Model Live2D `assets/live2d/mother` | **133 MB** (1 file `.moc3` = **41 MB**) |
| 16 tekstur Live2D | 92 MB file → **~76 MB VRAM** |
| Bundle avatar (three 1,75 MB + Pixi 1,42 MB) | **3,17 MB** dimuat penuh, tanpa code-split |
| Electron shell baseline | ~300–400 MB RAM |

**Implikasi:** Ganti Electron → Tauri hanya memotong **shell (~250 MB)**, sedangkan
**133 MB model + 76 MB VRAM tetap ada**. Untuk itu, **lihat dulu §7 (opsi ringan tanpa migrasi)**.

---

## 2. Apa yang BERUBAH & Apa yang TETAP

### ✅ TETAP (kode nyaris tak berubah)
- **Seluruh renderer**: `index.html`, `settings.html`, semua modul `src/renderer/js/*`
  (Live2D, Pixi, three, chat, markdown, pomodoro, musik, animasi, emotion, dll).
- **Aset**: model Live2D/VRM, audio, skills, ikon — dipaketkan sama.
- **WebGL** berjalan di WebView2 (Windows) / WKWebView (macOS) / WebKitGTK (Linux).
- **Alur logika** fitur (UI & interaksi) identik karena berbasis web.

### 🔧 BERUBAH (ditulis ulang ke Rust)
- **~15 modul `src/main/*.js`** → equivalent Rust + plugin Tauri:
  `index.js`, `service-manager.js`, `provider-service.js`, `oauth-service.js`, `updater-service.js`,
  `package-installer.js`, `path-resolver.js`, `bridge-server.js`, `shortcuts.js`, `secure-ipc.js`,
  `ipc-policy.js`, `hermes-*`, `tts-service.js`, `feed-service.js`, `app-registry.js`, dll.
- **IPC** `ipcMain.handle` / `preload` → Tauri commands + `invoke`.
- **Autoupdater OTA**, **installer NSIS**, **secret store (`safeStorage`)** → diganti mekanisme Tauri.

---

## 3. Peta Fitur vs Dukungan Tauri (diukur dari kode aktual)

> Sumber: grep `src/main/*.js` untuk API Electron yang dipakai.

| Fitur | API Electron yang dipakai | Dukungan Tauri | Verdict | Catatan |
|---|---|---|---|---|
| Window transparan (avatar desktop) | `transparent: true` | ✅ `transparent: true` | **Aman** | |
| Always-on-top | `setAlwaysOnTop(true, 'screen-saver')` | ✅ `alwaysOnTop` | **Aman** | Level `screen-saver` khusus → setara "always on top level" |
| **Click-through** | `setIgnoreMouseEvents(true, { forward: true })` | ⚠️ `set_ignore_cursor_events(true)` — **`forward` tidak ada** | **BERISIKO TINGGI** | Inti desktop-pet. Perlu polling kursor sebagai ganti `forward` |
| Kursor global OS (mata ikut kursor) | `screen.getCursorScreenPoint()` 33×/detik | ✅ `cursor_position()` | **Aman** | |
| Drag window manual | `getBounds` / `setPosition` | ✅ API window position | **Aman** | |
| Clamp multi-monitor | `screen.getDisplayNearestPoint` | ✅ monitor API | **Aman** | |
| Global shortcut | `globalShortcut` | ✅ plugin global-shortcut | **Aman** | Perlu plugin |
| Enkripsi API key | `safeStorage` (DPAPI/Keychain) | ✅ plugin stronghold / OS keyring | **Aman** | Konfigurasi beda |
| Custom protocol `model://` | `protocol.handle('model', …)` | ✅ `register_uri_scheme_protocol` | **Aman** | |
| **Screen Vision / capture** | `desktopCapturer.getSources` | ⚠️ Lewat plugin, cara beda | **BERISIKO SEDANG** | Perlu reimplementasi |
| Permission mic/media | `session.setPermissionRequestHandler` | ✅ plugin | **Aman** | |
| IPC main↔renderer | `ipcMain.handle` + preload | ✅ `invoke`/command | **Aman** | Kerja sedang (rewrite semua kanal) |
| Web companion bridge | `bridge-server.js` (Node http) | ✅ Rust http | **Aman** | Rewrite |
| Anti-sink DWM Windows | `focusable:true` + `height-1` + `setAlwaysOnTop` saat blur | ⚠️ Perilaku default beda | **BERISIKO SEDANG** | Wajib uji di Windows |
| Background throttling | `backgroundThrottling: false` | ⚠️ Behavior WebView2 beda | **BERISIKO RENDAH** | Uji lipsync saat unfocus |

### 🚨 Tiga risiko terbesar (harus diuji ulang)
1. **`setIgnoreMouseEvents(forward:true)`** — tanpa `forward`, event mouse tidak diteruskan saat
   click-through. Solusi: **polling posisi kursor** untuk look-at & hit-test. Bisa jalan, tapi beda
   implementasi & potensi jitter.
2. **Anti-sink DWM (Windows)** — trik `focusable:true` + `height-1` spesifik Electron/Win32.
   Perilaku "tidak tenggelam saat diklik" **wajib dites**.
3. **Screen capture / Vision** — `desktopCapturer` tak ada padanan langsung; perlu plugin khusus.

---

## 4. Prasyarat & Environment

| Item | Kebutuhan |
|---|---|
| Rust toolchain | `rustup` + `cargo` |
| Tauri CLI | `@tauri-apps/cli` / `cargo tauri` |
| Windows | **WebView2 Runtime** (sudah ada di Windows 10/11 modern) |
| macOS | WKWebView (bawaan) |
| Linux | WebKitGTK + libs (`libwebkit2gtk-4.1-dev`, dll) — **WebGL sering lemah** |
| Node (untuk build renderer) | tetap dipakai untuk membundel `src/renderer` |

> ⚠️ Catatan Linux: WebKitGTK sering bermasalah untuk WebGL/Live2D. Jika target utama
> **Windows** (seperti saat ini), risiko ini kecil. Multi-OS = risiko naik.

---

## 5. Strategi Migrasi (Bertahap, Bukan Big-Bang)

> **JANGAN** menulis ulang semuanya sekaligus. Lakukan **spike → shell → IPC → fitur berat**.

### Fase 0 — SPIKE (WAJIB, ±2–3 hari) — *decision gate*
Buat prototype kecil terpisah (bukan di repo utama) untuk **membuktikan** 3 hal berisiko:
1. Window transparan + frameless + always-on-top di WebView2.
2. **Click-through + polling kursor** (buktikan look-at & hit-test tetap bisa).
3. **Render Live2D** (Pixi + `live2dcubismcore.min.js`) di WebView2, ukur FPS & RAM.
- **Keputusan:** jika 3 hal ini mulus → lanjut. Jika click-through/WebGL gagal → **stop, kembali ke Electron**.

### Fase 1 — Shell dasar
- Window main + settings (2 window) transparan/frameless.
- Muat `out/renderer/index.html` & `settings.html` yang **sudah ada**.
- Migrasi `model://` protocol & CSP.

### Fase 2 — IPC & service manager
- Ganti `secure-ipc.js` + `ipc-policy.js` → Tauri commands + capability policy.
- Port `service-manager.js` (spawn hermes/9router/kokoro), `path-resolver.js`, `secret-store` (stronghold).
- Port `shortcuts.js` (global-shortcut plugin).

### Fase 3 — Fitur berat
- `provider-service` / `oauth-service` (HTTP + secret) — port ke Rust (`reqwest`).
- `tts-service` (Edge/Kokoro) — port.
- **Screen capture / Vision** — plugin khusus (paling menantang).
- `updater-service` (OTA) — ganti ke Tauri updater (butuh signing).
- `bridge-server` (ekstensi Chrome) — Rust HTTP.

### Fase 4 — Parity & QA
- Uji ulang **SEMUA** fitur (checklist di §6).
- Perbandingan RAM/CPU vs Electron baseline (ukur sebelum & sesudah).

---

## 6. Checklist Uji Parity (WAJIB sebelum "selesai")

- [ ] Avatar tampil transparan di desktop, tidak ada kotak hitam.
- [ ] **Click-through**: klik area kosong → tembus ke desktop; klik karakter → bereaksi.
- [ ] **Look-at kursor global**: mata/kepala ikut kursor di seluruh layar (termasuk saat app lain fokus).
- [ ] Drag avatar bebas + clamp ke layar (tidak bisa hilang).
- [ ] Window tidak tenggelam (sink) saat diklik / blur (Windows DWM).
- [ ] Zoom scroll, reset posisi, menu aksi mengambang.
- [ ] Chat: ketik → streaming → TTS → lipsync. Riwayat sesi & resume.
- [ ] Ganti model LLM (hot-swap), 9Router (65 model), kuota, OAuth.
- [ ] Pomodoro (jeda/continued), musik, animasi preview (IPC push channel).
- [ ] Global shortcut (buka settings, dll).
- [ ] **Screen Vision** (screenshot/snipping) — paling berisiko.
- [ ] Bridge ekstensi Chrome (ping :9124).
- [ ] Installer & **OTA updater** bekerja.
- [ ] Mic/STT permission.
- [ ] RAM/CPU saat idle & aktif (bandingkan vs Electron).

---

## 7. ⭐ Alternatif Ringan TANPA Migrasi (Disarankan Lebih Dulu)

Sebelum memutuskan Tauri, kerjakan yang **dampak besar & risiko kecil** di Electron:

| Opsi | Aksi | Efek perkiraan | Risiko |
|---|---|---|---|
| **A** | Downscale `texture_00.png` 2048→1024; re-atlas 16→4-6; PNG→WebP; kompres `.moc3` | Model 133→**40–60 MB**, VRAM 76→**~30 MB** | Sangat rendah |
| **B** | Lazy-load Pixi **vs** three (dynamic `import` sesuai jenis model) | −~1,5 MB RAM + boot lebih cepat | Rendah |
| **C** | Throttle idle lebih agresif (8 FPS / DPR 1.0 / pause RAF saat hidden) | CPU/GPU idle ≈ nol | Rendah |

**Kesimpulan §7:** Jika keluhan utama = RAM/panas, **Opsi A** sendirian kemungkinan sudah
memotong lebih banyak (50–100 MB + 40–50 MB VRAM) daripada yang bisa diberikan Tauri (~250 MB
shell) — **tanpa** migrasi besar. **Uji dulu Opsi A/B/C, baru pertimbangkan Tauri.**

---

## 8. Estimasi Biaya & Risiko

| Aspek | Estimasi |
|---|---|
| Waktu parity | **1–3 minggu full-time** (tergantung Screen Vision & click-through) |
| Risiko regresi | **Tinggi** (rewrite 15 modul main) |
| Risiko UX | **Sedang** (click-through `forward`, anti-sink DWM) |
| Dua codebase selama migrasi | **Ya** (perlu maintenance ganda) |
| Keuntungan RAM shell | ~250 MB (dari ~300–400 → ~50–80) |
| Keuntungan ukuran binary | Besar: ~200 MB bundled → ~10–15 MB (tanpa aset model) |
| Kerugian | Ekosistem Electron (autoupdater/installer/secret) harus diganti |

---

## 9. Keputusan Akhir (untuk diri sendiri saat membuka dokumen ini lagi)

1. Apakah keluhan = **RAM/panas**? → **Coba Opsi A/B/C dulu** (§7). Kemungkinan besar cukup.
2. Apakah butuh **ukuran installer jauh lebih kecil** (mis. distribusi luas)? → Tauri menang
   signifikan di ukuran binary (aset model tetap sama).
3. Apakah siap **uas ulang semua fitur** (§6) & investasi 1–3 minggu? → jika tidak, **jangan**.
4. Apakah target **hanya Windows**? → risiko Tauri jauh lebih kecil (WebView2). Multi-OS = risiko naik.

> **Trigger untuk benar-benar mulai:** bila Opsi A/B/C sudah dikerjakan dan masih dirasa
> berat **atau** butuh binary jauh lebih kecil. Saat itu → **mulai di Fase 0 (Spike)**.

---

## 10. Catatan Metodologi

- Semua data API di §3 diambil dari grep langsung `avatar/src/main/*.js`.
- Angka aset/RAM diambil dari pengukuran nyata (audit performa 2026-11-21), bukan estimasi.
- Dokumen ini **tidak** mengubah kode apa pun. Hanya referensi keputusan.

*Dokumen rencana — belum dieksekusi. Lihat `LAPORAN_AUDIT_LOGIKA.md` untuk audit bug.*
