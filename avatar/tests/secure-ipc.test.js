import { describe, it, expect, vi } from 'vitest'
import { validateSender, createSecureIpc } from '../src/main/secure-ipc.js'

function createMockWindow(id, { destroyed = false, wcDestroyed = false } = {}) {
  return {
    isDestroyed: () => destroyed,
    webContents: {
      id,
      isDestroyed: () => wcDestroyed
    }
  }
}

function createMockEvent({
  id = 1,
  url = 'file:///C:/app/renderer/index.html',
  isIframe = false
} = {}) {
  const mainFrame = { url }
  const senderFrame = isIframe ? { url: 'https://evil.com/iframe' } : mainFrame
  return {
    sender: {
      id,
      mainFrame
    },
    senderFrame
  }
}

describe('secure-ipc: validateSender', () => {
  it('(a) ok: valid file:// URL and matching window', () => {
    const avatarWin = createMockWindow(1)
    const settingsWin = createMockWindow(2)
    const windows = { avatar: avatarWin, settings: settingsWin }

    const event = createMockEvent({ id: 1, url: 'file:///C:/app/renderer/index.html' })
    const res = validateSender(event, windows)
    expect(res.ok).toBe(true)
    expect(res.windowName).toBe('avatar')
  })

  it('ok with devUrl: matching ELECTRON_RENDERER_URL', () => {
    const avatarWin = createMockWindow(1)
    const windows = { avatar: avatarWin }

    const event = createMockEvent({ id: 1, url: 'http://localhost:5173/index.html' })
    const res = validateSender(event, windows, { devUrl: 'http://localhost:5173' })
    expect(res.ok).toBe(true)
    expect(res.windowName).toBe('avatar')
  })

  it('(b) senderFrame !== mainFrame: iframe ditolak', () => {
    const avatarWin = createMockWindow(1)
    const windows = { avatar: avatarWin }

    const event = createMockEvent({ id: 1, isIframe: true })
    const res = validateSender(event, windows)
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/iframe/i)
  })

  it('(c) url http://evil: URL bukan file:// atau devUrl ditolak', () => {
    const avatarWin = createMockWindow(1)
    const windows = { avatar: avatarWin }

    const event = createMockEvent({ id: 1, url: 'http://evil.com/page.html' })
    const res = validateSender(event, windows, { devUrl: 'http://localhost:5173' })
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/URL tidak valid/i)
  })

  it('(d) webContents.id asing: tidak cocok dengan window mana pun', () => {
    const avatarWin = createMockWindow(1)
    const windows = { avatar: avatarWin }

    const event = createMockEvent({ id: 999, url: 'file:///C:/app/renderer/index.html' })
    const res = validateSender(event, windows)
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/tidak terdaftar/i)
  })

  it('(e) window destroyed: window atau webContents sudah destroyed dilewati', () => {
    const deadWin = createMockWindow(1, { destroyed: true })
    const deadWcWin = createMockWindow(2, { wcDestroyed: true })
    const windows = { dead1: deadWin, dead2: deadWcWin }

    const event1 = createMockEvent({ id: 1, url: 'file:///C:/app/renderer/index.html' })
    expect(validateSender(event1, windows).ok).toBe(false)

    const event2 = createMockEvent({ id: 2, url: 'file:///C:/app/renderer/index.html' })
    expect(validateSender(event2, windows).ok).toBe(false)
  })
})

describe('secure-ipc: createSecureIpc wrapper', () => {
  it('(f) allow tidak memuat nama window -> secureHandle melempar error dan mencetak warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mockIpc = {
      handlers: {},
      handle(channel, fn) { this.handlers[channel] = fn }
    }

    const avatarWin = createMockWindow(1)
    const getWindows = () => ({ avatar: avatarWin, settings: createMockWindow(2) })

    const { secureHandle } = createSecureIpc({ ipcMain: mockIpc, getWindows })
    secureHandle('test:channel', ['settings'], () => 'secret_data')

    const event = createMockEvent({ id: 1, url: 'file:///C:/app/renderer/index.html' })
    expect(() => mockIpc.handlers['test:channel'](event, 'arg1', 'arg2')).toThrow('IPC ditolak')
    expect(warnSpy).toHaveBeenCalledWith('[ipc] DITOLAK', 'test:channel', 'avatar')

    warnSpy.mockRestore()
  })

  it('(g) allow = any -> diizinkan untuk semua window terdaftar', () => {
    const mockIpc = {
      handlers: {},
      handle(channel, fn) { this.handlers[channel] = fn }
    }

    const avatarWin = createMockWindow(1)
    const getWindows = () => ({ avatar: avatarWin })

    const { secureHandle } = createSecureIpc({ ipcMain: mockIpc, getWindows })
    secureHandle('test:any', 'any', (_event, arg) => `echo:${arg}`)

    const event = createMockEvent({ id: 1, url: 'file:///C:/app/renderer/index.html' })
    const res = mockIpc.handlers['test:any'](event, 'hello')
    expect(res).toBe('echo:hello')
  })

  it('secureOn: saat ditolak tidak melempar error (silent return)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mockIpc = {
      listeners: {},
      on(channel, fn) { this.listeners[channel] = fn }
    }

    const avatarWin = createMockWindow(1)
    const getWindows = () => ({ avatar: avatarWin })

    const { secureOn } = createSecureIpc({ ipcMain: mockIpc, getWindows })
    let executed = false
    secureOn('test:event', ['settings'], () => { executed = true })

    const event = createMockEvent({ id: 1, url: 'file:///C:/app/renderer/index.html' })
    expect(() => mockIpc.listeners['test:event'](event)).not.toThrow()
    expect(executed).toBe(false)
    expect(warnSpy).toHaveBeenCalledWith('[ipc] DITOLAK', 'test:event', 'avatar')

    warnSpy.mockRestore()
  })
})
