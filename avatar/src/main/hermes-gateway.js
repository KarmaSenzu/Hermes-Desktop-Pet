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

let socket = null
let nextId = 0
const pending = new Map()
let connected = false

function buildUrl(token) {
  const base = process.env['HERMES_WS_URL'] || DEFAULT_WS_URL
  return token ? `${base}?token=${encodeURIComponent(token)}` : base
}

export function connectGateway(token) {
  return new Promise((resolve, reject) => {
    if (socket && connected) {
      resolve()
      return
    }

    const url = buildUrl(token)
    socket = new WebSocket(url)

    socket.on('open', () => {
      connected = true
      resolve()
    })

    socket.on('message', (raw) => {
      let frame
      try {
        frame = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (frame.id != null && pending.has(frame.id)) {
        const { resolve, reject } = pending.get(frame.id)
        pending.delete(frame.id)
        if (frame.error) reject(new Error(frame.error.message || 'Hermes RPC failed'))
        else resolve(frame.result)
      }
    })

    socket.on('error', (err) => {
      connected = false
      reject(err)
    })

    socket.on('close', () => {
      connected = false
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
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
  })
}

export function disconnectGateway() {
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
