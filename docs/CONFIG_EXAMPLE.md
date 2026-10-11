# Contoh Konfigurasi (dengan Placeholder)

> **PENTING — KEAMANAN:** Jangan pernah menaruh API key / kredensial asli di
> kode, dokumentasi, atau file di dalam folder repo. Gunakan **placeholder**
> di bawah. Kredensial asli disimpan di **home directory user** (di luar repo),
> mis. `~/.hermes/config.yaml` atau `~/.hermes-avatar/`.

---

## 1. LLM & Provider (custom_providers Hermes)

Ini adalah format `custom_providers` di `~/.hermes/config.yaml`. Ganti nilai
placeholder dengan milikmu (jangan commit nilai asli).

```yaml
# ~/.hermes/config.yaml  (JANGAN di-commit ke repo)

model:
  default: YOUR_MODEL_NAME          # contoh: nama-model-anda
  provider: custom
  base_url: http://localhost:20128/v1
  api_key: YOUR_API_KEY             # contoh: sk-xxxx (JANGAN bocor)

custom_providers:
  - name: local
    base_url: http://localhost:20128/v1
    # keyless (tanpa api_key) jika server lokal tanpa auth

  - name: ollama
    base_url: http://localhost:11434/v1
    key_env: OLLAMA_API_KEY         # baca dari env, bukan hardcode

  - name: cloud
    base_url: https://api.example.com/v1
    api_key: YOUR_CLOUD_API_KEY     # placeholder — isi manual di mesin user
    model: YOUR_MODEL
```

---

## 2. Environment variable (opsional, multi-OS)

Simpan secret di env (tidak di-commit). Letakkan di file `.env` (sudah
di-`.gitignore`).

```bash
# .env  (JANGAN di-commit)

# macOS / Linux
export HERMES_DASHBOARD_SESSION_TOKEN=YOUR_TOKEN
export YOUR_PROVIDER_API_KEY=YOUR_KEY

# Windows (PowerShell)
# $env:HERMES_DASHBOARD_SESSION_TOKEN="YOUR_TOKEN"
```

---

## 3. Struktur state dir avatar (multi-OS)

App menyimpan state/kredensial di home directory user, di luar repo:

```
macOS / Linux : ~/.hermes-avatar/
Windows       : C:\Users\<user>\.hermes-avatar\
```

Isi (contoh):
```
~/.hermes-avatar/
├── session-token      # token WS (di-generate, bukan secret eksternal)
└── settings.json      # (nanti) config avatar — di luar repo
```

> Folder ini **tidak pernah** di-push ke GitHub karena berada di home
> directory, bukan di folder repo.

---

## 4. Aturan keamanan (selalu)

1. API key / kredensial → **home directory**, bukan folder repo.
2. Dokumentasi & kode → pakai **placeholder** (`YOUR_API_KEY`, `sk-...`).
3. `.gitignore` → pastikan `.env`, `*.local`, `settings.json` (di repo) terblokir.
4. Gunakan `safeStorage` (keychain OS) untuk secret di app (nanti di P2 final).

---

## 5. Catatan multi-OS

- Path home: gunakan `os.homedir()` (bukan hardcode `/Users/...`).
- Command: Windows pakai `hermes.cmd` (bukan `hermes`), spawn dengan `shell: true`.
- Port: `127.0.0.1` + port yang sama (9119 hermes, 20128 9Router) di semua OS.
- Keychain: macOS Keychain / Windows Credential Manager / Linux libsecret.
