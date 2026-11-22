/**
 * hermes-gateway.js (main process)
 * SATU koneksi WebSocket shared ke `hermes serve` untuk RPC config/model.
 * Dipakai oleh settings window (dan nanti avatar) via IPC.
 *
 * Berbeda dari HermesClient (renderer): ini berjalan di main (Node) memakai
 * library `ws`, supaya semua window bisa share satu koneksi.
 */

import WebSocket from 'ws'

const DEFAULT_WS_URL = 'ws://127.0.0.1:9119/api/ws'
const CONNECT_TIMEOUT_MS = 5000
const REQUEST_TIMEOUT_MS = 15000

let socket = null
let nextId = 0
const pending = new Map()
let connected = false

function buildUrl(token) {
  const base = process.env['HERMES_WS_URL'] || DEFAULT_WS_URL
  return token ? `${base}?token=${encodeURIComponent(token)}` : base
}

function rejectAllPending(reason) {
  for (const [id, entry] of pending.entries()) {
    clearTimeout(entry.timer)
    pending.delete(id)
    try {
      entry.reject(new Error(reason))
    } catch {
      // abaikan
    }
  }
}

export function connectGateway(token) {
  return new Promise((resolve, reject) => {
    if (socket && connected) {
      resolve()
      return
    }

    if (socket) {
      try { socket.terminate?.() || socket.close() } catch { /* abaikan */ }
      socket = null
      connected = false
    }

    const url = buildUrl(token)
    const ws = new WebSocket(url)
    socket = ws
    let settled = false

    const connectTimer = setTimeout(() => {
      if (!settled) {
        settled = true
        connected = false
        try { ws.terminate?.() || ws.close() } catch { /* abaikan */ }
        if (socket === ws) socket = null
        reject(new Error('Koneksi ke Hermes gateway timeout'))
      }
    }, CONNECT_TIMEOUT_MS)

    ws.on('open', () => {
      clearTimeout(connectTimer)
      connected = true
      if (!settled) {
        settled = true
        resolve()
      }
    })

    ws.on('message', (raw) => {
      let frame
      try {
        frame = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (frame.id != null && pending.has(frame.id)) {
        const entry = pending.get(frame.id)
        clearTimeout(entry.timer)
        pending.delete(frame.id)
        if (frame.error) entry.reject(new Error(frame.error.message || 'Hermes RPC failed'))
        else entry.resolve(frame.result)
      }
    })

    ws.on('error', (err) => {
      clearTimeout(connectTimer)
      connected = false
      if (socket === ws) socket = null
      rejectAllPending(err?.message || 'Koneksi Hermes gateway bermasalah')
      if (!settled) {
        settled = true
        reject(err)
      }
    })

    ws.on('close', () => {
      clearTimeout(connectTimer)
      connected = false
      if (socket === ws) socket = null
      rejectAllPending('Koneksi Hermes gateway terputus')
      if (!settled) {
        settled = true
        reject(new Error('Koneksi Hermes gateway ditutup'))
      }
    })
  })
}

export function isGatewayConnected() {
  return connected
}

export function request(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!socket || !connected) {
      reject(new Error('Hermes gateway belum terhubung'))
      return
    }
    const id = `g${++nextId}`
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`RPC ${method} timeout (${REQUEST_TIMEOUT_MS}ms)`))
      }
    }, REQUEST_TIMEOUT_MS)
    pending.set(id, { resolve, reject, timer })
    try {
      socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
    } catch (err) {
      clearTimeout(timer)
      pending.delete(id)
      reject(err)
    }
  })
}

export function disconnectGateway() {
  rejectAllPending('Hermes gateway diputus oleh sistem')
  if (socket) {
    try {
      socket.close()
    } catch {
      // ignore
    }
    socket = null
    connected = false
  }
}
