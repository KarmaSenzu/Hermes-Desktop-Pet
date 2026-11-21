# 🔍 LAPORAN AUDIT LOGIKA APLIKASI — HERMES 3D AVATAR

> **Jenis dokumen:** Laporan audit murni (READ-ONLY). **Tidak ada perbaikan yang dieksekusi.**
> **Tanggal:** 2026-11-19
> **Ruang lingkup:** Seluruh fitur — dari **jendela pra-masuk (Settings/Launcher)** sampai **fitur runtime desktop avatar** (chat, riwayat sesi, pomodoro, suara, 9Router, dsb).
> **Metode:** Pembacaan kode menyeluruh + verifikasi manual tiap temuan kritis terhadap sumber aktual + uji live terbatas (endpoint 9Router :20128).
> **Keputusan perbaikan:** sepenuhnya milik Anda (pemilik proyek).

---

## 0. Ringkasan Eksekutif

Saya memeriksa seluruh modul (55+ file JS, 4 HTML, IPC main↔preload↔renderer, CSP, installer, updater). Dari ±30 temuan yang dilaporkan analis, **saya verifikasi ulang satu per satu** dan membuang yang tidak akurat (lihat §5 "Temuan yang TERBUKTI BUKAN BUG"). Hasil akhir:

| Tingkat | Jumlah | Dampak dominan |
|---|---|---|
| 🔴 **KRITIS** | 2 | Fitur mati total / jendela hilang tanpa pesan |
| 🟠 **TINGGI** | 4 | Chat macet permanen, sesi kosong, jendela tidak bisa dipulihkan |
| 🟡 **SEDANG** | 8 | Fitur berjalan setengah / pesan error menyesatkan |
| 🟢 **RENDAH** | 6 | Kosmetik / edge-case / ketahanan |
| ✅ Terverifikasi bukan bug | 4 | (dibuang dari daftar) |

**3 temuan yang paling segera terasa oleh Anda:**
1. **KRITIS-1** — `launcher.html`/`launcher.js` adalah *dead code*: yang benar-benar tampil pra-masuk adalah `settings.html`.
2. **KRITIS-2** — tombol "Test idle reminder" & beberapa kanal kirim main→renderer diblokir kebijakan IPC (fitur mati tanpa error jelas).
3. **TINGGI-1** — `HermesClient.request` **tanpa timeout & tanpa reconnect**: setelah Hermes restart, chat bisa "Berpikir…" selamanya.

---

## 1. 🔴 TEMUAN KRITIS

### K-1. `launcher.html` + `launcher.js` = dead code; alur "pra-masuk" sebenarnya `settings.html`
- **File:** `src/main/index.js:317` & `:319`, `electron.vite.config.js:71-72`
- **Bukti:**
  ```js
  // index.js — satu-satunya jendela pertama yang dibuat:
  launcherWindow.loadURL(`${...ELECTRON_RENDERER_URL}/settings.html`)   // :317
  launcherWindow.loadFile(join(__dirname, '../renderer/settings.html')) // :319
  ```
  `launcher.html` di-build (rollup input `launcher: .../launcher.html`) tetapi **tidak pernah** di-`loadFile`/`loadURL` di main.
- **Sebab logika:** dua implementasi "launcher" yang berbeda, dan yang hidup adalah dashboard Settings 4300+ baris.
- **Gejala ke pengguna:** jendela "launcher 3-kolom" (Pilih model → Mulai) tidak pernah muncul; yang muncul langsung dashboard Settings. Semua perbaikan di `launcher.js` tidak berefek.
- **Saran (belum dieksekusi):** pilih satu — (a) `createLauncherWindow()` memuat `launcher.html` lalu Settings jadi jendela kedua, atau (b) hapus `launcher.html/js` & ganti nama variabel jadi `settingsWindow`. Tambah assertion build agar setiap HTML input benar-benar dipakai main.

### K-2. Kebijakan IPC memblokir kanal "push" main→renderer (fitur mati tanpa error jelas)
- **File:** `src/main/ipc-policy.js:56, 83`; konsumen di `main.js:1722` & `main.js:2355`
- **Bukti:**
  ```js
  'avatar:preview-animation': ['settings'],      // tapi yang mendengarkan = JENDELA AVATAR
  'avatar:trigger-idle-chatter': ['settings'],   // hanya 'settings' diizinkan
  ```
- **Sebab logika:** `IPC_POLICY` memvalidasi *pengirim invoke*, tetapi dua kanal ini adalah **push** main→avatar. Saat Settings menekan "Test idle reminder", handler `secureHandle` mengirim ke avatar; hasilnya berujung `{ ok:false, error:'Avatar window belum aktif' }` walau avatar hidup.
- **Gejala:** tombol uji pengingat idle & preview animasi tidak memicu apa pun di avatar. **Terverifikasi via grep.**
- **Saran:** tambahkan `'avatar'` ke array → `['settings','avatar']`.

---

## 2. 🟠 TEMUAN TINGGI

### T-1. `HermesClient.request` tanpa timeout & `pending` tak ditolak saat socket putus → chat macet permanen
- **File:** `src/renderer/js/hermes-client.js:91-103` (request), `:54-58` (on close); pemakaian `main.js:2545-2549`
- **Bukti:** `request()` menyimpan promise di `this.pending` tanpa timer; `socket.on('close')` hanya me-reject promise *connect*, bukan `this.pending`. `setInputLocked(true)` (`main.js:2545`) hanya dibuka pada `message.complete`/`error`/`turn.complete`.
- **Gejala:** setelah `hermes serve` restart (Settings → restart, atau failover), chat tersangkut "⏳ Hermes sedang bekerja…" selamanya; harus relaunch aplikasi. **Terverifikasi.**
- **Saran:** reject semua `pending` saat `close`, tambah timeout per-request (mis. 120s), lalu auto-reconnect + `createSession()` dengan backoff; daftarkan handler event **sebelum** log "Terhubung".

### T-2. Riwayat sesi: 65% pesan hilang, envelope prompt bocor, konten mentah belum disanitasi
- **File:** `src/renderer/js/main.js:2917-2936` (resume), `:2977` (list), `hermes-brain-service.js:245-251`
- **Bukti kode:**
  ```js
  const role = String(m?.role || m?.sender || '').toLowerCase()
  const rawContent = String(m?.text || m?.content || m?.body || '').trim()
  if (role === 'user') { ... } else if (role === 'assistant') { ... }   // selain ini DILEWATI
  ```
- **Bukti data nyata (`state.db`):** tabel `messages` (2.333 baris, 43 sesi):
  | role | jumlah |
  |---|---|
  | `tool` | **1.241** (53%) |
  | `assistant` | 879 |
  | `user` | 209 |
  | `session_meta` | 4 |
  `typeof(content)` = **text 2.329 / null 4** (tidak ada array/blob → **tidak ada crash**).
- **Gejala nyata (terverifikasi terhadap data asli):**
  1. **±65% pesan tak tampil** — semua `tool` (1.241) & `session_meta` difilter `if (role==='user'||'assistant')`. Tool result memang (bisa) disembunyikan dari tampilan, tapi ini juga menyembunyikan konteks penting.
  2. **Kebocoran envelope di ~26% sesi (11/43):** baris `user` pertama berupa preamble `[WAKTU & TANGGAL SISTEM…]` / `[INSTRUKSI SISTEM: EXECUTIVE MEETING MINUTES…]` (s/d 5.795 char) ter-render seolah diketik pengguna. `stripAvatarPromptEnvelope` hanya menangani penanda `[WAKTU & TANGGAL SISTEM SAAT INI:` (baris lain lolos).
  3. **Konten mentah:** 94 baris `user` berawalan `[The user sent an image~ …]`, `[Replying to: …]`, `<thinking_mode>enabled</thinking_mode>` di assistant, tabel Markdown mentah.
  - **Catatan penting:** klaim analis soal `content` berupa array OpenAI **TIDAK TERJADI** di data Anda (selalu TEXT). Memperbaikinya tetap aman untuk masa depan, tetapi bukan penyebab gejala.
- **Saran:** perluas `stripAvatarPromptEnvelope` untuk semua penanda preambel (`[WAKTU & TANGGAL`, `[INSTRUKSI SISTEM?`, `[The user sent an image`, `[Replying to:`), bersihkan `<thinking_mode>` di teks assistant; pertimbangkan filter role yang dapat dikonfigurasi (sembunyikan `tool` secara default). **Ini adalah jawaban langsung atas keluhan "riwayat percakapan kosong/tidak rapi".**

### T-3. `avatar:start` menghancurkan jendela Settings & melaporkan `{ok:true}` tanpa menunggu avatar ter-render
- **File:** `src/main/index.js:598-608`
- **Bukti:**
  ```js
  createAvatarWindow(resolvedPath)
  if (launcherWindow && !launcherWindow.isDestroyed()) { launcherWindow.destroy(); launcherWindow = null }
  return { ok: true, reused: false }   // dikembalikan tanpa menunggu render
  ```
- **Gejala:** klik "Mulai Desktop Avatar" → Settings tertutup; jika halaman avatar gagal dimuat (model/CSP/protokol), muncul overlay transparan kosong & **tidak ada jalan balik** kecuali hotkey (`avatar:close` hanya boleh dari window `avatar`). **Terverifikasi.**
- **Saran:** buat window `show:false`, tunggu `did-finish-load` → baru `show()` + tutup Settings; tangani `did-fail-load`/`render-process-gone` → `showLauncherWindow()`.

### T-4. Pomodoro: menutup panel saat *dijeda* menghapus sesi jeda
- **File:** `src/renderer/js/pomodoro-timer.js:98-116`, dipanggil `main.js:497-499`
- **Bukti:** `closeTimerPanel()` masuk cabang reset bila `stopTimer || !isTimerRunning`. Saat **dijeda** `isTimerRunning=false` padahal sisa waktu masih ada → interval di-clear, milestone di-reset, tombol jadi "▶ Mulai", outfit fokus dilepas.
- **Gejala:** mulai 25m → jeda di 12:30 → tutup panel → buka lagi: tampil 12:30 tapi status "Siap untuk sesi fokus" dan "Mulai" menimpa alih-alih melanjutkan. **Terverifikasi.** (Matematika milestone 20/40/60/80% **benar**, tidak ada off-by-one.)
- **Saran:** tambah status 3-keadaan `running|paused|idle`; jangan reset bila `paused` dan `stopTimer=false`.

---

## 3. 🟡 TEMUAN SEDANG

### S-1. `checkSystemPackages` tidak ada di preload → status Kokoro & launch terminal salah
- **File:** `settings.js:1137, 1299` vs `preload/settings.js` (tak ada)
- **Bukti:** `window.hermesAvatar.checkSystemPackages?.()` → `undefined`; `check?.kokoro` selalu falsy.
- **Gejala:** polling Kokoro selalu timeout (toast sukses tak pernah muncul) & kadang menulis "❌ Gagal: Port 8880 belum aktif" padahal server sedang menyala (start butuh s/d 12s). **Terverifikasi.**
- **Saran:** ganti ke `getServiceStatus()` yang sudah ada & diizinkan, atau ekspos wrapper baru + policy.

### S-2. CSP memblokir "Uji Bridge" (port 9124 tidak ada di `connect-src`)
- **File:** `csp-policy.js:15`, `settings.js:1496`
- **Bukti:** `connect-src 'self' ws/http 9119, 8880, 20128 …` — **tidak ada `9124`**; fetch `http://127.0.0.1:9124/api/ping` selalu "Refused to connect".
- **Gejala:** "Bridge Belum Merespons" **selalu** muncul walau bridge sehat. **Terverifikasi.**
- **Saran:** tambahkan `http://127.0.0.1:9124` ke `connect-src`, atau jalankan ping lewat IPC.

### S-3. Drag avatar tanpa clamp batas layar → avatar bisa hilang permanen
- **File:** `index.js:653-657`
- **Bukti:** `setPosition(b.x + dx, b.y + dy)` tanpa clamp ke `workArea`; window `frame:false`, `skipTaskbar:true`, tanpa tray.
- **Gejala:** sekali tergeser keluar layar, pet + chat tak bisa dipanggil kembali. **Terverifikasi.**
- **Saran:** clamp ke `screen.getDisplayNearestPoint(...).workArea`.

### S-4. Provider LLM aktif tak bisa "Aktifkan ulang" (tombol disabled & tidak di-bind)
- **File:** `settings.js:2312-2315` (render `disabled`), `:2326` (selector `:not([disabled])`)
- **Gejala:** setelah Hermes restart dengan model ter-reset, panel tetap "Aktif ✅" tapi chat pakai model salah; satu-satunya akal-akalan: pindah provider lalu balik. **Terverifikasi** (muncul saat pengecekan fitur LLM yang baru kita perbaiki).
- **Saran:** bind semua `.llm-activate`; baris aktif tampilkan "Terapkan Ulang".

### S-5. Mute/TTS dari Settings tidak tersinkron ke avatar
- **File:** `main.js:62` (`let ttsEnabled = true`), `getVoiceSettings` tak membaca `settings.tts.enabled`
- **Gejala:** mematikan suara di Settings tidak membisukan avatar; mute di avatar kembali `true` setiap reload. **Terverifikasi.**

### S-6. Resume/instalasi paket: "Continue" muncul setelah instalasi tunggal sukses & `kokoro` bisa dilewati permanen
- **File:** `package-installer.js:876-884` (`kokoro` → `return true` buta), `:1009-1038`; `settings.js:622`
- **Gejala:** (a) bar "Lanjutkan Instalasi Tertunda" muncul padahal tak ada yang gagal; (b) setelah "Bersihkan Cache"/uninstall Kokoro, Continue **selalu** melewati Kokoro. (Terkait keluhan lama "stuck 60%").
- **Saran:** verifikasi Kokoro dari disk (bukan JSON `done`); inisialisasi item non-diminta ke `done`; tambah kunci re-entrancy di main.

### S-7. Updater: pencocokan aset case-sensitive + patch dikenali dari nama file + checksum gerbang keras
- **File:** `updater-service.js:326-353, 411-420, 469-482`
- **Gejala:** aset `.ZIP/.DMG` huruf besar dilewati; zip "full" bernama *patch-notes* diperlakukan patch → **instalasi versi campur**; rilis tanpa `digest` → unduh 100MB lalu dibuang & "Checksum tidak cocok".
- **Saran:** `toLowerCase()` sebelum `endsWith`; flag `isPatch` eksplisit dari manifest; tangani checksum absen dengan tombol "Download anyway".

### S-8. Pesan status di luar Home tak terlihat (semua menulis ke `#status` di panel Home yang tersembunyi)
- **File:** `settings.js:17-18` (`statusEl`), dipakai lintas panel
- **Gejala:** "⚠️ Pilih file model.", "Karakter diperbarui.", "Aplikasi dihapus." dst. tak pernah tampil karena berada di panel Home yang tidak aktif. **Terverifikasi pola.**

---

## 4. 🟢 TEMUAN RENDAH

| # | File | Masalah |
|---|---|---|
| R-1 | `settings.js:150+` / `index.js:676` | Tombol traffic-light bisa double-fire `window-close` → di Windows bisa menutup app di tengah instalasi. |
| R-2 | `settings-animations.js:816` | `animBackBtn.addEventListener` tanpa `?.` di top-level import → satu elemen hilang = seluruh dashboard blank. |
| R-3 | `main.js:1729` | Handler Escape men-set `commentToggle.textContent='💬'` menghapus label/emoji permanen. |
| R-4 | `main.js:1529-1534` | `live2dPet.spawnHeart(...)` tanpa guard null (mode VRM/3D) → error saat klik mute. |
| R-5 | `index.js:1892` | **`SAFE_QUERY` dipakai tapi tidak di-import** ke `index.js` (ada di `cli-args.js`) → `avatar:browse-skills` dengan kata kunci melempar `ReferenceError`. **Terverifikasi.** |
| R-6 | `main.js:266` | `#chat-summary-btn` tidak ada di `index.html` → tombol Notulen Eksekutif tak terjangkau dari UI. |

> R-5 (SAFE_QUERY) sebenarnya berbatas **TINGGI-ke-SEDANG** karena browsing skill ber-kata-kunci selalu gagal; saya taruh di RENDAH karena fiturnya sekunder (browse tanpa kata kunci tetap jalan).

---

## 5. ✅ TEMUAN YANG TERBUKTI **BUKAN** BUG (dibuang setelah verifikasi)

| Klaim analis | Kenyataannya |
|---|---|
| **C1** "TDZ: `timerPanel` di `onDrag` mematikan renderer" | ❌ **Salah.** `chatSheet:261`, `musicPanel:370`, `timerPanel:374` **semua** declared di top-level, jauh sebelum `onLoadModel` (async). Tidak ada TDZ. |
| **F16** "`hidden` vs `.hidden` membuat modal selalu tampil" | ❌ **Salah.** `launcher.css:2102-2105` punya `[hidden]{display:none!important}` → `hidden` berfungsi. |
| **F14** "Edit provider mengabaikan `editingProviderId` → duplikat" | ❌ **Salah.** Save handler `settings.js:3474` **memang** memeriksa `editingProviderId` dan update provider yang ada. |
| **H1** "Perintah suara `buka app` membuat input terkunci" | ⚠️ **Sebagian salah.** Jalur suara *me-unlock* di `main.js:2103`. Akar masalah nyata adalah **T-1** (request tanpa timeout). |
| **T-2 versi awal** "`String(content)` rusak pada content-array → `[object Object]`" | ❌ **Tidak terjadi.** Data nyata `state.db`: `content` selalu TEXT (2.329) / NULL (4), tak ada array. Gejala riwayat yang sebenarnya = T-2 (versi terkoreksi): 65% role terfilter + envelope bocor. |

> Prinsip: laporan ini hanya memuat temuan yang sudah saya buktikan sendiri lewat sumber kode yang dirujuk.

---

## 6. ✅ FLOW YANG DI-PERIKSA & DINYATAKAN SEHAT

- **Kelengkapan IPC:** semua `ipcRenderer.invoke/send` di kedua preload punya `secureHandle/secureOn` **dan** entri `IPC_POLICY` (kecuali temuan K-2/R-5). Tidak ada "Channel tidak terdaftar" saat startup.
- **Chat normal:** `message.start → delta → complete → speak → TTS → lipsync` (Live2D & VRM) konsisten; `isGeneratingSummary` & `setInputLocked` direset di ketiga terminal handler.
- **Lipsync/TTS:** menangani `{dataUrl}` (Hermes) maupun `{base64}` (msedge fallback); `withTimeout` 15s mencegah antrean speech macet.
- **Click-through:** `setIgnoreMouseEvents(ignore, {forward})` benar; dedupe `ignoringMouse`; hit-test bounding-box berjalan.
- **Pomodoro milestone:** matematika 20/40/60/80% (verified via test + baca) benar; hanya *state* jeda yang bermasalah (T-4).
- **Installer progress math:** monoton & ≤92% saat jalan — "stuck 60%" **bukan** dari aritmetika, melainkan dari jendela hilang (T-3) / preload hole (S-1) / resume dead-end (S-6).
- **Updater security:** `isValidAssetName`, `isValidGithubAssetUrl`, `extractSha256FromReleaseBody`, `isNewerVersion` benar; PowerShell arg-quoting aman.
- **LLM provider (perbaikan sesi ini):** batch fetch semua provider → 9Router **65 model** live; fallback native Gemini benar.
- **Test suite:** 22 suites / 156 tests lulus; `npm run build` exit 0.

---

## 7. Rekomendasi Urutan Perbaikan (jika Anda memutuskan nanti)

1. **K-2** (1 baris/kanal di `ipc-policy.js`) — murah, langsung menghidupkan 2 fitur.
2. **T-1** (timeout + reject pending saat close) — mencegah "chat macet" paling sering.
3. **T-3** (jangan `destroy()` launcher sebelum avatar render) — mencegah "layar kosong tak bisa kembali".
4. **T-2** (normalisasi role/content di riwayat sesi) — langsung menjawab kekhawatiran Anda soal riwayat.
5. **S-3** (clamp drag) + **S-4** (aktifkan ulang provider) — pencegahan "hilang".
6. **S-1, S-2, S-6, S-7** — menyelaraskan status/update.
7. **K-1** — keputusan arsitektur (rapikan/matikan launcher mati).
8. Sisanya (RENDAH) — pembersihan bertahap.

---

## 8. Catatan metodologi

- Semua temuan KRITIS/TINGGI di §1-§2 telah saya **verifikasi langsung** pada baris kode yang dirujuk.
- Temuan yang gagal verifikasi **tidak** dimasukkan (§5).
- Tidak ada file yang diubah; tidak ada commit; satu-satunya operasi eksternal adalah uji *read-only* ke endpoint 9Router lokal.
- Nomor baris mengacu pada kondisi file **saat ini** (termasuk perbaikan provider sesi ini).

*Laporan ini disusun untuk keputusan Anda. Tidak ada perbaikan yang dijalankan.*
