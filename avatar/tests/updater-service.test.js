import { describe, it, expect, vi } from 'vitest'

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
  checkAppUpdate,
  isValidAssetName,
  isValidGithubAssetUrl,
  isValidRedirectHost,
  extractSha256FromReleaseBody,
  buildWindowsUpdatePowerShell,
  buildWindowsUpdateBatch
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

  it('checkAppUpdate terdefinisi sebagai fungsi async', () => {
    expect(typeof checkAppUpdate).toBe('function')
  })

  it('isValidAssetName menerima nama rilis sah dan menolak traversal/device/ekstensi ganda', () => {
    expect(isValidAssetName('Hermes-Desktop-Pet-0.1.5-setup.exe')).toBe(true)
    expect(isValidAssetName('Hermes Desktop Pet-0.1.5-win-x64.zip')).toBe(true)
    expect(isValidAssetName('Hermes-0.1.5.dmg')).toBe(true)
    expect(isValidAssetName('Hermes-0.1.5.AppImage')).toBe(true)

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
      `OtherAsset.exe: sha256:${'c'.repeat(64)}`
    ].join('\n')

    expect(extractSha256FromReleaseBody(body, 'Hermes-Setup.exe')).toBe(`sha256:${hashA}`)
    expect(extractSha256FromReleaseBody(body, 'Hermes-Win.zip')).toBe(`sha256:${hashB}`)
    expect(extractSha256FromReleaseBody(body, 'OtherAsset.exe')).toBe(`sha256:${'c'.repeat(64)}`)
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
})
