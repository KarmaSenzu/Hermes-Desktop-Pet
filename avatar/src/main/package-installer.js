/**
 * package-installer.js — Mesin instalasi 1-klik cepat & tahan gagal (Package Hub)
 *
 * Fitur utama:
 * - Instalasi senyap di latar belakang (windowsHide: true) dengan flag percepatan.
 * - Deteksi akurat lokasi baru Hermes (%LOCALAPPDATA%\hermes\bin) & refresh PATH Registry.
 * - Pemetaan progres dinamis (computeStageProgress) + heartbeat timer agar UI tidak stuck di 60%.
 * - State checklist persisten (~/.hermes-avatar/install-state.json) + dukungan Continue / Resume.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { writeFile, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import {
  resolvePythonBinary,
  resolveHermesBinary,
  resolveRouterBinary,
  fastWhere,
  savePersistedPath,
  invalidatePathCache
} from './path-resolver.js'
import {
  fixSystemPath,
  startHermes,
  startRouter,
  startKokoro
} from './service-manager.js'

const HERMES_INSTALL_PS1_URLS = [
  'https://hermes-agent.nousresearch.com/install.ps1',
  'https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1'
]
const HERMES_INSTALL_SH_URLS = [
  'https://hermes-agent.nousresearch.com/install.sh',
  'https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh'
]

export const PACKAGE_ORDER = ['python', 'hermes', '9router', 'kokoro']

const PACKAGE_META = {
  python: { label: 'Python 3.10+ Runtime', weight: 0.2 },
  hermes: { label: 'Hermes Agent CLI', weight: 0.35 },
  '9router': { label: '9Router Gateway', weight: 0.2 },
  kokoro: { label: 'Kokoro-TTS Engine', weight: 0.25 }
}

function createInitialQueueState() {
  const items = {}
  for (const id of PACKAGE_ORDER) {
    items[id] = {
      id,
      label: PACKAGE_META[id].label,
      status: 'pending',
      percent: 0,
      message: 'Menunggu giliran',
      error: null,
      updatedAt: null
    }
  }
  return {
    active: false,
    mode: null,
    overallPercent: 0,
    startedAt: null,
    updatedAt: null,
    items
  }
}

let installQueueState = createInitialQueueState()
let stateLoadedFromDisk = false
let activeInstallCount = 0

function getStateFilePath(depsOverride = {}) {
  if (depsOverride.stateFile) return depsOverride.stateFile
  const home = typeof depsOverride.homedir === 'function' ? depsOverride.homedir() : homedir()
  return join(home, '.hermes-avatar', 'install-state.json')
}

function persistQueueState(depsOverride = {}) {
  try {
    const file = getStateFilePath(depsOverride)
    const dir = dirname(file)
    const mk = depsOverride.mkdirSync || mkdirSync
    const wr = depsOverride.writeFileSync || writeFileSync
    mk(dir, { recursive: true })
    wr(file, JSON.stringify(installQueueState, null, 2), 'utf8')
  } catch {
    // Cache state opsional — jangan pernah gagalkan instalasi karena write state
  }
}

function loadQueueStateIfNeeded(depsOverride = {}) {
  if (stateLoadedFromDisk && !depsOverride.stateFile) return
  try {
    const file = getStateFilePath(depsOverride)
    const ex = depsOverride.existsSync || existsSync
    const rd = depsOverride.readFileSync || readFileSync
    if (ex(file)) {
      const parsed = JSON.parse(rd(file, 'utf8'))
      if (parsed && typeof parsed === 'object' && parsed.items) {
        const fresh = createInitialQueueState()
        for (const id of PACKAGE_ORDER) {
          if (parsed.items[id] && typeof parsed.items[id] === 'object') {
            fresh.items[id] = { ...fresh.items[id], ...parsed.items[id] }
            // Bila proses sebelumnya terputus paksa saat 'running', tandai failed agar bisa di-Continue
            if (!installQueueState.active && fresh.items[id].status === 'running') {
              fresh.items[id].status = 'failed'
              fresh.items[id].message = 'Terhenti saat proses sebelumnya — siap dilanjutkan'
              fresh.items[id].error = fresh.items[id].error || 'Terhenti sebelum selesai'
            }
          }
        }
        fresh.active = installQueueState.active
        fresh.mode = parsed.mode || null
        fresh.startedAt = parsed.startedAt || null
        fresh.updatedAt = parsed.updatedAt || null
        recomputeOverallPercent(fresh)
        installQueueState = fresh
      }
    }
  } catch {
    // Abaikan file state korup
  } finally {
    stateLoadedFromDisk = true
  }
}

function recomputeOverallPercent(stateObj = installQueueState) {
  let total = 0
  for (const id of PACKAGE_ORDER) {
    const item = stateObj.items[id]
    const w = PACKAGE_META[id].weight
    const pct = item?.status === 'done' ? 100 : Math.max(0, Math.min(100, Number(item?.percent) || 0))
    total += pct * w
  }
  stateObj.overallPercent = Math.round(total)
  return stateObj.overallPercent
}

function updateQueueItem(pkgId, patch, depsOverride = {}) {
  if (!PACKAGE_ORDER.includes(pkgId)) return getInstallQueueState(depsOverride)
  const now = new Date().toISOString()
  installQueueState.items[pkgId] = {
    ...installQueueState.items[pkgId],
    ...patch,
    updatedAt: now
  }
  installQueueState.updatedAt = now
  recomputeOverallPercent(installQueueState)
  persistQueueState(depsOverride)
  return getInstallQueueState(depsOverride)
}

/**
 * Mengembalikan salinan snapshot state antrean & checklist instalasi saat ini.
 */
export function getInstallQueueState(depsOverride = {}) {
  loadQueueStateIfNeeded(depsOverride)
  return structuredClone(installQueueState)
}

/**
 * Mengembalikan true bila masih ada proses instalasi paket yang sedang berjalan di latar belakang.
 */
export function isPackageInstallRunning() {
  return activeInstallCount > 0 || Boolean(installQueueState.active)
}

/**
 * Reset state antrean di memori (terutama untuk isolasi unit test).
 */
export function resetInstallQueueState() {
  installQueueState = createInitialQueueState()
  stateLoadedFromDisk = true
  activeInstallCount = 0
}

function getPythonInstallerUrl(arch) {
  if (arch === 'arm64') {
    return 'https://www.python.org/ftp/python/3.12.8/python-3.12.8-arm64.exe'
  }
  return 'https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe'
}

async function defaultDownloadFile(urls, destPath, timeoutMs = 120000) {
  const urlList = Array.isArray(urls) ? urls : [urls]
  let lastErr = null

  for (const rawUrl of urlList) {
    try {
      const parsed = new URL(rawUrl)
      if (parsed.protocol !== 'https:') {
        throw new Error(`Protokol unduhan tidak diizinkan: ${parsed.protocol}`)
      }
      const res = await fetch(rawUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': 'Hermes-Desktop-Pet-Installer/1.1' }
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} saat mengunduh ${rawUrl}`)
      }
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length === 0) {
        throw new Error(`Berkas unduhan kosong dari ${rawUrl}`)
      }
      await writeFile(destPath, buf)
      return destPath
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr || new Error('Gagal mengunduh berkas installer')
}

function defaultRunCommand(cmd, args = [], options = {}) {
  const { timeoutMs = 420000, onOutput = null, shell = false } = options
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const needsShell = shell || (process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd))

    let child
    try {
      child = spawn(cmd, args, {
        windowsHide: true,
        shell: needsShell,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env
      })
    } catch (err) {
      return resolve({ code: -1, stdout: '', stderr: err?.message || String(err), error: err })
    }

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { child.kill('SIGTERM') } catch {}
      resolve({ code: -1, stdout, stderr: `${stderr}\nProses melebihi batas waktu (${Math.round(timeoutMs / 1000)}s).` })
    }, timeoutMs)

    const pushChunk = (chunk, isErr) => {
      const text = chunk.toString('utf8')
      if (isErr) stderr += text
      else stdout += text
      if (typeof onOutput === 'function') {
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
        for (const l of lines) onOutput(l)
      }
    }

    child.stdout?.on('data', (d) => pushChunk(d, false))
    child.stderr?.on('data', (d) => pushChunk(d, true))
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code: -1, stdout, stderr: err?.message || String(err), error: err })
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code: code ?? 0, stdout, stderr })
    })
  })
}

function getDefaultDeps(overrides = {}) {
  return {
    platform: process.platform,
    arch: process.arch,
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
    tmpdir,
    homedir,
    resolvePythonBinary,
    resolveHermesBinary,
    resolveRouterBinary,
    fastWhere,
    savePersistedPath,
    fixSystemPath,
    invalidatePathCache,
    startHermes,
    startRouter,
    startKokoro,
    downloadFile: defaultDownloadFile,
    runCommand: defaultRunCommand,
    rmFile: (p) => rm(p, { force: true }).catch(() => {}),
    ...overrides
  }
}

function makeEmitter(pkgId, onProgress, depsOverride = {}) {
  return (percent, message, status = 'running', extra = {}) => {
    const clamped = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)))
    const snapshot = updateQueueItem(pkgId, {
      status,
      percent: clamped,
      message,
      error: status === 'failed' ? (extra.error || message) : null
    }, depsOverride)
    try {
      onProgress?.({
        pkgId,
        percent: clamped,
        message,
        status,
        queue: snapshot,
        ...extra
      })
    } catch {
      // Abaikan error listener UI
    }
  }
}

function tailLine(res) {
  const raw = `${res?.stderr || ''}\n${res?.stdout || ''}`.trim()
  if (!raw) return 'Kode keluar tidak nol.'
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  return lines.slice(-2).join(' | ')
}

/**
 * Memetakan baris output installer ke progres persentase bertahap (anti-stuck di 60%).
 */
export function computeStageProgress(pkgId, line, currentPct = 15) {
  const text = String(line || '').toLowerCase()
  const cur = Math.max(0, Math.min(95, Number(currentPct) || 0))

  if (pkgId === 'hermes') {
    if (/(install complete|hermes command ready|config prepared|pinned\s+[0-9a-f]+)/i.test(text)) {
      return { percent: Math.max(cur, 90), cap: 95 }
    }
    if (/(publishing|launchers|source_completion|building the hermes|app products)/i.test(text)) {
      return { percent: Math.max(cur, 76), cap: 89 }
    }
    if (/(pm\.cli|installing dependencies|uv\.lock|resolved\s+\d+|installed\s+\d+|prepared\s+\d+|downloading)/i.test(text)) {
      return { percent: Math.max(cur, 58), cap: 75 }
    }
    if (/(bootstrap python|python\s+3\.\d+|venv|environment)/i.test(text)) {
      return { percent: Math.max(cur, 44), cap: 57 }
    }
    if (/(cloning|receiving objects|resolving deltas|fetching|updating)/i.test(text)) {
      return { percent: Math.max(cur, 28), cap: 43 }
    }
    if (/(uv|git|prerequisite|checking)/i.test(text)) {
      return { percent: Math.max(cur, 18), cap: 27 }
    }
    return { percent: Math.min(86, cur + 1), cap: Math.max(55, Math.min(86, cur + 8)) }
  }

  if (pkgId === 'python') {
    if (/(successfully installed|completed|finished)/i.test(text)) {
      return { percent: Math.max(cur, 92), cap: 95 }
    }
    if (/(installing|verifying|starting package install|winget)/i.test(text)) {
      return { percent: Math.max(cur, 55), cap: 88 }
    }
    if (/(downloading|found python)/i.test(text)) {
      return { percent: Math.max(cur, 32), cap: 54 }
    }
    return { percent: Math.min(84, cur + 2), cap: 85 }
  }

  if (pkgId === '9router') {
    if (/(added \d+ package|changed \d+ package|up to date)/i.test(text)) {
      return { percent: Math.max(cur, 86), cap: 92 }
    }
    if (/(9router|reify|idealTree|npm)/i.test(text)) {
      return { percent: Math.max(cur, 58), cap: 85 }
    }
    if (/(nodejs|winget|downloading)/i.test(text)) {
      return { percent: Math.max(cur, 25), cap: 50 }
    }
    return { percent: Math.min(84, cur + 2), cap: 85 }
  }

  if (pkgId === 'kokoro') {
    if (/(successfully installed)/i.test(text)) {
      return { percent: Math.max(cur, 88), cap: 94 }
    }
    if (/(installing collected packages)/i.test(text)) {
      return { percent: Math.max(cur, 74), cap: 87 }
    }
    if (/(collecting|downloading|using cached)/i.test(text)) {
      return { percent: Math.max(cur, 56), cap: 73 }
    }
    return { percent: Math.min(86, cur + 2), cap: 86 }
  }

  return { percent: Math.min(88, cur + 1), cap: 88 }
}

/**
 * Menjalankan perintah sub-proses sambil terus mengirim pembaruan progres dinamis + heartbeat waktu.
 */
async function runWithDynamicProgress(d, { pkgId, cmd, args, timeoutMs, startPct, baseMsg, emit }) {
  let pct = startPct
  let stageCap = Math.max(startPct + 10, 75)
  let lastLine = baseMsg
  const startedAt = Date.now()

  const heartbeat = setInterval(() => {
    const elapsedSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
    if (pct < Math.min(stageCap, 92)) {
      pct = Math.min(Math.min(stageCap, 92), pct + 1)
    }
    emit(pct, `${lastLine} (⏱️ ${elapsedSec}d)`, 'running')
  }, 1000)

  try {
    return await d.runCommand(cmd, args, {
      timeoutMs,
      onOutput: (line) => {
        const mapped = computeStageProgress(pkgId, line, pct)
        pct = mapped.percent
        stageCap = mapped.cap
        const shortLine = line.length > 120 ? `${line.slice(0, 117)}...` : line
        lastLine = shortLine
        emit(pct, shortLine, 'running')
      }
    })
  } finally {
    clearInterval(heartbeat)
  }
}

/**
 * Fallback pemeriksaan langsung direktori standar binary Hermes (termasuk jalur baru %LOCALAPPDATA%\hermes\bin).
 */
function findHermesBinaryDirect(d) {
  const viaResolver = d.resolveHermesBinary()
  if (viaResolver?.cmd) return viaResolver.cmd

  const home = d.homedir()
  const candidates = d.platform === 'win32'
    ? [
        join(home, 'AppData', 'Local', 'hermes', 'bin', 'hermes.exe'),
        join(home, 'AppData', 'Local', 'hermes', 'bin', 'hermes.cmd'),
        join(home, 'AppData', 'Local', 'hermes', 'hermes-agent', '.hermes', 'bin', 'hermes.exe'),
        join(home, 'AppData', 'Local', 'hermes', 'hermes-agent', '.hermes', 'bin', 'hermes.cmd'),
        join(home, 'AppData', 'Local', 'hermes', 'hermes-agent', 'venv', 'Scripts', 'hermes.exe'),
        join(home, 'AppData', 'Local', 'hermes', 'venv', 'Scripts', 'hermes.exe'),
        join(home, '.hermes', 'venv', 'Scripts', 'hermes.exe')
      ]
    : [
        join(home, '.local', 'bin', 'hermes'),
        join(home, '.hermes', 'bin', 'hermes'),
        join(home, '.hermes', 'venv', 'bin', 'hermes')
      ]

  for (const c of candidates) {
    if (d.existsSync(c)) return c
  }
  return null
}

/**
 * Mencari lokasi eksekusi npm / npm.cmd yang valid di sistem.
 */
export function resolveNpmCmd(depsOverride = {}) {
  const d = getDefaultDeps(depsOverride)
  const isWin = d.platform === 'win32'
  const hits = d.fastWhere('npm', isWin ? ['.cmd', '.exe', ''] : [''])
  if (hits.length > 0) return hits[0]

  const home = d.homedir()
  const candidates = isWin
    ? [
        'C:\\Program Files\\nodejs\\npm.cmd',
        join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'npm', 'npm.cmd'),
        join(home, 'AppData', 'Local', 'Programs', 'nodejs', 'npm.cmd')
      ]
    : [
        '/opt/homebrew/bin/npm',
        '/usr/local/bin/npm',
        '/usr/bin/npm'
      ]

  for (const c of candidates) {
    if (d.existsSync(c)) return c
  }
  return null
}

/**
 * Memasang Python 3.12 secara senyap (winget -> fallback installer resmi python.org di Windows).
 */
export async function installPython({ onProgress, deps: depsOverride } = {}) {
  const d = getDefaultDeps(depsOverride)
  const emit = makeEmitter('python', onProgress, d)

  emit(5, 'Memeriksa ketersediaan Python 3.10+...')
  const existing = await d.resolvePythonBinary()
  if (existing?.ok) {
    emit(100, `Python sudah siap (${existing.version})`, 'done')
    return { ok: true, already: true, version: existing.version, cmd: existing.cmd }
  }

  if (d.platform === 'win32') {
    emit(15, 'Memasang Python 3.12 secara senyap via winget...')
    const wgRes = await runWithDynamicProgress(d, {
      pkgId: 'python',
      cmd: 'winget',
      args: ['install', '-e', '--id', 'Python.Python.3.12', '--accept-package-agreements', '--accept-source-agreements', '--scope', 'user', '--silent'],
      timeoutMs: 300000,
      startPct: 18,
      baseMsg: 'Menjalankan winget Python 3.12...',
      emit
    })

    d.fixSystemPath({ refreshRegistry: true })
    d.invalidatePathCache()
    let verified = await d.resolvePythonBinary()

    if (!verified?.ok) {
      const url = getPythonInstallerUrl(d.arch)
      const exePath = join(d.tmpdir(), `hermes-python-3.12.8-${d.arch}.exe`)
      try {
        emit(45, 'Mengunduh installer resmi Python 3.12...')
        await d.downloadFile(url, exePath, 180000)
        emit(65, 'Menjalankan instalasi senyap Python 3.12...')
        const instRes = await runWithDynamicProgress(d, {
          pkgId: 'python',
          cmd: exePath,
          args: ['/quiet', 'InstallAllUsers=0', 'PrependPath=1', 'Include_test=0', 'Include_launcher=1'],
          timeoutMs: 300000,
          startPct: 68,
          baseMsg: 'Memasang Python 3.12 ke sistem...',
          emit
        })
        if (instRes.code !== 0) {
          const errMsg = `Instalasi Python gagal: ${tailLine(instRes || wgRes)}`
          emit(0, errMsg, 'failed', { error: errMsg })
          return { ok: false, error: errMsg }
        }
      } catch (err) {
        const errMsg = `Gagal memasang Python otomatis: ${err?.message || err}`
        emit(0, errMsg, 'failed', { error: errMsg })
        return { ok: false, error: errMsg }
      } finally {
        await d.rmFile(exePath)
      }

      d.fixSystemPath({ refreshRegistry: true })
      d.invalidatePathCache()
      verified = await d.resolvePythonBinary()
    }

    if (verified?.ok) {
      emit(100, `Python berhasil dipasang (${verified.version})`, 'done')
      return { ok: true, already: false, version: verified.version, cmd: verified.cmd }
    }
    const notFoundErr = 'Python selesai dipasang tetapi binary belum terdeteksi. Coba pindai ulang drive.'
    emit(0, notFoundErr, 'failed', { error: notFoundErr })
    return { ok: false, error: notFoundErr }
  }

  if (d.platform === 'darwin') {
    emit(30, 'Memasang Python 3.12 via Homebrew...')
    const brewRes = await runWithDynamicProgress(d, {
      pkgId: 'python',
      cmd: 'brew',
      args: ['install', 'python@3.12'],
      timeoutMs: 300000,
      startPct: 30,
      baseMsg: 'Memasang Python via Homebrew...',
      emit
    })
    d.fixSystemPath()
    d.invalidatePathCache()
    const verified = await d.resolvePythonBinary()
    if (verified?.ok) {
      emit(100, `Python siap (${verified.version})`, 'done')
      return { ok: true, already: false, version: verified.version, cmd: verified.cmd }
    }
    const brewErr = `Gagal memasang Python via Homebrew: ${tailLine(brewRes)}`
    emit(0, brewErr, 'failed', { error: brewErr })
    return { ok: false, error: brewErr }
  }

  const linuxErr = 'Silakan pasang Python 3.10+ melalui package manager distro Linux Anda (mis. sudo apt install python3 python3-pip).'
  emit(0, linuxErr, 'failed', { error: linuxErr })
  return { ok: false, error: linuxErr }
}

/**
 * Memasang Hermes Agent CLI di latar belakang (melewati Chromium/CUA agar 3x-5x lebih cepat)
 * dan langsung menyalakan daemon port 9119.
 */
export async function installHermes({ onProgress, deps: depsOverride } = {}) {
  const d = getDefaultDeps(depsOverride)
  const emit = makeEmitter('hermes', onProgress, d)

  emit(5, 'Memeriksa Hermes Agent CLI...')
  const existingCmd = findHermesBinaryDirect(d)
  if (existingCmd) {
    d.savePersistedPath?.('hermes_bin', existingCmd)
    emit(85, 'Hermes sudah terpasang — menyalakan layanan AI (:9119)...')
    const st = await d.startHermes()
    emit(100, st?.ok ? 'Hermes aktif di port 9119' : 'Hermes sudah terpasang', 'done')
    return { ok: true, already: true, started: !!st?.ok, cmd: existingCmd }
  }

  if (d.platform === 'win32') {
    const ps1Path = join(d.tmpdir(), 'hermes-agent-install.ps1')
    try {
      emit(12, 'Mengunduh skrip resmi Hermes Agent (mode ringan tanpa Chromium)...')
      await d.downloadFile(HERMES_INSTALL_PS1_URLS, ps1Path, 90000)

      emit(22, 'Memasang Hermes Agent secara senyap (mode cepat)...')
      const res = await runWithDynamicProgress(d, {
        pkgId: 'hermes',
        cmd: 'powershell.exe',
        args: [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          ps1Path,
          '-SkipSetup',
          '-NonInteractive',
          '-SkipBrowser',
          '-SkipComputerUse'
        ],
        timeoutMs: 600000,
        startPct: 24,
        baseMsg: 'Memasang Hermes Agent (uv & dependencies)...',
        emit
      })

      d.fixSystemPath({ refreshRegistry: true })
      d.invalidatePathCache()

      let detectedCmd = findHermesBinaryDirect(d)
      if (!detectedCmd) {
        // Reload sekali lagi bila binary baru selesai ditulis ke disk
        await new Promise((r) => setTimeout(r, 400))
        d.fixSystemPath({ refreshRegistry: true })
        d.invalidatePathCache()
        detectedCmd = findHermesBinaryDirect(d)
      }

      if (!detectedCmd) {
        const installedHint = /Hermes Agent install complete/i.test(`${res.stdout || ''}\n${res.stderr || ''}`)
        const errMsg = installedHint
          ? 'Hermes selesai dipasang namun file hermes.exe belum ditemukan di folder standar. Klik "Pindai Seluruh Drive" atau pilih manual.'
          : `Pemasangan Hermes gagal: ${tailLine(res)}`
        emit(0, errMsg, 'failed', { error: errMsg })
        return { ok: false, error: errMsg }
      }

      d.savePersistedPath?.('hermes_bin', detectedCmd)
      emit(94, 'Menyalakan daemon Hermes (:9119)...')
      const st = await d.startHermes()
      emit(100, st?.ok ? 'Hermes terpasang dan aktif di port 9119!' : 'Hermes berhasil dipasang!', 'done')
      return { ok: true, already: false, started: !!st?.ok, cmd: detectedCmd }
    } catch (err) {
      const errMsg = `Gagal mengunduh/memasang Hermes: ${err?.message || err}`
      emit(0, errMsg, 'failed', { error: errMsg })
      return { ok: false, error: errMsg }
    } finally {
      await d.rmFile(ps1Path)
    }
  }

  const shPath = join(d.tmpdir(), 'hermes-agent-install.sh')
  try {
    emit(12, 'Mengunduh installer Hermes Agent...')
    await d.downloadFile(HERMES_INSTALL_SH_URLS, shPath, 90000)
    emit(25, 'Memasang Hermes Agent (mode cepat tanpa browser)...')
    const res = await runWithDynamicProgress(d, {
      pkgId: 'hermes',
      cmd: 'bash',
      args: [shPath, '--skip-setup', '--skip-browser', '--skip-computer-use'],
      timeoutMs: 600000,
      startPct: 28,
      baseMsg: 'Memasang Hermes Agent...',
      emit
    })

    d.fixSystemPath()
    d.invalidatePathCache()
    const detectedCmd = findHermesBinaryDirect(d)
    if (!detectedCmd) {
      const errMsg = `Pemasangan Hermes gagal: ${tailLine(res)}`
      emit(0, errMsg, 'failed', { error: errMsg })
      return { ok: false, error: errMsg }
    }

    d.savePersistedPath?.('hermes_bin', detectedCmd)
    emit(94, 'Menyalakan daemon Hermes (:9119)...')
    const st = await d.startHermes()
    emit(100, 'Hermes berhasil dipasang dan siap digunakan!', 'done')
    return { ok: true, already: false, started: !!st?.ok, cmd: detectedCmd }
  } catch (err) {
    const errMsg = `Gagal memasang Hermes: ${err?.message || err}`
    emit(0, errMsg, 'failed', { error: errMsg })
    return { ok: false, error: errMsg }
  } finally {
    await d.rmFile(shPath)
  }
}

/**
 * Memasang 9Router via NPM di latar belakang & langsung menyalakan port 20128.
 */
export async function installRouter({ onProgress, deps: depsOverride } = {}) {
  const d = getDefaultDeps(depsOverride)
  const emit = makeEmitter('9router', onProgress, d)

  emit(5, 'Memeriksa ketersediaan 9Router...')
  const existing = d.resolveRouterBinary()
  if (existing?.ok && existing?.cmd) {
    emit(85, '9Router sudah terpasang — menyalakan port 20128...')
    const st = await d.startRouter()
    emit(100, st?.ok ? '9Router aktif di port 20128' : '9Router sudah terpasang', 'done')
    return { ok: true, already: true, started: !!st?.ok, cmd: existing.cmd }
  }

  let npmCmd = resolveNpmCmd(d)
  if (!npmCmd && d.platform === 'win32') {
    emit(18, 'Node.js / NPM belum ada — memasang Node.js LTS secara senyap...')
    await runWithDynamicProgress(d, {
      pkgId: '9router',
      cmd: 'winget',
      args: ['install', '-e', '--id', 'OpenJS.NodeJS.LTS', '--accept-package-agreements', '--accept-source-agreements', '--silent'],
      timeoutMs: 300000,
      startPct: 22,
      baseMsg: 'Memasang Node.js LTS...',
      emit
    })
    d.fixSystemPath({ refreshRegistry: true })
    d.invalidatePathCache()
    npmCmd = resolveNpmCmd(d)
  }

  if (!npmCmd) {
    const errMsg = 'Node.js / NPM belum tersedia di komputer ini. Silakan pasang Node.js LTS terlebih dahulu.'
    emit(0, errMsg, 'failed', { error: errMsg })
    return { ok: false, error: errMsg }
  }

  emit(50, 'Memasang 9Router secara senyap (npm install -g 9router)...')
  const npmRes = await runWithDynamicProgress(d, {
    pkgId: '9router',
    cmd: npmCmd,
    args: ['install', '-g', '9router', '--prefer-online', '--no-audit', '--no-fund', '--progress=false'],
    timeoutMs: 240000,
    startPct: 52,
    baseMsg: 'Mengunduh & memasang 9router...',
    emit
  })

  d.fixSystemPath({ refreshRegistry: true })
  d.invalidatePathCache()
  const after = d.resolveRouterBinary()
  if (!after?.ok) {
    const errMsg = `Gagal memasang 9Router: ${tailLine(npmRes)}`
    emit(0, errMsg, 'failed', { error: errMsg })
    return { ok: false, error: errMsg }
  }

  d.savePersistedPath?.('router_bin', after.cmd)
  emit(92, 'Menyalakan daemon 9Router (:20128)...')
  const st = await d.startRouter()
  emit(100, st?.ok ? '9Router terpasang & aktif di port 20128!' : '9Router berhasil dipasang!', 'done')
  return { ok: true, already: false, started: !!st?.ok, cmd: after.cmd }
}

/**
 * Memastikan Python siap, memasang dependensi Kokoro-TTS (--prefer-binary), lalu menyalakan server (:8880).
 */
export async function installKokoro({ onProgress, deps: depsOverride } = {}) {
  const d = getDefaultDeps(depsOverride)
  const emit = makeEmitter('kokoro', onProgress, d)

  emit(5, 'Memeriksa runtime Python untuk Kokoro-TTS...')
  let py = await d.resolvePythonBinary()
  if (!py?.ok) {
    emit(10, 'Python belum terpasang — memasang Python 3.12 secara otomatis...')
    const pyRes = await installPython({
      onProgress: (info) => {
        const scaled = Math.max(10, Math.round((info.percent || 0) * 0.45))
        emit(scaled, info.message || 'Menyiapkan Python...', 'running')
      },
      deps: d
    })
    if (!pyRes?.ok) {
      const errMsg = pyRes?.error || 'Python 3.10+ gagal disiapkan untuk Kokoro-TTS.'
      emit(0, errMsg, 'failed', { error: errMsg })
      return { ok: false, error: errMsg }
    }
    py = await d.resolvePythonBinary()
  }

  const pyCmd = py?.cmd || (d.platform === 'win32' ? 'py' : 'python3')
  const basePipArgs = ['-m', 'pip', 'install', '--prefer-binary', '--disable-pip-version-check', '--no-warn-script-location', 'kokoro-onnx', 'soundfile']
  emit(52, 'Memasang paket kokoro-onnx & soundfile (mode binary cepat)...')
  let pipRes = await runWithDynamicProgress(d, {
    pkgId: 'kokoro',
    cmd: pyCmd,
    args: basePipArgs,
    timeoutMs: 300000,
    startPct: 54,
    baseMsg: 'Memasang kokoro-onnx & soundfile...',
    emit
  })

  if (pipRes.code !== 0 && d.platform !== 'win32') {
    pipRes = await runWithDynamicProgress(d, {
      pkgId: 'kokoro',
      cmd: pyCmd,
      args: [...basePipArgs, '--break-system-packages'],
      timeoutMs: 300000,
      startPct: 68,
      baseMsg: 'Memasang kokoro-onnx (--break-system-packages)...',
      emit
    })
  }

  if (pipRes.code !== 0) {
    const errMsg = `Gagal memasang kokoro-onnx via pip: ${tailLine(pipRes)}`
    emit(0, errMsg, 'failed', { error: errMsg })
    return { ok: false, error: errMsg }
  }

  emit(90, 'Menyalakan server Kokoro-TTS (:8880)...')
  const st = await d.startKokoro()
  emit(100, st?.ok ? 'Kokoro-TTS siap dan aktif di port 8880!' : 'Dependensi Kokoro berhasil dipasang!', 'done')
  return {
    ok: true,
    already: false,
    started: !!st?.ok,
    startError: st?.ok ? null : (st?.error || null)
  }
}

/**
 * Menentukan apakah paket sudah terpasang/selesai saat menjalankan mode Continue/Resume.
 */
async function isStepAlreadyDone(stepKey, d, queueItems) {
  if (queueItems?.[stepKey]?.status === 'done') {
    if (stepKey === 'python') return Boolean((await d.resolvePythonBinary())?.ok)
    if (stepKey === 'hermes') return Boolean(findHermesBinaryDirect(d))
    if (stepKey === '9router') return Boolean(d.resolveRouterBinary()?.ok)
    if (stepKey === 'kokoro') return true
  }
  return false
}

/**
 * Titik masuk utama instalasi 1-klik: mendukung paket tunggal, 'all', maupun 'resume' (Continue).
 */
export async function installPackageOneClick(pkgId, { onProgress, deps } = {}) {
  const d = getDefaultDeps(deps)
  loadQueueStateIfNeeded(d)
  const id = String(pkgId || '').trim().toLowerCase()

  if (id === 'all' || id === 'resume') {
    activeInstallCount++
    const now = new Date().toISOString()
    installQueueState.active = true
    installQueueState.mode = id
    installQueueState.startedAt = installQueueState.startedAt || now
    installQueueState.updatedAt = now

    if (id === 'all') {
      for (const k of PACKAGE_ORDER) {
        if (installQueueState.items[k].status === 'failed' || installQueueState.items[k].status !== 'done') {
          installQueueState.items[k] = {
            ...installQueueState.items[k],
            status: 'pending',
            percent: 0,
            message: 'Menunggu giliran',
            error: null
          }
        }
      }
    }
    persistQueueState(d)

    const steps = [
      { key: 'python', label: PACKAGE_META.python.label, fn: installPython },
      { key: 'hermes', label: PACKAGE_META.hermes.label, fn: installHermes },
      { key: '9router', label: PACKAGE_META['9router'].label, fn: installRouter },
      { key: 'kokoro', label: PACKAGE_META.kokoro.label, fn: installKokoro }
    ]

    const results = {}
    const failed = []

    try {
      for (const step of steps) {
        if (id === 'resume' && await isStepAlreadyDone(step.key, d, installQueueState.items)) {
          const skipSnapshot = updateQueueItem(step.key, {
            status: 'done',
            percent: 100,
            message: `${step.label} sudah terpasang (dilewati)`,
            error: null
          }, d)
          results[step.key] = { ok: true, already: true, skipped: true }
          onProgress?.({
            pkgId: id,
            subPkg: step.key,
            percent: skipSnapshot.overallPercent,
            message: `[${step.label}] Sudah terpasang — dilanjutkan ke tahap berikutnya`,
            status: 'running',
            queue: skipSnapshot
          })
          continue
        }

        const beforeSnapshot = updateQueueItem(step.key, {
          status: 'running',
          percent: Math.max(2, installQueueState.items[step.key]?.percent || 0),
          message: `Menyiapkan ${step.label}...`,
          error: null
        }, d)

        onProgress?.({
          pkgId: id,
          subPkg: step.key,
          percent: beforeSnapshot.overallPercent,
          message: `[${step.label}] Menyiapkan...`,
          status: 'running',
          queue: beforeSnapshot
        })

        const res = await step.fn({
          deps: d,
          onProgress: (info) => {
            onProgress?.({
              pkgId: id,
              subPkg: step.key,
              percent: info.queue?.overallPercent ?? recomputeOverallPercent(),
              message: `[${step.label}] ${info.message || ''}`.trim(),
              status: 'running',
              queue: info.queue || getInstallQueueState(d)
            })
          }
        })

        results[step.key] = res
        if (!res?.ok) {
          failed.push(`${step.label}: ${res?.error || 'gagal'}`)
        }
      }

      const ok = failed.length === 0
      const finalSnapshot = getInstallQueueState(d)
      onProgress?.({
        pkgId: id,
        percent: ok ? 100 : finalSnapshot.overallPercent,
        message: ok
          ? 'Semua paket selesai dipasang & aktif!'
          : `Sebagian gagal (${failed.length}). Klik "Lanjutkan (Continue)" untuk meneruskan.`,
        status: ok ? 'done' : 'warning',
        queue: finalSnapshot
      })
      return {
        ok,
        results,
        queue: finalSnapshot,
        error: ok ? null : failed.join(' | ')
      }
    } finally {
      activeInstallCount = Math.max(0, activeInstallCount - 1)
      installQueueState.active = activeInstallCount > 0
      installQueueState.updatedAt = new Date().toISOString()
      persistQueueState(d)
    }
  }

  const map = {
    python: installPython,
    hermes: installHermes,
    '9router': installRouter,
    router: installRouter,
    kokoro: installKokoro
  }
  const fn = map[id]
  if (!fn) {
    return { ok: false, error: `Paket tidak dikenal: ${pkgId}` }
  }

  activeInstallCount++
  installQueueState.active = true
  installQueueState.mode = 'single'
  persistQueueState(d)

  try {
    const res = await fn({ onProgress, deps: d })
    return {
      ...res,
      queue: getInstallQueueState(d)
    }
  } finally {
    activeInstallCount = Math.max(0, activeInstallCount - 1)
    installQueueState.active = activeInstallCount > 0
    installQueueState.updatedAt = new Date().toISOString()
    persistQueueState(d)
  }
}
