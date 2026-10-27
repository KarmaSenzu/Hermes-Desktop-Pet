import { app, BrowserWindow, ipcMain, protocol, dialog, screen, safeStorage, shell, Menu } from 'electron'
import { join, extname, isAbsolute } from 'path'
import { readFile, writeFile, mkdir, rm } from 'fs/promises'
import { existsSync, statSync, readdirSync, cpSync, mkdirSync, createWriteStream } from 'fs'
import { homedir } from 'os'
import http from 'http'
import https from 'https'
import { execFile, spawn } from 'child_process'
import {
  startAllServices,
  stopAllServices,
  SESSION_TOKEN,
  isPortOpen,
  ROUTER_PORT,
  HERMES_PORT,
  KOKORO_PORT,
  startKokoro,
  startHermes,
  resolvePythonCmd,
  resolveHermesCmd,
  resolveHermesConfigPath,
  fixSystemPath
} from './service-manager.js'
import { connectGateway, disconnectGateway, request as gatewayRequest, isGatewayConnected } from './hermes-gateway.js'
import { registerShortcuts, unregisterShortcuts, getShortcutList, updateShortcut } from './shortcuts.js'
import { startBridgeServer, stopBridgeServer, BRIDGE_PORT } from './bridge-server.js'

// Inisialisasi perbaikan PATH untuk macOS/Windows sedini mungkin
fixSystemPath()

// Variabel penyimpan berkas installer sementara jika di Windows
let pendingWindowsInstaller = null

// Tangkap exception unhandled agar tidak pernah muncul dialog pop-up crash Electron
process.on('uncaughtException', (err) => {
  console.warn('[Main Process] Uncaught Exception ditangani dengan aman:', err?.message || err)
})
process.on('unhandledRejection', (reason) => {
  console.warn('[Main Process] Unhandled Rejection ditangani dengan aman:', reason)
})

function getAppIconPath() {
  const isWin = process.platform === 'win32'
  const isMac = process.platform === 'darwin'
  const candidates = [
    join(__dirname, isWin ? '../../build/icon.ico' : (isMac ? '../../build/icon.icns' : '../../build/icon.png')),
    join(__dirname, '../../build/icon.png'),
    join(__dirname, '../../assets/icons/icon.png'),
    join(process.resourcesPath, 'build/icon.png'),
    join(process.resourcesPath, 'assets/icons/icon.png'),
    join(app.getAppPath(), 'build/icon.png')
  ]
  return candidates.find((p) => existsSync(p)) || null
}

/**
 * Pastikan script pendukung (Kokoro TTS, App Launcher) dan ekstensi browser
 * (Hermes Web Companion) tersalin ke ~/.hermes-avatar/ agar dapat diakses tanpa batasan ASAR.
 */
export function ensureDeployedCompanionAndScripts() {
  try {
    const userBase = join(homedir(), '.hermes-avatar')
    const userScriptsDir = join(userBase, 'scripts')
    const userExtDir = join(userBase, 'extensions', 'chrome')

    // 1. Cari source folder scripts
    const candidateScriptSources = [
      process.resourcesPath ? join(process.resourcesPath, 'scripts') : null,
      join(app.getAppPath(), '..', 'scripts'),
      join(app.getAppPath(), 'scripts'),
      join(__dirname, '../../../scripts'),
      join(__dirname, '../../scripts'),
      join(process.cwd(), 'scripts'),
      join(process.cwd(), '..', 'scripts')
    ].filter(Boolean)

    const validScriptSource = candidateScriptSources.find((p) => existsSync(join(p, 'kokoro_server.py')))
    if (validScriptSource) {
      mkdirSync(userScriptsDir, { recursive: true })
      for (const f of ['kokoro_server.py', 'app_launcher.py']) {
        const srcFile = join(validScriptSource, f)
        const dstFile = join(userScriptsDir, f)
        if (existsSync(srcFile)) {
          if (!existsSync(dstFile) || statSync(srcFile).size !== statSync(dstFile).size) {
            cpSync(srcFile, dstFile)
          }
        }
      }
    }

    // 2. Cari source folder ekstensi Chrome
    const candidateExtSources = [
      process.resourcesPath ? join(process.resourcesPath, 'extensions', 'chrome') : null,
      join(app.getAppPath(), '..', 'extensions', 'chrome'),
      join(app.getAppPath(), 'extensions', 'chrome'),
      join(__dirname, '../../../extensions/chrome'),
      join(__dirname, '../../extensions/chrome'),
      join(process.cwd(), 'extensions', 'chrome'),
      join(process.cwd(), '..', 'extensions', 'chrome')
    ].filter(Boolean)

    const validExtSource = candidateExtSources.find((p) => existsSync(join(p, 'manifest.json')))
    if (validExtSource) {
      mkdirSync(userExtDir, { recursive: true })
      const dstManifest = join(userExtDir, 'manifest.json')
      if (!existsSync(dstManifest)) {
        cpSync(validExtSource, userExtDir, { recursive: true })
      } else {
        for (const item of ['background.js', 'content.js', 'content.css', 'popup.html', 'popup.css', 'popup.js', 'manifest.json', 'README.md']) {
          const s = join(validExtSource, item)
          const d = join(userExtDir, item)
          if (existsSync(s) && (!existsSync(d) || statSync(s).size !== statSync(d).size)) {
            cpSync(s, d)
          }
        }
        const sIcons = join(validExtSource, 'icons')
        const dIcons = join(userExtDir, 'icons')
        if (existsSync(sIcons) && !existsSync(dIcons)) {
          cpSync(sIcons, dIcons, { recursive: true })
        }
      }
    }
  } catch (err) {
    console.warn('[Assets Deployer] Info sinkronisasi script/ekstensi:', err?.message || err)
  }
}

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
  const isMac = process.platform === 'darwin'
  const appIcon = getAppIconPath()
  launcherWindow = new BrowserWindow({
    ...(appIcon ? { icon: appIcon } : {}),
    width: 960,
    height: 640,
    minWidth: 780,
    minHeight: 540,
    resizable: true,
    frame: false, // Menghilangkan frame native OS
    titleBarStyle: 'hidden',
    ...(isMac ? { trafficLightPosition: { x: 16, y: 16 } } : {}),
    autoHideMenuBar: true,
    title: 'Hermes 3D Avatar — Pengaturan',
    backgroundColor: '#1e1e20', // Warna background dark mode identik launcher.css (cegah buffer hitam saat show)
    show: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false // Cegah pembekuan rendering oleh Chromium saat window di-hide
    }
  })

  // Hilangkan menu bar bawaan Electron (File, Edit, View, dsb.)
  launcherWindow.setMenu(null)
  launcherWindow.setMenuBarVisibility(false)

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

// Buka dan tampilkan launcher/settings secara mulus tanpa lag atau layar hitam
function showLauncherWindow() {
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    if (launcherWindow.isMinimized()) launcherWindow.restore()
    launcherWindow.show()
    launcherWindow.focus()
    // Paksa Chromium compositor me-repaint render pipeline seketika tanpa menunggu klik mouse
    if (launcherWindow.webContents) {
      launcherWindow.webContents.invalidate()
    }
  } else {
    createLauncherWindow()
  }
}

function createAvatarWindow(modelPath) {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { x, y, width, height } = primaryDisplay.bounds
  const appIcon = getAppIconPath()

  avatarWindow = new BrowserWindow({
    ...(appIcon ? { icon: appIcon } : {}),
    x,
    y,
    width,
    height: height - 1, // 1 piksel di bawah ukuran layar penuh mencegah Windows DWM mengklasifikasikan window sebagai fullscreen eksklusif yang ditenggelamkan saat unfocused
    transparent: true, // kunci desktop pet overlay
    frame: false, // frameless
    hasShadow: false, // hindari bayangan kotak
    roundedCorners: false, // hilangkan rounded corners Windows 11
    alwaysOnTop: true,
    skipTaskbar: true, // Desktop pet murni: tidak mencuri tab di taskbar
    focusable: true, // Tetap focusable agar saat diklik avatar tidak tenggelam/hilang di Windows DWM
    resizable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false
    }
  })

  // Set always-on-top level tertinggi agar tidak pernah tenggelam
  avatarWindow.setAlwaysOnTop(true, 'screen-saver')
  avatarWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Jaga agar window TIDAK PERNAH tenggelam jika kehilangan fokus atau di-minimize oleh OS
  avatarWindow.on('blur', () => {
    if (avatarWindow && !avatarWindow.isDestroyed()) {
      avatarWindow.setAlwaysOnTop(true, 'screen-saver')
    }
  })

  avatarWindow.on('minimize', (e) => {
    e.preventDefault()
    if (avatarWindow && !avatarWindow.isDestroyed()) {
      avatarWindow.restore()
      avatarWindow.setAlwaysOnTop(true, 'screen-saver')
    }
  })

  // Mode click-through awal agar klik di area kosong tembus ke desktop
  avatarWindow.setIgnoreMouseEvents(true, { forward: true })

  avatarWindow.webContents.on('console-message', (_event, _level, message) => {
    console.log('[Avatar Window]', message)
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    avatarWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/index.html`)
  } else {
    avatarWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  let cursorPollTimer = null

  // Kirim path model ke renderer setelah siap (renderer yang baca via read-model).
  avatarWindow.webContents.on('did-finish-load', () => {
    avatarWindow.webContents.send('avatar:load-model', modelPath)

    // Forward pending prompt dari Chrome extension jika ada
    if (pendingWebPrompt) {
      const promptToDeliver = pendingWebPrompt
      pendingWebPrompt = null
      setTimeout(() => {
        if (avatarWindow && !avatarWindow.isDestroyed()) {
          avatarWindow.webContents.send('avatar:web-prompt', promptToDeliver)
        }
      }, 1200)
    }

    // Global desktop cursor tracking ala YourMother Win32 Hook
    if (!cursorPollTimer) {
      let lastX = -1
      let lastY = -1
      cursorPollTimer = setInterval(() => {
        if (avatarWindow && !avatarWindow.isDestroyed()) {
          const point = screen.getCursorScreenPoint()
          // Hanya kirim IPC bila kursor benar-benar berpindah posisi untuk menghemat event loop saat mengetik
          if (point.x !== lastX || point.y !== lastY) {
            lastX = point.x
            lastY = point.y
            avatarWindow.webContents.send('avatar:cursor-screen-point', point)
          }
        } else if (cursorPollTimer) {
          clearInterval(cursorPollTimer)
          cursorPollTimer = null
        }
      }, 30) // ~33 FPS tracking
    }
  })

  avatarWindow.on('closed', () => {
    if (cursorPollTimer) {
      clearInterval(cursorPollTimer)
      cursorPollTimer = null
    }
    avatarWindow = null
    stopMotion()
  })
}

// --- Buffer antrian Web Companion Prompt saat avatar belum siap ---
let pendingWebPrompt = null

function handleIncomingWebPrompt(payload) {
  if (!payload) return
  if (avatarWindow && !avatarWindow.isDestroyed()) {
    avatarWindow.show()
    avatarWindow.setAlwaysOnTop(true, 'screen-saver')
    avatarWindow.webContents.send('avatar:web-prompt', payload)
  } else {
    pendingWebPrompt = payload
    const defaultPath = join(__dirname, '../../assets/live2d/mother/20250106.model3.json')
    if (existsSync(defaultPath)) {
      createAvatarWindow(defaultPath)
      if (launcherWindow && !launcherWindow.isDestroyed()) launcherWindow.hide()
    }
  }
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
      showLauncherWindow()
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

/**
 * Helper untuk me-resolve path model / aset baik dari relative path,
 * absolute path, dev environment (out/main), maupun packaged app (asar / resources).
 */
export function resolveModelPath(modelPath) {
  if (!modelPath) return ''

  // 1. Jika sudah absolute dan ada di filesystem, kembalikan langsung
  if (isAbsolute(modelPath) && existsSync(modelPath)) {
    return modelPath
  }

  // 2. Daftar kandidat root untuk path relatif
  const cleanRel = modelPath.replace(/^[/\\]+/, '')
  const candidates = [
    modelPath,
    join(app.getAppPath(), modelPath),
    join(app.getAppPath(), cleanRel),
    join(__dirname, '../../', modelPath),
    join(__dirname, '../../', cleanRel),
    join(process.resourcesPath, modelPath),
    join(process.resourcesPath, cleanRel),
    join(process.resourcesPath, 'app.asar.unpacked', modelPath),
    join(process.resourcesPath, 'app.asar.unpacked', cleanRel),
    join(homedir(), '.hermes-avatar', modelPath),
    join(homedir(), '.hermes-avatar', cleanRel),
    join(process.cwd(), modelPath)
  ]

  for (const candidate of candidates) {
    try {
      if (candidate && existsSync(candidate)) {
        return candidate
      }
    } catch {
      // Abaikan error stat
    }
  }

  // Fallback terbaik
  return isAbsolute(modelPath) ? modelPath : join(app.getAppPath(), cleanRel)
}

// IPC: launcher → main → buka avatar window dengan model terpilih.
ipcMain.handle('avatar:start', (_event, modelPath) => {
  const defaultRelPath = 'assets/live2d/mother/20250106.model3.json'
  const resolvedPath = resolveModelPath(modelPath || defaultRelPath)

  if (!existsSync(resolvedPath)) {
    return { ok: false, error: `File model tidak ditemukan di disk: ${resolvedPath}` }
  }

  if (avatarWindow && !avatarWindow.isDestroyed()) {
    avatarWindow.focus()
    avatarWindow.webContents.send('avatar:load-model', resolvedPath)
    return { ok: true, reused: true }
  }
  createAvatarWindow(resolvedPath)
  if (launcherWindow) launcherWindow.hide()
  return { ok: true, reused: false }
})

// IPC: jalankan daemon Hermes AI (port 9119) secara on-demand
ipcMain.handle('avatar:start-hermes-server', async () => {
  try {
    const res = await startHermes()
    return res
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: avatar window bisa minta fokus/drag via OS-native (drag region).
ipcMain.handle('avatar:close', () => {
  if (avatarWindow && !avatarWindow.isDestroyed()) avatarWindow.close()
  showLauncherWindow()
})

// IPC: berikan fokus keyboard ke window avatar (untuk mengetik chat).
ipcMain.on('avatar:focus-window', () => {
  if (avatarWindow && !avatarWindow.isDestroyed()) {
    avatarWindow.setFocusable(true)
    avatarWindow.setAlwaysOnTop(true, 'screen-saver')
    avatarWindow.focus()
  }
})

// IPC: kontrol fokus khusus saat chat dibuka/ditutup (agar bisa mengetik tanpa merusak z-order).
ipcMain.on('avatar:chat-focus', (_event, enable) => {
  if (!avatarWindow || avatarWindow.isDestroyed()) return
  avatarWindow.setAlwaysOnTop(true, 'screen-saver')
  if (enable) {
    avatarWindow.focus()
  }
})

// IPC: trigger animasi DVD bounce (fitur/emote).
ipcMain.handle('avatar:dvd-bounce', () => {
  runDvdBounce()
  return { ok: true }
})

// IPC: drag manual window (gantikan app-region: drag).
// Renderer mengirim delta perpindahan mouse; main memindahkan window sesuai.
ipcMain.on('avatar:drag-move', (_event, dx, dy) => {
  if (!avatarWindow || avatarWindow.isDestroyed()) return
  const b = avatarWindow.getBounds()
  avatarWindow.setPosition(b.x + Math.round(dx), b.y + Math.round(dy))
})

// IPC: toggle click-through (klik tembus ke desktop saat di area kosong).
ipcMain.on('avatar:set-ignore-mouse', (_event, ignore, forward) => {
  if (!avatarWindow || avatarWindow.isDestroyed()) return
  avatarWindow.setIgnoreMouseEvents(ignore, { forward: forward !== false })
  // Pastikan Z-order tetap di puncak saat mouse menyentuh area interaktif/avatar
  if (!ignore) {
    avatarWindow.setAlwaysOnTop(true, 'screen-saver')
  }
})

// IPC: buka jendela pengaturan (launcher) dari avatar HUD.
ipcMain.handle('avatar:open-settings', () => {
  showLauncherWindow()
  return { ok: true }
})

// IPC: kontrol window kustom (ala macOS traffic lights)
ipcMain.handle('avatar:window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) win.close()
  return { ok: true }
})

ipcMain.handle('avatar:window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) win.minimize()
  return { ok: true }
})

ipcMain.handle('avatar:window-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  }
  return { ok: true }
})

// IPC: jalankan perintah di terminal sistem baru (PowerShell di Windows, Terminal.app di macOS via AppleScript)
ipcMain.handle('avatar:run-in-terminal', async (_event, cmd, workingDir) => {
  try {
    ensureDeployedCompanionAndScripts()
    const candidateRoots = [
      process.resourcesPath,
      join(homedir(), '.hermes-avatar'),
      join(app.getAppPath(), '..'),
      join(process.cwd(), '..'),
      process.cwd()
    ].filter(Boolean)
    const repoRoot = candidateRoots.find((dir) => existsSync(join(dir, 'scripts', 'kokoro_server.py'))) || candidateRoots[0]
    const cwd = workingDir || repoRoot

    if (process.platform === 'win32') {
      const safeCwd = cwd.replace(/'/g, "''")
      const safeCmd = `Set-Location '${safeCwd}'; ${cmd}`
      const child = spawn('cmd.exe', ['/c', 'start', 'Hermes Terminal', 'powershell', '-NoExit', '-Command', safeCmd], {
        cwd,
        detached: true,
        stdio: 'ignore'
      })
      child.unref()
    } else if (process.platform === 'darwin') {
      // macOS: Buka Terminal.app interaktif sungguhan via osascript
      let macCmd = cmd.replace(/^py\s+/, 'python3 ')
      if (macCmd.includes('pip install') && !macCmd.includes('--break-system-packages')) {
        macCmd += ' --break-system-packages'
      }
      const safeMacCmd = macCmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      const safeCwd = cwd.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      const appleScript = `tell application "Terminal"
        activate
        do script "cd \\"${safeCwd}\\" && ${safeMacCmd}"
      end tell`
      const child = spawn('osascript', ['-e', appleScript], {
        detached: true,
        stdio: 'ignore'
      })
      child.unref()
    } else {
      let linuxCmd = cmd.replace(/^py\s+/, 'python3 ')
      const child = spawn('bash', ['-c', `cd "${cwd}" && ${linuxCmd}`], {
        cwd,
        detached: true,
        stdio: 'ignore'
      })
      child.unref()
    }
    return { ok: true }
  } catch (err) {
    console.error('[run-in-terminal] failed:', err)
    return { ok: false, error: err.message }
  }
})

// IPC: path model default (dipakai launcher untuk pre-select).
ipcMain.handle('avatar:default-model', () => {
  return resolveModelPath('assets/live2d/mother/20250106.model3.json')
})

// IPC: buka dialog pilih file model (native Finder/Explorer).
// Mengembalikan path file yang dipilih, atau null jika batal.
ipcMain.handle('avatar:pick-model', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Pilih model avatar (3D / Live2D)',
    properties: ['openFile'],
    filters: [
      { name: 'Model Avatar', extensions: ['vrm', 'glb', 'gltf', 'pmx', 'pmd', 'fbx', 'model3.json', 'json'] },
      { name: 'Semua file', extensions: ['*'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// IPC: buka dialog pilih file audio musik lokal (mp3, wav, ogg, flac, m4a, aac).
ipcMain.handle('avatar:pick-audio-files', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Pilih File Lagu / Musik',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'File Audio Musik', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'] },
      { name: 'Semua file', extensions: ['*'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return []
  return result.filePaths.map((fp) => {
    const filename = basename(fp)
    const ext = extname(fp)
    const rawTitle = basename(fp, ext)
    const parts = rawTitle.split(' - ')
    let artist = 'Koleksi Lokal'
    let title = rawTitle
    if (parts.length >= 2) {
      artist = parts[0].trim()
      title = parts.slice(1).join(' - ').trim()
    }
    return {
      path: fp,
      name: filename,
      title: title,
      artist: artist,
      url: `model://${encodeURI(fp.replace(/\\/g, '/'))}`
    }
  })
})

// IPC: token Hermes gateway — pakai SESSION_TOKEN dari service-manager
// (konsisten antara avatar & hermes serve yang di-spawn otomatis).
ipcMain.handle('avatar:hermes-config', () => {
  return {
    wsUrl: process.env['HERMES_WS_URL'] || 'ws://127.0.0.1:9119/api/ws',
    token: SESSION_TOKEN
  }
})

// IPC: status service (9Router, Hermes, Kokoro, Companion Bridge, Python, model disk) — untuk settings & Package Hub.
ipcMain.handle('avatar:service-status', async () => {
  const router = await isPortOpen(ROUTER_PORT)
  const hermes = await isPortOpen(HERMES_PORT)
  const kokoro = await isPortOpen(KOKORO_PORT)
  const companion = await isPortOpen(BRIDGE_PORT)

  // Cek deteksi Python di sistem menggunakan resolver cross-platform
  const pyInfo = await resolvePythonCmd()
  const pythonOk = pyInfo.ok
  const pythonVersion = pyInfo.version
  const pyCmd = pyInfo.cmd

  // Cek apakah paket python kokoro-onnx & soundfile terpasang di environment
  let kokoroInstalled = false
  if (pythonOk) {
    try {
      await new Promise((res, rej) => {
        execFile(pyCmd, ['-c', 'import kokoro_onnx, soundfile; print("ok")'], { timeout: 4000, env: process.env }, (err, stdout) => {
          if (!err && stdout && stdout.includes('ok')) return res(true)
          rej(err || new Error('Module import failed'))
        })
      })
      kokoroInstalled = true
    } catch {
      kokoroInstalled = false
    }
  }

  // Cek keberadaan model di folder penyimpanan terpusat
  const pkgDir = join(homedir(), '.hermes-avatar', 'packages', 'kokoro')
  const legacyDir = join(homedir(), '.kokoro-models')
  const modelFile1 = join(pkgDir, 'kokoro-v1.0.onnx')
  const modelFile2 = join(legacyDir, 'kokoro-v1.0.onnx')
  const kokoroModelReady = existsSync(modelFile1) || existsSync(modelFile2)

  let modelSizeMb = 0
  try {
    const targetFile = existsSync(modelFile1) ? modelFile1 : (existsSync(modelFile2) ? modelFile2 : null)
    if (targetFile) {
      const st = statSync(targetFile)
      modelSizeMb = Math.round(st.size / (1024 * 1024))
    }
  } catch {}

  return {
    router,
    hermes,
    kokoro,
    companion,
    pythonOk,
    pythonVersion,
    kokoroInstalled,
    kokoroModelReady,
    modelSizeMb,
    packagePath: pkgDir
  }
})

// IPC: jalankan script server Kokoro-TTS (Lokal)
ipcMain.handle('avatar:start-kokoro-server', async () => {
  try {
    const res = await startKokoro()
    return res
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: install dependensi Kokoro via pip (mendukung Windows, macOS & Linux termasuk flag --break-system-packages bila diperlukan)
ipcMain.handle('avatar:install-kokoro-deps', async () => {
  try {
    const pyInfo = await resolvePythonCmd()
    const pyCmd = pyInfo.cmd

    const runPip = (extraArgs = []) => new Promise((res, rej) => {
      execFile(pyCmd, ['-m', 'pip', 'install', 'kokoro-onnx', 'soundfile', ...extraArgs], { timeout: 180000, env: process.env }, (err, stdout, stderr) => {
        if (err) return rej(new Error(stderr || stdout || err.message))
        res(stdout || 'Berhasil terpasang')
      })
    })

    try {
      const out = await runPip()
      return { ok: true, output: out }
    } catch (err) {
      // Fallback untuk macOS Homebrew Python PEP 668 externally managed environment
      if (err.message?.includes('externally-managed-environment') || process.platform !== 'win32') {
        try {
          const out = await runPip(['--break-system-packages'])
          return { ok: true, output: out }
        } catch (err2) {
          throw err2
        }
      }
      throw err
    }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: uninstall dependensi Kokoro via pip
ipcMain.handle('avatar:uninstall-kokoro-deps', async () => {
  try {
    const pyInfo = await resolvePythonCmd()
    const pyCmd = pyInfo.cmd

    const runUninstall = (extraArgs = []) => new Promise((res, rej) => {
      execFile(pyCmd, ['-m', 'pip', 'uninstall', '-y', 'kokoro-onnx', 'soundfile', ...extraArgs], { timeout: 60000, env: process.env }, (err, stdout, stderr) => {
        if (err) return rej(new Error(stderr || stdout || err.message))
        res(stdout || 'Berhasil dicopot')
      })
    })

    try {
      const out = await runUninstall()
      return { ok: true, output: out }
    } catch (err) {
      if (process.platform !== 'win32') {
        const out = await runUninstall(['--break-system-packages'])
        return { ok: true, output: out }
      }
      throw err
    }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: buka folder penyimpanan paket di File Explorer / Finder
ipcMain.handle('avatar:open-package-folder', async (_event, pkgName = 'kokoro') => {
  try {
    let targetDir = join(homedir(), '.hermes-avatar', 'packages', pkgName)
    if (pkgName === 'hermes') targetDir = join(homedir(), '.hermes')
    if (pkgName === 'packages-root') targetDir = join(homedir(), '.hermes-avatar', 'packages')
    if (pkgName === 'chrome-extension' || pkgName === 'companion') {
      ensureDeployedCompanionAndScripts()
      const userExtDir = join(homedir(), '.hermes-avatar', 'extensions', 'chrome')
      const candidates = [
        userExtDir,
        process.resourcesPath ? join(process.resourcesPath, 'extensions', 'chrome') : null,
        join(app.getAppPath(), '..', 'extensions', 'chrome'),
        join(app.getAppPath(), 'extensions', 'chrome'),
        join(__dirname, '../../../extensions/chrome')
      ].filter(Boolean)
      targetDir = candidates.find((p) => existsSync(join(p, 'manifest.json'))) || userExtDir
    }
    await mkdir(targetDir, { recursive: true })
    await shell.openPath(targetDir)
    return { ok: true, path: targetDir }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: hapus cache model paket untuk menghemat ruang disk
ipcMain.handle('avatar:clean-package', async (_event, pkgName = 'kokoro') => {
  try {
    const targetDir = join(homedir(), '.hermes-avatar', 'packages', pkgName)
    await rm(targetDir, { recursive: true, force: true })
    const legacyDir = join(homedir(), '.kokoro-models')
    await rm(legacyDir, { recursive: true, force: true })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

function isNewerVersion(vLatest, vCurrent) {
  if (!vLatest || !vCurrent) return false
  const p1 = vLatest.replace(/^v/i, '').split('.').map((x) => parseInt(x, 10) || 0)
  const p2 = vCurrent.replace(/^v/i, '').split('.').map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0
    const num2 = p2[i] || 0
    if (num1 > num2) return true
    if (num1 < num2) return false
  }
  return false
}

async function checkAppUpdate() {
  const currentVersion = app.getVersion() || '0.1.3'
  const repoOwner = 'KarmaSenzu'
  const repoName = 'Hermes-Desktop-Pet'

  try {
    const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`
    const resp = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Hermes-Desktop-Pet-App',
        'Accept': 'application/vnd.github.v3+json'
      }
    })

    if (!resp.ok) {
      try {
        const rawPkgResp = await fetch(`https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/avatar/package.json`)
        if (rawPkgResp.ok) {
          const rawPkg = await rawPkgResp.json()
          const remoteVer = rawPkg.version || ''
          const hasUpdate = isNewerVersion(remoteVer, currentVersion)
          return {
            ok: true,
            hasUpdate,
            currentVersion,
            latestVersion: `v${remoteVer}`,
            releaseName: `Hermes Desktop Pet v${remoteVer}`,
            releaseDate: '',
            changelog: 'Pembaruan terkini tersedia di rilis GitHub.',
            releaseUrl: `https://github.com/${repoOwner}/${repoName}/releases`,
            downloadUrl: `https://github.com/${repoOwner}/${repoName}/releases`,
            assetName: null
          }
        }
      } catch {}

      return {
        ok: true,
        hasUpdate: false,
        currentVersion,
        latestVersion: `v${currentVersion}`,
        message: 'Versi saat ini adalah yang terbaru.'
      }
    }

    const data = await resp.json()
    const latestTag = data.tag_name || ''
    const cleanLatest = latestTag.replace(/^v/i, '')
    const cleanCurrent = currentVersion.replace(/^v/i, '')

    const hasUpdate = isNewerVersion(cleanLatest, cleanCurrent)

    let downloadUrl = data.html_url
    let matchedAsset = null
    if (data.assets && Array.isArray(data.assets)) {
      if (process.platform === 'darwin') {
        matchedAsset = data.assets.find((a) => a.name.endsWith('.dmg')) ||
                       data.assets.find((a) => a.name.endsWith('.zip') && a.name.includes('mac'))
      } else if (process.platform === 'win32') {
        matchedAsset = data.assets.find((a) => a.name.endsWith('.exe')) ||
                       data.assets.find((a) => a.name.endsWith('.zip') && a.name.includes('win'))
      } else {
        matchedAsset = data.assets.find((a) => a.name.endsWith('.AppImage')) ||
                       data.assets.find((a) => a.name.endsWith('.deb'))
      }
      if (matchedAsset?.browser_download_url) {
        downloadUrl = matchedAsset.browser_download_url
      }
    }

    return {
      ok: true,
      hasUpdate,
      currentVersion,
      latestVersion: latestTag.startsWith('v') ? latestTag : `v${latestTag}`,
      releaseName: data.name || data.tag_name || `Versi ${latestTag}`,
      releaseDate: data.published_at ? data.published_at.split('T')[0] : '',
      changelog: data.body || 'Pembaruan stabilitas, perbaikan bug, dan peningkatan fitur.',
      releaseUrl: data.html_url || `https://github.com/${repoOwner}/${repoName}/releases`,
      downloadUrl,
      assetName: matchedAsset ? matchedAsset.name : null
    }
  } catch (err) {
    return {
      ok: false,
      currentVersion,
      error: err?.message || String(err)
    }
  }
}

// IPC: periksa pembaruan rilis aplikasi
ipcMain.handle('avatar:check-update', async () => {
  return await checkAppUpdate()
})

// IPC: ambil versi aplikasi saat ini
ipcMain.handle('avatar:get-app-version', () => {
  return app.getVersion()
})

// IPC: buka URL rilis / download file installer di browser
ipcMain.handle('avatar:open-external-url', async (_event, url) => {
  try {
    if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
      await shell.openExternal(url)
      return { ok: true }
    }
    return { ok: false, error: 'URL tidak valid' }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: Unduh dan pasang update secara in-app (OTA Seamless Auto-Update)
ipcMain.handle('avatar:download-and-apply-update', async (event, downloadUrl, assetName) => {
  try {
    if (!downloadUrl) return { ok: false, error: 'URL unduhan tidak ditemukan' }

    const filename = assetName || downloadUrl.split('/').pop() || 'hermes-update-pkg'
    const tempDir = join(app.getPath('temp'), `hermes_ota_${Date.now()}`)
    await mkdir(tempDir, { recursive: true })
    const targetFilePath = join(tempDir, filename)

    // Streaming unduh via fetch bawaan Node.js
    const resp = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'Hermes-Desktop-Pet-App'
      }
    })

    if (!resp.ok) {
      throw new Error(`Gagal mengunduh paket update: HTTP ${resp.status} ${resp.statusText}`)
    }

    const totalBytes = parseInt(resp.headers.get('content-length') || '0', 10)
    let transferredBytes = 0

    const fileStream = createWriteStream(targetFilePath)
    const reader = resp.body.getReader()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      fileStream.write(value)
      transferredBytes += value.length
      if (totalBytes > 0) {
        const percent = Math.min(100, Math.round((transferredBytes / totalBytes) * 100))
        const transferredMb = (transferredBytes / (1024 * 1024)).toFixed(1)
        const totalMb = (totalBytes / (1024 * 1024)).toFixed(1)
        event.sender.send('avatar:update-download-progress', { percent, transferredMb, totalMb })
      }
    }
    await new Promise((resolve) => fileStream.end(resolve))

    // Terapkan instalasi berdasarkan platform
    if (process.platform === 'darwin') {
      if (filename.endsWith('.dmg')) {
        const mountDir = join(tempDir, 'mount')
        await mkdir(mountDir, { recursive: true })

        await new Promise((resolve, reject) => {
          execFile('hdiutil', ['attach', '-nobrowse', '-readonly', targetFilePath, '-mountpoint', mountDir], (err) => {
            if (err) return reject(err)
            resolve()
          })
        })

        const appSource = join(mountDir, 'Hermes Desktop Pet.app')
        if (existsSync(appSource)) {
          await new Promise((resolve, reject) => {
            execFile('cp', ['-R', appSource, '/Applications/'], (err) => {
              if (err) return reject(err)
              resolve()
            })
          })
          execFile('xattr', ['-cr', '/Applications/Hermes Desktop Pet.app'], () => {})
        }

        execFile('hdiutil', ['detach', mountDir, '-force'], () => {})
      } else if (filename.endsWith('.zip')) {
        await new Promise((resolve, reject) => {
          execFile('unzip', ['-q', '-o', targetFilePath, '-d', '/Applications/'], (err) => {
            if (err) return reject(err)
            resolve()
          })
        })
        execFile('xattr', ['-cr', '/Applications/Hermes Desktop Pet.app'], () => {})
      }
      return { ok: true, readyToRestart: true, message: 'Update berhasil dipasang di /Applications!' }
    } else if (process.platform === 'win32') {
      if (filename.endsWith('.exe')) {
        pendingWindowsInstaller = targetFilePath
        return { ok: true, readyToRestart: true, message: 'Installer update siap dipasang saat restart!' }
      } else if (filename.endsWith('.zip')) {
        const destDir = join(process.env.LOCALAPPDATA || homedir(), 'Programs', 'Hermes Desktop Pet')
        execFile('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${targetFilePath}' -DestinationPath '${destDir}' -Force`], () => {})
        return { ok: true, readyToRestart: true }
      }
    } else {
      // Linux AppImage
      if (filename.endsWith('.AppImage')) {
        const binDest = join(homedir(), '.local', 'bin', 'hermes-desktop-pet')
        await mkdir(join(homedir(), '.local', 'bin'), { recursive: true })
        execFile('chmod', ['+x', targetFilePath], () => {})
        execFile('cp', [targetFilePath, binDest], () => {})
        execFile('chmod', ['+x', binDest], () => {})
        return { ok: true, readyToRestart: true }
      }
    }

    return { ok: true, readyToRestart: true }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: Relaunch aplikasi untuk menerapkan update
ipcMain.handle('avatar:relaunch-app', () => {
  if (process.platform === 'win32' && pendingWindowsInstaller) {
    spawn(pendingWindowsInstaller, ['/S'], { detached: true, stdio: 'ignore' }).unref()
    app.exit(0)
    return
  }
  app.relaunch()
  app.exit(0)
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

    // Proteksi skill inti Mnemosyne (wajib ada untuk sistem memori)
    if (safeName.toLowerCase() === 'mnemosyne' || safeName.toLowerCase().includes('mnemosyne')) {
      return { ok: false, error: 'Skill Mnemosyne adalah modul memori permanen bawaan sistem dan tidak dapat dihapus.' }
    }

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
  const hermesCmd = resolveHermesCmd()
  return new Promise((resolve, reject) => {
    execFile(hermesCmd, args, { timeout, shell: process.platform === 'win32', env: process.env }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.trim() || err.message))
      else resolve(stdout?.trim() || '')
    })
  })
}

// Helper: tulis update model langsung ke config.yaml bila CLI / RPC tidak tersedia
async function updateModelConfigYaml(modelName) {
  try {
    const cfgPath = resolveHermesConfigPath()
    let cfg = ''
    if (existsSync(cfgPath)) {
      cfg = await readFile(cfgPath, 'utf8')
    } else {
      await mkdir(join(cfgPath, '..'), { recursive: true })
    }

    if (/^model:\s*$/m.test(cfg)) {
      if (/^\s+default:/m.test(cfg)) {
        cfg = cfg.replace(/^(\s+default:\s*).*$/m, `$1${modelName}`)
      } else {
        cfg = cfg.replace(/^(model:\s*)$/m, `$1\n  default: ${modelName}`)
      }
      if (/^\s+provider:/m.test(cfg)) {
        cfg = cfg.replace(/^(\s+provider:\s*).*$/m, `$1custom`)
      } else {
        cfg = cfg.replace(/^(model:\s*)$/m, `$1\n  provider: custom`)
      }
    } else {
      cfg += `\nmodel:\n  default: ${modelName}\n  provider: custom\n`
    }

    await writeFile(cfgPath, cfg, 'utf8')
    return true
  } catch (err) {
    console.warn('[updateModelConfigYaml] failed:', err?.message || err)
    return false
  }
}

// IPC: set model aktif via 3-layer (RPC gateway -> hermes CLI -> config.yaml fallback).
ipcMain.handle('avatar:set-model', async (_event, model) => {
  try {
    const modelName = String(model || '').trim()
    if (!modelName) return { ok: false, error: 'Model kosong.' }

    let anySuccess = false
    let lastErr = null

    // Layer 1: RPC gateway bila Hermes serve sedang connect
    try {
      if (isGatewayConnected()) {
        await gatewayRequest('config.set', { key: 'model.default', value: modelName })
        await gatewayRequest('config.set', { key: 'model.provider', value: 'custom' })
        anySuccess = true
      }
    } catch (e) {
      lastErr = e
    }

    // Layer 2: Hermes CLI
    try {
      await runHermes(['config', 'set', 'model.default', modelName])
      await runHermes(['config', 'set', 'model.provider', 'custom'])
      anySuccess = true
    } catch (e) {
      if (!lastErr) lastErr = e
    }

    // Layer 3: Tulis langsung ke config.yaml
    const fileOk = await updateModelConfigYaml(modelName)
    if (fileOk) anySuccess = true

    if (!anySuccess) {
      throw lastErr || new Error('Gagal menerapkan konfigurasi model')
    }

    return { ok: true, model: modelName }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: set TTS config (voice) ke Hermes — tulis config.yaml langsung.
ipcMain.handle('avatar:set-tts-config', async (_event, { voice }) => {
  try {
    if (!voice) return { ok: true }

    const cfgPath = resolveHermesConfigPath()
    let cfg = ''
    if (existsSync(cfgPath)) {
      cfg = await readFile(cfgPath, 'utf8')
    } else {
      await mkdir(join(cfgPath, '..'), { recursive: true })
    }

    // Pastikan blok tts.edge.voice ada (update atau sisipkan).
    if (/^tts:\s*$/m.test(cfg)) {
      cfg = updateYamlNested(cfg, 'tts', 'edge', 'voice', voice)
    } else {
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
    const cfgPath = resolveHermesConfigPath()
    let cfg = ''
    if (existsSync(cfgPath)) {
      cfg = await readFile(cfgPath, 'utf8')
    } else {
      await mkdir(join(cfgPath, '..'), { recursive: true })
    }

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

const APPS_CACHE_FILE = join(homedir(), '.hermes-avatar', 'apps_cache.json')

// Pindai shortcut aplikasi Windows di Start Menu & aplikasi bawaan resmi
function scanWindowsShortcuts() {
  const isWindows = process.platform === 'win32'
  if (!isWindows) return []

  const dirs = [
    join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    join(process.env.ProgramData || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  ].filter((p) => existsSync(p))

  const results = []
  const seenNames = new Set()

  function walk(dir) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const ent of entries) {
        const full = join(dir, ent.name)
        if (ent.isDirectory()) {
          walk(full)
        } else if (ent.name.toLowerCase().endsWith('.lnk')) {
          const rawName = ent.name.replace(/\.lnk$/i, '').trim()
          const lower = rawName.toLowerCase()
          if (
            lower.includes('uninstall') ||
            lower.includes('readme') ||
            lower.includes('documentation') ||
            lower.includes('help') ||
            lower.includes('setup')
          ) {
            continue
          }
          if (!seenNames.has(lower)) {
            seenNames.add(lower)
            const aliases = []
            if (lower.includes('visual studio code')) {
              aliases.push('vscode', 'vs code', 'code', 'vsc')
            } else if (lower === 'word' || lower.includes('microsoft word')) {
              aliases.push('word', 'ms word', 'microsoft word')
            } else if (lower === 'excel' || lower.includes('microsoft excel')) {
              aliases.push('excel', 'ms excel', 'microsoft excel')
            } else if (lower.includes('powerpoint')) {
              aliases.push('powerpoint', 'ppt', 'ms powerpoint')
            } else if (lower.includes('chrome')) {
              aliases.push('chrome', 'google chrome')
            } else if (lower.includes('edge')) {
              aliases.push('edge', 'microsoft edge')
            } else if (lower.includes('task manager')) {
              aliases.push('task manager', 'taskmgr', 'taskman')
            }
            results.push({
              name: rawName,
              command: full,
              aliases,
              source: 'windows-start-menu'
            })
          }
        }
      }
    } catch {
      // Lewati subfolder dengan akses dibatasi
    }
  }

  for (const d of dirs) {
    walk(d)
  }

  // Aplikasi bawaan umum Windows
  const builtins = [
    { name: 'Notepad', command: 'notepad.exe', aliases: ['notepad', 'catatan'] },
    { name: 'Kalkulator', command: 'calc.exe', aliases: ['calc', 'kalkulator', 'calculator'] },
    { name: 'File Explorer', command: 'explorer.exe', aliases: ['explorer', 'file explorer'] },
    { name: 'Paint', command: 'mspaint.exe', aliases: ['paint', 'mspaint', 'gambar'] },
    { name: 'Task Manager', command: 'taskmgr.exe', aliases: ['taskmgr', 'task manager'] },
    { name: 'Command Prompt', command: 'cmd.exe', aliases: ['cmd', 'command prompt'] },
    { name: 'PowerShell', command: 'powershell.exe', aliases: ['powershell', 'pwsh'] },
    { name: 'Pengaturan Windows', command: 'ms-settings:', aliases: ['settings', 'pengaturan'] }
  ]

  for (const b of builtins) {
    if (!seenNames.has(b.name.toLowerCase())) {
      seenNames.add(b.name.toLowerCase())
      results.push({
        name: b.name,
        command: b.command,
        aliases: b.aliases,
        source: 'builtin'
      })
    }
  }

  return results
}

// IPC: jalankan aplikasi secara cross-platform (Windows, macOS, Linux) dengan fast fallback.
ipcMain.handle('avatar:launch-app', async (_event, targetPath) => {
  try {
    if (!targetPath) return { ok: false, error: 'Path aplikasi kosong' }
    const p = String(targetPath).trim()

    // 1. URL / protocol URI (misal ms-settings:, spotify:, https://)
    if (/^[a-zA-Z0-9\-_]+:/.test(p) && !p.includes('\\') && !p.includes('/')) {
      await shell.openExternal(p)
      return { ok: true }
    }

    // 2. File / shortcut path langsung jika ada di disk
    if (existsSync(p)) {
      const err = await shell.openPath(p)
      if (!err) return { ok: true }
    }

    // 3. Fallback: Eksekusi command langsung di OS (misal "notepad.exe", "calc.exe", atau nama aplikasi)
    const { exec } = await import('child_process')
    return new Promise((resolve) => {
      exec(`start "" "${p}"`, { windowsHide: true }, (error) => {
        if (error) {
          exec(p, { windowsHide: true }, (err2) => {
            if (err2) resolve({ ok: false, error: err2.message || String(err2) })
            else resolve({ ok: true })
          })
        } else {
          resolve({ ok: true })
        }
      })
    })
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: Scan semua aplikasi terpasang di Windows (Start Menu & Builtins)
ipcMain.handle('avatar:scan-installed-apps', async () => {
  try {
    const apps = scanWindowsShortcuts()
    await mkdir(join(homedir(), '.hermes-avatar'), { recursive: true })
    await writeFile(APPS_CACHE_FILE, JSON.stringify(apps, null, 2), 'utf-8')
    return { ok: true, apps, count: apps.length }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: Ambil cache aplikasi terpasang (jika belum ada, lakukan auto-scan)
ipcMain.handle('avatar:get-installed-apps', async () => {
  try {
    if (existsSync(APPS_CACHE_FILE)) {
      const data = await readFile(APPS_CACHE_FILE, 'utf-8')
      const apps = JSON.parse(data)
      return { ok: true, apps, count: apps.length }
    }
    const apps = scanWindowsShortcuts()
    await mkdir(join(homedir(), '.hermes-avatar'), { recursive: true })
    await writeFile(APPS_CACHE_FILE, JSON.stringify(apps, null, 2), 'utf-8')
    return { ok: true, apps, count: apps.length }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: Belajar / simpan aplikasi baru secara permanen
ipcMain.handle('avatar:learn-app', async (_event, appData) => {
  try {
    if (!appData || !appData.name || !appData.command) {
      return { ok: false, error: 'Nama dan path/command aplikasi wajib diisi' }
    }
    let list = []
    if (existsSync(APPS_CACHE_FILE)) {
      try {
        list = JSON.parse(await readFile(APPS_CACHE_FILE, 'utf-8'))
      } catch {}
    }
    list = list.filter((a) => a.name.toLowerCase() !== appData.name.toLowerCase())
    list.unshift({
      name: appData.name,
      command: appData.command,
      aliases: appData.aliases || [],
      source: 'user-learned',
      updatedAt: Date.now()
    })
    await mkdir(join(homedir(), '.hermes-avatar'), { recursive: true })
    await writeFile(APPS_CACHE_FILE, JSON.stringify(list, null, 2), 'utf-8')
    return { ok: true, count: list.length }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: Cuaca real-time live (Open-Meteo / WMO — gratis, response cepat <300ms)
ipcMain.handle('avatar:get-live-weather', async (_event, city = 'Jakarta') => {
  try {
    const lat = -6.2
    const lon = 106.8
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=Asia%2FJakarta`
    const resp = await fetch(url, { headers: { 'User-Agent': 'HermesAvatar/1.0' }, signal: AbortSignal.timeout(5000) })
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` }
    const data = await resp.json()
    const cur = data.current || {}

    const WMO_MAP = {
      0: 'Cerah',
      1: 'Sebagian Besar Cerah',
      2: 'Sebagian Berawan',
      3: 'Mendung Berawan',
      45: 'Berkabut',
      48: 'Kabut Tebal',
      51: 'Gerimis Ringan',
      53: 'Gerimis Sedang',
      55: 'Gerimis Lebat',
      61: 'Hujan Ringan',
      63: 'Hujan Sedang',
      65: 'Hujan Lebat',
      80: 'Hujan Lokal Singkat',
      81: 'Hujan Lebat Berselang',
      82: 'Hujan Sangat Deras',
      95: 'Hujan Disertai Petir',
      96: 'Badai Petir Ringan',
      99: 'Badai Petir Lebat'
    }
    const condition = WMO_MAP[cur.weather_code] || 'Cerah Berawan'
    return {
      ok: true,
      city: 'Jakarta',
      temp: cur.temperature_2m,
      humidity: cur.relative_humidity_2m,
      wind: cur.wind_speed_10m,
      weatherCode: cur.weather_code,
      condition,
      time: cur.time
    }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: Berita terkini Indonesia live hari ini (Google News RSS Indonesia)
ipcMain.handle('avatar:get-live-news', async () => {
  try {
    const url = 'https://news.google.com/rss?hl=id&gl=ID&ceid=ID:id'
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(6000)
    })
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` }
    const xml = await resp.text()

    const itemRegex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?<\/item>/g
    const items = []
    let match
    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      let rawTitle = match[1] || ''
      rawTitle = rawTitle
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim()
      items.push({
        title: rawTitle,
        pubDate: match[3] || ''
      })
    }
    return { ok: true, items }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
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
    title: 'Pilih file animasi gerakan atau pose',
    properties: ['openFile'],
    filters: [
      { name: 'File Animasi Gerakan', extensions: ['glb', 'gltf', 'vmd', 'motion3.json', 'bvh', 'fbx', 'json'] },
      { name: 'Semua file', extensions: ['*'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// IPC: kirim preview / uji animasi langsung ke jendela avatar aktif
ipcMain.handle('avatar:preview-animation', async (_event, data) => {
  if (avatarWindow && !avatarWindow.isDestroyed()) {
    avatarWindow.webContents.send('avatar:preview-animation', data)
    return { ok: true }
  }
  return { ok: false, error: 'Jendela avatar belum aktif' }
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

ipcMain.handle('avatar:tts', async (_event, text, voice, options = {}) => {
  const chosenVoice = voice || 'af_heart'
  const isKokoro = options.provider === 'kokoro' || /^[a-z]{2}_/i.test(chosenVoice)

  // 1) Jalur Kokoro-TTS (Lokal AI Anime — Apache 2.0 Komersial)
  if (isKokoro) {
    try {
      // Auto-start Kokoro server jika port 8880 belum aktif
      if (!(await isPortOpen(KOKORO_PORT))) {
        console.log('[avatar:tts] Kokoro server belum aktif di port 8880, mencoba auto-start...')
        await startKokoro()
      }

      const endpoint = options.kokoroEndpoint || 'http://127.0.0.1:8880'
      const kokoroUrl = endpoint.endsWith('/speech')
        ? endpoint
        : `${endpoint.replace(/\/+$/, '')}/v1/audio/speech`

      const kokoroVoice = /^[a-z]{2}_/i.test(chosenVoice) ? chosenVoice : 'af_heart'
      const resp = await fetch(kokoroUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'kokoro',
          input: String(text),
          voice: kokoroVoice,
          speed: options.speed || 1.0,
          intonation: options.intonation || 'anime',
          lang: options.lang,
          response_format: 'wav'
        })
      })

      if (resp.ok) {
        const arrayBuf = await resp.arrayBuffer()
        const buf = Buffer.from(arrayBuf)
        const base64 = buf.toString('base64')
        return {
          ok: true,
          dataUrl: `data:audio/wav;base64,${base64}`,
          base64,
          mimeType: 'audio/wav',
          isKokoro: true,
          voice: kokoroVoice
        }
      } else {
        console.warn(`[avatar:tts] Kokoro server HTTP ${resp.status}:`, await resp.text().catch(() => ''))
      }
    } catch (err) {
      console.warn('[avatar:tts] Kokoro server offline / gagal diakses, mencoba jalur cadangan:', err?.message || err)
    }

    // Jika mode noFallback aktif (misal dari pengujian suara), tolak fallback agar pengguna tidak tertipu suara cewek default
    if (options.noFallback) {
      return {
        ok: false,
        error: `Server Kokoro-TTS (port 8880) belum aktif atau tidak merespons. Silakan buka tab Package Hub lalu klik 'Jalankan di Background App' atau 'Buka Terminal & Jalankan Server' terlebih dahulu.`
      }
    }
  }

  // 2) Jalur utama cadangan: endpoint TTS Hermes.
  const token = SESSION_TOKEN
  const ttsUrl = resolveTtsUrl()
  const fallbackVoice = /^[a-z]{2}_/i.test(chosenVoice) ? 'id-ID-GadisNeural' : chosenVoice
  const fallbackWarning = isKokoro
    ? `Server Kokoro offline di port 8880. Sistem beralih sementara ke suara cadangan (${fallbackVoice}).`
    : null

  try {
    const resp = await fetch(ttsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hermes-Session-Token': token
      },
      body: JSON.stringify({ text: String(text), voice: fallbackVoice })
    })
    if (resp.ok) {
      const data = await resp.json()
      if (data && data.ok && data.data_url) {
        return {
          ok: true,
          dataUrl: data.data_url,
          mimeType: data.mime_type || 'audio/mpeg',
          isFallback: isKokoro,
          warning: fallbackWarning
        }
      }
    }
  } catch {
    // Hermes tidak terjangkau → jatuh ke fallback Windows SAPI di bawah.
  }

  // 3) Fallback Offline Cepat & Pasti: Windows System.Speech SAPI (Bawaan Windows, tanpa internet, zero lag)
  if (process.platform === 'win32') {
    try {
      const cleanT = String(text).replace(/[\r\n\t]+/g, ' ').replace(/"/g, '""').trim()
      const b64Input = Buffer.from(cleanT, 'utf8').toString('base64')
      const psScript = `
        Add-Type -AssemblyName System.Speech
        $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
        $female = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Gender -eq 'Female' } | Select-Object -First 1
        if ($female) { $s.SelectVoice($female.VoiceInfo.Name) }
        $ms = New-Object System.IO.MemoryStream
        $s.SetOutputToWaveStream($ms)
        $bytes = [System.Convert]::FromBase64String("${b64Input}")
        $txt = [System.Text.Encoding]::UTF8.GetString($bytes)
        $s.Speak($txt)
        [System.Convert]::ToBase64String($ms.ToArray())
      `
      const base64Wav = await new Promise((res, rej) => {
        execFile('powershell', ['-NoProfile', '-Command', psScript], { timeout: 12000 }, (err, stdout) => {
          if (err) return rej(err)
          res(stdout.trim())
        })
      })

      if (base64Wav) {
        return {
          ok: true,
          dataUrl: `data:audio/wav;base64,${base64Wav}`,
          base64: base64Wav,
          mimeType: 'audio/wav',
          isFallback: isKokoro,
          warning: fallbackWarning
        }
      }
    } catch (err) {
      console.warn('[avatar:tts] Windows SAPI fallback gagal:', err?.message || err)
    }
  }

  // 4) Fallback darurat: msedge-tts
  try {
    const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts')
    const tts = new MsEdgeTTS()
    await tts.setMetadata(fallbackVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)

    const stream = tts.toStream(String(text))
    const chunks = []
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk))
    }
    const buffer = Buffer.concat(chunks)
    return {
      ok: true,
      base64: buffer.toString('base64'),
      mimeType: 'audio/mpeg',
      isFallback: isKokoro,
      warning: fallbackWarning
    }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: baca file model dari disk → kirim base64 + nama file ke renderer.
// Renderer tidak bisa akses filesystem langsung, jadi main yang membacakan.
ipcMain.handle('avatar:read-model', async (_event, modelPath) => {
  try {
    const targetPath = resolveModelPath(modelPath)
    if (!existsSync(targetPath)) {
      return { ok: false, error: `File model tidak ditemukan: ${modelPath}` }
    }
    const buffer = await readFile(targetPath)
    const name = targetPath.split(/[/\\]/).pop() || 'model'
    return {
      ok: true,
      name,
      resolvedPath: targetPath,
      base64: buffer.toString('base64'),
      ext: name.split('.').pop()?.toLowerCase()
    }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// IPC: ubah path filesystem model → URL `model://` (untuk MMD/Live2D yang butuh texture relatif).
ipcMain.handle('avatar:model-url', (_event, modelPath) => {
  const targetPath = resolveModelPath(modelPath)
  // Normalize Windows backslashes dan encode segmen path
  const normalized = targetPath.replace(/\\/g, '/')
  const segments = normalized.split('/')
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
  '.fbx': 'application/octet-stream',
  '.moc3': 'application/octet-stream',
  '.json': 'application/json',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac'
}

// Register custom protocol `model://` untuk serve file model + texture dari disk.
// Diperlukan karena MMDLoader dan Live2D me-resolve texture relatif ke URL model.
protocol.registerSchemesAsPrivileged([
  { scheme: 'model', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

function registerModelProtocol() {
  protocol.handle('model', async (request) => {
    try {
      const url = new URL(request.url)
      // Format: model://local/<segmen-encoded path> (tiap segmen di-encode, `/` tetap).
      const encoded = url.pathname.replace(/^\//, '')
      let filePath = decodeURIComponent(encoded)

      // Normalize drive letters on Windows if needed (e.g. /C:/ -> C:/)
      if (process.platform === 'win32' && /^[a-zA-Z]:/.test(filePath)) {
        // Valid Windows absolute path
      } else if (process.platform !== 'win32' && !filePath.startsWith('/')) {
        // Pada macOS/Linux, jika sebelumnya ada leading slash yang terpotong oleh replace(/^\//, '')
        if (existsSync('/' + filePath)) {
          filePath = '/' + filePath
        }
      }

      if (!existsSync(filePath)) {
        const resolved = resolveModelPath(filePath)
        if (existsSync(resolved)) {
          filePath = resolved
        }
      }

      const ext = extname(filePath).toLowerCase()
      const mime = MIME_MAP[ext] || 'application/octet-stream'

      const data = await readFile(filePath)
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Access-Control-Allow-Origin': '*'
        }
      })
    } catch (err) {
      console.warn('[model-protocol] Not found:', request.url)
      return new Response('Not found', { status: 404 })
    }
  })
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  registerModelProtocol()
  ensureDeployedCompanionAndScripts()

  // Set icon Dock di macOS ke personal companion profile avatar
  if (process.platform === 'darwin' && app.dock) {
    const dockIcon = getAppIconPath()
    if (dockIcon) {
      try {
        app.dock.setIcon(dockIcon)
      } catch (err) {
        console.warn('[Dock Icon] Gagal set icon dock:', err?.message || err)
      }
    }
  }

  createLauncherWindow()
  registerGlobalShortcuts()

  // Jalankan bridge server untuk Web Companion (Chrome & Edge Extension) di port 9124
  startBridgeServer((payload) => {
    handleIncomingWebPrompt(payload)
  })

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
  stopBridgeServer()
  stopAllServices()
  if (process.platform !== 'darwin') app.quit()
})
