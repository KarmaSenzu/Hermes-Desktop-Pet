import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import YAML from 'yaml'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')

import {
  searchHermesSessions,
  manageHermesSessionRpc,
  parseCronOutputMarkdown,
  createCronOutputWatcher,
  splitMemoryEntries,
  joinMemoryEntries,
  loadHermesMemoryFiles,
  saveHermesMemoryFile,
  loadHermesMcpServers,
  saveHermesMcpServer,
  deleteHermesMcpServer,
  toggleHermesMcpServer,
  getMessagingGatewayState,
  saveMessagingGatewayEnv,
  loadFallbackAndMoaConfig,
  saveFallbackChain,
  saveMoaConfig,
  getKanbanAndSubagents
} from '../src/main/hermes-brain-service.js'

const tempDirs = []

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'hermes-brain-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
})

describe('hermes-brain-service', () => {
  it('searchHermesSessions mendukung list sesi, pencarian FTS5, dan detail pesan sesi', async () => {
    const dir = await makeTempDir()
    const dbPath = join(dir, 'state.db')
    const db = new DatabaseSync(dbPath)
    db.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        session_key TEXT,
        title TEXT,
        model TEXT,
        billing_provider TEXT,
        started_at REAL NOT NULL,
        ended_at REAL,
        message_count INTEGER DEFAULT 0,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cwd TEXT
      );
      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT,
        tool_name TEXT,
        timestamp REAL NOT NULL,
        active INTEGER NOT NULL DEFAULT 1
      );
      CREATE VIRTUAL TABLE messages_fts USING fts5(content);
    `)

    db.prepare(`INSERT INTO sessions (id, source, title, model, started_at, message_count) VALUES (?, ?, ?, ?, ?, ?)`).run(
      'sess-human-1', 'tui', 'Diskusi Docker & FastAPI', 'gemini-3.5-flash-lite', 1000, 2
    )
    db.prepare(`INSERT INTO sessions (id, source, title, model, started_at, message_count) VALUES (?, ?, ?, ?, ?, ?)`).run(
      'sess-tool-1', 'tool', 'Subagent hidden', 'gemini-3.5-flash-lite', 1200, 1
    )

    const insertMsg = db.prepare(`INSERT INTO messages (session_id, role, content, timestamp, active) VALUES (?, ?, ?, ?, 1)`)
    const r1 = insertMsg.run('sess-human-1', 'user', 'Tolong bantu setup kontainer docker untuk backend.', 1001)
    const r2 = insertMsg.run('sess-human-1', 'assistant', 'Siap, berikut Dockerfile yang optimal.', 1002)
    const r3 = insertMsg.run('sess-tool-1', 'assistant', 'internal tool log docker', 1201)

    const insertFts = db.prepare(`INSERT INTO messages_fts (rowid, content) VALUES (?, ?)`)
    insertFts.run(r1.lastInsertRowid, 'Tolong bantu setup kontainer docker untuk backend.')
    insertFts.run(r2.lastInsertRowid, 'Siap, berikut Dockerfile yang optimal.')
    insertFts.run(r3.lastInsertRowid, 'internal tool log docker')
    db.close()

    const listed = await searchHermesSessions({ dbPathOverride: dbPath })
    expect(listed.ok).toBe(true)
    expect(listed.sessions.map((s) => s.id)).toEqual(['sess-human-1'])

    const matched = await searchHermesSessions({ query: 'kontainer', dbPathOverride: dbPath })
    expect(matched.ok).toBe(true)
    expect(matched.sessions).toHaveLength(1)
    expect(matched.sessions[0].id).toBe('sess-human-1')

    const detail = await searchHermesSessions({ sessionId: 'sess-human-1', dbPathOverride: dbPath })
    expect(detail.ok).toBe(true)
    expect(detail.session.title).toBe('Diskusi Docker & FastAPI')
    expect(detail.messages).toHaveLength(2)
    expect(detail.messages[0].role).toBe('user')
    expect(detail.messages[1].role).toBe('assistant')
  })

  it('parseCronOutputMarkdown mem-parse normal output, [SILENT], empty, dan FAILED', () => {
    const okDoc = `# Cron Job: Briefing Pagi\n\n**Job ID:** job-1\n**Run Time:** 2026-11-20 08:00:00\n**Schedule:** 0 8 * * *\n\n## Prompt\n\nRingkas cuaca.\n\n## Response\n\nCerah berawan 29C.\n`
    const pOk = parseCronOutputMarkdown(okDoc)
    expect(pOk.jobName).toBe('Briefing Pagi')
    expect(pOk.jobId).toBe('job-1')
    expect(pOk.isFailed).toBe(false)
    expect(pOk.isSilent).toBe(false)
    expect(pOk.response).toBe('Cerah berawan 29C.')

    const silentDoc = okDoc.replace('Cerah berawan 29C.', '[SILENT] Tidak ada perubahan.')
    expect(parseCronOutputMarkdown(silentDoc).isSilent).toBe(true)

    const emptyDoc = okDoc.replace('Cerah berawan 29C.', '(No response generated)')
    expect(parseCronOutputMarkdown(emptyDoc).isSilent).toBe(true)

    const failDoc = `# Cron Job: Cek Server (FAILED)\n\n**Job ID:** job-2\n\n## Error\n\n\`\`\`\nTimeout\n\`\`\`\n`
    const pFail = parseCronOutputMarkdown(failDoc)
    expect(pFail.isFailed).toBe(true)
    expect(pFail.isSilent).toBe(false)
  })

  it('createCronOutputWatcher melewatkan file lama saat seeding dan memancarkan output baru', async () => {
    const home = await makeTempDir()
    const outDir = join(home, 'cron', 'output', 'job-alpha')
    await mkdir(outDir, { recursive: true })
    await writeFile(join(outDir, '2026-11-20_07-00-00.md'), '# Cron Job: Lama\n\n## Response\n\nOutput lama', 'utf8')

    const emitted = []
    const watcher = createCronOutputWatcher({
      getHermesHome: () => home,
      onNewOutput: (parsed) => emitted.push(parsed)
    })

    const first = await watcher.pollOnce()
    expect(first.seededCount).toBe(1)
    expect(emitted).toHaveLength(0)

    await writeFile(join(outDir, '2026-11-20_08-00-00.md'), '# Cron Job: Pagi\n\n**Job ID:** job-alpha\n\n## Response\n\nSelamat pagi!', 'utf8')
    await writeFile(join(outDir, '2026-11-20_08-05-00.md'), '# Cron Job: Sepi\n\n**Job ID:** job-alpha\n\n## Response\n\n[SILENT]', 'utf8')

    const second = await watcher.pollOnce()
    expect(second.emitted).toBe(1)
    expect(emitted).toHaveLength(1)
    expect(emitted[0].response).toBe('Selamat pagi!')
  })

  it('memori & SOUL.md mendukung pemisahan §, penyimpanan atomik, dan menolak target tak dikenal', async () => {
    const home = await makeTempDir()
    const memDir = join(home, 'memories')
    await mkdir(memDir, { recursive: true })

    await saveHermesMemoryFile({ target: 'soul', content: 'Kepribadian ramah' }, { hermesHome: home })
    await saveHermesMemoryFile({ target: 'user', entries: ['Suka kopi hitam', 'Bahasa Indonesia'] }, { hermesHome: home })
    await saveHermesMemoryFile({ target: 'memory', entries: ['Proyek hermes-3d-avatar'] }, { hermesHome: home })

    const loaded = await loadHermesMemoryFiles({ hermesHome: home })
    expect(loaded.soul.content).toContain('Kepribadian ramah')
    expect(loaded.user.entries).toEqual(['Suka kopi hitam', 'Bahasa Indonesia'])
    expect(loaded.memory.entries).toEqual(['Proyek hermes-3d-avatar'])

    expect(splitMemoryEntries(joinMemoryEntries(['A', 'B']))).toEqual(['A', 'B'])
    await expect(saveHermesMemoryFile({ target: '../hack', content: 'x' }, { hermesHome: home })).rejects.toThrow('tidak diizinkan')
  })

  it('CRUD MCP server di config.yaml bekerja tanpa merusak kunci lain', async () => {
    const dir = await makeTempDir()
    const cfgPath = join(dir, 'config.yaml')
    await writeFile(cfgPath, 'model:\n  default: test-model\n', 'utf8')

    await saveHermesMcpServer(
      {
        id: 'github',
        serverConfig: {
          transport: 'stdio',
          command: 'npx',
          args: '-y @modelcontextprotocol/server-github',
          env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_1234567890' }
        }
      },
      { cfgPath }
    )

    let loaded = await loadHermesMcpServers({ cfgPath })
    expect(loaded.servers).toHaveLength(1)
    expect(loaded.servers[0].id).toBe('github')
    expect(loaded.servers[0].enabled).toBe(true)
    expect(loaded.servers[0].env.GITHUB_PERSONAL_ACCESS_TOKEN).toContain('••••')

    await toggleHermesMcpServer({ id: 'github', enabled: false }, { cfgPath })
    loaded = await loadHermesMcpServers({ cfgPath })
    expect(loaded.servers[0].enabled).toBe(false)

    await deleteHermesMcpServer({ id: 'github' }, { cfgPath })
    loaded = await loadHermesMcpServers({ cfgPath })
    expect(loaded.servers).toHaveLength(0)

    const rawCfg = YAML.parse(await readFile(cfgPath, 'utf8'))
    expect(rawCfg.model.default).toBe('test-model')
  })

  it('Messaging Gateway melakukan masking token & mempertahankan token lama saat disave ulang dengan mask', async () => {
    const home = await makeTempDir()
    await writeFile(
      join(home, '.env'),
      'TELEGRAM_BOT_TOKEN=123456:ABCDEF_SECRET_TOKEN\nTELEGRAM_ALLOWED_USERS=111222\n',
      'utf8'
    )
    await writeFile(
      join(home, 'gateway_state.json'),
      JSON.stringify({ pid: 999999, gateway_state: 'stopped', platforms: { telegram: { state: 'disconnected' } } }),
      'utf8'
    )

    const state = await getMessagingGatewayState({ hermesHome: home })
    expect(state.env.TELEGRAM_BOT_TOKEN).toContain('••••')
    expect(state.env.TELEGRAM_BOT_TOKEN).not.toContain('ABCDEF_SECRET_TOKEN')
    expect(state.hasSecrets.TELEGRAM_BOT_TOKEN).toBe(true)
    expect(state.env.TELEGRAM_ALLOWED_USERS).toBe('111222')

    await saveMessagingGatewayEnv(
      {
        TELEGRAM_BOT_TOKEN: state.env.TELEGRAM_BOT_TOKEN,
        TELEGRAM_ALLOWED_USERS: '111222,333444',
        WHATSAPP_ENABLED: 'true'
      },
      { hermesHome: home }
    )

    const rawAfter = await readFile(join(home, '.env'), 'utf8')
    expect(rawAfter).toContain('TELEGRAM_BOT_TOKEN=123456:ABCDEF_SECRET_TOKEN')
    expect(rawAfter).toContain('TELEGRAM_ALLOWED_USERS=111222,333444')
    expect(rawAfter).toContain('WHATSAPP_ENABLED=true')
  })

  it('Fallback chain & Mixture of Agents memvalidasi config.yaml serta menolak rekursi moa', async () => {
    const dir = await makeTempDir()
    const cfgPath = join(dir, 'config.yaml')
    await writeFile(cfgPath, 'fallback_model:\n  provider: openrouter\n  model: old/model\n', 'utf8')

    await saveFallbackChain(
      {
        chain: [
          { provider: 'openrouter', model: 'google/gemini-2.5-flash', api_key: 'sk-or-test-123456' }
        ]
      },
      { cfgPath }
    )

    await saveMoaConfig(
      {
        activePreset: 'default',
        defaultPreset: 'default',
        presetConfig: {
          fanout: 'user_turn',
          aggregator: { provider: 'openrouter', model: 'anthropic/claude-opus-4.8' },
          referenceModels: [{ provider: 'openai-codex', model: 'gpt-5.5' }]
        }
      },
      { cfgPath }
    )

    const loaded = await loadFallbackAndMoaConfig({ cfgPath, providersFile: join(dir, 'missing-providers.json') })
    expect(loaded.fallbackChain).toHaveLength(1)
    expect(loaded.fallbackChain[0].model).toBe('google/gemini-2.5-flash')
    expect(loaded.fallbackChain[0].api_key).toContain('••••')
    expect(loaded.moa.activePreset).toBe('default')
    expect(loaded.moa.fanout).toBe('user_turn')

    await expect(
      saveMoaConfig(
        {
          presetConfig: {
            aggregator: { provider: 'moa', model: 'default' },
            referenceModels: [{ provider: 'openrouter', model: 'x' }]
          }
        },
        { cfgPath }
      )
    ).rejects.toThrow('rekursif')
  })

  it('getKanbanAndSubagents membaca daftar kartu tugas dari kanban.db', async () => {
    const home = await makeTempDir()
    const kbPath = join(home, 'kanban.db')
    const db = new DatabaseSync(kbPath)
    db.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT,
        assignee TEXT,
        status TEXT NOT NULL,
        priority INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        result TEXT,
        last_failure_error TEXT
      );
    `)
    db.prepare(`INSERT INTO tasks (id, title, body, assignee, status, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'task-1', 'Integrasi Kanban UI', 'Tampilkan tugas aktif', 'default', 'ready', 10, 1700000000
    )
    db.prepare(`INSERT INTO tasks (id, title, body, assignee, status, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'task-old', 'Sudah Diarsipkan', '', '', 'archived', 1, 1600000000
    )
    db.close()

    const res = await getKanbanAndSubagents({ hermesHome: home, kanbanDbPathOverride: kbPath })
    expect(res.ok).toBe(true)
    expect(res.kanbanExists).toBe(true)
    expect(res.tasks).toHaveLength(1)
    expect(res.tasks[0].id).toBe('task-1')
    expect(res.tasks[0].title).toBe('Integrasi Kanban UI')
  })

  it('manageHermesSessionRpc menutup sesi live saat session.delete menolak active session lalu mengulangi delete', async () => {
    const calls = []
    let deleteAttempt = 0
    const mockGatewayReq = async (method, params) => {
      calls.push({ method, params })
      if (method === 'session.delete') {
        deleteAttempt++
        if (deleteAttempt === 1) {
          throw new Error('cannot delete an active session')
        }
        return { deleted: params.session_id }
      }
      if (method === 'session.active_list') {
        return {
          sessions: [
            { id: 'live99aa', session_key: '20261121_181114_e2cdbf', status: 'idle' },
            { id: 'other111', session_key: '20261120_000001_aaaaaa', status: 'idle' }
          ]
        }
      }
      if (method === 'session.close') {
        return { closed: true }
      }
      return {}
    }

    const res = await manageHermesSessionRpc(
      { action: 'delete', sessionId: '20261121_181114_e2cdbf' },
      mockGatewayReq
    )

    expect(calls.map((c) => c.method)).toEqual([
      'session.delete',
      'session.active_list',
      'session.close',
      'session.delete'
    ])
    expect(calls[2].params).toEqual({ session_id: 'live99aa' })
    expect(res.deleted).toBe('20261121_181114_e2cdbf')
    expect(res.closedActiveSession).toBe(true)
    expect(res.closedLiveIds).toEqual(['live99aa'])
  })

  it('manageHermesSessionRpc langsung menghapus sesi tidak aktif tanpa memanggil session.active_list atau session.close', async () => {
    const calls = []
    const mockGatewayReq = async (method, params) => {
      calls.push({ method, params })
      if (method === 'session.delete') {
        return { deleted: params.session_id }
      }
      return {}
    }

    const res = await manageHermesSessionRpc(
      { action: 'delete', sessionId: '20261120_000001_old000' },
      mockGatewayReq
    )

    expect(calls).toEqual([{ method: 'session.delete', params: { session_id: '20261120_000001_old000' } }])
    expect(res.deleted).toBe('20261120_000001_old000')
  })

  it('searchHermesSessions membersihkan envelope sistem pada preview dan title yang terpotong', async () => {
    const dir = await makeTempDir()
    const dbPath = join(dir, 'state.db')
    const db = new DatabaseSync(dbPath)
    db.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        session_key TEXT,
        title TEXT,
        model TEXT,
        billing_provider TEXT,
        started_at REAL NOT NULL,
        ended_at REAL,
        message_count INTEGER DEFAULT 0,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cwd TEXT
      );
      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT,
        tool_name TEXT,
        timestamp REAL NOT NULL,
        active INTEGER NOT NULL DEFAULT 1
      );
    `)

    const fullEnvelopePrompt =
      '[WAKTU & TANGGAL SISTEM SAAT INI: Sabtu, 21 November 2026, pukul 18.16 WIB.\n' +
      'ATURAN MUTLAK: Hari ini adalah Sabtu, 21 November 2026.]\n' +
      '[PANDUAN INTERAKTIF AI ASSESSMENT & PILIHAN TINDAKAN:\n' +
      'DILARANG KERAS menyertakan tag <assessment>. Cukup jawab biasa secara natural tanpa blok assessment!]\n' +
      'berikan saya ide ide bisnis dari ai'

    db.prepare(`INSERT INTO sessions (id, source, title, model, started_at, message_count) VALUES (?, ?, ?, ?, ?, ?)`).run(
      'sess-env-1',
      'tui',
      '[WAKTU & TANGGAL SISTEM SAAT INI: Sabtu, 21 November 2026',
      'gemini-3.8-flash',
      2000,
      1
    )
    db.prepare(`INSERT INTO messages (session_id, role, content, timestamp, active) VALUES (?, ?, ?, ?, 1)`).run(
      'sess-env-1',
      'user',
      fullEnvelopePrompt,
      2001
    )
    db.close()

    const listed = await searchHermesSessions({ dbPathOverride: dbPath })
    expect(listed.ok).toBe(true)
    expect(listed.sessions).toHaveLength(1)
    expect(listed.sessions[0].title).toBe('')
    expect(listed.sessions[0].preview).toBe('berikan saya ide ide bisnis dari ai')

    const matched = await searchHermesSessions({ query: 'bisnis', dbPathOverride: dbPath })
    expect(matched.ok).toBe(true)
    expect(matched.sessions).toHaveLength(1)
    expect(matched.sessions[0].title).toBe('')
    expect(matched.sessions[0].preview).toBe('berikan saya ide ide bisnis dari ai')
  })
})
