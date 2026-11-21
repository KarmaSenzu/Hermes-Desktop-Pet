/**
 * hermes-client.js
 * WebSocket JSON-RPC client untuk terhubung ke `hermes serve`.
 *
 * Protokol (sumber: jawaban Hermes, hermes-qa/04-chat-integration.md):
 *  - WS URL        : ws://127.0.0.1:9119/api/ws (tanpa token, localhost)
 *  - session.create: buat sesi → dapatkan session_id
 *  - prompt.submit : kirim teks user
 *  - Event         : message.delta (streaming), message.complete (jawaban final)
 *
 * Frame JSON-RPC: { jsonrpc: "2.0", id, method, params }
 * Event server  : { jsonrpc: "2.0", method: "event", params: { type, payload, session_id } }
 */

const DEFAULT_WS_URL = 'ws://127.0.0.1:9119/api/ws'

export class HermesClient {
  constructor(wsUrl = DEFAULT_WS_URL, token = null) {
    // Tambahkan ?token= bila disediakan (hermes serve butuh auth bahkan di localhost).
    this.wsUrl = token ? `${wsUrl}?token=${encodeURIComponent(token)}` : wsUrl
    this.socket = null
    this.nextId = 0
    this.pending = new Map()
    this.eventHandlers = new Map()

    // State internal.
    this.sessionId = null
    this.storedSessionId = null
    // Timeout per-request (ms) agar Promise tidak menggantung selamanya bila
    // gateway berhenti merespons (mis. `hermes serve` restart di tengah turn).
    this.requestTimeoutMs = 120000
    // Penanda bahwa disconnect dipicu sendiri (bukan putus tak terduga).
    this._intentionalClose = false
  }

  get connected() {
    return this.socket?.readyState === WebSocket.OPEN
  }

  /**
   * Tolak semua request yang masih menunggu. Dipanggil saat socket menutup atau
   * saat request timeout, supaya pemanggil (chat UI) tidak terkunci selamanya.
   */
  _rejectAllPending(reason) {
    const err = new Error(reason || 'Koneksi ke Hermes terputus')
    for (const [, { reject, timer }] of this.pending) {
      if (timer) clearTimeout(timer)
      try { reject(err) } catch { /* ignore */ }
    }
    this.pending.clear()
  }

  connect() {
    return new Promise((resolve, reject) => {
      let settled = false
      const socket = new WebSocket(this.wsUrl)
      this.socket = socket
      this._intentionalClose = false

      socket.addEventListener('open', () => {
        if (settled) return
        settled = true
        resolve()
      })

      socket.addEventListener('message', (msg) => this._handleMessage(msg.data))

      socket.addEventListener('error', (event) => {
        if (settled) {
          // Error setelah terhubung: jangan gantung pending.
          this._rejectAllPending('Koneksi ke Hermes error')
          return
        }
        settled = true
        reject(new Error(`WS error saat connect ke ${this.wsUrl} (cek hermes serve jalan & port benar)`))
      })

      socket.addEventListener('close', (event) => {
        // Selalu tolak pending — bahkan bila connect sudah selesai (mis. server restart).
        this._rejectAllPending(`Koneksi ke Hermes tertutup (code=${event.code})`)
        // Emit event agar UI bisa unlock input / re-connect.
        try {
          this.eventHandlers.get('connection.lost')?.forEach((h) => h({ code: event.code, intentional: this._intentionalClose }))
        } catch { /* ignore */ }
        if (settled) return
        settled = true
        reject(new Error(`WS tertutup saat connect (code=${event.code}) ke ${this.wsUrl}`))
      })
    })
  }

  disconnect() {
    if (this.socket) {
      this._intentionalClose = true
      this.socket.close()
      this.socket = null
    }
    this._rejectAllPending('Hermes gateway diputus')
  }

  /**
   * Daftarkan handler untuk event gateway (mis. "message.delta").
   * Mengembalikan fungsi unsubscribe.
   */
  on(type, handler) {
    if (!this.eventHandlers.has(type)) this.eventHandlers.set(type, new Set())
    this.eventHandlers.get(type).add(handler)
    return () => this.eventHandlers.get(type)?.delete(handler)
  }

  /**
   * Daftarkan listener debug yang dipanggil untuk SETIAP event masuk.
   * Berguna untuk melihat event apa saja yang diterima client.
   */
  onAny(handler) {
    if (!this._anyHandlers) this._anyHandlers = new Set()
    this._anyHandlers.add(handler)
  }

  /**
   * Kirim request JSON-RPC → Promise hasil (dengan timeout agar tidak menggantung).
   */
  request(method, params = {}, timeoutMs = this.requestTimeoutMs) {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('Hermes gateway belum terhubung'))
        return
      }

      const id = `r${++this.nextId}`
      let timer = null
      if (Number(timeoutMs) > 0) {
        timer = setTimeout(() => {
          if (!this.pending.has(id)) return
          this.pending.delete(id)
          reject(new Error(`Request "${method}" timeout setelah ${Math.round(timeoutMs / 1000)}s (Hermes tidak merespons)`))
        }, timeoutMs)
      }
      this.pending.set(id, { resolve, reject, timer })

      try {
        this.socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
      } catch (err) {
        if (timer) clearTimeout(timer)
        this.pending.delete(id)
        reject(err)
      }
    })
  }

  /**
   * Buat session → simpan & kembalikan session_id.
   * Tutup sesi live sebelumnya (best-effort) agar tidak menumpuk di server.
   */
  async createSession(title = 'Avatar chat', cwd = null) {
    const prevSid = this.sessionId
    const result = await this.request('session.create', {
      title,
      ...(cwd ? { cwd } : {})
    })
    this.sessionId = result.session_id
    this.storedSessionId = result.stored_session_id || result.session_key || null
    if (prevSid && prevSid !== this.sessionId) {
      this.request('session.close', { session_id: prevSid }).catch(() => {})
    }
    return result
  }

  /**
   * Kirim teks user ke Hermes.
   */
  async submitPrompt(text) {
    if (!this.sessionId) throw new Error('Session belum dibuat. Panggil createSession() dulu.')
    return this.request('prompt.submit', { session_id: this.sessionId, text })
  }

  /**
   * Aktifkan mode suara (syarat sebelum voice.record).
   *
   * PENTING: sertakan session_id — tanpa ini, server mengarahkan event suara
   * (voice.status / voice.transcript) ke sid kosong, sehingga frame-nya jatuh
   * ke stdout (log hermes serve) dan tidak pernah sampai ke WebSocket avatar.
   */
  async voiceToggle(action = 'on') {
    return this.request('voice.toggle', { action, session_id: this.sessionId })
  }

  /**
   * Mulai/hentikan rekaman (push-to-talk). Hasil transkripsi datang lewat
   * event `voice.transcript`.
   *
   * PENTING: sertakan session_id — alasan sama seperti voiceToggle di atas.
   */
  async voiceRecord(action = 'start') {
    return this.request('voice.record', { action, session_id: this.sessionId })
  }

  /**
   * Ambil config Hermes (mis. provider & model aktif, daftar providers).
   */
  async configGet(key) {
    return this.request('config.get', { key, session_id: this.sessionId })
  }

  /**
   * Set config Hermes (mis. switch model via key "model").
   */
  async configSet(key, value) {
    return this.request('config.set', { key, value, session_id: this.sessionId })
  }

  /**
   * Daftar model yang tersedia (untuk dropdown).
   */
  async modelOptions() {
    return this.request('model.options', { session_id: this.sessionId })
  }

  /**
   * Daftar sesi percakapan tersimpan (session.list).
   */
  async listSessions(limit = 50) {
    return this.request('session.list', { limit })
  }

  /**
   * Tutup sesi live di server (session.close).
   */
  async closeSession(liveSessionId = this.sessionId) {
    if (!liveSessionId) return null
    const res = await this.request('session.close', { session_id: liveSessionId })
    if (liveSessionId === this.sessionId) {
      this.sessionId = null
      this.storedSessionId = null
    }
    return res
  }

  /**
   * Daftar sesi live yang sedang aktif di server (session.active_list).
   */
  async listActiveSessions() {
    return this.request('session.active_list', { current_session_id: this.sessionId || '' })
  }

  /**
   * Lanjutkan sesi lama (session.resume) → perbarui sessionId aktif & tutup sesi sebelumnya.
   */
  async resumeSession(sessionId) {
    const prevSid = this.sessionId
    const result = await this.request('session.resume', { session_id: sessionId })
    if (result?.session_id) {
      this.sessionId = result.session_id
    }
    this.storedSessionId = result?.session_key || result?.resumed || sessionId
    if (prevSid && prevSid !== this.sessionId) {
      this.request('session.close', { session_id: prevSid }).catch(() => {})
    }
    return result
  }

  /**
   * Hapus sesi tersimpan (session.delete). Bila masih aktif di server, tutup sesi live terkait lalu ulangi.
   */
  async deleteSession(sessionId) {
    const targetId = String(sessionId || '').trim()
    try {
      return await this.request('session.delete', { session_id: targetId })
    } catch (err) {
      const msg = String(err?.message || err || '')
      if (!/cannot delete an active session|active session/i.test(msg)) {
        throw err
      }

      const activeRes = await this.listActiveSessions().catch(() => null)
      const activeSessions = Array.isArray(activeRes?.sessions) ? activeRes.sessions : []
      const matches = activeSessions.filter(
        (s) => s && (String(s.session_key || '') === targetId || String(s.id || '') === targetId)
      )

      let closedCurrent = false
      for (const s of matches) {
        if (!s?.id) continue
        if (s.id === this.sessionId) closedCurrent = true
        await this.closeSession(s.id).catch(() => {})
      }

      if (this.storedSessionId === targetId) {
        closedCurrent = true
        this.sessionId = null
        this.storedSessionId = null
      }

      const retryRes = await this.request('session.delete', { session_id: targetId })
      return {
        ...(retryRes || {}),
        closedActiveSession: true,
        closedCurrent
      }
    }
  }

  _handleMessage(raw) {
    let frame
    try {
      frame = JSON.parse(typeof raw === 'string' ? raw : String(raw))
    } catch {
      return
    }

    // Response RPC (punya id) → resolve pending.
    if (frame.id != null && this.pending.has(frame.id)) {
      const { resolve, reject, timer } = this.pending.get(frame.id)
      if (timer) clearTimeout(timer)
      this.pending.delete(frame.id)
      if (frame.error) reject(new Error(frame.error.message || 'Hermes RPC failed'))
      else resolve(frame.result)
      return
    }

    // Event server.
    if (frame.method === 'event' && frame.params?.type) {
      const type = frame.params.type
      // Debug: log event yang diterima (kecualikan session.info & stream delta untuk menjaga privasi memori dan kerapian).
      if (typeof console !== 'undefined') {
        if (type !== 'session.info' && !['message.delta', 'thinking.delta'].includes(type)) {
          console.log('[hermes event]', type, JSON.stringify(frame.params?.payload ?? {}))
        } else if (type === 'session.info') {
          console.log('[hermes event] session.info (connected to Hermes)')
        }
      }
      // Listener debug (semua event).
      if (this._anyHandlers) {
        for (const h of this._anyHandlers) h(frame.params)
      }
      const handlers = this.eventHandlers.get(type)
      if (handlers) {
        for (const h of handlers) h(frame.params)
      }
    }
  }
}
