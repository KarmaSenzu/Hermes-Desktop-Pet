/**
 * secure-ipc.js — Sender frame and origin validation for all Electron IPC channels.
 *
 * Ensures IPC messages originate from the main frame of known, registered
 * application windows and trusted URLs (file:// in production, ELECTRON_RENDERER_URL in dev).
 */

/**
 * Validates the sender of an IPC event.
 *
 * @param {import('electron').IpcMainInvokeEvent | import('electron').IpcMainEvent} event
 * @param {Record<string, import('electron').BrowserWindow | null>} windows
 * @param {{ devUrl?: string }} [options]
 * @returns {{ ok: boolean, windowName?: string, reason?: string }}
 */
export function validateSender(event, windows = {}, { devUrl } = {}) {
  if (!event || !event.sender || !event.senderFrame) {
    return { ok: false, reason: 'Pengirim tidak valid (senderFrame tidak ditemukan)' }
  }

  // 1. Tolak iframe: event.senderFrame harus === event.sender.mainFrame
  if (event.senderFrame !== event.sender.mainFrame) {
    return { ok: false, reason: 'Pengirim bukan mainFrame (iframe ditolak)' }
  }

  // 2. Validasi skema / URL pengirim: harus file:// atau diawali devUrl
  const url = typeof event.senderFrame.url === 'string' ? event.senderFrame.url : ''
  const isDev = Boolean(devUrl && url.startsWith(devUrl))
  const isFile = url.startsWith('file://')

  if (!isFile && !isDev) {
    return { ok: false, reason: `URL tidak valid: ${url}` }
  }

  // 3. Cocokkan sender.id dengan salah satu webContents.id di windows terdaftar
  const senderId = event.sender.id
  let matchedName = null

  for (const [name, win] of Object.entries(windows)) {
    if (!win) continue
    if (typeof win.isDestroyed === 'function' && win.isDestroyed()) continue
    const wc = win.webContents
    if (!wc) continue
    if (typeof wc.isDestroyed === 'function' && wc.isDestroyed()) continue
    if (wc.id === senderId) {
      if (url.includes('settings.html') && name === 'settings') {
        return { ok: true, windowName: 'settings' }
      }
      if (url.includes('launcher.html') && name === 'launcher') {
        return { ok: true, windowName: 'launcher' }
      }
      if (url.includes('index.html') && name === 'avatar') {
        return { ok: true, windowName: 'avatar' }
      }
      matchedName = name
    }
  }

  if (matchedName) {
    return { ok: true, windowName: matchedName }
  }

  return { ok: false, reason: 'Pengirim tidak terdaftar di daftar window' }
}

/**
 * Creates secure wrapper functions for ipcMain.
 *
 * @param {{
 *   ipcMain: import('electron').IpcMain,
 *   getWindows: () => Record<string, import('electron').BrowserWindow | null>,
 *   devUrl?: string
 * }} config
 * @returns {{
 *   secureHandle: (channel: string, allow: string[] | string, fn: Function) => void,
 *   secureOn: (channel: string, allow: string[] | string, fn: Function) => void
 * }}
 */
export function createSecureIpc({ ipcMain, getWindows, devUrl }) {
  function verify(channel, allow, event) {
    const windows = typeof getWindows === 'function' ? getWindows() : (getWindows || {})
    const v = validateSender(event, windows, { devUrl })
    if (!v.ok) {
      console.warn('[ipc] DITOLAK', channel, v.windowName || v.reason)
      return { ok: false, reason: v.reason }
    }

    if (allow !== 'any') {
      const allowedList = Array.isArray(allow) ? allow : [allow]
      if (!allowedList.includes(v.windowName)) {
        console.warn('[ipc] DITOLAK', channel, v.windowName || v.reason)
        return { ok: false, reason: `Window ${v.windowName} tidak diizinkan` }
      }
    }

    return { ok: true, windowName: v.windowName }
  }

  function secureHandle(channel, allow, fn) {
    ipcMain.handle(channel, (event, ...args) => {
      const res = verify(channel, allow, event)
      if (!res.ok) {
        throw new Error('IPC ditolak')
      }
      return fn(event, ...args)
    })
  }

  function secureOn(channel, allow, fn) {
    ipcMain.on(channel, (event, ...args) => {
      const res = verify(channel, allow, event)
      if (!res.ok) {
        return
      }
      return fn(event, ...args)
    })
  }

  return { secureHandle, secureOn }
}
