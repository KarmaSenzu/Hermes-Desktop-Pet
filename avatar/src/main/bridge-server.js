/**
 * bridge-server.js — Local HTTP Bridge Server for Hermes Web Companion (Chrome & Edge Extension)
 * Menjalankan server HTTP ringan di port 9124 untuk menerima request Ask AI dari browser extension.
 */

import http from 'http'

export const BRIDGE_PORT = 9124
export const BRIDGE_HOST = '127.0.0.1'

let server = null
let promptCallback = null

/**
 * Memulai server HTTP bridge jika belum aktif
 * @param {Function} onPrompt - Callback ketika pesan/prompt diterima dari extension
 */
export function startBridgeServer(onPrompt) {
  if (server) {
    if (onPrompt) promptCallback = onPrompt
    return server
  }

  promptCallback = onPrompt

  server = http.createServer((req, res) => {
    // Header CORS agar ekstensi browser dapat memanggil tanpa hambatan origin
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    // Handle pre-flight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

    // 1. Health check & status endpoint
    if (req.method === 'GET' && parsedUrl.pathname === '/api/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          ok: true,
          app: 'Hermes 3D Avatar Web Companion Bridge',
          version: '0.1.0',
          port: BRIDGE_PORT
        })
      )
      return
    }

    // 2. Ask AI endpoint dari browser
    if (req.method === 'POST' && parsedUrl.pathname === '/api/ask') {
      let rawData = ''
      req.on('data', (chunk) => {
        rawData += chunk
        if (rawData.length > 500000) {
          // Batasi payload maksimal 500KB demi keamanan
          req.destroy()
        }
      })

      req.on('end', () => {
        try {
          const payload = JSON.parse(rawData || '{}')
          if (typeof promptCallback === 'function') {
            promptCallback(payload)
          }

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              ok: true,
              status: 'received',
              message: 'Pertanyaan berhasil diteruskan ke Hermes Desktop Avatar'
            })
          )
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Payload bukan JSON valid' }))
        }
      })
      return
    }

    // Default 404
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Endpoint tidak ditemukan' }))
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Bridge Server] Port ${BRIDGE_PORT} sudah digunakan, bridge mungkin sudah berjalan di instance lain.`)
    } else {
      console.warn('[Bridge Server] Error:', err.message)
    }
  })

  server.listen(BRIDGE_PORT, BRIDGE_HOST, () => {
    console.log(`[Bridge Server] Hermes Companion Bridge siap di http://${BRIDGE_HOST}:${BRIDGE_PORT}`)
  })

  return server
}

/**
 * Hentikan server bridge saat aplikasi ditutup
 */
export function stopBridgeServer() {
  if (server) {
    try {
      server.close()
    } catch {}
    server = null
    promptCallback = null
  }
}
