import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { resolveTtsUrl, synthesizeTts } from '../src/main/tts-service.js'

describe('tts-service.resolveTtsUrl', () => {
  it('mengubah ws:// dan wss:// ke endpoint /api/audio/speak HTTP(S)', () => {
    expect(resolveTtsUrl('ws://127.0.0.1:9119/api/ws?token=abc')).toBe('http://127.0.0.1:9119/api/audio/speak')
    expect(resolveTtsUrl('wss://example.com:8443/api/ws')).toBe('https://example.com:8443/api/audio/speak')
  })

  it('fallback aman ke localhost:9119 bila URL tidak valid', () => {
    expect(resolveTtsUrl('not-a-valid-url')).toBe('http://127.0.0.1:9119/api/audio/speak')
  })
})

describe('tts-service.synthesizeTts — alur Kokoro & fallback', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('menyalakan Kokoro secara otomatis dan tetap menunggu saat port 8880 mati (noFallback)', async () => {
    const startKokoro = vi.fn(async () => ({ ok: true, already: false }))
    const isPortOpen = vi.fn(async () => false)
    const wavBytes = Uint8Array.from([82, 73, 70, 70]).buffer // "RIFF"
    const fetchMock = vi.fn(async (url) => {
      expect(url).toBe('http://127.0.0.1:8880/v1/audio/speech')
      return {
        ok: true,
        arrayBuffer: async () => wavBytes
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await synthesizeTts({
      text: 'Halo Kokoro!',
      voice: 'jf_alpha',
      options: { provider: 'kokoro', intonation: 'anime', speed: 1.25, noFallback: true },
      isPortOpen,
      startKokoro
    })

    expect(startKokoro).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(res).not.toBeNull()
    expect(res.ok).toBe(true)
    expect(res.isKokoro).toBe(true)
    expect(res.voice).toBe('jf_alpha')
    expect(res.mimeType).toBe('audio/wav')
    expect(res.dataUrl).toBe('data:audio/wav;base64,UklGRg==')
  })

  it('tidak pernah mengembalikan null bila startKokoro gagal dan noFallback aktif', async () => {
    const startKokoro = vi.fn(async () => ({ ok: false, error: 'Python tidak ditemukan' }))
    const isPortOpen = vi.fn(async () => false)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await synthesizeTts({
      text: 'Tes uji kokoro',
      voice: 'af_heart',
      options: { provider: 'kokoro', noFallback: true },
      isPortOpen,
      startKokoro
    })

    expect(startKokoro).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(res).not.toBeNull()
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/Python tidak ditemukan/i)
  })

  it('jatuh ke fallback Hermes /api/audio/speak bila Kokoro gagal dan noFallback false', async () => {
    const startKokoro = vi.fn(async () => ({ ok: false, error: 'Kokoro offline' }))
    const isPortOpen = vi.fn(async () => false)
    const fetchMock = vi.fn(async (url, init) => {
      expect(url).toBe('http://127.0.0.1:9119/api/audio/speak')
      const body = JSON.parse(init.body)
      expect(body.voice).toBe('id-ID-GadisNeural')
      return {
        ok: true,
        json: async () => ({
          ok: true,
          data_url: 'data:audio/mpeg;base64,AAAA',
          mime_type: 'audio/mpeg'
        })
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await synthesizeTts({
      text: 'Halo dari fallback Hermes',
      voice: 'jf_alpha',
      options: { provider: 'kokoro' },
      sessionToken: 'tok-123',
      isPortOpen,
      startKokoro
    })

    expect(startKokoro).toHaveBeenCalledTimes(1)
    expect(res).not.toBeNull()
    expect(res.ok).toBe(true)
    expect(res.isFallback).toBe(true)
    expect(res.mimeType).toBe('audio/mpeg')
    expect(res.base64).toBe('AAAA')
  })

  it('mencoba startKokoro ulang bila port awal terbuka namun fetch Kokoro gagal', async () => {
    const isPortOpen = vi.fn(async () => true)
    const startKokoro = vi.fn(async () => ({ ok: true }))
    const wavBytes = Uint8Array.from([82, 73, 70, 70]).buffer
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => wavBytes
      })
    vi.stubGlobal('fetch', fetchMock)

    const res = await synthesizeTts({
      text: 'Coba lagi',
      voice: 'af_heart',
      options: { provider: 'kokoro', noFallback: true },
      isPortOpen,
      startKokoro
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(startKokoro).toHaveBeenCalledTimes(1)
    expect(res.ok).toBe(true)
    expect(res.mimeType).toBe('audio/wav')
  })
})
