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
