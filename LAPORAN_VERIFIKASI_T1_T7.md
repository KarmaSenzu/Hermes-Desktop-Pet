# 📑 LAPORAN AUDIT & VERIFIKASI TEKNIS T1–T7 (HARDENING SECURITY)
> **Proyek:** Hermes 3D Avatar (Desktop Pet)  
> **Tanggal Verifikasi:** 28 Oktober 2026  
> **Metode Pemeriksaan:** READ-ONLY Verification (Eksekusi Perintah Nyata, Pemeriksaan Baris Kode, & Automated Suite)  
> **Status Akhir Repositori:** Semua branch T1–T7 terisolasi bersih, tidak ada konflik, dan siap diintegrasikan.

---

## 📌 TABEL RINGKASAN VERDICT AKHIR

| Kode | Nama Branch | Commit Hash & Pesan | Verdict | Hal yang Belum Teruji Karena Butuh Aplikasi Berjalan |
|:---:|:---|:---|:---:|:---|
| **T1** | `fix/t1-bridge-auth` | `3ba90e9` fix(bridge): add bridge token authentication and manual prompt confirmation | **LULUS** | Klik interaktif fisik tombol pop-up pada ekstensi Chrome/Edge di browser nyata. |
| **T2** | `fix/t2-url-guard` | `db396d4` fix(main): add url guard to prevent router api key leakage to untrusted endpoints | **LULUS** | Respons koneksi live nyata saat 9Router port 20128 aktif di background. |
| **T3** | `fix/t3-runhermes` | `869ceb4` fix(main): validate CLI arguments in runHermes against cmd injection | **LULUS** | Eksekusi nyata `hermes skills install` terhadap repositori remote Hermes. |
| **T4** | `fix/t4-config-writer` | `1ce0439` fix(config): implement non-destructive YAML and env provider config updater | **LULUS** | Pergantian multi-provider dinamis saat `hermes serve` sedang membaca berkas secara paralel. |
| **T5** | `fix/t5-updater` | `cb54ace` fix(updater): secure in-app update download with checksum verification, URL guard, and safe PowerShell execution | **LULUS** | Pengunduhan rilis biner ZIP nyata dari release GitHub yang memiliki tag digest valid. |
| **T6** | `fix/t6-path-guard` | `6236d20` feat(security): implement path-guard with staged log-mode roots and MIME verification | **LULUS** | Verifikasi tekstur Live2D/VRM dari custom path di layar saat mode ENFORCE diaktifkan (`true`). |
| **T7** | `fix/t7-hardening` | `0da3404` feat(security): harden web-contents, permissions, token generation, and process restart | **LULUS** | Penangkapan input audio fisik mikrofon saat percakapan STT berlangsung di window pet. |

---

# BAGIAN 1: BUKTI COMMIT & DIFF STAT SEMUA BRANCH

### 1. `fix/t1-bridge-auth`
```text
$ git log --oneline main..fix/t1-bridge-auth
3ba90e9 fix(bridge): add bridge token authentication and manual prompt confirmation

$ git diff main...fix/t1-bridge-auth --stat
 avatar/src/main/bridge-server.js | 169 ++++++++++++++++++++++++++++----------
 avatar/src/main/bridge-token.js  |  20 +++++
 avatar/src/main/index.js         |   4 +-
 avatar/src/renderer/js/main.js   | 173 ++++++++++++++++++++++++++++++++-------
 extensions/chrome/README.md      |  19 +++++
 extensions/chrome/background.js  |  46 ++++++++++-
 extensions/chrome/popup.html     |  12 +++
 extensions/chrome/popup.js       |  68 ++++++++++++++-
 8 files changed, 434 insertions(+), 77 deletions(-)
```

### 2. `fix/t2-url-guard`
```text
$ git log --oneline main..fix/t2-url-guard
db396d4 fix(main): add url guard to prevent router api key leakage to untrusted endpoints

$ git diff main...fix/t2-url-guard --stat
 avatar/src/main/index.js     | 16 +++++++++++++---
 avatar/src/main/url-guard.js | 19 +++++++++++++++++++
 2 files changed, 32 insertions(+), 3 deletions(-)
```

### 3. `fix/t3-runhermes`
```text
$ git log --oneline main..fix/t3-runhermes
869ceb4 fix(main): validate CLI arguments in runHermes against cmd injection

$ git diff main...fix/t3-runhermes --stat
 avatar/src/main/index.js | 28 +++++++++++++++++++++++-----
 1 file changed, 23 insertions(+), 5 deletions(-)
```

### 4. `fix/t4-config-writer`
```text
$ git log --oneline main..fix/t4-config-writer
1ce0439 fix(config): implement non-destructive YAML and env provider config updater

$ git diff main...fix/t4-config-writer --stat
 avatar/package.json                |  11 ++-
 avatar/src/main/hermes-config.js   |  92 ++++++++++++++++++++
 avatar/src/main/index.js           | 166 +++++++++++++++++++------------------
 avatar/tests/hermes-config.test.js | 131 +++++++++++++++++++++++++++++
 4 files changed, 315 insertions(+), 85 deletions(-)
```

### 5. `fix/t5-updater`
```text
$ git log --oneline main..fix/t5-updater
cb54ace fix(updater): secure in-app update download with checksum verification, URL guard, and safe PowerShell execution

$ git diff main...fix/t5-updater --stat
 avatar/src/main/index.js | 126 +++++++++++++++++++++++++++++++++++++++++------
 1 file changed, 112 insertions(+), 14 deletions(-)
```

### 6. `fix/t6-path-guard`
```text
$ git log --oneline main..fix/t6-path-guard
6236d20 feat(security): implement path-guard with staged log-mode roots and MIME verification

$ git diff main...fix/t6-path-guard --stat
 avatar/src/main/index.js      | 86 ++++++++++++++++++++++++++++++++++++++++++-
 avatar/src/main/path-guard.js | 29 +++++++++++++++
 2 files changed, 113 insertions(+), 2 deletions(-)
```

### 7. `fix/t7-hardening`
```text
$ git log --oneline main..fix/t7-hardening
0da3404 feat(security): harden web-contents, permissions, token generation, and process restart

$ git diff main...fix/t7-hardening --stat
 avatar/src/main/index.js           | 16 +++++++++++-
 avatar/src/main/service-manager.js | 52 ++++++++++++++++++++++++++++++--------
 2 files changed, 56 insertions(+), 12 deletions(-)
```

---

# BAGIAN 2: HASIL VERIFIKASI MENDALAM PER TUGAS

## T1 (Branch: `fix/t1-bridge-auth`)

### a) Pengecekan Header CORS
```bash
$ git grep -n "Access-Control" avatar/src/main/bridge-server.js
# Output: (exit code 1 - KOSONG, tidak ada baris yang cocok)
```
**Verdict:** **LULUS**

### b) Nomor Baris Kontrol Keamanan di `avatar/src/main/bridge-server.js`
- `timingSafeEqual`: **Baris 7** (import) dan **Baris 30** (`return timingSafeEqual(bufClient, bufExpected)`)
- Header `x-hermes-bridge-token`: **Baris 75** (`const clientToken = req.headers['x-hermes-bridge-token']`)
- Cek `Origin`: **Baris 67–72** (`if (origin !== undefined && !ALLOWED_ORIGIN_RE.test(origin)) ... 403 Forbidden origin`)
- Cek `Host`: **Baris 59–64** (`if (host !== '127.0.0.1:9124' && host !== 'localhost:9124') ... 403 Forbidden host`)
- `415` (Unsupported Media Type): **Baris 94–98** (`if (!contentType.startsWith('application/json')) ... 415`)
- `413` (Payload Too Large > 64KB): **Baris 120–127** (`if (bodyLength > 64 * 1024) ... 413`)
- `429` (Rate limit: 6 req / 60s): **Baris 105–109** (`if (askTimestamps.length >= 6) ... 429`)
- `403` untuk `OPTIONS`: **Baris 52–56** (`if (req.method === 'OPTIONS') ... 403 Forbidden`)

**Verdict:** **LULUS**

### c) Handler `window.hermesAvatar.onWebPrompt` di `avatar/src/renderer/js/main.js`
**Potongan Kode Asli (Baris 3340–3514):**
```javascript
window.hermesAvatar.onWebPrompt?.((data) => {
  if (!data) return

  // 1. Buka jendela chat jika sedang tersembunyi
  if (chatSheet?.classList.contains('hidden')) {
    toggleChat()
  }

  const title = (data.title || 'Halaman Web').trim()
  const url = (data.url || '').trim()
  const text = (data.text || '').trim()
  const question = (data.prompt || 'Tolong jelaskan teks berikut:').trim()
  const preview = text.length > 280 ? text.slice(0, 280) + '…' : text

  // Emosi avatar: curious
  controller?.setExpression('curious')
  showSpeechBubble('Menerima permintaan dari browser web companion. Konfirmasi pengiriman? 🌐', 4000)

  // 2. Buat kartu konfirmasi menggunakan createElement + textContent (tanpa innerHTML dengan data mentah)
  const card = document.createElement('div')
  card.className = 'avatar assessment-card'

  const header = document.createElement('div')
  header.className = 'assessment-card-header'

  const badge = document.createElement('div')
  badge.className = 'assessment-badge'
  badge.textContent = '🌐 WEB COMPANION PROMPT'

  const pill = document.createElement('span')
  pill.className = 'assessment-type-pill'
  pill.textContent = 'Menunggu Konfirmasi'

  header.appendChild(badge)
  header.appendChild(pill)
  card.appendChild(header)

  // Sumber (title + url)
  const sourceDiv = document.createElement('div')
  sourceDiv.style.marginBottom = '8px'
  sourceDiv.style.fontSize = '12px'

  const sourceLabel = document.createElement('span')
  sourceLabel.style.color = '#94a3b8'
  sourceLabel.style.fontWeight = '600'
  sourceLabel.textContent = '📄 Sumber: '
  sourceDiv.appendChild(sourceLabel)

  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    const link = document.createElement('a')
    link.href = url
    link.target = '_blank'
    link.rel = 'noreferrer noopener'
    link.textContent = title || url
    link.style.color = '#38bdf8'
    link.style.textDecoration = 'underline'
    sourceDiv.appendChild(link)
  } else {
    const titleSpan = document.createElement('span')
    titleSpan.textContent = title
    titleSpan.style.color = '#38bdf8'
    sourceDiv.appendChild(titleSpan)
  }
  card.appendChild(sourceDiv)

  // Cuplikan teks (maks 280 karakter)
  if (preview) {
    const previewDiv = document.createElement('div')
    previewDiv.className = 'assessment-option-item'
    previewDiv.style.cursor = 'default'
    previewDiv.style.marginBottom = '8px'

    const previewContent = document.createElement('div')
    previewContent.className = 'assessment-option-desc'
    previewContent.style.fontStyle = 'italic'
    previewContent.textContent = `"${preview}"`

    previewDiv.appendChild(previewContent)
    card.appendChild(previewDiv)
  }

  // Pertanyaan / Prompt
  const questionDiv = document.createElement('div')
  questionDiv.className = 'assessment-prompt-text'
  questionDiv.style.marginBottom = '10px'

  const questionLabel = document.createElement('div')
  questionLabel.style.fontSize = '11px'
  questionLabel.style.color = '#94a3b8'
  questionLabel.style.marginBottom = '2px'
  questionLabel.textContent = '❓ Pertanyaan:'

  const questionContent = document.createElement('div')
  questionContent.textContent = question

  questionDiv.appendChild(questionLabel)
  questionDiv.appendChild(questionContent)
  card.appendChild(questionDiv)

  // Footer dengan tombol "Kirim ke Hermes" dan "Batal"
  const footer = document.createElement('div')
  footer.className = 'assessment-footer'

  const btnSend = document.createElement('button')
  btnSend.type = 'button'
  btnSend.className = 'assessment-execute-btn'
  btnSend.textContent = '🚀 Kirim ke Hermes'

  const btnCancel = document.createElement('button')
  btnCancel.type = 'button'
  btnCancel.className = 'assessment-preset-chip'
  btnCancel.style.padding = '7px 14px'
  btnCancel.textContent = '❌ Batal'

  footer.appendChild(btnSend)
  footer.appendChild(btnCancel)
  card.appendChild(footer)

  // Tambahkan kartu ke chat
  chatLog.appendChild(card)
  chatLog.scrollTop = chatLog.scrollHeight

  // Event handler tombol Batal
  btnCancel.addEventListener('click', () => {
    btnSend.disabled = true
    btnCancel.disabled = true
    pill.textContent = 'Dibatalkan'
    const statusText = document.createElement('span')
    statusText.className = 'assessment-status-text'
    statusText.textContent = 'Dibatalkan oleh pengguna.'
    footer.replaceChildren(statusText)
  })

  // Event handler tombol Kirim ke Hermes
  btnSend.addEventListener('click', async () => {
    btnSend.disabled = true
    btnCancel.disabled = true
    pill.textContent = 'Terkirim'
    const statusText = document.createElement('span')
    statusText.className = 'assessment-status-text'
    statusText.textContent = 'Mengirim ke Hermes...'
    footer.replaceChildren(statusText)

    if (!hermesReady) {
      log('avatar', '⚠️ **Hermes AI Daemon belum aktif di background.** Silakan periksa status koneksi di menu Pengaturan.')
      speak('Hermes belum terhubung, silakan nyalakan service di pengaturan.', 'neutral')
      return
    }

    setInputLocked(true)

    try {
      const promptPayload = `[PERTANYAAN DARI CHROME/EDGE EXTENSION (HERMES WEB COMPANION)]
Sumber Halaman: ${title} (${url})
Teks / Kutipan dari Web:
"""
${text}
"""

Instruksi / Pertanyaan Pengguna:
${question}

Panduan Format:
1. Berikan intisari singkat 1-2 kalimat di awal.
2. Rangkum penjelasan dan fakta-fakta kunci menjadi 3-4 poin/bullet penting (key takeaways) yang mudah dipahami.
3. Gunakan bahasa Indonesia yang santun, lugas, dan bersahabat.`

      const finalPrompt = await buildPrompt(promptPayload)
      await hermes.submitPrompt(finalPrompt)
    } catch (err) {
      log('avatar', `Gagal memproses pertanyaan web: ${err.message}`)
      setInputLocked(false)
    }
  })
})
```
- `hermes.submitPrompt` **HANYA** dipanggil di baris 3508 saat tombol `btnSend` diklik oleh user.
- Data input disematkan melalui `.textContent` dan `document.createElement`, tanpa menyentuh `innerHTML`.

**Verdict:** **LULUS**

### d) Hasil Pengujian Otomatis HTTP Bridge di Node.js (Skrip `/tmp`)
```text
[Bridge Server] Hermes Companion Bridge siap di http://127.0.0.1:9124
┌─────────┬──────────────────────────────────────────────────────┬────────────────┬────────────────┬────────────────────┬─────────┐
│ (index) │ Skenario                                             │ Harapan        │ Aktual         │ CallbackTerpanggil │ Status  │
├─────────┼──────────────────────────────────────────────────────┼────────────────┼────────────────┼────────────────────┼─────────┤
│ 0       │ 'tanpa token'                                        │ '401'          │ '401'          │ 0                  │ 'LULUS' │
│ 1       │ 'Origin https://evil.com + token benar'              │ '403'          │ '403'          │ 0                  │ 'LULUS' │
│ 2       │ 'Host: evil.com'                                     │ '403'          │ '403'          │ 0                  │ 'LULUS' │
│ 3       │ 'text/plain'                                         │ '415'          │ '415'          │ 0                  │ 'LULUS' │
│ 4       │ 'JSON valid 200'                                     │ '200 (cb 1x)'  │ '200 (cb 1x)'  │ 1                  │ 'LULUS' │
│ 5       │ 'OPTIONS 403'                                        │ '403'          │ '403'          │ 1                  │ 'LULUS' │
│ 6       │ 'body 100KB 413'                                     │ '413'          │ '413'          │ 1                  │ 'LULUS' │
│ 7       │ 'payload url javascript:alert(1) -> url dikosongkan' │ "200, url: ''" │ "200, url: ''" │ 2                  │ 'LULUS' │
│ 8       │ '7 request cepat -> yang ke-7 429'                   │ '429'          │ '429'          │ 5                  │ 'LULUS' │
└─────────┴──────────────────────────────────────────────────────┴────────────────┴────────────────┴────────────────────┴─────────┘
```
**Verdict:** **LULUS**

### e) Ekstensi Chrome Mengirim Header di SEMUA Fetch
**Potongan `extensions/chrome/background.js` (Baris 111–121 & 139–148):**
```javascript
// POST /api/ask (Baris 116-119)
const res = await fetch(`${AVATAR_BRIDGE_URL}/api/ask`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Hermes-Bridge-Token': token
  },
  body: JSON.stringify(payload)
})

// GET /api/ping (Baris 143-146)
const res = await fetch(`${AVATAR_BRIDGE_URL}/api/ping`, {
  method: 'GET',
  headers: {
    'X-Hermes-Bridge-Token': token
  },
  cache: 'no-store'
})
```
**Verdict:** **LULUS**

---

## T2 (Branch: `fix/t2-url-guard`)

### a) Grep Pola Lama `includes('20128')` / `includes('9router')`
```bash
$ git grep -n "includes('20128')" avatar/src/main ; git grep -n "includes('9router')" avatar/src/main
# Output: (exit code 1 - KOSONG di avatar/src/main)
```
*Catatan:* Pada `avatar/src/renderer/js/settings.js`, pengecekan string hanya dipakai untuk visual placeholder text box. Di proses Electron main tempat token/key dipasang, seluruhnya 100% menggunakan `isLocalRouterUrl`.

### b) Tabel Uji 8 Kasus `isLocalRouterUrl`
```text
┌─────────┬────────────────────────────────────┬──────────┬────────┬─────────┐
│ (index) │ Input                              │ Expected │ Actual │ Status  │
├─────────┼────────────────────────────────────┼──────────┼────────┼─────────┤
│ 0       │ 'http://127.0.0.1:20128/v1'        │ true     │ true   │ 'LULUS' │
│ 1       │ 'http://localhost:20128'           │ true     │ true   │ 'LULUS' │
│ 2       │ 'http://[::1]:20128/v1'            │ true     │ true   │ 'LULUS' │
│ 3       │ 'https://127.0.0.1:20128'          │ false    │ false  │ 'LULUS' │
│ 4       │ 'http://evil.com/?20128'           │ false    │ false  │ 'LULUS' │
│ 5       │ 'http://127.0.0.1:8080'            │ false    │ false  │ 'LULUS' │
│ 6       │ 'http://user:pass@127.0.0.1:20128' │ false    │ false  │ 'LULUS' │
│ 7       │ 'not-a-url'                        │ false    │ false  │ 'LULUS' │
└─────────┴────────────────────────────────────┴──────────┴────────┴─────────┘
```

### c) Pemanggilan `resolveRouterApiKey()` & Penjaganya
```bash
$ git grep -n "resolveRouterApiKey" avatar/src/main/index.js
avatar/src/main/index.js:24:  resolveRouterApiKey,
avatar/src/main/index.js:1361:        const rKey = await resolveRouterApiKey()
avatar/src/main/index.js:1465:        const rKey = await resolveRouterApiKey()
avatar/src/main/index.js:1614:    return await resolveRouterApiKey()
avatar/src/main/index.js:1632:        const rKey = await resolveRouterApiKey()
```
- **Baris 1359:** Dijaga `if (!effectiveKey && isLocalRouterUrl(target))`
- **Baris 1460–1463:** Dijaga `const isRouter = isLocalRouterUrl(provUrl); if (isRouter)`
- **Baris 1630:** Dijaga `if ((!effectiveKey || effectiveKey === 'no-key-required') && isLocalRouterUrl(targetUrl))`
- **Baris 1614:** Handler resmi `avatar:get-router-api-key` (dipanggil oleh Settings).

**Verdict:** **LULUS**

---

## T3 (Branch: `fix/t3-runhermes`)

### a) Fungsi `runHermes` Lengkap
```javascript
const SAFE_ARG = /^[A-Za-z0-9._:\/@+=-]{1,200}$/
const SAFE_QUERY = /^[A-Za-z0-9 ._-]{1,64}$/

// Helper: jalankan `hermes` CLI via execFile (dipakai set-model & install-skill).
function runHermes(args, timeout = 30000, queryIndex = -1) {
  return new Promise((resolve, reject) => {
    for (let i = 0; i < args.length; i++) {
      const a = String(args[i])
      if (!(i === queryIndex ? SAFE_QUERY : SAFE_ARG).test(a)) {
        return reject(new Error(`Argumen ke-${i} tidak valid untuk hermes CLI`))
      }
    }
    const hermesCmd = resolveHermesCmd()
    const needShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(hermesCmd)
    const cmd = needShell ? `"${hermesCmd}"` : hermesCmd
    const finalArgs = needShell ? args.map((a, i) => (i === queryIndex ? `"${a}"` : String(a))) : args.map(String)
    execFile(cmd, finalArgs, { timeout, shell: needShell, env: process.env }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.trim() || err.message))
      else resolve(stdout?.trim() || '')
    })
  })
}
```

### b) Daftar Pemanggil `runHermes`
```text
avatar/src/main/index.js:1688:      await runHermes(['config', 'set', 'model.default', modelName])
avatar/src/main/index.js:1689:      await runHermes(['config', 'set', 'model.provider', 'custom'])
avatar/src/main/index.js:1852:    const out = await runHermes(['skills', 'install', id], 60000)
avatar/src/main/index.js:1867:      const out = await runHermes(['skills', 'search', q, '--json'], 60000, 2)
avatar/src/main/index.js:1870:    const out = await runHermes(['skills', 'browse', '--json'], 60000)
```

### c) Hasil Uji Regex Validator
```text
┌─────────┬───────────────────────────────┬──────────────────────┬────────────────────┐
│ (index) │ Input                         │ SAFE_ARG (Non-Query) │ SAFE_QUERY (Query) │
├─────────┼───────────────────────────────┼──────────────────────┼────────────────────┤
│ 0       │ 'a & calc'                    │ false                │ false              │
│ 1       │ 'x|y'                         │ false                │ false              │
│ 2       │ '$(id)'                       │ false                │ false              │
│ 3       │ 'pdf'                         │ true                 │ true               │
│ 4       │ 'oc-prod/rap/deepseek-v4-pro' │ true                 │ false              │
│ 5       │ 'a b'                         │ false                │ true               │
└─────────┴───────────────────────────────┴──────────────────────┴────────────────────┘
```
**Verdict:** **LULUS**

---

## T4 (Branch: `fix/t4-config-writer`)

### a) Keberadaan `url-guard.js` & Sumber `parseHttpUrl`
```bash
$ git ls-tree HEAD avatar/src/main/url-guard.js
# Output: (exit code 0 - KOSONG, file tidak ada di branch ini)
```
- **Sumber:** `parseHttpUrl` diekspor secara mandiri di [avatar/src/main/hermes-config.js](file:///c:/Users/FoxPro/Pictures/Project%20AMATI%20TIRU%20MODIFIKASI%20%28%20HERMES%203d%29/hermes-3d-avatar/avatar/src/main/hermes-config.js) baris 7–16:
```javascript
export function parseHttpUrl(raw) {
  try {
    const u = new URL(String(raw).trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (u.username || u.password) return null
    return u
  } catch {
    return null
  }
}
```

### b) Hasil Eksekusi `npm test` & 7 Skenario Tes
```text
$ cd avatar && npm test

 RUN  v2.1.9 C:/Users/FoxPro/Pictures/Project AMATI TIRU MODIFIKASI ( HERMES 3d)/hermes-3d-avatar/avatar

 ✓ tests/hermes-config.test.js (7 tests) 59ms

 Test Files  1 passed (1)
      Tests  7 passed (7)
   Duration  594ms
```
**7 Judul Tes Asli:**
1. `1) config dengan komentar + providers {A,B} + custom_providers [A,B]; upsert C -> A,B,C ada; komentar tetap ada`
2. `2) upsert A (sudah ada) -> terupdate, tanpa duplikat`
3. `3) model "x\nhacked: true" -> throw`
4. `4) name berisi "'" tidak merusak YAML (hasil tetap bisa di-parse ulang)`
5. `5) setEnvVar dengan nilai "a$&b" -> hasil mengandung "a$&b" persis`
6. `6) setEnvVar: key lain tidak berubah`
7. `7) YAML rusak -> throw dan teks input tidak berubah`

### c) `updateHermesProviderConfig` Bebas Regex Replace pada Providers
Pada baris 1528–1549 `avatar/src/main/index.js`, seluruh pembaruan provider dilakukan via:
```javascript
const updatedCfg = applyProviderConfig(cfg, {
  name: provName,
  baseUrl: provUrl,
  apiKey: keyVal,
  model: effectiveModel
})
```
**Verdict:** **LULUS**

---

## T5 (Branch: `fix/t5-updater`)

### a) Validasi Nama, URL, Host, dan Checksum (Fail-Closed)
**Potongan Kode [avatar/src/main/index.js](file:///c:/Users/FoxPro/Pictures/Project%20AMATI%20TIRU%20MODIFIKASI%20%28%20HERMES%203d%29/hermes-3d-avatar/avatar/src/main/index.js) (Baris 1168–1262):**
```javascript
// 1. Validasi nama asset
if (
  !filename ||
  typeof filename !== 'string' ||
  !/^[A-Za-z0-9._ -]{1,120}$/.test(filename) ||
  filename.includes('..') ||
  !/\.(exe|dmg|zip|AppImage)$/i.test(filename)
) {
  return { ok: false, error: 'Nama asset tidak valid' }
}

// 2. Validasi URL rilis
if (
  assetUrlObj.protocol !== 'https:' ||
  assetUrlObj.hostname !== 'github.com' ||
  !assetUrlObj.pathname.startsWith('/KarmaSenzu/Hermes-Desktop-Pet/releases/download/')
) {
  return { ok: false, error: 'URL download tidak diizinkan' }
}

// 3. Validasi Redirect Host
const allowedHosts = [
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com'
]
if (!allowedHosts.includes(respUrlObj.hostname)) {
  throw new Error(`Host unduhan tidak diizinkan: ${respUrlObj.hostname}`)
}

// 4. Validasi Digest (FAIL-CLOSED)
const computedDigest = `sha256:${hash.digest('hex').toLowerCase()}`
const expectedDigest = asset.digest ? String(asset.digest).trim().toLowerCase() : ''
const manualUrl = lastRelease?.releaseUrl || `https://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases`

if (!expectedDigest || !expectedDigest.startsWith('sha256:') || computedDigest !== expectedDigest) {
  try {
    await rm(targetFilePath, { force: true })
    await rm(tempDir, { recursive: true, force: true })
  } catch (_) {}
  return {
    ok: false,
    error: 'Checksum tidak tersedia/tidak cocok',
    manualUrl
  }
}
```

### b) Pengecekan `ExecutionPolicy` dan `LiteralPath`
```bash
$ git grep -n "ExecutionPolicy" avatar/src/main/index.js
# Output: (exit code 1 - KOSONG, tidak ada baris yang cocok)

$ git grep -n "LiteralPath" avatar/src/main/index.js
avatar/src/main/index.js:1313: `Expand-Archive -LiteralPath '${psq(targetFilePath)}' -DestinationPath '${psq(stagingDir)}' -Force`
avatar/src/main/index.js:1324: const psCopyCmd = `$staging = '${psq(stagingDir)}'; $appDir = '${psq(destDir)}'; $inner = Get-ChildItem -LiteralPath $staging | Where-Object { $_.PSIsContainer -and (Test-Path -LiteralPath (Join-Path $_.FullName 'Hermes Desktop Pet.exe')) } | Select-Object -First 1; $src = if ($inner) { $inner.FullName } else { $staging }; Get-ChildItem -LiteralPath $src | Copy-Item -Destination $appDir -Recurse -Force`
```
**Verdict:** **LULUS**

---

## T6 (Branch: `fix/t6-path-guard`)

### a) Nilai `ENFORCE` di `path-guard.js`
Dari baris 4 [avatar/src/main/path-guard.js](file:///c:/Users/FoxPro/Pictures/Project%20AMATI%20TIRU%20MODIFIKASI%20%28%20HERMES%203d%29/hermes-3d-avatar/avatar/src/main/path-guard.js):
```javascript
export const ENFORCE = false
```

### b) Pemanggil `approveRoot` dan `isPathAllowed`
```bash
$ git grep -n "approveRoot(" avatar/src/main ; git grep -n "isPathAllowed(" avatar/src/main
avatar/src/main/index.js:489:  approveRoot(dirname(resolvedPath))
avatar/src/main/index.js:664:  approveRoot(dirname(chosenPath))
avatar/src/main/index.js:680:    approveRoot(dirname(fp))
avatar/src/main/index.js:713:          approveRoot(stats.isDirectory() ? val : dirname(val))
avatar/src/main/index.js:729:            approveRoot(dirname(t.path))
avatar/src/main/index.js:738:      approveRoot(dirname(defaultModel))
avatar/src/main/index.js:895:    approveRoot(isDir ? chosenPath : dirname(chosenPath))
avatar/src/main/path-guard.js:8:export function approveRoot(p) {
avatar/src/main/index.js:2450:    if (!isPathAllowed(targetPath, getFixedRoots())) {
avatar/src/main/index.js:2546:      if (!isPathAllowed(filePath, getFixedRoots())) {
avatar/src/main/path-guard.js:23:export function isPathAllowed(target, fixedRoots = []) {
```
- `isPathAllowed` dipanggil di:
  - **Baris 2450:** di dalam handler IPC `avatar:read-model`
  - **Baris 2546:** di dalam custom scheme handler `protocol.handle('model', ...)`
Kedua endpoint pemuatan model terproteksi.

**Verdict:** **LULUS**

---

## T7 (Branch: `fix/t7-hardening`)

### a) Pengecekan `Stop-Process` dan `Math.random`
```bash
$ git grep -n "Stop-Process" avatar/src/main
# Output: (exit code 1 - KOSONG di avatar/src/main)

$ git grep -n "Math.random" avatar/src/main/service-manager.js
# Output: (exit code 1 - KOSONG di avatar/src/main/service-manager.js)
```

### b) Keberadaan Handler WebContents & Permission di `avatar/src/main/index.js`
```bash
$ git grep -n "setWindowOpenHandler" avatar/src/main/index.js ; git grep -n "will-navigate" avatar/src/main/index.js ; git grep -n "setPermissionRequestHandler" avatar/src/main/index.js ; git grep -n "setPermissionCheckHandler" avatar/src/main/index.js
avatar/src/main/index.js:2492:  wc.setWindowOpenHandler(({ url }) => {
avatar/src/main/index.js:2496:  wc.on('will-navigate', (e, url) => {
avatar/src/main/index.js:2504:  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'))
avatar/src/main/index.js:2505:  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media')
```

### c) Fungsi `restartHermes` Lengkap di `avatar/src/main/service-manager.js`
```javascript
async function restartHermes() {
  const existing = children.find((c) => c.name === 'hermes')
  if (!existing || !existing.child || typeof existing.child.pid !== 'number') {
    return {
      ok: false,
      already: true,
      error: 'Hermes dijalankan di luar aplikasi. Restart manual diperlukan agar konfigurasi baru terbaca.'
    }
  }

  const child = existing.child
  const pid = child.pid

  const idx = children.indexOf(existing)
  if (idx >= 0) children.splice(idx, 1)

  await new Promise((resolve) => {
    let timer = null
    const onExit = () => {
      if (timer) clearTimeout(timer)
      resolve()
    }
    timer = setTimeout(() => {
      child.removeListener('exit', onExit)
      resolve()
    }, 5000)

    if (child.exitCode !== null || child.killed) {
      clearTimeout(timer)
      return resolve()
    }

    child.once('exit', onExit)

    if (process.platform === 'win32') {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => {})
    } else {
      try {
        child.kill('SIGTERM')
      } catch (_) {}
    }
  })

  return await startHermes()
}
```
**Verdict:** **LULUS**

---

# BAGIAN 3: ROADMAP & PERSIAPAN ANTREAN SELANJUTNYA (T8–T14)

Setelah paket T1–T7 ini lulus verifikasi, berikut adalah urutan pengerjaan teknis berikutnya:

| Kode | Nama Pekerjaan | Rencana Desain Teknis |
|:---:|:---|:---|
| **T8** | `secureHandle` & Split Preload | Membungkus semua handler `ipcMain.handle` dengan validasi `senderFrame.url`. Memisahkan preload menjadi `preload/avatar.js` (minimal hanya emosi & chat) dan `preload/settings.js` (pengaturan sistem). |
| **T9** | Whitelist App ID & Enum Actions | Mengganti `run-in-terminal` dan `launch-app` dengan enum action terbatas dan daftar aplikasi terverifikasi dari `apps_cache.json`. Mencegah arbitrary shell command execution. |
| **T10** | Content Security Policy (CSP) | Menerapkan meta tag CSP bertahap pada `index.html`, `launcher.html`, dan `settings.html` guna mencegah XSS dan eksekusi skrip inline yang tidak sah. |
| **T11** | Upgrade Electron & Evaluasi `node:sqlite` | Upgrade minor/major Electron ke versi yang menambal kerentanan ASAR & konteks isolasi, serta verifikasi dukungan bawaan `node:sqlite`. |
| **T12** | Tuning Performa Desktop Pet | Pembatasan `maxFPS` render WebGL/Pixi saat idle, resolusi tekstur dinamis, pemanggilan `destroy()` WebGL yang tepat, dan refaktor jendela settings agar tidak memakan GPU saat di-hide. |
| **T13** | CI Pipeline Pull Request | Menambahkan GitHub Actions workflow untuk otomatisasi `npm run build`, `npm test`, dan `npm audit --omit=dev`. |
| **T14** | Modularisasi Monolitik Domain | Memecah `settings.js` (~4.200 baris), `main.js` (~3.400 baris), dan `index.js` (~2.500 baris) ke dalam modul-modul independen per domain fitur tanpa mengubah antarmuka API. |
