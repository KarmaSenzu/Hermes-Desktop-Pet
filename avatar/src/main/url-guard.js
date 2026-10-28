/**
 * url-guard.js — Validasi URL HTTP dan proteksi akses endpoint lokal 9Router
 */

export function parseHttpUrl(raw) {
  try {
    const u = new URL(String(raw).trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (u.username || u.password) return null
    return u
  } catch {
    return null
  }
}

export function isLocalRouterUrl(raw) {
  const u = parseHttpUrl(raw)
  return !!u && u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) && u.port === '20128'
}
