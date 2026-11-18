import { describe, it, expect, vi } from 'vitest'
import {
  resolveNpmCmd,
  installPython,
  installHermes,
  installRouter,
  installKokoro,
  installPackageOneClick
} from '../src/main/package-installer.js'

function createBaseMockDeps(overrides = {}) {
  return {
    platform: 'win32',
    arch: 'x64',
    existsSync: vi.fn(() => false),
    tmpdir: () => 'C:/Temp',
    homedir: () => 'C:/Users/TestUser',
    resolvePythonBinary: vi.fn(async () => ({ cmd: 'py', version: 'Python 3.12.8', ok: true })),
    resolveHermesBinary: vi.fn(() => ({ cmd: 'C:/Users/TestUser/.hermes/venv/Scripts/hermes.exe' })),
    resolveRouterBinary: vi.fn(() => ({ cmd: 'C:/Users/TestUser/AppData/Roaming/npm/9router.cmd', ok: true })),
    fastWhere: vi.fn(() => []),
    fixSystemPath: vi.fn(),
    invalidatePathCache: vi.fn(),
    startHermes: vi.fn(async () => ({ ok: true })),
    startRouter: vi.fn(async () => ({ ok: true })),
    startKokoro: vi.fn(async () => ({ ok: true })),
    downloadFile: vi.fn(async (_urls, dest) => dest),
    runCommand: vi.fn(async () => ({ code: 0, stdout: 'OK', stderr: '' })),
    rmFile: vi.fn(async () => {}),
    ...overrides
  }
}

describe('package-installer', () => {
  describe('resolveNpmCmd', () => {
    it('menggunakan fastWhere jika npm ditemukan di PATH', () => {
      const deps = createBaseMockDeps({
        fastWhere: vi.fn(() => ['C:\\Program Files\\nodejs\\npm.cmd'])
      })
      expect(resolveNpmCmd(deps)).toBe('C:\\Program Files\\nodejs\\npm.cmd')
    })

    it('fallback ke lokasi standar jika fastWhere kosong', () => {
      const deps = createBaseMockDeps({
        existsSync: vi.fn((p) => p === 'C:\\Program Files\\nodejs\\npm.cmd')
      })
      expect(resolveNpmCmd(deps)).toBe('C:\\Program Files\\nodejs\\npm.cmd')
    })

    it('mengembalikan null jika npm belum terpasang sama sekali', () => {
      const deps = createBaseMockDeps()
      expect(resolveNpmCmd(deps)).toBeNull()
    })
  })

  describe('installPython', () => {
    it('mengembalikan already: true tanpa mengunduh ulang jika Python sudah terpasang', async () => {
      const deps = createBaseMockDeps()
      const events = []
      const res = await installPython({ deps, onProgress: (e) => events.push(e) })

      expect(res.ok).toBe(true)
      expect(res.already).toBe(true)
      expect(deps.runCommand).not.toHaveBeenCalled()
      expect(events[events.length - 1].percent).toBe(100)
    })

    it('menggunakan fallback installer python.org secara senyap jika winget gagal menemukan python', async () => {
      let installed = false
      const deps = createBaseMockDeps({
        resolvePythonBinary: vi.fn(async () => (
          installed
            ? { cmd: 'C:\\Python312\\python.exe', version: 'Python 3.12.8', ok: true }
            : { cmd: 'py', version: 'Belum terpasang', ok: false }
        )),
        runCommand: vi.fn(async (cmd) => {
          if (cmd === 'winget') return { code: 1, stdout: '', stderr: 'winget unavailable' }
          if (String(cmd).includes('hermes-python-3.12.8-x64.exe')) {
            installed = true
            return { code: 0, stdout: '', stderr: '' }
          }
          return { code: 0, stdout: '', stderr: '' }
        })
      })

      const res = await installPython({ deps })
      expect(res.ok).toBe(true)
      expect(res.already).toBe(false)
      expect(deps.downloadFile).toHaveBeenCalledWith(
        'https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe',
        expect.stringContaining('hermes-python-3.12.8-x64.exe'),
        expect.any(Number)
      )
      expect(deps.runCommand).toHaveBeenCalledWith(
        expect.stringContaining('hermes-python-3.12.8-x64.exe'),
        ['/quiet', 'InstallAllUsers=0', 'PrependPath=1', 'Include_test=0', 'Include_launcher=1'],
        expect.any(Object)
      )
      expect(deps.rmFile).toHaveBeenCalled()
    })
  })

  describe('installHermes', () => {
    it('mengunduh install.ps1, memasang secara senyap, dan langsung menjalankan hermes serve', async () => {
      let hermesReady = false
      const deps = createBaseMockDeps({
        resolveHermesBinary: vi.fn(() => (
          hermesReady
            ? { cmd: 'C:\\Users\\TestUser\\AppData\\Local\\hermes\\hermes-agent\\venv\\Scripts\\hermes.exe' }
            : { cmd: null }
        )),
        runCommand: vi.fn(async (cmd, args) => {
          if (cmd === 'powershell.exe' && args.includes('-SkipSetup')) {
            hermesReady = true
          }
          return { code: 0, stdout: 'Installed', stderr: '' }
        })
      })

      const res = await installHermes({ deps })
      expect(res.ok).toBe(true)
      expect(res.already).toBe(false)
      expect(res.started).toBe(true)
      expect(deps.downloadFile).toHaveBeenCalledWith(
        expect.arrayContaining(['https://hermes-agent.nousresearch.com/install.ps1']),
        expect.stringContaining('hermes-agent-install.ps1'),
        expect.any(Number)
      )
      expect(deps.fixSystemPath).toHaveBeenCalled()
      expect(deps.invalidatePathCache).toHaveBeenCalled()
      expect(deps.startHermes).toHaveBeenCalledTimes(1)
    })
  })

  describe('installRouter', () => {
    it('memasang Node.js LTS via winget jika npm hilang lalu memasang 9router dan menyalakannya', async () => {
      let hasNpm = false
      let hasRouter = false
      const deps = createBaseMockDeps({
        fastWhere: vi.fn((bin) => (bin === 'npm' && hasNpm ? ['C:\\Program Files\\nodejs\\npm.cmd'] : [])),
        resolveRouterBinary: vi.fn(() => (
          hasRouter
            ? { cmd: 'C:\\Users\\TestUser\\AppData\\Roaming\\npm\\9router.cmd', ok: true }
            : { cmd: null, ok: false }
        )),
        runCommand: vi.fn(async (cmd, args) => {
          if (cmd === 'winget' && args.includes('OpenJS.NodeJS.LTS')) {
            hasNpm = true
          }
          if (String(cmd).includes('npm.cmd') && args.includes('9router')) {
            hasRouter = true
          }
          return { code: 0, stdout: 'OK', stderr: '' }
        })
      })

      const res = await installRouter({ deps })
      expect(res.ok).toBe(true)
      expect(res.started).toBe(true)
      expect(deps.startRouter).toHaveBeenCalledTimes(1)
    })
  })

  describe('installKokoro', () => {
    it('otomatis memasang Python dulu bila belum ada lalu pip install kokoro-onnx dan startKokoro', async () => {
      let pyReady = false
      const deps = createBaseMockDeps({
        resolvePythonBinary: vi.fn(async () => (
          pyReady
            ? { cmd: 'C:\\Python312\\python.exe', version: 'Python 3.12.8', ok: true }
            : { cmd: 'py', version: 'Belum ada', ok: false }
        )),
        runCommand: vi.fn(async (cmd) => {
          if (cmd === 'winget') pyReady = true
          return { code: 0, stdout: 'OK', stderr: '' }
        })
      })

      const res = await installKokoro({ deps })
      expect(res.ok).toBe(true)
      expect(res.started).toBe(true)
      expect(deps.runCommand).toHaveBeenCalledWith(
        'C:\\Python312\\python.exe',
        ['-m', 'pip', 'install', 'kokoro-onnx', 'soundfile'],
        expect.any(Object)
      )
      expect(deps.startKokoro).toHaveBeenCalledTimes(1)
    })
  })

  describe('installPackageOneClick', () => {
    it('menjalankan seluruh paket berurutan untuk pkgId "all" dan melaporkan progres 100%', async () => {
      const deps = createBaseMockDeps()
      const events = []
      const res = await installPackageOneClick('all', {
        deps,
        onProgress: (info) => events.push(info)
      })

      expect(res.ok).toBe(true)
      expect(Object.keys(res.results)).toEqual(['python', 'hermes', '9router', 'kokoro'])
      expect(events.some((e) => e.pkgId === 'all' && e.percent === 100)).toBe(true)
      expect(deps.startHermes).toHaveBeenCalled()
      expect(deps.startRouter).toHaveBeenCalled()
      expect(deps.startKokoro).toHaveBeenCalled()
    })

    it('menolak pkgId yang tidak dikenal secara aman', async () => {
      const res = await installPackageOneClick('paket-palsu', { deps: createBaseMockDeps() })
      expect(res.ok).toBe(false)
      expect(res.error).toContain('tidak dikenal')
    })
  })
})
