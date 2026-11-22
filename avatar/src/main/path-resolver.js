/**
 * path-resolver.js
 * Multi-Tier Smart Path Discovery Engine for Hermes 3D Avatar
 * 
 * Strategi Pencarian Bertingkat (Tier 1 - Tier 6):
 * 1. Tier 1: Cache Persisten Pengguna (~/.hermes-avatar/paths.json)
 * 2. Tier 2: Variabel Lingkungan Sistem (HERMES_BIN, PYTHON_BIN, KOKORO_MODEL_DIR, ROUTER_BIN)
 * 3. Tier 3: OS-Native Fast Lookup (where.exe di Windows, which di Unix/macOS)
 * 4. Tier 4: Multi-Drive Known Candidate Scanner (C:, D:, E:, Conda, Scoop, Choco, venv)
 * 5. Tier 5: Scoped Shallow Search (Maks kedalaman 2 level pada direktori pengembangan)
 * 6. Tier 6: Manual Folder/File Picker Fallback di UI Pengaturan
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { execSync, execFile } from 'node:child_process'

const CONFIG_DIR = join(homedir(), '.hermes-avatar')
const PATHS_FILE = join(CONFIG_DIR, 'paths.json')

/**
 * Membaca cache jalur kustom dari ~/.hermes-avatar/paths.json
 */
export function loadPersistedPaths() {
  try {
    if (existsSync(PATHS_FILE)) {
      const raw = readFileSync(PATHS_FILE, 'utf8')
      const parsed = JSON.parse(raw)
      return typeof parsed === 'object' && parsed !== null ? parsed : {}
    }
  } catch (err) {
    console.warn('[PathResolver] Gagal membaca paths.json:', err?.message || err)
  }
  return {}
}

let cachedDetectedPaths = null
let lastDetectedPathsTime = 0
const CACHE_TTL_MS = 180000 // Cache bertahan 3 menit

export function invalidatePathCache() {
  cachedDetectedPaths = null
  lastDetectedPathsTime = 0
}

/**
 * Menyimpan jalur kustom ke ~/.hermes-avatar/paths.json
 */
export function savePersistedPath(key, value) {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true })
    const current = loadPersistedPaths()
    if (value) {
      current[key] = value
    } else {
      delete current[key]
    }
    writeFileSync(PATHS_FILE, JSON.stringify(current, null, 2), 'utf8')
    invalidatePathCache()
    return true
  } catch (err) {
    console.warn('[PathResolver] Gagal menulis paths.json:', err?.message || err)
    return false
  }
}

/**
 * Mendeteksi seluruh logical drive yang aktif di sistem (misal Windows C:, D:, E:)
 */
export function getLogicalDrives() {
  if (process.platform !== 'win32') {
    return ['/']
  }

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const activeDrives = []
  for (const letter of alphabet) {
    const rootPath = `${letter}:\\`
    try {
      if (existsSync(rootPath)) {
        activeDrives.push(letter)
      }
    } catch {
      // Lewati drive yang tidak siap / terkunci (misal optical drive)
    }
  }
  return activeDrives.length > 0 ? activeDrives : ['C']
}

/**
 * Fast OS-native lookup menggunakan where.exe (Windows) atau which (macOS/Linux)
 * Memindai User PATH, System PATH, dan App Paths tanpa disk thrashing.
 */
export function fastWhere(binName, extensions = null) {
  const isWin = process.platform === 'win32'
  const exts = extensions || (isWin ? ['.exe', '.cmd', '.bat', ''] : [''])
  const results = []

  // Tambahkan PATH umum ke lookup environment
  const env = { ...process.env }

  for (const ext of exts) {
    const query = binName.endsWith(ext) ? binName : `${binName}${ext}`
    try {
      const lookupCmd = isWin ? `where.exe "${query}"` : `which "${query}"`
      const output = execSync(lookupCmd, {
        encoding: 'utf8',
        timeout: 1500,
        windowsHide: true,
        env,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      if (output) {
        const lines = output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
        for (const line of lines) {
          if (existsSync(line)) {
            // Hindari stub kosong WindowsApps (0 KB) yang memicu pop-up Microsoft Store
            try {
              const st = statSync(line)
              if (st.size === 0 && line.toLowerCase().includes('windowsapps')) {
                continue
              }
            } catch { }
            results.push(line)
          }
        }
      }
    } catch {
      // where.exe / which melempar error code 1 jika tidak ditemukan
    }
  }

  return [...new Set(results)]
}

/**
 * --------------------------------------------------------------------------
 * 1. RESOLVER: HERMES AGENT CLI (hermes.exe / hermes.cmd / hermes)
 * --------------------------------------------------------------------------
 */
export function resolveHermesBinary() {
  const persisted = loadPersistedPaths()
  const home = homedir()
  const isWin = process.platform === 'win32'
  const drives = getLogicalDrives()

  // Tier 1: Cache persisten
  if (persisted.hermes_bin && existsSync(persisted.hermes_bin)) {
    return { cmd: persisted.hermes_bin, source: 'kustom (cache tersimpan)' }
  }

  // Tier 2: Environment Variable
  if (process.env.HERMES_BIN && existsSync(process.env.HERMES_BIN)) {
    return { cmd: process.env.HERMES_BIN, source: 'environment (HERMES_BIN)' }
  }

  // Tier 3: Fast OS-Native PATH Lookup (mendukung .exe, .cmd, .bat)
  const whereHits = fastWhere('hermes', isWin ? ['.exe', '.cmd', '.bat', ''] : [''])
  if (whereHits.length > 0) {
    return { cmd: whereHits[0], source: 'sistem PATH (otomatis)' }
  }

  // Tier 4: Multi-Drive Known Candidate Scanner (C:, D:, dll)
  const candidatePaths = []

  if (isWin) {
    // Lokasi standar pengguna (termasuk jalur baru installer NousResearch %LOCALAPPDATA%\hermes\bin)
    candidatePaths.push(
      join(home, 'AppData', 'Local', 'hermes', 'bin', 'hermes.exe'),
      join(home, 'AppData', 'Local', 'hermes', 'bin', 'hermes.cmd'),
      join(home, 'AppData', 'Local', 'hermes', 'hermes-agent', '.hermes', 'bin', 'hermes.exe'),
      join(home, 'AppData', 'Local', 'hermes', 'hermes-agent', '.hermes', 'bin', 'hermes.cmd'),
      join(home, 'AppData', 'Local', 'hermes', 'hermes-agent', 'venv', 'Scripts', 'hermes.exe'),
      join(home, 'AppData', 'Local', 'hermes', 'hermes-agent', 'venv', 'Scripts', 'hermes.cmd'),
      join(home, 'AppData', 'Local', 'hermes', 'venv', 'Scripts', 'hermes.exe'),
      join(home, 'AppData', 'Local', 'hermes', 'venv', 'Scripts', 'hermes.cmd'),
      join(home, '.hermes', 'venv', 'Scripts', 'hermes.exe'),
      join(home, '.hermes', 'venv', 'Scripts', 'hermes.cmd'),
      join(home, 'AppData', 'Local', 'Programs', 'hermes', 'hermes.exe'),
      join(home, 'AppData', 'Roaming', 'npm', 'hermes.cmd'),
      join(home, 'scoop', 'shims', 'hermes.exe')
    )

    // Lokasi di seluruh logical drive (C:, D:, E:, dll)
    for (const d of drives) {
      candidatePaths.push(
        `${d}:\\hermes\\bin\\hermes.exe`,
        `${d}:\\hermes\\bin\\hermes.cmd`,
        `${d}:\\hermes\\hermes-agent\\venv\\Scripts\\hermes.exe`,
        `${d}:\\hermes\\hermes-agent\\venv\\Scripts\\hermes.cmd`,
        `${d}:\\hermes\\venv\\Scripts\\hermes.exe`,
        `${d}:\\hermes\\venv\\Scripts\\hermes.cmd`,
        `${d}:\\hermes\\hermes.exe`,
        `${d}:\\tools\\hermes\\hermes.exe`,
        `${d}:\\ProgramData\\Anaconda3\\Scripts\\hermes.exe`
      )
    }
  } else {
    // macOS / Linux
    candidatePaths.push(
      join(home, '.local', 'bin', 'hermes'),
      join(home, '.hermes', 'venv', 'bin', 'hermes'),
      join(home, '.hermes-agent', 'venv', 'bin', 'hermes'),
      '/opt/homebrew/bin/hermes',
      '/opt/homebrew/sbin/hermes',
      '/usr/local/bin/hermes',
      '/usr/local/sbin/hermes',
      '/usr/bin/hermes',
      '/bin/hermes',
      join(home, 'Library', 'Python', '3.12', 'bin', 'hermes'),
      join(home, 'Library', 'Python', '3.11', 'bin', 'hermes'),
      join(home, '.cargo', 'bin', 'hermes')
    )
  }

  for (const c of candidatePaths) {
    if (existsSync(c)) {
      return { cmd: c, source: 'lokasi umum multi-drive' }
    }
  }

  return { cmd: null, source: 'belum terpasang' }
}

/**
 * --------------------------------------------------------------------------
 * 2. RESOLVER: PYTHON RUNTIME & ENVIRONMENT
 * --------------------------------------------------------------------------
 */
export async function resolvePythonBinary() {
  const persisted = loadPersistedPaths()
  const home = homedir()
  const isWin = process.platform === 'win32'
  const drives = getLogicalDrives()

  // Helper untuk memverifikasi eksekusi python --version
  const verifyPython = (cmdPath) => new Promise((resolveVer) => {
    try {
      execFile(cmdPath, ['--version'], { timeout: 2500, windowsHide: true, env: process.env }, (err, stdout, stderr) => {
        if (!err && (stdout || stderr)) {
          const v = (stdout || stderr).trim()
          if (/Python\s+\d+/i.test(v)) {
            return resolveVer(v)
          }
        }
        resolveVer(null)
      })
    } catch {
      resolveVer(null)
    }
  })

  // Tier 1: Cache persisten
  if (persisted.python_bin && existsSync(persisted.python_bin)) {
    const ver = await verifyPython(persisted.python_bin)
    if (ver) {
      return { cmd: persisted.python_bin, version: ver, ok: true, source: 'kustom (cache tersimpan)' }
    }
  }

  // Tier 2: Environment Variable
  if (process.env.PYTHON_BIN && existsSync(process.env.PYTHON_BIN)) {
    const ver = await verifyPython(process.env.PYTHON_BIN)
    if (ver) {
      return { cmd: process.env.PYTHON_BIN, version: ver, ok: true, source: 'environment (PYTHON_BIN)' }
    }
  }

  // Tier 3: Fast OS-Native PATH Lookup
  const quickBins = isWin ? ['py', 'python'] : ['python3', 'python']
  for (const q of quickBins) {
    const hits = fastWhere(q, isWin ? ['.exe', ''] : [''])
    for (const h of hits) {
      const ver = await verifyPython(h)
      if (ver) {
        return { cmd: h, version: ver, ok: true, source: 'sistem PATH (otomatis)' }
      }
    }
  }

  // Tier 4: Multi-Drive Known Candidate Scanner
  const candidatePythons = []
  if (isWin) {
    // Standard User AppData & Hermes/uv Python
    candidatePythons.push(
      join(home, 'AppData', 'Local', 'hermes', 'hermes-agent', '.venv', 'Scripts', 'python.exe'),
      join(home, 'AppData', 'Local', 'hermes', 'hermes-agent', 'venv', 'Scripts', 'python.exe'),
      join(home, 'AppData', 'Local', 'hermes', 'venv', 'Scripts', 'python.exe')
    )
    for (const ver of ['Python314', 'Python313', 'Python312', 'Python311', 'Python310']) {
      candidatePythons.push(
        join(home, 'AppData', 'Local', 'Programs', 'Python', ver, 'python.exe')
      )
    }
    for (const uvRoot of [join(home, 'AppData', 'Roaming', 'uv', 'python'), join(home, 'AppData', 'Local', 'uv', 'python')]) {
      try {
        if (existsSync(uvRoot)) {
          for (const entry of readdirSync(uvRoot)) {
            candidatePythons.push(join(uvRoot, entry, 'python.exe'))
          }
        }
      } catch { }
    }

    // Multi-drive root installs (C:\Python*, D:\Python*, Conda, Scoop, Choco)
    for (const d of drives) {
      for (const ver of ['Python314', 'Python313', 'Python312', 'Python311', 'Python310']) {
        candidatePythons.push(
          `${d}:\\${ver}\\python.exe`,
          `${d}:\\Program Files\\${ver}\\python.exe`,
          `${d}:\\Program Files\\Python\\${ver}\\python.exe`
        )
      }
      candidatePythons.push(
        `${d}:\\ProgramData\\Anaconda3\\python.exe`,
        `${d}:\\Anaconda3\\python.exe`,
        `${d}:\\miniconda3\\python.exe`
      )
    }

    // Conda user home & Scoop & Choco
    candidatePythons.push(
      join(home, 'miniconda3', 'python.exe'),
      join(home, 'anaconda3', 'python.exe'),
      join(home, 'scoop', 'shims', 'python.exe'),
      join(home, 'scoop', 'apps', 'python', 'current', 'python.exe'),
      'C:\\ProgramData\\chocolatey\\bin\\python.exe'
    )
  } else {
    // macOS / Linux
    candidatePythons.push(
      '/opt/homebrew/bin/python3',
      '/usr/local/bin/python3',
      join(home, '.local', 'bin', 'python3'),
      join(home, '.hermes', 'venv', 'bin', 'python3'),
      join(home, '.pyenv', 'shims', 'python3'),
      '/usr/bin/python3',
      '/Library/Frameworks/Python.framework/Versions/Current/bin/python3'
    )
  }

  for (const p of candidatePythons) {
    if (existsSync(p)) {
      const ver = await verifyPython(p)
      if (ver) {
        return { cmd: p, version: ver, ok: true, source: 'lokasi multi-drive' }
      }
    }
  }

  return {
    cmd: isWin ? 'py' : 'python3',
    version: 'Belum terpasang atau tidak terdeteksi',
    ok: false,
    source: 'belum ditemukan'
  }
}

/**
 * Memeriksa apakah suatu interpreter Python dapat mengeksekusi script & memiliki modul kokoro_onnx + soundfile.
 */
function probePythonModule(cmdPath, importExpr, timeoutMs = 3000) {
  return new Promise((resolve) => {
    try {
      execFile(
        cmdPath,
        ['-c', `${importExpr}; print("ok")`],
        { timeout: timeoutMs, windowsHide: true, env: process.env },
        (err, stdout) => {
          resolve(!err && typeof stdout === 'string' && stdout.includes('ok'))
        }
      )
    } catch {
      resolve(false)
    }
  })
}

function resolveRealPythonExecutable(cmdPath) {
  const cleanCmd = String(cmdPath || '').trim()
  const trySiblingPythonw = async (pyExePath) => {
    const winGui = pyExePath.replace(/python(\d+(?:\.\d+)?)?\.exe$/i, 'pythonw.exe')
    if (winGui && winGui.toLowerCase() !== pyExePath.toLowerCase()) {
      // Catatan: pakai probePythonModule tanpa existsSync karena App Execution Alias WindowsApps mengembalikan existsSync=false
      if (await probePythonModule(winGui, 'import sys', 2500)) {
        return winGui
      }
    }
    return null
  }

  if (process.platform !== 'win32') {
    return Promise.resolve(cleanCmd)
  }

  if (!/(?:^|[\\/])py(?:\.exe)?$/i.test(cleanCmd)) {
    return (async () => (await trySiblingPythonw(cleanCmd)) || cleanCmd)()
  }

  return new Promise((resolve) => {
    try {
      execFile(
        cleanCmd,
        ['-c', 'import sys; print(getattr(sys, "_base_executable", "") or sys.executable)'],
        { timeout: 3000, windowsHide: true, env: process.env },
        async (err, stdout) => {
          const resolved = !err && typeof stdout === 'string' ? stdout.trim().split(/\r?\n/)[0].trim() : ''
          if (resolved) {
            const winGui = await trySiblingPythonw(resolved)
            if (winGui) return resolve(winGui)
            if (await probePythonModule(resolved, 'import sys', 2500)) {
              return resolve(resolved)
            }
          }
          resolve(cleanCmd)
        }
      )
    } catch {
      resolve(cleanCmd)
    }
  })
}

/**
 * Mendapatkan binary Python aktif (berjalan senyap via windowsHide: true saat spawn)
 * yang terverifikasi bisa mengeksekusi Python dan diprioritaskan yang sudah memiliki kokoro_onnx.
 * Catatan: Menghindari py.exe / pyw.exe launcher jika binary python.exe aslinya bisa dipanggil langsung.
 */
export async function resolveWindowlessPythonBinary() {
  const isWin = process.platform === 'win32'
  const normalPy = await resolvePythonBinary()
  if (!isWin) {
    return normalPy?.cmd || 'python3'
  }

  const persisted = loadPersistedPaths()
  const home = homedir()
  const rawCandidates = [
    normalPy?.ok ? normalPy.cmd : null,
    persisted.python_bin,
    process.env.PYTHON_BIN,
    ...fastWhere('python', ['.exe', '']),
    ...fastWhere('py', ['.exe', '']),
    join(home, 'AppData', 'Local', 'hermes', 'hermes-agent', '.venv', 'Scripts', 'python.exe'),
    join(home, 'AppData', 'Local', 'hermes', 'venv', 'Scripts', 'python.exe')
  ]
  for (const ver of ['Python314', 'Python313', 'Python312', 'Python311', 'Python310']) {
    rawCandidates.push(join(home, 'AppData', 'Local', 'Programs', 'Python', ver, 'python.exe'))
  }

  const seen = new Set()
  const candidates = []
  for (const c of rawCandidates) {
    if (!c || typeof c !== 'string') continue
    const clean = c.trim()
    const key = clean.toLowerCase()
    if (!clean || seen.has(key)) continue
    if (/[/\\]/.test(clean) && !existsSync(clean)) continue
    seen.add(key)
    candidates.push(clean)
  }

  // Prioritas 1: Python yang terbukti punya kokoro_onnx & soundfile terpasang
  for (const c of candidates) {
    if (await probePythonModule(c, 'import kokoro_onnx, soundfile', 4500)) {
      return await resolveRealPythonExecutable(c)
    }
  }

  // Prioritas 2: Python mana pun yang bisa berjalan normal (bukan pyw/alias rusak)
  for (const c of candidates) {
    if (await probePythonModule(c, 'import sys', 2500)) {
      return await resolveRealPythonExecutable(c)
    }
  }

  return normalPy?.cmd || 'py'
}

/**
 * --------------------------------------------------------------------------
 * 3. RESOLVER: 9ROUTER (LLM GATEWAY CLI)
 * --------------------------------------------------------------------------
 */
export function resolveRouterBinary() {
  const persisted = loadPersistedPaths()
  const home = homedir()
  const isWin = process.platform === 'win32'
  const drives = getLogicalDrives()

  // Tier 1: Cache persisten
  if (persisted.router_bin && existsSync(persisted.router_bin)) {
    return { cmd: persisted.router_bin, ok: true, source: 'kustom (cache tersimpan)' }
  }

  // Tier 2: Environment Variable
  if (process.env.ROUTER_BIN && existsSync(process.env.ROUTER_BIN)) {
    return { cmd: process.env.ROUTER_BIN, ok: true, source: 'environment (ROUTER_BIN)' }
  }

  // Tier 3: Fast OS-Native PATH Lookup
  const whereHits = fastWhere('9router', isWin ? ['.cmd', '.exe', '.bat', ''] : [''])
  if (whereHits.length > 0) {
    return { cmd: whereHits[0], ok: true, source: 'sistem PATH (otomatis)' }
  }

  // Tier 4: Multi-Drive Known Candidate Scanner
  const candidateRouters = []
  if (isWin) {
    candidateRouters.push(
      join(process.env.APPDATA || '', 'npm', '9router.cmd'),
      join(home, 'AppData', 'Roaming', 'npm', '9router.cmd'),
      join(home, 'AppData', 'Local', 'npm', '9router.cmd'),
      join(home, 'AppData', 'Local', 'fnm', 'current', 'bin', '9router.cmd'),
      join(home, 'scoop', 'shims', '9router.cmd'),
      join(home, '.nvm', 'versions', 'node', 'current', 'bin', '9router.cmd'),
      'C:\\Program Files\\nodejs\\9router.cmd'
    )
    for (const d of drives) {
      candidateRouters.push(
        `${d}:\\npm\\9router.cmd`,
        `${d}:\\tools\\9router\\9router.exe`,
        `${d}:\\9router\\9router.cmd`
      )
    }
  } else {
    const unixManagerBins = []
    const versionedRoots = [
      { base: join(home, '.nvm', 'versions', 'node'), suffix: ['bin'] },
      { base: join(home, 'Library', 'Application Support', 'fnm', 'node-versions'), suffix: ['installation', 'bin'] },
      { base: join(home, '.local', 'share', 'fnm', 'node-versions'), suffix: ['installation', 'bin'] },
      { base: join(home, '.fnm', 'node-versions'), suffix: ['installation', 'bin'] }
    ]
    for (const { base, suffix } of versionedRoots) {
      try {
        if (!existsSync(base)) continue
        for (const ver of readdirSync(base).sort().reverse()) {
          unixManagerBins.push(join(base, ver, ...suffix, '9router'))
        }
      } catch { /* abaikan direktori tidak terbaca */ }
    }

    candidateRouters.push(
      '/usr/local/bin/9router',
      '/opt/homebrew/bin/9router',
      join(home, '.local', 'bin', '9router'),
      join(home, '.npm-global', 'bin', '9router'),
      join(home, '.volta', 'bin', '9router'),
      join(home, '.bun', 'bin', '9router'),
      join(home, '.asdf', 'shims', '9router'),
      ...unixManagerBins
    )
  }

  for (const c of candidateRouters) {
    if (existsSync(c)) {
      return { cmd: c, ok: true, source: 'npm global / multi-drive' }
    }
  }

  return { cmd: null, ok: false, source: 'belum terpasang' }
}

/**
 * --------------------------------------------------------------------------
 * 3.1. RESOLVER: 9ROUTER ACTIVE API KEY (data.sqlite)
 * Otomatis mengambil API key aktif dari database lokal 9Router agar tidak 401
 * --------------------------------------------------------------------------
 */
function getRouterDataDirs() {
  const home = homedir()
  return Array.from(new Set([
    process.env.APPDATA ? join(process.env.APPDATA, '9router') : '',
    join(home, 'AppData', 'Roaming', '9router'),
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, '9router') : '',
    join(home, '.config', '9router'),
    join(home, '.9router'),
    join(home, 'Library', 'Application Support', '9router')
  ].filter(Boolean)))
}

function getRouterDbPaths() {
  return getRouterDataDirs().map((d) => join(d, 'db', 'data.sqlite'))
}

/**
 * Menghitung token CLI lokal 9Router (x-9r-cli-token) dari berkas machine-id & auth/cli-secret
 * sesuai mekanisme autentikasi lokal 9Router (:20128).
 */
export function resolveRouterCliToken() {
  for (const dir of getRouterDataDirs()) {
    const midPath = join(dir, 'machine-id')
    const secPath = join(dir, 'auth', 'cli-secret')
    if (!existsSync(midPath) || !existsSync(secPath)) continue
    try {
      const mid = readFileSync(midPath, 'utf8').trim()
      const sec = readFileSync(secPath, 'utf8').trim()
      if (mid && sec) {
        return createHash('sha256')
          .update(mid + '9r-cli-auth' + sec)
          .digest('hex')
          .substring(0, 16)
      }
    } catch {
      // Lanjutkan pemeriksaan ke kandidat direktori berikutnya
    }
  }
  return null
}

export async function resolveRouterApiKey() {
  const candidateDbs = getRouterDbPaths()

  for (const dbPath of candidateDbs) {
    if (!dbPath || !existsSync(dbPath)) continue

    let db = null
    try {
      const { DatabaseSync } = await import('node:sqlite')
      if (process.env.HERMES_DEBUG) {
        console.log('[HERMES_DEBUG] node:sqlite import berhasil, DatabaseSync:', typeof DatabaseSync)
      }
      db = new DatabaseSync(dbPath, { readOnly: true })
      // Prioritaskan key yang namanya mengandung 'hermes', atau key aktif yang paling baru dibuat
      const row = db.prepare(`
        SELECT key, name, createdAt
        FROM apiKeys 
        WHERE isActive = 1 
        ORDER BY 
          CASE WHEN LOWER(name) LIKE '%hermes%' THEN 0 ELSE 1 END,
          createdAt DESC 
        LIMIT 1
      `).get()
      if (row?.key) {
        return { key: row.key, name: row.name || '9Router Key', ok: true }
      }
    } catch (err) {
      console.warn('[PathResolver] Gagal query 9router db via node:sqlite:', err?.message || err)
    } finally {
      try { db?.close?.() } catch { }
    }
  }

  return { key: null, name: null, ok: false }
}

function formatRouterProviderLabel(providerKey, specificData) {
  const k = String(providerKey || '').toLowerCase()
  if (k === 'codebuddy-cn') return 'Codebuddy-Cn'
  if (k === 'codebuddy-intl') return 'Codebuddy-Intl'
  if (k === 'kiro') return 'Kiro (Claude OAuth)'
  if (k.includes('gemini') || k === 'antigravity') return 'Google Gemini'
  if (k === 'codex' || k === 'openai') return 'OpenAI / Codex'
  if (k === 'claude' || k === 'anthropic') return 'Claude Code'
  if (k === 'qwen') return 'Qwen Code'
  if (k.startsWith('openai-compatible')) {
    return String(specificData?.nodeName || 'OpenAI-Compatible')
  }
  return providerKey
    ? providerKey.split(/[-_]/).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('-')
    : 'Provider'
}

function clampPct(val) {
  return Math.max(0, Math.min(100, Math.round(val)))
}

/**
 * Memformat angka kredit/kuota dengan maksimal 2 angka desimal dan pemisah ribuan.
 */
export function formatQuotaNumber(val) {
  const num = Number(val)
  if (!Number.isFinite(num)) return '0'
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/**
 * Memformat hitungan mundur waktu reset/kadaluarsa kuota (mis. "in 13d 3h 1m" / "expires in 19d 1h 36m").
 */
export function formatQuotaCountdown(resetAt, recurring = true, nowMs = Date.now()) {
  if (!resetAt) return ''
  try {
    const targetMs = new Date(resetAt).getTime()
    if (!Number.isFinite(targetMs)) return ''
    const diffMs = targetMs - nowMs
    if (diffMs <= 0) return 'resetting...'

    const totalMins = Math.ceil(diffMs / 60000)
    let dur = ''
    if (totalMins < 60) {
      dur = `${totalMins}m`
    } else {
      const hours = Math.floor(totalMins / 60)
      const mins = totalMins % 60
      if (hours < 24) {
        dur = `${hours}h ${mins}m`
      } else {
        const days = Math.floor(hours / 24)
        const remHours = hours % 24
        dur = `${days}d ${remHours}h ${mins}m`
      }
    }

    return recurring !== false ? `in ${dur}` : `expires in ${dur}`
  } catch {
    return ''
  }
}

function mapRouterQuotaLabel(providerKey, rawName, entry) {
  const p = String(providerKey || '').toLowerCase()
  if (p === 'codex') {
    if (rawName === 'spark_session') return 'Spark (5h)'
    if (rawName === 'spark_weekly') return 'Spark (Weekly)'
    if (rawName === 'session') return '5h'
    if (rawName === 'weekly') return 'Weekly'
    if (rawName === 'review_session') return 'Review (5h)'
    if (rawName === 'review_weekly') return 'Review (Weekly)'
  }
  if (p === 'qoder') {
    if (rawName === 'user') return 'Personal'
    if (rawName === 'organization') return 'Organization'
  }
  if (p === 'kiro' && rawName === 'credit') {
    return 'Credit'
  }
  if (p === 'antigravity' && entry?.displayName) {
    return String(entry.displayName)
  }
  return String(rawName || 'Quota')
}

/**
 * Menormalkan struktur objek `quotas` dari respons `/api/usage/<connectionId>` 9Router
 * menjadi array seragam lengkap untuk UI kartu & ringkasan kuota.
 */
export function normalizeRouterUsageQuotas(providerKey, usageData, nowMs = Date.now()) {
  if (!usageData || typeof usageData !== 'object' || !usageData.quotas || typeof usageData.quotas !== 'object') {
    return []
  }

  const p = String(providerKey || '').toLowerCase()
  const result = []

  for (const [rawName, q] of Object.entries(usageData.quotas)) {
    if (!q || typeof q !== 'object') continue
    if (p === 'qoder' && rawName === 'organization' && (Number(q.total) || 0) === 0) continue
    if (rawName === 'error' && q.message) continue

    const label = mapRouterQuotaLabel(p, rawName, q)
    const unlimited = q.unlimited === true
    const rawUsed = Math.max(0, Number(q.used ?? 0) || 0)
    const rawTotal = Math.max(0, Number(q.total ?? 0) || 0)
    const used = Math.round(rawUsed * 100) / 100
    const limitNum = Math.round(rawTotal * 100) / 100
    const limit = unlimited ? '∞' : limitNum

    let remainingPct
    if (unlimited) {
      remainingPct = 100
    } else if (typeof q.remainingPercentage === 'number' && Number.isFinite(q.remainingPercentage)) {
      remainingPct = clampPct(q.remainingPercentage)
    } else if (rawTotal > 0) {
      remainingPct = clampPct(((rawTotal - rawUsed) / rawTotal) * 100)
    } else if (typeof q.remaining === 'number' && Number.isFinite(q.remaining)) {
      remainingPct = clampPct(q.remaining)
    } else {
      remainingPct = 0
    }

    const recurring = q.recurring !== false
    const resetAt = q.resetAt || null
    const resetText = formatQuotaCountdown(resetAt, recurring, nowMs) || (unlimited ? 'unlimited' : '-')

    result.push({
      label,
      rawKey: rawName,
      used,
      limit,
      usedFormatted: formatQuotaNumber(used),
      limitFormatted: unlimited ? '∞' : formatQuotaNumber(limitNum),
      remainingPct,
      resetAt,
      recurring,
      unlimited,
      resetText
    })
  }

  return result
}

async function fetchJsonWithTimeout(fetchImpl, url, headers, timeoutMs = 4500) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetchImpl(url, { method: 'GET', headers, signal: controller.signal })
    const data = await resp.json().catch(() => null)
    return { ok: resp.ok, status: resp.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  } finally {
    clearTimeout(timer)
  }
}

async function readLocalRouterUsageBuckets() {
  const buckets = {
    gemini: { w: 0, h5: 0 },
    claudeGpt: { w: 0, h5: 0 },
    deepseekGlm: { w: 0, h5: 0 }
  }

  for (const dbPath of getRouterDbPaths()) {
    if (!dbPath || !existsSync(dbPath)) continue
    let db = null
    try {
      const { DatabaseSync } = await import('node:sqlite')
      db = new DatabaseSync(dbPath, { readOnly: true })
      const modelRows = db.prepare(`
        SELECT LOWER(COALESCE(model, '')) AS m,
          COUNT(*) AS reqs7d,
          SUM(CASE WHEN timestamp >= datetime('now', '-5 hours') THEN 1 ELSE 0 END) AS reqs5h
        FROM usageHistory
        WHERE timestamp >= datetime('now', '-7 days')
        GROUP BY LOWER(COALESCE(model, ''))
      `).all()
      for (const mr of modelRows) {
        const name = String(mr.m || '')
        const w = Number(mr.reqs7d || 0)
        const h5 = Number(mr.reqs5h || 0)
        if (name.includes('gemini')) {
          buckets.gemini.w += w
          buckets.gemini.h5 += h5
        } else if (name.includes('claude') || name.includes('gpt') || /\bo[134]\b/.test(name)) {
          buckets.claudeGpt.w += w
          buckets.claudeGpt.h5 += h5
        } else if (name.includes('deepseek') || name.includes('glm') || name.includes('qwen')) {
          buckets.deepseekGlm.w += w
          buckets.deepseekGlm.h5 += h5
        }
      }
      return { buckets, dbPath }
    } catch {
      // Abaikan jika SQLite gagal dibaca
    } finally {
      try { db?.close?.() } catch { }
    }
  }

  return { buckets, dbPath: null }
}

function buildFallbackGroup(id, title, tooltip, b, weekCap, fiveHrCap) {
  const wPct = clampPct(100 - (b.w / weekCap) * 100)
  const h5Pct = clampPct(100 - (b.h5 / fiveHrCap) * 100)
  return {
    id,
    title,
    tooltip,
    rows: [
      {
        label: 'Weekly Limit Remaining',
        subtext: b.w > 0
          ? `Terpakai ${b.w} dari estimasi ${weekCap} req minggu ini · reset berkala.`
          : 'Belum ada pemakaian pada jendela mingguan ini.',
        remainingPct: wPct
      },
      {
        label: 'Five Hour Limit Remaining',
        subtext: b.h5 > 0
          ? `Terpakai ${b.h5} dari ${fiveHrCap} req dalam 5 jam terakhir.`
          : 'Kuota 5-jam penuh (100% siap digunakan).',
        remainingPct: h5Pct
      }
    ]
  }
}

function buildSyncedModelGroups(accounts, buckets) {
  const pickAccountForProviders = (keys) => {
    const matches = (accounts || []).filter(
      (a) => keys.includes(String(a.providerKey || '').toLowerCase()) && Array.isArray(a.quotas) && a.quotas.length > 0
    )
    return matches.find((a) => a.isActive !== false) || matches[0] || null
  }

  const deepseekAcc = pickAccountForProviders([
    'codebuddy-cn', 'codebuddy-intl', 'deepseek', 'glm', 'glm-cn', 'kimi', 'minimax', 'minimax-cn'
  ])
  const claudeAcc = pickAccountForProviders([
    'kiro', 'claude', 'anthropic', 'codex', 'openai', 'github', 'grok-cli', 'zed'
  ])
  const geminiAcc = pickAccountForProviders([
    'gemini', 'gemini-cli', 'antigravity'
  ])

  const buildFromLiveAccount = (id, title, tooltip, acc, fallbackBucket, weekCap, fiveHrCap) => {
    if (!acc || !acc.quotas?.length) {
      return buildFallbackGroup(id, title, tooltip, fallbackBucket, weekCap, fiveHrCap)
    }

    const qList = acc.quotas
    const q1 = qList.find((q) => /monthly|weekly|credit|personal|session|5h/i.test(q.label)) || qList[0]
    const otherQuotas = qList.filter((q) => q !== q1)

    const rows = [
      {
        label: `${q1.label} Limit Remaining`,
        subtext: `Terpakai ${q1.usedFormatted} / ${q1.limitFormatted} kredit (${acc.accountName}${acc.plan ? ` · ${acc.plan}` : ''})${q1.resetText && q1.resetText !== '-' ? ` · reset ${q1.resetText}` : ''}.`,
        remainingPct: q1.remainingPct
      }
    ]

    if (otherQuotas.length > 0) {
      const q2 = otherQuotas[0]
      rows.push({
        label: `${q2.label} Remaining`,
        subtext: `Terpakai ${q2.usedFormatted} / ${q2.limitFormatted} kredit (${acc.accountName})${q2.resetText && q2.resetText !== '-' ? ` · ${q2.resetText}` : ''}.`,
        remainingPct: q2.remainingPct
      })
    }

    if (qList.length > 2) {
      const numeric = qList.filter((q) => !q.unlimited && typeof q.limit === 'number' && q.limit > 0)
      if (numeric.length > 0) {
        const totalUsed = numeric.reduce((sum, q) => sum + (Number(q.used) || 0), 0)
        const totalLimit = numeric.reduce((sum, q) => sum + (Number(q.limit) || 0), 0)
        const totalPct = totalLimit > 0 ? clampPct(((totalLimit - totalUsed) / totalLimit) * 100) : 100
        rows.push({
          label: `Total ${qList.length} Quotas Remaining`,
          subtext: `Gabungan ${qList.length} paket kredit aktif (${acc.accountName}): terpakai ${formatQuotaNumber(totalUsed)} / ${formatQuotaNumber(totalLimit)}.`,
          remainingPct: totalPct
        })
      }
    } else if (otherQuotas.length === 0) {
      const h5 = fallbackBucket?.h5 || 0
      rows.push({
        label: 'Five Hour Limit Remaining',
        subtext: h5 > 0
          ? `Terpakai ${h5} dari ${fiveHrCap} req dalam 5 jam terakhir.`
          : 'Kuota jendela 5-jam penuh (100% siap digunakan).',
        remainingPct: clampPct(100 - (h5 / fiveHrCap) * 100)
      })
    }

    return { id, title, tooltip, rows }
  }

  return [
    buildFromLiveAccount(
      'gemini',
      geminiAcc ? `${geminiAcc.providerLabel} · Gemini Models` : 'Gemini Models',
      'Kuota mingguan & 5-jam model Google Gemini',
      geminiAcc,
      buckets.gemini,
      1500,
      100
    ),
    buildFromLiveAccount(
      'claude-gpt',
      claudeAcc ? `${claudeAcc.providerLabel} · Claude and GPT Models` : 'Claude and GPT models',
      'Kuota real-time model Claude, Kiro, dan GPT via 9Router',
      claudeAcc,
      buckets.claudeGpt,
      500,
      100
    ),
    buildFromLiveAccount(
      'deepseek-glm',
      deepseekAcc ? `${deepseekAcc.providerLabel} · DeepSeek & GLM Models` : 'DeepSeek & GLM Models',
      'Kuota real-time model DeepSeek, GLM, & paket Bonus Codebuddy',
      deepseekAcc,
      buckets.deepseekGlm,
      1500,
      100
    )
  ]
}

/**
 * --------------------------------------------------------------------------
 * 3.2. RESOLVER: AKUN & KUOTA 9ROUTER (SINKRONISASI REAL-TIME :20128 + FALLBACK SQLITE)
 * --------------------------------------------------------------------------
 */
export async function resolveRouterAccountsQuota({
  force = false,
  routerBaseUrl = 'http://127.0.0.1:20128',
  fetchImpl = globalThis.fetch
} = {}) {
  const { buckets, dbPath } = await readLocalRouterUsageBuckets()
  const base = String(routerBaseUrl || 'http://127.0.0.1:20128').replace(/\/+$/, '')

  // Jalur Utama: Panggil API lokal 9Router untuk data kuota real-time tiap akun
  if (typeof fetchImpl === 'function') {
    const cliToken = resolveRouterCliToken()
    const headers = { Accept: 'application/json' }
    if (cliToken) {
      headers['x-9r-cli-token'] = cliToken
    }

    const listResp = await fetchJsonWithTimeout(
      fetchImpl,
      `${base}/api/providers/client?page=1&pageSize=100&accountStatus=all&sort=priority`,
      headers,
      4000
    )

    if (listResp.ok && Array.isArray(listResp.data?.connections)) {
      const rawConns = listResp.data.connections

      // Kelompokkan per provider sesuai urutan kemunculan (identik dengan /dashboard/quota 9Router)
      const byProvider = new Map()
      for (const conn of rawConns) {
        const key = String(conn.provider || '')
        if (!byProvider.has(key)) byProvider.set(key, [])
        byProvider.get(key).push(conn)
      }
      const groupedConns = Array.from(byProvider.values()).flat()

      const accounts = await Promise.all(groupedConns.map(async (conn) => {
        const usageUrl = `${base}/api/usage/${encodeURIComponent(conn.id)}${force ? '?force=1' : ''}`
        const usageResp = await fetchJsonWithTimeout(fetchImpl, usageUrl, headers, 5500)
        const usageData = usageResp.data && typeof usageResp.data === 'object' ? usageResp.data : null
        const quotas = usageResp.ok ? normalizeRouterUsageQuotas(conn.provider, usageData) : []
        const testStatus = String(conn.testStatus || (usageResp.status === 401 ? 'expired' : 'unknown'))
        const usageMessage = String(usageData?.message || usageData?.error || '').trim()
        const providerLabel = formatRouterProviderLabel(conn.provider, conn.providerSpecificData)
        const isExpiredOrInvalid = quotas.length === 0 && Boolean(
          usageMessage || testStatus === 'unavailable' || testStatus === 'error' || testStatus === 'expired'
        )

        return {
          id: conn.id,
          source: '9router',
          providerKey: conn.provider,
          providerLabel,
          accountName: String(conn.name || conn.email || conn.displayName || 'Account'),
          authType: String(conn.authType || 'apikey'),
          isActive: conn.isActive !== false,
          testStatus: quotas.length > 0 ? 'active' : testStatus,
          plan: usageData?.plan || null,
          totalQuotas: quotas.length,
          isExpiredOrInvalid,
          errorMessage: isExpiredOrInvalid
            ? (usageMessage || `${providerLabel} credential invalid or expired.`)
            : null,
          quotas
        }
      }))

      const modelGroups = buildSyncedModelGroups(accounts, buckets)
      return { ok: true, liveSynced: true, accounts, modelGroups }
    }
  }

  // Jalur Fallback Offline: baca daftar akun langsung dari data.sqlite jika 9Router :20128 tidak aktif
  const targetDbs = dbPath ? [dbPath] : getRouterDbPaths()
  for (const candidateDb of targetDbs) {
    if (!candidateDb || !existsSync(candidateDb)) continue

    let db = null
    try {
      const { DatabaseSync } = await import('node:sqlite')
      db = new DatabaseSync(candidateDb, { readOnly: true })

      const connRows = db.prepare(`
        SELECT id, provider, authType, name, priority, isActive, data
        FROM providerConnections
        ORDER BY CASE WHEN priority IS NULL THEN 9999 ELSE priority END ASC, createdAt DESC
      `).all()

      const accounts = connRows.map((row) => {
        let d = {}
        try { d = JSON.parse(row.data || '{}') } catch { }
        const psd = d.providerSpecificData || {}
        const testStatus = String(d.testStatus || 'unknown')
        const isExpiredOrInvalid = testStatus === 'unavailable' || testStatus === 'error' || testStatus === 'expired'
        const providerLabel = formatRouterProviderLabel(row.provider, psd)

        return {
          id: row.id,
          source: '9router',
          providerKey: row.provider,
          providerLabel,
          accountName: String(row.name || 'Account'),
          authType: String(row.authType || 'apikey'),
          isActive: Boolean(row.isActive),
          testStatus,
          plan: null,
          totalQuotas: 0,
          isExpiredOrInvalid,
          errorMessage: isExpiredOrInvalid
            ? `${providerLabel} credential invalid or expired.`
            : '9Router (:20128) sedang offline — jalankan 9Router untuk sinkronisasi kredit real-time.',
          quotas: []
        }
      })

      const modelGroups = buildSyncedModelGroups(accounts, buckets)
      return { ok: true, liveSynced: false, accounts, modelGroups }
    } catch (err) {
      console.warn('[PathResolver] Gagal baca fallback kuota akun 9router:', err?.message || err)
      return { ok: false, liveSynced: false, accounts: [], modelGroups: [] }
    } finally {
      try { db?.close?.() } catch { }
    }
  }

  return { ok: false, liveSynced: false, accounts: [], modelGroups: [] }
}

/**
 * --------------------------------------------------------------------------
 * 4. RESOLVER: KOKORO-TTS NEURAL MODEL & SCRIPT DIRECTORY
 * --------------------------------------------------------------------------
 */
export function resolveKokoroModelDir() {
  const persisted = loadPersistedPaths()
  const home = homedir()
  const isWin = process.platform === 'win32'
  const drives = getLogicalDrives()

  const standardPkgDir = join(home, '.hermes-avatar', 'packages', 'kokoro')
  const legacyDir = join(home, '.kokoro-models')

  // Helper untuk cek kelengkapan berkas model di suatu direktori
  const inspectDir = (dir) => {
    if (!dir || !existsSync(dir)) return null
    const modelPath = join(dir, 'kokoro-v1.0.onnx')
    const voicesPath = join(dir, 'voices-v1.0.bin')
    const modelExists = existsSync(modelPath)
    const voicesExists = existsSync(voicesPath)
    let sizeMb = 0
    if (modelExists) {
      try {
        const st = statSync(modelPath)
        sizeMb = Math.round(st.size / (1024 * 1024))
      } catch { }
    }
    return {
      dir,
      modelPath,
      voicesPath,
      modelExists,
      voicesExists,
      ready: modelExists,
      sizeMb
    }
  }

  // Tier 1: Cache persisten
  if (persisted.kokoro_model_dir) {
    const inspected = inspectDir(persisted.kokoro_model_dir)
    if (inspected && inspected.ready) {
      return { ...inspected, source: 'kustom (cache tersimpan)' }
    }
  }

  // Tier 2: Environment Variable
  if (process.env.KOKORO_MODEL_DIR) {
    const inspected = inspectDir(process.env.KOKORO_MODEL_DIR)
    if (inspected && inspected.ready) {
      return { ...inspected, source: 'environment (KOKORO_MODEL_DIR)' }
    }
  }

  // Tier 3: Lokasi Standar Terpusat
  const stdInspect = inspectDir(standardPkgDir)
  if (stdInspect && stdInspect.ready) {
    return { ...stdInspect, source: 'paket terpusat (~/.hermes-avatar)' }
  }

  // Tier 4: Legacy Location
  const legacyInspect = inspectDir(legacyDir)
  if (legacyInspect && legacyInspect.ready) {
    return { ...legacyInspect, source: 'folder lama (~/.kokoro-models)' }
  }

  // Tier 5: Multi-Drive AI Model Search
  const candidateDirs = []
  for (const d of drives) {
    candidateDirs.push(
      `${d}:\\AI\\Models\\kokoro`,
      `${d}:\\AI\\kokoro`,
      `${d}:\\models\\kokoro`,
      `${d}:\\kokoro`
    )
  }
  for (const c of candidateDirs) {
    const inspected = inspectDir(c)
    if (inspected && inspected.ready) {
      return { ...inspected, source: `drive ${c.slice(0, 2)}` }
    }
  }

  // Default target fallback (folder tempat download baru)
  return {
    dir: standardPkgDir,
    modelPath: join(standardPkgDir, 'kokoro-v1.0.onnx'),
    voicesPath: join(standardPkgDir, 'voices-v1.0.bin'),
    modelExists: false,
    voicesExists: false,
    ready: false,
    sizeMb: 0,
    source: 'standar (siap unduh)'
  }
}

/**
 * --------------------------------------------------------------------------
 * 5. RESOLVER: HERMES CONFIG YAML
 * --------------------------------------------------------------------------
 */
export function resolveHermesConfigPath() {
  const persisted = loadPersistedPaths()
  const home = homedir()
  const drives = getLogicalDrives()

  // Tier 1: Cache persisten
  if (persisted.hermes_config && existsSync(persisted.hermes_config)) {
    return persisted.hermes_config
  }

  // Tier 2: Environment Variable
  if (process.env.HERMES_CONFIG && existsSync(process.env.HERMES_CONFIG)) {
    return process.env.HERMES_CONFIG
  }

  // Tier 3: Standar
  const candidates = [
    join(home, '.hermes', 'config.yaml'),
    join(home, 'AppData', 'Local', 'hermes', 'config.yaml'),
    join(home, '.config', 'hermes', 'config.yaml')
  ]

  // Multi-drive candidate
  for (const d of drives) {
    candidates.push(`${d}:\\hermes\\config.yaml`, `${d}:\\.hermes\\config.yaml`)
  }

  for (const c of candidates) {
    if (existsSync(c)) return c
  }

  if (process.platform === 'win32' && existsSync(join(home, 'AppData', 'Local', 'hermes'))) {
    return join(home, 'AppData', 'Local', 'hermes', 'config.yaml')
  }
  return join(home, '.hermes', 'config.yaml')
}

/**
 * --------------------------------------------------------------------------
 * 6. SUMMARY: AMBIL SEMUA STATUS JALUR DETEKSI (DILENGKAPI CACHE MEMORI)
 * --------------------------------------------------------------------------
 */
export async function getAllDetectedPaths(force = false) {
  const now = Date.now()
  if (!force && cachedDetectedPaths && (now - lastDetectedPathsTime < CACHE_TTL_MS)) {
    return cachedDetectedPaths
  }

  const hermes = resolveHermesBinary()
  const python = await resolvePythonBinary()
  const router = resolveRouterBinary()
  const kokoro = resolveKokoroModelDir()
  const config = resolveHermesConfigPath()
  const drives = getLogicalDrives()
  const persisted = loadPersistedPaths()

  cachedDetectedPaths = {
    drives,
    hermes: {
      cmd: hermes.cmd,
      ok: !!hermes.cmd,
      source: hermes.source,
      isCustom: !!persisted.hermes_bin
    },
    python: {
      cmd: python.cmd,
      version: python.version,
      ok: python.ok,
      source: python.source,
      isCustom: !!persisted.python_bin
    },
    router: {
      cmd: router.cmd,
      ok: router.ok,
      source: router.source,
      isCustom: !!persisted.router_bin
    },
    routerKey: await resolveRouterApiKey(),
    kokoro: {
      dir: kokoro.dir,
      modelReady: kokoro.ready,
      sizeMb: kokoro.sizeMb,
      source: kokoro.source,
      isCustom: !!persisted.kokoro_model_dir
    },
    config: {
      path: config,
      exists: existsSync(config)
    }
  }
  lastDetectedPathsTime = now
  return cachedDetectedPaths
}
