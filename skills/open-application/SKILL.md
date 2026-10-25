---
name: open-application
description: "Fast-path application launcher: open, list, and scan Windows installed applications."
version: 1.0.0
author: Hermes 3D Avatar
license: Apache-2.0
platforms: [windows]
metadata:
  hermes:
    tags: [apps, launcher, open, fast-path, windows]
prerequisites:
  commands: [app]
---

# Fast App Launcher

Gunakan perintah `app` di terminal untuk membuka aplikasi apa pun di Windows secara instan.

## Perintah CLI
- `app open <nama>`: Membuka aplikasi secara cepat (contoh: `app open discord`, `app open notepad`, `app open blender`).
- `app list`: Menampilkan daftar semua aplikasi terpasang yang telah dipelajari.
- `app scan`: Memindai ulang seluruh Start Menu Windows dan aplikasi bawaan.
- `app learn <nama> <path>`: Mendaftarkan file eksekusi aplikasi baru yang belum terdaftar.
