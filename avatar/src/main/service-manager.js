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
import { randomBytes } from 'node:crypto'
import net from 'net'
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, readdirSync } from 'fs'
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

function readWindowsRegistryPath() {
  if (process.platform !== 'win32') return []
  const collected = []
  const keys = [
    'HKCU\\Environment',
    'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'
  ]
  for (const key of keys) {
    try {
      const out = execSync(`reg query "${key}" /v Path`, {
        timeout: 1200,
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      const m = out.match(/Path\s+REG_(?:EXPAND_)?SZ\s+([^\r\n]+)/i)
      if (m && m[1]) {
        const expanded = m[1].replace(/%([^%]+)%/g, (_full, name) => process.env[name] || `%${name}%`)
        for (const p of expanded.split(';')) {
          const clean = p.trim()
          if (clean) collected.push(clean)
        }
      }
    } catch {
      // Abaikan bila kunci registry Path tidak ada
    }
  }
  return collected
}

function discoverUnixVersionManagerBins(home) {
  const found = []
  const versionedRoots = [
    { base: join(home, '.nvm', 'versions', 'node'), suffix: ['bin'] },
    { base: join(home, 'Library', 'Application Support', 'fnm', 'node-versions'), suffix: ['installation', 'bin'] },
    { base: join(home, '.local', 'share', 'fnm', 'node-versions'), suffix: ['installation', 'bin'] },
    { base: join(home, '.fnm', 'node-versions'), suffix: ['installation', 'bin'] }
  ]

  for (const { base, suffix } of versionedRoots) {
    try {
      if (!existsSync(base)) continue
      const versions = readdirSync(base).sort().reverse()
      for (const ver of versions) {
        const binDir = join(base, ver, ...suffix)
        if (existsSync(binDir)) found.push(binDir)
      }
    } catch { /* abaikan direktori yang tidak bisa dibaca */ }
  }

  return found
}

/**
 * Pastikan process.env.PATH memiliki direktori umum binary (terutama di macOS GUI app
 * yang biasanya tidak mewarisi PATH terminal Homebrew/NVM/pyenv, serta Windows Python/Hermes/NPM).
 */
function fixSystemPath(options = {}) {
  const delimiter = process.platform === 'win32' ? ';' : ':'
  const currentPath = process.env.PATH || ''
  const currentParts = currentPath.split(delimiter).filter(Boolean)
  const home = homedir()

  // Di macOS, ambil PATH asli dari interactive login shell (zsh/bash) memakai delimiter agar tahan banner plugin
  if (process.platform === 'darwin') {
    for (const sh of ['/bin/zsh', '/bin/bash']) {
      try {
        const out = execSync(
          `${sh} -ilc 'printf "__HERMES_PATH_START__%s__HERMES_PATH_END__" "$PATH"'`,
          { timeout: 4000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
        )
        const match = out && out.match(/__HERMES_PATH_START__([\s\S]*?)__HERMES_PATH_END__/)
        if (match && match[1]) {
          for (const p of match[1].split(':').reverse()) {
            if (p && existsSync(p) && !currentParts.includes(p)) {
              currentParts.unshift(p)
            }
          }
          break
        }
      } catch {
        // Coba shell berikutnya atau fallback ke static + version manager scan
      }
    }
  }

  // Muat ulang PATH dari Windows Registry (HKCU + HKLM) setelah instalasi paket baru
  if (process.platform === 'win32' && options?.refreshRegistry) {
    for (const p of readWindowsRegistryPath()) {
      if (existsSync(p) && !currentParts.includes(p)) {
        currentParts.unshift(p)
      }
    }
  }

  const additionalPaths = process.platform === 'win32'
    ? [
        'C:\\Program Files\\nodejs',
        join(home, 'AppData', 'Roaming', 'npm'),
        join(home, 'AppData', 'Local', 'Programs', 'nodejs'),
        join(home, '.local', 'bin'),
        join(home, 'AppData', 'Local', 'hermes', 'bin'),
        join(home, 'AppData', 'Local', 'hermes', 'hermes-agent', '.hermes', 'bin'),
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
        join(home, '.volta', 'bin'),
        join(home, '.bun', 'bin'),
        join(home, '.asdf', 'shims'),
        join(home, '.pyenv', 'shims'),
        join(home, 'miniconda3', 'bin'),
        join(home, 'anaconda3', 'bin'),
        ...discoverUnixVersionManagerBins(home),
        join(home, '.npm-global', 'bin'),
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
  const token = 'avatar-' + randomBytes(24).toString('hex')
  try {
    mkdirSync(STATE_DIR, { recursive: true })
    writeFileSync(TOKEN_FILE, token, { encoding: 'utf8', mode: 0o600 })
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

async function waitForPortToClose(port, timeoutMs = 6000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (!(await isPortOpen(port))) return true
    await sleep(250)
  }
  return false
}

/**
 * Spawn sebuah layanan secara aman lintas-OS.
 * Di Windows, file `.cmd`/`.bat` TIDAK boleh di-spawn dengan `shell:true` + path ber-spasi
 * (menyebabkan "'C:\Users\First' is not recognized"). Gunakan `cmd.exe /d /s /c "..."` dengan
 * quoting eksplisit + windowsVerbatimArguments (pola yang sama dengan package-installer).
 */
function spawnService(cmd, args, options = {}) {
  const isWin = process.platform === 'win32'
  const isBatch = isWin && typeof cmd === 'string' && /\.(cmd|bat)$/i.test(cmd)
  if (isBatch) {
    const quoted = `"${cmd}" ${args.map((a) => (/\s/.test(String(a)) ? `"${a}"` : String(a))).join(' ')}`
    return spawn('cmd.exe', ['/d', '/s', '/c', quoted], {
      ...options,
      windowsHide: true,
      windowsVerbatimArguments: true,
      shell: false
    })
  }
  // Non-batch: tidak perlu shell sama sekali (hindari re-parsing/quoting yang merusak).
  return spawn(cmd, args, { ...options, shell: false })
}

async function findPidByPort(port) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile('netstat', ['-ano', '-p', 'tcp'], { windowsHide: true }, (err, stdout) => {
        if (err || !stdout) return resolve(null)
        const lines = stdout.split('\n')
        for (const line of lines) {
          if (line.includes(`:${port}`) && line.includes('LISTENING')) {
            const parts = line.trim().split(/\s+/)
            const pid = parseInt(parts[parts.length - 1], 10)
            if (pid && pid > 0) return resolve(pid)
          }
        }
        resolve(null)
      })
    } else {
      execFile('lsof', ['-ti', `tcp:${port}`], (err, stdout) => {
        if (err || !stdout) return resolve(null)
        const pid = parseInt(String(stdout).trim(), 10)
        resolve(pid && pid > 0 ? pid : null)
      })
    }
  })
}

async function killProcessByPid(pid) {
  if (!pid || pid <= 0) return
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => resolve())
    } else {
      try {
        process.kill(pid, 'SIGTERM')
      } catch (_) {}
      resolve()
    }
  })
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
  fixSystemPath()
  const cmd = resolveHermesCmd()
  if (!cmd) {
    console.warn('[ServiceManager] Hermes CLI tidak ditemukan di sistem.')
    return { already: false, ok: false, error: 'Hermes CLI belum terpasang atau tidak ditemukan di PATH' }
  }

  console.log(`[ServiceManager] Starting Hermes daemon via: ${cmd}`)
  try {
    let spawnError = null
    const child = spawnService(
      cmd,
      ['serve', '--host', HERMES_HOST, '--port', String(HERMES_PORT)],
      {
        stdio: 'ignore',
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
 * Mendukung restart child yang terdaftar maupun orphan daemon yang menduduki port 9119.
 */
async function restartHermes() {
  const existing = children.find((c) => c.name === 'hermes')
  let pidToKill = null

  if (existing && existing.child && typeof existing.child.pid === 'number') {
    pidToKill = existing.child.pid
    const idx = children.indexOf(existing)
    if (idx >= 0) children.splice(idx, 1)
  } else {
    // Cek apakah ada proses Hermes (mis. orphan dari sesi sebelumnya) yang menduduki port 9119
    const portOpen = await isPortOpen(HERMES_PORT)
    if (portOpen) {
      pidToKill = await findPidByPort(HERMES_PORT)
    }
  }

  if (pidToKill) {
    console.log(`[ServiceManager] Menghentikan proses Hermes (PID ${pidToKill}) untuk restart...`)
    await killProcessByPid(pidToKill)
    await waitForPortToClose(HERMES_PORT, 6000)
  }

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

    let pyCmd = await resolveWindowlessPythonBinary()
    // POSIX: utamakan virtualenv tempat kokoro-onnx benar-benar terpasang (hindari PEP-668).
    if (process.platform !== 'win32') {
      const venvPy = join(homedir(), '.hermes-avatar', 'venv', 'bin', 'python')
      try { if (existsSync(venvPy)) pyCmd = venvPy } catch { /* abaikan */ }
    }
    const kokoroDirInfo = resolveKokoroModelDir()
    const scriptDir = dirname(validScript)
    let spawnError = null
    let earlyExitCode = null
    // Penting di Windows: jangan gabungkan `detached: true` dengan `windowsHide: true`,
    // karena DETACHED_PROCESS membuat Windows mengabaikan CREATE_NO_WINDOW dan memunculkan jendela konsol py.exe.
    const child = spawn(pyCmd, [validScript], {
      cwd: scriptDir,
      stdio: 'ignore',
      shell: false,
      windowsHide: true,
      env: {
        ...process.env,
        KOKORO_MODEL_DIR: kokoroDirInfo.dir,
        PYTHONUNBUFFERED: '1',
        PYTHONUTF8: '1'
      }
    })
    child.on('error', (err) => {
      console.warn('[ServiceManager] Kokoro server spawn error:', err.message)
      spawnError = err
    })
    child.on('exit', (code) => {
      earlyExitCode = code
    })
    children.push({ name: 'kokoro', child })

    // Tunggu sampai port 8880 benar-benar aktif (maks 12 detik), hentikan tunggu lebih awal bila proses crash
    const startWait = Date.now()
    let ok = false
    while (Date.now() - startWait < 12000) {
      if (await isPortOpen(KOKORO_PORT)) {
        ok = true
        break
      }
      if (spawnError || (earlyExitCode !== null && earlyExitCode !== 0)) {
        break
      }
      await sleep(350)
    }
    if (!ok) {
      const reason = spawnError?.message || (earlyExitCode !== null ? `Python keluar dengan kode ${earlyExitCode}` : 'Port 8880 tidak merespons setelah 12 detik. Pastikan dependensi kokoro-onnx terpasang.')
      return { already: false, ok: false, error: reason }
    }
    return { already: false, ok: true, child }
  } catch (err) {
    console.error('[ServiceManager] Gagal startKokoro:', err?.message || err)
    return { ok: false, error: err?.message || String(err) }
  }
}

let isStartingRouter = false

/**
 * Jalankan 9Router daemon jika belum jalan di port 20128.
 * Menjamin eksekusi headless murni (TRAY_MODE: 0) tanpa memicu crash systray2 di macOS.
 */
async function startRouter() {
  if (await isPortOpen(ROUTER_PORT)) {
    return { already: true, ok: true }
  }
  if (isStartingRouter) {
    const ok = await waitForPort(ROUTER_PORT, 8000)
    return { already: ok, ok }
  }
  isStartingRouter = true
  try {
    fixSystemPath()
    const routerInfo = resolveRouterBinary()
    if (!routerInfo.ok || !routerInfo.cmd) {
      return { already: false, ok: false, error: 'Binary atau script 9Router belum terpasang di sistem' }
    }
    console.log(`[ServiceManager] Starting 9Router daemon via: ${routerInfo.cmd}`)

    // Mode headless murni tanpa systray Cocoa agar stabil di macOS/Linux dan tidak membuka jendela terminal
    const routerArgs = ['-n', '-p', String(ROUTER_PORT)]
    const routerEnv = {
      ...process.env,
      TRAY_MODE: '0'
    }

    let spawnError = null
    const isScript = typeof routerInfo.cmd === 'string' && routerInfo.cmd.endsWith('.js')
    const spawnBin = isScript ? (process.platform === 'win32' ? 'node.exe' : 'node') : routerInfo.cmd
    const spawnArgs = isScript ? [routerInfo.cmd, ...routerArgs] : routerArgs

    const child = spawnService(spawnBin, spawnArgs, {
      stdio: 'ignore',
      windowsHide: true,
      env: routerEnv
    })
    child.on('error', (err) => {
      console.warn('[ServiceManager] 9Router spawn error:', err.message)
      spawnError = err
    })
    child.on('exit', (code) => {
      const idx = children.findIndex((c) => c.child === child)
      if (idx !== -1) children.splice(idx, 1)
      if (code !== 0 && code !== null) {
        console.warn(`[ServiceManager] 9Router daemon keluar dengan kode: ${code}`)
      }
    })
    children.push({ name: '9router', child })
    const ok = await waitForPort(ROUTER_PORT, 9000)
    if (!ok && spawnError) {
      return { already: false, ok: false, error: spawnError.message }
    }
    return { already: false, ok, child }
  } catch (err) {
    return { already: false, ok: false, error: err.message }
  } finally {
    isStartingRouter = false
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
  // Kokoro-TTS memakai ~400-980 MB RAM saat ONNX dimuat; jalankan lazy hanya jika belum aktif
  // (tts-service.js akan auto-start saat suara Kokoro dipakai, atau manual lewat Package Hub).
  const kokoroRunning = await isPortOpen(KOKORO_PORT)
  const kokoro = { already: kokoroRunning, ok: kokoroRunning, lazy: !kokoroRunning }
  return { router, hermes, kokoro, token: SESSION_TOKEN }
}

/**
 * Hentikan semua child process (shutdown bersih).
 */
export function stopAllServices() {
  for (const { child } of children) {
    try {
      if (process.platform === 'win32' && child?.pid) {
        execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {})
      }
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
