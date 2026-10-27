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

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
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
            } catch {}
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
    // Lokasi standar pengguna
    candidatePaths.push(
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
      execFile(cmdPath, ['--version'], { timeout: 2500, env: process.env }, (err, stdout, stderr) => {
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
    // Standard User AppData
    for (const ver of ['Python314', 'Python313', 'Python312', 'Python311', 'Python310']) {
      candidatePythons.push(
        join(home, 'AppData', 'Local', 'Programs', 'Python', ver, 'python.exe'),
        join(home, 'AppData', 'Local', 'hermes', 'hermes-agent', 'venv', 'Scripts', 'python.exe'),
        join(home, 'AppData', 'Local', 'hermes', 'venv', 'Scripts', 'python.exe')
      )
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
 * Mendapatkan binary Python windowless (pythonw.exe / pyw.exe) untuk Windows
 * agar eksekusi server latar belakang (seperti kokoro) 100% senyap tanpa console window.
 */
export async function resolveWindowlessPythonBinary() {
  const isWin = process.platform === 'win32'
  const normalPy = await resolvePythonBinary()
  if (!isWin) {
    return normalPy.cmd || 'python3'
  }

  // 1. Cek turunan dari python yang terdeteksi
  if (normalPy?.ok && normalPy.cmd) {
    const candidate = normalPy.cmd
      .replace(/python\.exe$/i, 'pythonw.exe')
      .replace(/py\.exe$/i, 'pyw.exe')
    if (candidate !== normalPy.cmd && existsSync(candidate)) {
      return candidate
    }
  }

  // 2. Cek pyw.exe di Windows PATH
  const pywHits = fastWhere('pyw', ['.exe', ''])
  if (pywHits.length > 0) return pywHits[0]

  // 3. Cek pythonw.exe di Windows PATH
  const pythonwHits = fastWhere('pythonw', ['.exe', ''])
  if (pythonwHits.length > 0) return pythonwHits[0]

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
    candidateRouters.push(
      '/usr/local/bin/9router',
      '/opt/homebrew/bin/9router',
      join(home, '.local', 'bin', '9router'),
      join(home, '.npm-global', 'bin', '9router')
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
export async function resolveRouterApiKey() {
  const home = homedir()
  const candidateDbs = [
    join(process.env.APPDATA || '', '9router', 'db', 'data.sqlite'),
    join(home, 'AppData', 'Roaming', '9router', 'db', 'data.sqlite'),
    join(home, '.config', '9router', 'db', 'data.sqlite'),
    join(home, '.9router', 'db', 'data.sqlite')
  ]

  for (const dbPath of candidateDbs) {
    if (!dbPath || !existsSync(dbPath)) continue

    try {
      const { DatabaseSync } = await import('node:sqlite')
      const db = new DatabaseSync(dbPath, { readOnly: true })
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
    }
  }

  return { key: null, name: null, ok: false }
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
      } catch {}
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
