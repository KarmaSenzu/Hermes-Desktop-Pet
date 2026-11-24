import { describe, it, expect, vi } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.1.4',
    getPath: () => 'C:\\temp',
    isPackaged: false,
    relaunch: vi.fn(),
    exit: vi.fn()
  }
}))

import {
  isNewerVersion,
  getVersionDiffType,
  isWindowsInstalledApp,
  selectUpdateAsset,
  checkAppUpdate,
  isValidAssetName,
  isValidGithubAssetUrl,
  isValidRedirectHost,
  extractSha256FromReleaseBody,
  buildWindowsUpdatePowerShell,
  buildWindowsUpdateBatch,
  cleanupStaleOtaTempDirs
} from '../src/main/updater-service.js'

describe('updater-service', () => {
  it('isNewerVersion membandingkan semver dengan akurat', () => {
    expect(isNewerVersion('v1.0.1', '1.0.0')).toBe(true)
    expect(isNewerVersion('1.0.0', '1.0.1')).toBe(false)
    expect(isNewerVersion('0.1.4', '0.1.4')).toBe(false)
    expect(isNewerVersion('v2.0.0', '1.9.9')).toBe(true)
    expect(isNewerVersion('v0.2.0', 'v0.1.9')).toBe(true)
    expect(isNewerVersion('', '0.1.4')).toBe(false)
    expect(isNewerVersion(null, '0.1.4')).toBe(false)
  })

  it('getVersionDiffType mengklasifikasikan patch, minor, dan major dengan tepat', () => {
    expect(getVersionDiffType('v1.1.2', 'v1.1.1')).toBe('patch')
    expect(getVersionDiffType('1.2.0', '1.1.5')).toBe('minor')
    expect(getVersionDiffType('v2.0.0', 'v1.9.9')).toBe('major')
    expect(getVersionDiffType('1.1.2', '0.1.7')).toBe('major')
    expect(getVersionDiffType('1.2.0', '1.1.3')).toBe('minor')
    expect(getVersionDiffType('1.2.1', '1.1.3')).toBe('minor')
    expect(getVersionDiffType('1.1.1', '1.1.1')).toBe('none')
    expect(getVersionDiffType('1.1.0', '1.1.2')).toBe('none')
  })

  it('selectUpdateAsset memilih Full Installer saat minor/major dan OTA Patch saat patch', () => {
    const releaseAssets = [
      { name: 'WINDOWS-Installer-Hermes-Desktop-Pet-v1.2.0-x64.exe' },
      { name: 'WINDOWS-Portable-Hermes-Desktop-Pet-v1.2.0-x64.zip' },
      { name: 'MACOS-M-Series-Hermes-Desktop-Pet-v1.2.0-arm64.dmg' },
      { name: 'MACOS-M-Series-Hermes-Desktop-Pet-v1.2.0-arm64.zip' },
      { name: 'LINUX-Hermes-Desktop-Pet-v1.2.0-x86_64.AppImage' },
      { name: 'OTA-Patch-Hermes-Desktop-Pet-v1.2.0.zip' }
    ]

    expect(selectUpdateAsset(releaseAssets, { platform: 'win32', isMajorOrMinor: true, isWindowsInstalled: true })?.name)
      .toBe('WINDOWS-Installer-Hermes-Desktop-Pet-v1.2.0-x64.exe')
    expect(selectUpdateAsset(releaseAssets, { platform: 'win32', isMajorOrMinor: true, isWindowsInstalled: false })?.name)
      .toBe('WINDOWS-Portable-Hermes-Desktop-Pet-v1.2.0-x64.zip')
    expect(selectUpdateAsset(releaseAssets, { platform: 'darwin', isMajorOrMinor: true })?.name)
      .toBe('MACOS-M-Series-Hermes-Desktop-Pet-v1.2.0-arm64.dmg')
    expect(selectUpdateAsset(releaseAssets, { platform: 'linux', isMajorOrMinor: true })?.name)
      .toBe('LINUX-Hermes-Desktop-Pet-v1.2.0-x86_64.AppImage')
    expect(selectUpdateAsset(releaseAssets, { platform: 'win32', isMajorOrMinor: false })?.name)
      .toBe('OTA-Patch-Hermes-Desktop-Pet-v1.2.0.zip')
    expect(selectUpdateAsset(releaseAssets, { platform: 'darwin', isMajorOrMinor: false })?.name)
      .toBe('OTA-Patch-Hermes-Desktop-Pet-v1.2.0.zip')
  })

  it('isWindowsInstalledApp membedakan direktori instalasi NSIS vs Portable', async () => {
    const mockDir = await mkdtemp(join(tmpdir(), 'hermes-win-install-check-'))
    try {
      expect(isWindowsInstalledApp(mockDir)).toBe(false)
      await writeFile(join(mockDir, 'Uninstall Hermes Desktop Pet.exe'), 'stub')
      expect(isWindowsInstalledApp(mockDir)).toBe(true)
    } finally {
      await rm(mockDir, { recursive: true, force: true })
    }
  })

  it('checkAppUpdate terdefinisi sebagai fungsi async', () => {
    expect(typeof checkAppUpdate).toBe('function')
  })

  it('isValidAssetName menerima nama rilis sah dan menolak traversal/device/ekstensi ganda', () => {
    expect(isValidAssetName('Hermes-Desktop-Pet-0.1.5-setup.exe')).toBe(true)
    expect(isValidAssetName('Hermes Desktop Pet-0.1.5-win-x64.zip')).toBe(true)
    expect(isValidAssetName('Hermes-0.1.5.dmg')).toBe(true)
    expect(isValidAssetName('Hermes-0.1.5.AppImage')).toBe(true)
    expect(isValidAssetName('WINDOWS-Installer-Hermes-Desktop-Pet-v0.1.9-x64.exe')).toBe(true)
    expect(isValidAssetName('WINDOWS-Portable-Hermes-Desktop-Pet-v0.1.9-x64.zip')).toBe(true)
    expect(isValidAssetName('MACOS-M-Series-Hermes-Desktop-Pet-v0.1.9-arm64.dmg')).toBe(true)
    expect(isValidAssetName('MACOS-M-Series-Hermes-Desktop-Pet-v0.1.9-arm64.zip')).toBe(true)
    expect(isValidAssetName('LINUX-Hermes-Desktop-Pet-v0.1.9-x86_64.AppImage')).toBe(true)
    expect(isValidAssetName('OTA-Patch-Hermes-Desktop-Pet-v0.1.9.zip')).toBe(true)

    expect(isValidAssetName('..\\evil.exe')).toBe(false)
    expect(isValidAssetName('../evil.exe')).toBe(false)
    expect(isValidAssetName('a.exe ')).toBe(false)
    expect(isValidAssetName('a.exe.')).toBe(false)
    expect(isValidAssetName('CON.exe')).toBe(false)
    expect(isValidAssetName('nul.zip')).toBe(false)
    expect(isValidAssetName('a.exe:ads')).toBe(false)
    expect(isValidAssetName('invoice.pdf.exe')).toBe(false)
    expect(isValidAssetName('evil.bat')).toBe(false)
    expect(isValidAssetName('a'.repeat(130) + '.exe')).toBe(false)
    expect(isValidAssetName('\u202eevil.exe')).toBe(false)
  })

  it('isValidGithubAssetUrl hanya menerima URL rilis resmi GitHub', () => {
    expect(
      isValidGithubAssetUrl(
        'https://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases/download/v0.1.5/Hermes-Setup.exe'
      )
    ).toBe(true)
    expect(
      isValidGithubAssetUrl(
        'https://GITHUB.COM/KarmaSenzu/Hermes-Desktop-Pet/releases/download/v0.1.5/app.zip'
      )
    ).toBe(true)

    expect(isValidGithubAssetUrl('http://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases/download/v0.1.5/app.exe')).toBe(false)
    expect(isValidGithubAssetUrl('https://github.com.evil.tld/KarmaSenzu/Hermes-Desktop-Pet/releases/download/v0.1.5/app.exe')).toBe(false)
    expect(isValidGithubAssetUrl('https://github.com@evil.tld/KarmaSenzu/Hermes-Desktop-Pet/releases/download/v0.1.5/app.exe')).toBe(false)
    expect(isValidGithubAssetUrl('https://github.com./KarmaSenzu/Hermes-Desktop-Pet/releases/download/v0.1.5/app.exe')).toBe(false)
    expect(isValidGithubAssetUrl('https://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases/download/../../evil/app.exe')).toBe(false)
    expect(isValidGithubAssetUrl('https://github.com/OtherUser/Hermes-Desktop-Pet/releases/download/v0.1.5/app.exe')).toBe(false)
  })

  it('isValidRedirectHost hanya mengizinkan host unduhan GitHub resmi', () => {
    expect(isValidRedirectHost('https://objects.githubusercontent.com/github-production-release-asset/123')).toBe(true)
    expect(isValidRedirectHost('https://release-assets.githubusercontent.com/abc')).toBe(true)
    expect(isValidRedirectHost('https://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases')).toBe(true)

    expect(isValidRedirectHost('https://objects.githubusercontent.com.evil.tld/123')).toBe(false)
    expect(isValidRedirectHost('http://objects.githubusercontent.com/123')).toBe(false)
    expect(isValidRedirectHost('https://127.0.0.1/evil.exe')).toBe(false)
  })

  it('extractSha256FromReleaseBody mengekstrak hash SHA-256 yang cocok dengan nama asset', () => {
    const hashA = 'a'.repeat(64)
    const hashB = 'b'.repeat(64)
    const body = [
      '### Checksums (SHA-256)',
      `${hashA}  Hermes-Setup.exe`,
      `${hashB} *Hermes-Win.zip`,
      `OtherAsset.exe: sha256:${'c'.repeat(64)}`,
      `${hashA}  WINDOWS-Installer-Hermes-Desktop-Pet-v0.1.9-x64.exe`,
      `${hashB}  OTA-Patch-Hermes-Desktop-Pet-v0.1.9.zip`
    ].join('\n')

    expect(extractSha256FromReleaseBody(body, 'Hermes-Setup.exe')).toBe(`sha256:${hashA}`)
    expect(extractSha256FromReleaseBody(body, 'Hermes-Win.zip')).toBe(`sha256:${hashB}`)
    expect(extractSha256FromReleaseBody(body, 'OtherAsset.exe')).toBe(`sha256:${'c'.repeat(64)}`)
    expect(extractSha256FromReleaseBody(body, 'WINDOWS-Installer-Hermes-Desktop-Pet-v0.1.9-x64.exe')).toBe(`sha256:${hashA}`)
    expect(extractSha256FromReleaseBody(body, 'OTA-Patch-Hermes-Desktop-Pet-v0.1.9.zip')).toBe(`sha256:${hashB}`)
    expect(extractSha256FromReleaseBody(body, 'Win.zip')).toBeNull()
    expect(extractSha256FromReleaseBody(body, 'Missing.exe')).toBeNull()
    expect(extractSha256FromReleaseBody(null, 'Hermes-Setup.exe')).toBeNull()
  })

  it('buildWindowsUpdatePowerShell dan buildWindowsUpdateBatch meng-quote path spesial secara aman', () => {
    const evilStaging = "C:\\Temp\\o'hare & $(calc) `whoami`; %TEMP%\\äöü\r\n"
    const evilDest = "C:\\Program Files\\Hermes's App"
    const evilExe = "C:\\Program Files\\Hermes's App\\Hermes Desktop Pet.exe"

    const ps = buildWindowsUpdatePowerShell({
      stagingDir: evilStaging,
      destDir: evilDest,
      exePath: evilExe,
      waitPid: 12345
    })

    expect(ps).toContain('Get-Process -Id 12345')
    expect(ps).toContain("$staging = 'C:\\Temp\\o''hare & $(calc) `whoami`; %TEMP%\\äöü'")
    expect(ps).toContain("$appDir = 'C:\\Program Files\\Hermes''s App'")
    expect(ps).not.toMatch(/[\r\n]/)

    const bat = buildWindowsUpdateBatch({
      installerPath: "C:\\Temp\\Hermes'Setup & calc.exe",
      exePath: evilExe,
      waitPid: 999
    })
    expect(bat).toContain('@echo off')
    expect(bat).toContain('-EncodedCommand ')
    expect(bat).not.toContain('& calc.exe')

    // Pastikan isi -EncodedCommand dapat didekode menjadi skrip PowerShell valid
    const m = bat.match(/-EncodedCommand ([A-Za-z0-9+/=]+)/)
    expect(m).not.toBeNull()
    const decoded = Buffer.from(m[1], 'base64').toString('utf16le')
    expect(decoded).toContain("$installer = 'C:\\Temp\\Hermes''Setup & calc.exe'")
    expect(decoded).toContain("ArgumentList '/S' -Wait")
  })

  it('buildWindowsUpdatePowerShell mode isPatch menargetkan resources\\app dan menghapus tempDir', () => {
    const ps = buildWindowsUpdatePowerShell({
      stagingDir: 'C:\\temp\\hermes_ota_123\\staging',
      destDir: 'C:\\Users\\Test\\AppData\\Local\\Programs\\Hermes Desktop Pet',
      exePath: 'C:\\Users\\Test\\AppData\\Local\\Programs\\Hermes Desktop Pet\\Hermes Desktop Pet.exe',
      waitPid: 4321,
      tempDir: 'C:\\temp\\hermes_ota_123',
      isPatch: true
    })

    expect(ps).toContain("$targetApp = Join-Path $resDir 'app'")
    expect(ps).toContain("$tmpDir = 'C:\\temp\\hermes_ota_123'")
    expect(ps).toContain('Remove-Item -LiteralPath $tmpDir -Recurse -Force')
    expect(ps).not.toMatch(/[\r\n]/)
  })

  it('cleanupStaleOtaTempDirs menghapus folder hermes_ota_* dan membiarkan folder lain utuh', async () => {
    const mockTemp = await mkdtemp(join(tmpdir(), 'hermes-cleanup-test-'))
    try {
      const stale1 = join(mockTemp, 'hermes_ota_1700000001')
      const stale2 = join(mockTemp, 'hermes_ota_1700000002')
      const unrelated = join(mockTemp, 'other_app_cache')
      await mkdir(stale1, { recursive: true })
      await mkdir(stale2, { recursive: true })
      await mkdir(unrelated, { recursive: true })
      await writeFile(join(stale1, 'old.zip'), 'dummy')

      const res = await cleanupStaleOtaTempDirs(mockTemp, 0)
      expect(res.removed).toBe(2)
      expect(existsSync(stale1)).toBe(false)
      expect(existsSync(stale2)).toBe(false)
      expect(existsSync(unrelated)).toBe(true)
    } finally {
      await rm(mockTemp, { recursive: true, force: true })
    }
  })
})
