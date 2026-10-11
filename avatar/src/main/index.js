import { app, BrowserWindow, ipcMain, protocol, dialog, screen } from 'electron'
import { join, extname } from 'path'
import { readFile } from 'fs/promises'
import { startAllServices, stopAllServices, SESSION_TOKEN, isPortOpen, ROUTER_PORT, HERMES_PORT } from './service-manager.js'
import { connectGateway, disconnectGateway, request as gatewayRequest, isGatewayConnected } from './hermes-gateway.js'

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
    width: 260,
    height: 340,
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
      body: JSON.stringify({ text: String(text) })
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
  disconnectGateway()
  stopAllServices()
  if (process.platform !== 'darwin') app.quit()
})
