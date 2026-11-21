# Changelog

Semua perubahan penting pada project ini dicatat di sini.
Format mengikuti [Keep a Changelog](https://keepachangelog.com/),
dan versioning mengikuti [Semantic Versioning](https://semver.org/).

> **Kebijakan release:** Project masih tahap pengembangan & pengujian. Semua
> perubahan dicatat di bawah `[Unreleased]` **tanpa nomor versi**. Nomor versi
> (1.0.0, 1.1.0, dst.) hanya ditetapkan **tepat sebelum release** yang diputuskan
> user, saat produk dianggap stabil dan bebas bug. Tidak ada tag/release GitHub
> selama pengembangan.

## [Unreleased]

### Fix — Audit Logika Menyeluruh (K/T/S/R) — 2026-11-19

#### Fixed
- **K-2** IPC policy: `avatar:trigger-idle-chatter` & `avatar:preview-animation` kini
  juga mengizinkan window `avatar` (tombol uji idle & preview animasi berfungsi).
- **T-1** `HermesClient`: request timeout (120s), reject semua pending saat socket
  close/error, event `connection.lost`, dan auto-reconnect bertahap di avatar.
- **T-3** `avatar:start` menunggu `did-finish-load` sebelum menutup Settings &
  membatalkan `ok:true` bila `did-fail-load`.
- **T-2** Riwayat sesi: envelope prompt (`[WAKTU…]`, `[INSTRUKSI SISTEM]`,
  `[The user sent an image]`, `[Replying to]`) & `<thinking_mode>` dibersihkan;
  content array/objek diratakan; role dinormalisasi.
- **T-4** Pomodoro: menutup panel saat **dijeda** tidak lagi menghapus sesi.
- **S-1..S-8** Kokoro status via `getServiceStatus`; CSP `connect-src` + `:9124`;
  drag clamp ke workArea; provider aktif bisa "Terapkan Ulang"; `ttsEnabled` sinkron
  dengan `settings.tts.enabled`; installer verifikasi Kokoro di disk + guard
  re-entrancy; updater asset match case-insensitive; status non-Home jadi toast.
- **R-1..R-6** Debounce close traffic-light; guard `animBackBtn`; Escape tak
  menghapus label tombol chat; `#chat-summary-btn` ditambahkan; import `SAFE_QUERY`.

#### Verified
- `npm run build && npm test` → 22 suites / 156 tests lulus, build exit 0.

---

### Fix — Model 9Router Tidak Muncul di Dropdown LLM — 2026-11-19

#### Fixed
- **Model 9Router (dan provider lain) kini muncul di dropdown ganti LLM**, walau
  provider Google sedang aktif. `refreshModelOptions()` sekarang menanyakan
  **semua** provider tersimpan secara paralel (bukan hanya yang aktif).
- **Daftar model disimpan permanen per-provider.** Model live yang terdeteksi
  disinkronkan balik ke `llm_providers.json` (merge, tidak menimpa). Quick-connect
  9Router menyimpan **seluruh** daftar model, bukan hanya model pertama.
- **Parsing respons `/models` lebih tahan banting** (`extractModelIds`): mendukung
  format OpenAI `{data:[{id}]}`, Gemini `{models:[{name}]}`, array string, dan dedupe.
- **Fallback native Gemini**: bila `.../openai/models` 404, otomatis memakai
  `.../v1beta/models?key=...` (`deriveGeminiNativeModelsUrl`).

#### Added
- IPC `avatar:fetch-all-provider-models` (batch paralel, isolasi error per-provider).
- Tombol **Model** pada tiap kartu provider → panel chip model live; klik chip untuk
  langsung mengaktifkan model tersebut.
- Unit test: `extractModelIds`, `fetchModelsForProviders`, `fetchEndpointModels`
  (mock HTTP), persistensi `models[]` 9Router, `deriveGeminiNativeModelsUrl`.

#### Changed
- `avatar:set-llm-provider` meneruskan `models[]` & `authType` ke penyimpanan disk.

---

### P1 + P2 — Service Manager & Settings Panel — 2026-10-10

#### Added
- **Service manager** (`service-manager.js`): hermes serve auto-spawn, token
  persisten (file `~/.hermes-avatar/session-token`), deteksi port via TCP,
  multi-OS (Windows `hermes.cmd` + `shell: true`).
- **Shared gateway** (`hermes-gateway.js`): satu koneksi WS di main process
  (library `ws`) untuk RPC config/model — dipakai settings.
- **Settings panel sebagai home** (glassmorphism dark, sidebar + panel konten).
- **Karakter management**: daftar format → detail format → galeri per format
  (nama/file/foto, gunakan/hapus, karakter aktif di Home).
- **Suara**: TTS toggle + voice dropdown, STT model/bahasa (localStorage).
- **LLM → RPC Hermes**: model aktif (`config.get provider`) + switch model
  (`config.set model`).
- **9Router checklist** manual di Home (pengingat, bukan auto-detect).
- **Keamanan**: `docs/CONFIG_EXAMPLE.md` (placeholder, kredensial di home dir).

#### Changed
- 9Router tidak di-spawn otomatis (user yang aktifkan manual).
- Window settings diperlebar (720×560, resizable).

---

### Fase 2 — Integrasi Hermes (WS A) — 2026-10-09

#### Added
- **`hermes-client.js`**: WebSocket JSON-RPC client untuk `hermes serve`
  (connect, `session.create`, `prompt.submit`, event handler).
- **Chat nyata ke Hermes**: input teks → `prompt.submit` → streaming
  (`message.delta`) + jawaban final (`message.complete`).
- **Ekspresi thinking/netral**: `message.start` → thinking, `message.complete`
  → neutral (via `AvatarController.setExpression`).
- **Event thinking & tool (WS A)**: `thinking.delta` (thinking presisi),
  `tool.start`/`tool.complete` (indikator tool) — tanpa perlu plugin WS B.
- **Konfigurasi gateway**: WS URL + token dibaca dari env
  (`HERMES_DASHBOARD_SESSION_TOKEN`, `HERMES_WS_URL`) via IPC.

#### Fixed
- **Auth WS Hermes**: koreksi — endpoint `/api/ws` butuh `?token=` (bukan tanpa
  token seperti jawaban awal). Token via env `HERMES_DASHBOARD_SESSION_TOKEN`.

---

### Fase 1 — Prototipe Visual (MVP) — 2026-10-09

#### Added
- **Window desktop pet**: Electron window transparan + always-on-top + frameless
  + area drag (`-webkit-app-region: drag`).
- **Launcher**: window awal untuk memilih file model lalu "Mulai".
- **Loader model multi-format**:
  - `.vrm` — three-vrm (GLTFLoader + VRMLoaderPlugin), format utama.
  - `.glb` / `.gltf` — GLTFLoader.
  - `.pmx` / `.pmd` (MMD) — MMDLoader via custom protocol `model://`.
  - `.fbx` — FBXLoader via custom protocol `model://`.
- **Custom protocol `model://`**: serve file model + texture dari disk ke
  renderer (karena renderer Electron tidak bisa fetch file lokal langsung).
- **Animasi idle dasar**: blink (blendshape) + napas (posisi naik-turun).
- **Framing kamera otomatis**: hitung bounding box → atur jarak/arah kamera agar
  model full-body (kepala→kaki) masuk frame; responsif terhadap resize.
- **Komposisi avatar** (tunable): `sideOffsetRatio` (kiri/kanan),
  `verticalOffsetRatio` (atas/bawah), `zoomFactor` (ukuran), `marginRatio`.
- **Input teks mock**: form chat → balasan dummy (belum terhubung ke Hermes).
- **Build tooling**: Vite + electron-vite (dev dengan hot reload).

#### Docs / Infra
- `CONTRIBUTING.md` — standar kebersihan, penamaan, conventional commits.
- `docs/ARCHITECTURE.md`, `docs/API_BRIDGE.md`, `docs/ROADMAP.md`,
  `docs/DECISIONS.md`, `docs/GIT_SETUP.md`, `docs/MANUAL_TASKS.md`.
- `hermes-qa/` — Q&A dengan Hermes (integrasi, TTS/STT, analisa device).
- `.gitignore`, `.editorconfig`, `LICENSE` (MIT), `README.md`.

#### Known Limitations
- Model FBX/MMD **tanpa blendshape** → ekspresi wajah & lip sync (blink/emosi)
  hanya jalan untuk format VRM. FBX/MMD tampil statis / bone animation saja.
- Texture MMD/FBX yang path-nya relatif harus berada utuh di folder model.

---

## [0.0.0] — Fase 0 — Persiapan — 2026-10-09

> **Catatan:** Fase 0 bukan rilis — hanya penanda milestone pengembangan.
> Versi resmi (1.0.0) akan ditetapkan saat release final.

- Visi, goals, dan keputusan arsitektur (Electron + three.js + three-vrm + MMD.js).
- Jawaban Hermes terkunci: `hermes serve` sebagai bridge, Edge TTS (id-ID),
  faster-whisper lokal (base/small), Rhubarb lip sync.
- Struktur repo + Git init.
