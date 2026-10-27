/**
 * service-manager.js
 * Mengelola service yang dibutuhkan avatar:
 *   - 9Router        -> DETEKSI saja (user yang mengaktifkan manual).
 *   - hermes serve   -> AUTO-SPAWN (port 9119).
 *
 * Fitur:
 *   - health check port (TCP connect — lebih robust dari HTTP GET)
 *   - anti-duplikat (tidak spawn ulang jika sudah jalan)
 *   - shutdown bersih saat app quit
 *   - token Hermes PERSISTEN (disimpan ke file, reuse antar sesi)
 *     -> mencegah token mismatch dengan hermes serve yang sudah jalan
 */

import { spawn, execFile, execSync } from 'child_process'
import net from 'net'
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'
import {
  resolveHermesBinary,
  resolvePythonBinary,
  resolveRouterBinary,
  resolveRouterApiKey,
  resolveKokoroModelDir,
  resolveHermesConfigPath,
  getAllDetectedPaths,
  loadPersistedPaths,
  savePersistedPath,
  invalidatePathCache,
  getLogicalDrives,
  resolveWindowlessPythonBinary
} from './path-resolver.js'

const HERMES_PORT = 9119
const ROUTER_PORT = 20128
const KOKORO_PORT = 8880
const HERMES_HOST = '127.0.0.1'

// Path state dir (cross-platform: ~/.hermes-avatar di semua OS).
const STATE_DIR = join(homedir(), '.hermes-avatar')
const TOKEN_FILE = join(STATE_DIR, 'session-token')

/**
 * Pastikan process.env.PATH memiliki direktori umum binary (terutama di macOS GUI app
 * yang biasanya tidak mewarisi PATH terminal Homebrew/pyenv, serta Windows Python Scripts).
 */
function fixSystemPath() {
  const delimiter = process.platform === 'win32' ? ';' : ':'
  const currentPath = process.env.PATH || ''
  const currentParts = currentPath.split(delimiter)
  const home = homedir()

  // Di macOS, coba ambil PATH dari interactive login shell (zsh) bila diluncurkan via Finder/Dock
  if (process.platform === 'darwin' && (!process.env.PATH || !process.env.PATH.includes('/opt/homebrew'))) {
    try {
      const shellPath = execSync('/bin/zsh -ilc "echo -n \\$PATH"', { timeout: 1500, encoding: 'utf8' })
      if (shellPath && shellPath.includes('/')) {
        for (const p of shellPath.split(':')) {
          if (p && existsSync(p) && !currentParts.includes(p)) {
            currentParts.unshift(p)
          }
        }
      }
    } catch {
      // Abaikan bila shell zsh timeout
    }
  }

  const additionalPaths = process.platform === 'win32'
    ? [
        join(home, 'AppData', 'Local', 'hermes', 'hermes-agent', 'venv', 'Scripts'),
        join(home, 'AppData', 'Local', 'hermes', 'venv', 'Scripts'),
        join(home, '.hermes', 'venv', 'Scripts'),
        join(home, 'AppData', 'Local', 'Programs', 'Python', 'Launcher'),
        join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'Scripts'),
        join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'Scripts'),
        join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'Scripts'),
        join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python310', 'Scripts')
      ]
    : [
        '/opt/homebrew/bin',
        '/opt/homebrew/sbin',
        '/usr/local/bin',
        '/usr/local/sbin',
        join(home, '.local', 'bin'),
        join(home, '.hermes', 'venv', 'bin'),
        join(home, '.hermes-agent', 'venv', 'bin'),
        join(home, '.cargo', 'bin'),
        join(home, 'Library', 'Python', '3.12', 'bin'),
        join(home, 'Library', 'Python', '3.11', 'bin'),
        join(home, 'Library', 'Python', '3.10', 'bin'),
        '/Library/Frameworks/Python.framework/Versions/Current/bin'
      ]

  const newParts = [...currentParts]
  for (const p of additionalPaths) {
    if (existsSync(p) && !newParts.includes(p)) {
      newParts.unshift(p)
    }
  }
  process.env.PATH = newParts.join(delimiter)
}

// Jalankan perbaikan PATH di awal modul
fixSystemPath()

function resolveHermesCmd() {
  const res = resolveHermesBinary()
  return res.cmd
}

// Token persisten: reuse token lama bila ada, agar konsisten antar sesi.
const SESSION_TOKEN = loadOrCreateToken()

function loadOrCreateToken() {
  // Prioritas: env eksplisit > file tersimpan > generate baru.
  if (process.env['HERMES_DASHBOARD_SESSION_TOKEN']) {
    return process.env['HERMES_DASHBOARD_SESSION_TOKEN']
  }
  try {
    if (existsSync(TOKEN_FILE)) {
      const t = readFileSync(TOKEN_FILE, 'utf8').trim()
      if (t) return t
    }
  } catch {
    // ignore
  }
  const token = 'avatar-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
  try {
    mkdirSync(STATE_DIR, { recursive: true })
    writeFileSync(TOKEN_FILE, token, 'utf8')
  } catch {
    // ignore (hanya cache)
  }
  return token
}

const children = []

// Deteksi port via TCP connect (lebih andal dari HTTP GET).
function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 800 })
    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('error', () => resolve(false))
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

async function waitForPort(port, timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(port)) return true
    await sleep(400)
  }
  return false
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Deteksi status 9Router (user yang mengaktifkan manual).
 */
async function checkRouter() {
  const running = await isPortOpen(ROUTER_PORT)
  return { running }
}

/**
 * Jalankan hermes serve jika belum jalan di port 9119.
 * Token PERSISTEN di-inject agar cocok dengan avatar.
 */
async function startHermes() {
  if (await isPortOpen(HERMES_PORT)) {
    return { already: true, ok: true }
  }
  const cmd = resolveHermesCmd()
  if (!cmd) {
    console.warn('[ServiceManager] Hermes CLI tidak ditemukan di sistem.')
    return { already: false, ok: false, error: 'Hermes CLI belum terpasang atau tidak ditemukan di PATH' }
  }

  console.log(`[ServiceManager] Starting Hermes daemon via: ${cmd}`)
  try {
    let spawnError = null
    const child = spawn(
      cmd,
      ['serve', '--host', HERMES_HOST, '--port', String(HERMES_PORT)],
      {
        stdio: 'ignore',
        shell: process.platform === 'win32',
        windowsHide: true,
        env: {
          ...process.env,
          HERMES_DASHBOARD_SESSION_TOKEN: SESSION_TOKEN
        }
      }
    )

    // Tangkap event error pada child process agar tidak menjadi uncaught exception
    child.on('error', (err) => {
      console.warn('[ServiceManager] Hermes spawn error:', err.message)
      spawnError = err
    })

    children.push({ name: 'hermes', child })
    const ok = await waitForPort(HERMES_PORT, 12000)
    if (!ok && spawnError) {
      return { already: false, ok: false, error: spawnError.message }
    }
    return { already: false, ok, child }
  } catch (err) {
    console.warn('[ServiceManager] Gagal spawn hermes:', err.message)
    return { already: false, ok: false, error: err.message }
  }
}

/**
 * Restart Hermes server secara mulus (berguna saat ada perubahan konfigurasi LLM / endpoint).
 */
async function restartHermes() {
  const existing = children.find((c) => c.name === 'hermes')
  if (existing && existing.child) {
    try { existing.child.kill('SIGTERM') } catch (_) {}
    const idx = children.indexOf(existing)
    if (idx >= 0) children.splice(idx, 1)
  }
  try {
    const { execSync } = await import('child_process')
    if (process.platform === 'win32') {
      execSync('powershell -NoProfile -Command "Get-Process -Name hermes -ErrorAction SilentlyContinue | Stop-Process -Force"', { stdio: 'ignore' })
    }
  } catch (_) {}
  await new Promise((r) => setTimeout(r, 600))
  return await startHermes()
}

/**
 * Deteksi dan verifikasi binary Python yang aktif di sistem via smart multi-tier discovery.
 * Mengembalikan objek { cmd, version, ok, source }.
 */
async function resolvePythonCmd() {
  return await resolvePythonBinary()
}

/**
 * Jalankan kokoro_server.py jika port 8880 belum aktif.
 */
async function startKokoro() {
  if (await isPortOpen(KOKORO_PORT)) {
    return { already: true, ok: true }
  }
  try {
    const scriptFromMeta = fileURLToPath(new URL('../../../scripts/kokoro_server.py', import.meta.url))
    const candidates = [
      process.resourcesPath ? join(process.resourcesPath, 'scripts', 'kokoro_server.py') : null,
      join(homedir(), '.hermes-avatar', 'scripts', 'kokoro_server.py'),
      scriptFromMeta,
      join(process.cwd(), 'scripts', 'kokoro_server.py'),
      join(process.cwd(), '..', 'scripts', 'kokoro_server.py'),
      join(process.cwd(), '..', '..', 'scripts', 'kokoro_server.py')
    ].filter(Boolean)
    const validScript = candidates.find((c) => existsSync(c))
    if (!validScript) {
      console.warn('[ServiceManager] kokoro_server.py tidak ditemukan')
      return { ok: false, error: 'Script kokoro_server.py tidak ditemukan' }
    }

    const pyCmd = await resolveWindowlessPythonBinary()
    const kokoroDirInfo = resolveKokoroModelDir()
    const scriptDir = dirname(validScript)
    const child = spawn(pyCmd, [validScript], {
      cwd: scriptDir,
      detached: true,
      stdio: 'ignore',
      shell: false,
      windowsHide: true,
      env: {
        ...process.env,
        KOKORO_MODEL_DIR: kokoroDirInfo.dir
      }
    })
    child.on('error', (err) => {
      console.warn('[ServiceManager] Kokoro server spawn error:', err.message)
    })
    child.unref()
    children.push({ name: 'kokoro', child })

    // Tunggu sampai port 8880 benar-benar aktif (maks 8 detik)
    const ok = await waitForPort(KOKORO_PORT, 8000)
    if (!ok) {
      return { already: false, ok: false, error: 'Port 8880 tidak merespons setelah 8 detik. Pastikan dependensi kokoro-onnx terpasang.' }
    }
    return { already: false, ok: true, child }
  } catch (err) {
    console.error('[ServiceManager] Gagal startKokoro:', err?.message || err)
    return { ok: false, error: err?.message || String(err) }
  }
}

/**
 * Jalankan 9Router daemon jika belum jalan di port 20128.
 */
async function startRouter() {
  if (await isPortOpen(ROUTER_PORT)) {
    return { already: true, ok: true }
  }
  const routerInfo = resolveRouterBinary()
  if (!routerInfo.ok || !routerInfo.cmd) {
    return { already: false, ok: false, error: 'Binary atau script 9Router belum terpasang di sistem' }
  }
  console.log(`[ServiceManager] Starting 9Router daemon via: ${routerInfo.cmd}`)
  try {
    let spawnError = null
    const child = spawn(routerInfo.cmd, ['-n', '--skip-update'], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
      windowsHide: true,
      env: process.env
    })
    child.on('error', (err) => {
      console.warn('[ServiceManager] 9Router spawn error:', err.message)
      spawnError = err
    })
    children.push({ name: '9router', child })
    const ok = await waitForPort(ROUTER_PORT, 6000)
    if (!ok && spawnError) {
      return { already: false, ok: false, error: spawnError.message }
    }
    return { already: false, ok, child }
  } catch (err) {
    return { already: false, ok: false, error: err.message }
  }
}

/**
 * Pastikan skill wajib Mnemosyne, Scrapling, DuckDuckGo, Weather, & PDF terpasang di Hermes.
 */
function ensureDefaultSkills() {
  const defaultSkills = [
    'mnemosyne',
    'scrapling',
    'duckduckgo-search',
    'weather-2-0',
    'pdf',
    'open-application',
    'kokoro-tts'
  ]
  for (const skillName of defaultSkills) {
    try {
      const candidateSkills = [
        join(homedir(), 'AppData', 'Local', 'hermes', 'skills', skillName),
        join(homedir(), '.hermes', 'skills', skillName)
      ]
      const rootSkill = fileURLToPath(new URL(`../../../skills/${skillName}`, import.meta.url))
      const assetSkill = fileURLToPath(new URL(`../../assets/default-skills/${skillName}`, import.meta.url))
      const resourcesSkill = process.resourcesPath ? join(process.resourcesPath, 'skills', skillName) : null
      const cwdSkill = join(process.cwd(), 'skills', skillName)
      const cwdAssetSkill = join(process.cwd(), 'assets', 'default-skills', skillName)

      const sourceDir = (resourcesSkill && existsSync(resourcesSkill))
        ? resourcesSkill
        : existsSync(rootSkill)
        ? rootSkill
        : existsSync(assetSkill)
        ? assetSkill
        : existsSync(cwdSkill)
        ? cwdSkill
        : existsSync(cwdAssetSkill)
        ? cwdAssetSkill
        : null

      if (sourceDir) {
        for (const dest of candidateSkills) {
          if (!existsSync(join(dest, 'SKILL.md'))) {
            mkdirSync(dest, { recursive: true })
            cpSync(sourceDir, dest, { recursive: true })
          }
        }
      }
    } catch (err) {
      console.warn(`[ServiceManager] Info setup skill ${skillName}:`, err?.message || err)
    }
  }
}

/**
 * Siapkan service: deteksi 9Router + auto-spawn hermes serve & kokoro server + pastikan skill wajib default.
 */
export async function startAllServices() {
  ensureDefaultSkills()
  const router = await checkRouter()
  const hermes = await startHermes()
  const kokoro = await startKokoro()
  return { router, hermes, kokoro, token: SESSION_TOKEN }
}

/**
 * Hentikan semua child process (shutdown bersih).
 */
export function stopAllServices() {
  for (const { child } of children) {
    try {
      child.kill('SIGTERM')
    } catch {
      // sudah mati
    }
  }
  children.length = 0
}

export {
  SESSION_TOKEN,
  HERMES_PORT,
  ROUTER_PORT,
  KOKORO_PORT,
  isPortOpen,
  startHermes,
  restartHermes,
  startKokoro,
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
  invalidatePathCache,
  getLogicalDrives,
  fixSystemPath
}
