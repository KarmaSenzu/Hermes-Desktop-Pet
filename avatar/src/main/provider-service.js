/**
 * provider-service.js — Layanan pengujian koneksi dan konfigurasi provider LLM Hermes
 */

import http from 'node:http'
import https from 'node:https'
import { existsSync } from 'node:fs'
import { readFile, writeFile, mkdir, rename, copyFile, rm, readdir } from 'node:fs/promises'
import { dirname, basename, join } from 'node:path'
import { execFile } from 'node:child_process'
import YAML from 'yaml'
import { parseHttpUrl, isLocalRouterUrl } from './url-guard.js'
import { isSafeArg } from './cli-args.js'
import { resolveHermesCmd, resolveRouterApiKey } from './service-manager.js'
import { resolveHermesConfigPath } from './path-resolver.js'
import { applyProviderConfig, setEnvVar } from './hermes-config.js'

export async function testProviderConnection({ url, model, apiKey, resolveApiKeyFor }) {
  try {
    const target = String(url || '').trim()
    const modelName = String(model || '').trim()
    if (!target) return { ok: false, error: 'URL kosong.' }
    if (!modelName) return { ok: false, error: 'Model kosong.' }
    if (!parseHttpUrl(target)) {
      return { ok: false, error: 'URL target tidak valid. Harus menggunakan protokol http atau https.' }
    }

    const base = target.replace(/\/+$/, '')
    const endpoint = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`
    const u = new URL(endpoint)
    const mod = u.protocol === 'https:' ? https : http

    const body = JSON.stringify({
      model: modelName,
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

    return await new Promise((resolve) => {
      const req = mod.request(u, { method: 'POST', headers, timeout: 15000 }, (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true, status: res.statusCode, reachable: true })
          } else {
            let msg = `HTTP ${res.statusCode}`
            try {
              const j = JSON.parse(data)
              if (j.error?.message) msg = j.error.message
            } catch { /* ignore */ }
            resolve({ ok: false, status: res.statusCode, error: msg })
          }
        })
      })
      req.on('error', (err) => resolve({ ok: false, error: err?.message || 'Tidak dapat terhubung' }))
      req.on('timeout', () => {
        req.destroy()
        resolve({ ok: false, error: 'Timeout' })
      })
      req.write(body)
      req.end()
    })
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
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
    execFile(cmd, finalArgs, { timeout, shell: needShell, env: process.env }, (err, stdout, stderr) => {
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
        try { await rm(join(dir, oldFile)) } catch {}
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
    await rm(tmpPath).catch(() => {})
  }
}

export async function updateHermesProviderConfig({ name, baseUrl, apiKey, model }) {
  const cfgPath = resolveHermesConfigPath()
  let cfg = ''
  if (existsSync(cfgPath)) {
    cfg = await readFile(cfgPath, 'utf8')
  } else {
    await mkdir(dirname(cfgPath), { recursive: true })
  }

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

  let provName = String(name || '').trim()
  if (!provName) {
    const fromDoc = doc.getIn(['model', 'provider'])
    if (fromDoc && String(fromDoc).trim() !== 'custom') {
      provName = String(fromDoc).trim()
    } else {
      const jsProviders = doc.toJS()?.providers || {}
      const firstSaved = Object.values(jsProviders)[0]?.name
      provName = firstSaved ? String(firstSaved).trim() : 'custom'
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
      } catch (_) {}
    }
  }

  if (!keyVal || keyVal === 'no-key-required') {
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'no-key-required') {
      keyVal = process.env.OPENAI_API_KEY
    } else {
      const safeName = provName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'custom'
      const curKey = doc.getIn(['providers', safeName, 'api_key'])
      if (curKey && String(curKey).trim() !== 'no-key-required') {
        keyVal = String(curKey).trim()
      }
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
}

export async function updateModelConfigYaml(modelName) {
  try {
    return await updateHermesProviderConfig({ model: modelName })
  } catch (err) {
    console.warn('[updateModelConfigYaml] failed:', err?.message || err)
    return false
  }
}

export async function fetchEndpointModels({ baseUrl, apiKey, resolveApiKeyFor }) {
  try {
    const targetUrl = String(baseUrl || '').trim()
    if (!targetUrl) return { ok: false, error: 'Base URL kosong' }
    if (!parseHttpUrl(targetUrl)) {
      return { ok: false, error: 'URL endpoint tidak valid. Harus menggunakan protokol http atau https.' }
    }

    let effectiveKey = ''
    try {
      effectiveKey = typeof resolveApiKeyFor === 'function' ? await resolveApiKeyFor(apiKey, targetUrl) : apiKey
    } catch (err) {
      return { ok: false, error: err?.message || 'Format kunci tidak valid' }
    }

    const url = targetUrl.replace(/\/+$/, '') + '/models'
    const headers = { Accept: 'application/json' }
    if (effectiveKey && effectiveKey !== 'no-key-required') {
      headers['Authorization'] = `Bearer ${effectiveKey}`
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3200)
    const resp = await fetch(url, { headers, signal: controller.signal })
    clearTimeout(timeout)

    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status} ${resp.statusText}` }
    }
    const data = await resp.json()
    const rawList = Array.isArray(data) ? data : (data?.data || [])
    const models = rawList
      .map((m) => (typeof m === 'string' ? m : (m.id || m.name)))
      .filter(Boolean)
    return { ok: true, models }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}
