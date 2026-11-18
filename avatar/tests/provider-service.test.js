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
})
