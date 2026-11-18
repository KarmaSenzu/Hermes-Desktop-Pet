import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  resolveNpmCmd,
  computeStageProgress,
  installPython,
  installHermes,
  installRouter,
  installKokoro,
  installPackageOneClick,
  getInstallQueueState,
  isPackageInstallRunning,
  resetInstallQueueState
} from '../src/main/package-installer.js'

function createBaseMockDeps(overrides = {}) {
  return {
    platform: 'win32',
    arch: 'x64',
    stateFile: 'C:/Temp/test-install-state.json',
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
    tmpdir: () => 'C:/Temp',
    homedir: () => 'C:/Users/TestUser',
    resolvePythonBinary: vi.fn(async () => ({ cmd: 'py', version: 'Python 3.12.8', ok: true })),
    resolveHermesBinary: vi.fn(() => ({ cmd: 'C:/Users/TestUser/AppData/Local/hermes/bin/hermes.exe' })),
    resolveRouterBinary: vi.fn(() => ({ cmd: 'C:/Users/TestUser/AppData/Roaming/npm/9router.cmd', ok: true })),
    fastWhere: vi.fn(() => []),
    savePersistedPath: vi.fn(),
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
  beforeEach(() => {
    resetInstallQueueState()
  })

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

  describe('computeStageProgress (anti-stuck 60%)', () => {
    it('menaikkan persentase secara bertahap dan monoton mengikuti tahapan nyata Hermes', () => {
      const p1 = computeStageProgress('hermes', '-> Installing managed uv...', 15)
      const p2 = computeStageProgress('hermes', 'Cloning https://github.com/NousResearch/hermes-agent.git...', p1.percent)
      const p3 = computeStageProgress('hermes', 'bootstrap Python ready; PM prepares environment', p2.percent)
      const p4 = computeStageProgress('hermes', 'Installing dependencies (hash-verified via uv.lock)', p3.percent)
      const p5 = computeStageProgress('hermes', 'Publishing the hermes command', p4.percent)
      const p6 = computeStageProgress('hermes', '[OK] Hermes Agent install complete (pinned ae2a81ccc)', p5.percent)

      expect(p1.percent).toBeGreaterThanOrEqual(18)
      expect(p2.percent).toBeGreaterThan(p1.percent)
      expect(p3.percent).toBeGreaterThan(p2.percent)
      expect(p4.percent).toBeGreaterThan(p3.percent)
      expect(p5.percent).toBeGreaterThan(p4.percent)
      expect(p6.percent).toBeGreaterThanOrEqual(90)
      expect(p6.percent).toBeLessThanOrEqual(95)
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
    it('memakai flag -SkipBrowser -SkipComputerUse, menyegarkan registry PATH, dan mendeteksi %LOCALAPPDATA%\\hermes\\bin\\hermes.exe tanpa false error', async () => {
      let binWritten = false
      const expectedExe = 'C:\\Users\\TestUser\\AppData\\Local\\hermes\\bin\\hermes.exe'
      const events = []

      const deps = createBaseMockDeps({
        // Simulasikan resolveHermesBinary belum melihat PATH baru, namun existsSync menemukan di %LOCALAPPDATA%\hermes\bin
        resolveHermesBinary: vi.fn(() => ({ cmd: null })),
        existsSync: vi.fn((p) => {
          const norm = String(p).replace(/\//g, '\\')
          return binWritten && norm === expectedExe
        }),
        runCommand: vi.fn(async (cmd, args, opts) => {
          if (cmd === 'powershell.exe') {
            expect(args).toContain('-SkipBrowser')
            expect(args).toContain('-SkipComputerUse')
            opts?.onOutput?.('Cloning repo...')
            opts?.onOutput?.('Installing dependencies (uv.lock)...')
            opts?.onOutput?.('Publishing the hermes command')
            opts?.onOutput?.('[OK] Hermes Agent install complete (pinned ae2a81ccc00e9b7c). Run: hermes')
            binWritten = true
          }
          return {
            code: 0,
            stdout: '[OK] Hermes Agent install complete (pinned ae2a81ccc00e9b7c). Run: hermes',
            stderr: ''
          }
        })
      })

      const res = await installHermes({ deps, onProgress: (e) => events.push(e) })
      expect(res.ok).toBe(true)
      expect(res.already).toBe(false)
      expect(res.started).toBe(true)
      expect(res.cmd.replace(/\//g, '\\')).toBe(expectedExe)
      expect(deps.fixSystemPath).toHaveBeenCalledWith({ refreshRegistry: true })
      expect(deps.savePersistedPath).toHaveBeenCalledWith('hermes_bin', expect.stringContaining('hermes.exe'))
      expect(deps.startHermes).toHaveBeenCalledTimes(1)
      // Pastikan progres bergerak (tidak stuck di 60%)
      const pcts = events.map((e) => e.percent)
      expect(Math.max(...pcts)).toBe(100)
      expect(new Set(pcts).size).toBeGreaterThan(3)
    })
  })

  describe('installRouter', () => {
    it('memasang Node.js LTS via winget jika npm hilang lalu memasang 9router dengan flag cepat dan menyalakannya', async () => {
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
            expect(args).toContain('--prefer-online')
            expect(args).toContain('--progress=false')
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
    it('otomatis memasang Python dulu bila belum ada lalu pip install --prefer-binary kokoro-onnx dan startKokoro', async () => {
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
        ['-m', 'pip', 'install', '--prefer-binary', '--disable-pip-version-check', '--no-warn-script-location', 'kokoro-onnx', 'soundfile'],
        expect.any(Object)
      )
      expect(deps.startKokoro).toHaveBeenCalledTimes(1)
    })
  })

  describe('installPackageOneClick (Batch & Continue/Resume)', () => {
    it('menjalankan seluruh paket berurutan untuk pkgId "all" dan menyertakan checklist state 100%', async () => {
      const deps = createBaseMockDeps()
      const events = []
      const res = await installPackageOneClick('all', {
        deps,
        onProgress: (info) => events.push(info)
      })

      expect(res.ok).toBe(true)
      expect(isPackageInstallRunning()).toBe(false)
      expect(Object.keys(res.results)).toEqual(['python', 'hermes', '9router', 'kokoro'])
      expect(res.queue.overallPercent).toBe(100)
      expect(res.queue.items.hermes.status).toBe('done')
      expect(events.some((e) => e.pkgId === 'all' && e.percent === 100)).toBe(true)
    })

    it('mendukung Continue/Resume saat gagal di tengah jalan: melewati paket done dan mengulang hanya paket gagal', async () => {
      let allowRouterInstall = false
      let routerInstalled = false
      const runLog = []

      const deps = createBaseMockDeps({
        resolveRouterBinary: vi.fn(() => (
          routerInstalled
            ? { cmd: 'C:\\Users\\TestUser\\AppData\\Roaming\\npm\\9router.cmd', ok: true }
            : { cmd: null, ok: false }
        )),
        fastWhere: vi.fn((bin) => (bin === 'npm' ? ['C:\\Program Files\\nodejs\\npm.cmd'] : [])),
        runCommand: vi.fn(async (cmd, args) => {
          runLog.push(`${cmd} ${args.join(' ')}`)
          if (String(cmd).includes('npm.cmd') && args.includes('9router')) {
            if (!allowRouterInstall) {
              return { code: 1, stdout: '', stderr: 'ETIMEDOUT network error' }
            }
            routerInstalled = true
          }
          return { code: 0, stdout: 'OK', stderr: '' }
        })
      })

      // 1. Percobaan awal: python, hermes, kokoro sukses, tapi 9router gagal
      const firstRun = await installPackageOneClick('all', { deps })
      expect(firstRun.ok).toBe(false)
      expect(firstRun.queue.items.python.status).toBe('done')
      expect(firstRun.queue.items.hermes.status).toBe('done')
      expect(firstRun.queue.items['9router'].status).toBe('failed')
      expect(firstRun.queue.items.kokoro.status).toBe('done')

      // Reset call tracker lalu perbaiki masalah jaringan 9router
      runLog.length = 0
      deps.resolvePythonBinary.mockClear()
      deps.startHermes.mockClear()
      deps.startKokoro.mockClear()
      allowRouterInstall = true

      // 2. Jalankan Continue / Resume: python, hermes, kokoro harus dilewati! Hanya 9router yang dijalankan
      const resumeRun = await installPackageOneClick('resume', { deps })
      expect(resumeRun.ok).toBe(true)
      expect(resumeRun.results.python.skipped).toBe(true)
      expect(resumeRun.results.hermes.skipped).toBe(true)
      expect(resumeRun.results.kokoro.skipped).toBe(true)
      expect(deps.startHermes).not.toHaveBeenCalled()
      expect(deps.startKokoro).not.toHaveBeenCalled()
      expect(deps.startRouter).toHaveBeenCalledTimes(1)
      expect(runLog.some((l) => l.includes('9router'))).toBe(true)
      expect(runLog.some((l) => l.includes('kokoro-onnx'))).toBe(false)
      expect(resumeRun.queue.items['9router'].status).toBe('done')
      expect(getInstallQueueState(deps).overallPercent).toBe(100)
    })

    it('menolak pkgId yang tidak dikenal secara aman', async () => {
      const res = await installPackageOneClick('paket-palsu', { deps: createBaseMockDeps() })
      expect(res.ok).toBe(false)
      expect(res.error).toContain('tidak dikenal')
    })
  })
})
