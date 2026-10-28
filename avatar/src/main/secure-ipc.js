/**
 * secure-ipc.js — Sender frame, URL, dan window policy enforcement untuk semua IPC Electron.
 *
 * Mengikat registrasi IPC ke IPC_POLICY (kebijakan per-window) dan fail-fast
 * jika channel belum didefinisikan dalam kebijakan izin.
 */

import { IPC_POLICY } from './ipc-policy.js'

/**
 * Validasi pengirim frame IPC.
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
 * Membuat wrapper secureHandle dan secureOn yang terikat pada IPC_POLICY.
 *
 * @param {{
 *   ipcMain: import('electron').IpcMain,
 *   getWindows: () => Record<string, import('electron').BrowserWindow | null>,
 *   devUrl?: string,
 *   policy?: Record<string, string[]>
 * }} config
 * @returns {{
 *   secureHandle: (channel: string, fn: Function) => void,
 *   secureOn: (channel: string, fn: Function) => void
 * }}
 */
export function createSecureIpc({ ipcMain, getWindows, devUrl, policy = IPC_POLICY }) {
  function verify(channel, event) {
    const allowed = policy[channel]
    if (!allowed) {
      console.warn('[ipc] DITOLAK', channel, 'Channel tidak terdaftar di kebijakan')
      return { ok: false, reason: 'Channel tidak terdaftar dalam kebijakan' }
    }

    const windows = typeof getWindows === 'function' ? getWindows() : (getWindows || {})
    const v = validateSender(event, windows, { devUrl })
    if (!v.ok) {
      console.warn('[ipc] DITOLAK', channel, v.windowName || v.reason)
      return { ok: false, reason: v.reason }
    }

    if (allowed !== 'any' && !allowed.includes(v.windowName)) {
      console.warn('[ipc] DITOLAK', channel, v.windowName || v.reason)
      return { ok: false, reason: `Window ${v.windowName} tidak diizinkan` }
    }

    return { ok: true, windowName: v.windowName }
  }

  function secureHandle(channel, fn) {
    if (!policy || !(channel in policy)) {
      throw new Error(`Channel IPC tidak terdaftar dalam kebijakan: ${channel}`)
    }

    ipcMain.handle(channel, (event, ...args) => {
      const res = verify(channel, event)
      if (!res.ok) {
        throw new Error('IPC ditolak')
      }
      return fn(event, ...args)
    })
  }

  function secureOn(channel, fn) {
    if (!policy || !(channel in policy)) {
      throw new Error(`Channel IPC tidak terdaftar dalam kebijakan: ${channel}`)
    }

    ipcMain.on(channel, (event, ...args) => {
      const res = verify(channel, event)
      if (!res.ok) {
        return
      }
      return fn(event, ...args)
    })
  }

  return { secureHandle, secureOn }
}
