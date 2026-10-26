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

import { spawn, execFile } from 'child_process'
import net from 'net'
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'

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
  if (process.env['HERMES_BIN'] && existsSync(process.env['HERMES_BIN'])) {
    return process.env['HERMES_BIN']
  }
  const home = homedir()
  const candidatePaths = process.platform === 'win32'
    ? [
        join(home, 'AppData', 'Local', 'hermes', 'hermes-agent', 'venv', 'Scripts', 'hermes.exe'),
        join(home, 'AppData', 'Local', 'hermes', 'venv', 'Scripts', 'hermes.exe'),
        join(home, '.hermes', 'venv', 'Scripts', 'hermes.exe'),
        join(home, 'AppData', 'Local', 'Programs', 'hermes', 'hermes.exe')
      ]
    : [
        join(home, '.local', 'bin', 'hermes'),
        join(home, '.hermes', 'venv', 'bin', 'hermes'),
        join(home, '.hermes-agent', 'venv', 'bin', 'hermes'),
        '/opt/homebrew/bin/hermes',
        '/usr/local/bin/hermes',
        '/usr/bin/hermes'
      ]
  for (const p of candidatePaths) {
    if (existsSync(p)) return p
  }
  return process.platform === 'win32' ? 'hermes.exe' : 'hermes'
}

function resolveHermesConfigPath() {
  const home = homedir()
  const candidates = [
    join(home, '.hermes', 'config.yaml'),
    join(home, 'AppData', 'Local', 'hermes', 'config.yaml'),
    join(home, '.config', 'hermes', 'config.yaml')
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  if (process.platform === 'win32' && existsSync(join(home, 'AppData', 'Local', 'hermes'))) {
    return join(home, 'AppData', 'Local', 'hermes', 'config.yaml')
  }
  return join(home, '.hermes', 'config.yaml')
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
/**
 * Jalankan hermes serve jika belum jalan di port 9119.
 * Token PERSISTEN di-inject agar cocok dengan avatar.
 */
async function startHermes() {
  if (await isPortOpen(HERMES_PORT)) {
    return { already: true, ok: true }
  }
  const cmd = resolveHermesCmd()
  console.log(`[ServiceManager] Starting Hermes daemon via: ${cmd}`)
  const child = spawn(
    cmd,
    ['serve', '--host', HERMES_HOST, '--port', String(HERMES_PORT)],
    {
      stdio: 'ignore',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        HERMES_DASHBOARD_SESSION_TOKEN: SESSION_TOKEN
      }
    }
  )
  children.push({ name: 'hermes', child })
  const ok = await waitForPort(HERMES_PORT, 12000)
  return { already: false, ok, child }
}

/**
 * Deteksi dan verifikasi binary Python yang aktif di sistem.
 * Mengembalikan objek { cmd, version, ok }.
 */
async function resolvePythonCmd() {
  const home = homedir()
  const candidates = process.platform === 'win32'
    ? [
        'py',
        'python',
        join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'python.exe'),
        join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'python.exe'),
        join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'python.exe'),
        join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python310', 'python.exe')
      ]
    : [
        'python3',
        '/opt/homebrew/bin/python3',
        '/usr/local/bin/python3',
        join(home, '.local', 'bin', 'python3'),
        join(home, '.hermes', 'venv', 'bin', 'python3'),
        join(home, '.hermes', 'venv', 'bin', 'python'),
        '/usr/bin/python3',
        'python'
      ]

  for (const cmd of candidates) {
    if (cmd.includes('/') || cmd.includes('\\')) {
      if (!existsSync(cmd)) continue
    }
    const ver = await new Promise((res) => {
      execFile(cmd, ['--version'], { timeout: 2000, env: process.env }, (err, stdout, stderr) => {
        if (!err && (stdout || stderr)) {
          const v = (stdout || stderr).trim()
          if (/Python\s+\d+/i.test(v)) return res(v)
        }
        res(null)
      })
    })
    if (ver) {
      return { cmd, version: ver, ok: true }
    }
  }

  return { cmd: process.platform === 'win32' ? 'py' : 'python3', version: 'Belum terpasang', ok: false }
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
      scriptFromMeta,
      join(process.cwd(), 'scripts', 'kokoro_server.py'),
      join(process.cwd(), '..', 'scripts', 'kokoro_server.py'),
      join(process.cwd(), '..', '..', 'scripts', 'kokoro_server.py')
    ]
    const validScript = candidates.find((c) => existsSync(c))
    if (!validScript) {
      console.warn('[ServiceManager] kokoro_server.py tidak ditemukan')
      return { ok: false, error: 'Script kokoro_server.py tidak ditemukan' }
    }

    const pyInfo = await resolvePythonCmd()
    const pyCmd = pyInfo.cmd
    const scriptDir = join(validScript, '..', '..')
    const quotedScript = process.platform === 'win32' ? `"${validScript}"` : validScript
    const child = spawn(pyCmd, [quotedScript], {
      cwd: scriptDir,
      detached: true,
      stdio: 'ignore',
      shell: true,
      env: process.env
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
      const cwdSkill = join(process.cwd(), 'skills', skillName)
      const cwdAssetSkill = join(process.cwd(), 'assets', 'default-skills', skillName)

      const sourceDir = existsSync(rootSkill)
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
  startKokoro,
  resolvePythonCmd,
  resolveHermesCmd,
  resolveHermesConfigPath,
  fixSystemPath
}
