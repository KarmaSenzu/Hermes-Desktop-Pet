import { describe, it, expect, beforeEach, vi } from 'vitest'

// tts.js memakai `window.hermesAvatar.synthesizeSpeech`. Sediakan mock global sebelum import.
function setupWindow(mockResult) {
  globalThis.window = {
    hermesAvatar: {
      synthesizeSpeech: vi.fn(async () => mockResult)
    }
  }
}

describe('tts.synthesize — parsing respons backend', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('menerima shape Hermes { ok, dataUrl } tanpa field base64', async () => {
    // 4 byte audio palsu: "AAAA" base64 = 0x00 0x00 0x00
    setupWindow({ ok: true, dataUrl: 'data:audio/mpeg;base64,AAAA', mimeType: 'audio/mpeg' })
    const { synthesize } = await import('../src/renderer/js/tts.js')
    const res = await synthesize('halo', 'id-ID-GadisNeural', { provider: 'edge' })
    expect(res.mimeType).toBe('audio/mpeg')
    expect(res.buffer.byteLength).toBe(3)
  })

  it('menerima shape { base64 } mentah (msedge-tts)', async () => {
    setupWindow({ ok: true, base64: 'AAAA', mimeType: 'audio/mpeg' })
    const { synthesize } = await import('../src/renderer/js/tts.js')
    const res = await synthesize('halo', 'id-ID-GadisNeural', { provider: 'edge' })
    expect(res.buffer.byteLength).toBe(3)
  })

  it('mengambil mime dari dataUrl wav (Kokoro/SAPI)', async () => {
    setupWindow({ ok: true, dataUrl: 'data:audio/wav;base64,AAAA' })
    const { synthesize } = await import('../src/renderer/js/tts.js')
    const res = await synthesize('halo', 'af_heart', { provider: 'kokoro' })
    expect(res.mimeType).toBe('audio/wav')
  })

  it('melempar error jelas bila audio kosong', async () => {
    setupWindow({ ok: true, dataUrl: 'data:audio/wav;base64,' })
    const { synthesize } = await import('../src/renderer/js/tts.js')
    await expect(synthesize('halo', 'af_heart', { provider: 'kokoro' }))
      .rejects.toThrow(/audio kosong/i)
  })

  it('melempar error bila result.ok false', async () => {
    setupWindow({ ok: false, error: 'server mati' })
    const { synthesize } = await import('../src/renderer/js/tts.js')
    await expect(synthesize('halo', 'af_heart', { provider: 'kokoro' }))
      .rejects.toThrow(/server mati/i)
  })

  it('melempar error jelas bila IPC mengembalikan null atau undefined', async () => {
    setupWindow(null)
    const { synthesize } = await import('../src/renderer/js/tts.js')
    await expect(synthesize('halo', 'af_heart', { provider: 'kokoro' }))
      .rejects.toThrow(/tidak ada respons/i)

    vi.resetModules()
    setupWindow(undefined)
    const { synthesize: synthesize2 } = await import('../src/renderer/js/tts.js')
    await expect(synthesize2('halo', 'af_heart', { provider: 'kokoro' }))
      .rejects.toThrow(/tidak ada respons/i)
  })
})
