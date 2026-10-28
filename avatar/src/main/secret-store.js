import { parseHttpUrl } from './url-guard.js'

export const PREFIX = 'v2:'

export function originOf(url) {
  const u = parseHttpUrl(url)
  return u ? u.origin : null
}

export function createSecretStore(safeStorage) {
  function seal(plain, baseUrl) {
    const o = originOf(baseUrl)
    const k = String(plain ?? '').trim()
    if (!o) throw new Error('URL tidak valid')
    if (!k || k.length > 500 || /[\u0000-\u001F\u007F]/.test(k)) throw new Error('Kunci tidak valid')
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Enkripsi OS tidak tersedia')
    return PREFIX + safeStorage.encryptString(JSON.stringify({ k, o })).toString('base64')
  }

  function open(sealed, targetUrl) {
    const s = String(sealed ?? '')
    if (!s) return { ok: true, key: '' }
    if (!s.startsWith(PREFIX)) return { ok: false, legacy: true, error: 'Kunci versi lama. Simpan ulang kunci di Pengaturan.' }
    let obj
    try {
      obj = JSON.parse(safeStorage.decryptString(Buffer.from(s.slice(PREFIX.length), 'base64')))
    } catch {
      return { ok: false, error: 'Kunci tersimpan tidak dapat dibaca.' }
    }
    const t = originOf(targetUrl)
    if (!t || obj?.o !== t) return { ok: false, error: 'Kunci ini tersimpan untuk server lain. Masukkan ulang kunci.' }
    return { ok: true, key: String(obj.k || '') }
  }

  return { seal, open }
}
