/**
 * package-installer.js — Mesin instalasi 1-klik senyap di latar belakang (Package Hub)
 *
 * Mengelola pemasangan dan aktivasi otomatis Python, Hermes Agent CLI, 9Router,
 * dan Kokoro-TTS tanpa memaksa pengguna membuka terminal atau menyalin perintah.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import {
  resolvePythonBinary,
  resolveHermesBinary,
  resolveRouterBinary,
  fastWhere,
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
        headers: { 'User-Agent': 'Hermes-Desktop-Pet-Installer/1.0' }
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
        if (lines.length > 0) onOutput(lines[lines.length - 1])
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
    tmpdir,
    homedir,
    resolvePythonBinary,
    resolveHermesBinary,
    resolveRouterBinary,
    fastWhere,
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

function makeEmitter(pkgId, onProgress) {
  return (percent, message, status = 'running') => {
    try {
      onProgress?.({ pkgId, percent, message, status })
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
  const emit = makeEmitter('python', onProgress)

  emit(5, 'Memeriksa ketersediaan Python 3.10+...')
  const existing = await d.resolvePythonBinary()
  if (existing?.ok) {
    emit(100, `Python sudah siap (${existing.version})`, 'done')
    return { ok: true, already: true, version: existing.version, cmd: existing.cmd }
  }

  if (d.platform === 'win32') {
    emit(15, 'Memasang Python 3.12 secara senyap via winget...')
    const wgRes = await d.runCommand(
      'winget',
      ['install', '-e', '--id', 'Python.Python.3.12', '--accept-package-agreements', '--accept-source-agreements', '--scope', 'user', '--silent'],
      { timeoutMs: 300000, onOutput: (line) => emit(30, `winget: ${line}`) }
    )

    d.fixSystemPath()
    d.invalidatePathCache()
    let verified = await d.resolvePythonBinary()

    if (!verified?.ok) {
      const url = getPythonInstallerUrl(d.arch)
      const exePath = join(d.tmpdir(), `hermes-python-3.12.8-${d.arch}.exe`)
      try {
        emit(45, 'Mengunduh installer resmi Python 3.12...')
        await d.downloadFile(url, exePath, 180000)
        emit(75, 'Menjalankan instalasi senyap Python 3.12 (tanpa jendela terminal)...')
        const instRes = await d.runCommand(
          exePath,
          ['/quiet', 'InstallAllUsers=0', 'PrependPath=1', 'Include_test=0', 'Include_launcher=1'],
          { timeoutMs: 300000 }
        )
        if (instRes.code !== 0) {
          return { ok: false, error: `Instalasi Python gagal: ${tailLine(instRes || wgRes)}` }
        }
      } catch (err) {
        return { ok: false, error: `Gagal memasang Python otomatis: ${err?.message || err}` }
      } finally {
        await d.rmFile(exePath)
      }

      d.fixSystemPath()
      d.invalidatePathCache()
      verified = await d.resolvePythonBinary()
    }

    if (verified?.ok) {
      emit(100, `Python berhasil dipasang (${verified.version})`, 'done')
      return { ok: true, already: false, version: verified.version, cmd: verified.cmd }
    }
    return { ok: false, error: 'Python selesai dipasang tetapi binary belum terdeteksi. Coba pindai ulang drive.' }
  }

  if (d.platform === 'darwin') {
    emit(30, 'Memasang Python 3.12 via Homebrew...')
    const brewRes = await d.runCommand('brew', ['install', 'python@3.12'], {
      timeoutMs: 300000,
      onOutput: (line) => emit(65, line)
    })
    d.fixSystemPath()
    d.invalidatePathCache()
    const verified = await d.resolvePythonBinary()
    if (verified?.ok) {
      emit(100, `Python siap (${verified.version})`, 'done')
      return { ok: true, already: false, version: verified.version, cmd: verified.cmd }
    }
    return { ok: false, error: `Gagal memasang Python via Homebrew: ${tailLine(brewRes)}` }
  }

  return { ok: false, error: 'Silakan pasang Python 3.10+ melalui package manager distro Linux Anda (mis. sudo apt install python3 python3-pip).' }
}

/**
 * Memasang Hermes Agent CLI di latar belakang & langsung menyalakan daemon port 9119.
 */
export async function installHermes({ onProgress, deps: depsOverride } = {}) {
  const d = getDefaultDeps(depsOverride)
  const emit = makeEmitter('hermes', onProgress)

  emit(5, 'Memeriksa Hermes Agent CLI...')
  const existing = d.resolveHermesBinary()
  if (existing?.cmd) {
    emit(80, 'Hermes sudah terpasang — menyalakan layanan AI (:9119)...')
    const st = await d.startHermes()
    emit(100, st?.ok ? 'Hermes aktif di port 9119' : 'Hermes sudah terpasang', st?.ok ? 'done' : 'warning')
    return { ok: true, already: true, started: !!st?.ok, cmd: existing.cmd }
  }

  if (d.platform === 'win32') {
    const ps1Path = join(d.tmpdir(), 'hermes-agent-install.ps1')
    try {
      emit(15, 'Mengunduh installer resmi NousResearch Hermes Agent...')
      await d.downloadFile(HERMES_INSTALL_PS1_URLS, ps1Path, 90000)

      emit(35, 'Memasang Hermes Agent secara senyap di latar belakang (mohon tunggu)...')
      const res = await d.runCommand(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1Path, '-SkipSetup', '-NonInteractive'],
        {
          timeoutMs: 600000,
          onOutput: (line) => emit(60, line)
        }
      )

      d.fixSystemPath()
      d.invalidatePathCache()
      const after = d.resolveHermesBinary()
      if (!after?.cmd) {
        return { ok: false, error: `Pemasangan Hermes gagal: ${tailLine(res)}` }
      }

      emit(90, 'Menyalakan daemon Hermes (:9119)...')
      const st = await d.startHermes()
      emit(100, st?.ok ? 'Hermes terpasang dan aktif di port 9119!' : 'Hermes berhasil dipasang!', 'done')
      return { ok: true, already: false, started: !!st?.ok, cmd: after.cmd }
    } catch (err) {
      return { ok: false, error: `Gagal mengunduh/memasang Hermes: ${err?.message || err}` }
    } finally {
      await d.rmFile(ps1Path)
    }
  }

  const shPath = join(d.tmpdir(), 'hermes-agent-install.sh')
  try {
    emit(15, 'Mengunduh installer Hermes Agent...')
    await d.downloadFile(HERMES_INSTALL_SH_URLS, shPath, 90000)
    emit(40, 'Memasang Hermes Agent di latar belakang...')
    const res = await d.runCommand('bash', [shPath, '--skip-setup'], {
      timeoutMs: 600000,
      onOutput: (line) => emit(65, line)
    })

    d.fixSystemPath()
    d.invalidatePathCache()
    const after = d.resolveHermesBinary()
    if (!after?.cmd) {
      return { ok: false, error: `Pemasangan Hermes gagal: ${tailLine(res)}` }
    }

    emit(90, 'Menyalakan daemon Hermes (:9119)...')
    const st = await d.startHermes()
    emit(100, 'Hermes berhasil dipasang dan siap digunakan!', 'done')
    return { ok: true, already: false, started: !!st?.ok, cmd: after.cmd }
  } catch (err) {
    return { ok: false, error: `Gagal memasang Hermes: ${err?.message || err}` }
  } finally {
    await d.rmFile(shPath)
  }
}

/**
 * Memasang 9Router via NPM di latar belakang & langsung menyalakan port 20128.
 */
export async function installRouter({ onProgress, deps: depsOverride } = {}) {
  const d = getDefaultDeps(depsOverride)
  const emit = makeEmitter('9router', onProgress)

  emit(5, 'Memeriksa ketersediaan 9Router...')
  const existing = d.resolveRouterBinary()
  if (existing?.ok && existing?.cmd) {
    emit(80, '9Router sudah terpasang — menyalakan port 20128...')
    const st = await d.startRouter()
    emit(100, st?.ok ? '9Router aktif di port 20128' : '9Router sudah terpasang', 'done')
    return { ok: true, already: true, started: !!st?.ok, cmd: existing.cmd }
  }

  let npmCmd = resolveNpmCmd(d)
  if (!npmCmd && d.platform === 'win32') {
    emit(20, 'Node.js / NPM belum ada — memasang Node.js LTS secara senyap...')
    await d.runCommand(
      'winget',
      ['install', '-e', '--id', 'OpenJS.NodeJS.LTS', '--accept-package-agreements', '--accept-source-agreements', '--silent'],
      { timeoutMs: 300000, onOutput: (line) => emit(35, line) }
    )
    d.fixSystemPath()
    d.invalidatePathCache()
    npmCmd = resolveNpmCmd(d)
  }

  if (!npmCmd) {
    return { ok: false, error: 'Node.js / NPM belum tersedia di komputer ini. Silakan pasang Node.js LTS terlebih dahulu.' }
  }

  emit(50, 'Memasang paket global 9router secara senyap (npm install -g 9router)...')
  const npmRes = await d.runCommand(npmCmd, ['install', '-g', '9router', '--no-audit', '--no-fund'], {
    timeoutMs: 240000,
    onOutput: (line) => emit(72, line)
  })

  d.fixSystemPath()
  d.invalidatePathCache()
  const after = d.resolveRouterBinary()
  if (!after?.ok) {
    return { ok: false, error: `Gagal memasang 9Router: ${tailLine(npmRes)}` }
  }

  emit(90, 'Menyalakan daemon 9Router (:20128)...')
  const st = await d.startRouter()
  emit(100, st?.ok ? '9Router terpasang & aktif di port 20128!' : '9Router berhasil dipasang!', 'done')
  return { ok: true, already: false, started: !!st?.ok, cmd: after.cmd }
}

/**
 * Memastikan Python siap, memasang dependensi Kokoro-TTS, lalu menyalakan server (:8880).
 */
export async function installKokoro({ onProgress, deps: depsOverride } = {}) {
  const d = getDefaultDeps(depsOverride)
  const emit = makeEmitter('kokoro', onProgress)

  emit(5, 'Memeriksa runtime Python untuk Kokoro-TTS...')
  let py = await d.resolvePythonBinary()
  if (!py?.ok) {
    emit(10, 'Python belum terpasang — memasang Python 3.12 secara otomatis...')
    const pyRes = await installPython({
      onProgress: (info) => emit(Math.max(10, Math.round((info.percent || 0) * 0.45)), info.message || 'Menyiapkan Python...'),
      deps: d
    })
    if (!pyRes?.ok) {
      return { ok: false, error: pyRes?.error || 'Python 3.10+ gagal disiapkan untuk Kokoro-TTS.' }
    }
    py = await d.resolvePythonBinary()
  }

  const pyCmd = py?.cmd || (d.platform === 'win32' ? 'py' : 'python3')
  emit(55, 'Memasang paket Python kokoro-onnx & soundfile di latar belakang...')
  let pipRes = await d.runCommand(pyCmd, ['-m', 'pip', 'install', 'kokoro-onnx', 'soundfile'], {
    timeoutMs: 300000,
    onOutput: (line) => emit(70, line)
  })

  if (pipRes.code !== 0 && d.platform !== 'win32') {
    pipRes = await d.runCommand(pyCmd, ['-m', 'pip', 'install', 'kokoro-onnx', 'soundfile', '--break-system-packages'], {
      timeoutMs: 300000,
      onOutput: (line) => emit(75, line)
    })
  }

  if (pipRes.code !== 0) {
    return { ok: false, error: `Gagal memasang kokoro-onnx via pip: ${tailLine(pipRes)}` }
  }

  emit(88, 'Menyalakan server Kokoro-TTS (:8880)...')
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
 * Titik masuk utama instalasi 1-klik paket individu maupun seluruh paket sekaligus ('all').
 */
export async function installPackageOneClick(pkgId, { onProgress, deps } = {}) {
  const id = String(pkgId || '').trim().toLowerCase()

  if (id === 'python') {
    return await installPython({ onProgress, deps })
  }
  if (id === 'hermes') {
    return await installHermes({ onProgress, deps })
  }
  if (id === '9router' || id === 'router') {
    return await installRouter({ onProgress, deps })
  }
  if (id === 'kokoro') {
    return await installKokoro({ onProgress, deps })
  }
  if (id === 'all') {
    const emitAll = makeEmitter('all', onProgress)
    const steps = [
      { key: 'python', label: 'Python Runtime', base: 0, weight: 0.2, fn: installPython },
      { key: 'hermes', label: 'Hermes Agent CLI', base: 20, weight: 0.35, fn: installHermes },
      { key: '9router', label: '9Router Gateway', base: 55, weight: 0.2, fn: installRouter },
      { key: 'kokoro', label: 'Kokoro-TTS Engine', base: 75, weight: 0.25, fn: installKokoro }
    ]

    const results = {}
    const failed = []

    for (const step of steps) {
      emitAll(step.base + 2, `Menyiapkan ${step.label}...`)
      const res = await step.fn({
        deps,
        onProgress: (info) => {
          const scaled = Math.min(99, Math.round(step.base + (info.percent || 0) * step.weight))
          onProgress?.({
            pkgId: 'all',
            subPkg: step.key,
            percent: scaled,
            message: `[${step.label}] ${info.message || ''}`.trim(),
            status: info.status || 'running'
          })
        }
      })
      results[step.key] = res
      if (!res?.ok) {
        failed.push(`${step.label}: ${res?.error || 'gagal'}`)
      }
    }

    const ok = failed.length === 0
    emitAll(100, ok ? 'Semua paket selesai dipasang & siap digunakan!' : `Selesai dengan catatan: ${failed.join('; ')}`, ok ? 'done' : 'warning')
    return {
      ok,
      results,
      error: ok ? null : failed.join(' | ')
    }
  }

  return { ok: false, error: `Paket tidak dikenal: ${pkgId}` }
}
