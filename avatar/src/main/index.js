import { app, BrowserWindow, ipcMain, protocol, dialog, screen, safeStorage, shell, Menu, session, desktopCapturer } from 'electron'
import { join, resolve, extname, isAbsolute, basename, dirname } from 'path'
import { homedir } from 'os'
import { readFile, writeFile, mkdir, rm } from 'fs/promises'
import { existsSync, statSync, readdirSync, cpSync, mkdirSync, readFileSync, writeFileSync, openSync, readSync, closeSync, createReadStream, copyFileSync } from 'fs'
import { Readable } from 'node:stream'


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
import { createAppRegistry, computeAppId } from './app-registry.js'
import { RPC_ALLOWED_METHODS } from './ipc-policy.js'
import { SAFE_QUERY } from './cli-args.js'
import { readPngSize, estimateTextureMB } from './png-size.js'
import { checkAppUpdate, downloadAndApplyUpdate, relaunchApp, cleanupStaleOtaTempDirs } from './updater-service.js'
import { getLiveWeather, getLiveNews, getAcademicPapers } from './feed-service.js'
import { synthesizeTts } from './tts-service.js'
import {
  testProviderConnection,
  fetchEndpointModels,
  fetchModelsForProviders,
  updateHermesProviderConfig,
  updateHermesVoiceConfig,
  loadSavedLlmProviders,
  saveSavedLlmProviders,
  upsertSavedLlmProviderOnDisk,
  updateModelConfigYaml,
  normalizeGeminiModel,
  runHermes
} from './provider-service.js'
import { startOpenRouterOAuthFlow, checkProviderQuota } from './oauth-service.js'
import { installPackageOneClick, getInstallQueueState, isPackageInstallRunning } from './package-installer.js'
import {
  searchHermesSessions,
  manageHermesSessionRpc,
  listHermesCronJobs,
  manageHermesCronJob,
  createCronOutputWatcher,
  loadHermesMemoryFiles,
  saveHermesMemoryFile,
  loadHermesMcpServers,
  saveHermesMcpServer,
  deleteHermesMcpServer,
  toggleHermesMcpServer,
  getMessagingGatewayState,
  saveMessagingGatewayEnv,
  controlMessagingGateway,
  loadFallbackAndMoaConfig,
  saveFallbackChain,
  saveMoaConfig,
  getKanbanAndSubagents,
  manageKanbanAndSubagent
} from './hermes-brain-service.js'
import {
  getStorageSummary,
  getStorageEngineSummary,
  listStorageCategoryItems,
  deleteStorageItem,
  clearStorageCategory,
  vacuumHermesStateDb,
  resolveSafeStorageFolder,
  archiveScreenCapture,
  archiveDroppedFile
} from './storage-service.js'
import { resolveSafeCropRect, pickMatchingScreenSource } from './screen-capture-utils.js'
import {
  searchOnlineMusic,
  resolveMusicStream,
  handleMusicStreamProtocolRequest,
  controlBackgroundMusicPlayer,
  stopBackgroundMusicPlayer,
  isBackgroundMusicWebContents,
  downloadAudioToCache,
  findCachedAudioFile,
  getAudioCacheDir,
  extractYouTubeVideoId
} from './music-service.js'

const secretStore = createSecretStore(safeStorage)

const PROVIDER_SLUG_BASE_URLS = {
  openrouter: 'https://openrouter.ai/api/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  openai: 'https://api.openai.com/v1',
  '9router': 'http://127.0.0.1:20128/v1',
  ollama: 'http://127.0.0.1:11434/v1'
}

function normalizeProviderUrl(u) {
  return String(u || '').trim().replace(/\/+$/, '').toLowerCase()
}

function inferProviderBaseUrlFromSlug(providerName) {
  const s = String(providerName || '').trim().toLowerCase()
  if (!s) return ''
  for (const [slug, url] of Object.entries(PROVIDER_SLUG_BASE_URLS)) {
    if (s.includes(slug)) return url
  }
  return ''
}

async function findConfiguredApiKeyInHermesYaml(targetUrl) {
  const normTarget = normalizeProviderUrl(targetUrl)
  if (!normTarget) return ''

  try {
    const cfgPath = resolveHermesConfigPath()
    if (cfgPath && existsSync(cfgPath)) {
      const cfgRaw = await readFile(cfgPath, 'utf8')
      const doc = YAML.parse(cfgRaw) || {}

      const m = doc?.model && typeof doc.model === 'object' ? doc.model : null
      if (m && normalizeProviderUrl(m.base_url) === normTarget) {
        const directKey = String(m.api_key || '').trim()
        if (directKey && directKey !== 'no-key-required') return directKey
        if (m.provider && doc.providers?.[m.provider]?.api_key) {
          const provKey = String(doc.providers[m.provider].api_key).trim()
          if (provKey && provKey !== 'no-key-required') return provKey
        }
      }

      const provEntries = doc?.providers && typeof doc.providers === 'object' ? Object.values(doc.providers) : []
      const customEntries = Array.isArray(doc?.custom_providers) ? doc.custom_providers : []
      for (const entry of [...provEntries, ...customEntries]) {
        if (!entry || typeof entry !== 'object') continue
        const entryUrl = normalizeProviderUrl(entry.base_url || entry.baseUrl)
        const entryKey = String(entry.api_key || '').trim()
        if (entryUrl === normTarget && entryKey && entryKey !== 'no-key-required') {
          return entryKey
        }
      }
    }
  } catch { /* fallback env below */ }

  if (
    process.env.OPENAI_BASE_URL &&
    normalizeProviderUrl(process.env.OPENAI_BASE_URL) === normTarget &&
    process.env.OPENAI_API_KEY &&
    process.env.OPENAI_API_KEY !== 'no-key-required'
  ) {
    return String(process.env.OPENAI_API_KEY).trim()
  }

  return ''
}

async function ensureLocalRouterIfTarget(target) {
  const urls = Array.isArray(target) ? target : [target]
  const needsRouter = urls.some((u) => u && isLocalRouterUrl(u))
  if (!needsRouter) return
  try {
    if (!(await isPortOpen(ROUTER_PORT))) {
      await startRouter()
    }
  } catch { /* biarkan fetch melaporkan detail error bila 9Router memang belum terpasang */ }
}

async function resolveApiKeyFor(sealed, url) {
  const rawSealed = String(sealed ?? '').trim()
  const r = secretStore.open(sealed, url)
  if (r.ok && r.key) return r.key
  if (rawSealed.startsWith('v2:') && !r.ok) throw new Error(r.error)

  if (isLocalRouterUrl(url)) {
    const k = await resolveRouterApiKey()
    return k?.ok && k?.key ? k.key : ''
  }

  const fromYaml = await findConfiguredApiKeyInHermesYaml(url)
  if (fromYaml) return fromYaml

  if (!r.ok) throw new Error(r.error)
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
          if (!existsSync(dstFile) || !readFileSync(srcFile).equals(readFileSync(dstFile))) {
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

      // Sinkronkan bridge-token.json lokal ke folder ekstensi agar ekstensi siap pakai tanpa salin manual
      try {
        const tokenInfo = loadOrCreateBridgeToken()
        if (tokenInfo?.token) {
          const tokenFileInExt = join(userExtDir, 'bridge-token.json')
          const tokenPayload = JSON.stringify({ bridgeToken: tokenInfo.token }, null, 2)
          if (!existsSync(tokenFileInExt) || readFileSync(tokenFileInExt, 'utf8') !== tokenPayload) {
            writeFileSync(tokenFileInExt, tokenPayload, 'utf8')
          }
        }
      } catch {
        // Abaikan bila gagal menyinkronkan bridge-token.json
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

  launcherWindow.on('close', (e) => {
    if (isPackageInstallRunning()) {
      e.preventDefault()
      launcherWindow.hide()
    }
  })

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

    // Forward pending session resume dari jendela Settings jika ada
    if (pendingResumeSession) {
      const resumeToDeliver = pendingResumeSession
      pendingResumeSession = null
      setTimeout(() => {
        if (avatarWindow && !avatarWindow.isDestroyed()) {
          avatarWindow.webContents.send('avatar:resume-session', resumeToDeliver)
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

// --- Buffer antrian Web Companion Prompt & Resume Session saat avatar belum siap ---
let pendingWebPrompt = null
let pendingResumeSession = null
let cronOutputWatcher = null

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
 * Helper untuk mengekstrak subpath relatif aset (misal: 'live2d/mother/20250106.model3.json')
 * jika sebuah modelPath adalah path absolut dari komputer pengembang atau instalasi lain.
 */
function extractAssetSubpath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return ''
  const normalized = rawPath.replace(/\\/g, '/')
  const assetsIdx = normalized.toLowerCase().indexOf('/assets/')
  if (assetsIdx !== -1) {
    return normalized.slice(assetsIdx + 8)
  }
  if (normalized.toLowerCase().startsWith('assets/')) {
    return normalized.slice(7)
  }
  const live2dIdx = normalized.toLowerCase().indexOf('/live2d/')
  if (live2dIdx !== -1) {
    return 'live2d/' + normalized.slice(live2dIdx + 8)
  }
  if (normalized.toLowerCase().startsWith('live2d/')) {
    return normalized
  }
  return ''
}

/**
 * Mencari model alternatif bawaan di disk jika model yang diminta pengguna tidak ditemukan.
 * Menjamin avatar selalu bisa terbuka tanpa crash atau gagal start.
 */
export function findFallbackModelPath() {
  const defaultModelCandidates = [
    'assets/live2d/mother/20250106.model3.json',
    'assets/live2d/jingliu/jingliu.model3.json',
    'assets/live2d/huohuo/huohuo.model3.json',
    'assets/live2d/shizuku/shizuku.model3.json',
    'assets/live2d/hiyori/hiyori_pro_t11.model3.json',
    'assets/live2d/koharu/koharu.model3.json',
    'assets/live2d/haru/haru_greeter_t03.model3.json',
    'assets/live2d/tororo/tororo.model3.json',
    'assets/models/default.vrm'
  ]

  const roots = [
    app.getAppPath(),
    join(__dirname, '../../'),
    process.resourcesPath,
    process.resourcesPath ? join(process.resourcesPath, 'app') : '',
    process.resourcesPath ? join(process.resourcesPath, 'app.asar.unpacked') : '',
    join(homedir(), '.hermes-avatar'),
    process.cwd()
  ].filter(Boolean)

  for (const rel of defaultModelCandidates) {
    for (const r of roots) {
      const candidate = join(r, rel)
      try {
        if (existsSync(candidate)) return resolve(candidate)
      } catch {}
    }
  }

  // Scan folder assets/live2d untuk mencari model3.json apa pun yang ada
  for (const r of roots) {
    const l2dDir = join(r, 'assets', 'live2d')
    try {
      if (existsSync(l2dDir) && statSync(l2dDir).isDirectory()) {
        for (const sub of readdirSync(l2dDir)) {
          const subPath = join(l2dDir, sub)
          if (existsSync(subPath) && statSync(subPath).isDirectory()) {
            for (const file of readdirSync(subPath)) {
              if (file.endsWith('.model3.json')) {
                return resolve(join(subPath, file))
              }
            }
          }
        }
      }
    } catch {}
  }

  return ''
}

/**
 * Helper untuk me-resolve path model / aset baik dari relative path,
 * absolute path, dev environment (out/main), maupun packaged app (asar / resources).
 * Tahan terhadap perbedaan path absolut lintas-perangkat (Windows / macOS / Linux).
 */
export function resolveModelPath(modelPath) {
  if (!modelPath) return findFallbackModelPath() || ''

  // 1. Jika sudah absolute dan ada di filesystem lokal saat ini, kembalikan langsung
  if (isAbsolute(modelPath) && existsSync(modelPath)) {
    return resolve(modelPath)
  }

  // 2. Normalisasi dan ekstraksi subpath jika path berasal dari device lain
  const cleanRel = modelPath.replace(/^[/\\]+/, '')
  const assetSub = extractAssetSubpath(modelPath)

  const rootDirs = [
    app.getAppPath(),
    join(app.getAppPath(), 'assets'),
    join(__dirname, '../../'),
    join(__dirname, '../../', 'assets'),
    process.resourcesPath,
    process.resourcesPath ? join(process.resourcesPath, 'assets') : '',
    process.resourcesPath ? join(process.resourcesPath, 'app') : '',
    process.resourcesPath ? join(process.resourcesPath, 'app', 'assets') : '',
    process.resourcesPath ? join(process.resourcesPath, 'app.asar') : '',
    process.resourcesPath ? join(process.resourcesPath, 'app.asar', 'assets') : '',
    process.resourcesPath ? join(process.resourcesPath, 'app.asar.unpacked') : '',
    process.resourcesPath ? join(process.resourcesPath, 'app.asar.unpacked', 'assets') : '',
    join(homedir(), '.hermes-avatar'),
    join(homedir(), '.hermes-avatar', 'assets'),
    process.cwd(),
    join(process.cwd(), 'assets')
  ].filter(Boolean)

  const candidateRelPaths = [
    modelPath,
    cleanRel,
    assetSub ? `assets/${assetSub}` : '',
    assetSub,
    assetSub ? `assets/live2d/${assetSub}` : ''
  ].filter(Boolean)

  for (const root of rootDirs) {
    for (const rel of candidateRelPaths) {
      try {
        const candidate = isAbsolute(rel) ? rel : join(root, rel)
        if (existsSync(candidate) && !statSync(candidate).isDirectory()) {
          return resolve(candidate)
        }
      } catch {
        // Abaikan error stat
      }
    }
  }

  // 3. Jika masih belum ditemukan namun ada fallback model yang siap, gunakan fallback
  const fallback = findFallbackModelPath()
  if (fallback && existsSync(fallback)) {
    return fallback
  }

  // Fallback terbaik terakhir
  return isAbsolute(modelPath) ? resolve(modelPath) : resolve(app.getAppPath(), cleanRel)
}

export function getFixedRoots() {
  return [
    join(app.getAppPath(), 'assets'),
    process.resourcesPath,
    process.resourcesPath ? join(process.resourcesPath, 'app', 'assets') : null,
    process.resourcesPath ? join(process.resourcesPath, 'app.asar', 'assets') : null,
    join(homedir(), '.hermes-avatar')
  ].filter(Boolean)
}

// IPC: launcher → main → buka avatar window dengan model terpilih.
secureHandle('avatar:start', async (_event, modelPath) => {
  const defaultRelPath = 'assets/live2d/mother/20250106.model3.json'
  let resolvedPath = resolveModelPath(modelPath || defaultRelPath)

  if (!resolvedPath || !existsSync(resolvedPath)) {
    console.warn(`[AvatarStart] Model '${modelPath}' tidak ditemukan. Mencari model alternatif...`)
    resolvedPath = findFallbackModelPath()
  }

  if (!resolvedPath || !existsSync(resolvedPath)) {
    return { ok: false, error: `File model tidak ditemukan di disk. Pastikan aset model Live2D tersedia.` }
  }
  approveRoot(dirname(resolvedPath))

  if (avatarWindow && !avatarWindow.isDestroyed()) {
    avatarWindow.focus()
    avatarWindow.webContents.send('avatar:load-model', resolvedPath)
    return { ok: true, reused: true, resolvedPath }
  }

  // Buat window avatar lalu TUNGGU sampai halaman benar-benar selesai dimuat.
  // Jangan menutup jendela Settings sebelum render sukses, dan jangan laporkan
  // ok:true bila halaman gagal dimuat (mencegah overlay kosong tanpa jalan balik).
  const loaded = await new Promise((resolve) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    try {
      createAvatarWindow(resolvedPath)
    } catch (err) {
      finish({ ok: false, error: err?.message || String(err) })
      return
    }
    const wc = avatarWindow?.webContents
    if (!wc) {
      finish({ ok: false, error: 'Gagal membuat jendela avatar' })
      return
    }
    wc.once('did-finish-load', () => finish({ ok: true }))
    wc.once('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
      // Abaikan kegagalan sub-frame; hanya pedulikan frame utama.
      if (isMainFrame === false) return
      finish({ ok: false, error: `Gagal memuat halaman avatar (${errorCode}): ${errorDescription || ''}` })
    })
    // Batas waktu pengaman agar tidak menunggu selamanya.
    setTimeout(() => finish({ ok: true, timeout: true }), 15000)
  })

  if (!loaded.ok) {
    // Bersihkan jendela avatar yang gagal, biarkan Settings tetap ada.
    if (avatarWindow && !avatarWindow.isDestroyed()) {
      try { avatarWindow.destroy() } catch { /* ignore */ }
    }
    avatarWindow = null
    return { ok: false, error: loaded.error || 'Avatar gagal dimuat' }
  }

  // Baru setelah avatar tampil, tutup jendela Settings/launcher.
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
    if (res?.ok) {
      await ensureOptionalGatewayRpc()
    }
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
  let nx = b.x + Math.round(dx)
  let ny = b.y + Math.round(dy)

  // Clamp ke area kerja layar terdekat agar avatar tidak bisa tergeser keluar
  // layar secara permanen (window frameless + skipTaskbar, tanpa tray).
  const display = screen.getDisplayNearestPoint({ x: nx + Math.round(b.width / 2), y: ny + Math.round(b.height / 2) })
  const wa = display?.workArea
  if (wa && wa.width > 0 && wa.height > 0) {
    // Pastikan setidaknya sebagian window tetap terlihat (margin 80px).
    const margin = 80
    const minX = wa.x - b.width + margin
    const maxX = wa.x + wa.width - margin
    const minY = wa.y - b.height + margin
    const maxY = wa.y + wa.height - margin
    nx = Math.min(maxX, Math.max(minX, nx))
    ny = Math.min(maxY, Math.max(minY, ny))
  }

  avatarWindow.setPosition(nx, ny)
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
    // Bila instalasi paket sedang berjalan di background, sembunyikan jendela tanpa mematikan proses
    if (win === launcherWindow && isPackageInstallRunning()) {
      win.hide()
      return { ok: true, hiddenInBackground: true }
    }
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

    const envPath = fixSystemPath() || process.env.PATH || ''
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
      child.on('error', (err) => console.warn('[Terminal] Gagal membuka terminal Windows:', err?.message || err))
      child.unref()
    } else if (process.platform === 'darwin') {
      const escSh = (v) => `'${String(v).replace(/'/g, "'\\''")}'`
      const commandParts = [cmd, ...args].map(escSh).join(' ')
      const shellLine = `export PATH=${escSh(envPath)}:$PATH; cd ${escSh(cwd)} && ${commandParts}`
      const appleScript = [
        'on run argv',
        '  tell application "Terminal"',
        '    activate',
        '    if (count of windows) > 0 and not (busy of selected tab of front window) then',
        '      do script (item 1 of argv) in front window',
        '    else',
        '      do script (item 1 of argv)',
        '    end if',
        '  end tell',
        'end run'
      ].join('\n')
      const child = spawn('osascript', ['-e', appleScript, shellLine], {
        detached: true,
        stdio: 'ignore'
      })
      child.on('error', (err) => console.warn('[Terminal] Gagal membuka Terminal.app macOS:', err?.message || err))
      child.unref()
    } else {
      const escSh = (v) => `'${String(v).replace(/'/g, "'\\''")}'`
      const commandParts = [cmd, ...args].map(escSh).join(' ')
      const bashCmd = `export PATH=${escSh(envPath)}:$PATH; cd ${escSh(cwd)} && ${commandParts}; echo ""; read -p "Tekan Enter untuk menutup..." _`
      const candidates = [
        ['x-terminal-emulator', ['-e', 'bash', '-lc', bashCmd]],
        ['gnome-terminal', ['--', 'bash', '-lc', bashCmd]],
        ['konsole', ['-e', 'bash', '-lc', bashCmd]],
        ['xfce4-terminal', ['-e', `bash -lc ${escSh(bashCmd)}`]],
        ['xterm', ['-hold', '-e', 'bash', '-lc', bashCmd]]
      ]
      const spawnNext = (idx) => {
        if (idx >= candidates.length) return
        const [termBin, termArgs] = candidates[idx]
        const child = spawn(termBin, termArgs, {
          cwd,
          env: { ...process.env, PATH: envPath },
          detached: true,
          stdio: 'ignore'
        })
        child.once('error', () => spawnNext(idx + 1))
        child.unref()
      }
      spawnNext(0)
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
    // Daftarkan kembali folder track lokal yang tersimpan ke path-guard agar model:// diizinkan lintas restart.
    if (Array.isArray(data?.localTracks)) {
      for (const track of data.localTracks) {
        const fp = track?.filePath || track?.path
        if (fp && typeof fp === 'string') {
          approveRoot(dirname(fp))
        }
      }
    }
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

// IPC: Buka folder penyimpanan audio / unduhan (~/.hermes-avatar/cache/audio atau file spesifik) di Explorer / Finder
secureHandle('avatar:music-open-folder', async (_event, payload = {}) => {
  try {
    const audioDir = getAudioCacheDir()
    let targetPath = String(payload?.filePath || '').trim()

    if (payload?.videoId) {
      const cached = findCachedAudioFile(payload.videoId)
      if (cached?.path) targetPath = cached.path
    }

    if (targetPath && existsSync(targetPath)) {
      shell.showItemInFolder(targetPath)
      return { ok: true, opened: targetPath }
    }

    await mkdir(audioDir, { recursive: true })
    await shell.openPath(audioDir)
    return { ok: true, opened: audioDir }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: Unduh track audio online ke cache/penyimpanan permanen lokal & folder Downloads pengguna
secureHandle('avatar:music-download-track', async (_event, payload = {}) => {
  try {
    const vid = String(payload?.videoId || extractYouTubeVideoId(payload?.url) || '').trim()
    if (!vid) {
      return { ok: false, error: 'Video ID YouTube tidak ditemukan.' }
    }
    const watchUrl = String(payload?.url || `https://www.youtube.com/watch?v=${vid}`).trim()
    const result = await downloadAudioToCache(vid, watchUrl, { resolvePythonCmd })
    if (result && result.path) {
      let finalFilePath = result.path
      try {
        const userDownloadsDir = app.getPath('downloads')
        const rawTitle = String(payload?.title || vid).trim()
        const cleanTitle = rawTitle.replace(/[/\\?%*:|"<>]/g, '_').trim()
        const ext = result.ext || 'm4a'
        const exportPath = join(userDownloadsDir, `${cleanTitle}.${ext}`)
        copyFileSync(result.path, exportPath)
        finalFilePath = exportPath
      } catch (copyErr) {
        console.warn('[MusicDownload] Salin ke folder Downloads dilewati:', copyErr?.message || copyErr)
      }
      return { ok: true, cached: true, filePath: finalFilePath, size: result.size }
    }
    return { ok: false, error: 'Gagal mengunduh audio ke komputer. Pastikan koneksi internet tersedia.' }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: Cek apakah lagu sudah terunduh / tersimpan di disk lokal
secureHandle('avatar:music-check-cached', async (_event, payload = {}) => {
  try {
    const vid = String(payload?.videoId || extractYouTubeVideoId(payload?.url) || '').trim()
    if (!vid) return { cached: false }
    const cached = findCachedAudioFile(vid)
    return {
      cached: Boolean(cached),
      filePath: cached?.path || null,
      size: cached?.size || 0,
      mimeType: cached?.mimeType || null
    }
  } catch {
    return { cached: false }
  }
})

// IPC: Cari lagu / radio / stream musik online (YouTube InnerTube -> yt-dlp -> iTunes / Radio-Browser)
secureHandle('avatar:music-search', async (_event, payload = {}) => {
  try {
    return await searchOnlineMusic({
      query: payload?.query || '',
      title: payload?.title || '',
      artist: payload?.artist || '',
      limit: payload?.limit || 6,
      resolvePythonCmd
    })
  } catch (err) {
    return { ok: false, results: [], error: err?.message || String(err) }
  }
})

// IPC: Ekstrak URL stream audio nyata untuk playback lewat model://music-stream/
secureHandle('avatar:music-resolve-stream', async (_event, payload = {}) => {
  try {
    return await resolveMusicStream({
      url: payload?.url || '',
      videoId: payload?.videoId || '',
      title: payload?.title || '',
      artist: payload?.artist || '',
      forceRefresh: Boolean(payload?.forceRefresh),
      resolvePythonCmd
    })
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: Kontrol pemutar latar belakang Electron bawaan (tanpa yt-dlp / zero-install fallback)
secureHandle('avatar:music-bg-control', async (_event, action, payload = {}) => {
  try {
    return await controlBackgroundMusicPlayer(action, payload, { BrowserWindow })
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
      execFile(pyCmd, ['-c', 'import kokoro_onnx, soundfile; print("ok")'], { timeout: 3500, windowsHide: true, env: process.env }, (err, stdout) => {
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
      execFile(pyCmd, ['-m', 'pip', 'install', 'kokoro-onnx', 'soundfile', ...extraArgs], { timeout: 180000, windowsHide: true, env: process.env }, (err, stdout, stderr) => {
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
      execFile(pyCmd, ['-m', 'pip', 'uninstall', '-y', 'kokoro-onnx', 'soundfile', ...extraArgs], { timeout: 60000, windowsHide: true, env: process.env }, (err, stdout, stderr) => {
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

// IPC: Instalasi 1-klik otomatis di latar belakang tanpa membuka terminal (Python / Hermes / 9Router / Kokoro / All / Resume)
secureHandle('avatar:install-package', async (event, pkgId) => {
  try {
    const id = String(pkgId || '').trim().toLowerCase()
    const res = await installPackageOneClick(id, {
      onProgress: (info) => {
        if (launcherWindow && !launcherWindow.isDestroyed()) {
          launcherWindow.webContents.send('avatar:package-install-progress', info)
        } else if (event?.sender && !event.sender.isDestroyed()) {
          event.sender.send('avatar:package-install-progress', info)
        }
      }
    })
    if ((id === 'kokoro' || id === 'all' || id === 'resume') && (res?.ok || res?.results?.kokoro?.ok)) {
      cachedKokoroPip = { installed: true, lastCheck: Date.now() }
    }
    // Jika jendela sempat disembunyikan selama instalasi & avatar belum aktif, tampilkan kembali untuk menunjukkan hasil
    if (launcherWindow && !launcherWindow.isDestroyed() && !launcherWindow.isVisible() && (!avatarWindow || avatarWindow.isDestroyed())) {
      launcherWindow.show()
    }
    return res
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: Ambil state antrean & checklist instalasi paket terkini (untuk sinkronisasi saat jendela dibuka ulang)
secureHandle('avatar:get-install-state', async () => {
  return getInstallQueueState()
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
    cronOutputWatcher?.stop()
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
    const gw = await ensureOptionalGatewayRpc()
    if (!gw) {
      return { ok: false, error: 'Daemon Hermes (:9119) belum aktif' }
    }
    const result = await gw(method, params || {})
    return { ok: true, result }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

async function ensureOptionalGatewayRpc() {
  if (isGatewayConnected()) return gatewayRequest
  try {
    let targetPort = HERMES_PORT
    if (process.env.HERMES_WS_URL) {
      try {
        const u = new URL(process.env.HERMES_WS_URL)
        if (u.port) targetPort = Number(u.port)
      } catch {
        // gunakan HERMES_PORT baku
      }
    }
    if (!(await isPortOpen(targetPort))) return null
    await connectGateway(SESSION_TOKEN)
    if (isGatewayConnected()) return gatewayRequest
  } catch { /* fallback offline */ }
  return null
}

// IPC: Cari & baca riwayat sesi dari state.db Hermes (FTS5) - mendukung argumen objek atau posisi
secureHandle('avatar:hermes-search-sessions', async (_event, queryOrOpts = '', limit = 50, sessionId = null) => {
  try {
    let opts = {}
    if (typeof queryOrOpts === 'object' && queryOrOpts !== null) {
      opts = { ...queryOrOpts }
    } else {
      opts = { query: queryOrOpts, limit, sessionId }
    }
    return await searchHermesSessions(opts)
  } catch (err) {
    return { ok: false, error: err?.message || String(err), sessions: [], messages: [] }
  }
})

// IPC: Ambil data Hermes Brain & Otomasi terstruktur untuk Settings
secureHandle('avatar:hermes-brain-get', async (_event, section, params = {}) => {
  try {
    const needsGw = section === 'cron' || section === 'kanban'
    const gw = needsGw ? await ensureOptionalGatewayRpc() : (isGatewayConnected() ? gatewayRequest : null)
    switch (String(section || '')) {
      case 'sessions':
        return await searchHermesSessions({
          query: params?.query || '',
          limit: params?.limit || 60,
          sessionId: params?.sessionId || null
        })
      case 'cron':
        return await listHermesCronJobs({ gatewayReq: gw })
      case 'memory':
        return await loadHermesMemoryFiles()
      case 'mcp':
        return await loadHermesMcpServers()
      case 'gateway':
        return await getMessagingGatewayState()
      case 'fallback-moa':
        return await loadFallbackAndMoaConfig({ secretStore })
      case 'kanban':
        return await getKanbanAndSubagents({ gatewayReq: gw })
      default:
        return { ok: false, error: `Section tidak dikenal: ${section}` }
    }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: Terapkan perubahan Hermes Brain & Otomasi (Sessions, Cron, Memory, MCP, Gateway, Fallback, MoA, Kanban)
secureHandle('avatar:hermes-brain-set', async (_event, action, payload = {}) => {
  try {
    const gw = await ensureOptionalGatewayRpc()
    switch (String(action || '')) {
      case 'session-delete': {
        const delRes = await manageHermesSessionRpc({ action: 'delete', sessionId: payload?.sessionId }, gw)
        if (avatarWindow && !avatarWindow.isDestroyed()) {
          avatarWindow.webContents.send('avatar:session-deleted', {
            sessionId: String(payload?.sessionId || '').trim(),
            closedLiveIds: Array.isArray(delRes?.closedLiveIds) ? delRes.closedLiveIds : []
          })
        }
        return { ok: true, ...delRes }
      }
      case 'cron-manage':
        return await manageHermesCronJob(payload, { gatewayReq: gw })
      case 'memory-save':
        return await saveHermesMemoryFile(payload)
      case 'mcp-save':
        return await saveHermesMcpServer(payload, { gatewayReq: gw })
      case 'mcp-delete':
        return await deleteHermesMcpServer(payload, { gatewayReq: gw })
      case 'mcp-toggle':
        return await toggleHermesMcpServer(payload, { gatewayReq: gw })
      case 'gateway-save-env':
        return await saveMessagingGatewayEnv(payload)
      case 'gateway-control':
        return await controlMessagingGateway(payload)
      case 'fallback-save':
        return await saveFallbackChain(payload, { secretStore })
      case 'moa-save':
        return await saveMoaConfig(payload)
      case 'kanban-manage':
        return await manageKanbanAndSubagent(payload, { gatewayReq: gw })
      default:
        return { ok: false, error: `Aksi tidak dikenal: ${action}` }
    }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: Buka/lanjutkan sesi Hermes tertentu langsung di jendela chat Avatar
secureHandle('avatar:hermes-resume-in-avatar', async (_event, sessionId) => {
  try {
    const cleanId = String(sessionId || '').trim()
    if (!cleanId) return { ok: false, error: 'sessionId wajib diisi' }
    if (avatarWindow && !avatarWindow.isDestroyed()) {
      avatarWindow.show()
      avatarWindow.setAlwaysOnTop(true, 'screen-saver')
      avatarWindow.focus()
      avatarWindow.webContents.send('avatar:resume-session', { sessionId: cleanId })
      return { ok: true, launched: false }
    }
    pendingResumeSession = { sessionId: cleanId }
    const defaultPath = resolveModelPath('assets/live2d/mother/20250106.model3.json')
    if (!existsSync(defaultPath)) {
      return { ok: false, error: 'Buka avatar terlebih dahulu untuk melanjutkan sesi.' }
    }
    createAvatarWindow(defaultPath)
    return { ok: true, launched: true }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

function getStorageOpts() {
  return { userDataDir: app.getPath('userData') }
}

// IPC: Ringkasan & rincian penyimpanan lokal (Settings Storage Manager)
secureHandle('avatar:storage-get', async (_event, params = {}) => {
  try {
    const opts = getStorageOpts()
    if (params?.engineOnly) {
      return await getStorageEngineSummary({
        ...opts,
        forceRefreshEngine: Boolean(params?.forceRefreshEngine)
      })
    }
    if (params?.categoryId) {
      return await listStorageCategoryItems(params.categoryId, opts)
    }
    return await getStorageSummary({
      ...opts,
      includeEngine: params?.includeEngine !== false,
      forceRefreshEngine: Boolean(params?.forceRefreshEngine)
    })
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: Aksi kelola penyimpanan (hapus item, kosongkan kategori aman, VACUUM state.db, buka Explorer)
secureHandle('avatar:storage-action', async (_event, action, payload = {}) => {
  try {
    const opts = getStorageOpts()
    switch (String(action || '')) {
      case 'delete-item':
        return await deleteStorageItem(payload?.path, opts)
      case 'clear-category':
        return await clearStorageCategory(payload?.categoryId, opts)
      case 'vacuum-db':
        return await vacuumHermesStateDb(opts)
      case 'open-folder': {
        const res = await resolveSafeStorageFolder(payload?.categoryId, payload?.path, opts)
        if (!res?.ok) return res
        if (res.isFile) {
          shell.showItemInFolder(res.path)
        } else {
          await mkdir(res.path, { recursive: true })
          await shell.openPath(res.path)
        }
        return { ok: true }
      }
      default:
        return { ok: false, error: `Aksi penyimpanan tidak dikenal: ${action}` }
    }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: Arsipkan otomatis lampiran/gambar drag & drop dari Avatar ke vault Hermes
secureHandle('avatar:archive-attachment', async (_event, payload = {}) => {
  try {
    return await archiveDroppedFile(
      { sourcePath: payload?.path, fileName: payload?.name },
      getStorageOpts()
    )
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

function getSkillRoots() {
  const roots = [join(homedir(), '.hermes', 'skills')]
  const winAppLocalSkills = join(homedir(), 'AppData', 'Local', 'hermes', 'skills')
  if (process.platform === 'win32' && existsSync(winAppLocalSkills)) {
    roots.push(winAppLocalSkills)
  }
  return Array.from(new Set(roots))
}

function listInstalledSkillsOnDisk() {
  const seen = new Set()
  const out = []

  const scanDir = (dir, catHint = 'general', depth = 0) => {
    if (depth > 4 || !existsSync(dir)) return
    let entries = []
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      if (!ent.isDirectory() || ent.name.startsWith('.')) continue
      const fullPath = join(dir, ent.name)
      if (existsSync(join(fullPath, 'SKILL.md'))) {
        const key = ent.name.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          out.push({ name: ent.name, category: catHint })
        }
      } else {
        scanDir(fullPath, depth === 0 ? ent.name : catHint, depth + 1)
      }
    }
  }

  for (const root of getSkillRoots()) {
    scanDir(root, 'general', 0)
  }
  return out
}

async function writeCustomSkillFile({ name, category, content }) {
  if (!name || !content) {
    return { ok: false, error: 'Nama & isi skill wajib diisi.' }
  }
  const safeName = String(name).replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+/, '')
  const safeCat = String(category || 'general').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+/, '') || 'general'
  if (!safeName) return { ok: false, error: 'Nama skill tidak valid.' }

  const rawContent = String(content)
  const finalBody = rawContent.trimStart().startsWith('---')
    ? rawContent
    : `---\nname: ${safeName}\ndescription: ${safeName}\n---\n\n${rawContent}`

  const primaryDir = join(homedir(), '.hermes', 'skills', safeCat, safeName)
  await mkdir(primaryDir, { recursive: true })
  await writeFile(join(primaryDir, 'SKILL.md'), finalBody, 'utf8')

  const winAppLocalSkills = join(homedir(), 'AppData', 'Local', 'hermes', 'skills')
  if (process.platform === 'win32' && existsSync(winAppLocalSkills)) {
    const mirrorDir = join(winAppLocalSkills, safeCat, safeName)
    await mkdir(mirrorDir, { recursive: true })
    await writeFile(join(mirrorDir, 'SKILL.md'), finalBody, 'utf8')
  }

  if (isGatewayConnected()) {
    try {
      await gatewayRequest('skills.reload', {})
    } catch { /* reload bersifat best-effort */ }
  }

  return { ok: true, name: safeName, category: safeCat, path: primaryDir }
}

// IPC: tambah skill custom → tulis SKILL.md ke ~/.hermes/skills/<category>/<name>/.
secureHandle('avatar:add-skill', async (_event, { name, category, content }) => {
  try {
    return await writeCustomSkillFile({ name, category, content })
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: Asisten skill & pencarian jurnal ilmiah langsung dari panel Chat Avatar.
secureHandle('avatar:skill-assistant', async (_event, payload = {}) => {
  try {
    const action = String(payload?.action || '').trim()
    if (action === 'list') {
      return { ok: true, skills: listInstalledSkillsOnDisk() }
    }
    if (action === 'install') {
      return await writeCustomSkillFile({
        name: payload?.name,
        category: payload?.category,
        content: payload?.content
      })
    }
    if (action === 'academic-search') {
      return await getAcademicPapers(payload?.query, payload?.limit || 5)
    }
    return { ok: false, error: 'Aksi skill-assistant tidak dikenal.' }
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

    for (const root of getSkillRoots()) {
      await rm(join(root, safeCat, safeName), { recursive: true, force: true }).catch(() => {})
      await rm(join(root, safeName), { recursive: true, force: true }).catch(() => {})
    }
    if (isGatewayConnected()) {
      await gatewayRequest('skills.reload', {}).catch(() => {})
    }

    return { ok: true, path: join(getSkillRoots()[0], safeCat, safeName) }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: tes koneksi model (chat completion sungguhan ke provider).
// Kirim request "ping" ke model → verifikasi model benar-benar berfungsi.
secureHandle('avatar:test-connection', async (_event, url, model, apiKey) => {
  await ensureLocalRouterIfTarget(url)
  return await testProviderConnection({ url, model, apiKey, resolveApiKeyFor })
})


// IPC: Muat & simpan daftar provider LLM persisten (~/.hermes-avatar/llm_providers.json)
secureHandle('avatar:llm-load-providers', async () => {
  try {
    return await loadSavedLlmProviders({ secretStore })
  } catch (err) {
    return { ok: false, providers: [], error: err?.message || String(err) }
  }
})

secureHandle('avatar:llm-save-providers', async (_event, payload) => {
  try {
    const data = (payload && typeof payload === 'object') ? payload : {}
    return await saveSavedLlmProviders({
      activeId: data.activeId || null,
      providers: Array.isArray(data.providers) ? data.providers : []
    })
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: set full LLM provider ke Hermes (config.yaml + .env + llm_providers.json + RPC gateway)
secureHandle('avatar:set-llm-provider', async (_event, payload) => {
  try {
    const { name, baseUrl, apiKey, model, models, authType } = payload || {}
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

    let sealedForDisk = String(apiKey || '').trim()
    if (!sealedForDisk.startsWith('v2:') && effectiveKey && effectiveKey !== 'no-key-required') {
      try {
        sealedForDisk = secretStore.seal(effectiveKey, baseUrl)
      } catch {
        sealedForDisk = ''
      }
    }
    await upsertSavedLlmProviderOnDisk({
      name: name || 'Custom Provider',
      baseUrl,
      apiKey: sealedForDisk,
      model: modelName,
      models: Array.isArray(models) ? models : undefined,
      authType: authType || (isLocalRouterUrl(baseUrl) ? '9router' : (sealedForDisk ? 'apikey' : ''))
    }, { secretStore, setActive: true }).catch(() => {})

    // Set via RPC jika terhubung (best effort live model switch)
    if (isGatewayConnected()) {
      try {
        await gatewayRequest('config.set', { key: 'model', value: `${modelName} --global` })
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

    // Sambungkan kembali shared gateway ke Hermes daemon yang baru direstart
    try {
      disconnectGateway()
      await connectGateway(SESSION_TOKEN)
    } catch (_) { }

    return { ok: true, restarted: true, model: modelName, name, baseUrl }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: restart Hermes daemon
secureHandle('avatar:restart-hermes', async () => {
  try {
    try { disconnectGateway() } catch { /* abaikan */ }
    const res = await restartHermes()
    if (res?.ok) {
      await ensureOptionalGatewayRpc()
    }
    return { ok: res.ok, already: res.already, error: res.error }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: ambil model aktual langsung dari endpoint OpenAI-compatible (9Router, Ollama, dll)
secureHandle('avatar:fetch-endpoint-models', async (_event, baseUrl, apiKey) => {
  await ensureLocalRouterIfTarget(baseUrl)
  return await fetchEndpointModels({ baseUrl, apiKey, resolveApiKeyFor })
})

// IPC: ambil daftar model dari SEMUA provider tersimpan sekaligus (paralel).
// Berguna agar model 9Router tetap muncul walau provider lain (mis. Google) sedang aktif.
secureHandle('avatar:fetch-all-provider-models', async (_event, providers) => {
  try {
    const urls = (Array.isArray(providers) ? providers : []).map((p) => p?.baseUrl)
    await ensureLocalRouterIfTarget(urls)
    const results = await fetchModelsForProviders({ providers, resolveApiKeyFor })
    return { ok: true, results }
  } catch (err) {
    return { ok: false, results: [], error: err?.message || String(err) }
  }
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
  let hintUrl = String(baseUrl || '').trim()
  if (!hintUrl) {
    try {
      const cfgPath = resolveHermesConfigPath()
      if (cfgPath && existsSync(cfgPath)) {
        const doc = YAML.parse(await readFile(cfgPath, 'utf8'))
        hintUrl = String(doc?.model?.base_url || '').trim()
      }
    } catch {
      // Abaikan kegagalan baca config.yaml opsional
    }
  }
  await ensureLocalRouterIfTarget(hintUrl)
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

    const targetDisplay = (avatarWindow && !avatarWindow.isDestroyed())
      ? screen.getDisplayMatching(avatarWindow.getBounds())
      : screen.getPrimaryDisplay()
    const scaleFactor = targetDisplay?.scaleFactor || 1
    const screenWidth = Math.max(1, Math.round((targetDisplay?.bounds?.width || 1920) * scaleFactor))
    const screenHeight = Math.max(1, Math.round((targetDisplay?.bounds?.height || 1080) * scaleFactor))
    const targetDisplayId = targetDisplay?.id

    const captureScreenWithRetry = async (displayId, targetW, targetH) => {
      const attempt = async (w, h) => {
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: w, height: h }
        })
        const src = pickMatchingScreenSource(sources, displayId)
        return (src?.thumbnail && !src.thumbnail.isEmpty()) ? src.thumbnail : null
      }

      let img = await attempt(targetW, targetH)
      if (!img) {
        await new Promise((r) => setTimeout(r, 120))
        img = await attempt(targetW, targetH)
      }
      if (!img && (targetW > 1920 || targetH > 1080)) {
        const ratio = Math.min(1920 / targetW, 1080 / targetH)
        const fbW = Math.max(1, Math.round(targetW * ratio))
        const fbH = Math.max(1, Math.round(targetH * ratio))
        img = await attempt(fbW, fbH)
      }
      return img
    }

    const collectOpenWindowNames = async () => {
      try {
        const winSources = await desktopCapturer.getSources({
          types: ['window'],
          thumbnailSize: { width: 0, height: 0 }
        })
        return winSources
          .filter((s) => s.name && !/hermes avatar/i.test(s.name))
          .map((s) => String(s.name).trim())
          .filter(Boolean)
          .slice(0, 8)
      } catch {
        return []
      }
    }

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
      const fullImg = await captureScreenWithRetry(targetDisplayId, screenWidth, screenHeight)
      if (!fullImg || fullImg.isEmpty()) {
        return { ok: false, error: 'Gagal menangkap layar untuk pemotongan area.' }
      }
      const fullSize = fullImg.getSize()
      const safeRect = resolveSafeCropRect(cropRect, fullSize)
      if (!safeRect) {
        return { ok: false, error: 'Koordinat area tangkapan layar tidak valid.' }
      }

      selectedImg = fullImg.crop(safeRect)
      captureLabel = `Area Kotak (${safeRect.width}×${safeRect.height} px)`
      openWindows = await collectOpenWindowNames()
    } else {
      // Default: Layar Penuh
      const fullImg = await captureScreenWithRetry(targetDisplayId, screenWidth, screenHeight)
      if (!fullImg || fullImg.isEmpty()) {
        return { ok: false, error: 'Gagal menangkap thumbnail layar penuh.' }
      }
      selectedImg = fullImg
      captureLabel = 'Layar Penuh'
      openWindows = await collectOpenWindowNames()
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

    // Arsipkan otomatis ke <hermesHome>/images/ (best-effort, tidak memblokir respons Screen Vision)
    archiveScreenCapture(jpgBuf, getStorageOpts()).catch(() => {})

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
    let currentModel = null
    let currentProvider = null
    let currentBaseUrl = null
    let currentAuthType = ''

    const gw = await ensureOptionalGatewayRpc()
    if (gw && isGatewayConnected()) {
      try {
        const res = await gw('config.get', { key: 'provider' })
        if (res && res.model && res.model !== '—' && res.model !== 'none') {
          currentModel = res.model
          currentProvider = res.provider || null
          if (res.base_url) currentBaseUrl = String(res.base_url).trim()
        }
      } catch (_) { }
    }

    // Baca config.yaml untuk fallback model, base_url, atau memperjelas provider (bila unknown/custom)
    const cfgPath = resolveHermesConfigPath()
    if (existsSync(cfgPath)) {
      try {
        const cfg = await readFile(cfgPath, 'utf8')
        const doc = YAML.parse(cfg)
        if (!currentModel && doc?.model?.default) {
          currentModel = String(doc.model.default).trim()
        }
        if (!currentBaseUrl && doc?.model?.base_url) {
          currentBaseUrl = String(doc.model.base_url).trim()
        }

        const provEntries = [
          ...(doc?.providers && typeof doc.providers === 'object' ? Object.values(doc.providers) : []),
          ...(Array.isArray(doc?.custom_providers) ? doc.custom_providers : [])
        ].filter((p) => p && typeof p === 'object')

        const matchedProv = provEntries.find(
          (p) => (currentBaseUrl && normalizeProviderUrl(p.base_url || p.baseUrl) === normalizeProviderUrl(currentBaseUrl)) ||
            (currentModel && (p.default_model === currentModel || p.model === currentModel))
        )

        if (!currentBaseUrl && matchedProv) {
          currentBaseUrl = String(matchedProv.base_url || matchedProv.baseUrl || '').trim() || null
        }

        if (!currentProvider || currentProvider === 'unknown' || currentProvider === 'custom' || currentProvider === 'default') {
          if (matchedProv?.name) {
            currentProvider = String(matchedProv.name).trim()
          }
          if ((!currentProvider || currentProvider === 'custom') && doc?.model?.provider) {
            currentProvider = String(doc.model.provider).trim()
          }
        }
      } catch (_) {}
    }

    if (!currentBaseUrl && currentProvider) {
      currentBaseUrl = inferProviderBaseUrlFromSlug(currentProvider) || null
    }

    const usesRouter = Boolean(currentBaseUrl && isLocalRouterUrl(currentBaseUrl))
    if (usesRouter) {
      currentAuthType = '9router'
    } else if (/oauth/i.test(String(currentProvider || '')) || normalizeProviderUrl(currentBaseUrl).includes('openrouter.ai')) {
      currentAuthType = 'oauth'
    } else if (currentBaseUrl) {
      currentAuthType = 'apikey'
    }

    if (currentModel && currentModel !== '—' && currentModel !== 'none' && currentModel !== 'Tidak ada model') {
      return {
        ok: true,
        model: currentModel,
        provider: currentProvider || 'default',
        baseUrl: currentBaseUrl || '',
        authType: currentAuthType,
        usesRouter
      }
    }
    return { ok: false, model: null, baseUrl: '', authType: '', usesRouter: false, error: 'Belum ada model LLM yang dipilih' }
  } catch (err) {
    return { ok: false, model: null, baseUrl: '', authType: '', usesRouter: false, error: err?.message || String(err) }
  }
})

// IPC: set TTS config (voice) ke Hermes — gunakan writer YAML atomik & ter-serialize.
secureHandle('avatar:set-tts-config', async (_event, { voice } = {}) => {
  try {
    if (!voice) return { ok: true }
    await updateHermesVoiceConfig({ voice })
    return { ok: true, voice }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: set STT config (model + bahasa) — gunakan writer YAML atomik & ter-serialize.
secureHandle('avatar:set-stt-config', async (_event, { model, language } = {}) => {
  try {
    await updateHermesVoiceConfig({ sttModel: model, sttLanguage: language })
    return { ok: true, model, language }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

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
    join(process.env.ProgramData || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    join(homedir(), 'Desktop'),
    process.env.PUBLIC ? join(process.env.PUBLIC, 'Desktop') : ''
  ].filter((p) => p && existsSync(p))

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

  // Aplikasi bawaan umum Windows (gunakan path absolut agar lolos verifikasi existsSync di appRegistry)
  const winDir = process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows'
  const sys32 = join(winDir, 'System32')
  const psDir = join(sys32, 'WindowsPowerShell', 'v1.0')
  const builtins = [
    { name: 'Notepad', command: join(sys32, 'notepad.exe'), aliases: ['notepad', 'catatan'] },
    { name: 'Kalkulator', command: join(sys32, 'calc.exe'), aliases: ['calc', 'kalkulator', 'calculator'] },
    { name: 'File Explorer', command: join(winDir, 'explorer.exe'), aliases: ['explorer', 'file explorer'] },
    { name: 'Paint', command: join(sys32, 'mspaint.exe'), aliases: ['paint', 'mspaint', 'gambar'] },
    { name: 'Task Manager', command: join(sys32, 'taskmgr.exe'), aliases: ['taskmgr', 'task manager'] },
    { name: 'Command Prompt', command: join(sys32, 'cmd.exe'), aliases: ['cmd', 'command prompt'] },
    { name: 'PowerShell', command: join(psDir, 'powershell.exe'), aliases: ['powershell', 'pwsh'] }
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

function buildAppAliases(rawName) {
  const lower = String(rawName || '').toLowerCase()
  const aliases = []
  if (lower.includes('visual studio code') || lower === 'code') {
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
  } else if (lower.includes('firefox')) {
    aliases.push('firefox', 'mozilla firefox')
  } else if (lower.includes('safari')) {
    aliases.push('safari')
  } else if (lower.includes('finder')) {
    aliases.push('finder', 'file explorer')
  } else if (lower.includes('terminal') || lower.includes('iterm')) {
    aliases.push('terminal', 'cmd', 'command prompt')
  } else if (lower.includes('calculator') || lower.includes('kalkulator')) {
    aliases.push('calc', 'kalkulator', 'calculator')
  } else if (lower.includes('task manager') || lower.includes('activity monitor') || lower.includes('system monitor')) {
    aliases.push('task manager', 'taskmgr', 'taskman', 'activity monitor', 'system monitor')
  } else if (lower.includes('notes') || lower.includes('notepad') || lower.includes('textedit')) {
    aliases.push('notepad', 'notes', 'catatan')
  }
  return aliases
}

function scanMacApplications() {
  const dirs = [
    '/Applications',
    '/System/Applications',
    '/System/Applications/Utilities',
    join(homedir(), 'Applications')
  ].filter((p) => existsSync(p))

  const results = []
  const seenNames = new Set()

  function walkMac(dir, depth = 0) {
    if (depth > 2) return
    try {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const ent of entries) {
        if (ent.name.startsWith('.')) continue
        const full = join(dir, ent.name)
        if (ent.isDirectory() && ent.name.toLowerCase().endsWith('.app')) {
          const rawName = ent.name.replace(/\.app$/i, '').trim()
          const lower = rawName.toLowerCase()
          if (!seenNames.has(lower)) {
            seenNames.add(lower)
            results.push({
              name: rawName,
              command: full,
              aliases: buildAppAliases(rawName),
              source: 'macos-applications'
            })
          }
        } else if (ent.isDirectory()) {
          walkMac(full, depth + 1)
        }
      }
    } catch {
      // Lewati folder yang tidak bisa diakses
    }
  }

  for (const d of dirs) walkMac(d, 0)
  return results
}

function scanLinuxApplications() {
  const dirs = [
    '/usr/share/applications',
    '/usr/local/share/applications',
    join(homedir(), '.local', 'share', 'applications'),
    '/var/lib/flatpak/exports/share/applications',
    join(homedir(), '.local', 'share', 'flatpak', 'exports', 'share', 'applications'),
    '/var/lib/snapd/desktop/applications'
  ].filter((p) => existsSync(p))

  const results = []
  const seenNames = new Set()

  function walkLinux(dir, depth = 0) {
    if (depth > 2) return
    try {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const ent of entries) {
        if (ent.name.startsWith('.')) continue
        const full = join(dir, ent.name)
        if (ent.isDirectory()) {
          walkLinux(full, depth + 1)
        } else if (ent.name.toLowerCase().endsWith('.desktop')) {
          try {
            const raw = readFileSync(full, 'utf8')
            if (/^\s*NoDisplay\s*=\s*true\b/im.test(raw) || /^\s*Hidden\s*=\s*true\b/im.test(raw)) continue
            if (/^\s*Type\s*=\s*(?!Application\b)/im.test(raw)) continue
            const nameMatch = raw.match(/^\s*Name\s*=\s*(.+)$/m)
            const rawName = (nameMatch ? nameMatch[1] : ent.name.replace(/\.desktop$/i, '')).trim()
            const lower = rawName.toLowerCase()
            if (!rawName || seenNames.has(lower)) continue
            seenNames.add(lower)
            results.push({
              name: rawName,
              command: full,
              aliases: buildAppAliases(rawName),
              source: 'linux-desktop'
            })
          } catch {
            // Abaikan .desktop tidak terbaca
          }
        }
      }
    } catch {
      // Lewati folder tidak terbaca
    }
  }

  for (const d of dirs) walkLinux(d, 0)
  return results
}

function scanInstalledAppsForPlatform() {
  if (process.platform === 'win32') return scanWindowsShortcuts()
  if (process.platform === 'darwin') return scanMacApplications()
  return scanLinuxApplications()
}

// IPC: jalankan aplikasi berdasarkan appId aman (atau cocokkan nama/alias terverifikasi di registry)
secureHandle('avatar:launch-app', async (_event, appId, appName) => {
  try {
    let res = await appRegistry.launchById(appId)
    if (!res.ok) {
      if (appRegistry.getPublicList().length === 0) {
        appRegistry.setScannedApps(scanInstalledAppsForPlatform())
      }
      const reg = appRegistry.getRegistry()
      const norm = (s) => String(s || '').toLowerCase().trim()
      const compact = (s) => norm(s).replace(/[\s\-_]+/g, '')
      const candidates = [appName, appId].map(norm).filter(Boolean)

      let matched = null
      for (const q of candidates) {
        const byComputed = reg.find((r) => r.id === computeAppId(q))
        if (byComputed) { matched = byComputed; break }

        const byExactName = reg.find((r) => norm(r.name) === q)
        if (byExactName) { matched = byExactName; break }

        const qBase = q.replace(/\.(exe|lnk|app|desktop|appimage)$/i, '')
        const byBase = reg.find((r) => norm(basename(r.path)).replace(/\.(exe|lnk|app|desktop|appimage)$/i, '') === qBase)
        if (byBase) { matched = byBase; break }

        const qComp = compact(q)
        if (qComp.length >= 3) {
          const byPartial = reg.find((r) => compact(r.name).includes(qComp) || qComp.includes(compact(r.name)))
          if (byPartial) { matched = byPartial; break }
        }
      }

      if (matched) {
        res = await appRegistry.launchById(matched.id)
      }
    }
    return res
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

// IPC: Scan semua aplikasi terpasang di Windows / macOS / Linux
secureHandle('avatar:scan-installed-apps', async () => {
  try {
    const scanned = scanInstalledAppsForPlatform()
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
      const scanned = scanInstalledAppsForPlatform()
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
  '.aac': 'audio/aac',
  '.mp4': 'video/mp4',
  '.webm': 'audio/webm'
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
      if (url.hostname === 'music-stream') {
        return await handleMusicStreamProtocolRequest(request, corsHeaders, { resolvePythonCmd })
      }
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
      const { size } = statSync(filePath)
      const rangeHeader = request.headers.get('range')
      if (rangeHeader && size > 0) {
        const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/i)
        if (rangeMatch) {
          const start = Math.min(size - 1, Number(rangeMatch[1]))
          const rawEnd = rangeMatch[2] ? Number(rangeMatch[2]) : size - 1
          const end = Math.max(start, Math.min(size - 1, rawEnd))
          const chunkLen = end - start + 1
          const body = request.method === 'HEAD' ? null : Readable.toWeb(createReadStream(filePath, { start, end }))
          return new Response(body, {
            status: 206,
            headers: {
              'Content-Type': mime,
              'Content-Length': String(chunkLen),
              'Content-Range': `bytes ${start}-${end}/${size}`,
              'Accept-Ranges': 'bytes',
              ...corsHeaders
            }
          })
        }
      }

      const body = request.method === 'HEAD' ? null : Readable.toWeb(createReadStream(filePath))
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Content-Length': String(size),
          'Accept-Ranges': 'bytes',
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
    if (isBackgroundMusicWebContents(wc.id)) {
      return { action: 'deny' }
    }
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  wc.on('will-navigate', (e, url) => {
    if (isBackgroundMusicWebContents(wc.id)) {
      if (!/^https:\/\/(?:[\w-]+\.)?(?:youtube\.com|youtu\.be|googlevideo\.com)\//i.test(url)) {
        e.preventDefault()
      }
      return
    }
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
  cleanupStaleOtaTempDirs().catch(() => {})

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

  // Aktifkan watcher output Cron untuk notifikasi proaktif ke Avatar
  cronOutputWatcher = createCronOutputWatcher({
    onNewOutput: (parsed) => {
      if (avatarWindow && !avatarWindow.isDestroyed()) {
        avatarWindow.webContents.send('avatar:cron-notification', parsed)
      }
    }
  })
  cronOutputWatcher.start()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createLauncherWindow()
  })
})

app.on('before-quit', () => {
  stopBackgroundMusicPlayer()
})

app.on('window-all-closed', () => {
  stopMotion()
  stopBackgroundMusicPlayer()
  unregisterGlobalShortcuts()
  cronOutputWatcher?.stop()
  disconnectGateway()
  stopBridgeServer()
  stopAllServices()
  if (process.platform !== 'darwin') app.quit()
})
