import { app, BrowserWindow, ipcMain, protocol, dialog, screen, safeStorage, shell, Menu, session, desktopCapturer } from 'electron'
import { join, resolve, extname, isAbsolute, basename, dirname } from 'path'
import { homedir } from 'os'
import { readFile, writeFile, mkdir, rm } from 'fs/promises'
import { existsSync, statSync, readdirSync, cpSync, mkdirSync, readFileSync, writeFileSync, openSync, readSync, closeSync } from 'fs'


import { execFile, spawn } from 'child_process'

import { approveRoot, isPathAllowed } from './path-guard.js'
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
  restartHermes,
  startRouter,
  resolvePythonCmd,
  resolveHermesCmd,
  resolveRouterBinary,
  resolveRouterApiKey,
  resolveKokoroModelDir,
  resolveHermesConfigPath,
  getAllDetectedPaths,
  loadPersistedPaths,
  savePersistedPath,
  getLogicalDrives,
  fixSystemPath
} from './service-manager.js'
import { connectGateway, disconnectGateway, request as gatewayRequest, isGatewayConnected } from './hermes-gateway.js'
import { registerShortcuts, unregisterShortcuts, getShortcutList, updateShortcut } from './shortcuts.js'
import { startBridgeServer, stopBridgeServer, BRIDGE_PORT } from './bridge-server.js'
import { parseHttpUrl, isLocalRouterUrl } from './url-guard.js'

import YAML from 'yaml'
import { loadOrCreateBridgeToken, BRIDGE_TOKEN_FILE } from './bridge-token.js'

import { createSecretStore } from './secret-store.js'
import { createSecureIpc } from './secure-ipc.js'
import { resolveTerminalAction } from './actions.js'
import { createAppRegistry } from './app-registry.js'
import { RPC_ALLOWED_METHODS } from './ipc-policy.js'
import { readPngSize, estimateTextureMB } from './png-size.js'
import { checkAppUpdate, downloadAndApplyUpdate, relaunchApp } from './updater-service.js'
import { getLiveWeather, getLiveNews } from './feed-service.js'
import { synthesizeTts } from './tts-service.js'
import {
  testProviderConnection,
  fetchEndpointModels,
  updateHermesProviderConfig,
  updateModelConfigYaml,
  normalizeGeminiModel,
  runHermes
} from './provider-service.js'
import { startOpenRouterOAuthFlow, checkProviderQuota } from './oauth-service.js'

const secretStore = createSecretStore(safeStorage)

async function resolveApiKeyFor(sealed, url) {
  const r = secretStore.open(sealed, url)
  if (r.ok && r.key) return r.key
  if (!r.ok && !(r.legacy && isLocalRouterUrl(url))) throw new Error(r.error) // legacy + router lokal: lanjut ke otomatis
  if (isLocalRouterUrl(url)) {
    const k = await resolveRouterApiKey()
    return k?.ok && k?.key ? k.key : ''
  }
  return ''
}

// Inisialisasi perbaikan PATH untuk macOS/Windows sedini mungkin
fixSystemPath()

// Izinkan autoplay audio tanpa memblokir pada startup awal (mencegah NotAllowedError Chromium)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('disable-http-cache')
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')

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

const { secureHandle, secureOn } = createSecureIpc({
  ipcMain,
  getWindows: () => ({
    avatar: avatarWindow,
    settings: launcherWindow,
    launcher: launcherWindow
  }),
  devUrl: process.env['ELECTRON_RENDERER_URL']
})

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
      preload: join(__dirname, '../preload/settings.mjs'),
      contextIsolation: true,
      sandbox: false,


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
      preload: join(__dirname, '../preload/avatar.mjs'),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false
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

  avatarWindow.webContents.on('console-message', (event) => {
    console.log('[Avatar Window]', event?.message ?? '')
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
      if (launcherWindow && !launcherWindow.isDestroyed()) {
        launcherWindow.destroy()
        launcherWindow = null
      }
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
secureHandle('avatar:shortcuts', () => {
  return getShortcutList()
})

// IPC: ubah kombinasi shortcut (custom user).
secureHandle('avatar:set-shortcut', (_event, id, accel) => {
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
    return resolve(modelPath)
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
        return resolve(candidate)
      }
    } catch {
      // Abaikan error stat
    }
  }

  // Fallback terbaik
  return isAbsolute(modelPath) ? resolve(modelPath) : resolve(app.getAppPath(), cleanRel)
}

export function getFixedRoots() {
  return [
    join(app.getAppPath(), 'assets'),
    process.resourcesPath,
    join(homedir(), '.hermes-avatar')
  ].filter(Boolean)
}

// IPC: launcher → main → buka avatar window dengan model terpilih.
secureHandle('avatar:start', (_event, modelPath) => {
  const defaultRelPath = 'assets/live2d/mother/20250106.model3.json'
  const resolvedPath = resolveModelPath(modelPath || defaultRelPath)

  if (!existsSync(resolvedPath)) {
    return { ok: false, error: `File model tidak ditemukan di disk: ${resolvedPath}` }
  }
  approveRoot(dirname(resolvedPath))

  if (avatarWindow && !avatarWindow.isDestroyed()) {
    avatarWindow.focus()
    avatarWindow.webContents.send('avatar:load-model', resolvedPath)
    return { ok: true, reused: true }
  }
  createAvatarWindow(resolvedPath)
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    launcherWindow.destroy()
    launcherWindow = null
  }
  return { ok: true, reused: false }
})

// IPC: jalankan daemon Hermes AI (port 9119) secara on-demand
secureHandle('avatar:start-hermes-server', async () => {
  try {
    const res = await startHermes()
    return res
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: avatar window bisa minta fokus/drag via OS-native (drag region).
secureHandle('avatar:close', () => {
  if (avatarWindow && !avatarWindow.isDestroyed()) avatarWindow.close()
  showLauncherWindow()
})

// IPC: berikan fokus keyboard ke window avatar (untuk mengetik chat).
secureOn('avatar:focus-window', () => {
  if (avatarWindow && !avatarWindow.isDestroyed()) {
    avatarWindow.setFocusable(true)
    avatarWindow.setAlwaysOnTop(true, 'screen-saver')
    avatarWindow.focus()
  }
})

// IPC: kontrol fokus khusus saat chat dibuka/ditutup (agar bisa mengetik tanpa merusak z-order).
secureOn('avatar:chat-focus', (_event, enable) => {
  if (!avatarWindow || avatarWindow.isDestroyed()) return
  avatarWindow.setAlwaysOnTop(true, 'screen-saver')
  if (enable) {
    avatarWindow.focus()
  }
})

// IPC: trigger animasi DVD bounce (fitur/emote).
secureHandle('avatar:dvd-bounce', () => {
  runDvdBounce()
  return { ok: true }
})

// IPC: drag manual window (gantikan app-region: drag).
// Renderer mengirim delta perpindahan mouse; main memindahkan window sesuai.
secureOn('avatar:drag-move', (_event, dx, dy) => {
  if (!avatarWindow || avatarWindow.isDestroyed()) return
  const b = avatarWindow.getBounds()
  avatarWindow.setPosition(b.x + Math.round(dx), b.y + Math.round(dy))
})

// IPC: toggle click-through (klik tembus ke desktop saat di area kosong).
secureOn('avatar:set-ignore-mouse', (_event, ignore, forward) => {
  if (!avatarWindow || avatarWindow.isDestroyed()) return
  avatarWindow.setIgnoreMouseEvents(ignore, { forward: forward !== false })
  // Pastikan Z-order tetap di puncak saat mouse menyentuh area interaktif/avatar
  if (!ignore) {
    avatarWindow.setAlwaysOnTop(true, 'screen-saver')
  }
})

// IPC: buka jendela pengaturan (launcher) dari avatar HUD.
secureHandle('avatar:open-settings', () => {
  showLauncherWindow()
  return { ok: true }
})

// IPC: kontrol window kustom (ala macOS traffic lights)
secureHandle('avatar:window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    win.destroy()
    if (win === launcherWindow) {
      launcherWindow = null
    }
  }
  return { ok: true }
})

secureHandle('avatar:window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) win.minimize()
  return { ok: true }
})

secureHandle('avatar:window-maximize', (event) => {
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

// IPC: jalankan aksi terminal bernama yang terdaftar secara statis
secureHandle('avatar:run-in-terminal', async (_event, actionId) => {
  try {
    const resolved = resolveTerminalAction(actionId)
    if (!resolved) {
      return { ok: false, error: 'Aksi tidak dikenal' }
    }
    const { cmd, args } = resolved

    ensureDeployedCompanionAndScripts()
    const candidateRoots = [
      process.resourcesPath,
      join(homedir(), '.hermes-avatar'),
      join(app.getAppPath(), '..'),
      join(process.cwd(), '..'),
      process.cwd()
    ].filter(Boolean)
    const repoRoot = candidateRoots.find((dir) => existsSync(join(dir, 'scripts', 'kokoro_server.py'))) || candidateRoots[0]
    const cwd = repoRoot

    if (process.platform === 'win32') {
      const safeArgs = args.map(a => `'${a.replace(/'/g, "''")}'`).join(' ')
      const commandLine = `${cmd} ${safeArgs}`
      const safeCwd = cwd.replace(/'/g, "''")
      const safeCmd = `Set-Location '${safeCwd}'; ${commandLine}`
      const child = spawn('cmd.exe', ['/c', 'start', 'Hermes Terminal', 'powershell', '-NoExit', '-Command', safeCmd], {
        cwd,
        detached: true,
        stdio: 'ignore'
      })
      child.unref()
    } else if (process.platform === 'darwin') {
      const commandLine = `${cmd} ${args.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ')}`
      const safeMacCmd = commandLine.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      const safeCwd = cwd.replace(/\\/g, '\\\\').replace(/"/g, '\"')
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
      const child = spawn('x-terminal-emulator', ['-e', cmd, ...args], {
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
secureHandle('avatar:default-model', () => {
  return resolveModelPath('assets/live2d/mother/20250106.model3.json')
})

// IPC: buka dialog pilih file model (native Finder/Explorer).
// Mengembalikan path file yang dipilih, atau null jika batal.
secureHandle('avatar:pick-model', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Pilih model avatar (3D / Live2D)',
    properties: ['openFile'],
    filters: [
      { name: 'Model Avatar', extensions: ['vrm', 'glb', 'gltf', 'pmx', 'pmd', 'fbx', 'model3.json', 'json'] },
      { name: 'Semua file', extensions: ['*'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const chosenPath = result.filePaths[0]
  approveRoot(dirname(chosenPath))
  let estimateMB = 0
  const ext = extname(chosenPath).toLowerCase()
  if (chosenPath.toLowerCase().endsWith('.model3.json') || ext === '.json') {
    try {
      const raw = readFileSync(chosenPath, 'utf8')
      const data = JSON.parse(raw)
      const textures = data?.FileReferences?.Textures || []
      const dir = dirname(chosenPath)
      const sizes = []
      for (const texRel of textures) {
        const texPath = join(dir, texRel)
        if (existsSync(texPath)) {
          const fd = openSync(texPath, 'r')
          const buf = Buffer.alloc(24)
          readSync(fd, buf, 0, 24, 0)
          closeSync(fd)
          const sz = readPngSize(buf)
          if (sz) sizes.push(sz)
        }
      }
      estimateMB = estimateTextureMB(sizes)
    } catch (err) {
      console.warn('[pick-model] Gagal hitung ukuran tekstur:', err?.message || err)
    }
  }

  return { path: chosenPath, estimateMB }
})

// IPC: buka dialog pilih file audio musik lokal (mp3, wav, ogg, flac, m4a, aac).
secureHandle('avatar:pick-audio-files', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Pilih File Lagu / Musik',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'File Audio Musik', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'] },
      { name: 'Semua file', extensions: ['*'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return []
  for (const fp of result.filePaths) {
    approveRoot(dirname(fp))
  }
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

const MUSIC_LIBRARY_FILE = join(homedir(), '.hermes-avatar', 'music_library.json')

export function approveStartupRoots() {
  try {
    // 1. Jalur dari paths.json (loadPersistedPaths)
    const persisted = loadPersistedPaths()
    for (const val of Object.values(persisted)) {
      if (typeof val === 'string' && val && existsSync(val)) {
        try {
          const stats = statSync(val)
          approveRoot(stats.isDirectory() ? val : dirname(val))
        } catch { }
      }
    }

    // 2. Jalur dari music_library.json
    if (existsSync(MUSIC_LIBRARY_FILE)) {
      try {
        const raw = readFileSync(MUSIC_LIBRARY_FILE, 'utf8')
        const data = JSON.parse(raw)
        const tracks = [
          ...(Array.isArray(data?.customTracks) ? data.customTracks : []),
          ...(Array.isArray(data?.tracks) ? data.tracks : [])
        ]
        for (const t of tracks) {
          if (t?.path && existsSync(t.path)) {
            approveRoot(dirname(t.path))
          }
        }
      } catch { }
    }

    // 3. Model default
    const defaultModel = resolveModelPath('assets/live2d/mother/20250106.model3.json')
    if (defaultModel && existsSync(defaultModel)) {
      approveRoot(dirname(defaultModel))
    }
  } catch (err) {
    console.warn('[path-guard] Gagal memuat root tersimpan pada startup:', err?.message || err)
  }
}

// IPC: Memuat pustaka musik permanen (~/.hermes-avatar/music_library.json)
secureHandle('avatar:music-load-library', async () => {
  try {
    if (!existsSync(MUSIC_LIBRARY_FILE)) {
      return { ok: false, notFound: true, path: MUSIC_LIBRARY_FILE }
    }
    const raw = await readFile(MUSIC_LIBRARY_FILE, 'utf-8')
    const data = JSON.parse(raw)
    return { ok: true, data, path: MUSIC_LIBRARY_FILE }
  } catch (err) {
    console.warn('[MusicLibrary] Gagal membaca music_library.json:', err)
    return { ok: false, error: err?.message || String(err), path: MUSIC_LIBRARY_FILE }
  }
})

// IPC: Menyimpan pustaka musik permanen (~/.hermes-avatar/music_library.json)
secureHandle('avatar:music-save-library', async (_event, payload) => {
  try {
    const dir = join(homedir(), '.hermes-avatar')
    await mkdir(dir, { recursive: true })
    await writeFile(MUSIC_LIBRARY_FILE, JSON.stringify(payload, null, 2), 'utf-8')
    return { ok: true, path: MUSIC_LIBRARY_FILE }
  } catch (err) {
    console.warn('[MusicLibrary] Gagal menulis music_library.json:', err)
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: Informasi pustaka musik (lokasi berkas, keberadaan berkas, ukuran)
secureHandle('avatar:music-library-info', async () => {
  try {
    const exists = existsSync(MUSIC_LIBRARY_FILE)
    let stats = null
    if (exists) {
      stats = statSync(MUSIC_LIBRARY_FILE)
    }
    return {
      ok: true,
      path: MUSIC_LIBRARY_FILE,
      exists,
      size: stats?.size || 0,
      updatedAt: stats?.mtime || null
    }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: Buka folder ~/.hermes-avatar di Explorer / Finder
secureHandle('avatar:music-open-folder', async () => {
  try {
    const dir = join(homedir(), '.hermes-avatar')
    await mkdir(dir, { recursive: true })
    await shell.openPath(dir)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})


// IPC: token Hermes gateway — pakai SESSION_TOKEN dari service-manager
// (konsisten antara avatar & hermes serve yang di-spawn otomatis).
secureHandle('avatar:hermes-config', () => {
  return {
    wsUrl: process.env['HERMES_WS_URL'] || 'ws://127.0.0.1:9119/api/ws',
    token: SESSION_TOKEN
  }
})

// Cache untuk status pip Kokoro agar tidak spawn proses python berat tiap interval
let cachedKokoroPip = { installed: null, lastCheck: 0 }

async function checkKokoroPipInstalled(pyCmd, force = false) {
  const now = Date.now()
  if (!force && cachedKokoroPip.installed !== null && (now - cachedKokoroPip.lastCheck < 180000)) {
    return cachedKokoroPip.installed
  }
  if (!pyCmd) return false
  try {
    await new Promise((res, rej) => {
      execFile(pyCmd, ['-c', 'import kokoro_onnx, soundfile; print("ok")'], { timeout: 3500, env: process.env }, (err, stdout) => {
        if (!err && stdout && stdout.includes('ok')) return res(true)
        rej(err || new Error('Module import failed'))
      })
    })
    cachedKokoroPip = { installed: true, lastCheck: now }
    return true
  } catch {
    cachedKokoroPip = { installed: false, lastCheck: now }
    return false
  }
}

// IPC: status service (9Router, Hermes, Kokoro, Companion Bridge) — murni cek port via TCP non-blocking (<0.1ms)
secureHandle('avatar:service-status', async () => {
  const router = await isPortOpen(ROUTER_PORT)
  const hermes = await isPortOpen(HERMES_PORT)
  const kokoro = await isPortOpen(KOKORO_PORT)
  const companion = await isPortOpen(BRIDGE_PORT)

  return {
    router,
    hermes,
    kokoro,
    companion
  }
})

// IPC: ambil seluruh status jalur yang terdeteksi di komputer (hanya dipanggil 1x saat inisialisasi / permintaan)
secureHandle('avatar:get-detected-paths', async () => {
  const paths = await getAllDetectedPaths(false)
  let kokoroInstalled = false
  if (paths.python?.ok && paths.python?.cmd) {
    kokoroInstalled = await checkKokoroPipInstalled(paths.python.cmd, false)
  }
  return { ...paths, kokoroInstalled }
})

// IPC: simpan jalur kustom pengguna (~/.hermes-avatar/paths.json)
secureHandle('avatar:set-custom-path', async (_event, key, val) => {
  try {
    const ok = savePersistedPath(key, val)
    const all = await getAllDetectedPaths(true)
    return { ok, all }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: buka dialog pemilihan berkas/folder kustom native OS
secureHandle('avatar:browse-custom-path', async (_event, key, type = 'file') => {
  try {
    const isDir = type === 'dir' || type === 'folder'
    const properties = [isDir ? 'openDirectory' : 'openFile']
    let filters = [{ name: 'Semua berkas', extensions: ['*'] }]
    if (key === 'hermes_bin' || key === 'router_bin' || key === 'python_bin') {
      filters = process.platform === 'win32'
        ? [{ name: 'Aplikasi & Script', extensions: ['exe', 'cmd', 'bat', '*'] }, { name: 'Semua berkas', extensions: ['*'] }]
        : [{ name: 'Semua berkas', extensions: ['*'] }]
    }
    const res = await dialog.showOpenDialog({
      title: isDir ? 'Pilih Folder Direktori' : 'Pilih Berkas Eksekusi / Script',
      properties,
      filters
    })
    if (res.canceled || res.filePaths.length === 0) {
      return { canceled: true }
    }
    const chosenPath = res.filePaths[0]
    approveRoot(isDir ? chosenPath : dirname(chosenPath))
    savePersistedPath(key, chosenPath)
    const all = await getAllDetectedPaths(true)
    return { ok: true, path: chosenPath, all }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: pindai ulang seluruh jalur dan logical drive secara dinamis (Hanya berjalan saat tombol ditekan manual)
secureHandle('avatar:rescan-paths', async () => {
  try {
    cachedKokoroPip.installed = null
    const paths = await getAllDetectedPaths(true)
    let kokoroInstalled = false
    if (paths.python?.ok && paths.python?.cmd) {
      kokoroInstalled = await checkKokoroPipInstalled(paths.python.cmd, true)
    }
    return { ok: true, all: { ...paths, kokoroInstalled } }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: jalankan 9Router daemon jika terpasang
secureHandle('avatar:start-router', async () => {
  try {
    const res = await startRouter()
    return res
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: jalankan script server Kokoro-TTS (Lokal)
secureHandle('avatar:start-kokoro-server', async () => {
  try {
    const res = await startKokoro()
    return res
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: install dependensi Kokoro via pip (mendukung Windows, macOS & Linux termasuk flag --break-system-packages bila diperlukan)
secureHandle('avatar:install-kokoro-deps', async () => {
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
      cachedKokoroPip.installed = true
      return { ok: true, output: out }
    } catch (err) {
      // Fallback untuk macOS Homebrew Python PEP 668 externally managed environment
      if (err.message?.includes('externally-managed-environment') || process.platform !== 'win32') {
        try {
          const out = await runPip(['--break-system-packages'])
          cachedKokoroPip.installed = true
          return { ok: true, output: out }
        } catch (err2) {
          throw err2
        }
      }
      throw err
    }
  } catch (err) {
    cachedKokoroPip.installed = null
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: uninstall dependensi Kokoro via pip
secureHandle('avatar:uninstall-kokoro-deps', async () => {
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
      cachedKokoroPip.installed = false
      return { ok: true, output: out }
    } catch (err) {
      if (process.platform !== 'win32') {
        const out = await runUninstall(['--break-system-packages'])
        cachedKokoroPip.installed = false
        return { ok: true, output: out }
      }
      throw err
    }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: buka folder penyimpanan paket di File Explorer / Finder
secureHandle('avatar:open-package-folder', async (_event, pkgName = 'kokoro') => {
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
secureHandle('avatar:clean-package', async (_event, pkgName = 'kokoro') => {
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

// IPC: trigger tes pengingat idle secara instan dari jendela Pengaturan ke Avatar
secureHandle('avatar:trigger-idle-chatter', (_event, line) => {
  if (avatarWindow && !avatarWindow.isDestroyed()) {
    avatarWindow.webContents.send('avatar:trigger-idle-chatter', line)
    return { ok: true }
  }
  return { ok: false, error: 'Avatar window belum aktif' }
})

// IPC: periksa pembaruan rilis aplikasi
secureHandle('avatar:check-update', async () => {
  return await checkAppUpdate()
})

// IPC: ambil versi aplikasi saat ini
secureHandle('avatar:get-app-version', () => {
  return app.getVersion()
})

// IPC: buka URL rilis / download file installer di browser
secureHandle('avatar:open-external-url', async (_event, url) => {
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
secureHandle('avatar:download-and-apply-update', async (event, _downloadUrl, assetName) => {
  return await downloadAndApplyUpdate(event, _downloadUrl, assetName)
})


// IPC: Relaunch aplikasi untuk menerapkan update (hentikan seluruh service & bridge terlebih dahulu)
secureHandle('avatar:relaunch-app', () => {
  relaunchApp(() => {
    stopMotion()
    unregisterGlobalShortcuts()
    disconnectGateway()
    stopBridgeServer()
    stopAllServices()
  })
})


// IPC: RPC config/model ke Hermes (shared gateway) — untuk LLM section.
secureHandle('avatar:rpc', async (_event, method, params) => {
  if (!RPC_ALLOWED_METHODS.includes(method)) {
    console.warn('[rpc] DITOLAK: method tidak diizinkan', method)
    return { ok: false, error: 'RPC method ditolak' }
  }
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
secureHandle('avatar:add-skill', async (_event, { name, category, content }) => {
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
secureHandle('avatar:delete-skill', async (_event, { name, category }) => {
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
secureHandle('avatar:test-connection', async (_event, url, model, apiKey) => {
  return await testProviderConnection({ url, model, apiKey, resolveApiKeyFor })
})


// IPC: set full LLM provider ke Hermes (config.yaml + .env + RPC gateway)
secureHandle('avatar:set-llm-provider', async (_event, payload) => {
  try {
    const { name, baseUrl, apiKey, model } = payload || {}
    const modelName = normalizeGeminiModel(baseUrl, String(model || '').trim())
    if (!modelName) return { ok: false, error: 'Model identifier wajib diisi' }
    if (!parseHttpUrl(baseUrl)) {
      return { ok: false, error: 'URL endpoint LLM tidak valid. Harus menggunakan protokol http atau https.' }
    }

    let effectiveKey = ''
    try {
      effectiveKey = await resolveApiKeyFor(apiKey, baseUrl)
    } catch (err) {
      return { ok: false, error: err?.message || 'Format kunci tidak valid' }
    }

    await updateHermesProviderConfig({ name, baseUrl, apiKey: effectiveKey, model: modelName })

    // Set via RPC jika terhubung
    if (isGatewayConnected()) {
      try {
        await gatewayRequest('config.set', { key: 'model.default', value: modelName })
        await gatewayRequest('config.set', { key: 'model.provider', value: 'custom' })
        await gatewayRequest('config.set', { key: 'model.base_url', value: baseUrl })
      } catch (_) { }
    }

    // Restart server Hermes agar process runtime memuat konfigurasi baru
    const restartRes = await restartHermes()
    if (restartRes?.ok === false) {
      return {
        ok: true,
        restarted: false,
        warning: restartRes.error || 'Hermes perlu di-restart manual agar konfigurasi baru terbaca.',
        model: modelName,
        name,
        baseUrl
      }
    }

    return { ok: true, restarted: true, model: modelName, name, baseUrl }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: restart Hermes daemon
secureHandle('avatar:restart-hermes', async () => {
  try {
    const res = await restartHermes()
    return { ok: res.ok, already: res.already, error: res.error }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: ambil model aktual langsung dari endpoint OpenAI-compatible (9Router, Ollama, dll)
secureHandle('avatar:fetch-endpoint-models', async (_event, baseUrl, apiKey) => {
  return await fetchEndpointModels({ baseUrl, apiKey, resolveApiKeyFor })
})

// IPC: Login OAuth PKCE resmi 1-klik (OpenRouter)
secureHandle('avatar:start-oauth-login', async (_event, providerId = 'openrouter') => {
  if (providerId !== 'openrouter') {
    return { ok: false, error: 'Penyedia OAuth tidak didukung' }
  }
  return await startOpenRouterOAuthFlow({ shell, secretStore })
})

// IPC: Periksa sisa kuota, limit, dan status paket provider aktif
secureHandle('avatar:check-provider-quota', async (_event, baseUrl, apiKey) => {
  return await checkProviderQuota({ baseUrl, apiKey, resolveApiKeyFor })
})

// IPC: Tangkap layar aktif + daftar jendela terbuka untuk Screen Vision interaktif (Snipping tool / Fullscreen / Window)
secureHandle('avatar:capture-screen', async (_event, options = {}) => {
  try {
    const opts = (options && typeof options === 'object') ? options : {}
    const { mode = 'fullscreen', sourceId, cropRect, listSourcesOnly } = opts

    // Jika dipanggil hanya untuk mengambil daftar jendela aktif
    if (listSourcesOnly) {
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true
      })
      const windows = sources
        .filter((s) => s.name && !/hermes avatar/i.test(s.name))
        .map((s) => ({
          id: s.id,
          name: s.name.trim(),
          dataUrl: s.thumbnail && !s.thumbnail.isEmpty() ? `data:image/jpeg;base64,${s.thumbnail.toJPEG(75).toString('base64')}` : null
        }))
        .filter((w) => Boolean(w.name))
      return { ok: true, windows }
    }

    const primaryDisplay = screen.getPrimaryDisplay()
    const scaleFactor = primaryDisplay?.scaleFactor || 1
    const screenWidth = Math.round((primaryDisplay?.bounds?.width || 1920) * scaleFactor)
    const screenHeight = Math.round((primaryDisplay?.bounds?.height || 1080) * scaleFactor)

    let selectedImg = null
    let captureLabel = 'Layar Penuh'
    let openWindows = []

    if (mode === 'window' && sourceId) {
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 1920, height: 1080 }
      })
      const winSource = sources.find((s) => s.id === sourceId) || sources.find((s) => s.name === sourceId)
      if (!winSource || winSource.thumbnail.isEmpty()) {
        return { ok: false, error: 'Jendela yang dipilih tidak ditemukan atau sudah ditutup.' }
      }
      selectedImg = winSource.thumbnail
      captureLabel = `Jendela: ${winSource.name}`
      openWindows = sources
        .filter((s) => s.name && !/hermes avatar/i.test(s.name) && s.id !== winSource.id)
        .map((s) => s.name.trim())
        .slice(0, 8)
    } else if (mode === 'area' && cropRect && typeof cropRect === 'object') {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: screenWidth, height: screenHeight }
      })
      const screenSource = sources.find((s) => String(s.id || '').startsWith('screen:')) || sources[0]
      if (!screenSource || screenSource.thumbnail.isEmpty()) {
        return { ok: false, error: 'Gagal menangkap layar untuk pemotongan area.' }
      }
      const fullImg = screenSource.thumbnail
      const fullSize = fullImg.getSize()

      // Validasi batas koordinat crop
      let rx = Math.max(0, Math.min(Math.round(cropRect.x || 0), fullSize.width - 20))
      let ry = Math.max(0, Math.min(Math.round(cropRect.y || 0), fullSize.height - 20))
      let rw = Math.max(20, Math.min(Math.round(cropRect.width || fullSize.width), fullSize.width - rx))
      let rh = Math.max(20, Math.min(Math.round(cropRect.height || fullSize.height), fullSize.height - ry))

      selectedImg = fullImg.crop({ x: rx, y: ry, width: rw, height: rh })
      captureLabel = `Area Kotak (${rw}×${rh} px)`

      openWindows = sources
        .filter((s) => String(s.id || '').startsWith('window:') && s.name && !/hermes avatar/i.test(s.name))
        .map((s) => String(s.name).trim())
        .filter(Boolean)
        .slice(0, 8)
    } else {
      // Default: Layar Penuh
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: screenWidth, height: screenHeight }
      })
      const screenSource = sources.find((s) => String(s.id || '').startsWith('screen:')) || sources[0]
      if (!screenSource || screenSource.thumbnail.isEmpty()) {
        return { ok: false, error: 'Gagal menangkap thumbnail layar penuh.' }
      }
      selectedImg = screenSource.thumbnail
      captureLabel = 'Layar Penuh'

      openWindows = sources
        .filter((s) => String(s.id || '').startsWith('window:') && s.name && !/hermes avatar/i.test(s.name))
        .map((s) => String(s.name).trim())
        .filter(Boolean)
        .slice(0, 8)
    }

    if (!selectedImg || selectedImg.isEmpty()) {
      return { ok: false, error: 'Hasil tangkapan gambar kosong.' }
    }

    const jpgBuf = selectedImg.toJPEG(85)
    const dataUrl = `data:image/jpeg;base64,${jpgBuf.toString('base64')}`

    const outDir = join(homedir(), '.hermes-avatar')
    await mkdir(outDir, { recursive: true })
    const filePath = join(outDir, 'latest-screen-capture.jpg')
    await writeFile(filePath, jpgBuf)

    return {
      ok: true,
      dataUrl,
      filePath,
      openWindows,
      mode,
      label: captureLabel
    }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: Auto-failover ke provider cadangan saat provider aktif kena limit/kuota
secureHandle('avatar:failover-llm-provider', async (_event, candidates, currentInfo) => {
  try {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return { ok: false, error: 'Tidak ada kandidat provider cadangan.' }
    }

    const curBase = String(currentInfo?.baseUrl || '').trim().replace(/\/+$/, '').toLowerCase()
    const curModel = String(currentInfo?.model || '').trim().toLowerCase()

    const backup = candidates.find((c) => {
      if (!c || typeof c !== 'object') return false
      const base = String(c.baseUrl || '').trim()
      const modelName = String(c.model || '').trim()
      if (!parseHttpUrl(base) || !modelName) return false
      const normBase = base.replace(/\/+$/, '').toLowerCase()
      return !(normBase === curBase && modelName.toLowerCase() === curModel)
    })

    if (!backup) {
      return { ok: false, error: 'Tidak ada provider cadangan valid yang berbeda dari provider aktif.' }
    }

    const baseUrl = String(backup.baseUrl).trim()
    const modelName = normalizeGeminiModel(baseUrl, String(backup.model).trim())
    const name = String(backup.name || 'Backup Provider').trim()
    const effectiveKey = await resolveApiKeyFor(String(backup.apiKey || ''), baseUrl)

    await updateHermesProviderConfig({ name, baseUrl, apiKey: effectiveKey, model: modelName })

    if (isGatewayConnected()) {
      try {
        await gatewayRequest('config.set', { key: 'model.default', value: modelName })
        await gatewayRequest('config.set', { key: 'model.provider', value: 'custom' })
        await gatewayRequest('config.set', { key: 'model.base_url', value: baseUrl })
      } catch { /* fallback ke restart */ }
    }

    const restartRes = await restartHermes()
    return {
      ok: true,
      restarted: !!restartRes?.ok,
      provider: {
        id: String(backup.id || ''),
        name,
        baseUrl,
        model: modelName,
      },
    }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})


// IPC: set model aktif via 3-layer (RPC gateway -> hermes CLI -> config.yaml fallback).
secureHandle('avatar:set-model', async (_event, model) => {
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

    // Layer 3: Tulis langsung ke config.yaml & .env
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

// IPC: ambil info model LLM aktif (dari Gateway bila online, atau config.yaml langsung)
secureHandle('avatar:get-current-model', async () => {
  try {
    if (isGatewayConnected()) {
      try {
        const res = await gatewayRequest('config.get', { key: 'provider' })
        if (res && res.model && res.model !== '—' && res.model !== 'none') {
          return { ok: true, model: res.model, provider: res.provider || 'default' }
        }
      } catch (_) { }
    }
    // Fallback: baca config.yaml langsung
    const cfgPath = resolveHermesConfigPath()
    if (existsSync(cfgPath)) {
      const cfg = await readFile(cfgPath, 'utf8')
      const matchModel = cfg.match(/^\s+default:\s*([^\r\n#]+)/m) || cfg.match(/^model:\s*([^\r\n#]+)/m)
      const matchProvider = cfg.match(/^\s+provider:\s*([^\r\n#]+)/m)
      if (matchModel && matchModel[1]) {
        const model = matchModel[1].trim()
        if (model && model !== '—' && model !== 'none' && model !== 'Tidak ada model') {
          return {
            ok: true,
            model,
            provider: matchProvider && matchProvider[1] ? matchProvider[1].trim() : 'custom'
          }
        }
      }
    }
    return { ok: false, model: null, error: 'Belum ada model LLM yang dipilih' }
  } catch (err) {
    return { ok: false, model: null, error: err?.message || String(err) }
  }
})

// IPC: set TTS config (voice) ke Hermes — tulis config.yaml langsung.
secureHandle('avatar:set-tts-config', async (_event, { voice }) => {
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
secureHandle('avatar:set-stt-config', async (_event, { model, language }) => {
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
function updateYamlNested(yaml, section, sub, key, value) {
  const lines = yaml.split('\n')
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
secureHandle('avatar:install-skill', async (_event, skillId) => {
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
secureHandle('avatar:browse-skills', async (_event, query) => {
  try {
    const q = String(query || '').trim()
    if (q) {
      if (!SAFE_QUERY.test(q)) {
        return { ok: false, error: 'Kata kunci mengandung karakter yang tidak diizinkan' }
      }
      const out = await runHermes(['skills', 'search', q, '--json'], 60000, 2)
      return { ok: true, output: out }
    }
    const out = await runHermes(['skills', 'browse', '--json'], 60000)
    return { ok: true, output: out }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: encrypt secret via origin-bound secretStore.
secureHandle('avatar:encrypt-secret', (_event, plaintext, baseUrl) => {
  try {
    return { ok: true, value: secretStore.seal(plaintext, baseUrl) }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: pilih file aplikasi (native dialog) → mendaftarkan ke registry & mengembalikan { id, name }
secureHandle('avatar:pick-app', async () => {
  const filters = process.platform === 'darwin'
    ? [{ name: 'Aplikasi', extensions: ['app'] }]
    : process.platform === 'win32'
      ? [{ name: 'Aplikasi', extensions: ['exe', 'lnk'] }]
      : [{ name: 'Aplikasi', extensions: ['desktop', 'appimage'] }]

  const result = await dialog.showOpenDialog({
    title: 'Pilih aplikasi',
    properties: ['openFile'],
    filters
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const filePath = result.filePaths[0]
  const regRes = await appRegistry.registerApp(filePath, '', 'user')
  if (!regRes.ok) return null
  return regRes.app
})

const APPS_CACHE_FILE = join(homedir(), '.hermes-avatar', 'apps_cache.json')

const appRegistry = createAppRegistry({
  cacheFile: APPS_CACHE_FILE,
  fs: { existsSync, readFileSync, writeFileSync },
  shell,
  dialog,
  execFile
})

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

// IPC: jalankan aplikasi berdasarkan appId aman yang terdaftar di registry
secureHandle('avatar:launch-app', async (_event, appId) => {
  try {
    return await appRegistry.launchById(appId)
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: Scan semua aplikasi terpasang di Windows (Start Menu & Builtins)
secureHandle('avatar:scan-installed-apps', async () => {
  try {
    const scanned = scanWindowsShortcuts()
    const apps = appRegistry.setScannedApps(scanned)
    return { ok: true, apps, count: apps.length }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: Ambil cache aplikasi terpasang (jika belum ada, lakukan auto-scan)
secureHandle('avatar:get-installed-apps', async () => {
  try {
    let apps = appRegistry.getPublicList()
    if (apps.length === 0) {
      const scanned = scanWindowsShortcuts()
      apps = appRegistry.setScannedApps(scanned)
    }
    return { ok: true, apps, count: apps.length }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: Belajar / simpan aplikasi baru dengan konfirmasi native user
secureHandle('avatar:learn-app', async (_event, appData) => {
  try {
    const targetPath = typeof appData === 'string' ? appData : appData?.path || appData?.command
    const name = typeof appData === 'object' ? appData?.name : ''
    return await appRegistry.learnAppWithConfirmation(targetPath, name)
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: Cuaca real-time live (Open-Meteo / WMO — gratis, response cepat <300ms)
secureHandle('avatar:get-live-weather', async (_event, city = 'Jakarta') => {
  return await getLiveWeather(city)
})


// IPC: Berita terkini Indonesia live hari ini (Google News RSS Indonesia)
secureHandle('avatar:get-live-news', async () => {
  return await getLiveNews()
})


// IPC: ambil icon aplikasi berdasarkan appId (NativeImage → data URL PNG)
secureHandle('avatar:app-icon', async (_event, appId) => {
  try {
    const entry = appRegistry.findById(appId)
    if (!entry || !entry.path || !existsSync(entry.path)) return { ok: false, error: 'Aplikasi tidak ditemukan' }
    const icon = await app.getFileIcon(entry.path, { size: 'normal' })
    if (!icon || icon.isEmpty()) return { ok: false, error: 'Icon tidak ditemukan' }
    return { ok: true, dataUrl: icon.toDataURL() }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: pilih file animasi (native dialog, filter GLB/VMD).
secureHandle('avatar:pick-animation', async () => {
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
secureHandle('avatar:preview-animation', async (_event, data) => {
  if (avatarWindow && !avatarWindow.isDestroyed()) {
    avatarWindow.webContents.send('avatar:preview-animation', data)
    return { ok: true }
  }
  return { ok: false, error: 'Jendela avatar belum aktif' }
})

// IPC: TTS — menggunakan tts-service terpusat
secureHandle('avatar:tts', async (_event, text, voice, options = {}) => {
  return await synthesizeTts({
    text,
    voice,
    options,
    sessionToken: SESSION_TOKEN,
    isPortOpen,
    startKokoro,
    kokoroPort: KOKORO_PORT
  })
})


// IPC: baca file model dari disk → kirim base64 + nama file ke renderer.
// Renderer tidak bisa akses filesystem langsung, jadi main yang membacakan.
secureHandle('avatar:read-model', async (_event, modelPath) => {
  try {
    const targetPath = resolveModelPath(modelPath)
    if (!existsSync(targetPath)) {
      return { ok: false, error: `File model tidak ditemukan: ${modelPath}` }
    }

    if (!isPathAllowed(targetPath, getFixedRoots())) {
      return { ok: false, error: 'Path tidak diizinkan' }
    }

    const ext = extname(targetPath).toLowerCase()
    if (!MIME_MAP[ext]) {
      return { ok: false, error: 'Ekstensi file tidak diizinkan' }
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
secureHandle('avatar:model-url', (_event, modelPath) => {
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
  '.vrm': 'application/octet-stream',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
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
  {
    scheme: 'model',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

function registerModelProtocol() {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*'
  }

  protocol.handle('model', async (request) => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    try {
      const url = new URL(request.url)
      // Format: model://local/<segmen-encoded path> atau model://<drive>/<path>
      const hostPrefix = url.hostname && url.hostname !== 'local'
        ? (url.hostname.length === 1 ? `${url.hostname}:/` : `${url.hostname}/`)
        : ''
      const encoded = `${hostPrefix}${url.pathname.replace(/^\//, '')}`
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

      if (!existsSync(filePath)) {
        return new Response('Not found', { status: 404, headers: corsHeaders })
      }

      if (!isPathAllowed(filePath, getFixedRoots())) {
        return new Response('Path tidak diizinkan', { status: 403, headers: corsHeaders })
      }

      const ext = extname(filePath).toLowerCase()
      if (!MIME_MAP[ext]) {
        return new Response('Ekstensi tidak diizinkan', { status: 403, headers: corsHeaders })
      }

      const mime = MIME_MAP[ext] || 'application/octet-stream'

      const data = await readFile(filePath)
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': mime,
          ...corsHeaders
        }
      })
    } catch (err) {
      console.warn('[model-protocol] Not found:', request.url)
      return new Response('Not found', { status: 404, headers: corsHeaders })
    }
  })
}

app.on('web-contents-created', (_e, wc) => {
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  wc.on('will-navigate', (e, url) => {
    const dev = process.env['ELECTRON_RENDERER_URL']
    if (!(url.startsWith('file://') || (dev && url.startsWith(dev)))) e.preventDefault()
  })
  wc.on('will-attach-webview', (e) => e.preventDefault())
})

app.whenReady().then(() => {
  if (process.env.HERMES_DEBUG) {
    console.log('[env]', process.versions.electron, process.versions.node, process.versions.chrome)
  }
  if (process.env.HERMES_PERF === '1') {
    app.getGPUInfo('basic')
      .then((gpu) => console.log('[PERF GPU]', JSON.stringify(gpu)))
      .catch((err) => console.warn('[PERF GPU] Gagal baca GPU info:', err?.message || err))

    setInterval(() => {
      const summary = app.getAppMetrics().map((m) => ({
        type: m.type,
        pid: m.pid,
        memoryMB: Math.round((m.memory?.workingSetSize || 0) / 1024),
        cpuPercent: m.cpu?.percentCPUUsage ?? 0
      }))
      console.log('[PERF Metrics]', JSON.stringify(summary))
    }, 30000)
  }
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'))
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media')
  Menu.setApplicationMenu(null)
  approveStartupRoots()
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
  console.log('[Bridge Server] Token file:', BRIDGE_TOKEN_FILE)
  startBridgeServer((payload) => {
    handleIncomingWebPrompt(payload)
  }, loadOrCreateBridgeToken())

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
