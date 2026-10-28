import { describe, it, expect, vi } from 'vitest'
import { computeAppId, isAllowedExtension, createAppRegistry } from '../src/main/app-registry.js'

describe('app-registry: computeAppId & isAllowedExtension', () => {
  it('id stabil: path yang sama menghasilkan ID 16-karakter hex yang identik', () => {
    const id1 = computeAppId('C:\\Program Files\\App\\app.exe')
    const id2 = computeAppId('c:\\program files\\app\\app.exe')
    const id3 = computeAppId(' C:\\Program Files\\App\\app.exe ')

    expect(id1).toHaveLength(16)
    expect(id1).toBe(id2)
    expect(id1).toBe(id3)
  })

  it('ekstensi aman diizinkan, ekstensi script ditolak', () => {
    expect(isAllowedExtension('C:\\app.exe')).toBe(true)
    expect(isAllowedExtension('C:\\app.lnk')).toBe(true)
    expect(isAllowedExtension('/Applications/app.app')).toBe(true)
    expect(isAllowedExtension('/usr/bin/app.desktop')).toBe(true)
    expect(isAllowedExtension('/opt/app.appimage')).toBe(true)

    expect(isAllowedExtension('C:\\bad.bat')).toBe(false)
    expect(isAllowedExtension('C:\\bad.cmd')).toBe(false)
    expect(isAllowedExtension('C:\\bad.ps1')).toBe(false)
    expect(isAllowedExtension('C:\\bad.vbs')).toBe(false)
    expect(isAllowedExtension('C:\\bad.js')).toBe(false)
    expect(isAllowedExtension('/bin/bad.sh')).toBe(false)
    expect(isAllowedExtension('/home/bad.py')).toBe(false)
  })
})

describe('app-registry: launchById & confirmation', () => {
  function createMockEnv(initialData = []) {
    const files = new Map()
    files.set('apps_cache.json', JSON.stringify(initialData))
    // Default mock existing paths
    files.set('C:\\valid\\app.exe', 'binary')
    files.set('C:\\valid\\script.bat', 'script')

    const mockFs = {
      existsSync: vi.fn((p) => files.has(p)),
      readFileSync: vi.fn((p) => files.get(p) || '[]'),
      writeFileSync: vi.fn((p, content) => files.set(p, content))
    }

    const mockShell = {
      openPath: vi.fn(async () => '')
    }

    const mockDialog = {
      showMessageBox: vi.fn(async () => ({ response: 0 }))
    }

    const mockExecFile = vi.fn()

    const registry = createAppRegistry({
      cacheFile: 'apps_cache.json',
      fs: mockFs,
      shell: mockShell,
      dialog: mockDialog,
      execFile: mockExecFile,
      platform: 'win32'
    })

    return { registry, mockFs, mockShell, mockDialog, mockExecFile }
  }

  it('id tidak dikenal -> ditolak', async () => {
    const { registry } = createMockEnv([])
    const res = await registry.launchById('non-existent-id')
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/tidak terdaftar/i)
  })

  it('path tidak ada di disk -> ditolak', async () => {
    const validId = computeAppId('C:\\missing\\app.exe')
    const { registry, mockFs } = createMockEnv([{
      id: validId,
      name: 'Missing App',
      path: 'C:\\missing\\app.exe'
    }])
    mockFs.existsSync.mockImplementation((p) => p !== 'C:\\missing\\app.exe')

    const res = await registry.launchById(validId)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/tidak ditemukan di disk/i)
  })

  it('ekstensi .bat/.cmd/.ps1 -> ditolak', async () => {
    const badId = computeAppId('C:\\valid\\script.bat')
    const { registry } = createMockEnv([{
      id: badId,
      name: 'Batch File',
      path: 'C:\\valid\\script.bat'
    }])

    const res = await registry.launchById(badId)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/tidak diizinkan/i)
  })

  it('id valid dan ekstensi aman -> berhasil diluncurkan via shell.openPath', async () => {
    const goodId = computeAppId('C:\\valid\\app.exe')
    const { registry, mockShell } = createMockEnv([{
      id: goodId,
      name: 'Good App',
      path: 'C:\\valid\\app.exe'
    }])

    const res = await registry.launchById(goodId)
    expect(res.ok).toBe(true)
    expect(mockShell.openPath).toHaveBeenCalledWith('C:\\valid\\app.exe')
  })

  it('learn tanpa konfirmasi pengguna -> tidak terdaftar di registry', async () => {
    const { registry, mockDialog } = createMockEnv([])
    mockDialog.showMessageBox.mockResolvedValueOnce({ response: 1 }) // Pengguna klik "Batal"

    const res = await registry.learnAppWithConfirmation('C:\\valid\\app.exe', 'Manual App')
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/dibatalkan/i)

    const expectedId = computeAppId('C:\\valid\\app.exe')
    expect(registry.findById(expectedId)).toBeNull()
  })

  it('learn dengan konfirmasi "Izinkan" -> berhasil terdaftar di registry', async () => {
    const { registry, mockDialog } = createMockEnv([])
    mockDialog.showMessageBox.mockResolvedValueOnce({ response: 0 }) // Pengguna klik "Izinkan"

    const res = await registry.learnAppWithConfirmation('C:\\valid\\app.exe', 'Manual App')
    expect(res.ok).toBe(true)

    const expectedId = computeAppId('C:\\valid\\app.exe')
    const found = registry.findById(expectedId)
    expect(found).not.toBeNull()
    expect(found.name).toBe('Manual App')
  })

  it('getPublicList hanya mengembalikan [{ id, name }], tanpa membuka path sistem', () => {
    const goodId = computeAppId('C:\\valid\\app.exe')
    const { registry } = createMockEnv([{
      id: goodId,
      name: 'Safe App',
      path: 'C:\\valid\\app.exe',
      source: 'scan'
    }])

    const list = registry.getPublicList()
    expect(list).toEqual([{ id: goodId, name: 'Safe App' }])
    expect(list[0]).not.toHaveProperty('path')
  })
})
