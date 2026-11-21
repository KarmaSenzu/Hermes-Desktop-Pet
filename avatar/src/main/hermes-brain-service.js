/**
 * hermes-brain-service.js — Layanan backend Electron main-process untuk 7 fitur Hermes Agent:
 *   1. Riwayat Sesi & FTS5 Search (`state.db` + RPC gateway)
 *   2. Cron Jobs & Proactive Output Watcher (`cron/jobs.json`, `cron/output/`, `cron.manage`)
 *   3. Editor Kepribadian & Memori (`SOUL.md`, `memories/USER.md`, `memories/MEMORY.md`)
 *   4. Manajemen MCP Server (`mcp_servers` di `config.yaml` + `reload.mcp`)
 *   5. Messaging Gateway (`gateway_state.json`, `.env`, `hermes gateway`)
 *   6. Native Fallback Chain & Mixture of Agents (`fallback_providers` & `moa` di `config.yaml`)
 *   7. Monitor Kanban & Async Subagent (`kanban.db` + `delegation.status` / `state.db`)
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { execFile, spawn } from 'node:child_process'
import YAML from 'yaml'

import { resolveHermesBinary, resolveHermesConfigPath } from './path-resolver.js'
import {
  backupConfigFile,
  loadSavedLlmProviders,
  repairHermesConfigYaml,
  withConfigWriteLock,
  writeAtomicFile
} from './provider-service.js'
import { resolveHermesCmd } from './service-manager.js'
import { parseHttpUrl } from './url-guard.js'

export const MEMORY_DELIMITER = '\n§\n'

export const GATEWAY_ENV_ALLOWED_KEYS = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_ALLOWED_USERS',
  'TELEGRAM_HOME_CHANNEL',
  'DISCORD_BOT_TOKEN',
  'DISCORD_ALLOWED_USERS',
  'DISCORD_HOME_CHANNEL',
  'SLACK_BOT_TOKEN',
  'SLACK_APP_TOKEN',
  'SLACK_HOME_CHANNEL',
  'WHATSAPP_ENABLED',
  'WHATSAPP_HOME_CHANNEL',
  'GATEWAY_ALLOW_ALL_USERS'
]

export const GATEWAY_SECRET_KEYS = new Set([
  'TELEGRAM_BOT_TOKEN',
  'DISCORD_BOT_TOKEN',
  'SLACK_BOT_TOKEN',
  'SLACK_APP_TOKEN'
])

const VALID_MCP_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/

/**
 * Resolve direktori HOME Hermes aktif (lokasi config.yaml, state.db, cron/, memories/).
 */
export function resolveHermesHomeDir(cfgPathOverride = null) {
  const cfgPath = cfgPathOverride || resolveHermesConfigPath()
  if (cfgPath) return dirname(cfgPath)
  const home = homedir()
  if (process.platform === 'win32') {
    const localWin = process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, 'hermes')
      : join(home, 'AppData', 'Local', 'hermes')
    if (existsSync(localWin)) return localWin
  }
  return join(home, '.hermes')
}

export function resolveHermesConfigTarget(cfgPathOverride = null) {
  return cfgPathOverride || resolveHermesConfigPath()
}

function maskSecretValue(val) {
  const s = String(val || '').trim()
  if (!s) return ''
  if (s.length <= 8) return '••••••••'
  return `${s.slice(0, 4)}••••${s.slice(-4)}`
}

function isMaskedPlaceholder(val) {
  const s = String(val || '').trim()
  return s.includes('••••') || s.includes('****') || s === '__KEEP__'
}

function execHermesCli(args, { timeout = 30000, cwd = null } = {}) {
  return new Promise((resolve, reject) => {
    const bin = resolveHermesBinary() || resolveHermesCmd()
    const cleanArgs = (Array.isArray(args) ? args : []).map((a) => String(a))
    const needShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin)
    const cmd = needShell ? `"${bin}"` : bin
    const opts = {
      timeout,
      windowsHide: true,
      shell: needShell,
      env: process.env,
      ...(cwd ? { cwd } : {})
    }
    execFile(cmd, cleanArgs, opts, (err, stdout, stderr) => {
      if (err) {
        const msg = String(stderr || stdout || err.message || 'Perintah Hermes gagal').trim()
        reject(new Error(msg))
      } else {
        resolve(String(stdout || '').trim())
      }
    })
  })
}

async function readAndParseYaml(cfgPath) {
  if (!cfgPath || !existsSync(cfgPath)) {
    return { raw: '', doc: YAML.parseDocument('') }
  }
  let raw = await readFile(cfgPath, 'utf8')
  raw = await repairHermesConfigYaml(raw, cfgPath)
  const doc = YAML.parseDocument(raw || '')
  return { raw, doc }
}

function isProcessAlive(pid) {
  const num = Number(pid)
  if (!Number.isInteger(num) || num <= 0) return false
  try {
    process.kill(num, 0)
    return true
  } catch (err) {
    return err?.code === 'EPERM'
  }
}

function sanitizeFtsQuery(rawQuery) {
  const tokens = String(rawQuery || '')
    .trim()
    .replace(/["'()*:^~]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
  if (tokens.length === 0) return ''
  return tokens.map((t) => `"${t}"`).join(' ')
}

const nodeRequire = createRequire(import.meta.url)

function openReadOnlySqlite(dbPath) {
  const { DatabaseSync } = nodeRequire('node:sqlite')
  return new DatabaseSync(dbPath, { readOnly: true })
}

function getTableColumns(db, tableName) {
  try {
    const rows = db.prepare(`PRAGMA table_info(${tableName})`).all()
    return new Set(rows.map((r) => String(r.name || '')))
  } catch {
    return new Set()
  }
}

// ============================================================================
// 1. RIWAYAT SESI & PENCARIAN FTS5 (`state.db`)
// ============================================================================

/**
 * Mencari daftar sesi atau memuat detail pesan satu sesi dari `state.db` Hermes.
 */
export async function searchHermesSessions({
  query = '',
  limit = 50,
  sessionId = null,
  dbPathOverride = null,
  hermesHome = null
} = {}) {
  const baseHome = hermesHome || resolveHermesHomeDir()
  const dbPath = dbPathOverride || join(baseHome, 'state.db')
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50))

  if (!existsSync(dbPath)) {
    return { ok: true, dbPath, missingDb: true, sessions: [], messages: [], session: null }
  }

  let db = null
  try {
    db = openReadOnlySqlite(dbPath)

    const sCols = getTableColumns(db, 'sessions')
    const mCols = getTableColumns(db, 'messages')

    if (!sCols.has('id')) {
      return { ok: true, dbPath, missingDb: true, sessions: [], messages: [], session: null }
    }

    const activeFilter = mCols.has('active') ? 'AND COALESCE(active, 1) = 1' : ''
    const titleSel = sCols.has('title') ? 's.title' : "'' AS title"
    const keySel = sCols.has('session_key') ? 's.session_key' : 's.id AS session_key'
    const provSel = sCols.has('billing_provider') ? 's.billing_provider' : "'' AS billing_provider"
    const msgCountSel = sCols.has('message_count') ? 's.message_count' : '0 AS message_count'
    const inTokSel = sCols.has('input_tokens') ? 's.input_tokens' : '0 AS input_tokens'
    const outTokSel = sCols.has('output_tokens') ? 's.output_tokens' : '0 AS output_tokens'
    const endedSel = sCols.has('ended_at') ? 's.ended_at' : 'NULL AS ended_at'
    const cwdSel = sCols.has('cwd') ? 's.cwd' : "'' AS cwd"

    if (sessionId) {
      const target = String(sessionId).trim()
      const whereClause = sCols.has('session_key') ? '(s.id = ? OR s.session_key = ?)' : '(s.id = ?)'
      const sessionStmt = db.prepare(
        `SELECT s.id, s.source, ${keySel}, ${titleSel}, s.model, ${provSel}, s.started_at, ${endedSel}, ${msgCountSel}, ${inTokSel}, ${outTokSel}, ${cwdSel}
         FROM sessions s WHERE ${whereClause} LIMIT 1`
      )
      const sessionRow = sCols.has('session_key')
        ? sessionStmt.get(target, target)
        : sessionStmt.get(target)

      if (!sessionRow) {
        return { ok: false, error: 'Sesi tidak ditemukan di state.db', session: null, messages: [] }
      }

      const toolCol = mCols.has('tool_name') ? 'tool_name' : "NULL AS tool_name"
      const msgRows = mCols.has('id')
        ? db.prepare(
            `SELECT id, role, content, timestamp, ${toolCol}
             FROM messages
             WHERE session_id = ? AND role IN ('user', 'assistant') ${activeFilter}
             ORDER BY timestamp ASC, id ASC LIMIT 500`
          ).all(sessionRow.id)
        : []

      return {
        ok: true,
        session: {
          id: sessionRow.id,
          sessionKey: sessionRow.session_key || sessionRow.id,
          source: sessionRow.source || 'tui',
          title: sessionRow.title || '',
          model: sessionRow.model || '',
          provider: sessionRow.billing_provider || '',
          startedAt: sessionRow.started_at || 0,
          endedAt: sessionRow.ended_at || null,
          messageCount: Number(sessionRow.message_count || msgRows.length || 0),
          inputTokens: Number(sessionRow.input_tokens || 0),
          outputTokens: Number(sessionRow.output_tokens || 0),
          cwd: sessionRow.cwd || ''
        },
        messages: msgRows.map((m) => ({
          id: m.id,
          role: m.role,
          content: String(m.content || ''),
          timestamp: m.timestamp || 0,
          toolName: m.tool_name || null
        }))
      }
    }

    const q = String(query || '').trim()
    const previewStmt = mCols.has('session_id')
      ? db.prepare(
          `SELECT content FROM messages
           WHERE session_id = ? AND role IN ('user', 'assistant') ${activeFilter}
             AND content IS NOT NULL AND TRIM(content) != ''
           ORDER BY timestamp DESC, id DESC LIMIT 1`
        )
      : null

    const getPreview = (sid) => {
      if (!previewStmt) return ''
      try {
        const r = previewStmt.get(sid)
        const txt = String(r?.content || '').replace(/\s+/g, ' ').trim()
        return txt.length > 140 ? `${txt.slice(0, 140)}…` : txt
      } catch {
        return ''
      }
    }

    if (!q) {
      const rows = db.prepare(
        `SELECT s.id, s.source, ${keySel}, ${titleSel}, s.model, ${provSel}, s.started_at, ${endedSel}, ${msgCountSel}, ${inTokSel}, ${outTokSel}
         FROM sessions s
         WHERE LOWER(COALESCE(s.source, '')) != 'tool'
         ORDER BY s.started_at DESC
         LIMIT ?`
      ).all(safeLimit)

      return {
        ok: true,
        query: '',
        sessions: rows.map((r) => ({
          id: r.id,
          sessionKey: r.session_key || r.id,
          source: r.source || '',
          title: r.title || '',
          preview: getPreview(r.id),
          model: r.model || '',
          provider: r.billing_provider || '',
          startedAt: r.started_at || 0,
          endedAt: r.ended_at || null,
          messageCount: Number(r.message_count || 0),
          inputTokens: Number(r.input_tokens || 0),
          outputTokens: Number(r.output_tokens || 0)
        }))
      }
    }

    const hitMap = new Map()
    const addHit = (r, snippet = '') => {
      if (!r || !r.id) return
      if (String(r.source || '').toLowerCase() === 'tool') return
      const cleanSnippet = String(snippet || '').replace(/\s+/g, ' ').trim()
      if (!hitMap.has(r.id)) {
        hitMap.set(r.id, {
          id: r.id,
          sessionKey: r.session_key || r.id,
          source: r.source || '',
          title: r.title || '',
          preview: cleanSnippet ? (cleanSnippet.length > 140 ? `${cleanSnippet.slice(0, 140)}…` : cleanSnippet) : getPreview(r.id),
          model: r.model || '',
          provider: r.billing_provider || '',
          startedAt: r.started_at || 0,
          endedAt: r.ended_at || null,
          messageCount: Number(r.message_count || 0),
          inputTokens: Number(r.input_tokens || 0),
          outputTokens: Number(r.output_tokens || 0)
        })
      }
    }

    const ftsExists = !!db.prepare("SELECT name FROM sqlite_master WHERE name = 'messages_fts'").get()
    const ftsQuery = sanitizeFtsQuery(q)

    if (ftsExists && ftsQuery && mCols.has('session_id')) {
      try {
        const ftsRows = db.prepare(
          `SELECT s.id, s.source, ${keySel}, ${titleSel}, s.model, ${provSel}, s.started_at, ${endedSel}, ${msgCountSel}, ${inTokSel}, ${outTokSel}, m.content AS match_content
           FROM messages_fts f
           JOIN messages m ON m.id = f.rowid
           JOIN sessions s ON s.id = m.session_id
           WHERE messages_fts MATCH ? AND LOWER(COALESCE(s.source, '')) != 'tool' ${activeFilter ? activeFilter.replace('active', 'm.active') : ''}
           ORDER BY s.started_at DESC
           LIMIT ?`
        ).all(ftsQuery, safeLimit * 3)
        for (const r of ftsRows) addHit(r, r.match_content)
      } catch {
        // fallback ke LIKE di bawah bila syntax FTS gagal
      }
    }

    if (hitMap.size < safeLimit && mCols.has('session_id')) {
      const likePat = `%${q}%`
      const likeRows = db.prepare(
        `SELECT s.id, s.source, ${keySel}, ${titleSel}, s.model, ${provSel}, s.started_at, ${endedSel}, ${msgCountSel}, ${inTokSel}, ${outTokSel}, m.content AS match_content
         FROM messages m
         JOIN sessions s ON s.id = m.session_id
         WHERE LOWER(COALESCE(s.source, '')) != 'tool'
           AND m.content LIKE ? ${activeFilter ? activeFilter.replace('active', 'm.active') : ''}
         ORDER BY s.started_at DESC
         LIMIT ?`
      ).all(likePat, safeLimit * 2)
      for (const r of likeRows) addHit(r, r.match_content)
    }

    const titleWhere = sCols.has('title') ? '(s.id LIKE ? OR s.title LIKE ?)' : '(s.id LIKE ?)'
    const likePat = `%${q}%`
    const metaStmt = db.prepare(
      `SELECT s.id, s.source, ${keySel}, ${titleSel}, s.model, ${provSel}, s.started_at, ${endedSel}, ${msgCountSel}, ${inTokSel}, ${outTokSel}
       FROM sessions s
       WHERE LOWER(COALESCE(s.source, '')) != 'tool' AND ${titleWhere}
       ORDER BY s.started_at DESC
       LIMIT ?`
    )
    const metaRows = sCols.has('title') ? metaStmt.all(likePat, likePat, safeLimit) : metaStmt.all(likePat, safeLimit)
    for (const r of metaRows) addHit(r)

    return {
      ok: true,
      query: q,
      sessions: Array.from(hitMap.values()).slice(0, safeLimit)
    }
  } catch (err) {
    return { ok: false, error: err?.message || String(err), sessions: [], messages: [] }
  } finally {
    try { db?.close() } catch { /* ignore */ }
  }
}

/**
 * Mengelola operasi sesi lewat RPC gateway Hermes (`session.list`, `session.resume`, `session.delete`).
 */
export async function manageHermesSessionRpc({ action, sessionId, limit = 50 } = {}, gatewayReq = null) {
  if (typeof gatewayReq !== 'function') {
    throw new Error('Hermes gateway belum terhubung')
  }
  const act = String(action || '').trim()
  if (act === 'list') {
    return await gatewayReq('session.list', { limit: Number(limit) || 50 })
  }
  if (act === 'resume') {
    if (!sessionId) throw new Error('sessionId wajib diisi')
    return await gatewayReq('session.resume', { session_id: String(sessionId) })
  }
  if (act === 'delete') {
    if (!sessionId) throw new Error('sessionId wajib diisi')
    return await gatewayReq('session.delete', { session_id: String(sessionId) })
  }
  throw new Error(`Aksi sesi tidak dikenal: ${act}`)
}

// ============================================================================
// 2. CRON JOBS & NOTIFIKASI PROAKTIF
// ============================================================================

/**
 * Mem-parse file output markdown cron (`<hermes_home>/cron/output/<job_id>/<ts>.md`).
 */
export function parseCronOutputMarkdown(mdText, meta = {}) {
  const raw = String(mdText || '')
  const headerMatch = raw.match(/^#\s*Cron Job:\s*(.+?)(?:\s*\((FAILED)\))?\s*$/m)
  const idMatch = raw.match(/^\*\*Job ID:\*\*\s*(.+)$/m)
  const runTimeMatch = raw.match(/^\*\*Run Time:\*\*\s*(.+)$/m)
  const schedMatch = raw.match(/^\*\*Schedule:\*\*\s*(.+)$/m)

  const respIdx = raw.search(/^##\s*Response\s*$/m)
  const errIdx = raw.search(/^##\s*Error\s*$/m)
  const promptIdx = raw.search(/^##\s*Prompt\s*$/m)

  let prompt = ''
  if (promptIdx >= 0) {
    const afterPrompt = raw.slice(promptIdx).replace(/^##\s*Prompt\s*\r?\n+/, '')
    const nextSec = afterPrompt.search(/^##\s+(?:Response|Error)\s*$/m)
    prompt = (nextSec >= 0 ? afterPrompt.slice(0, nextSec) : afterPrompt).trim()
  }

  let response = ''
  if (respIdx >= 0) {
    response = raw.slice(respIdx).replace(/^##\s*Response\s*\r?\n+/, '').trim()
  } else if (errIdx >= 0) {
    response = raw.slice(errIdx).replace(/^##\s*Error\s*\r?\n+/, '').trim()
  }

  const isFailed = Boolean(headerMatch?.[2]) || errIdx >= 0
  const isSilent =
    !response ||
    response === '(No response generated)' ||
    /^\[SILENT\]/i.test(response)

  return {
    jobName: (headerMatch?.[1] || meta.jobName || meta.jobId || 'Cron Job').trim(),
    jobId: (idMatch?.[1] || meta.jobId || '').trim(),
    runTime: (runTimeMatch?.[1] || '').trim(),
    schedule: (schedMatch?.[1] || '').trim(),
    prompt,
    response,
    isFailed,
    isSilent,
    fileName: meta.fileName || '',
    filePath: meta.filePath || ''
  }
}

function readJobsFileRaw(hermesHome) {
  const jobsFile = join(hermesHome, 'cron', 'jobs.json')
  if (!existsSync(jobsFile)) return []
  try {
    const parsed = JSON.parse(readFileSync(jobsFile, 'utf8'))
    if (Array.isArray(parsed)) return parsed
    if (parsed && Array.isArray(parsed.jobs)) return parsed.jobs
    return []
  } catch {
    return []
  }
}

function readLatestCronOutputForJob(hermesHome, jobId) {
  const dir = join(hermesHome, 'cron', 'output', String(jobId || ''))
  if (!jobId || !existsSync(dir)) return null
  try {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort()
    if (files.length === 0) return null
    const latest = files[files.length - 1]
    const filePath = join(dir, latest)
    const content = readFileSync(filePath, 'utf8')
    return parseCronOutputMarkdown(content, { jobId, fileName: latest, filePath })
  } catch {
    return null
  }
}

export async function listHermesCronJobs({ hermesHome = null, gatewayReq = null } = {}) {
  const homeDir = hermesHome || resolveHermesHomeDir()
  const diskJobs = readJobsFileRaw(homeDir)

  let rpcJobs = []
  if (typeof gatewayReq === 'function') {
    try {
      const res = await gatewayReq('cron.manage', { action: 'list' })
      if (Array.isArray(res?.jobs)) rpcJobs = res.jobs
      else if (Array.isArray(res)) rpcJobs = res
    } catch {
      // gunakan disk jobs saja
    }
  }

  const byId = new Map()
  for (const j of diskJobs) {
    if (!j || !j.id) continue
    byId.set(String(j.id), {
      jobId: String(j.id),
      name: String(j.name || j.prompt || j.id).slice(0, 80),
      prompt: String(j.prompt || ''),
      schedule: String(j.schedule_display || (typeof j.schedule === 'string' ? j.schedule : j.schedule?.expr || j.schedule?.every || JSON.stringify(j.schedule || '')) || ''),
      deliver: String(j.deliver || 'local'),
      enabled: j.enabled !== false,
      state: String(j.state || (j.enabled === false ? 'paused' : 'scheduled')),
      nextRunAt: j.next_run_at || null,
      lastRunAt: j.last_run_at || null,
      lastStatus: j.last_status || null,
      lastError: j.last_error || null,
      lastOutput: readLatestCronOutputForJob(homeDir, j.id)
    })
  }

  for (const rj of rpcJobs) {
    const jid = String(rj?.job_id || rj?.id || '')
    if (!jid) continue
    if (!byId.has(jid)) {
      byId.set(jid, {
        jobId: jid,
        name: String(rj.name || jid),
        prompt: String(rj.prompt_preview || ''),
        schedule: String(rj.schedule || ''),
        deliver: String(rj.deliver || 'local'),
        enabled: rj.enabled !== false,
        state: String(rj.state || 'scheduled'),
        nextRunAt: rj.next_run_at || null,
        lastRunAt: rj.last_run_at || null,
        lastStatus: rj.last_status || null,
        lastError: null,
        lastOutput: readLatestCronOutputForJob(homeDir, jid)
      })
    }
  }

  const hbPath = join(homeDir, 'cron', 'ticker_heartbeat')
  let tickerAgeSeconds = null
  let tickerActive = false
  if (existsSync(hbPath)) {
    try {
      const st = await stat(hbPath)
      tickerAgeSeconds = Math.max(0, Math.round((Date.now() - st.mtimeMs) / 1000))
      tickerActive = tickerAgeSeconds <= 120
    } catch { /* ignore */ }
  }

  return {
    ok: true,
    jobs: Array.from(byId.values()),
    tickerActive,
    tickerAgeSeconds
  }
}

export async function manageHermesCronJob(
  { action, name = '', jobId = '', schedule = '', prompt = '', deliver = 'local' } = {},
  { hermesHome = null, gatewayReq = null, execHermesFn = execHermesCli } = {}
) {
  const act = String(action || '').trim().toLowerCase()
  const allowed = new Set(['add', 'pause', 'resume', 'remove', 'run', 'tick'])
  if (!allowed.has(act)) {
    throw new Error(`Aksi cron tidak valid: ${act}`)
  }

  if (act === 'tick') {
    const out = await execHermesFn(['cron', 'tick'], { timeout: 90000 })
    return { ok: true, action: 'tick', output: out }
  }

  if (act === 'run') {
    const targetId = String(jobId || name).trim()
    if (!targetId) throw new Error('jobId wajib diisi')
    const out = await execHermesFn(['cron', 'run', targetId], { timeout: 60000 })
    return { ok: true, action: 'run', jobId: targetId, output: out }
  }

  if (act === 'add') {
    const schedClean = String(schedule || '').trim()
    const promptClean = String(prompt || '').trim()
    const nameClean = String(name || promptClean.slice(0, 40) || 'Tugas Avatar').trim()
    if (!schedClean) throw new Error('Jadwal (schedule) wajib diisi, mis. 30m, every 1h, atau 0 8 * * *')
    if (!promptClean) throw new Error('Prompt tugas cron wajib diisi')

    const deliverClean = String(deliver || 'local').trim()
    // Gunakan RPC bila deliver == 'local' dan gateway terhubung, atau CLI untuk mendukung --deliver
    if (typeof gatewayReq === 'function' && (!deliverClean || deliverClean === 'local')) {
      try {
        const res = await gatewayReq('cron.manage', {
          action: 'add',
          name: nameClean,
          schedule: schedClean,
          prompt: promptClean
        })
        if (res?.error) throw new Error(res.error)
        return { ok: true, action: 'add', result: res }
      } catch (err) {
        if (!String(err?.message || '').includes('belum terhubung')) {
          throw err
        }
      }
    }

    const cliArgs = ['cron', 'create', schedClean, promptClean, '--name', nameClean]
    if (deliverClean && deliverClean !== 'local') {
      cliArgs.push('--deliver', deliverClean)
    }
    const out = await execHermesFn(cliArgs, { timeout: 30000 })
    return { ok: true, action: 'add', output: out }
  }

  const targetId = String(jobId || name).trim()
  if (!targetId) throw new Error('jobId wajib diisi')

  if (typeof gatewayReq === 'function') {
    try {
      const res = await gatewayReq('cron.manage', { action: act, name: targetId })
      if (res?.error) throw new Error(res.error)
      return { ok: true, action: act, jobId: targetId, result: res }
    } catch (err) {
      if (!String(err?.message || '').includes('belum terhubung')) {
        throw err
      }
    }
  }

  const out = await execHermesFn(['cron', act, targetId], { timeout: 30000 })
  return { ok: true, action: act, jobId: targetId, output: out, hermesHome }
}

/**
 * Pengamat output cron proaktif: mendeteksi file baru di `<hermes_home>/cron/output/<job_id>/*.md`
 * dan menyalakan `hermes cron tick` cadangan bila ada jadwal jatuh tempo sementara ticker gateway mati.
 */
export function createCronOutputWatcher({
  getHermesHome = () => resolveHermesHomeDir(),
  onNewOutput = () => {},
  execHermesFn = execHermesCli,
  pollIntervalMs = 15000
} = {}) {
  const seenFiles = new Set()
  let seeded = false
  let timer = null
  let polling = false
  let tickInFlight = false
  let lastAutoTickAt = 0

  function listAllOutputFiles(outputRoot) {
    const results = []
    if (!outputRoot || !existsSync(outputRoot)) return results
    try {
      const jobDirs = readdirSync(outputRoot, { withFileTypes: true })
      for (const d of jobDirs) {
        if (!d.isDirectory()) continue
        const jobDir = join(outputRoot, d.name)
        const files = readdirSync(jobDir).filter((f) => f.endsWith('.md')).sort()
        for (const f of files) {
          results.push({ jobId: d.name, fileName: f, filePath: join(jobDir, f) })
        }
      }
    } catch { /* ignore */ }
    return results
  }

  async function maybeRunFallbackTick(hermesHome) {
    const now = Date.now()
    if (tickInFlight || now - lastAutoTickAt < 45000) return false
    const hbPath = join(hermesHome, 'cron', 'ticker_heartbeat')
    if (existsSync(hbPath)) {
      try {
        const hbStat = statSync(hbPath)
        if (now - hbStat.mtimeMs < 90000) return false
      } catch { /* ignore */ }
    }
    const jobs = readJobsFileRaw(hermesHome)
    const hasDue = jobs.some((j) => {
      if (!j || j.enabled === false || !j.next_run_at) return false
      const t = Date.parse(j.next_run_at)
      return Number.isFinite(t) && t <= now
    })
    if (!hasDue) return false

    tickInFlight = true
    lastAutoTickAt = now
    try {
      await execHermesFn(['cron', 'tick'], { timeout: 90000 })
      return true
    } catch {
      return false
    } finally {
      tickInFlight = false
    }
  }

  async function pollOnce() {
    if (polling) return { emitted: 0, ticked: false }
    polling = true
    let emitted = 0
    let ticked = false
    try {
      const home = getHermesHome()
      const outputRoot = join(home, 'cron', 'output')
      const files = listAllOutputFiles(outputRoot)

      if (!seeded) {
        for (const f of files) seenFiles.add(f.filePath)
        seeded = true
        return { emitted: 0, ticked: false, seededCount: seenFiles.size }
      }

      for (const f of files) {
        if (seenFiles.has(f.filePath)) continue
        seenFiles.add(f.filePath)
        try {
          const md = await readFile(f.filePath, 'utf8')
          const parsed = parseCronOutputMarkdown(md, {
            jobId: f.jobId,
            fileName: f.fileName,
            filePath: f.filePath
          })
          if (!parsed.isSilent) {
            emitted += 1
            onNewOutput(parsed)
          }
        } catch { /* ignore */ }
      }

      ticked = await maybeRunFallbackTick(home)
      return { emitted, ticked }
    } finally {
      polling = false
    }
  }

  function start() {
    if (timer) return
    pollOnce().catch(() => {})
    timer = setInterval(() => {
      pollOnce().catch(() => {})
    }, Math.max(3000, Number(pollIntervalMs) || 15000))
    timer.unref?.()
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  return { start, stop, pollOnce }
}

// ============================================================================
// 3. EDITOR KEPRIBADIAN & MEMORI (`SOUL.md`, `USER.md`, `MEMORY.md`)
// ============================================================================

export function splitMemoryEntries(text) {
  const raw = String(text || '').trim()
  if (!raw) return []
  return raw
    .split(/\r?\n\s*§\s*\r?\n|^\s*§\s*$/gm)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function joinMemoryEntries(entries) {
  const list = (Array.isArray(entries) ? entries : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  return list.length > 0 ? `${list.join(MEMORY_DELIMITER)}\n` : ''
}

function resolveMemoryTargetPath(target, hermesHome) {
  const t = String(target || '').trim().toLowerCase()
  if (t === 'soul') return join(hermesHome, 'SOUL.md')
  if (t === 'user') return join(hermesHome, 'memories', 'USER.md')
  if (t === 'memory') return join(hermesHome, 'memories', 'MEMORY.md')
  throw new Error(`Target file memori tidak diizinkan: ${target}`)
}

export async function loadHermesMemoryFiles({ hermesHome = null } = {}) {
  const home = hermesHome || resolveHermesHomeDir()
  const soulPath = resolveMemoryTargetPath('soul', home)
  const userPath = resolveMemoryTargetPath('user', home)
  const memoryPath = resolveMemoryTargetPath('memory', home)

  const readSafe = async (p) => (existsSync(p) ? await readFile(p, 'utf8') : '')
  const [soulContent, userContent, memoryContent] = await Promise.all([
    readSafe(soulPath),
    readSafe(userPath),
    readSafe(memoryPath)
  ])

  return {
    ok: true,
    hermesHome: home,
    soul: { path: soulPath, content: soulContent },
    user: { path: userPath, content: userContent, entries: splitMemoryEntries(userContent) },
    memory: { path: memoryPath, content: memoryContent, entries: splitMemoryEntries(memoryContent) }
  }
}

export async function saveHermesMemoryFile(
  { target, content = null, entries = null, hermesHome = null } = {},
  opts = {}
) {
  const home = hermesHome || opts?.hermesHome || resolveHermesHomeDir()
  const filePath = resolveMemoryTargetPath(target, home)
  await mkdir(dirname(filePath), { recursive: true })

  let finalContent = ''
  if (Array.isArray(entries) && (target === 'user' || target === 'memory')) {
    finalContent = joinMemoryEntries(entries)
  } else {
    finalContent = String(content ?? '')
    if (finalContent && !finalContent.endsWith('\n')) finalContent += '\n'
  }

  await backupConfigFile(filePath, 5)
  await writeAtomicFile(filePath, finalContent)
  return { ok: true, target, path: filePath, bytes: Buffer.byteLength(finalContent, 'utf8') }
}

// ============================================================================
// 4. MANAJEMEN MCP SERVER (`mcp_servers` di `config.yaml`)
// ============================================================================

export async function loadHermesMcpServers({ cfgPath = null } = {}) {
  const targetPath = resolveHermesConfigTarget(cfgPath)
  const { doc } = await readAndParseYaml(targetPath)
  const js = doc.toJS() || {}
  const rawMap = js.mcp_servers && typeof js.mcp_servers === 'object' ? js.mcp_servers : {}

  const servers = Object.entries(rawMap).map(([id, cfg]) => {
    const obj = cfg && typeof cfg === 'object' ? cfg : {}
    const transport = obj.url
      ? (String(obj.transport || '').toLowerCase() === 'sse' ? 'sse' : 'http')
      : 'stdio'
    const rawHeaders = obj.headers && typeof obj.headers === 'object' ? obj.headers : {}
    const maskedHeaders = {}
    for (const [k, v] of Object.entries(rawHeaders)) {
      maskedHeaders[k] = /auth|token|key|secret/i.test(k) ? maskSecretValue(v) : String(v)
    }
    const rawEnv = obj.env && typeof obj.env === 'object' ? obj.env : {}
    const maskedEnv = {}
    for (const [k, v] of Object.entries(rawEnv)) {
      maskedEnv[k] = /token|key|secret|pass/i.test(k) ? maskSecretValue(v) : String(v)
    }

    return {
      id,
      transport,
      command: String(obj.command || ''),
      args: Array.isArray(obj.args) ? obj.args.map(String) : [],
      url: String(obj.url || ''),
      env: maskedEnv,
      headers: maskedHeaders,
      timeout: Number(obj.timeout || 120),
      enabled: obj.enabled !== false
    }
  })

  return { ok: true, cfgPath: targetPath, servers }
}

export async function saveHermesMcpServer(
  { id, serverConfig = {} } = {},
  { cfgPath = null, gatewayReq = null } = {}
) {
  const cleanId = String(id || '').trim()
  if (!VALID_MCP_ID_RE.test(cleanId)) {
    throw new Error('ID server MCP harus huruf/angka/strip/underscore (1-64 karakter)')
  }

  const targetPath = resolveHermesConfigTarget(cfgPath)
  await withConfigWriteLock(async () => {
    const { doc } = await readAndParseYaml(targetPath)
    const mcpNode = doc.get('mcp_servers')
    if (!YAML.isMap(mcpNode)) {
      doc.set('mcp_servers', doc.createNode({}))
    }

    const existing = doc.getIn(['mcp_servers', cleanId])
    const prevObj = YAML.isMap(existing) ? (existing.toJS() || {}) : {}

    const transport = String(serverConfig.transport || (serverConfig.url ? 'http' : 'stdio')).trim().toLowerCase()
    const nextObj = {
      enabled: serverConfig.enabled !== false
    }

    const timeout = Number(serverConfig.timeout)
    if (Number.isFinite(timeout) && timeout > 0) {
      nextObj.timeout = Math.round(timeout)
    }

    if (transport === 'http' || transport === 'sse') {
      const urlStr = String(serverConfig.url || '').trim()
      if (!parseHttpUrl(urlStr)) {
        throw new Error('URL server MCP tidak valid (harus http:// atau https://)')
      }
      nextObj.url = urlStr
      if (transport === 'sse') nextObj.transport = 'sse'

      const nextHeaders = {}
      const prevHeaders = prevObj.headers && typeof prevObj.headers === 'object' ? prevObj.headers : {}
      const inputHeaders = serverConfig.headers && typeof serverConfig.headers === 'object' ? serverConfig.headers : {}
      for (const [k, v] of Object.entries(inputHeaders)) {
        const hk = String(k).trim()
        const hv = String(v ?? '').trim()
        if (!hk) continue
        if (isMaskedPlaceholder(hv) && prevHeaders[hk]) nextHeaders[hk] = prevHeaders[hk]
        else if (hv) nextHeaders[hk] = hv
      }
      if (Object.keys(nextHeaders).length > 0) nextObj.headers = nextHeaders
    } else {
      const cmd = String(serverConfig.command || '').trim()
      if (!cmd) throw new Error('Perintah (command) server MCP wajib diisi, mis. npx atau uvx')
      nextObj.command = cmd

      let argsList = []
      if (Array.isArray(serverConfig.args)) {
        argsList = serverConfig.args.map((a) => String(a).trim()).filter(Boolean)
      } else if (typeof serverConfig.args === 'string') {
        argsList = serverConfig.args.split(/\s+/).map((a) => a.trim()).filter(Boolean)
      }
      nextObj.args = argsList

      const nextEnv = {}
      const prevEnv = prevObj.env && typeof prevObj.env === 'object' ? prevObj.env : {}
      const inputEnv = serverConfig.env && typeof serverConfig.env === 'object' ? serverConfig.env : {}
      for (const [k, v] of Object.entries(inputEnv)) {
        const ek = String(k).trim()
        const ev = String(v ?? '').trim()
        if (!ek) continue
        if (isMaskedPlaceholder(ev) && prevEnv[ek]) nextEnv[ek] = prevEnv[ek]
        else if (ev) nextEnv[ek] = ev
      }
      if (Object.keys(nextEnv).length > 0) nextObj.env = nextEnv
    }

    doc.setIn(['mcp_servers', cleanId], doc.createNode(nextObj))
    await backupConfigFile(targetPath, 5)
    await writeAtomicFile(targetPath, doc.toString())
  })

  let reloaded = false
  if (typeof gatewayReq === 'function') {
    try {
      await gatewayReq('reload.mcp', { confirm: true })
      reloaded = true
    } catch { /* gateway offline atau confirm dilewati */ }
  }

  return { ok: true, id: cleanId, reloaded }
}

export async function deleteHermesMcpServer({ id } = {}, { cfgPath = null, gatewayReq = null } = {}) {
  const cleanId = String(id || '').trim()
  if (!VALID_MCP_ID_RE.test(cleanId)) {
    throw new Error('ID server MCP tidak valid')
  }
  const targetPath = resolveHermesConfigTarget(cfgPath)
  await withConfigWriteLock(async () => {
    const { doc } = await readAndParseYaml(targetPath)
    doc.deleteIn(['mcp_servers', cleanId])
    await backupConfigFile(targetPath, 5)
    await writeAtomicFile(targetPath, doc.toString())
  })
  if (typeof gatewayReq === 'function') {
    try { await gatewayReq('reload.mcp', { confirm: true }) } catch { /* ignore */ }
  }
  return { ok: true, deleted: cleanId }
}

export async function toggleHermesMcpServer({ id, enabled } = {}, { cfgPath = null, gatewayReq = null } = {}) {
  const cleanId = String(id || '').trim()
  if (!VALID_MCP_ID_RE.test(cleanId)) {
    throw new Error('ID server MCP tidak valid')
  }
  const targetPath = resolveHermesConfigTarget(cfgPath)
  await withConfigWriteLock(async () => {
    const { doc } = await readAndParseYaml(targetPath)
    if (!doc.hasIn(['mcp_servers', cleanId])) {
      throw new Error(`Server MCP '${cleanId}' tidak ditemukan`)
    }
    doc.setIn(['mcp_servers', cleanId, 'enabled'], Boolean(enabled))
    await backupConfigFile(targetPath, 5)
    await writeAtomicFile(targetPath, doc.toString())
  })
  if (typeof gatewayReq === 'function') {
    try { await gatewayReq('reload.mcp', { confirm: true }) } catch { /* ignore */ }
  }
  return { ok: true, id: cleanId, enabled: Boolean(enabled) }
}

// ============================================================================
// 5. MESSAGING GATEWAY (`gateway_state.json` + `.env` + `hermes gateway`)
// ============================================================================

export function parseDotEnvText(text) {
  const result = {}
  const lines = String(text || '').split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eqIdx = line.indexOf('=')
    if (eqIdx <= 0) continue
    const key = line.slice(0, eqIdx).trim()
    let val = line.slice(eqIdx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    result[key] = val
  }
  return result
}

function setOrRemoveEnvLine(text, key, value) {
  const cleanVal = String(value ?? '').trim()
  const re = new RegExp(`^${key}=.*(?:\\r?\\n)?`, 'gm')
  if (!cleanVal) {
    return String(text || '').replace(re, '')
  }
  if (/[\u0000-\u001F\u007F]/.test(cleanVal)) {
    throw new Error(`Nilai ${key} mengandung karakter tidak valid`)
  }
  const line = `${key}=${cleanVal}`
  const replaceRe = new RegExp(`^${key}=.*$`, 'm')
  if (replaceRe.test(text)) {
    return text.replace(replaceRe, () => line)
  }
  return text + (text === '' || text.endsWith('\n') ? '' : '\n') + line + '\n'
}

export async function getMessagingGatewayState({ hermesHome = null } = {}) {
  const home = hermesHome || resolveHermesHomeDir()
  const statePath = join(home, 'gateway_state.json')
  const envPath = join(home, '.env')

  let gwState = null
  if (existsSync(statePath)) {
    try {
      gwState = JSON.parse(await readFile(statePath, 'utf8'))
    } catch {
      gwState = null
    }
  }

  const pid = gwState?.pid || null
  const pidAlive = pid ? isProcessAlive(pid) : false

  const rawEnv = existsSync(envPath) ? await readFile(envPath, 'utf8') : ''
  const parsedEnv = parseDotEnvText(rawEnv)

  const envView = {}
  const secretFlags = {}
  for (const key of GATEWAY_ENV_ALLOWED_KEYS) {
    const val = String(parsedEnv[key] || '')
    if (GATEWAY_SECRET_KEYS.has(key)) {
      envView[key] = val ? maskSecretValue(val) : ''
      secretFlags[key] = Boolean(val)
    } else {
      envView[key] = val
    }
  }

  return {
    ok: true,
    hermesHome: home,
    running: Boolean(pidAlive && gwState?.gateway_state === 'running'),
    pid,
    pidAlive,
    gatewayState: gwState?.gateway_state || 'stopped',
    platforms: gwState?.platforms || {},
    updatedAt: gwState?.updated_at || null,
    env: envView,
    hasSecrets: secretFlags
  }
}

export async function saveMessagingGatewayEnv(updates = {}, { hermesHome = null } = {}) {
  const home = hermesHome || resolveHermesHomeDir()
  const envPath = join(home, '.env')
  await mkdir(home, { recursive: true })

  let rawEnv = existsSync(envPath) ? await readFile(envPath, 'utf8') : ''
  const existing = parseDotEnvText(rawEnv)

  for (const key of GATEWAY_ENV_ALLOWED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(updates, key)) continue
    const nextVal = String(updates[key] ?? '').trim()
    if (GATEWAY_SECRET_KEYS.has(key)) {
      if (isMaskedPlaceholder(nextVal)) continue
      if (!nextVal && existing[key]) continue // Pertahankan token lama jika dikosongkan kecuali explicit __CLEAR__
      if (nextVal === '__CLEAR__') {
        rawEnv = setOrRemoveEnvLine(rawEnv, key, '')
        continue
      }
    }
    rawEnv = setOrRemoveEnvLine(rawEnv, key, nextVal)
  }

  await backupConfigFile(envPath, 5)
  await writeAtomicFile(envPath, rawEnv)
  return await getMessagingGatewayState({ hermesHome: home })
}

export async function controlMessagingGateway(
  { action } = {},
  { hermesHome = null, execHermesFn = execHermesCli, spawnFn = spawn } = {}
) {
  const act = String(action || '').trim().toLowerCase()
  const allowed = new Set(['start', 'stop', 'restart', 'status', 'run-background'])
  if (!allowed.has(act)) {
    throw new Error(`Aksi gateway tidak diizinkan: ${act}`)
  }

  if (act === 'run-background') {
    const bin = resolveHermesBinary() || resolveHermesCmd()
    const needShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin)
    const child = spawnFn(needShell ? `"${bin}"` : bin, ['gateway', 'run'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      shell: needShell,
      env: process.env
    })
    child?.unref?.()
    return { ok: true, action: act, pid: child?.pid || null }
  }

  const out = await execHermesFn(['gateway', act], { timeout: 30000 })
  const state = await getMessagingGatewayState({ hermesHome })
  return { ok: true, action: act, output: out, state }
}

// ============================================================================
// 6. NATIVE FALLBACK CHAIN & MIXTURE OF AGENTS (`config.yaml`)
// ============================================================================

export async function loadFallbackAndMoaConfig({ cfgPath = null, providersFile = null, secretStore = null } = {}) {
  const targetPath = resolveHermesConfigTarget(cfgPath)
  const { doc } = await readAndParseYaml(targetPath)
  const js = doc.toJS() || {}

  // Gabungkan fallback_providers + fallback_model (legacy) seperti hermes_cli/fallback_config.py
  const merged = []
  const seen = new Set()
  const collect = (raw) => {
    const list = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? [raw] : [])
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const provider = String(item.provider || '').trim()
      const model = String(item.model || '').trim()
      if (!provider || !model) continue
      const baseUrl = String(item.base_url || '').trim().replace(/\/+$/, '')
      const idKey = `${provider.toLowerCase()}|${model.toLowerCase()}|${baseUrl.toLowerCase()}`
      if (seen.has(idKey)) continue
      seen.add(idKey)
      merged.push({
        provider,
        model,
        base_url: baseUrl,
        api_key: item.api_key ? maskSecretValue(item.api_key) : '',
        hasApiKey: Boolean(item.api_key),
        key_env: String(item.key_env || item.api_key_env || '')
      })
    }
  }
  collect(js.fallback_providers)
  collect(js.fallback_model)

  const moaRaw = js.moa && typeof js.moa === 'object' ? js.moa : {}
  const presetsRaw = moaRaw.presets && typeof moaRaw.presets === 'object' ? moaRaw.presets : {}
  const defaultPresetName = String(moaRaw.default_preset || Object.keys(presetsRaw)[0] || 'default').trim() || 'default'
  const activePreset = String(moaRaw.active_preset || '').trim()
  const basePreset = presetsRaw[defaultPresetName] || presetsRaw[activePreset] || moaRaw || {}

  const refsRaw = Array.isArray(basePreset.reference_models) ? basePreset.reference_models : [
    { provider: 'openai-codex', model: 'gpt-5.5' },
    { provider: 'openrouter', model: 'deepseek/deepseek-v4-pro' }
  ]
  const refModels = refsRaw
    .filter((r) => r && typeof r === 'object' && r.provider && r.model)
    .map((r) => ({ provider: String(r.provider), model: String(r.model) }))

  const aggRaw = basePreset.aggregator && typeof basePreset.aggregator === 'object' ? basePreset.aggregator : {
    provider: 'openrouter',
    model: 'anthropic/claude-opus-4.8'
  }

  let savedProviders = []
  try {
    const loaded = await loadSavedLlmProviders({ secretStore, providersFile, cfgPath: targetPath })
    savedProviders = (loaded.providers || []).map((p) => ({
      id: p.id,
      name: p.name,
      baseUrl: p.baseUrl,
      model: p.model,
      models: p.models || [],
      hasApiKey: Boolean(p.apiKey)
    }))
  } catch { /* ignore */ }

  return {
    ok: true,
    cfgPath: targetPath,
    primaryModel: js.model || {},
    fallbackChain: merged,
    savedProviders,
    moa: {
      activePreset,
      defaultPreset: defaultPresetName,
      enabled: Boolean(activePreset),
      presets: Object.keys(presetsRaw).length > 0 ? Object.keys(presetsRaw) : [defaultPresetName],
      fanout: basePreset.fanout === 'user_turn' ? 'user_turn' : 'per_iteration',
      maxTokens: Number(basePreset.max_tokens || 4096),
      referenceMaxTokens: basePreset.reference_max_tokens ? Number(basePreset.reference_max_tokens) : '',
      referenceModels: refModels,
      aggregator: {
        provider: String(aggRaw.provider || ''),
        model: String(aggRaw.model || '')
      }
    }
  }
}

export async function saveFallbackChain(
  { chain = [] } = {},
  { cfgPath = null, providersFile = null, secretStore = null } = {}
) {
  const targetPath = resolveHermesConfigTarget(cfgPath)

  // Muat provider tersimpan terlebih dulu untuk resolusi API key aman di main process
  let savedList = []
  try {
    const loaded = await loadSavedLlmProviders({ secretStore, providersFile, cfgPath: targetPath })
    savedList = loaded.providers || []
  } catch { /* ignore */ }

  await withConfigWriteLock(async () => {
    const { doc } = await readAndParseYaml(targetPath)
    const js = doc.toJS() || {}
    const existingList = Array.isArray(js.fallback_providers) ? js.fallback_providers : []

    const cleanChain = []
    for (const item of Array.isArray(chain) ? chain : []) {
      if (!item || typeof item !== 'object') continue
      const provider = String(item.provider || '').trim()
      const model = String(item.model || '').trim()
      if (!provider || !model) {
        throw new Error('Setiap item fallback wajib memiliki provider dan model')
      }
      const entry = { provider, model }
      const baseUrl = String(item.base_url || item.baseUrl || '').trim()
      if (baseUrl) {
        if (!parseHttpUrl(baseUrl)) throw new Error(`URL fallback tidak valid: ${baseUrl}`)
        entry.base_url = baseUrl
      }

      const rawKey = String(item.api_key || item.apiKey || '').trim()
      if (item.savedProviderId) {
        const sp = savedList.find((x) => x.id === item.savedProviderId)
        if (sp?.apiKey) {
          if (sp.apiKey.startsWith('v2:') && secretStore && typeof secretStore.open === 'function') {
            const opened = secretStore.open(sp.apiKey, sp.baseUrl)
            if (opened?.ok && opened.key) entry.api_key = opened.key
          } else if (!sp.apiKey.startsWith('v2:')) {
            entry.api_key = sp.apiKey
          }
        }
      } else if (rawKey && !isMaskedPlaceholder(rawKey)) {
        entry.api_key = rawKey
      } else if (isMaskedPlaceholder(rawKey)) {
        const prev = existingList.find(
          (e) => e && String(e.provider || '').toLowerCase() === provider.toLowerCase() &&
            String(e.model || '').toLowerCase() === model.toLowerCase()
        )
        if (prev?.api_key) entry.api_key = prev.api_key
      }

      if (item.key_env) entry.key_env = String(item.key_env).trim()
      cleanChain.push(entry)
    }

    doc.set('fallback_providers', doc.createNode(cleanChain))
    if (doc.has('fallback_model')) {
      doc.delete('fallback_model')
    }
    await backupConfigFile(targetPath, 5)
    await writeAtomicFile(targetPath, doc.toString())
  })

  return { ok: true }
}

export async function saveMoaConfig(
  { activePreset = '', defaultPreset = 'default', presetConfig = {} } = {},
  { cfgPath = null } = {}
) {
  const targetPath = resolveHermesConfigTarget(cfgPath)
  const cleanDefault = String(defaultPreset || 'default').trim() || 'default'
  const cleanActive = String(activePreset || '').trim()

  const aggProvider = String(presetConfig?.aggregator?.provider || '').trim()
  const aggModel = String(presetConfig?.aggregator?.model || '').trim()
  if (!aggProvider || !aggModel) {
    throw new Error('Aggregator MoA wajib memiliki provider dan model')
  }
  if (aggProvider.toLowerCase() === 'moa') {
    throw new Error('Aggregator MoA tidak boleh menggunakan provider moa secara rekursif')
  }

  const refs = (Array.isArray(presetConfig?.referenceModels) ? presetConfig.referenceModels : [])
    .map((r) => ({
      provider: String(r?.provider || '').trim(),
      model: String(r?.model || '').trim()
    }))
    .filter((r) => r.provider && r.model)

  if (refs.length === 0) {
    throw new Error('Minimal 1 Reference Advisor Model harus diisi untuk MoA')
  }
  if (refs.some((r) => r.provider.toLowerCase() === 'moa')) {
    throw new Error('Reference Model MoA tidak boleh menggunakan provider moa secara rekursif')
  }

  const fanout = presetConfig?.fanout === 'user_turn' ? 'user_turn' : 'per_iteration'
  const maxTokens = Math.max(256, Math.min(65536, Number(presetConfig?.maxTokens) || 4096))
  const refMaxTokens = Number(presetConfig?.referenceMaxTokens)

  const normalizedPreset = {
    reference_models: refs,
    aggregator: { provider: aggProvider, model: aggModel },
    max_tokens: maxTokens,
    fanout,
    enabled: true
  }
  if (Number.isFinite(refMaxTokens) && refMaxTokens >= 64) {
    normalizedPreset.reference_max_tokens = Math.round(refMaxTokens)
  }

  await withConfigWriteLock(async () => {
    const { doc } = await readAndParseYaml(targetPath)
    if (!YAML.isMap(doc.get('moa'))) {
      doc.set('moa', doc.createNode({}))
    }
    doc.setIn(['moa', 'default_preset'], cleanDefault)
    doc.setIn(['moa', 'active_preset'], cleanActive)
    if (!YAML.isMap(doc.getIn(['moa', 'presets']))) {
      doc.setIn(['moa', 'presets'], doc.createNode({}))
    }
    doc.setIn(['moa', 'presets', cleanDefault], doc.createNode(normalizedPreset))
    await backupConfigFile(targetPath, 5)
    await writeAtomicFile(targetPath, doc.toString())
  })

  return { ok: true, activePreset: cleanActive, defaultPreset: cleanDefault }
}

// ============================================================================
// 7. MONITOR KANBAN & ASYNC SUBAGENT (`kanban.db` + `delegation.status`)
// ============================================================================

export async function getKanbanAndSubagents({
  hermesHome = null,
  kanbanDbPathOverride = null,
  stateDbPathOverride = null,
  gatewayReq = null
} = {}) {
  const home = hermesHome || resolveHermesHomeDir()
  const kanbanPath = kanbanDbPathOverride || join(home, 'kanban.db')
  const statePath = stateDbPathOverride || join(home, 'state.db')

  let tasks = []
  let kanbanExists = existsSync(kanbanPath)
  if (kanbanExists) {
    let kdb = null
    try {
      kdb = openReadOnlySqlite(kanbanPath)
      const tCols = getTableColumns(kdb, 'tasks')
      if (tCols.has('id') && tCols.has('title')) {
        const rows = kdb.prepare(
          `SELECT id, title, COALESCE(body, '') AS body, COALESCE(assignee, '') AS assignee,
                  status, COALESCE(priority, 0) AS priority, created_at, started_at, completed_at,
                  COALESCE(result, '') AS result, COALESCE(last_failure_error, '') AS last_failure_error
           FROM tasks
           WHERE LOWER(COALESCE(status, '')) != 'archived'
           ORDER BY priority DESC, created_at DESC
           LIMIT 100`
        ).all()
        tasks = rows.map((r) => ({
          id: r.id,
          title: r.title,
          body: r.body,
          assignee: r.assignee,
          status: r.status,
          priority: Number(r.priority || 0),
          createdAt: r.created_at || 0,
          startedAt: r.started_at || null,
          completedAt: r.completed_at || null,
          result: r.result,
          lastFailureError: r.last_failure_error
        }))
      }
    } catch { /* ignore */ } finally {
      try { kdb?.close() } catch { /* ignore */ }
    }
  }

  let delegation = {
    connected: false,
    active: [],
    paused: false,
    maxSpawnDepth: 1,
    maxConcurrentChildren: 3
  }
  if (typeof gatewayReq === 'function') {
    try {
      const ds = await gatewayReq('delegation.status', {})
      delegation = {
        connected: true,
        active: Array.isArray(ds?.active) ? ds.active : [],
        paused: Boolean(ds?.paused),
        maxSpawnDepth: Number(ds?.max_spawn_depth || 1),
        maxConcurrentChildren: Number(ds?.max_concurrent_children || 3)
      }
    } catch { /* gateway offline */ }
  }

  let recentSubagents = []
  if (existsSync(statePath)) {
    let sdb = null
    try {
      sdb = openReadOnlySqlite(statePath)
      const sCols = getTableColumns(sdb, 'sessions')
      if (sCols.has('id')) {
        const parentFilter = sCols.has('parent_session_id') ? "OR parent_session_id IS NOT NULL" : ''
        const titleCol = sCols.has('title') ? 'COALESCE(title, \'\') AS title' : "'' AS title"
        const rows = sdb.prepare(
          `SELECT id, source, ${titleCol}, COALESCE(model, '') AS model, started_at, ended_at
           FROM sessions
           WHERE LOWER(COALESCE(source, '')) = 'tool' ${parentFilter}
           ORDER BY started_at DESC
           LIMIT 20`
        ).all()
        recentSubagents = rows.map((r) => ({
          id: r.id,
          source: r.source,
          title: r.title,
          model: r.model,
          startedAt: r.started_at || 0,
          endedAt: r.ended_at || null
        }))
      }
    } catch { /* ignore */ } finally {
      try { sdb?.close() } catch { /* ignore */ }
    }
  }

  return {
    ok: true,
    kanbanExists,
    tasks,
    delegation,
    recentSubagents
  }
}

export async function manageKanbanAndSubagent(
  { action, paused = false, subagentId = '', taskId = '', title = '', body = '', priority = 0, assignee = '' } = {},
  { hermesHome = null, gatewayReq = null, execHermesFn = execHermesCli } = {}
) {
  const act = String(action || '').trim().toLowerCase()

  if (act === 'subagent-pause') {
    if (typeof gatewayReq !== 'function') throw new Error('Hermes gateway belum terhubung')
    return await gatewayReq('delegation.pause', { paused: Boolean(paused) })
  }

  if (act === 'subagent-interrupt') {
    if (typeof gatewayReq !== 'function') throw new Error('Hermes gateway belum terhubung')
    const sid = String(subagentId || '').trim()
    if (!sid) throw new Error('subagentId wajib diisi')
    return await gatewayReq('subagent.interrupt', { subagent_id: sid })
  }

  if (act === 'kanban-create') {
    const cleanTitle = String(title || '').trim()
    if (!cleanTitle) throw new Error('Judul tugas Kanban wajib diisi')
    const args = ['kanban', 'create', cleanTitle, '--json']
    if (String(body || '').trim()) args.push('--body', String(body).trim())
    if (String(assignee || '').trim()) args.push('--assignee', String(assignee).trim())
    if (Number.isFinite(Number(priority)) && Number(priority) !== 0) {
      args.push('--priority', String(Math.round(Number(priority))))
    }
    const out = await execHermesFn(args, { timeout: 30000 })
    return { ok: true, action: act, output: out, hermesHome }
  }

  const cleanTaskId = String(taskId || '').trim()
  if (['kanban-archive', 'kanban-promote', 'kanban-unblock', 'kanban-complete'].includes(act)) {
    if (!cleanTaskId) throw new Error('taskId wajib diisi')
    const subcmd = act.replace('kanban-', '')
    const out = await execHermesFn(['kanban', subcmd, cleanTaskId], { timeout: 30000 })
    return { ok: true, action: act, taskId: cleanTaskId, output: out }
  }

  throw new Error(`Aksi Kanban/Subagent tidak dikenal: ${act}`)
}
