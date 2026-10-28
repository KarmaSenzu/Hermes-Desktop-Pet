import { describe, it, expect } from 'vitest'
import { createSecretStore, originOf, PREFIX } from '../src/main/secret-store.js'

describe('secret-store tests', () => {
  const fakeSafeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from('ENC:' + s),
    decryptString: (b) => b.toString().slice(4)
  }

  const store = createSecretStore(fakeSafeStorage)

  it('1) seal lalu open dengan origin sama -> key benar', () => {
    const sealed = store.seal('sk-test-key-123', 'https://api.openai.com/v1')
    const res = store.open(sealed, 'https://api.openai.com/v1')
    expect(res).toEqual({ ok: true, key: 'sk-test-key-123' })
  })

  it('2) origin berbeda -> ok:false', () => {
    const sealed = store.seal('sk-secret', 'https://api.openai.com/v1')
    const res = store.open(sealed, 'https://evil.tld/v1')
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Kunci ini tersimpan untuk server lain. Masukkan ulang kunci.')
  })

  it('3) path berbeda tapi origin sama (http://localhost:20128/v1 vs http://localhost:20128) -> ok', () => {
    const sealed = store.seal('router-secret', 'http://localhost:20128/v1')
    const res = store.open(sealed, 'http://localhost:20128')
    expect(res).toEqual({ ok: true, key: 'router-secret' })
  })

  it('4) string legacy tanpa v2: -> ok:false, legacy:true', () => {
    const res = store.open('old-legacy-ciphertext-base64', 'http://localhost:20128')
    expect(res.ok).toBe(false)
    expect(res.legacy).toBe(true)
    expect(res.error).toBe('Kunci versi lama. Simpan ulang kunci di Pengaturan.')
  })

  it('5) sealed kosong -> ok:true, key empty', () => {
    expect(store.open('', 'http://localhost:20128')).toEqual({ ok: true, key: '' })
    expect(store.open(null, 'http://localhost:20128')).toEqual({ ok: true, key: '' })
  })

  it('6) seal menolak URL tidak valid / kunci kosong / kunci berisi karakter kontrol', () => {
    expect(() => store.seal('key', 'not-a-valid-url')).toThrow('URL tidak valid')
    expect(() => store.seal('key', 'ftp://localhost:20128')).toThrow('URL tidak valid')
    expect(() => store.seal('', 'http://localhost:20128')).toThrow('Kunci tidak valid')
    expect(() => store.seal('   ', 'http://localhost:20128')).toThrow('Kunci tidak valid')
    expect(() => store.seal('bad\x00key', 'http://localhost:20128')).toThrow('Kunci tidak valid')
    expect(() => store.seal('bad\x1Fkey', 'http://localhost:20128')).toThrow('Kunci tidak valid')
    expect(() => store.seal('bad\x7Fkey', 'http://localhost:20128')).toThrow('Kunci tidak valid')
  })

  it('7) hasil seal diawali v2: dan tidak memuat plaintext kunci', () => {
    const plain = 'super-secret-plain-api-key'
    const sealed = store.seal(plain, 'http://localhost:20128')
    expect(sealed.startsWith(PREFIX)).toBe(true)
    expect(sealed.startsWith('v2:')).toBe(true)
    expect(sealed.includes(plain)).toBe(false)
  })
})
