/**
 * settings-hermes-brain.js — Panel Dashboard "Hermes Brain & Otomasi" di Settings
 * Mengelola 7 kapabilitas Hermes Agent:
 *   1. Riwayat Sesi & FTS5 Search (`state.db` + `session.resume`/`delete`)
 *   2. Editor Kepribadian (`SOUL.md`) & Memori (`USER.md` / `MEMORY.md`)
 *   3. Cron Jobs & Sapaan Proaktif
 *   4. Manajemen MCP Server (`mcp_servers`)
 *   5. Messaging Gateway (`.env` + daemon `hermes gateway`)
 *   6. Native Fallback Chain & Mixture of Agents (`fallback_providers` & `moa`)
 *   7. Monitor Kanban (`kanban.db`) & Async Subagent (`delegation.status`)
 */

const SOUL_PRESETS = {
  professional:
    'You are Hermes, a focused, accurate, and polite AI executive companion. Answer concisely in Indonesian unless asked otherwise, structure technical steps clearly, and verify facts before stating them.',
  friendly:
    'Kamu adalah pendamping desktop AI yang hangat, ceria, suportif, dan santai berbahasa Indonesia. Sapa pengguna dengan ramah, beri dorongan saat pengguna bekerja, dan jelaskan hal rumit dengan bahasa sederhana.',
  tsundere:
    'Kamu adalah asisten AI desktop yang sedikit tsundere namun sebenarnya sangat perhatian dan selalu siap membantu. Gunakan bahasa Indonesia ekspresif ("Hmph, bukan berarti aku peduli ya... tapi ini sudah kubantu bereskan!"), tetapi tetap berikan jawaban teknis yang akurat dan ringkas.',
  engineer:
    'You are a pragmatic staff software engineer companion. Point out edge cases, security risks, and performance bottlenecks directly, propose verifiable commands, and keep explanations crisp and grounded in observed code.'
}

const CRON_PRESETS = {
  briefing: {
    name: 'Briefing Pagi Harian',
    schedule: '0 8 * * *',
    prompt: 'Rangkumkan cuaca hari ini di kota saya serta 3 berita teknologi utama hari ini secara ringkas dan ramah untuk briefing pagi.',
    deliver: 'local'
  },
  break: {
    name: 'Pengingat Minum & Peregangan',
    schedule: '2h',
    prompt: 'Ingatkan saya dengan singkat dan hangat untuk minum air putih dan melakukan peregangan ringan selama 1 menit.',
    deliver: 'local'
  }
}

const MCP_PRESETS = {
  filesystem: {
    id: 'filesystem',
    transport: 'stdio',
    command: 'npx',
    args: '-y @modelcontextprotocol/server-filesystem C:\\Users',
    env: ''
  },
  fetch: {
    id: 'fetch',
    transport: 'stdio',
    command: 'uvx',
    args: 'mcp-server-fetch',
    env: ''
  },
  github: {
    id: 'github',
    transport: 'stdio',
    command: 'npx',
    args: '-y @modelcontextprotocol/server-github',
    env: 'GITHUB_PERSONAL_ACCESS_TOKEN=ghp_GANTI_TOKEN_ANDA'
  },
  playwright: {
    id: 'playwright',
    transport: 'stdio',
    command: 'npx',
    args: '@playwright/mcp@latest',
    env: ''
  }
}

let activeBrainTab = 'sessions'
let selectedSessionId = null
let userEntries = []
let memoryEntries = []
let fallbackChain = []
let savedProvidersCache = []
let delegationPausedState = false
let uiDeps = { showToast: () => {}, confirmDialog: async () => true }

function formatEpoch(ts) {
  const num = Number(ts || 0)
  if (!num) return ''
  const ms = num < 1e12 ? num * 1000 : num
  try {
    return new Date(ms).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return ''
  }
}

function parseKeyValueLines(text) {
  const out = {}
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx <= 0) continue
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return out
}

function serializeKeyValueLines(obj) {
  if (!obj || typeof obj !== 'object') return ''
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
}

function makeBadge(text, variant = '') {
  const span = document.createElement('span')
  span.className = variant ? `brain-badge ${variant}` : 'brain-badge'
  span.textContent = text
  return span
}

function switchBrainTab(tabName) {
  activeBrainTab = tabName || 'sessions'
  document.querySelectorAll('[data-brain-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.brainTab === activeBrainTab)
  })
  document.querySelectorAll('[data-brain-panel]').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.brainPanel === activeBrainTab)
  })
  refreshActiveBrainTab()
}

export function refreshHermesBrainPanel() {
  refreshActiveBrainTab()
}

function refreshActiveBrainTab() {
  if (activeBrainTab === 'sessions') loadSessionsList()
  else if (activeBrainTab === 'memory') loadMemoryEditor()
  else if (activeBrainTab === 'cron') loadCronTab()
  else if (activeBrainTab === 'mcp') loadMcpTab()
  else if (activeBrainTab === 'gateway') loadGatewayTab()
  else if (activeBrainTab === 'advanced') {
    loadFallbackAndMoaTab()
    loadKanbanTab()
  }
}

// ============================================================================
// TAB 1: RIWAYAT SESI & FTS5
// ============================================================================

async function loadSessionsList() {
  const listEl = document.getElementById('brain-session-list')
  const searchInput = document.getElementById('brain-session-search')
  if (!listEl) return

  const query = searchInput?.value?.trim() || ''
  listEl.innerHTML = '<div class="muted" style="padding:8px;">Memuat sesi dari state.db…</div>'

  const res = await window.hermesAvatar?.hermesBrainGet?.('sessions', { query, limit: 60 })
  if (!res?.ok) {
    listEl.replaceChildren()
    const errDiv = document.createElement('div')
    errDiv.className = 'muted'
    errDiv.style.padding = '8px'
    errDiv.textContent = res?.error || 'Gagal memuat state.db Hermes'
    listEl.appendChild(errDiv)
    return
  }

  const sessions = Array.isArray(res.sessions) ? res.sessions : []
  if (sessions.length === 0) {
    listEl.replaceChildren()
    const emptyDiv = document.createElement('div')
    emptyDiv.className = 'muted'
    emptyDiv.style.padding = '8px'
    emptyDiv.textContent = res.missingDb
      ? 'Database state.db Hermes belum ditemukan.'
      : (query ? 'Tidak ada sesi yang cocok.' : 'Belum ada riwayat percakapan.')
    listEl.appendChild(emptyDiv)
    return
  }

  listEl.replaceChildren()
  for (const s of sessions) {
    const card = document.createElement('div')
    card.className = `brain-list-card ${s.id === selectedSessionId ? 'selected' : ''}`

    const head = document.createElement('div')
    head.className = 'brain-list-card-head'
    const title = document.createElement('span')
    title.className = 'brain-list-card-title'
    title.textContent = s.title || s.preview || `Sesi ${s.id}`
    const badge = makeBadge(s.source || 'tui')
    head.appendChild(title)
    head.appendChild(badge)

    const sub = document.createElement('div')
    sub.className = 'brain-list-card-sub'
    sub.textContent = [
      formatEpoch(s.startedAt),
      s.messageCount ? `${s.messageCount} pesan` : '',
      s.model || ''
    ].filter(Boolean).join(' · ')

    card.appendChild(head)
    card.appendChild(sub)
    if (s.preview && s.title && s.preview !== s.title) {
      const prev = document.createElement('div')
      prev.className = 'brain-list-card-sub'
      prev.style.opacity = '0.85'
      prev.textContent = s.preview
      card.appendChild(prev)
    }

    card.addEventListener('click', () => {
      selectedSessionId = s.id
      loadSessionsList()
      loadSessionDetail(s.id)
    })

    listEl.appendChild(card)
  }
}

async function loadSessionDetail(sessionId) {
  const titleEl = document.getElementById('brain-session-detail-title')
  const metaEl = document.getElementById('brain-session-detail-meta')
  const msgsEl = document.getElementById('brain-session-messages')
  const resumeBtn = document.getElementById('brain-session-resume-btn')
  const delBtn = document.getElementById('brain-session-delete-btn')
  if (!msgsEl) return

  msgsEl.innerHTML = '<div class="muted">Memuat transkrip sesi…</div>'
  const res = await window.hermesAvatar?.hermesBrainGet?.('sessions', { sessionId })
  if (!res?.ok || !res.session) {
    if (titleEl) titleEl.textContent = 'Gagal memuat detail sesi'
    if (metaEl) metaEl.textContent = res?.error || ''
    msgsEl.innerHTML = '<div class="muted">Transkrip tidak tersedia.</div>'
    if (resumeBtn) resumeBtn.disabled = true
    if (delBtn) delBtn.disabled = true
    return
  }

  const s = res.session
  if (titleEl) titleEl.textContent = s.title || `Sesi ${s.id}`
  if (metaEl) {
    metaEl.textContent = [
      `ID: ${s.id}`,
      `Sumber: ${s.source || '-'}`,
      s.model ? `Model: ${s.model}` : '',
      `Token: ${(s.inputTokens || 0) + (s.outputTokens || 0)}`
    ].filter(Boolean).join(' · ')
  }
  if (resumeBtn) resumeBtn.disabled = false
  if (delBtn) delBtn.disabled = false

  const msgs = Array.isArray(res.messages) ? res.messages : []
  if (msgs.length === 0) {
    msgsEl.innerHTML = '<div class="muted">Belum ada pesan tersimpan pada sesi ini.</div>'
    return
  }

  msgsEl.replaceChildren()
  for (const m of msgs) {
    const bubble = document.createElement('div')
    bubble.className = `brain-msg-bubble ${m.role === 'user' ? 'user' : 'assistant'}`
    const label = m.role === 'user' ? 'Kamu' : 'Hermes'
    let rawText = String(m.content || m.text || m.body || '').trim()
    if (m.role === 'user' && rawText.includes('[WAKTU & TANGGAL SISTEM SAAT INI:')) {
      const marker = 'DILARANG KERAS menyertakan tag <assessment>. Cukup jawab biasa secara natural tanpa blok assessment!]'
      const idx = rawText.indexOf(marker)
      if (idx >= 0) {
        rawText = rawText.slice(idx + marker.length).trim()
      } else {
        const altIdx = rawText.lastIndexOf(']\n')
        if (altIdx >= 0) rawText = rawText.slice(altIdx + 2).trim()
      }
    }
    const text = rawText.slice(0, 1500)
    bubble.textContent = `[${label}] ${text}`
    msgsEl.appendChild(bubble)
  }
}

// ============================================================================
// TAB 2: KEPRIBADIAN (SOUL.md) & MEMORI (USER.md / MEMORY.md)
// ============================================================================

function renderMemoryEntriesList(containerId, countId, list, onDelete) {
  const el = document.getElementById(containerId)
  const countEl = document.getElementById(countId)
  if (countEl) countEl.textContent = `${list.length} entri`
  if (!el) return

  if (list.length === 0) {
    el.innerHTML = '<div class="muted" style="padding:6px;">Belum ada entri tersimpan.</div>'
    return
  }

  el.replaceChildren()
  list.forEach((entryText, idx) => {
    const row = document.createElement('div')
    row.className = 'brain-entry-row'
    const txt = document.createElement('div')
    txt.className = 'brain-entry-text'
    txt.textContent = entryText
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'mini-btn del'
    btn.textContent = '✕'
    btn.title = 'Hapus butir memori ini'
    btn.addEventListener('click', () => onDelete(idx))
    row.appendChild(txt)
    row.appendChild(btn)
    el.appendChild(row)
  })
}

async function loadMemoryEditor() {
  const res = await window.hermesAvatar?.hermesBrainGet?.('memory')
  if (!res?.ok) {
    uiDeps.showToast('Gagal Memuat Memori', res?.error || 'Tidak dapat membaca file memori', 'error', '❌')
    return
  }

  const soulEd = document.getElementById('brain-soul-editor')
  const soulPath = document.getElementById('brain-soul-path')
  if (soulEd) soulEd.value = res.soul?.content || ''
  if (soulPath) soulPath.textContent = res.soul?.path || ''

  userEntries = Array.isArray(res.user?.entries) ? [...res.user.entries] : []
  memoryEntries = Array.isArray(res.memory?.entries) ? [...res.memory.entries] : []

  const userRaw = document.getElementById('brain-user-raw')
  const memRaw = document.getElementById('brain-memory-raw')
  if (userRaw) userRaw.value = res.user?.content || ''
  if (memRaw) memRaw.value = res.memory?.content || ''

  const rerenderUser = () => {
    renderMemoryEntriesList('brain-user-entries', 'brain-user-count', userEntries, (idx) => {
      userEntries.splice(idx, 1)
      if (userRaw) userRaw.value = userEntries.join('\n§\n')
      rerenderUser()
    })
  }
  const rerenderMem = () => {
    renderMemoryEntriesList('brain-memory-entries', 'brain-memory-count', memoryEntries, (idx) => {
      memoryEntries.splice(idx, 1)
      if (memRaw) memRaw.value = memoryEntries.join('\n§\n')
      rerenderMem()
    })
  }
  rerenderUser()
  rerenderMem()
}

// ============================================================================
// TAB 3: CRON JOBS & PROAKTIF
// ============================================================================

async function loadCronTab() {
  const statusEl = document.getElementById('brain-cron-ticker-status')
  const listEl = document.getElementById('brain-cron-list')
  if (!listEl) return

  listEl.innerHTML = '<div class="muted" style="padding:8px;">Memuat jadwal cron…</div>'
  const res = await window.hermesAvatar?.hermesBrainGet?.('cron')
  if (!res?.ok) {
    listEl.replaceChildren()
    const div = document.createElement('div')
    div.className = 'muted'
    div.textContent = res?.error || 'Gagal membaca cron/jobs.json'
    listEl.appendChild(div)
    return
  }

  if (statusEl) {
    if (res.tickerActive) {
      statusEl.textContent = `Ticker Gateway aktif (heartbeat ${res.tickerAgeSeconds ?? 0}s lalu) + Watcher Avatar aktif.`
    } else {
      statusEl.textContent = 'Ticker Gateway tidak aktif — Watcher Avatar otomatis menjalankan cron fallback saat app terbuka.'
    }
  }

  const jobs = Array.isArray(res.jobs) ? res.jobs : []
  if (jobs.length === 0) {
    listEl.innerHTML = '<div class="muted" style="padding:8px;">Belum ada jadwal cron. Gunakan preset 1-klik atau form di atas.</div>'
    return
  }

  listEl.replaceChildren()
  for (const job of jobs) {
    const card = document.createElement('div')
    card.className = 'brain-list-card'
    card.style.cursor = 'default'

    const head = document.createElement('div')
    head.className = 'brain-list-card-head'
    const title = document.createElement('span')
    title.className = 'brain-list-card-title'
    title.textContent = job.name || job.jobId

    const rightWrap = document.createElement('div')
    rightWrap.style.display = 'flex'
    rightWrap.style.gap = '6px'
    rightWrap.style.alignItems = 'center'

    rightWrap.appendChild(makeBadge(job.enabled ? 'Aktif' : 'Paused', job.enabled ? 'ok' : 'warn'))
    if (job.schedule) rightWrap.appendChild(makeBadge(job.schedule))

    head.appendChild(title)
    head.appendChild(rightWrap)
    card.appendChild(head)

    const sub = document.createElement('div')
    sub.className = 'brain-list-card-sub'
    sub.textContent = [
      `Deliver: ${job.deliver || 'local'}`,
      job.nextRunAt ? `Berikutnya: ${job.nextRunAt}` : '',
      job.lastStatus ? `Status terakhir: ${job.lastStatus}` : ''
    ].filter(Boolean).join(' · ')
    card.appendChild(sub)

    if (job.lastOutput?.response) {
      const prev = document.createElement('div')
      prev.className = 'brain-list-card-sub'
      prev.style.marginTop = '4px'
      prev.textContent = `Output terakhir (${job.lastOutput.runTime || '-'}): ${job.lastOutput.response.slice(0, 180)}`
      card.appendChild(prev)
    }

    const actions = document.createElement('div')
    actions.style.display = 'flex'
    actions.style.gap = '6px'
    actions.style.marginTop = '6px'

    const runBtn = document.createElement('button')
    runBtn.type = 'button'
    runBtn.className = 'mini-btn secondary'
    runBtn.textContent = 'Run Now'
    runBtn.addEventListener('click', () => handleCronAction('run', job.jobId))

    const toggleBtn = document.createElement('button')
    toggleBtn.type = 'button'
    toggleBtn.className = 'mini-btn secondary'
    toggleBtn.textContent = job.enabled ? 'Pause' : 'Resume'
    toggleBtn.addEventListener('click', () => handleCronAction(job.enabled ? 'pause' : 'resume', job.jobId))

    const delBtn = document.createElement('button')
    delBtn.type = 'button'
    delBtn.className = 'mini-btn del'
    delBtn.textContent = 'Hapus'
    delBtn.addEventListener('click', async () => {
      const ok = await uiDeps.confirmDialog('Hapus Jadwal Cron?', `Jadwal "${job.name}" akan dihapus permanen.`)
      if (ok) handleCronAction('remove', job.jobId)
    })

    actions.appendChild(runBtn)
    actions.appendChild(toggleBtn)
    actions.appendChild(delBtn)
    card.appendChild(actions)
    listEl.appendChild(card)
  }
}

async function handleCronAction(action, jobId) {
  uiDeps.showToast('Memproses Cron…', `Menjalankan ${action}…`, 'running', '⏰')
  const res = await window.hermesAvatar?.hermesBrainSet?.('cron-manage', { action, jobId, name: jobId })
  if (res?.ok) {
    uiDeps.showToast('Cron Diperbarui', `Aksi "${action}" berhasil.`, 'success', '⏰')
    loadCronTab()
  } else {
    uiDeps.showToast('Gagal Memproses Cron', res?.error || 'Terjadi kesalahan', 'error', '❌')
  }
}

// ============================================================================
// TAB 4: MCP SERVER MANAGER
// ============================================================================

function updateMcpTransportFields() {
  const tr = document.getElementById('brain-mcp-transport')?.value || 'stdio'
  const stdioBox = document.getElementById('brain-mcp-stdio-fields')
  const urlBox = document.getElementById('brain-mcp-url-fields')
  if (tr === 'http' || tr === 'sse') {
    stdioBox?.setAttribute('hidden', '')
    urlBox?.removeAttribute('hidden')
  } else {
    stdioBox?.removeAttribute('hidden')
    urlBox?.setAttribute('hidden', '')
  }
}

async function loadMcpTab() {
  const listEl = document.getElementById('brain-mcp-list')
  if (!listEl) return

  const res = await window.hermesAvatar?.hermesBrainGet?.('mcp')
  if (!res?.ok) {
    listEl.innerHTML = '<div class="muted">Gagal memuat daftar MCP dari config.yaml.</div>'
    return
  }

  const servers = Array.isArray(res.servers) ? res.servers : []
  if (servers.length === 0) {
    listEl.innerHTML = '<div class="muted" style="padding:8px;">Belum ada MCP server terpasang. Pilih preset populer atau isi form di atas.</div>'
    return
  }

  listEl.replaceChildren()
  for (const srv of servers) {
    const card = document.createElement('div')
    card.className = 'brain-list-card'
    card.style.cursor = 'default'

    const head = document.createElement('div')
    head.className = 'brain-list-card-head'
    const title = document.createElement('span')
    title.className = 'brain-list-card-title'
    title.textContent = srv.id

    const badges = document.createElement('div')
    badges.style.display = 'flex'
    badges.style.gap = '6px'
    badges.appendChild(makeBadge(srv.enabled ? 'Aktif' : 'Nonaktif', srv.enabled ? 'ok' : 'warn'))
    badges.appendChild(makeBadge(srv.transport))
    head.appendChild(title)
    head.appendChild(badges)
    card.appendChild(head)

    const sub = document.createElement('div')
    sub.className = 'brain-list-card-sub'
    sub.textContent = srv.url
      ? `URL: ${srv.url}`
      : `Cmd: ${srv.command} ${(srv.args || []).join(' ')}`
    card.appendChild(sub)

    const actions = document.createElement('div')
    actions.style.display = 'flex'
    actions.style.gap = '6px'
    actions.style.marginTop = '6px'

    const editBtn = document.createElement('button')
    editBtn.type = 'button'
    editBtn.className = 'mini-btn secondary'
    editBtn.textContent = 'Edit'
    editBtn.addEventListener('click', () => {
      document.getElementById('brain-mcp-id').value = srv.id
      document.getElementById('brain-mcp-transport').value = srv.transport || 'stdio'
      document.getElementById('brain-mcp-timeout').value = String(srv.timeout || 120)
      document.getElementById('brain-mcp-command').value = srv.command || ''
      document.getElementById('brain-mcp-args').value = (srv.args || []).join(' ')
      document.getElementById('brain-mcp-url').value = srv.url || ''
      document.getElementById('brain-mcp-env').value = srv.url
        ? serializeKeyValueLines(srv.headers)
        : serializeKeyValueLines(srv.env)
      updateMcpTransportFields()
    })

    const toggleBtn = document.createElement('button')
    toggleBtn.type = 'button'
    toggleBtn.className = 'mini-btn secondary'
    toggleBtn.textContent = srv.enabled ? 'Nonaktifkan' : 'Aktifkan'
    toggleBtn.addEventListener('click', async () => {
      const r = await window.hermesAvatar?.hermesBrainSet?.('mcp-toggle', { id: srv.id, enabled: !srv.enabled })
      if (r?.ok) {
        uiDeps.showToast('MCP Diperbarui', `${srv.id} sekarang ${!srv.enabled ? 'aktif' : 'nonaktif'}.`, 'success', '🔌')
        loadMcpTab()
      } else {
        uiDeps.showToast('Gagal Toggle MCP', r?.error || 'Error', 'error', '❌')
      }
    })

    const delBtn = document.createElement('button')
    delBtn.type = 'button'
    delBtn.className = 'mini-btn del'
    delBtn.textContent = 'Hapus'
    delBtn.addEventListener('click', async () => {
      const ok = await uiDeps.confirmDialog('Hapus Server MCP?', `Hapus konfigurasi MCP "${srv.id}" dari config.yaml?`)
      if (!ok) return
      const r = await window.hermesAvatar?.hermesBrainSet?.('mcp-delete', { id: srv.id })
      if (r?.ok) {
        uiDeps.showToast('MCP Dihapus', `Server "${srv.id}" dihapus.`, 'info', '🗑️')
        loadMcpTab()
      } else {
        uiDeps.showToast('Gagal Hapus MCP', r?.error || 'Error', 'error', '❌')
      }
    })

    actions.appendChild(editBtn)
    actions.appendChild(toggleBtn)
    actions.appendChild(delBtn)
    card.appendChild(actions)
    listEl.appendChild(card)
  }
}

// ============================================================================
// TAB 5: MESSAGING GATEWAY
// ============================================================================

async function loadGatewayTab() {
  const statusEl = document.getElementById('brain-gw-status-text')
  const platformsEl = document.getElementById('brain-gw-platforms')
  const res = await window.hermesAvatar?.hermesBrainGet?.('gateway')
  if (!res?.ok) {
    if (statusEl) statusEl.textContent = res?.error || 'Gagal memeriksa status gateway'
    return
  }

  if (statusEl) {
    statusEl.textContent = res.running
      ? `Gateway Aktif (PID ${res.pid}) · State: ${res.gatewayState}`
      : `Gateway Belum Berjalan (State terakhir: ${res.gatewayState || 'stopped'})`
  }

  if (platformsEl) {
    platformsEl.replaceChildren()
    const entries = Object.entries(res.platforms || {})
    if (entries.length === 0) {
      platformsEl.appendChild(makeBadge('Belum ada platform aktif terdeteksi', 'warn'))
    } else {
      for (const [pname, pinfo] of entries) {
        const connected = pinfo?.state === 'connected'
        platformsEl.appendChild(
          makeBadge(`${pname}: ${pinfo?.state || 'unknown'}`, connected ? 'ok' : 'err')
        )
      }
    }
  }

  const env = res.env || {}
  const setVal = (id, v) => {
    const el = document.getElementById(id)
    if (el) el.value = v || ''
  }
  setVal('brain-gw-tg-token', env.TELEGRAM_BOT_TOKEN)
  setVal('brain-gw-tg-users', env.TELEGRAM_ALLOWED_USERS)
  setVal('brain-gw-tg-home', env.TELEGRAM_HOME_CHANNEL)
  setVal('brain-gw-dc-token', env.DISCORD_BOT_TOKEN)
  setVal('brain-gw-dc-home', env.DISCORD_HOME_CHANNEL)
  setVal('brain-gw-sl-token', env.SLACK_BOT_TOKEN)
  setVal('brain-gw-wa-enabled', env.WHATSAPP_ENABLED)
  setVal('brain-gw-wa-home', env.WHATSAPP_HOME_CHANNEL)
  setVal('brain-gw-allow-all', env.GATEWAY_ALLOW_ALL_USERS || 'false')
}

async function runGatewayControl(action) {
  uiDeps.showToast('Mengatur Gateway…', `Menjalankan ${action}…`, 'running', '📱')
  const res = await window.hermesAvatar?.hermesBrainSet?.('gateway-control', { action })
  if (res?.ok) {
    uiDeps.showToast('Gateway Berhasil', res.output || `Aksi "${action}" selesai.`, 'success', '📱')
    setTimeout(loadGatewayTab, 800)
  } else {
    uiDeps.showToast('Perintah Gateway Gagal', res?.error || 'Pastikan service/jadwal sudah terpasang atau gunakan Run Background.', 'error', '❌', 6000)
  }
}

// ============================================================================
// TAB 6: FALLBACK CHAIN, MIXTURE OF AGENTS & KANBAN/SUBAGENT
// ============================================================================

function renderFallbackList() {
  const listEl = document.getElementById('brain-fb-list')
  if (!listEl) return

  if (fallbackChain.length === 0) {
    listEl.innerHTML = '<div class="muted" style="padding:6px;">Belum ada fallback provider native di config.yaml.</div>'
    return
  }

  listEl.replaceChildren()
  fallbackChain.forEach((entry, idx) => {
    const row = document.createElement('div')
    row.className = 'brain-entry-row'
    const text = document.createElement('div')
    text.className = 'brain-entry-text'
    text.textContent = `${idx + 1}. ${entry.model} (${entry.provider})${entry.base_url ? ` · ${entry.base_url}` : ''}`

    const delBtn = document.createElement('button')
    delBtn.type = 'button'
    delBtn.className = 'mini-btn del'
    delBtn.textContent = '✕'
    delBtn.addEventListener('click', () => {
      fallbackChain.splice(idx, 1)
      renderFallbackList()
    })

    row.appendChild(text)
    row.appendChild(delBtn)
    listEl.appendChild(row)
  })
}

async function loadFallbackAndMoaTab() {
  const res = await window.hermesAvatar?.hermesBrainGet?.('fallback-moa')
  if (!res?.ok) return

  fallbackChain = Array.isArray(res.fallbackChain) ? [...res.fallbackChain] : []
  savedProvidersCache = Array.isArray(res.savedProviders) ? res.savedProviders : []
  renderFallbackList()

  const pickEl = document.getElementById('brain-fb-saved-pick')
  if (pickEl) {
    pickEl.innerHTML = '<option value="">-- Isi manual atau pilih tersimpan --</option>'
    for (const sp of savedProvidersCache) {
      const opt = document.createElement('option')
      opt.value = sp.id
      opt.textContent = `${sp.name} — ${sp.model}`
      pickEl.appendChild(opt)
    }
  }

  const moa = res.moa || {}
  const activeSel = document.getElementById('brain-moa-active')
  if (activeSel) activeSel.value = moa.activePreset ? (moa.defaultPreset || 'default') : ''
  const fanoutSel = document.getElementById('brain-moa-fanout')
  if (fanoutSel) fanoutSel.value = moa.fanout || 'per_iteration'
  const aggProv = document.getElementById('brain-moa-agg-provider')
  const aggModel = document.getElementById('brain-moa-agg-model')
  if (aggProv) aggProv.value = moa.aggregator?.provider || ''
  if (aggModel) aggModel.value = moa.aggregator?.model || ''
  const refsBox = document.getElementById('brain-moa-refs')
  if (refsBox) {
    const refs = Array.isArray(moa.referenceModels) ? moa.referenceModels : []
    refsBox.value = refs.map((r) => `${r.provider}|${r.model}`).join('\n')
  }
}

async function loadKanbanTab() {
  const kbList = document.getElementById('brain-kanban-list')
  const subMeta = document.getElementById('brain-subagent-meta')
  const subList = document.getElementById('brain-subagent-list')
  const pauseBtn = document.getElementById('brain-subagent-pause-btn')

  const res = await window.hermesAvatar?.hermesBrainGet?.('kanban')
  if (!res?.ok) return

  if (kbList) {
    const tasks = Array.isArray(res.tasks) ? res.tasks : []
    if (tasks.length === 0) {
      kbList.innerHTML = '<div class="muted" style="padding:6px;">Belum ada kartu tugas aktif di kanban.db.</div>'
    } else {
      kbList.replaceChildren()
      for (const t of tasks) {
        const card = document.createElement('div')
        card.className = 'brain-list-card'
        card.style.cursor = 'default'
        const head = document.createElement('div')
        head.className = 'brain-list-card-head'
        const title = document.createElement('span')
        title.className = 'brain-list-card-title'
        title.textContent = t.title
        const badgeVariant = t.status === 'done' ? 'ok' : (t.status === 'blocked' ? 'err' : '')
        head.appendChild(title)
        head.appendChild(makeBadge(t.status || 'todo', badgeVariant))
        card.appendChild(head)

        const sub = document.createElement('div')
        sub.className = 'brain-list-card-sub'
        sub.textContent = [
          `ID: ${t.id}`,
          t.assignee ? `Assignee: ${t.assignee}` : '',
          t.lastFailureError ? `Error: ${t.lastFailureError}` : ''
        ].filter(Boolean).join(' · ')
        card.appendChild(sub)

        const rowAct = document.createElement('div')
        rowAct.style.display = 'flex'
        rowAct.style.gap = '6px'
        rowAct.style.marginTop = '5px'

        const doneBtn = document.createElement('button')
        doneBtn.type = 'button'
        doneBtn.className = 'mini-btn secondary'
        doneBtn.textContent = 'Selesai'
        doneBtn.addEventListener('click', () => handleKanbanAction('kanban-complete', { taskId: t.id }))

        const archBtn = document.createElement('button')
        archBtn.type = 'button'
        archBtn.className = 'mini-btn del'
        archBtn.textContent = 'Arsipkan'
        archBtn.addEventListener('click', () => handleKanbanAction('kanban-archive', { taskId: t.id }))

        rowAct.appendChild(doneBtn)
        rowAct.appendChild(archBtn)
        card.appendChild(rowAct)
        kbList.appendChild(card)
      }
    }
  }

  const del = res.delegation || {}
  delegationPausedState = Boolean(del.paused)
  if (pauseBtn) {
    pauseBtn.textContent = delegationPausedState ? 'Lanjutkan Spawn' : 'Pause Spawn'
  }
  if (subMeta) {
    subMeta.textContent = del.connected
      ? `Gateway terhubung · Subagent aktif: ${(del.active || []).length} / maks ${del.maxConcurrentChildren || 3} · Status: ${del.paused ? 'DIJEDA' : 'Aktif'}`
      : 'Menampilkan riwayat delegasi subagent dari state.db (hubungkan hermes serve untuk kontrol live).'
  }

  if (subList) {
    const active = Array.isArray(del.active) ? del.active : []
    const recent = Array.isArray(res.recentSubagents) ? res.recentSubagents : []
    if (active.length === 0 && recent.length === 0) {
      subList.innerHTML = '<div class="muted" style="padding:6px;">Belum ada aktivitas subagent.</div>'
      return
    }
    subList.replaceChildren()

    for (const act of active) {
      const card = document.createElement('div')
      card.className = 'brain-list-card'
      const head = document.createElement('div')
      head.className = 'brain-list-card-head'
      const title = document.createElement('span')
      title.className = 'brain-list-card-title'
      title.textContent = act.goal || act.task || act.subagent_id || 'Subagent Aktif'
      head.appendChild(title)
      head.appendChild(makeBadge('RUNNING', 'ok'))
      card.appendChild(head)

      const sid = act.subagent_id || act.id
      if (sid) {
        const stopBtn = document.createElement('button')
        stopBtn.type = 'button'
        stopBtn.className = 'mini-btn del'
        stopBtn.style.marginTop = '4px'
        stopBtn.textContent = 'Hentikan Subagent'
        stopBtn.addEventListener('click', () => handleKanbanAction('subagent-interrupt', { subagentId: sid }))
        card.appendChild(stopBtn)
      }
      subList.appendChild(card)
    }

    for (const r of recent) {
      const row = document.createElement('div')
      row.className = 'brain-entry-row'
      const txt = document.createElement('div')
      txt.className = 'brain-entry-text'
      txt.textContent = `${r.title || `Subagent ${r.id}`} · ${formatEpoch(r.startedAt)} ${r.model ? `(${r.model})` : ''}`
      row.appendChild(txt)
      row.appendChild(makeBadge(r.endedAt ? 'Selesai' : 'Riwayat'))
      subList.appendChild(row)
    }
  }
}

async function handleKanbanAction(action, payload = {}) {
  const res = await window.hermesAvatar?.hermesBrainSet?.('kanban-manage', { action, ...payload })
  if (res?.ok || res?.paused !== undefined) {
    uiDeps.showToast('Berhasil', 'Status Kanban/Subagent diperbarui.', 'success', '📋')
    loadKanbanTab()
  } else {
    uiDeps.showToast('Gagal Mengubah Status', res?.error || 'Terjadi kesalahan', 'error', '❌')
  }
}

// ============================================================================
// INISIALISASI EVENT LISTENER PANEL
// ============================================================================

export function initHermesBrainPanel({ showToast, confirmDialog } = {}) {
  if (typeof showToast === 'function') uiDeps.showToast = showToast
  if (typeof confirmDialog === 'function') uiDeps.confirmDialog = confirmDialog

  // Navigasi sub-tab
  document.querySelectorAll('[data-brain-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchBrainTab(btn.dataset.brainTab))
  })

  // --- Tab 1: Sessions ---
  let sessionSearchTimer = null
  document.getElementById('brain-session-search')?.addEventListener('input', () => {
    clearTimeout(sessionSearchTimer)
    sessionSearchTimer = setTimeout(loadSessionsList, 220)
  })
  document.getElementById('brain-session-refresh-btn')?.addEventListener('click', loadSessionsList)
  document.getElementById('brain-session-resume-btn')?.addEventListener('click', async () => {
    if (!selectedSessionId) return
    const res = await window.hermesAvatar?.resumeSessionInAvatar?.(selectedSessionId)
    if (res?.ok) {
      uiDeps.showToast('Sesi Dilanjutkan', 'Chat Avatar dibuka dengan riwayat sesi terpilih.', 'success', '💬')
    } else {
      uiDeps.showToast('Gagal Membuka Sesi', res?.error || 'Error', 'error', '❌')
    }
  })
  document.getElementById('brain-session-delete-btn')?.addEventListener('click', async () => {
    if (!selectedSessionId) return
    const ok = await uiDeps.confirmDialog('Hapus Sesi Hermes?', `Sesi "${selectedSessionId}" beserta transkripnya akan dihapus.`)
    if (!ok) return
    const delBtn = document.getElementById('brain-session-delete-btn')
    const resumeBtn = document.getElementById('brain-session-resume-btn')
    const titleEl = document.getElementById('brain-session-detail-title')
    const metaEl = document.getElementById('brain-session-detail-meta')
    const msgsEl = document.getElementById('brain-session-messages')
    if (delBtn) delBtn.disabled = true
    try {
      const res = await window.hermesAvatar?.hermesBrainSet?.('session-delete', { sessionId: selectedSessionId })
      if (res?.ok) {
        const msg = res.closedActiveSession
          ? 'Sesi aktif berhasil ditutup dan dihapus dari Hermes.'
          : 'Sesi berhasil dihapus dari Hermes.'
        uiDeps.showToast('Sesi Dihapus', msg, 'info', '🗑️')
        selectedSessionId = null
        if (titleEl) titleEl.textContent = 'Pilih sesi di sebelah kiri'
        if (metaEl) metaEl.textContent = ''
        if (resumeBtn) resumeBtn.disabled = true
        if (delBtn) delBtn.disabled = true
        if (msgsEl) msgsEl.innerHTML = '<div class="muted">Pilih sesi lain di sebelah kiri.</div>'
        loadSessionsList()
      } else {
        uiDeps.showToast('Gagal Hapus Sesi', res?.error || 'Pastikan hermes serve aktif', 'error', '❌')
      }
    } finally {
      if (delBtn) delBtn.disabled = !selectedSessionId
    }
  })

  // --- Tab 2: Memory & SOUL ---
  document.querySelectorAll('.brain-soul-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const txt = SOUL_PRESETS[btn.dataset.preset]
      const ed = document.getElementById('brain-soul-editor')
      if (txt && ed) ed.value = txt
    })
  })
  document.getElementById('brain-soul-save-btn')?.addEventListener('click', async () => {
    const content = document.getElementById('brain-soul-editor')?.value || ''
    const res = await window.hermesAvatar?.hermesBrainSet?.('memory-save', { target: 'soul', content })
    if (res?.ok) uiDeps.showToast('SOUL.md Disimpan', 'Kepribadian Hermes berhasil diperbarui.', 'success', '🧠')
    else uiDeps.showToast('Gagal Simpan SOUL.md', res?.error || 'Error', 'error', '❌')
  })

  document.getElementById('brain-user-add-btn')?.addEventListener('click', () => {
    const inp = document.getElementById('brain-user-add-input')
    const rawBox = document.getElementById('brain-user-raw')
    const val = String(inp?.value || '').trim()
    if (!val) return
    userEntries.push(val)
    if (inp) inp.value = ''
    if (rawBox) rawBox.value = userEntries.join('\n§\n')
    const rerender = () => {
      renderMemoryEntriesList('brain-user-entries', 'brain-user-count', userEntries, (idx) => {
        userEntries.splice(idx, 1)
        if (rawBox) rawBox.value = userEntries.join('\n§\n')
        rerender()
      })
    }
    rerender()
  })
  document.getElementById('brain-user-save-btn')?.addEventListener('click', async () => {
    const rawBox = document.getElementById('brain-user-raw')
    const res = await window.hermesAvatar?.hermesBrainSet?.('memory-save', {
      target: 'user',
      content: rawBox ? rawBox.value : undefined,
      entries: userEntries
    })
    if (res?.ok) {
      uiDeps.showToast('USER.md Disimpan', 'Profil pengguna diperbarui dengan aman.', 'success', '🧠')
      loadMemoryEditor()
    } else {
      uiDeps.showToast('Gagal Simpan USER.md', res?.error || 'Error', 'error', '❌')
    }
  })

  document.getElementById('brain-memory-add-btn')?.addEventListener('click', () => {
    const inp = document.getElementById('brain-memory-add-input')
    const rawBox = document.getElementById('brain-memory-raw')
    const val = String(inp?.value || '').trim()
    if (!val) return
    memoryEntries.push(val)
    if (inp) inp.value = ''
    if (rawBox) rawBox.value = memoryEntries.join('\n§\n')
    const rerender = () => {
      renderMemoryEntriesList('brain-memory-entries', 'brain-memory-count', memoryEntries, (idx) => {
        memoryEntries.splice(idx, 1)
        if (rawBox) rawBox.value = memoryEntries.join('\n§\n')
        rerender()
      })
    }
    rerender()
  })
  document.getElementById('brain-memory-save-btn')?.addEventListener('click', async () => {
    const rawBox = document.getElementById('brain-memory-raw')
    const res = await window.hermesAvatar?.hermesBrainSet?.('memory-save', {
      target: 'memory',
      content: rawBox ? rawBox.value : undefined,
      entries: memoryEntries
    })
    if (res?.ok) {
      uiDeps.showToast('MEMORY.md Disimpan', 'Fakta memori Hermes diperbarui dengan aman.', 'success', '🧠')
      loadMemoryEditor()
    } else {
      uiDeps.showToast('Gagal Simpan MEMORY.md', res?.error || 'Error', 'error', '❌')
    }
  })

  // --- Tab 3: Cron Jobs ---
  document.querySelectorAll('.brain-cron-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = CRON_PRESETS[btn.dataset.cronPreset]
      if (!p) return
      document.getElementById('brain-cron-name').value = p.name
      document.getElementById('brain-cron-schedule').value = p.schedule
      document.getElementById('brain-cron-prompt').value = p.prompt
      document.getElementById('brain-cron-deliver').value = p.deliver
    })
  })
  document.getElementById('brain-cron-add-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('brain-cron-name')?.value || ''
    const schedule = document.getElementById('brain-cron-schedule')?.value || ''
    const prompt = document.getElementById('brain-cron-prompt')?.value || ''
    const deliver = document.getElementById('brain-cron-deliver')?.value || 'local'
    const res = await window.hermesAvatar?.hermesBrainSet?.('cron-manage', {
      action: 'add',
      name,
      schedule,
      prompt,
      deliver
    })
    if (res?.ok) {
      uiDeps.showToast('Jadwal Cron Dibuat', 'Tugas terjadwal baru berhasil ditambahkan.', 'success', '⏰')
      loadCronTab()
    } else {
      uiDeps.showToast('Gagal Membuat Jadwal', res?.error || 'Periksa format schedule & prompt.', 'error', '❌')
    }
  })
  document.getElementById('brain-cron-tick-btn')?.addEventListener('click', () => handleCronAction('tick', ''))
  document.getElementById('brain-cron-refresh-btn')?.addEventListener('click', loadCronTab)

  // --- Tab 4: MCP ---
  document.getElementById('brain-mcp-transport')?.addEventListener('change', updateMcpTransportFields)
  document.querySelectorAll('.brain-mcp-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = MCP_PRESETS[btn.dataset.mcpPreset]
      if (!p) return
      document.getElementById('brain-mcp-id').value = p.id
      document.getElementById('brain-mcp-transport').value = p.transport
      document.getElementById('brain-mcp-command').value = p.command
      document.getElementById('brain-mcp-args').value = p.args
      document.getElementById('brain-mcp-url').value = ''
      document.getElementById('brain-mcp-env').value = p.env
      updateMcpTransportFields()
    })
  })
  document.getElementById('brain-mcp-clear-btn')?.addEventListener('click', () => {
    ['brain-mcp-id', 'brain-mcp-command', 'brain-mcp-args', 'brain-mcp-url', 'brain-mcp-env'].forEach((id) => {
      const el = document.getElementById(id)
      if (el) el.value = ''
    })
    document.getElementById('brain-mcp-transport').value = 'stdio'
    document.getElementById('brain-mcp-timeout').value = '120'
    updateMcpTransportFields()
  })
  document.getElementById('brain-mcp-save-btn')?.addEventListener('click', async () => {
    const id = document.getElementById('brain-mcp-id')?.value || ''
    const transport = document.getElementById('brain-mcp-transport')?.value || 'stdio'
    const timeout = Number(document.getElementById('brain-mcp-timeout')?.value || 120)
    const command = document.getElementById('brain-mcp-command')?.value || ''
    const args = document.getElementById('brain-mcp-args')?.value || ''
    const url = document.getElementById('brain-mcp-url')?.value || ''
    const kv = parseKeyValueLines(document.getElementById('brain-mcp-env')?.value || '')

    const res = await window.hermesAvatar?.hermesBrainSet?.('mcp-save', {
      id,
      serverConfig: {
        transport,
        timeout,
        command,
        args,
        url,
        ...(transport === 'http' || transport === 'sse' ? { headers: kv } : { env: kv }),
        enabled: true
      }
    })
    if (res?.ok) {
      uiDeps.showToast('MCP Disimpan', res.reloaded ? 'MCP aktif dimuat ulang ke Hermes.' : 'Disimpan ke config.yaml.', 'success', '🔌')
      loadMcpTab()
    } else {
      uiDeps.showToast('Gagal Simpan MCP', res?.error || 'Periksa konfigurasi MCP', 'error', '❌')
    }
  })

  // --- Tab 5: Messaging Gateway ---
  document.getElementById('brain-gw-refresh-btn')?.addEventListener('click', loadGatewayTab)
  document.getElementById('brain-gw-start-btn')?.addEventListener('click', () => runGatewayControl('start'))
  document.getElementById('brain-gw-bg-btn')?.addEventListener('click', () => runGatewayControl('run-background'))
  document.getElementById('brain-gw-restart-btn')?.addEventListener('click', () => runGatewayControl('restart'))
  document.getElementById('brain-gw-stop-btn')?.addEventListener('click', () => runGatewayControl('stop'))
  document.getElementById('brain-gw-save-env-btn')?.addEventListener('click', async () => {
    const payload = {
      TELEGRAM_BOT_TOKEN: document.getElementById('brain-gw-tg-token')?.value || '',
      TELEGRAM_ALLOWED_USERS: document.getElementById('brain-gw-tg-users')?.value || '',
      TELEGRAM_HOME_CHANNEL: document.getElementById('brain-gw-tg-home')?.value || '',
      DISCORD_BOT_TOKEN: document.getElementById('brain-gw-dc-token')?.value || '',
      DISCORD_HOME_CHANNEL: document.getElementById('brain-gw-dc-home')?.value || '',
      SLACK_BOT_TOKEN: document.getElementById('brain-gw-sl-token')?.value || '',
      WHATSAPP_ENABLED: document.getElementById('brain-gw-wa-enabled')?.value || '',
      WHATSAPP_HOME_CHANNEL: document.getElementById('brain-gw-wa-home')?.value || '',
      GATEWAY_ALLOW_ALL_USERS: document.getElementById('brain-gw-allow-all')?.value || 'false'
    }
    const res = await window.hermesAvatar?.hermesBrainSet?.('gateway-save-env', payload)
    if (res?.ok) {
      uiDeps.showToast('Konfigurasi .env Disimpan', 'Restart gateway agar kredensial baru diterapkan.', 'success', '📱')
      loadGatewayTab()
    } else {
      uiDeps.showToast('Gagal Simpan .env', res?.error || 'Error', 'error', '❌')
    }
  })

  // --- Tab 6: Fallback Chain, MoA & Kanban ---
  document.getElementById('brain-fb-saved-pick')?.addEventListener('change', (e) => {
    const picked = savedProvidersCache.find((x) => x.id === e.target.value)
    if (!picked) return
    document.getElementById('brain-fb-provider').value = `custom:${picked.name}`
    document.getElementById('brain-fb-model').value = picked.model || ''
    document.getElementById('brain-fb-baseurl').value = picked.baseUrl || ''
  })

  document.getElementById('brain-fb-add-btn')?.addEventListener('click', () => {
    const pickId = document.getElementById('brain-fb-saved-pick')?.value || ''
    const provider = document.getElementById('brain-fb-provider')?.value?.trim() || ''
    const model = document.getElementById('brain-fb-model')?.value?.trim() || ''
    const base_url = document.getElementById('brain-fb-baseurl')?.value?.trim() || ''
    if (!provider || !model) {
      uiDeps.showToast('Data Belum Lengkap', 'Isi Provider dan Model untuk ditambahkan ke fallback chain.', 'warning', '⚠️')
      return
    }
    fallbackChain.push({
      provider,
      model,
      ...(base_url ? { base_url } : {}),
      ...(pickId ? { savedProviderId: pickId } : {})
    })
    renderFallbackList()
  })

  document.getElementById('brain-fb-save-btn')?.addEventListener('click', async () => {
    const res = await window.hermesAvatar?.hermesBrainSet?.('fallback-save', { chain: fallbackChain })
    if (res?.ok) {
      uiDeps.showToast('Fallback Chain Disimpan', 'Urutan fallback native ditulis ke config.yaml.', 'success', '🛡️')
      loadFallbackAndMoaTab()
    } else {
      uiDeps.showToast('Gagal Simpan Fallback', res?.error || 'Error', 'error', '❌')
    }
  })

  document.getElementById('brain-moa-save-btn')?.addEventListener('click', async () => {
    const activePreset = document.getElementById('brain-moa-active')?.value || ''
    const fanout = document.getElementById('brain-moa-fanout')?.value || 'per_iteration'
    const aggProvider = document.getElementById('brain-moa-agg-provider')?.value?.trim() || ''
    const aggModel = document.getElementById('brain-moa-agg-model')?.value?.trim() || ''
    const refsRaw = document.getElementById('brain-moa-refs')?.value || ''
    const referenceModels = refsRaw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [p, ...rest] = l.split('|')
        return { provider: String(p || '').trim(), model: rest.join('|').trim() }
      })
      .filter((r) => r.provider && r.model)

    const res = await window.hermesAvatar?.hermesBrainSet?.('moa-save', {
      activePreset,
      defaultPreset: 'default',
      presetConfig: {
        fanout,
        aggregator: { provider: aggProvider, model: aggModel },
        referenceModels
      }
    })
    if (res?.ok) {
      uiDeps.showToast('Konfigurasi MoA Disimpan', activePreset ? 'Mode Mixture of Agents aktif.' : 'Preset MoA disimpan.', 'success', '🧠')
      loadFallbackAndMoaTab()
    } else {
      uiDeps.showToast('Gagal Simpan MoA', res?.error || 'Periksa isian MoA', 'error', '❌')
    }
  })

  document.getElementById('brain-kanban-refresh-btn')?.addEventListener('click', loadKanbanTab)
  document.getElementById('brain-kanban-create-btn')?.addEventListener('click', async () => {
    const titleEl = document.getElementById('brain-kanban-title')
    const assigneeEl = document.getElementById('brain-kanban-assignee')
    const title = titleEl?.value?.trim() || ''
    const assignee = assigneeEl?.value?.trim() || ''
    if (!title) {
      uiDeps.showToast('Judul Kosong', 'Tuliskan judul tugas Kanban terlebih dahulu.', 'warning', '⚠️')
      return
    }
    const res = await window.hermesAvatar?.hermesBrainSet?.('kanban-manage', {
      action: 'kanban-create',
      title,
      assignee
    })
    if (res?.ok) {
      if (titleEl) titleEl.value = ''
      uiDeps.showToast('Kartu Kanban Dibuat', `"${title}" ditambahkan.`, 'success', '📋')
      loadKanbanTab()
    } else {
      uiDeps.showToast('Gagal Buat Kartu', res?.error || 'Error', 'error', '❌')
    }
  })

  document.getElementById('brain-subagent-pause-btn')?.addEventListener('click', () => {
    handleKanbanAction('subagent-pause', { paused: !delegationPausedState })
  })
}
