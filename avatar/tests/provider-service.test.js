import { describe, it, expect } from 'vitest'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import YAML from 'yaml'
import {
  testProviderConnection,
  updateHermesProviderConfig,
  repairHermesConfigYaml,
  updateHermesVoiceConfig,
  loadSavedLlmProviders,
  saveSavedLlmProviders,
  upsertSavedLlmProviderOnDisk,
  normalizeGeminiModel,
  extractModelIds,
  deriveGeminiNativeModelsUrl,
  fetchModelsForProviders,
  runHermes
} from '../src/main/provider-service.js'

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

  it('repairHermesConfigYaml memperbaiki duplikasi stt.local dan baris korup yatim', async () => {
    const corrupt = [
      'model:',
      '  default: claude-opus-4.6',
      'stt:',
      '  local:',
      '    language: id',
      '  enabled: true',
      '  local:',
      '    model: base',
      'custom_providers:',
      '  - name: Google Gemini',
      '    base_url: https://generativelanguage.googleapis.com/v1beta/openai',
      '    api_key: test-key',
      '    model: gemini-3.5-flash-lite',
      'jf_alpha'
    ].join('\n')

    const repaired = await repairHermesConfigYaml(corrupt)
    const doc = YAML.parseDocument(repaired)
    expect(doc.errors).toHaveLength(0)
    const obj = doc.toJS()
    expect(obj.model.default).toBe('claude-opus-4.6')
    expect(obj.stt.local.model).toBe('base')
    expect(obj.custom_providers).toHaveLength(1)
  })

  it('updateHermesVoiceConfig mem-serialize penulisan TTS dan STT konkuren tanpa merusak YAML', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'hermes-voice-test-'))
    try {
      const cfgPath = join(tmpDir, 'config.yaml')
      await writeFile(cfgPath, 'model:\n  default: gemini-3.5-flash-lite\n', 'utf8')

      await Promise.all([
        updateHermesVoiceConfig({ voice: 'jf_alpha', configPath: cfgPath }),
        updateHermesVoiceConfig({ sttModel: 'base', sttLanguage: 'id', configPath: cfgPath })
      ])

      const finalText = await readFile(cfgPath, 'utf8')
      const doc = YAML.parseDocument(finalText)
      expect(doc.errors).toHaveLength(0)
      const obj = doc.toJS()
      expect(obj.tts.edge.voice).toBe('jf_alpha')
      expect(obj.stt.local.model).toBe('base')
      expect(obj.stt.local.language).toBe('id')
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('loadSavedLlmProviders & upsertSavedLlmProviderOnDisk menyimpan provider secara persisten di JSON dan mengimpor config.yaml', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'hermes-llm-json-test-'))
    try {
      const providersFile = join(tmpDir, 'llm_providers.json')
      const cfgPath = join(tmpDir, 'config.yaml')
      await writeFile(cfgPath, [
        'model:',
        '  default: gemini-3.5-flash-lite',
        '  base_url: https://generativelanguage.googleapis.com/v1beta/openai',
        'custom_providers:',
        '  - name: Google Gemini',
        '    base_url: https://generativelanguage.googleapis.com/v1beta/openai',
        '    api_key: my-gemini-key',
        '    model: gemini-3.5-flash-lite'
      ].join('\n'), 'utf8')

      const mockSecretStore = {
        seal: (k) => `v2:${Buffer.from(k).toString('base64')}`
      }

      const loaded = await loadSavedLlmProviders({
        secretStore: mockSecretStore,
        providersFile,
        cfgPath
      })
      expect(loaded.ok).toBe(true)
      expect(loaded.providers).toHaveLength(1)
      expect(loaded.providers[0].name).toBe('Google Gemini')
      expect(loaded.providers[0].apiKey).toBe(`v2:${Buffer.from('my-gemini-key').toString('base64')}`)

      const updated = await upsertSavedLlmProviderOnDisk({
        name: 'Google Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemini-3.8-flash'
      }, { secretStore: mockSecretStore, providersFile, setActive: true })
      expect(updated.providers).toHaveLength(1)
      expect(updated.providers[0].models).toContain('gemini-3.5-flash-lite')
      expect(updated.providers[0].models).toContain('gemini-3.8-flash')

      const rawJson = JSON.parse(await readFile(providersFile, 'utf8'))
      expect(rawJson.providers).toHaveLength(1)
      expect(rawJson.activeId).toBe(updated.providers[0].id)
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('extractModelIds menormalkan berbagai format respons /models', () => {
    // Format OpenAI standar
    expect(extractModelIds({ object: 'list', data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] }))
      .toEqual(['gpt-4o', 'gpt-4o-mini'])
    // Array string
    expect(extractModelIds(['a', 'b'])).toEqual(['a', 'b'])
    // Format Gemini ({models:[{name}]}) dengan prefix models/
    expect(extractModelIds({ models: [{ name: 'models/gemini-3.8-flash' }, { name: 'models/gemini-3.5-flash' }] }))
      .toEqual(['gemini-3.8-flash', 'gemini-3.5-flash'])
    // Dedupe + abaikan entri kosong
    expect(extractModelIds({ data: [{ id: 'x' }, { id: 'x' }, { id: '' }, {}] })).toEqual(['x'])
    // Struktur tidak dikenal → []
    expect(extractModelIds(null)).toEqual([])
    expect(extractModelIds({ foo: 'bar' })).toEqual([])
  })

  it('fetchModelsForProviders mengembalikan hasil terisolasi per provider (error tidak menjatuhkan yang lain)', async () => {
    const results = await fetchModelsForProviders({
      providers: [
        // URL invalid → error, bukan throw
        { id: 'p-bad', name: 'Rusak', baseUrl: 'not-a-url' },
        // Tanpa baseUrl → difilter keluar
        { id: 'p-empty', name: 'Kosong', baseUrl: '' }
      ]
    })
    expect(Array.isArray(results)).toBe(true)
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('p-bad')
    expect(results[0].ok).toBe(false)
    expect(results[0].models).toEqual([])
    expect(results[0].error).toBeTruthy()
  })

  it('fetchEndpointModels menangani respons server OpenAI-compatible (mock http)', async () => {
    const http = await import('node:http')
    const server = http.createServer((req, res) => {
      if (req.url === '/v1/models') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ object: 'list', data: [{ id: 'kr/claude-sonnet-4.5' }, { id: 'kr/glm-5' }] }))
      } else {
        res.writeHead(404)
        res.end('{}')
      }
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    try {
      const { fetchEndpointModels } = await import('../src/main/provider-service.js')
      const res = await fetchEndpointModels({
        baseUrl: `http://127.0.0.1:${port}/v1`,
        apiKey: '',
        resolveApiKeyFor: async () => ''
      })
      expect(res.ok).toBe(true)
      expect(res.models).toEqual(['kr/claude-sonnet-4.5', 'kr/glm-5'])
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it('upsertSavedLlmProviderOnDisk menyimpan SELURUH daftar models 9Router (bukan hanya satu)', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'hermes-9router-models-test-'))
    try {
      const providersFile = join(tmpDir, 'llm_providers.json')
      const routerModels = ['kr/auto', 'kr/claude-sonnet-4.5', 'kr/glm-5', 'cbcn/deepseek-v4-pro']

      const saved = await upsertSavedLlmProviderOnDisk({
        name: '9Router Lokal',
        baseUrl: 'http://127.0.0.1:20128/v1',
        model: 'kr/auto',
        models: routerModels,
        authType: '9router'
      }, { providersFile, setActive: true, cfgPath: join(tmpDir, 'none.yaml') })

      expect(saved.providers).toHaveLength(1)
      for (const m of routerModels) {
        expect(saved.providers[0].models).toContain(m)
      }
      expect(saved.providers[0].authType).toBe('9router')

      // Simpan ulang dengan model Default: daftar lama tetap dipertahankan (merge, bukan replace).
      const again = await upsertSavedLlmProviderOnDisk({
        name: '9Router Lokal',
        baseUrl: 'http://127.0.0.1:20128/v1',
        model: 'cbcn/deepseek-v4-pro',
        authType: '9router'
      }, { providersFile, setActive: true, cfgPath: join(tmpDir, 'none.yaml') })

      expect(again.providers).toHaveLength(1)
      expect(again.providers[0].models).toContain('kr/glm-5')
      expect(again.providers[0].models).toContain('cbcn/deepseek-v4-pro')
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('deriveGeminiNativeModelsUrl mengubah base URL OpenAI-compat ke endpoint native :listModels', () => {
    expect(deriveGeminiNativeModelsUrl('https://generativelanguage.googleapis.com/v1beta/openai'))
      .toBe('https://generativelanguage.googleapis.com/v1beta/models')
    expect(deriveGeminiNativeModelsUrl('https://generativelanguage.googleapis.com/v1/openai'))
      .toBe('https://generativelanguage.googleapis.com/v1/models')
    // Tanpa /openai pun tetap menghasilkan endpoint models yang benar
    expect(deriveGeminiNativeModelsUrl('https://generativelanguage.googleapis.com/v1beta'))
      .toBe('https://generativelanguage.googleapis.com/v1beta/models')
    expect(deriveGeminiNativeModelsUrl('bukan-url')).toBe('')
  })

  it('testProviderConnection menyertakan latencyMs & rto=false saat ping HTTP 200 berhasil, serta rto=true saat timeout/504', async () => {
    const http = await import('node:http')
    const server = http.createServer((req, res) => {
      if (req.url === '/ok/v1/chat/completions') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ id: 'ping-ok', choices: [{ message: { content: 'pong' } }] }))
      } else if (req.url === '/gw-timeout/v1/chat/completions') {
        res.writeHead(504, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'Gateway Timeout' } }))
      } else if (req.url === '/hang/v1/chat/completions') {
        // Sengaja tidak membalas untuk memicu RTO socket timeout
      } else {
        res.writeHead(404)
        res.end('{}')
      }
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    try {
      const okRes = await testProviderConnection({
        url: `http://127.0.0.1:${port}/ok`,
        model: 'oauth-model',
        apiKey: 'dummy-key',
        timeoutMs: 2000
      })
      expect(okRes.ok).toBe(true)
      expect(okRes.rto).toBe(false)
      expect(typeof okRes.latencyMs).toBe('number')
      expect(okRes.latencyMs).toBeGreaterThanOrEqual(0)

      const gwTimeoutRes = await testProviderConnection({
        url: `http://127.0.0.1:${port}/gw-timeout`,
        model: 'oauth-model',
        apiKey: 'dummy-key',
        timeoutMs: 2000
      })
      expect(gwTimeoutRes.ok).toBe(false)
      expect(gwTimeoutRes.status).toBe(504)
      expect(gwTimeoutRes.rto).toBe(true)
      expect(typeof gwTimeoutRes.latencyMs).toBe('number')

      const rtoRes = await testProviderConnection({
        url: `http://127.0.0.1:${port}/hang`,
        model: 'oauth-model',
        apiKey: 'dummy-key',
        timeoutMs: 60
      })
      expect(rtoRes.ok).toBe(false)
      expect(rtoRes.rto).toBe(true)
      expect(rtoRes.error).toContain('RTO')
      expect(typeof rtoRes.latencyMs).toBe('number')
    } finally {
      server.closeAllConnections?.()
      await new Promise((resolve) => server.close(resolve))
    }
  })
})
