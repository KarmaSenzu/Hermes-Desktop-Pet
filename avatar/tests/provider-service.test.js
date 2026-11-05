import { describe, it, expect } from 'vitest'
import { testProviderConnection, updateHermesProviderConfig, runHermes } from '../src/main/provider-service.js'

describe('provider-service', () => {
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
