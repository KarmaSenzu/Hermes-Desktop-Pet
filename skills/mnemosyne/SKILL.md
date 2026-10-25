---
name: mnemosyne
description: "Install, configure, and operate Mnemosyne as Hermes Agent long-term memory provider — local SQLite with vector search, episodic consolidation, and temporal knowledge graphs."
version: 2.0.0
author: Mnemosyne OSS
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [hermes, memory, mnemosyne, plugins, core, setup]
    core: true
    mandatory: true
prerequisites:
  commands: [hermes]
---

# Mnemosyne — Hermes Long-Term Memory Provider (Wajib / Core)

Mnemosyne adalah lapisan memori permanen (*long-term memory layer*) bawaan untuk Hermes 3D Avatar.
Menyediakan penyimpanan lokal 100% berbasis SQLite (WAL mode) dengan pencarian hybrid Vector + FTS5, konsolidasi episodik, dan graf pengetahuan temporal.

**100% Lokal. Privasi Penuh. Bebas Cloud. Sub-millisecond recall.**

## Fitur Utama yang Disediakan
- **Injeksi System Prompt:** Blok `# Mnemosyne Memory` dimasukkan secara otomatis ke setiap prompt konteks.
- **Pre-Turn Prefetch:** Memori yang relevan ditarik sebelum model LLM menjawab.
- **Post-Turn Sync:** Setiap giliran percakapan otomatis dicatat ke memori episodik.
- **20+ Tools Memori:** `mnemosyne_remember`, `mnemosyne_recall`, `sleep`, `triples`, `scratchpad`, `graph`, `diagnostics`, dll.
- **Perintah CLI:** `hermes mnemosyne {stats|sleep|inspect|export|import|clear|version}`.

## Status Memori
Untuk memeriksa status provider memori di terminal:
```bash
hermes memory status
```
Harus menampilkan:
```
Provider: mnemosyne
Status:   available ✓
Plugin:   installed ✓
```

## Perintah Penting
- `hermes mnemosyne stats` : Melihat statistik working memory dan episodic memory.
- `hermes mnemosyne inspect "<kata kunci>"` : Mencari catatan memori masa lalu.
- `hermes mnemosyne sleep` : Menjalankan konsolidasi memori (working -> episodic).
- `hermes mnemosyne export --output memory_backup.json` : Backup seluruh memori avatar.

## Lokasi Database
Database tersimpan permanen di:
`~/.hermes/mnemosyne/data/mnemosyne.db` (atau `%LOCALAPPDATA%\hermes\mnemosyne\data\mnemosyne.db`).
