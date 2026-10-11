# Hermes 3D Avatar — Roadmap

> **Versi:** 1.2 (Draft)
> **Status:** Fase 0–2 SELESAI ✅ — P0 (suara) SELESAI ✅ — P1 (service) SELESAI ✅ — P2 (settings) SEBAGIAN
> **Terkait:** `GOALS.md`, `ARCHITECTURE.md`, `API_BRIDGE.md`

Roadmap ini memperbarui `GOALS.md` bagian 9 sesuai keputusan final:
Electron + three.js + MMD drop-in + settings panel + cross-platform +
`hermes serve` sebagai bridge + Edge TTS + faster-whisper.

---

## Fase 0 — Persiapan

- [x] Definisikan visi & goals
- [x] Pilih arah engine: Electron + three.js + three-vrm + MMD.js
- [x] Struktur dokumen (ARCHITECTURE, API_BRIDGE, ROADMAP)
- [x] Jawab pertanyaan ke Hermes (folder `hermes-qa/`)
- [x] Tentukan OS target & spesifikasi minimum (lihat `hermes-qa/03`)
- [x] Pilih model MMD/VRM default (bebas lisensi) → lihat `docs/DECISIONS.md`
- [x] Setup folder project + Git init (selesai — push ke `KarmaSenzu/hermes-3d-avatar`)

## Fase 1 — Prototipe Visual (MVP)

- [x] Electron window transparan + always-on-top (frameless, draggable)
- [x] Load model MMD (.pmd/.pmx) via MMD.js + fallback VRM/GLB
- [x] Animasi idle dasar (blink, napas)
- [x] Launcher sederhana: pilih model → Start
- [x] Input teks sederhana → tampilkan balasan di UI (mock/dummy dulu)

## Fase 2 — Integrasi Hermes

- [x] Connect ke `hermes serve` (WS A, `ws://127.0.0.1:9119/api/ws`) untuk chat utama
- [x] Event `thinking` (message.start / thinking.delta) / `speaking` (message.complete) / `idle` bekerja
- [x] Jawaban Hermes muncul di avatar (teks dulu)
- [x] Event thinking presisi + tool (thinking.delta, tool.start, tool.complete) via WS A (tanpa plugin)

## Fase 3 — Suara & Lip Sync

- [x] TTS: avatar → Hermes `/api/audio/speak` (Edge TTS `id-ID-GadisNeural`)
- [x] STT: Hermes → faster-whisper lokal (`voice.record` → `voice.transcript`)
- [ ] Generate viseme dari audio (Rhubarb Lip Sync, offline) — sementara pakai amplitude-based
- [x] Lip sync (amplitude-based) + ekspresi wajah dasar (senang, sedih, netral, thinking)
- [x] Mode suara end-to-end: mic → STT → Hermes → TTS → avatar

## Fase 4 — Desktop Pet Interaktif

- [ ] Avatar bisa berjalan di layar (DVD bounce emote sudah ada, belum full animasi)
- [x] Respon klik / drag (window drag + auto-motion dijadikan emote)
- [x] Animasi thinking saat Hermes berpikir (bubble status + ekspresi)
- [x] Window transparan & always-on-top stabil (multi-monitor, 3 OS)
- [x] Settings panel (Home, Karakter, Suara, LLM→RPC, Shortcut) — sebagian masih read-only

## Fase 5 — Polishing & Rilis

- [ ] Optimasi performa (low-poly ≤ 50k tri, 30 FPS aktif / 10–20 FPS idle)
- [ ] Tray icon / auto-start / hotkey (globalShortcut belum)
- [ ] Dokumentasi lengkap (README, cara install & pakai, cara ganti model sendiri)
- [ ] Packaging cross-platform (Electron-builder → .exe/.app/.AppImage)
- [ ] Publish ke GitHub (dengan panduan "tinggal jalan" untuk end-user)

---

## Prioritas Saat Ini (Fokus)

1. **P2 sisa**: shortcut global, skill Hermes, API key via RPC + safeStorage.
2. **P3**: integrasi OS via suara (allowlist aksi).
3. **P4**: installer & distribusi (electron-builder).
4. **Polish**: model default CC0, Rhubarb lip sync, optimasi performa.

---

## Milestone & Definisi "Selesai" (DoD)

| Fase | DoD |
|------|-----|
| 1 | Model MMD tampil di window transparan always-on-top, bisa idle/blink |
| 2 | Teks dari Hermes muncul di avatar lewat `hermes serve` |
| 3 | Mic → jawaban terdengar (Edge TTS) + mulut sinkron (Rhubarb) |
| 4 | Avatar bisa drag/jalan + setting panel berfungsi |
| 5 | Build .exe/.app/.AppImage jalan di mesin orang lain tanpa setup |
