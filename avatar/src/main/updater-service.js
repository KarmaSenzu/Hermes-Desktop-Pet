/**
 * updater-service.js — Layanan pemeriksaan dan penerapan update aplikasi (OTA Update)
 */

import { app } from 'electron'
import { basename, dirname, join, posix, win32 } from 'node:path'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { existsSync, createWriteStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { homedir } from 'node:os'

const REPO_OWNER = 'KarmaSenzu'
const REPO_NAME = 'Hermes-Desktop-Pet'
const ALLOWED_REDIRECT_HOSTS = [
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com'
]
const WINDOWS_RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i
const DECEPTIVE_DOUBLE_EXT = /\.(pdf|docx?|xlsx?|pptx?|txt|png|jpe?g|gif)\.(exe|bat|cmd|msi|zip|dmg)$/i

export function isNewerVersion(vLatest, vCurrent) {
  if (!vLatest || !vCurrent) return false
  const p1 = String(vLatest).replace(/^v/i, '').split('.').map((x) => parseInt(x, 10) || 0)
  const p2 = String(vCurrent).replace(/^v/i, '').split('.').map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0
    const num2 = p2[i] || 0
    if (num1 > num2) return true
    if (num1 < num2) return false
  }
  return false
}

/**
 * Validasi ketat nama file asset rilis untuk mencegah traversal, ADS, dan nama device Windows.
 */
export function isValidAssetName(filename) {
  if (typeof filename !== 'string' || !filename) return false
  if (
    basename(filename) !== filename ||
    posix.basename(filename) !== filename ||
    win32.basename(filename) !== filename
  ) {
    return false
  }
  if (!/^[A-Za-z0-9._ -]{1,120}$/.test(filename)) return false
  if (filename.includes('..') || /[ .]$/.test(filename)) return false
  if (WINDOWS_RESERVED_NAMES.test(filename)) return false
  if (DECEPTIVE_DOUBLE_EXT.test(filename)) return false
  return /\.(exe|dmg|zip|AppImage)$/i.test(filename)
}

/**
 * Validasi URL download asset GitHub resmi repositori proyek.
 */
export function isValidGithubAssetUrl(urlStr) {
  if (typeof urlStr !== 'string' || !urlStr) return false
  if (/(\.\.|\\|%2e|%5c)/i.test(urlStr)) return false
  let urlObj
  try {
    urlObj = new URL(urlStr)
  } catch {
    return false
  }
  if (urlObj.protocol !== 'https:' || urlObj.username || urlObj.password || urlObj.port) {
    return false
  }
  if (urlObj.hostname.toLowerCase() !== 'github.com') return false
  const expectedPrefix = `/${REPO_OWNER}/${REPO_NAME}/releases/download/`
  return urlObj.pathname.startsWith(expectedPrefix)
}

/**
 * Validasi host tujuan redirect unduhan rilis GitHub.
 */
export function isValidRedirectHost(urlStr) {
  if (typeof urlStr !== 'string' || !urlStr) return false
  let urlObj
  try {
    urlObj = new URL(urlStr)
  } catch {
    return false
  }
  if (urlObj.protocol !== 'https:' || urlObj.username || urlObj.password || urlObj.port) {
    return false
  }
  return ALLOWED_REDIRECT_HOSTS.includes(urlObj.hostname.toLowerCase())
}

/**
 * Ekstrak checksum SHA-256 untuk nama asset tertentu dari teks release notes GitHub.
 */
export function extractSha256FromReleaseBody(body, assetName) {
  if (typeof body !== 'string' || typeof assetName !== 'string' || !assetName.trim()) {
    return null
  }
  const target = assetName.trim()
  const lines = body.split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.replace(/[`*]/g, ' ').trim()
    if (!line) continue
    // Pecah token untuk pencocokan nama asset secara persis tanpa celah ReDoS
    const tokens = line.split(/[\s:=]+/).filter(Boolean)
    const hasExactAsset = tokens.some((tok) => tok === target)
    if (!hasExactAsset) continue

    const hashMatch = line.match(/(?:sha256:)?\b([a-fA-F0-9]{64})\b/i)
    if (hashMatch && hashMatch[1]) {
      return `sha256:${hashMatch[1].toLowerCase()}`
    }
  }
  return null
}

let lastRelease = null
let pendingWindowsInstaller = null

const psq = (s) => String(s ?? '').replace(/[\r\n\0]/g, '').replace(/'/g, "''")

/**
 * Membangun skrip PowerShell murni yang aman dari injeksi metakarakter path.
 */
export function buildWindowsUpdatePowerShell({
  stagingDir = '',
  destDir = '',
  exePath = '',
  waitPid = 0,
  installerPath = ''
} = {}) {
  const safePid = Number.isInteger(Number(waitPid)) && Number(waitPid) > 0 ? Number(waitPid) : 0
  const waitBlock = safePid > 0
    ? `$deadline = (Get-Date).AddSeconds(15); while ((Get-Date) -lt $deadline) { if (-not (Get-Process -Id ${safePid} -ErrorAction SilentlyContinue)) { break }; Start-Sleep -Milliseconds 300 }`
    : 'Start-Sleep -Seconds 2'

  const safeExe = psq(exePath)

  if (installerPath) {
    const safeInstaller = psq(installerPath)
    return [
      waitBlock,
      `$installer = '${safeInstaller}'`,
      `$exe = '${safeExe}'`,
      `if (Test-Path -LiteralPath $installer) { Start-Process -FilePath $installer -ArgumentList '/S' -Wait }`,
      `if ($exe -and (Test-Path -LiteralPath $exe)) { Start-Process -FilePath $exe }`
    ].join('; ')
  }

  const safeStaging = psq(stagingDir)
  const safeDest = psq(destDir)
  return [
    waitBlock,
    `$staging = '${safeStaging}'`,
    `$appDir = '${safeDest}'`,
    `$exe = '${safeExe}'`,
    `$inner = Get-ChildItem -LiteralPath $staging | Where-Object { $_.PSIsContainer -and (Test-Path -LiteralPath (Join-Path $_.FullName 'Hermes Desktop Pet.exe')) } | Select-Object -First 1`,
    `$src = if ($inner) { $inner.FullName } else { $staging }`,
    `New-Item -ItemType Directory -Force -Path $appDir | Out-Null`,
    `Get-ChildItem -LiteralPath $src | Copy-Item -Destination $appDir -Recurse -Force`,
    `if ($exe -and (Test-Path -LiteralPath $exe)) { Start-Process -FilePath $exe }`
  ].join('; ')
}

/**
 * Membangun konten apply_update.bat dengan PowerShell -EncodedCommand agar bebas injeksi cmd.exe.
 */
export function buildWindowsUpdateBatch(opts = {}) {
  const psScript = buildWindowsUpdatePowerShell(opts)
  const encoded = Buffer.from(psScript, 'utf16le').toString('base64')
  return [
    '@echo off',
    `powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand ${encoded}`,
    '(goto) 2>nul & del "%~f0"'
  ].join('\r\n')
}

export async function checkAppUpdate() {
  const currentVersion = app.getVersion() || '0.1.6'

  try {
    const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`
    const resp = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Hermes-Desktop-Pet-App',
        Accept: 'application/vnd.github.v3+json'
      }
    })

    if (!resp.ok) {
      try {
        const rawPkgResp = await fetch(
          `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/avatar/package.json`
        )
        if (rawPkgResp.ok) {
          const rawPkg = await rawPkgResp.json()
          const remoteVer = rawPkg.version || ''
          const hasUpdate = isNewerVersion(remoteVer, currentVersion)
          const fallbackReleaseUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`
          lastRelease = {
            tag: `v${remoteVer}`,
            releaseUrl: fallbackReleaseUrl,
            assets: []
          }
          return {
            ok: true,
            hasUpdate,
            canAutoUpdate: false,
            currentVersion,
            latestVersion: `v${remoteVer}`,
            releaseName: `Hermes Desktop Pet v${remoteVer}`,
            releaseDate: '',
            changelog: 'Pembaruan terkini tersedia di rilis GitHub.',
            releaseUrl: fallbackReleaseUrl,
            downloadUrl: fallbackReleaseUrl,
            assetName: null
          }
        }
      } catch {}

      lastRelease = null
      return {
        ok: true,
        hasUpdate: false,
        canAutoUpdate: false,
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

    const releaseUrl = data.html_url || `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`
    const releaseBody = typeof data.body === 'string' ? data.body : ''

    lastRelease = {
      tag: latestTag,
      releaseUrl,
      assets: Array.isArray(data.assets)
        ? data.assets.map((a) => {
            const apiDigest = a.digest ? String(a.digest).trim().toLowerCase() : null
            const bodyDigest = !apiDigest ? extractSha256FromReleaseBody(releaseBody, a.name) : null
            return {
              name: a.name,
              url: a.browser_download_url,
              digest: apiDigest || bodyDigest || null
            }
          })
        : []
    }

    let downloadUrl = data.html_url
    let matchedAsset = null
    if (data.assets && Array.isArray(data.assets)) {
      if (process.platform === 'darwin') {
        matchedAsset =
          data.assets.find((a) => a.name.endsWith('.dmg')) ||
          data.assets.find((a) => a.name.endsWith('.zip') && a.name.includes('mac'))
      } else if (process.platform === 'win32') {
        matchedAsset =
          data.assets.find(
            (a) =>
              a.name.endsWith('.zip') &&
              (a.name.includes('win') || a.name.toLowerCase().includes('windows'))
          ) ||
          data.assets.find(
            (a) => a.name.endsWith('.zip') && !a.name.includes('mac') && !a.name.includes('linux')
          ) ||
          data.assets.find((a) => a.name.endsWith('.exe'))
      } else {
        matchedAsset =
          data.assets.find((a) => a.name.endsWith('.AppImage')) ||
          data.assets.find((a) => a.name.endsWith('.deb'))
      }
      if (matchedAsset?.browser_download_url) {
        downloadUrl = matchedAsset.browser_download_url
      }
    }

    return {
      ok: true,
      hasUpdate,
      canAutoUpdate: Boolean(matchedAsset),
      currentVersion,
      latestVersion: latestTag.startsWith('v') ? latestTag : `v${latestTag}`,
      releaseName: data.name || data.tag_name || `Versi ${latestTag}`,
      releaseDate: data.published_at ? data.published_at.split('T')[0] : '',
      changelog: releaseBody || 'Pembaruan stabilitas, perbaikan bug, dan peningkatan fitur.',
      releaseUrl,
      downloadUrl,
      assetName: matchedAsset ? matchedAsset.name : null
    }
  } catch (err) {
    lastRelease = null
    return {
      ok: false,
      currentVersion,
      error: err?.message || String(err)
    }
  }
}

export async function downloadAndApplyUpdate(event, _downloadUrl, assetName) {
  let tempDir = null
  let targetFilePath = null

  const sendProgress = (payload) => {
    try {
      event?.sender?.send?.('avatar:update-download-progress', payload)
    } catch {
      // ignore if sender destroyed
    }
  }

  try {
    if (!assetName || typeof assetName !== 'string') {
      return { ok: false, error: 'Nama asset tidak valid' }
    }

    if (!lastRelease) {
      await checkAppUpdate()
    }

    const currentVersion = app.getVersion() || '0.1.6'
    if (!lastRelease?.tag || !isNewerVersion(lastRelease.tag, currentVersion)) {
      return { ok: false, error: 'Versi rilis tidak lebih baru dari versi terpasang' }
    }

    const asset = lastRelease?.assets?.find((a) => a.name === assetName)
    if (!asset) {
      return { ok: false, error: 'Asset tidak ditemukan pada rilis terakhir' }
    }

    const filename = asset.name
    if (!isValidAssetName(filename)) {
      return { ok: false, error: 'Nama asset tidak valid' }
    }

    if (!isValidGithubAssetUrl(asset.url)) {
      return { ok: false, error: 'URL download tidak diizinkan' }
    }

    const resp = await fetch(asset.url, {
      headers: {
        'User-Agent': 'Hermes-Desktop-Pet-App'
      }
    })

    if (!resp.ok) {
      throw new Error(`Gagal mengunduh paket update: HTTP ${resp.status} ${resp.statusText}`)
    }

    if (!isValidRedirectHost(resp.url)) {
      let badHost = 'tidak dikenal'
      try { badHost = new URL(resp.url).hostname } catch {}
      throw new Error(`Host unduhan tidak diizinkan: ${badHost}`)
    }

    tempDir = join(app.getPath('temp'), `hermes_ota_${Date.now()}`)
    await mkdir(tempDir, { recursive: true })
    targetFilePath = join(tempDir, filename)

    const totalBytes = parseInt(resp.headers.get('content-length') || '0', 10)
    let transferredBytes = 0

    const fileStream = createWriteStream(targetFilePath)
    const hash = createHash('sha256')
    const reader = resp.body.getReader()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      fileStream.write(value)
      hash.update(value)
      transferredBytes += value.length
      const transferredMb = (transferredBytes / (1024 * 1024)).toFixed(1)
      const totalMb = totalBytes > 0 ? (totalBytes / (1024 * 1024)).toFixed(1) : transferredMb
      const percent = totalBytes > 0 ? Math.min(100, Math.round((transferredBytes / totalBytes) * 100)) : 0
      sendProgress({ stage: 'downloading', percent, transferredMb, totalMb })
    }
    await new Promise((resolve) => fileStream.end(resolve))

    const finalMb = (transferredBytes / (1024 * 1024)).toFixed(1)
    sendProgress({ stage: 'verifying', percent: 100, transferredMb: finalMb, totalMb: finalMb })

    const computedDigest = `sha256:${hash.digest('hex').toLowerCase()}`
    const expectedDigest = asset.digest ? String(asset.digest).trim().toLowerCase() : ''
    const manualUrl = lastRelease?.releaseUrl || `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`

    if (!expectedDigest || !expectedDigest.startsWith('sha256:') || computedDigest !== expectedDigest) {
      try {
        await rm(targetFilePath, { force: true })
        await rm(tempDir, { recursive: true, force: true })
      } catch (_) {}
      return {
        ok: false,
        error: 'Checksum tidak tersedia/tidak cocok',
        manualUrl
      }
    }

    sendProgress({ stage: 'installing', percent: 100, transferredMb: finalMb, totalMb: finalMb })

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
      const defaultDestDir = join(process.env.LOCALAPPDATA || homedir(), 'Programs', 'Hermes Desktop Pet')
      const destDir = app.isPackaged ? dirname(process.execPath) : defaultDestDir
      const exePath = app.isPackaged ? process.execPath : join(destDir, 'Hermes Desktop Pet.exe')
      const updateScriptPath = join(tempDir, 'apply_update.bat')

      if (filename.endsWith('.zip')) {
        const stagingDir = join(tempDir, 'staging')
        await mkdir(stagingDir, { recursive: true })

        await new Promise((resolve, reject) => {
          execFile(
            'powershell',
            [
              '-NoProfile',
              '-Command',
              `Expand-Archive -LiteralPath '${psq(targetFilePath)}' -DestinationPath '${psq(stagingDir)}' -Force`
            ],
            (err) => {
              if (err) return reject(err)
              resolve()
            }
          )
        })

        const batContent = buildWindowsUpdateBatch({
          stagingDir,
          destDir,
          exePath,
          waitPid: process.pid
        })
        await writeFile(updateScriptPath, batContent, 'utf-8')
        pendingWindowsInstaller = updateScriptPath
        return { ok: true, readyToRestart: true, message: 'Pembaruan siap diterapkan seketika saat restart!' }
      } else if (filename.endsWith('.exe')) {
        const batContent = buildWindowsUpdateBatch({
          installerPath: targetFilePath,
          exePath,
          waitPid: process.pid
        })
        await writeFile(updateScriptPath, batContent, 'utf-8')
        pendingWindowsInstaller = updateScriptPath
        return { ok: true, readyToRestart: true, message: 'Installer update siap dipasang saat restart!' }
      }
    } else {
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
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true })
      } catch (_) {}
    }
    return { ok: false, error: err?.message || String(err) }
  }
}

export function relaunchApp(beforeExit) {
  if (typeof beforeExit === 'function') {
    try {
      beforeExit()
    } catch (err) {
      console.warn('[Updater] beforeExit warning:', err?.message || err)
    }
  }

  if (process.platform === 'win32' && pendingWindowsInstaller) {
    if (pendingWindowsInstaller.endsWith('.bat')) {
      spawn('cmd.exe', ['/c', pendingWindowsInstaller], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }).unref()
    } else {
      spawn(pendingWindowsInstaller, ['/S'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }).unref()
    }
    app.exit(0)
    return
  }
  app.relaunch()
  app.exit(0)
}
