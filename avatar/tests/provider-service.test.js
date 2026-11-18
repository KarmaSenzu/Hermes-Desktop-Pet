import { describe, it, expect } from 'vitest'
import { testProviderConnection, updateHermesProviderConfig, normalizeGeminiModel, runHermes } from '../src/main/provider-service.js'

describe('provider-service', () => {
  it('normalizeGeminiModel memigrasikan model Gemini usang dan menghapus prefix models/', () => {
    const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/openai'
    expect(normalizeGeminiModel(geminiUrl, 'gemini-2.0-flash')).toBe('gemini-3.5-flash-lite')
    expect(normalizeGeminiModel(geminiUrl, 'models/gemini-2.5-flash')).toBe('gemini-3.5-flash-lite')
    expect(normalizeGeminiModel(geminiUrl, 'models/gemini-3.8-flash')).toBe('gemini-3.8-flash')
    expect(normalizeGeminiModel('https://api.openai.com/v1', 'gemini-2.0-flash')).toBe('gemini-2.0-flash')
  })

  it('testProviderConnection menolak URL kosong atau non-http/https', async () => {
    const res1 = await testProviderConnection({ url: '', model: 'gpt-4' })
    expect(res1.ok).toBe(false)
    expect(res1.error).toContain('kosong')

    const res2 = await testProviderConnection({ url: 'ftp://example.com', model: 'gpt-4' })
    expect(res2.ok).toBe(false)
    expect(res2.error).toContain('tidak valid')
  })

  it('testProviderConnection menolak model kosong', async () => {
    const res = await testProviderConnection({ url: 'http://localhost:20128', model: '' })
    expect(res.ok).toBe(false)
    expect(res.error).toContain('Model kosong')
  })

  it('runHermes menolak argumen injeksi flag negatif', async () => {
    await expect(runHermes(['--injected', 'arg'])).rejects.toThrow('tidak diizinkan')
  })
})
