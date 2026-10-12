import { app, BrowserWindow, ipcMain, protocol, dialog, screen, safeStorage } from 'electron'
import { join, extname } from 'path'
import { readFile, writeFile, mkdir, rm } from 'fs/promises'
import { homedir } from 'os'
import http from 'http'
import https from 'https'
import { execFile } from 'child_process'
import { startAllServices, stopAllServices, SESSION_TOKEN, isPortOpen, ROUTER_PORT, HERMES_PORT } from './service-manager.js'
import { connectGateway, disconnectGateway, request as gatewayRequest, isGatewayConnected } from './hermes-gateway.js'
import { registerShortcuts, unregisterShortcuts, getShortcutList, updateShortcut } from './shortcuts.js'

/**
 * Main process — Hermes 3D Avatar
 * Membuat window desktop pet: transparan, always-on-top, frameless.
 *
 * Arsitektur window:
 *  - `launcher` : window kecil pertama untuk pilih model + start.
 *  - `avatar`   : window desktop pet (transparan) yang menampilkan avatar 3D.
 */

let launcherWindow = null
let avatarWindow = null

// --- Animasi "DVD bounce" (fitur, bukan otomatis) ---
// Window diam secara default. Animasi DVD hanya jalan saat di-trigger manual
// (tombol di UI), berjalan beberapa detik lalu berhenti kembali.
let motionTimer = null
let motionStopAt = 0
let velocity = { x: 0.6, y: 0.45 }

const DVD_BOUNCE_DURATION_MS = 5000 // jalan 5 detik lalu diam

function runDvdBounce() {
  motionStopAt = Date.now() + DVD_BOUNCE_DURATION_MS
  if (motionTimer) return // sudah jalan
  motionTimer = setInterval(() => {
    if (!avatarWindow || avatarWindow.isDestroyed()) {
      stopMotion()
      return
    }
    // Berhenti setelah durasi habis.
    if (Date.now() >= motionStopAt) {
      stopMotion()
      return
    }

    const b = avatarWindow.getBounds()
    const { workArea } = screen.getPrimaryDisplay()

    let nx = b.x + velocity.x
    let ny = b.y + velocity.y

    if (nx <= workArea.x || nx + b.width >= workArea.x + workArea.width) {
      velocity.x *= -1
      nx = b.x + velocity.x
    }
    if (ny <= workArea.y || ny + b.height >= workArea.y + workArea.height) {
      velocity.y *= -1
      ny = b.y + velocity.y
    }

    avatarWindow.setPosition(Math.round(nx), Math.round(ny))
  }, 16)
}

function stopMotion() {
  if (motionTimer) {
    clearInterval(motionTimer)
    motionTimer = null
  }
}

function stopAutoDodge() {
  if (motionTimer) {
    clearInterval(motionTimer)
    motionTimer = null
  }
}

function createLauncherWindow() {
  launcherWindow = new BrowserWindow({
    width: 720,
    height: 560,
    resizable: true,
    frame: true,
    title: 'Hermes 3D Avatar — Pengaturan',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false
    }
  })

  // electron-vite: dev pakai dev server, prod pakai file hasil build.
  if (process.env['ELECTRON_RENDERER_URL']) {
    launcherWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/settings.html`)
  } else {
    launcherWindow.loadFile(join(__dirname, '../renderer/settings.html'))
  }

  launcherWindow.on('closed', () => {
    launcherWindow = null
  })
}

function createAvatarWindow(modelPath) {
  avatarWindow = new BrowserWindow({
    width: 320,
    height: 480,
    transparent: true, // kunci desktop pet
    frame: false, // frameless → kita buat drag manual
    hasShadow: false, // hindari bayangan kotak di sekitar karakter
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true, // user tetap bisa resize manual
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false
    }
  })

  // macOS: tampil di semua workspace agar selalu "menemani" user.
  if (process.platform === 'darwin') {
    avatarWindow.setAlwaysOnTop(true, 'floating')
    avatarWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  if (process.env['ELECTRON_RENDERER_URL']) {
    avatarWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/index.html`)
  } else {
    avatarWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Kirim path model ke renderer setelah siap (renderer yang baca via read-model).
  avatarWindow.webContents.on('did-finish-load', () => {
    avatarWindow.webContents.send('avatar:load-model', modelPath)
  })

  avatarWindow.on('closed', () => {
    avatarWindow = null
    stopMotion()
  })
}

// --- Global shortcut (dari modul shortcuts.js, bisa di-custom user) ---
function sendToAvatar(channel, payload) {
  if (avatarWindow && !avatarWindow.isDestroyed()) {
    avatarWindow.webContents.send(channel, payload)
  }
}

function registerGlobalShortcuts() {
  registerShortcuts((id) => {
    if (id === 'toggle-chat') {
      sendToAvatar('avatar:shortcut', { action: 'toggle-chat' })
    } else if (id === 'toggle-mic') {
      sendToAvatar('avatar:shortcut', { action: 'toggle-mic' })
    } else if (id === 'open-settings') {
      if (launcherWindow && !launcherWindow.isDestroyed()) {
        launcherWindow.show()
        launcherWindow.focus()
      } else {
        createLauncherWindow()
      }
    }
  })
}

function unregisterGlobalShortcuts() {
  unregisterShortcuts()
}

// IPC: daftar shortcut (untuk settings panel).
ipcMain.handle('avatar:shortcuts', () => {
  return getShortcutList()
})

// IPC: ubah kombinasi shortcut (custom user).
ipcMain.handle('avatar:set-shortcut', (_event, id, accel) => {
  try {
    const list = updateShortcut(id, accel)
    // Re-register agar perubahan langsung aktif.
    registerGlobalShortcuts()
    return { ok: true, list }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: launcher → main → buka avatar window dengan model terpilih.
ipcMain.handle('avatar:start', (_event, modelPath) => {
  if (avatarWindow && !avatarWindow.isDestroyed()) {
    avatarWindow.focus()
    return { ok: true, reused: true }
  }
  createAvatarWindow(modelPath)
  if (launcherWindow) launcherWindow.hide()
  return { ok: true, reused: false }
})

// IPC: avatar window bisa minta fokus/drag via OS-native (drag region).
ipcMain.handle('avatar:close', () => {
  if (avatarWindow) avatarWindow.close()
  if (launcherWindow && !launcherWindow.isDestroyed()) launcherWindow.show()
})

// IPC: trigger animasi DVD bounce (fitur/emote).
ipcMain.handle('avatar:dvd-bounce', () => {
  runDvdBounce()
  return { ok: true }
})

// IPC: path model default (dipakai launcher untuk pre-select).
ipcMain.handle('avatar:default-model', () => {
  return join(__dirname, '../../assets/models/default.vrm')
})

// IPC: buka dialog pilih file model (native Finder/Explorer).
// Mengembalikan path file yang dipilih, atau null jika batal.
ipcMain.handle('avatar:pick-model', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Pilih model 3D',
    properties: ['openFile'],
    filters: [
      { name: 'Model 3D', extensions: ['vrm', 'glb', 'gltf', 'pmx', 'pmd', 'fbx'] },
      { name: 'Semua file', extensions: ['*'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// IPC: token Hermes gateway — pakai SESSION_TOKEN dari service-manager
// (konsisten antara avatar & hermes serve yang di-spawn otomatis).
ipcMain.handle('avatar:hermes-config', () => {
  return {
    wsUrl: process.env['HERMES_WS_URL'] || 'ws://127.0.0.1:9119/api/ws',
    token: SESSION_TOKEN
  }
})

// IPC: status service (9Router & hermes) — untuk settings panel.
ipcMain.handle('avatar:service-status', async () => {
  const router = await isPortOpen(ROUTER_PORT)
  const hermes = await isPortOpen(HERMES_PORT)
  return { router, hermes }
})

// IPC: RPC config/model ke Hermes (shared gateway) — untuk LLM section.
ipcMain.handle('avatar:rpc', async (_event, method, params) => {
  try {
    if (!isGatewayConnected()) {
      await connectGateway(SESSION_TOKEN)
    }
    const result = await gatewayRequest(method, params || {})
    return { ok: true, result }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: tambah skill custom → tulis SKILL.md ke ~/.hermes/skills/<category>/<name>/.
ipcMain.handle('avatar:add-skill', async (_event, { name, category, content }) => {
  try {
    if (!name || !content) {
      return { ok: false, error: 'Nama & isi skill wajib diisi.' }
    }
    // Sanitasi nama & kategori (hindari path traversal).
    const safeName = String(name).replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+/, '')
    const safeCat = (category || 'general').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+/, '') || 'general'
    if (!safeName) return { ok: false, error: 'Nama skill tidak valid.' }

    const skillsDir = join(homedir(), '.hermes', 'skills', safeCat, safeName)
    await mkdir(skillsDir, { recursive: true })

    // Buat SKILL.md dengan frontmatter minimal.
    const frontmatter = `---\nname: ${safeName}\ndescription: ${safeName}\n---\n\n`
    await writeFile(join(skillsDir, 'SKILL.md'), frontmatter + String(content), 'utf8')

    return { ok: true, path: skillsDir }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: hapus skill custom → hapus folder ~/.hermes/skills/<category>/<name>.
ipcMain.handle('avatar:delete-skill', async (_event, { name, category }) => {
  try {
    const safeName = String(name || '').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+/, '')
    const safeCat = (category || 'general').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+/, '') || 'general'
    if (!safeName) return { ok: false, error: 'Nama skill tidak valid.' }

    const skillsDir = join(homedir(), '.hermes', 'skills', safeCat, safeName)
    await rm(skillsDir, { recursive: true, force: true })

    return { ok: true, path: skillsDir }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: tes koneksi model (chat completion sungguhan ke provider).
// Kirim request "ping" ke model → verifikasi model benar-benar berfungsi.
ipcMain.handle('avatar:test-connection', async (_event, url, model, apiKey) => {
  try {
    const target = String(url || '').trim()
    const modelName = String(model || '').trim()
    if (!target) return { ok: false, error: 'URL kosong.' }
    if (!modelName) return { ok: false, error: 'Model kosong.' }

    const base = target.replace(/\/+$/, '')
    const endpoint = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`
    const u = new URL(endpoint)
    const mod = u.protocol === 'https:' ? https : http

    const body = JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 5
    })

    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

    return await new Promise((resolve) => {
      const req = mod.request(u, { method: 'POST', headers, timeout: 15000 }, (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true, status: res.statusCode, reachable: true })
          } else {
            // 401/404/500 dll → model gagal.
            let msg = `HTTP ${res.statusCode}`
            try {
              const j = JSON.parse(data)
              if (j.error?.message) msg = j.error.message
            } catch { /* ignore */ }
            resolve({ ok: false, status: res.statusCode, error: msg })
          }
        })
      })
      req.on('error', (err) => resolve({ ok: false, error: err?.message || 'Tidak dapat terhubung' }))
      req.on('timeout', () => {
        req.destroy()
        resolve({ ok: false, error: 'Timeout' })
      })
      req.write(body)
      req.end()
    })
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// Helper: jalankan `hermes` CLI via execFile (dipakai set-model & install-skill).
function runHermes(args, timeout = 30000) {
  const hermesCmd = process.platform === 'win32' ? 'hermes.cmd' : 'hermes'
  return new Promise((resolve, reject) => {
    execFile(hermesCmd, args, { timeout }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.trim() || err.message))
      else resolve(stdout?.trim() || '')
    })
  })
}

// IPC: set model aktif via `hermes config set` (mekanisme resmi, pasti benar).
ipcMain.handle('avatar:set-model', async (_event, model) => {
  try {
    const modelName = String(model || '').trim()
    if (!modelName) return { ok: false, error: 'Model kosong.' }

    await runHermes(['config', 'set', 'model.default', modelName])
    await runHermes(['config', 'set', 'model.provider', 'custom'])

    return { ok: true, model: modelName }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: set TTS config (voice) ke Hermes — tulis config.yaml langsung.
// Catatan Hermes: `config.set` RPC TIDAK dukung key tts.*, jadi edit file langsung.
ipcMain.handle('avatar:set-tts-config', async (_event, { voice }) => {
  try {
    if (!voice) return { ok: true }

    const cfgPath = join(homedir(), '.hermes', 'config.yaml')
    let cfg = await readFile(cfgPath, 'utf8')

    // Pastikan blok tts.edge.voice ada (update atau sisipkan).
    if (/^tts:\s*$/m.test(cfg)) {
      // Update/replace tts.edge.voice dalam blok tts.
      cfg = updateYamlNested(cfg, 'tts', 'edge', 'voice', voice)
    } else {
      // Tambah blok tts di akhir.
      cfg += `\ntts:\n  edge:\n    voice: ${voice}\n`
    }

    await writeFile(cfgPath, cfg, 'utf8')
    return { ok: true, voice }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: set STT config (model + bahasa) — tulis config.yaml langsung.
ipcMain.handle('avatar:set-stt-config', async (_event, { model, language }) => {
  try {
    const cfgPath = join(homedir(), '.hermes', 'config.yaml')
    let cfg = await readFile(cfgPath, 'utf8')

    if (!/^stt:\s*$/m.test(cfg)) {
      cfg += '\nstt:\n  local:\n    model: base\n    language: ""\n'
    }
    if (model) cfg = updateYamlNested(cfg, 'stt', 'local', 'model', model)
    if (language) cfg = updateYamlNested(cfg, 'stt', 'local', 'language', language)

    await writeFile(cfgPath, cfg, 'utf8')
    return { ok: true, model, language }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// Helper sederhana: update nested key (section > sub > key) di YAML.
function updateYamlNested(yaml, section, sub, key, value) {  const lines = yaml.split('\n')
  let inSection = false
  let inSub = false
  let updated = false
  const out = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed === `${section}:`) {
      inSection = true
      inSub = false
      out.push(line)
      continue
    }
    // Keluar section jika ketemu key top-level baru.
    if (inSection && /^[a-zA-Z_]/.test(trimmed) && !line.startsWith(' ') && trimmed !== `${section}:`) {
      inSection = false
      inSub = false
    }
    if (inSection && trimmed === `${sub}:`) {
      inSub = true
      out.push(line)
      continue
    }
    // Keluar sub jika ketemu indentasi sama dengan sub (2 spasi) tapi bukan key.
    if (inSub && line.startsWith('  ') && !line.startsWith('    ') && !line.startsWith(`  ${sub}:`)) {
      inSub = false
    }
    // Update key dalam sub.
    if (inSub && trimmed.startsWith(`${key}:`)) {
      out.push(`    ${key}: ${value}`)
      updated = true
      continue
    }
    out.push(line)
  }

  // Jika sub/key belum ada, tambahkan ke akhir section.
  if (!updated) {
    // Cari posisi section, sisipkan sub+key.
    const sectionIdx = out.findIndex((l) => l.trim() === `${section}:`)
    if (sectionIdx >= 0) {
      out.splice(sectionIdx + 1, 0, `  ${sub}:`, `    ${key}: ${value}`)
    }
  }

  return out.join('\n')
}

// IPC: install skill dari hub → `hermes skills install <skill-id>`.
ipcMain.handle('avatar:install-skill', async (_event, skillId) => {
  try {
    const id = String(skillId || '').trim()
    if (!id) return { ok: false, error: 'Skill ID kosong.' }

    const out = await runHermes(['skills', 'install', id], 60000)
    return { ok: true, output: out }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: browse/search skill di hub → `hermes skills browse --json` (atau search).
ipcMain.handle('avatar:browse-skills', async (_event, query) => {
  try {
    const q = String(query || '').trim()
    const args = q ? ['skills', 'search', q, '--json'] : ['skills', 'browse', '--json']
    const out = await runHermes(args, 60000)
    return { ok: true, output: out }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: encrypt secret (API key) via safeStorage → base64.
ipcMain.handle('avatar:encrypt-secret', (_event, plaintext) => {
  try {
    if (!plaintext) return { ok: true, value: '' }
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: 'safeStorage tidak tersedia di sistem ini.' }
    }
    const buf = safeStorage.encryptString(String(plaintext))
    return { ok: true, value: buf.toString('base64') }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: decrypt secret (base64) via safeStorage → plaintext.
ipcMain.handle('avatar:decrypt-secret', (_event, encrypted) => {
  try {
    if (!encrypted) return { ok: true, value: '' }
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: 'safeStorage tidak tersedia di sistem ini.' }
    }
    const buf = Buffer.from(String(encrypted), 'base64')
    return { ok: true, value: safeStorage.decryptString(buf) }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: pilih file aplikasi (native dialog) → path.
ipcMain.handle('avatar:pick-app', async () => {  const filters = process.platform === 'darwin'
    ? [{ name: 'Aplikasi', extensions: ['app'] }]
    : process.platform === 'win32'
      ? [{ name: 'Aplikasi', extensions: ['exe', 'lnk'] }]
      : [{ name: 'Aplikasi', extensions: ['desktop'] }]

  const result = await dialog.showOpenDialog({
    title: 'Pilih aplikasi',
    properties: ['openFile'],
    filters
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// IPC: ambil icon aplikasi (NativeImage → data URL PNG).
ipcMain.handle('avatar:app-icon', async (_event, filePath) => {
  try {
    const icon = await app.getFileIcon(String(filePath), { size: 'normal' })
    if (!icon || icon.isEmpty()) return { ok: false, error: 'Icon tidak ditemukan' }
    const png = icon.toDataURL()
    return { ok: true, dataUrl: png }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: pilih file animasi (native dialog, filter GLB/VMD).
ipcMain.handle('avatar:pick-animation', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Pilih file animasi',
    properties: ['openFile'],
    filters: [
      { name: 'Animasi', extensions: ['glb', 'gltf', 'vmd'] },
      { name: 'Semua file', extensions: ['*'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// IPC: TTS — jalur utama memakai endpoint /api/audio/speak milik Hermes
// (dashboard backend, provider edge-tts Hermes yang terbukti stabil).
// Endpoint Bing lama yang dipakai msedge-tts sering menolak (HTTP 403),
// jadi msedge-tts hanya dipakai sebagai fallback bila Hermes tidak hidup.
function resolveTtsUrl() {
  const wsUrl = process.env['HERMES_WS_URL'] || 'ws://127.0.0.1:9119/api/ws'
  try {
    const u = new URL(wsUrl)
    u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:'
    u.pathname = '/api/audio/speak'
    u.search = ''
    u.hash = ''
    return u.toString()
  } catch {
    return 'http://127.0.0.1:9119/api/audio/speak'
  }
}

ipcMain.handle('avatar:tts', async (_event, text, voice) => {
  const token = SESSION_TOKEN
  const ttsUrl = resolveTtsUrl()

  // 1) Jalur utama: endpoint TTS Hermes.
  try {
    const resp = await fetch(ttsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hermes-Session-Token': token
      },
      body: JSON.stringify({ text: String(text), voice: voice || 'id-ID-GadisNeural' })
    })
    if (resp.ok) {
      const data = await resp.json()
      if (data && data.ok && data.data_url) {
        return {
          ok: true,
          dataUrl: data.data_url,
          mimeType: data.mime_type || 'audio/mpeg'
        }
      }
      return {
        ok: false,
        error: `Hermes TTS endpoint error (${resp.status}): ${JSON.stringify(data)}`
      }
    }
    return { ok: false, error: `Hermes TTS endpoint HTTP ${resp.status}` }
  } catch {
    // Hermes tidak terjangkau → jatuh ke fallback msedge-tts di bawah.
  }

  // 2) Fallback: msedge-tts langsung (butuh ws/stream/Buffer Node).
  try {
    const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts')
    const tts = new MsEdgeTTS()
    await tts.setMetadata(voice || 'id-ID-GadisNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)

    const stream = tts.toStream(String(text))
    const chunks = []
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk))
    }
    const buffer = Buffer.concat(chunks)
    return { ok: true, base64: buffer.toString('base64'), mimeType: 'audio/mpeg' }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: baca file model dari disk → kirim base64 + nama file ke renderer.
// Renderer tidak bisa akses filesystem langsung, jadi main yang membacakan.
ipcMain.handle('avatar:read-model', async (_event, modelPath) => {
  try {
    const buffer = await readFile(modelPath)
    const name = modelPath.split('/').pop() || 'model'
    return {
      ok: true,
      name,
      base64: buffer.toString('base64'),
      ext: name.split('.').pop()?.toLowerCase()
    }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// IPC: ubah path filesystem model → URL `model://` (untuk MMD yang butuh texture relatif).
ipcMain.handle('avatar:model-url', (_event, modelPath) => {
  // Encode tiap segmen path (jaga `/` sebagai pemisah) agar texture relatif
  // bisa di-resolve MMDLoader dengan benar terhadap base URL.
  const segments = modelPath.split('/')
  const encoded = segments.map((s) => encodeURIComponent(s)).join('/')
  return `model://local/${encoded}`
})

// MIME types untuk file aset model (texture, dsb).
const MIME_MAP = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.bmp': 'image/bmp',
  '.tga': 'image/tga',
  '.gif': 'image/gif',
  '.spa': 'image/tga',
  '.sph': 'image/tga',
  '.dds': 'image/vnd-ms.dds',
  '.pmx': 'application/octet-stream',
  '.pmd': 'application/octet-stream',
  '.vmd': 'application/octet-stream',
  '.fbx': 'application/octet-stream'
}

// Register custom protocol `model://` untuk serve file model + texture dari disk.
// Diperlukan karena MMDLoader me-resolve texture relatif ke URL model.
protocol.registerSchemesAsPrivileged([
  { scheme: 'model', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

function registerModelProtocol() {
  protocol.handle('model', async (request) => {
    try {
      const url = new URL(request.url)
      // Format: model://local/<segmen-encoded path> (tiap segmen di-encode, `/` tetap).
      const encoded = url.pathname.replace(/^\//, '')
      const filePath = decodeURIComponent(encoded)

      const ext = extname(filePath).toLowerCase()
      const mime = MIME_MAP[ext] || 'application/octet-stream'

      const data = await readFile(filePath)
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': mime }
      })
    } catch (err) {
      return new Response('Not found', { status: 404 })
    }
  })
}

app.whenReady().then(() => {
  registerModelProtocol()
  createLauncherWindow()
  registerGlobalShortcuts()

  // Jalankan service (9Router + hermes serve) secara otomatis di background.
  startAllServices()
    .then(async (res) => {
      console.log('[service-manager]', JSON.stringify({
        router: res.router.running ? 'running' : 'not-running',
        hermes: res.hermes.ok ? (res.hermes.already ? 'already-running' : 'started') : 'failed'
      }))
      // Hubungkan shared gateway ke hermes serve (untuk RPC config/model).
      try {
        await connectGateway(SESSION_TOKEN)
        console.log('[gateway] connected')
      } catch (err) {
        console.error('[gateway] connect failed:', err?.message || err)
      }
    })
    .catch((err) => {
      console.error('[service-manager] error:', err?.message || err)
    })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createLauncherWindow()
  })
})

app.on('window-all-closed', () => {
  stopMotion()
  unregisterGlobalShortcuts()
  disconnectGateway()
  stopAllServices()
  if (process.platform !== 'darwin') app.quit()
})
