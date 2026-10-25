---
name: kokoro-tts
description: "Kokoro TTS Engine CLI: check status, start/stop server, speak text from terminal."
version: 1.0.0
author: Hermes 3D Avatar
license: Apache-2.0
platforms: [windows, linux, macos]
metadata:
  hermes:
    tags: [tts, audio, speech, kokoro, voice, avatar]
prerequisites:
  commands: [kokoro]
---

# Kokoro TTS Engine

Gunakan perintah `kokoro` di terminal untuk mengelola layanan Kokoro-TTS lokal (OpenAI-compatible speech engine).

## Perintah CLI
- `kokoro status`: Memeriksa apakah server di port 8880 aktif dan model ONNX tersedia.
- `kokoro start`: Menyalakan server Kokoro di foreground.
- `kokoro start -d`: Menyalakan server Kokoro di background (daemon).
- `kokoro stop`: Menghentikan server Kokoro yang sedang aktif.
- `kokoro say "<teks>"`: Mengucapkan teks langsung melalui suara Kokoro.

## Endpoint API
- Local endpoint: `http://127.0.0.1:8880/v1/audio/speech`
- Health check: `http://127.0.0.1:8880/health`
