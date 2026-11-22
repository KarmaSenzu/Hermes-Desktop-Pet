/**
 * provider-service.js — Layanan pengujian koneksi dan konfigurasi provider LLM Hermes
 */

import http from 'node:http'
import https from 'node:https'
import { existsSync } from 'node:fs'
import { readFile, writeFile, mkdir, rename, copyFile, rm, readdir } from 'node:fs/promises'
import { dirname, basename, join } from 'node:path'
import { homedir } from 'node:os'
import { execFile } from 'node:child_process'
import YAML from 'yaml'
import { parseHttpUrl, isLocalRouterUrl } from './url-guard.js'
import { isSafeArg } from './cli-args.js'
import { resolveHermesCmd, resolveRouterApiKey } from './service-manager.js'
import { resolveHermesConfigPath } from './path-resolver.js'
import { applyProviderConfig, setEnvVar } from './hermes-config.js'

const DEPRECATED_GEMINI_RE = /^(gemini-(?:1\.0|1\.5|2\.0|2\.5)-flash(?:-(?:exp|latest))?)$/i

export function normalizeGeminiModel(baseUrl, modelName) {
  const m = String(modelName || '').trim()
  if (!m) return m
  if (!String(baseUrl || '').toLowerCase().includes('generativelanguage.googleapis.com')) {
    return m
  }
  const clean = m.replace(/^models\//i, '')
  if (DEPRECATED_GEMINI_RE.test(clean)) {
    return 'gemini-3.5-flash-lite'
  }
  return clean
}

export async function testProviderConnection({ url, model, apiKey, resolveApiKeyFor, timeoutMs = 15000 }) {
  const startedAt = Date.now()
  try {
    const target = String(url || '').trim()
    const modelName = String(model || '').trim()
    if (!target) return { ok: false, error: 'URL kosong.' }
    if (!modelName) return { ok: false, error: 'Model kosong.' }
    if (!parseHttpUrl(target)) {
      return { ok: false, error: 'URL target tidak valid. Harus menggunakan protokol http atau https.' }
    }

    const base = target.replace(/\/+$/, '')
    const hasApiPath = /\/(v\d+(?:beta\d*)?|openai)$/i.test(base)
    const endpoint = hasApiPath ? `${base}/chat/completions` : `${base}/v1/chat/completions`
    const u = new URL(endpoint)
    const mod = u.protocol === 'https:' ? https : http

    const body = JSON.stringify({
      model: normalizeGeminiModel(target, modelName),
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 5
    })

    let effectiveKey = ''
    try {
      effectiveKey = typeof resolveApiKeyFor === 'function' ? await resolveApiKeyFor(apiKey, target) : apiKey
    } catch (err) {
      return { ok: false, error: err?.message || 'Format kunci tidak valid' }
    }

    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
    if (effectiveKey) headers['Authorization'] = `Bearer ${effectiveKey}`

    const safeTimeout = Math.max(20, Number(timeoutMs) || 15000)

    return await new Promise((resolve) => {
      let settled = false
      const finish = (payload) => {
        if (!settled) {
          settled = true
          resolve(payload)
        }
      }

      const req = mod.request(u, { method: 'POST', headers, timeout: safeTimeout }, (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          const latencyMs = Date.now() - startedAt
          if (res.statusCode >= 200 && res.statusCode < 300) {
            finish({ ok: true, status: res.statusCode, reachable: true, rto: false, latencyMs })
          } else {
            let msg = `HTTP ${res.statusCode}`
            try {
              const j = JSON.parse(data)
              if (j.error?.message) msg = j.error.message
            } catch { /* ignore */ }
            const isRtoStatus = res.statusCode === 408 || res.statusCode === 504
            finish({
              ok: false,
              status: res.statusCode,
              rto: isRtoStatus,
              latencyMs,
              error: isRtoStatus && !/rto|time/i.test(msg) ? `RTO (${msg})` : msg
            })
          }
        })
      })
      req.on('error', (err) => {
        const latencyMs = Date.now() - startedAt
        const errMsg = err?.message || 'Tidak dapat terhubung'
        const isTimeoutErr = err?.code === 'ETIMEDOUT' || /timed?\s*out/i.test(errMsg)
        finish({
          ok: false,
          rto: isTimeoutErr,
          latencyMs,
          error: isTimeoutErr ? `RTO (Request Timed Out) — ${errMsg}` : errMsg
        })
      })
      req.on('timeout', () => {
        req.destroy()
        finish({
          ok: false,
          rto: true,
          latencyMs: Date.now() - startedAt,
          error: 'RTO (Request Timed Out) — model LLM tidak merespons tepat waktu'
        })
      })
      req.write(body)
      req.end()
    })
  } catch (err) {
    return { ok: false, rto: false, latencyMs: Date.now() - startedAt, error: err?.message || String(err) }
  }
}

export function runHermes(args, timeout = 30000, queryIndex = -1) {
  return new Promise((resolve, reject) => {
    for (let i = 0; i < args.length; i++) {
      const a = String(args[i])
      const isQuery = i === queryIndex
      if (a.startsWith('-') && a !== '--json') {
        return reject(new Error('Argumen diawali - tidak diizinkan'))
      }
      if (!isSafeArg(a, isQuery)) {
        return reject(new Error(`Argumen ke-${i} tidak valid untuk hermes CLI`))
      }
    }
    const hermesCmd = resolveHermesCmd()
    const needShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(hermesCmd)
    const cmd = needShell ? `"${hermesCmd}"` : hermesCmd
    const finalArgs = needShell ? args.map((a, i) => (i === queryIndex ? `"${a}"` : String(a))) : args.map(String)
    execFile(cmd, finalArgs, { timeout, shell: needShell, windowsHide: true, env: process.env }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.trim() || err.message))
      else resolve(stdout?.trim() || '')
    })
  })
}

export async function backupConfigFile(filePath, maxBackups = 5) {
  if (!existsSync(filePath)) return
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const dir = dirname(filePath)
  const base = basename(filePath)
  const backupPath = join(dir, `${base}.bak-${timestamp}`)

  try {
    await copyFile(filePath, backupPath)
    const files = await readdir(dir)
    const prefix = `${base}.bak-`
    const matching = files.filter((f) => f.startsWith(prefix)).sort()
    if (matching.length > maxBackups) {
      const toDelete = matching.slice(0, matching.length - maxBackups)
      for (const oldFile of toDelete) {
        try { await rm(join(dir, oldFile)) } catch { }
      }
    }
  } catch (err) {
    console.warn(`[backupConfigFile] Gagal backup ${base}:`, err?.message || err)
  }
}

export async function writeAtomicFile(filePath, content) {
  const dir = dirname(filePath)
  await mkdir(dir, { recursive: true })
  const tmpPath = join(dir, `${basename(filePath)}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`)
  await writeFile(tmpPath, content, 'utf8')
  try {
    await rename(tmpPath, filePath)
  } catch {
    await copyFile(tmpPath, filePath)
    await rm(tmpPath).catch(() => { })
  }
}

let configWriteChain = Promise.resolve()

/**
 * Mutex async berurutan agar penulisan ke ~/.hermes/config.yaml tidak saling balapan (race condition).
 */
export function withConfigWriteLock(fn) {
  const run = configWriteChain.then(() => fn(), () => fn())
  configWriteChain = run.catch(() => { })
  return run
}

/**
 * Memperbaiki config.yaml Hermes yang korup (misalnya kunci duplikat `stt.local` atau baris yatim seperti `jf_alpha`).
 * Mengembalikan teks aslinya bila sudah valid (sehingga komentar tetap terjaga).
 */
export async function repairHermesConfigYaml(cfgText, cfgPath = '') {
  const raw = String(cfgText ?? '')
  if (!raw.trim()) return ''

  const strictDoc = YAML.parseDocument(raw)
  if (!strictDoc.errors || strictDoc.errors.length === 0) {
    return raw
  }

  // Simpan salinan mentah file yang korup sebagai cadangan sebelum diperbaiki
  if (cfgPath && existsSync(cfgPath)) {
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
      await copyFile(cfgPath, `${cfgPath}.pre-repair-${stamp}.bak`)
    } catch { /* ignore */ }
  }

  // Tahap 1: Parse dengan uniqueKeys: false, atau buang baris yang memicu error syntax hingga 25 iterasi
  const lines = raw.split(/\r?\n/)
  for (let attempt = 0; attempt < 25; attempt++) {
    const candidateText = lines.join('\n')
    const laxDoc = YAML.parseDocument(candidateText, { uniqueKeys: false })
    if (!laxDoc.errors || laxDoc.errors.length === 0) {
      const obj = laxDoc.toJS()
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        return YAML.stringify(obj)
      }
      return ''
    }
    const errLine = laxDoc.errors[0]?.linePos?.[0]?.line
    if (typeof errLine === 'number' && errLine >= 1 && errLine <= lines.length) {
      lines.splice(errLine - 1, 1)
    } else {
      break
    }
  }

  // Tahap 2: Pulihkan dari cadangan config.yaml.bak* terbaru yang valid
  if (cfgPath) {
    try {
      const dir = dirname(cfgPath)
      const base = basename(cfgPath)
      const files = await readdir(dir)
      const backups = files
        .filter((f) => f.startsWith(`${base}.bak`) && !f.includes('corrupt'))
        .sort()
        .reverse()
      for (const bk of backups) {
        try {
          const bkRaw = await readFile(join(dir, bk), 'utf8')
          const bkDoc = YAML.parseDocument(bkRaw)
          if (!bkDoc.errors || bkDoc.errors.length === 0) {
            return bkRaw
          }
        } catch { /* try older backup */ }
      }
    } catch { /* ignore */ }
  }

  return ''
}

export async function updateHermesProviderConfig({ name, baseUrl, apiKey, model }) {
  return withConfigWriteLock(async () => {
    const cfgPath = resolveHermesConfigPath()
    let cfg = ''
    if (existsSync(cfgPath)) {
      cfg = await readFile(cfgPath, 'utf8')
    } else {
      await mkdir(dirname(cfgPath), { recursive: true })
    }

    cfg = await repairHermesConfigYaml(cfg, cfgPath)
    const doc = YAML.parseDocument(cfg || '')

    let effectiveModel = String(model || '').trim()
    if (!effectiveModel) {
      const fromDoc = doc.getIn(['model', 'default'])
      if (fromDoc) effectiveModel = String(fromDoc).trim()
      else if (process.env.HERMES_INFERENCE_MODEL) effectiveModel = process.env.HERMES_INFERENCE_MODEL.trim()
    }
    if (!effectiveModel) effectiveModel = 'default'

    let provUrl = String(baseUrl || '').trim()
    if (!provUrl) {
      const fromDoc = doc.getIn(['model', 'base_url'])
      if (fromDoc) provUrl = String(fromDoc).trim()
      else provUrl = 'http://localhost:20128/v1'
    }
    effectiveModel = normalizeGeminiModel(provUrl, effectiveModel)

    let provName = String(name || '').trim()
    const jsProviders = doc.toJS()?.providers || {}
    if (!provName) {
      const fromDoc = doc.getIn(['model', 'provider'])
      if (fromDoc && String(fromDoc).trim() !== 'custom') {
        provName = String(fromDoc).trim()
      } else {
        const targetNorm = provUrl.replace(/\/+$/, '').toLowerCase()
        const entries = Object.values(jsProviders).filter((p) => p && typeof p === 'object')
        const urlMatched = entries.filter(
          (p) => String(p.base_url || '').trim().replace(/\/+$/, '').toLowerCase() === targetNorm
        )
        const preferred =
          urlMatched.find((p) => p.api_key && p.api_key === process.env.OPENAI_API_KEY) ||
          urlMatched.find((p) => !isLocalRouterUrl(provUrl) && p.name !== '212') ||
          urlMatched[0] ||
          entries[0]
        provName = preferred?.name ? String(preferred.name).trim() : 'custom'
      }
    }

    let keyVal = String(apiKey || '').trim()
    const isRouter = isLocalRouterUrl(provUrl)

    if (!keyVal || keyVal === 'no-key-required') {
      if (isRouter) {
        try {
          const rKey = await resolveRouterApiKey()
          if (rKey?.ok && rKey?.key) {
            keyVal = rKey.key
            console.log(`[updateHermesProviderConfig] Otomatis menyematkan API Key 9Router (${rKey.name || 'Key'})`)
          }
        } catch (_) { }
      }
    }

    if (!keyVal || keyVal === 'no-key-required') {
      const safeName = provName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'custom'
      const curKey = doc.getIn(['providers', safeName, 'api_key'])
      const existingEnvUrl = String(doc.getIn(['model', 'base_url']) || '').trim().replace(/\/+$/, '').toLowerCase()
      const targetNormUrl = provUrl.trim().replace(/\/+$/, '').toLowerCase()

      if (curKey && String(curKey).trim() !== 'no-key-required') {
        keyVal = String(curKey).trim()
      } else if (
        process.env.OPENAI_API_KEY &&
        process.env.OPENAI_API_KEY !== 'no-key-required' &&
        (!existingEnvUrl || existingEnvUrl === targetNormUrl)
      ) {
        keyVal = process.env.OPENAI_API_KEY
      }
    }

    if (!keyVal) {
      keyVal = 'no-key-required'
    }

    const updatedCfg = applyProviderConfig(cfg, {
      name: provName,
      baseUrl: provUrl,
      apiKey: keyVal,
      model: effectiveModel
    })

    await backupConfigFile(cfgPath, 5)
    await writeAtomicFile(cfgPath, updatedCfg)

    const envPath = join(dirname(cfgPath), '.env')
    let env = ''
    if (existsSync(envPath)) {
      env = await readFile(envPath, 'utf8')
    }
    env = setEnvVar(env, 'OPENAI_BASE_URL', provUrl)
    env = setEnvVar(env, 'OPENAI_API_KEY', keyVal)
    env = setEnvVar(env, 'HERMES_INFERENCE_MODEL', effectiveModel)

    await writeAtomicFile(envPath, env)

    process.env.OPENAI_BASE_URL = provUrl
    process.env.OPENAI_API_KEY = keyVal
    process.env.HERMES_INFERENCE_MODEL = effectiveModel

    return true
  })
}

/**
 * Memperbarui konfigurasi TTS/STT di ~/.hermes/config.yaml secara atomik & bebas duplikasi kunci YAML.
 */
export async function updateHermesVoiceConfig({ voice, sttModel, sttLanguage, configPath } = {}) {
  return withConfigWriteLock(async () => {
    const cfgPath = configPath || resolveHermesConfigPath()
    let cfg = ''
    if (existsSync(cfgPath)) {
      cfg = await readFile(cfgPath, 'utf8')
    } else {
      await mkdir(dirname(cfgPath), { recursive: true })
    }

    cfg = await repairHermesConfigYaml(cfg, cfgPath)
    const doc = YAML.parseDocument(cfg || '')

    if (voice) {
      const ttsNode = doc.get('tts')
      if (!YAML.isMap(ttsNode)) doc.set('tts', doc.createNode({}))
      const edgeNode = doc.getIn(['tts', 'edge'])
      if (!YAML.isMap(edgeNode)) doc.setIn(['tts', 'edge'], doc.createNode({}))
      doc.setIn(['tts', 'edge', 'voice'], String(voice).trim())
    }

    if (sttModel || sttLanguage) {
      const sttNode = doc.get('stt')
      if (!YAML.isMap(sttNode)) doc.set('stt', doc.createNode({}))
      const localNode = doc.getIn(['stt', 'local'])
      if (!YAML.isMap(localNode)) doc.setIn(['stt', 'local'], doc.createNode({}))
      if (sttModel) doc.setIn(['stt', 'local', 'model'], String(sttModel).trim())
      if (sttLanguage) doc.setIn(['stt', 'local', 'language'], String(sttLanguage).trim())
    }

    await writeAtomicFile(cfgPath, doc.toString())
    return true
  })
}

export async function updateModelConfigYaml(modelName) {
  try {
    return await updateHermesProviderConfig({ model: modelName })
  } catch (err) {
    console.warn('[updateModelConfigYaml] failed:', err?.message || err)
    return false
  }
}

export function resolveLlmProvidersFilePath(homeOverride) {
  return join(homeOverride || homedir(), '.hermes-avatar', 'llm_providers.json')
}

function normBaseUrl(u) {
  return String(u || '').trim().replace(/\/+$/, '').toLowerCase()
}

function sanitizeProviderRecord(raw) {
  if (!raw || typeof raw !== 'object') return null
  const baseUrl = String(raw.baseUrl || raw.base_url || '').trim()
  const name = String(raw.name || 'Custom Provider').trim()
  if (!name && !baseUrl) return null
  const model = normalizeGeminiModel(baseUrl, String(raw.model || raw.default_model || '').trim())
  const modelsRaw = Array.isArray(raw.models) ? raw.models : []
  const models = Array.from(
    new Set(
      [model, ...modelsRaw.map((m) => normalizeGeminiModel(baseUrl, String(m || '').trim()))].filter(Boolean)
    )
  )
  return {
    id: String(raw.id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`),
    name: name || 'Provider AI',
    baseUrl,
    apiKey: String(raw.apiKey || ''),
    model,
    models,
    authType: String(raw.authType || '')
  }
}

/**
 * Membaca daftar provider LLM persisten dari ~/.hermes-avatar/llm_providers.json
 * serta mengimpor provider yang sudah ada di ~/.hermes/config.yaml secara otomatis (dengan API key terenkripsi).
 */
export async function loadSavedLlmProviders({ secretStore, providersFile, cfgPath } = {}) {
  const filePath = providersFile || resolveLlmProvidersFilePath()
  const hasJsonFile = existsSync(filePath)
  let activeId = null
  const providers = []

  if (hasJsonFile) {
    try {
      const parsed = JSON.parse(await readFile(filePath, 'utf8'))
      if (parsed && typeof parsed === 'object') {
        activeId = parsed.activeId || null
        const list = Array.isArray(parsed.providers) ? parsed.providers : []
        for (const item of list) {
          const clean = sanitizeProviderRecord(item)
          if (clean) providers.push(clean)
        }
      }
    } catch (err) {
      console.warn('[llm-providers] Gagal membaca llm_providers.json:', err?.message || err)
    }
  }

  let importedFromYaml = false
  const targetCfgPath = cfgPath !== undefined ? cfgPath : resolveHermesConfigPath()
  if (!hasJsonFile && targetCfgPath && existsSync(targetCfgPath)) {
    try {
      const rawCfg = await repairHermesConfigYaml(await readFile(targetCfgPath, 'utf8'), targetCfgPath)
      const js = YAML.parseDocument(rawCfg || '').toJS() || {}
      const yamlEntries = []
      if (Array.isArray(js.custom_providers)) {
        for (const cp of js.custom_providers) {
          if (cp && typeof cp === 'object') yamlEntries.push(cp)
        }
      }
      if (js.providers && typeof js.providers === 'object') {
        for (const p of Object.values(js.providers)) {
          if (p && typeof p === 'object') yamlEntries.push(p)
        }
      }

      for (const entry of yamlEntries) {
        const name = String(entry.name || '').trim()
        const baseUrl = String(entry.base_url || entry.baseUrl || '').trim()
        if (!baseUrl) continue
        const model = normalizeGeminiModel(baseUrl, String(entry.model || entry.default_model || '').trim())
        const existing = providers.find(
          (x) => normBaseUrl(x.baseUrl) === normBaseUrl(baseUrl) && x.name.toLowerCase() === (name || x.name).toLowerCase()
        )

        let sealedKey = ''
        const rawKey = String(entry.api_key || '').trim()
        if (rawKey && rawKey !== 'no-key-required') {
          if (rawKey.startsWith('v2:')) {
            sealedKey = rawKey
          } else if (secretStore && typeof secretStore.seal === 'function') {
            try {
              sealedKey = secretStore.seal(rawKey, baseUrl)
            } catch {
              sealedKey = ''
            }
          }
        }

        if (existing) {
          if (!existing.apiKey && sealedKey) {
            existing.apiKey = sealedKey
            importedFromYaml = true
          }
          if (model && !existing.models.includes(model)) {
            existing.models.push(model)
            importedFromYaml = true
          }
        } else {
          const created = sanitizeProviderRecord({
            name: name || (isLocalRouterUrl(baseUrl) ? '9Router Lokal' : 'Custom Provider'),
            baseUrl,
            apiKey: sealedKey,
            model: model || 'default',
            authType: isLocalRouterUrl(baseUrl) ? '9router' : (sealedKey ? 'apikey' : '')
          })
          if (created) {
            providers.push(created)
            importedFromYaml = true
          }
        }
      }

      const activeYamlUrl = normBaseUrl(js?.model?.base_url)
      const activeYamlModel = normalizeGeminiModel(js?.model?.base_url || '', String(js?.model?.default || '').trim())
      if (!activeId && activeYamlUrl) {
        const matchedActive = providers.find(
          (x) => normBaseUrl(x.baseUrl) === activeYamlUrl && (!activeYamlModel || x.model === activeYamlModel || x.models.includes(activeYamlModel))
        ) || providers.find((x) => normBaseUrl(x.baseUrl) === activeYamlUrl)
        if (matchedActive) {
          activeId = matchedActive.id
          importedFromYaml = true
        }
      }
    } catch (err) {
      console.warn('[llm-providers] Info impor dari config.yaml:', err?.message || err)
    }
  }

  if (importedFromYaml && providers.length > 0) {
    await saveSavedLlmProviders({ activeId, providers, providersFile: filePath }).catch(() => { })
  }

  return { ok: true, path: filePath, activeId, providers }
}

/**
 * Menyimpan daftar provider LLM ke ~/.hermes-avatar/llm_providers.json secara atomik.
 */
export async function saveSavedLlmProviders({ activeId = null, providers = [], providersFile } = {}) {
  const filePath = providersFile || resolveLlmProvidersFilePath()
  const cleanProviders = (Array.isArray(providers) ? providers : [])
    .map(sanitizeProviderRecord)
    .filter(Boolean)

  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    activeId: activeId || (cleanProviders[0]?.id || null),
    providers: cleanProviders
  }

  await writeAtomicFile(filePath, JSON.stringify(payload, null, 2))
  return { ok: true, path: filePath, activeId: payload.activeId, providers: cleanProviders }
}

/**
 * Memperbarui atau menambahkan satu provider ke ~/.hermes-avatar/llm_providers.json saat diaktifkan.
 */
export async function upsertSavedLlmProviderOnDisk(entry, { secretStore, providersFile, cfgPath, setActive = true } = {}) {
  const filePath = providersFile || resolveLlmProvidersFilePath()
  const loaded = await loadSavedLlmProviders({ secretStore, providersFile: filePath, cfgPath })
  const list = [...loaded.providers]
  const cleanEntry = sanitizeProviderRecord(entry)
  if (!cleanEntry) return loaded

  const idx = list.findIndex(
    (x) => (cleanEntry.id && x.id === cleanEntry.id) ||
      (normBaseUrl(x.baseUrl) === normBaseUrl(cleanEntry.baseUrl) && x.name.toLowerCase() === cleanEntry.name.toLowerCase())
  )

  let targetId = cleanEntry.id
  if (idx >= 0) {
    const prev = list[idx]
    targetId = prev.id
    list[idx] = {
      ...prev,
      name: cleanEntry.name || prev.name,
      baseUrl: cleanEntry.baseUrl || prev.baseUrl,
      apiKey: cleanEntry.apiKey || prev.apiKey || '',
      model: cleanEntry.model || prev.model,
      models: Array.from(new Set([cleanEntry.model, ...(prev.models || []), ...(cleanEntry.models || [])].filter(Boolean))),
      authType: cleanEntry.authType || prev.authType || ''
    }
  } else {
    list.push(cleanEntry)
  }

  return await saveSavedLlmProviders({
    activeId: setActive ? targetId : loaded.activeId,
    providers: list,
    providersFile: filePath
  })
}

/**
 * Menormalkan daftar model mentah dari endpoint `/models` apa pun menjadi array ID unik.
 * Mendukung format OpenAI (`{data:[{id}]}`), array string, Gemini (`{models:[{name}]}`),
 * serta objek tunggal. Mengembalikan `[]` untuk struktur yang tidak dikenal.
 */
export function extractModelIds(data) {
  let rawList = []
  if (Array.isArray(data)) {
    rawList = data
  } else if (data && typeof data === 'object') {
    if (Array.isArray(data.data)) rawList = data.data
    else if (Array.isArray(data.models)) rawList = data.models
    else if (Array.isArray(data.results)) rawList = data.results
  }
  const seen = new Set()
  const out = []
  for (const m of rawList) {
    let id = ''
    if (typeof m === 'string') id = m
    else if (m && typeof m === 'object') id = m.id || m.name || m.model || ''
    id = String(id || '').trim().replace(/^models\//i, '')
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function isGeminiEndpoint(url) {
  return String(url || '').toLowerCase().includes('generativelanguage.googleapis.com')
}

/** Derivasikan URL native `:listModels` Gemini dari base URL OpenAI-compat. */
export function deriveGeminiNativeModelsUrl(baseUrl) {
  try {
    const u = new URL(String(baseUrl || '').trim())
    // Buang segmen /openai (OpenAI-compat) agar menjadi /v1beta/models atau /v1/models.
    let path = u.pathname.replace(/\/+$/, '')
    path = path.replace(/\/openai$/i, '')
    let version = 'v1beta'
    const m = path.match(/\/v1(?:beta\d*)?/i)
    if (m) version = m[0].replace(/^\//, '')
    return `${u.origin}/${version}/models`
  } catch {
    return ''
  }
}

async function fetchJsonWithTimeout(url, headers, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, { headers, signal: controller.signal })
    if (!resp.ok) return { ok: false, status: resp.status, error: `HTTP ${resp.status} ${resp.statusText}` }
    let data
    try {
      data = await resp.json()
    } catch {
      return { ok: false, error: 'Respons endpoint bukan JSON yang valid' }
    }
    return { ok: true, data }
  } catch (err) {
    const msg = err?.name === 'AbortError' ? 'Timeout mengambil daftar model' : (err?.message || String(err))
    return { ok: false, error: msg }
  } finally {
    clearTimeout(timeout)
  }
}

/** Terapkan filter & urutan prioritas khusus Gemini tanpa merusak daftar provider lain. */
function refineGeminiModels(models) {
  const priority = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash']
  return models
    .filter((m) => (
      !DEPRECATED_GEMINI_RE.test(m) &&
      !/(embedding|aqa|lyria|tts|transcribe|live|image|robotics|nano-banana|deep-research|antigravity)/i.test(m)
    ))
    .sort((a, b) => {
      const ia = priority.indexOf(a)
      const ib = priority.indexOf(b)
      if (ia !== -1 && ib !== -1) return ia - ib
      if (ia !== -1) return -1
      if (ib !== -1) return 1
      return a.localeCompare(b)
    })
}

export async function fetchEndpointModels({ baseUrl, apiKey, resolveApiKeyFor, timeoutMs = 3200 }) {
  try {
    const targetUrl = String(baseUrl || '').trim()
    if (!targetUrl) return { ok: false, models: [], error: 'Base URL kosong' }
    if (!parseHttpUrl(targetUrl)) {
      return { ok: false, models: [], error: 'URL endpoint tidak valid. Harus menggunakan protokol http atau https.' }
    }

    let effectiveKey = ''
    try {
      effectiveKey = typeof resolveApiKeyFor === 'function' ? await resolveApiKeyFor(apiKey, targetUrl) : apiKey
    } catch (err) {
      // Kunci tersimpan tidak valid/legacy untuk endpoint ini → tetap coba tanpa key (mis. 9Router tak butuh key untuk /models).
      effectiveKey = ''
    }

    const url = targetUrl.replace(/\/+$/, '') + '/models'
    const headers = { Accept: 'application/json' }
    if (effectiveKey && effectiveKey !== 'no-key-required') {
      headers['Authorization'] = `Bearer ${effectiveKey}`
    }

    let resp = await fetchJsonWithTimeout(url, headers, timeoutMs)

    // Gemini: endpoint OpenAI-compat sering tidak punya /models → fallback ke native :listModels.
    if (!resp.ok && isGeminiEndpoint(targetUrl) && effectiveKey && effectiveKey !== 'no-key-required') {
      const nativeUrl = deriveGeminiNativeModelsUrl(targetUrl)
      if (nativeUrl) {
        const nativeResp = await fetchJsonWithTimeout(
          `${nativeUrl}?key=${encodeURIComponent(effectiveKey)}`,
          { Accept: 'application/json' },
          timeoutMs
        )
        if (nativeResp.ok) resp = nativeResp
      }
    }

    if (!resp.ok) {
      return { ok: false, models: [], error: resp.error || 'Gagal mengambil daftar model' }
    }

    let models = extractModelIds(resp.data)
    if (isGeminiEndpoint(targetUrl)) {
      models = refineGeminiModels(models)
    }
    return { ok: true, models }
  } catch (err) {
    const msg = err?.name === 'AbortError' ? 'Timeout mengambil daftar model' : (err?.message || String(err))
    return { ok: false, models: [], error: msg }
  }
}

/**
 * Mengambil daftar model dari beberapa provider sekaligus secara paralel.
 * Dipakai UI agar model dari SEMUA provider tersimpan (mis. 9Router) tetap muncul
 * meski provider lain (mis. Google) sedang aktif.
 * @returns {Promise<Array<{id:string,name:string,baseUrl:string,ok:boolean,models:string[],error?:string}>>}
 */
export async function fetchModelsForProviders({ providers = [], resolveApiKeyFor } = {}) {
  const list = (Array.isArray(providers) ? providers : []).filter((p) => p && String(p.baseUrl || '').trim())
  const results = await Promise.all(list.map(async (p) => {
    try {
      const res = await fetchEndpointModels({
        baseUrl: p.baseUrl,
        apiKey: p.apiKey || '',
        resolveApiKeyFor
      })
      return {
        id: String(p.id || ''),
        name: String(p.name || 'Provider AI'),
        baseUrl: String(p.baseUrl || ''),
        ok: Boolean(res.ok),
        models: Array.isArray(res.models) ? res.models : [],
        error: res.error
      }
    } catch (err) {
      return {
        id: String(p.id || ''),
        name: String(p.name || 'Provider AI'),
        baseUrl: String(p.baseUrl || ''),
        ok: false,
        models: [],
        error: err?.message || String(err)
      }
    }
  }))
  return results
}
