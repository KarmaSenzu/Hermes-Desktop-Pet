/**
 * oauth-service.js — Layanan OAuth2 PKCE resmi (OpenRouter) dan pemantau kuota provider LLM
 */

import http from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { randomBytes, createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import YAML from 'yaml'
import { parseHttpUrl, isLocalRouterUrl } from './url-guard.js'
import { resolveHermesConfigPath, resolveRouterAccountsQuota } from './path-resolver.js'

/**
 * Membuat pasangan PKCE (Proof Key for Code Exchange) sesuai RFC 7636.
 */
export function generatePkcePair() {
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256'
  }
}

/**
 * Membangun URL otorisasi OpenRouter OAuth PKCE resmi dengan validasi loopback.
 */
export function buildOpenRouterAuthUrl({ callbackUrl, codeChallenge }) {
  let u
  try {
    u = new URL(String(callbackUrl || ''))
  } catch {
    throw new Error('Callback URL OAuth tidak valid')
  }
  if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || !u.port) {
    throw new Error('Callback URL OAuth wajib memakai http://127.0.0.1:<port>')
  }
  if (!codeChallenge || typeof codeChallenge !== 'string' || !/^[A-Za-z0-9_-]{20,}$/.test(codeChallenge)) {
    throw new Error('Code challenge PKCE tidak valid')
  }

  return (
    `https://openrouter.ai/auth?callback_url=${encodeURIComponent(u.toString())}` +
    `&code_challenge=${encodeURIComponent(codeChallenge)}` +
    `&code_challenge_method=S256`
  )
}

function readHeaderCaseInsensitive(headers, name) {
  if (!headers) return null
  if (typeof headers.get === 'function') {
    return headers.get(name)
  }
  const target = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (String(k).toLowerCase() === target) return v
  }
  return null
}

function toIntOrNull(val) {
  if (val === null || val === undefined || val === '') return null
  const num = Number(val)
  return Number.isFinite(num) && num >= 0 ? Math.trunc(num) : null
}

/**
 * Mengekstrak informasi sisa kuota dari header HTTP rate-limit standar.
 */
export function parseRateLimitHeaders(headers) {
  const reqLimit = toIntOrNull(readHeaderCaseInsensitive(headers, 'x-ratelimit-limit-requests'))
  const reqRemaining = toIntOrNull(readHeaderCaseInsensitive(headers, 'x-ratelimit-remaining-requests'))
  const tokLimit = toIntOrNull(readHeaderCaseInsensitive(headers, 'x-ratelimit-limit-tokens'))
  const tokRemaining = toIntOrNull(readHeaderCaseInsensitive(headers, 'x-ratelimit-remaining-tokens'))
  const rawReset = readHeaderCaseInsensitive(headers, 'x-ratelimit-reset-requests')
  const reset = rawReset != null && String(rawReset).trim() ? String(rawReset).trim() : null

  return {
    reqLimit,
    reqRemaining,
    tokLimit,
    tokRemaining,
    reset
  }
}

function renderOAuthCallbackHtml(success, detailMsg) {
  const title = success ? 'Login OAuth Berhasil!' : 'Login OAuth Gagal'
  const color = success ? '#10b981' : '#ef4444'
  const icon = success ? '✅' : '❌'
  const safeMsg = String(detailMsg || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>${title} — Hermes Desktop Pet</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #18181b; color: #f4f4f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .box { max-width: 440px; background: #27272a; border: 1px solid ${color}; border-radius: 14px; padding: 28px; text-align: center; box-shadow: 0 12px 32px rgba(0,0,0,0.4); }
    .icon { font-size: 40px; margin-bottom: 12px; }
    h1 { font-size: 20px; margin: 0 0 8px; color: ${color}; }
    p { font-size: 14px; color: #d4d4d8; line-height: 1.5; margin: 0; }
  </style>
</head>
<body>
  <div class="box">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${safeMsg}</p>
  </div>
</body>
</html>`
}

/**
 * Menjalankan alur OAuth2 PKCE resmi OpenRouter melalui browser lokal dan callback loopback.
 */
export async function startOpenRouterOAuthFlow({ shell, secretStore, timeoutMs = 180000 }) {
  if (!shell || typeof shell.openExternal !== 'function') {
    return { ok: false, error: 'Shell browser tidak tersedia' }
  }
  if (!secretStore || typeof secretStore.seal !== 'function') {
    return { ok: false, error: 'SecretStore enkripsi tidak tersedia' }
  }

  const { codeVerifier, codeChallenge } = generatePkcePair()

  return new Promise((resolve) => {
    let settled = false
    let timeoutHandle = null
    const server = http.createServer()

    const cleanupAndResolve = (result) => {
      if (settled) return
      settled = true
      if (timeoutHandle) clearTimeout(timeoutHandle)
      try {
        server.closeAllConnections?.()
        server.close()
      } catch {
        // ignore close error
      }
      resolve(result)
    }

    server.on('request', async (req, res) => {
      try {
        const reqUrl = new URL(req.url || '/', 'http://127.0.0.1')
        if (reqUrl.pathname !== '/oauth/callback') {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('Not Found')
          return
        }

        const errParam = reqUrl.searchParams.get('error')
        const code = reqUrl.searchParams.get('code')

        if (errParam || !code) {
          const msg = errParam ? `Otorisasi ditolak atau dibatalkan (${errParam}).` : 'Kode otorisasi OAuth tidak ditemukan.'
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(renderOAuthCallbackHtml(false, msg))
          cleanupAndResolve({ ok: false, error: msg })
          return
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(
          renderOAuthCallbackHtml(
            true,
            'Akun OpenRouter Anda telah terhubung ke Hermes Desktop Pet. Anda dapat menutup tab ini dan kembali ke aplikasi.'
          )
        )

        const tokenResp = await fetch('https://openrouter.ai/api/v1/auth/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            code_verifier: codeVerifier,
            code_challenge_method: 'S256'
          })
        })

        if (!tokenResp.ok) {
          const errText = await tokenResp.text().catch(() => '')
          cleanupAndResolve({
            ok: false,
            error: `Gagal menukar kode OAuth OpenRouter: HTTP ${tokenResp.status} ${errText}`.trim()
          })
          return
        }

        const tokenData = await tokenResp.json()
        const plainKey = String(tokenData?.key || '').trim()
        if (!plainKey) {
          cleanupAndResolve({ ok: false, error: 'Respons OpenRouter tidak menyertakan API Key.' })
          return
        }

        const sealedKey = secretStore.seal(plainKey, 'https://openrouter.ai/api/v1')
        cleanupAndResolve({
          ok: true,
          provider: {
            name: 'OpenRouter (OAuth Resmi)',
            baseUrl: 'https://openrouter.ai/api/v1',
            apiKey: sealedKey,
            model: 'meta-llama/llama-3.3-70b-instruct:free',
            authType: 'oauth'
          }
        })
      } catch (err) {
        cleanupAndResolve({ ok: false, error: err?.message || String(err) })
      }
    })

    server.on('error', (err) => {
      cleanupAndResolve({ ok: false, error: `Server callback OAuth gagal: ${err?.message || err}` })
    })

    server.listen(0, '127.0.0.1', () => {
      try {
        const addr = server.address()
        const port = typeof addr === 'object' && addr ? addr.port : 0
        if (!port) {
          cleanupAndResolve({ ok: false, error: 'Gagal mendapatkan port callback lokal OAuth' })
          return
        }
        const callbackUrl = `http://127.0.0.1:${port}/oauth/callback`
        const authUrl = buildOpenRouterAuthUrl({ callbackUrl, codeChallenge })

        timeoutHandle = setTimeout(() => {
          cleanupAndResolve({ ok: false, error: 'Waktu tunggu login OAuth habis (timeout). Silakan coba lagi.' })
        }, timeoutMs)

        shell.openExternal(authUrl).catch((err) => {
          cleanupAndResolve({ ok: false, error: `Gagal membuka browser untuk OAuth: ${err?.message || err}` })
        })
      } catch (err) {
        cleanupAndResolve({ ok: false, error: err?.message || String(err) })
      }
    })
  })
}

function readHermesConfigEndpoint() {
  try {
    const cfgPath = resolveHermesConfigPath()
    if (!cfgPath || !existsSync(cfgPath)) return null
    const raw = readFileSync(cfgPath, 'utf8')
    const parsed = YAML.parse(raw) || {}
    const m = parsed.model && typeof parsed.model === 'object' ? parsed.model : {}
    const targetUrl = String(m.base_url || '').trim()
    const configuredModel = String(m.default || '').trim() || null
    const configuredProvider = String(m.provider || '').trim() || null
    let configuredKey = String(m.api_key || '').trim()
    if (!configuredKey && configuredProvider && parsed.providers?.[configuredProvider]?.api_key) {
      configuredKey = String(parsed.providers[configuredProvider].api_key).trim()
    }
    if (!configuredKey && targetUrl) {
      const norm = targetUrl.replace(/\/+$/, '').toLowerCase()
      const provList = parsed.providers && typeof parsed.providers === 'object' ? Object.values(parsed.providers) : []
      const customList = Array.isArray(parsed.custom_providers) ? parsed.custom_providers : []
      const matchedProv = [...provList, ...customList].find(
        (p) => p && typeof p === 'object' && String(p.base_url || '').trim().replace(/\/+$/, '').toLowerCase() === norm && p.api_key && p.api_key !== 'no-key-required'
      )
      if (matchedProv) {
        configuredKey = String(matchedProv.api_key).trim()
      }
    }
    return {
      baseUrl: targetUrl,
      apiKey: configuredKey,
      configuredModel,
      configuredProvider
    }
  } catch {
    return null
  }
}

function buildDefaultModelGroups() {
  return [
    {
      id: 'gemini',
      title: 'Gemini Models',
      tooltip: 'Kuota mingguan & 5-jam model Google Gemini',
      rows: [
        { label: 'Weekly Limit Remaining', subtext: 'Belum ada pemakaian pada jendela mingguan ini.', remainingPct: 100 },
        { label: 'Five Hour Limit Remaining', subtext: 'Kuota 5-jam penuh (100% siap digunakan).', remainingPct: 100 }
      ]
    },
    {
      id: 'claude-gpt',
      title: 'Claude and GPT models',
      tooltip: 'Kuota mingguan & 5-jam model Claude dan GPT',
      rows: [
        { label: 'Weekly Limit Remaining', subtext: 'Belum ada pemakaian pada jendela mingguan ini.', remainingPct: 100 },
        { label: 'Five Hour Limit Remaining', subtext: 'Kuota 5-jam penuh (100% siap digunakan).', remainingPct: 100 }
      ]
    },
    {
      id: 'deepseek-glm',
      title: 'DeepSeek & GLM Models',
      tooltip: 'Kuota model DeepSeek & GLM (Codebuddy / OpenRouter)',
      rows: [
        { label: 'Weekly Limit Remaining', subtext: 'Belum ada pemakaian pada jendela mingguan ini.', remainingPct: 100 },
        { label: 'Five Hour Limit Remaining', subtext: 'Kuota 5-jam penuh (100% siap digunakan).', remainingPct: 100 }
      ]
    }
  ]
}

function findPrimaryQuotaAccount(accounts, configuredModel, configuredProvider) {
  const activeWithQuotas = (accounts || []).filter((a) => Array.isArray(a.quotas) && a.quotas.length > 0)
  if (activeWithQuotas.length === 0) return null

  const hint = `${configuredProvider || ''} ${configuredModel || ''}`.toLowerCase()
  const matched = activeWithQuotas.find((a) => {
    const p = String(a.providerKey || '').toLowerCase()
    if (!p || !hint) return false
    if (p.includes('codebuddy') && (hint.includes('cbcn') || hint.includes('codebuddy') || hint.includes('deepseek'))) return true
    if (p === 'kiro' && (hint.includes('kr/') || hint.includes('kiro') || hint.includes('claude'))) return true
    if (hint.includes(p)) return true
    return false
  })

  return matched || activeWithQuotas.find((a) => a.isActive !== false) || activeWithQuotas[0]
}

/**
 * Membaca pemakaian request & token aktual dari state.db lokal Hermes (tabel session_model_usage)
 * agar kuota provider yang tidak mengirim header rate-limit (seperti Google AI Studio) tetap terpantau.
 */
export async function readHermesLocalUsage(targetUrl) {
  const empty = { dailyCalls: 0, dailyTokens: 0, totalCalls: 0, totalTokens: 0, byModel: [] }
  try {
    const cfgPath = resolveHermesConfigPath()
    const home = homedir()
    const candidates = [
      cfgPath ? join(dirname(cfgPath), 'state.db') : null,
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'hermes', 'state.db') : null,
      join(home, 'AppData', 'Local', 'hermes', 'state.db'),
      join(home, '.hermes', 'state.db')
    ].filter(Boolean)

    const dbPath = candidates.find((p) => existsSync(p))
    if (!dbPath) return empty

    const normTarget = String(targetUrl || '').trim().replace(/\/+$/, '').toLowerCase()
    const isGeminiTarget = normTarget.includes('generativelanguage.googleapis.com')
    const cutoff24h = (Date.now() / 1000) - 86400

    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
      const rows = db.prepare(
        'SELECT model, billing_base_url, api_call_count, input_tokens, output_tokens, last_seen FROM session_model_usage'
      ).all()

      let dailyCalls = 0
      let dailyTokens = 0
      let totalCalls = 0
      let totalTokens = 0
      const modelMap = new Map()

      for (const r of rows) {
        const rowUrl = String(r.billing_base_url || '').trim().replace(/\/+$/, '').toLowerCase()
        const matches = (normTarget && rowUrl === normTarget) ||
          (isGeminiTarget && rowUrl.includes('generativelanguage.googleapis.com'))
        if (!matches) continue

        const calls = Number(r.api_call_count) || 0
        const tokens = (Number(r.input_tokens) || 0) + (Number(r.output_tokens) || 0)
        const lastSeen = Number(r.last_seen) || 0

        totalCalls += calls
        totalTokens += tokens
        if (lastSeen >= cutoff24h) {
          dailyCalls += calls
          dailyTokens += tokens
        }

        const modName = String(r.model || '').trim() || 'unknown'
        const prev = modelMap.get(modName) || { model: modName, calls: 0, tokens: 0, dailyCalls: 0, dailyTokens: 0, lastSeen: 0 }
        prev.calls += calls
        prev.tokens += tokens
        if (lastSeen >= cutoff24h) {
          prev.dailyCalls += calls
          prev.dailyTokens += tokens
        }
        if (lastSeen > prev.lastSeen) prev.lastSeen = lastSeen
        modelMap.set(modName, prev)
      }

      const byModel = Array.from(modelMap.values()).sort((a, b) => b.lastSeen - a.lastSeen)
      return { dailyCalls, dailyTokens, totalCalls, totalTokens, byModel }
    } finally {
      try { db.close() } catch { /* ignore */ }
    }
  } catch {
    return empty
  }
}

/**
 * Memeriksa status paket, sisa kuota, dan kepatuhan ToS dari provider LLM aktif.
 */
export async function checkProviderQuota({
  baseUrl,
  apiKey,
  force = false,
  fetchImpl = globalThis.fetch,
  resolveApiKeyFor,
  getConfiguredProvider = readHermesConfigEndpoint,
  getRouterQuota = resolveRouterAccountsQuota
} = {}) {
  try {
    let targetUrl = String(baseUrl || '').trim()
    let rawKey = apiKey
    let configuredModel = null
    let configuredProvider = null
    let keyFromConfigPlain = false

    const cfgInfo = typeof getConfiguredProvider === 'function' ? getConfiguredProvider() : null
    if (cfgInfo) {
      configuredModel = cfgInfo.configuredModel || null
      configuredProvider = cfgInfo.configuredProvider || null
      if (!targetUrl) {
        targetUrl = String(cfgInfo.baseUrl || '').trim()
        if (!rawKey && cfgInfo.apiKey) {
          rawKey = cfgInfo.apiKey
          keyFromConfigPlain = !String(cfgInfo.apiKey).startsWith('v2:')
        }
      }
    }

    if (!targetUrl) {
      return {
        ok: false,
        unconfigured: true,
        error: 'Belum ada provider AI yang dikonfigurasi.'
      }
    }

    const parsed = parseHttpUrl(targetUrl)
    if (!parsed) {
      return { ok: false, error: 'URL endpoint tidak valid. Harus menggunakan protokol http atau https.' }
    }

    let effectiveKey = ''
    try {
      if (keyFromConfigPlain) {
        effectiveKey = String(rawKey || '')
      } else {
        effectiveKey = typeof resolveApiKeyFor === 'function'
          ? await resolveApiKeyFor(rawKey, targetUrl)
          : String(rawKey || '')
      }
    } catch (err) {
      return { ok: false, error: err?.message || 'Format kunci tidak valid' }
    }

    const routerBaseUrl = isLocalRouterUrl(targetUrl) ? parsed.origin : 'http://127.0.0.1:20128'
    const routerQuota = (typeof getRouterQuota === 'function'
      ? await getRouterQuota({ force, routerBaseUrl, fetchImpl }).catch(() => null)
      : null) || {
      accounts: [],
      modelGroups: []
    }
    const accounts = [...(routerQuota.accounts || [])]
    const modelGroups = routerQuota.modelGroups?.length ? routerQuota.modelGroups.map((g) => ({
      ...g,
      rows: g.rows.map((r) => ({ ...r }))
    })) : buildDefaultModelGroups()

    const host = parsed.hostname.toLowerCase()
    const base = targetUrl.replace(/\/+$/, '')

    // Kasus A: OpenRouter — endpoint /api/v1/key resmi
    if (host === 'openrouter.ai' || host.endsWith('.openrouter.ai')) {
      if (!effectiveKey || effectiveKey === 'no-key-required') {
        return {
          ok: false,
          providerType: 'openrouter',
          accounts,
          modelGroups,
          error: 'Kunci/Token OpenRouter belum tersedia. Gunakan tombol Login 1-Klik OpenRouter.'
        }
      }

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      try {
        const resp = await fetchImpl('https://openrouter.ai/api/v1/key', {
          headers: {
            Authorization: `Bearer ${effectiveKey}`,
            Accept: 'application/json'
          },
          signal: controller.signal
        })
        if (!resp.ok) {
          return {
            ok: false,
            providerType: 'openrouter',
            accounts,
            modelGroups,
            error: `Gagal memeriksa kuota OpenRouter (HTTP ${resp.status})`
          }
        }
        const json = await resp.json()
        const d = json?.data || {}
        const isFreeTier = Boolean(d.is_free_tier)
        const usage = typeof d.usage === 'number' ? d.usage : 0
        const limit = typeof d.limit === 'number' ? d.limit : null
        const limitRemaining = typeof d.limit_remaining === 'number' ? d.limit_remaining : null

        let summary = 'Terhubung ke OpenRouter'
        let remainingPct = 100
        if (limit !== null && limitRemaining !== null && limit > 0) {
          remainingPct = Math.max(0, Math.min(100, Math.round((limitRemaining / limit) * 100)))
          summary = `Sisa kuota kredit: $${limitRemaining.toFixed(2)} dari $${limit.toFixed(2)} (Terpakai: $${usage.toFixed(2)})`
        } else if (isFreeTier) {
          summary = `Paket Gratis OpenRouter aktif (model :free tersedia · pemakaian tercatat: $${usage.toFixed(2)})`
        } else {
          summary = `Akun OpenRouter aktif tanpa batas per-key (pemakaian tercatat: $${usage.toFixed(2)})`
        }

        accounts.unshift({
          id: 'openrouter-oauth-active',
          source: 'oauth',
          providerKey: 'openrouter',
          providerLabel: 'OpenRouter (OAuth Resmi)',
          accountName: d.label || (isFreeTier ? 'Free Tier' : 'Active Key'),
          authType: 'oauth',
          isActive: true,
          testStatus: 'active',
          isExpiredOrInvalid: false,
          errorMessage: null,
          totalQuotas: 1,
          quotas: [
            {
              label: isFreeTier ? 'Credit / Free Tier' : 'Credit Limit',
              used: Number(usage.toFixed(2)),
              limit: limit ?? '∞',
              usedFormatted: Number(usage.toFixed(2)).toString(),
              limitFormatted: limit !== null ? Number(limit.toFixed(2)).toString() : '∞',
              remainingPct,
              resetText: d.limit_reset ? `resets ${d.limit_reset}` : 'active'
            }
          ]
        })

        return {
          ok: true,
          providerType: 'openrouter',
          isFreeTier,
          tierLabel: isFreeTier ? 'Paket Gratis (Free Tier)' : 'Paket Berbayar (Paid)',
          usage,
          limit,
          limitRemaining,
          primaryQuotaPct: remainingPct,
          rateLimit: d.rate_limit || null,
          accounts,
          modelGroups,
          ...(configuredModel ? { configuredModel } : {}),
          ...(configuredProvider ? { configuredProvider } : {}),
          complianceBadge: 'Resmi & Patuh ToS (OAuth/API)',
          summary
        }
      } finally {
        clearTimeout(timer)
      }
    }

    // Kasus B & C: Query /models untuk memeriksa konektivitas + rate-limit header + jumlah model
    const modelsEndpoint = (base.endsWith('/v1') || base.endsWith('/openai'))
      ? `${base}/models`
      : `${base}/v1/models`
    const headers = { Accept: 'application/json' }
    if (effectiveKey && effectiveKey !== 'no-key-required') {
      headers['Authorization'] = `Bearer ${effectiveKey}`
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    try {
      const resp = await fetchImpl(modelsEndpoint, { headers, signal: controller.signal })
      if (!resp.ok) {
        return {
          ok: false,
          providerType: isLocalRouterUrl(targetUrl) ? '9router' : 'standard',
          accounts,
          modelGroups,
          error: `Endpoint tidak merespons (HTTP ${resp.status} ${resp.statusText})`
        }
      }

      const data = await resp.json().catch(() => ({}))
      const rawList = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : [])
      const modelsCount = rawList.length
      const rateLimits = parseRateLimitHeaders(resp.headers)

      if (isLocalRouterUrl(targetUrl)) {
        const primaryAcc = findPrimaryQuotaAccount(accounts, configuredModel, configuredProvider)
        const primaryQuota = primaryAcc?.quotas?.[0] || null
        let primaryQuotaPct = primaryQuota ? Number(primaryQuota.remainingPct) : null
        let primaryAccountSummary = null
        let summary = `Terhubung ke 9Router lokal (${modelsCount} model aktif tersedia)`

        if (primaryAcc && primaryQuota) {
          const usedStr = primaryQuota.usedFormatted ?? String(primaryQuota.used ?? 0)
          const limitStr = primaryQuota.limitFormatted ?? String(primaryQuota.limit ?? 0)
          const totalQuotas = primaryAcc.totalQuotas || primaryAcc.quotas.length
          primaryAccountSummary = `${primaryAcc.providerLabel} (${primaryAcc.accountName}): ${primaryQuota.label} ${usedStr}/${limitStr} (${primaryQuota.remainingPct}%) · ${totalQuotas} kuota aktif`
          summary = `Terhubung ke 9Router (${modelsCount} model) · ${primaryAccountSummary}`
        }

        return {
          ok: true,
          providerType: '9router',
          isFreeTier: false,
          tierLabel: 'Jembatan 9Router Lokal (Multi-Akun)',
          modelsCount,
          rateLimits,
          primaryQuotaPct,
          primaryAccountSummary,
          accounts,
          modelGroups,
          ...(configuredModel ? { configuredModel } : {}),
          ...(configuredProvider ? { configuredProvider } : {}),
          complianceBadge: 'Jembatan Lokal Pilihan Pengguna',
          summary
        }
      }

      const isGemini = host === 'generativelanguage.googleapis.com'
      const isGroq = host === 'api.groq.com'
      const hasRatePct = rateLimits.reqRemaining !== null && rateLimits.reqLimit > 0
      const stdPct = hasRatePct
        ? Math.max(0, Math.min(100, Math.round((rateLimits.reqRemaining / rateLimits.reqLimit) * 100)))
        : 100

      let tierLabel = 'Provider API Standar'
      let isFreeTier = false
      let dailyLimitHint = null
      let summary = `Terhubung ke endpoint (${modelsCount} model terdeteksi)`
      let stdLabel = configuredProvider || host
      let accountQuotas = [
        {
          label: hasRatePct ? 'Rate Limit Window' : 'API Status',
          used: hasRatePct ? (rateLimits.reqLimit - rateLimits.reqRemaining) : 0,
          limit: hasRatePct ? rateLimits.reqLimit : modelsCount,
          remainingPct: stdPct,
          resetText: rateLimits.reset || 'ready'
        }
      ]

      if (isGemini) {
        const localUsage = await readHermesLocalUsage(targetUrl)
        const dailyCalls = Number(localUsage.dailyCalls) || 0
        const dailyTokens = Number(localUsage.dailyTokens) || 0
        const totalCalls = Number(localUsage.totalCalls) || 0
        const totalTokens = Number(localUsage.totalTokens) || 0

        isFreeTier = true
        dailyLimitHint = 1500
        tierLabel = 'Google AI Studio (API Key)'
        stdLabel = 'Google Gemini'

        if (hasRatePct) {
          summary = `Google Gemini aktif (${modelsCount} model) — sisa limit: ${rateLimits.reqRemaining}/${rateLimits.reqLimit} req`
          accountQuotas = [
            {
              label: 'Rate Limit Window',
              used: rateLimits.reqLimit - rateLimits.reqRemaining,
              limit: rateLimits.reqLimit,
              remainingPct: stdPct,
              resetText: rateLimits.reset || 'active'
            }
          ]
        } else {
          const freePct = Math.max(0, Math.min(100, Math.round(((1500 - dailyCalls) / 1500) * 100)))
          const tier1Pct = Math.max(0, Math.min(100, Math.round(((10000 - dailyCalls) / 10000) * 100)))
          summary = `Google Gemini aktif (${modelsCount} model · 24j: ${dailyCalls} req / ${dailyTokens.toLocaleString('en-US')} tok · Total: ${totalCalls} req)`

          accountQuotas = [
            {
              label: 'Pemakaian 24j (Ref Free 1.500 RPD)',
              used: dailyCalls,
              limit: 1500,
              usedFormatted: dailyCalls.toLocaleString('en-US'),
              limitFormatted: '1,500',
              remainingPct: freePct,
              resetText: `${dailyTokens.toLocaleString('en-US')} tok (reset 14:00 WIB)`
            },
            {
              label: 'Pemakaian 24j (Tier 1 Paid 10K RPD)',
              used: dailyCalls,
              limit: 10000,
              usedFormatted: dailyCalls.toLocaleString('en-US'),
              limitFormatted: '10,000',
              remainingPct: tier1Pct,
              resetText: `Total ${totalCalls} req · ${totalTokens.toLocaleString('en-US')} tok`
            },
            ...localUsage.byModel.slice(0, 4).map((m) => ({
              label: `Model: ${m.model}`,
              used: m.calls,
              limit: 1500,
              usedFormatted: `${m.calls} req`,
              limitFormatted: `${m.tokens.toLocaleString('en-US')} tok`,
              remainingPct: Math.max(0, Math.min(100, Math.round(((1500 - m.calls) / 1500) * 100))),
              resetText: m.dailyCalls > 0 ? `${m.dailyCalls} req (24j)` : 'riwayat sesi'
            }))
          ]

          const gGroup = modelGroups.find((g) => g.id === 'gemini')
          if (gGroup) {
            if (gGroup.rows[0]) {
              gGroup.rows[0].remainingPct = freePct
              gGroup.rows[0].subtext = `Tercatat ${totalCalls} request (${totalTokens.toLocaleString('en-US')} token) di state.db Hermes.`
            }
            if (gGroup.rows[1]) {
              gGroup.rows[1].remainingPct = freePct
              gGroup.rows[1].subtext = `24 jam terakhir: ${dailyCalls} request (${dailyTokens.toLocaleString('en-US')} token) — Google AI Studio tidak mengirim header sisa kuota.`
            }
          }
        }
      } else if (isGroq) {
        isFreeTier = true
        tierLabel = 'Groq Cloud (Free Tier / Rate Limit)'
        stdLabel = 'Groq Cloud'
        if (hasRatePct) {
          summary = `Groq aktif — sisa limit: ${rateLimits.reqRemaining}/${rateLimits.reqLimit} req`
        } else {
          summary = `Groq Cloud aktif (${modelsCount} model tersedia)`
        }
      } else if (hasRatePct) {
        summary = `Aktif (${modelsCount} model) — sisa limit: ${rateLimits.reqRemaining}/${rateLimits.reqLimit} req`
      }

      accounts.unshift({
        id: `standard-${host}`,
        source: 'api',
        providerKey: host,
        providerLabel: stdLabel,
        accountName: configuredModel || 'API Aktif',
        authType: 'apikey',
        isActive: true,
        testStatus: 'active',
        totalQuotas: accountQuotas.length,
        isExpiredOrInvalid: false,
        errorMessage: null,
        quotas: accountQuotas
      })

      if (isGemini && hasRatePct) {
        const gGroup = modelGroups.find((g) => g.id === 'gemini')
        if (gGroup && gGroup.rows[1]) {
          gGroup.rows[1].remainingPct = stdPct
          gGroup.rows[1].subtext = `Header API Google melaporkan sisa ${rateLimits.reqRemaining} dari ${rateLimits.reqLimit} permintaan.`
        }
      }

      return {
        ok: true,
        providerType: 'standard',
        isFreeTier,
        tierLabel,
        modelsCount,
        rateLimits,
        dailyLimitHint,
        accounts,
        modelGroups,
        ...(configuredModel ? { configuredModel } : {}),
        ...(configuredProvider ? { configuredProvider } : {}),
        complianceBadge: 'API Resmi & Patuh ToS',
        summary
      }
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    return {
      ok: false,
      error: err?.name === 'AbortError' ? 'Timeout memeriksa kuota provider' : (err?.message || String(err))
    }
  }
}
