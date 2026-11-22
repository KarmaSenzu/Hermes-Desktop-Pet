/**
 * bridge-server.js — Local HTTP Bridge Server for Hermes Web Companion (Chrome & Edge Extension)
 * Menjalankan server HTTP aman di 127.0.0.1:9124 untuk menerima request Ask AI dari browser extension.
 */

import http from 'node:http'
import { timingSafeEqual } from 'node:crypto'

export const BRIDGE_PORT = 9124
export const BRIDGE_HOST = '127.0.0.1'

const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const ALLOWED_ORIGIN_RE = /^(chrome|moz|edge)-extension:\/\//i

let server = null
let promptCallback = null
let bridgeToken = null
const askTimestamps = []

function cleanString(val, maxLen) {
  if (typeof val !== 'string') return ''
  return val.replace(CONTROL_CHARS_RE, '').slice(0, maxLen)
}

function verifyToken(clientToken, expectedToken) {
  if (!clientToken || typeof clientToken !== 'string') return false
  const bufClient = Buffer.from(clientToken)
  const bufExpected = Buffer.from(expectedToken)
  if (bufClient.length !== bufExpected.length) return false
  return timingSafeEqual(bufClient, bufExpected)
}

/**
 * Memulai server HTTP bridge jika belum aktif
 * @param {Function} onPrompt - Callback ketika pesan/prompt diterima dari extension
 * @param {string} token - Token autentikasi bridge (minimal 32 karakter)
 */
export function startBridgeServer(onPrompt, token, port = BRIDGE_PORT) {
  if (!token || typeof token !== 'string' || token.length < 32) {
    throw new Error('Bridge token must be at least 32 characters')
  }

  bridgeToken = token
  if (onPrompt) promptCallback = onPrompt

  if (server) {
    return server
  }

  const getExpectedPort = () => {
    const addr = server?.address?.()
    return (addr && typeof addr === 'object' && addr.port) ? addr.port : port
  }

  server = http.createServer((req, res) => {
    // 1. Request OPTIONS -> balas 403 (semua CORS dihapus)
    if (req.method === 'OPTIONS') {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'Forbidden' }))
      return
    }

    // 2. Validasi Header Host (anti DNS-rebinding)
    const expectedPort = getExpectedPort()
    const host = (req.headers.host || '').toLowerCase()
    if (host !== `127.0.0.1:${expectedPort}` && host !== `localhost:${expectedPort}`) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'Forbidden host' }))
      return
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${expectedPort}`}`)
    const clientToken = req.headers['x-hermes-bridge-token']

    // 3. Health check endpoint (GET /api/ping) — izinkan pengecekan localhost oleh Settings UI / curl / extension
    if (req.method === 'GET' && parsedUrl.pathname === '/api/ping') {
      const pingHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
      if (clientToken !== undefined && !verifyToken(clientToken, bridgeToken)) {
        res.writeHead(401, pingHeaders)
        res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }))
        return
      }
      res.writeHead(200, pingHeaders)
      res.end(JSON.stringify({
        ok: true,
        app: 'Hermes Companion Bridge',
        version: '1.1.2',
        port: expectedPort
      }))
      return
    }

    // 4. Validasi Header Origin jika ada (ketat untuk POST /api/ask)
    const origin = req.headers.origin
    if (origin !== undefined && !ALLOWED_ORIGIN_RE.test(origin)) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'Forbidden origin' }))
      return
    }

    // 5. Validasi Header Token (x-hermes-bridge-token)
    if (!verifyToken(clientToken, bridgeToken)) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }))
      return
    }

    // 6. Ask AI endpoint (POST /api/ask)
    if (req.method === 'POST' && parsedUrl.pathname === '/api/ask') {
      const contentType = (req.headers['content-type'] || '').toLowerCase()
      if (!contentType.startsWith('application/json')) {
        res.writeHead(415, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Unsupported Media Type' }))
        return
      }

      // Rate limit: 6 requests / 60 seconds
      const now = Date.now()
      while (askTimestamps.length > 0 && askTimestamps[0] <= now - 60000) {
        askTimestamps.shift()
      }
      if (askTimestamps.length >= 6) {
        res.writeHead(429, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Too Many Requests' }))
        return
      }
      askTimestamps.push(now)

      // Batas body 64 KB (65536 bytes)
      let rawData = ''
      let bodyLength = 0
      let aborted = false

      req.on('data', (chunk) => {
        if (aborted) return
        bodyLength += chunk.length
        if (bodyLength > 64 * 1024) {
          aborted = true
          res.writeHead(413, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Payload Too Large' }), () => {
            req.destroy()
          })
          return
        }
        rawData += chunk
      })

      req.on('end', () => {
        if (aborted) return
        let payload
        try {
          payload = JSON.parse(rawData || '{}')
          if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
            throw new Error('Invalid JSON structure')
          }
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
          return
        }

        const title = cleanString(payload.title, 200)
        let url = cleanString(payload.url, 2000)
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = ''
        }
        const text = cleanString(payload.text, 8000)
        const prompt = cleanString(payload.prompt, 1000)

        if (!text && !prompt) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Missing text or prompt' }))
          return
        }

        const sanitizedPayload = { title, url, text, prompt }
        if (typeof promptCallback === 'function') {
          promptCallback(sanitizedPayload)
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      })
      return
    }

    // Default 404
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'Not Found' }))
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Bridge Server] Port ${BRIDGE_PORT} sudah digunakan, bridge mungkin sudah berjalan di instance lain.`)
    } else {
      console.warn('[Bridge Server] Error:', err.message)
    }
  })

  server.listen(port, BRIDGE_HOST, () => {
    const actualPort = getExpectedPort()
    console.log(`[Bridge Server] Hermes Companion Bridge siap di http://${BRIDGE_HOST}:${actualPort}`)
  })

  return server
}

/**
 * Hentikan server bridge saat aplikasi ditutup
 */
export function stopBridgeServer() {
  if (server) {
    try {
      server.closeAllConnections?.()
      server.close()
    } catch {}
    server = null
    promptCallback = null
    bridgeToken = null
    askTimestamps.length = 0
  }
}
