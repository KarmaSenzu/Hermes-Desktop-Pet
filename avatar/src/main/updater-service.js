/**
 * updater-service.js — Layanan pemeriksaan dan penerapan update aplikasi (OTA Update)
 */

import { app, shell } from 'electron'
import { basename, dirname, join } from 'node:path'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { existsSync, createWriteStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { homedir } from 'node:os'

export function isNewerVersion(vLatest, vCurrent) {
  if (!vLatest || !vCurrent) return false
  const p1 = vLatest.replace(/^v/i, '').split('.').map((x) => parseInt(x, 10) || 0)
  const p2 = vCurrent.replace(/^v/i, '').split('.').map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0
    const num2 = p2[i] || 0
    if (num1 > num2) return true
    if (num1 < num2) return false
  }
  return false
}

let lastRelease = null
let pendingWindowsInstaller = null

const psq = (s) => String(s ?? '').replace(/'/g, "''")

export async function checkAppUpdate() {
  const currentVersion = app.getVersion() || '0.1.4'
  const repoOwner = 'KarmaSenzu'
  const repoName = 'Hermes-Desktop-Pet'

  try {
    const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`
    const resp = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Hermes-Desktop-Pet-App',
        Accept: 'application/vnd.github.v3+json'
      }
    })

    if (!resp.ok) {
      try {
        const rawPkgResp = await fetch(
          `https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/avatar/package.json`
        )
        if (rawPkgResp.ok) {
          const rawPkg = await rawPkgResp.json()
          const remoteVer = rawPkg.version || ''
          const hasUpdate = isNewerVersion(remoteVer, currentVersion)
          const fallbackReleaseUrl = `https://github.com/${repoOwner}/${repoName}/releases`
          lastRelease = {
            tag: `v${remoteVer}`,
            releaseUrl: fallbackReleaseUrl,
            assets: []
          }
          return {
            ok: true,
            hasUpdate,
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

    const releaseUrl = data.html_url || `https://github.com/${repoOwner}/${repoName}/releases`
    lastRelease = {
      tag: latestTag,
      releaseUrl,
      assets: Array.isArray(data.assets)
        ? data.assets.map((a) => ({
            name: a.name,
            url: a.browser_download_url,
            digest: a.digest ? String(a.digest).trim() : null
          }))
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
      currentVersion,
      latestVersion: latestTag.startsWith('v') ? latestTag : `v${latestTag}`,
      releaseName: data.name || data.tag_name || `Versi ${latestTag}`,
      releaseDate: data.published_at ? data.published_at.split('T')[0] : '',
      changelog: data.body || 'Pembaruan stabilitas, perbaikan bug, dan peningkatan fitur.',
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
  try {
    if (!assetName || typeof assetName !== 'string') {
      return { ok: false, error: 'Nama asset tidak valid' }
    }

    if (!lastRelease) {
      await checkAppUpdate()
    }

    const asset = lastRelease?.assets?.find((a) => a.name === assetName)
    if (!asset) {
      return { ok: false, error: 'Asset tidak ditemukan pada rilis terakhir' }
    }

    const filename = asset.name
    if (
      basename(filename) !== filename ||
      !/^[A-Za-z0-9._ -]{1,120}$/.test(filename) ||
      filename.includes('..') ||
      !/\.(exe|dmg|zip|AppImage)$/i.test(filename)
    ) {
      return { ok: false, error: 'Nama asset tidak valid' }
    }

    let assetUrlObj
    try {
      assetUrlObj = new URL(asset.url)
    } catch {
      return { ok: false, error: 'URL download tidak valid' }
    }

    if (
      assetUrlObj.protocol !== 'https:' ||
      assetUrlObj.hostname !== 'github.com' ||
      !assetUrlObj.pathname.startsWith('/KarmaSenzu/Hermes-Desktop-Pet/releases/download/')
    ) {
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

    let respUrlObj
    try {
      respUrlObj = new URL(resp.url)
    } catch {
      throw new Error('URL respons unduhan tidak valid')
    }

    const allowedHosts = [
      'github.com',
      'objects.githubusercontent.com',
      'release-assets.githubusercontent.com'
    ]
    if (!allowedHosts.includes(respUrlObj.hostname)) {
      throw new Error(`Host unduhan tidak diizinkan: ${respUrlObj.hostname}`)
    }

    const tempDir = join(app.getPath('temp'), `hermes_ota_${Date.now()}`)
    await mkdir(tempDir, { recursive: true })
    const targetFilePath = join(tempDir, filename)

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
      if (totalBytes > 0 && event?.sender) {
        const percent = Math.min(100, Math.round((transferredBytes / totalBytes) * 100))
        const transferredMb = (transferredBytes / (1024 * 1024)).toFixed(1)
        const totalMb = (totalBytes / (1024 * 1024)).toFixed(1)
        event.sender.send('avatar:update-download-progress', { percent, transferredMb, totalMb })
      }
    }
    await new Promise((resolve) => fileStream.end(resolve))

    const computedDigest = `sha256:${hash.digest('hex').toLowerCase()}`
    const expectedDigest = asset.digest ? String(asset.digest).trim().toLowerCase() : ''
    const manualUrl = lastRelease?.releaseUrl || 'https://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases'

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
      if (filename.endsWith('.zip')) {
        const destDir = app.isPackaged
          ? dirname(process.execPath)
          : join(process.env.LOCALAPPDATA || homedir(), 'Programs', 'Hermes Desktop Pet')

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

        const updateScriptPath = join(tempDir, 'apply_update.bat')
        const exePath = app.isPackaged ? process.execPath : join(destDir, 'Hermes Desktop Pet.exe')

        const psCopyCmd = `$staging = '${psq(stagingDir)}'; $appDir = '${psq(destDir)}'; $inner = Get-ChildItem -LiteralPath $staging | Where-Object { $_.PSIsContainer -and (Test-Path -LiteralPath (Join-Path $_.FullName 'Hermes Desktop Pet.exe')) } | Select-Object -First 1; $src = if ($inner) { $inner.FullName } else { $staging }; Get-ChildItem -LiteralPath $src | Copy-Item -Destination $appDir -Recurse -Force`

        const batContent = [
          '@echo off',
          'timeout /t 2 /nobreak > nul',
          `powershell -NoProfile -Command "${psCopyCmd}"`,
          `start "" "${exePath}"`,
          'exit'
        ].join('\r\n')

        await writeFile(updateScriptPath, batContent, 'utf-8')
        pendingWindowsInstaller = updateScriptPath
        return { ok: true, readyToRestart: true, message: 'Pembaruan siap diterapkan seketika saat restart!' }
      } else if (filename.endsWith('.exe')) {
        pendingWindowsInstaller = targetFilePath
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
    return { ok: false, error: err?.message || String(err) }
  }
}

export function relaunchApp() {
  if (process.platform === 'win32' && pendingWindowsInstaller) {
    if (pendingWindowsInstaller.endsWith('.bat')) {
      spawn('cmd.exe', ['/c', pendingWindowsInstaller], { detached: true, stdio: 'ignore' }).unref()
    } else {
      spawn(pendingWindowsInstaller, ['/S'], { detached: true, stdio: 'ignore' }).unref()
    }
    app.exit(0)
    return
  }
  app.relaunch()
  app.exit(0)
}
