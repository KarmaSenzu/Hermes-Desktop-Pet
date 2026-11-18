import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  parseWidgetCommand,
  isQuotaOrRateLimitError,
  selectFailoverCandidate,
  renderScreenVisionCard,
} from '../src/renderer/js/widget-controller.js'

describe('widget-controller', () => {
  describe('parseWidgetCommand', () => {
    it('mendeteksi perintah Screen Vision (lihat layar)', () => {
      expect(parseWidgetCommand('lihat layarku')).toEqual({
        action: 'screen-vision',
        question: 'lihat layarku',
      })
      expect(parseWidgetCommand('tolong cek error di layar')).toEqual({
        action: 'screen-vision',
        question: 'tolong cek error di layar',
      })
      expect(parseWidgetCommand('ada error apa di layar')).toEqual({
        action: 'screen-vision',
        question: 'ada error apa di layar',
      })
    })

    it('mendeteksi perintah Smart Daily Briefing', () => {
      expect(parseWidgetCommand('briefing hari ini')).toEqual({ action: 'daily-briefing' })
      expect(parseWidgetCommand('mulai sesi kerja dong')).toEqual({ action: 'daily-briefing' })
      expect(parseWidgetCommand('tampilkan sapaan pagi')).toEqual({ action: 'daily-briefing' })
    })

    it('mendeteksi kontrol timer stop & setup interaktif vs langsung', () => {
      expect(parseWidgetCommand('hentikan timer')).toEqual({ action: 'timer-stop' })
      expect(parseWidgetCommand('reset sesi fokus')).toEqual({ action: 'timer-stop' })

      expect(parseWidgetCommand('mulai fokus')).toEqual({ action: 'timer-ask-setup' })
      expect(parseWidgetCommand('pomodoro')).toEqual({ action: 'timer-ask-setup' })

      expect(parseWidgetCommand('mulai fokus 45 menit untuk coding api')).toEqual({
        action: 'timer-start-direct',
        minutes: 45,
        task: 'coding api',
      })
      expect(parseWidgetCommand('timer 1 jam buat riset paper')).toEqual({
        action: 'timer-start-direct',
        minutes: 60,
        task: 'riset paper',
      })
    })

    it('membedakan permintaan playlist umum dan putar lagu spesifik', () => {
      expect(parseWidgetCommand('putar lofi')).toEqual({ action: 'music-ask-playlist' })
      expect(parseWidgetCommand('putar musik dong')).toEqual({ action: 'music-ask-playlist' })
      expect(parseWidgetCommand('pilih playlist')).toEqual({ action: 'music-ask-playlist' })

      expect(parseWidgetCommand('putar Hujan Malam')).toEqual({
        action: 'music-play-specific',
        query: 'Hujan Malam',
      })
      expect(parseWidgetCommand('play Midnight Study')).toEqual({
        action: 'music-play-specific',
        query: 'Midnight Study',
      })
    })

    it('mendeteksi kontrol next, prev, pause, dan volume musik (clamped 0-100)', () => {
      expect(parseWidgetCommand('lagu berikutnya')).toEqual({ action: 'music-next' })
      expect(parseWidgetCommand('next track')).toEqual({ action: 'music-next' })
      expect(parseWidgetCommand('lagu sebelumnya')).toEqual({ action: 'music-prev' })
      expect(parseWidgetCommand('pause musik')).toEqual({ action: 'music-pause' })
      expect(parseWidgetCommand('atur volume musik ke 65%')).toEqual({
        action: 'music-volume',
        level: 65,
      })
      expect(parseWidgetCommand('set volume 180')).toEqual({
        action: 'music-volume',
        level: 100,
      })
    })

    it('mengembalikan null untuk obrolan biasa atau input kosong', () => {
      expect(parseWidgetCommand('jelaskan sejarah kerajaan majapahit')).toBeNull()
      expect(parseWidgetCommand('')).toBeNull()
      expect(parseWidgetCommand(null)).toBeNull()
    })
  })

  describe('isQuotaOrRateLimitError', () => {
    it('mendeteksi status 429/402/503, pesan kuota habis, dan model dihentikan', () => {
      expect(isQuotaOrRateLimitError('HTTP 429 Too Many Requests')).toBe(true)
      expect(isQuotaOrRateLimitError('Payment Required (402)')).toBe(true)
      expect(isQuotaOrRateLimitError('HTTP 503 high demand')).toBe(true)
      expect(isQuotaOrRateLimitError('This model models/gemini-2.0-flash is no longer available')).toBe(true)
      expect(isQuotaOrRateLimitError('Rate limit exceeded for model')).toBe(true)
      expect(isQuotaOrRateLimitError('You exceeded your current quota, credit exhausted')).toBe(true)
      expect(isQuotaOrRateLimitError('Quota habis di akun aktif')).toBe(true)
    })

    it('tidak salah menandai error jaringan biasa atau pesan sukses', () => {
      expect(isQuotaOrRateLimitError('Connection timed out')).toBe(false)
      expect(isQuotaOrRateLimitError('Model loaded successfully')).toBe(false)
      expect(isQuotaOrRateLimitError('')).toBe(false)
    })
  })

  describe('selectFailoverCandidate', () => {
    it('memilih kandidat cadangan valid berbeda dengan prioritas free-tier resmi', () => {
      const candidates = [
        { id: '1', name: 'Active Router', baseUrl: 'http://127.0.0.1:20128/v1/', model: 'claude-sonnet' },
        { id: '2', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3' },
        { id: '3', name: 'Gemini Free', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' },
        { id: '4', name: 'Groq Free', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
      ]

      const picked = selectFailoverCandidate(candidates, 'http://127.0.0.1:20128/v1', 'claude-sonnet')
      expect(picked?.id).toBe('3')
    })

    it('mengabaikan kandidat invalid atau sama persis dengan provider aktif', () => {
      const candidates = [
        { id: '1', baseUrl: 'https://api.openai.com/v1/', model: 'gpt-4o' },
        { id: 'bad1', baseUrl: 'ftp://invalid.local/v1', model: 'foo' },
        { id: 'bad2', baseUrl: 'https://api.groq.com/openai/v1', model: '' },
      ]

      expect(selectFailoverCandidate(candidates, 'https://api.openai.com/v1', 'GPT-4O')).toBeNull()
      expect(selectFailoverCandidate([], 'https://api.openai.com/v1', 'gpt-4o')).toBeNull()
    })
  })

  describe('renderScreenVisionCard', () => {
    let originalDocument

    function createMockDom() {
      function createEl(tag) {
        const el = {
          tagName: tag.toUpperCase(),
          className: '',
          classList: {
            add: (c) => { el.className = (el.className + ' ' + c).trim() },
            contains: (c) => el.className.split(/\s+/).includes(c)
          },
          style: {},
          children: [],
          childNodes: [],
          appendChild: (ch) => {
            el.children.push(ch)
            el.childNodes.push(ch)
            ch.parentNode = el
            return ch
          },
          remove: () => {
            if (el.parentNode) {
              el.parentNode.children = el.parentNode.children.filter((c) => c !== el)
              el.parentNode.childNodes = el.parentNode.childNodes.filter((c) => c !== el)
            }
          },
          addEventListener: (evt, fn) => {
            el._handlers = el._handlers || {}
            el._handlers[evt] = el._handlers[evt] || []
            el._handlers[evt].push(fn)
          },
          dispatchEvent: (evt) => {
            const fns = el._handlers?.[evt.type || evt] || []
            for (const f of fns) f(evt)
          },
          click: () => el.dispatchEvent({ type: 'click', stopPropagation: () => {} }),
          textContent: '',
          innerHTML: '',
          value: '',
          src: '',
          alt: '',
          title: '',
          type: '',
          disabled: false,
          placeholder: ''
        }
        return el
      }
      return {
        createElement: createEl
      }
    }

    beforeEach(() => {
      originalDocument = globalThis.document
      globalThis.document = createMockDom()
      vi.useFakeTimers()
    })

    afterEach(() => {
      globalThis.document = originalDocument
      vi.useRealTimers()
    })

    it('merender kartu vision lengkap dengan badge, label mode, gambar, input, dan tombol aksi', () => {
      const chatLog = globalThis.document.createElement('div')
      const card = renderScreenVisionCard({
        chatLog,
        dataUrl: 'data:image/jpeg;base64,abc1234',
        filePath: 'C:/fake/path.jpg',
        openWindows: ['VSCode', 'Chrome'],
        label: 'Area Kotak (400×300 px)'
      })

      expect(card).not.toBeNull()
      expect(card.classList.contains('vision-card')).toBe(true)
      expect(chatLog.children).toContain(card)

      const header = card.children.find((c) => c.className.includes('assessment-card-header'))
      expect(header).toBeDefined()

      const badgeGroup = header.children.find((c) => c.className.includes('assessment-badge-group'))
      expect(badgeGroup).toBeDefined()
      const badge = badgeGroup.children.find((c) => c.className.includes('assessment-badge'))
      expect(badge.textContent).toContain('SCREEN VISION')
      const pill = badgeGroup.children.find((c) => c.className.includes('assessment-type-pill'))
      expect(pill.textContent).toBe('Area Kotak (400×300 px)')

      const closeBtn = header.children.find((c) => c.className.includes('assessment-close-card-btn'))
      expect(closeBtn).toBeDefined()
    })

    it('menghapus kartu dan memanggil onCancel saat tombol close ✕ atau Batalkan diklik', () => {
      const chatLog = globalThis.document.createElement('div')
      const onCancel = vi.fn()
      const card = renderScreenVisionCard({
        chatLog,
        dataUrl: 'data:image/jpeg;base64,abc',
        onCancel
      })

      const header = card.children.find((c) => c.className.includes('assessment-card-header'))
      const closeBtn = header.children.find((c) => c.className.includes('assessment-close-card-btn'))
      closeBtn.click()

      vi.advanceTimersByTime(200)
      expect(onCancel).toHaveBeenCalledTimes(1)
      expect(chatLog.children).not.toContain(card)
    })

    it('menghapus kartu dan memanggil onRetake saat tombol Tangkap Ulang diklik', () => {
      const chatLog = globalThis.document.createElement('div')
      const onRetake = vi.fn()
      const card = renderScreenVisionCard({
        chatLog,
        dataUrl: 'data:image/jpeg;base64,abc',
        onRetake
      })

      const footer = card.children.find((c) => c.className.includes('assessment-footer'))
      const actionRow = footer.children.find((c) => c.className.includes('assessment-action-row'))
      const retakeBtn = actionRow.children.find((c) => c.className.includes('assessment-retake-btn'))
      expect(retakeBtn).toBeDefined()
      retakeBtn.click()

      vi.advanceTimersByTime(200)
      expect(onRetake).toHaveBeenCalledTimes(1)
      expect(chatLog.children).not.toContain(card)
    })

    it('memanggil onSubmitPrompt saat tombol Analisis diklik dengan teks pertanyaan', () => {
      const chatLog = globalThis.document.createElement('div')
      const onSubmitPrompt = vi.fn()
      const card = renderScreenVisionCard({
        chatLog,
        dataUrl: 'data:image/jpeg;base64,abc',
        filePath: 'C:/test.jpg',
        openWindows: ['Terminal'],
        initialQuestion: 'Cek error log',
        onSubmitPrompt
      })

      const footer = card.children.find((c) => c.className.includes('assessment-footer'))
      const actionRow = footer.children.find((c) => c.className.includes('assessment-action-row'))
      const sendBtn = actionRow.children.find((c) => c.className.includes('assessment-execute-btn'))
      sendBtn.click()

      expect(onSubmitPrompt).toHaveBeenCalledWith({
        filePath: 'C:/test.jpg',
        openWindows: ['Terminal'],
        question: 'Cek error log'
      })
    })
  })
})
