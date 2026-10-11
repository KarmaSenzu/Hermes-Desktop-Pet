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
  }

  get connected() {
    return this.socket?.readyState === WebSocket.OPEN
  }

  connect() {
    return new Promise((resolve, reject) => {
      let settled = false
      const socket = new WebSocket(this.wsUrl)
      this.socket = socket

      socket.addEventListener('open', () => {
        if (settled) return
        settled = true
        resolve()
      })

      socket.addEventListener('message', (msg) => this._handleMessage(msg.data))

      socket.addEventListener('error', (event) => {
        if (settled) return
        settled = true
        reject(new Error(`WS error saat connect ke ${this.wsUrl} (cek hermes serve jalan & port benar)`))
      })

      socket.addEventListener('close', (event) => {
        if (settled) return
        settled = true
        reject(new Error(`WS tertutup saat connect (code=${event.code}) ke ${this.wsUrl}`))
      })
    })
  }

  disconnect() {
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
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
   * Kirim request JSON-RPC → Promise hasil.
   */
  request(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('Hermes gateway belum terhubung'))
        return
      }

      const id = `r${++this.nextId}`
      this.pending.set(id, { resolve, reject })

      this.socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
    })
  }

  /**
   * Buat session → simpan & kembalikan session_id.
   */
  async createSession(title = 'Avatar chat', cwd = null) {
    const result = await this.request('session.create', {
      title,
      ...(cwd ? { cwd } : {})
    })
    this.sessionId = result.session_id
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

  _handleMessage(raw) {
    let frame
    try {
      frame = JSON.parse(typeof raw === 'string' ? raw : String(raw))
    } catch {
      return
    }

    // Response RPC (punya id) → resolve pending.
    if (frame.id != null && this.pending.has(frame.id)) {
      const { resolve, reject } = this.pending.get(frame.id)
      this.pending.delete(frame.id)
      if (frame.error) reject(new Error(frame.error.message || 'Hermes RPC failed'))
      else resolve(frame.result)
      return
    }

    // Event server.
    if (frame.method === 'event' && frame.params?.type) {
      const type = frame.params.type
      // Debug: log semua event yang diterima.
      if (typeof console !== 'undefined') {
        console.log('[hermes event]', type, JSON.stringify(frame.params?.payload ?? {}))
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
