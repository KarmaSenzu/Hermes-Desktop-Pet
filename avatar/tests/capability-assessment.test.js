import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  bindDynamicAssessmentCards,
  attachDynamicAssessmentDelegation
} from '../src/renderer/js/capability-assessment.js'

/**
 * Membangun DOM pohon ringan untuk menguji klik langsung maupun event delegation
 * pada kartu `.dynamic-assessment-card` di lingkungan Node Vitest.
 */
function createMiniDom() {
  function makeClassList(el) {
    const tokens = () => (el.className ? el.className.split(/\s+/).filter(Boolean) : [])
    const setTokens = (arr) => { el.className = arr.join(' ') }
    return {
      contains: (c) => tokens().includes(c),
      add: (c) => {
        const list = tokens()
        if (!list.includes(c)) setTokens([...list, c])
      },
      remove: (c) => {
        setTokens(tokens().filter((x) => x !== c))
      },
      toggle: (c) => {
        const list = tokens()
        if (list.includes(c)) setTokens(list.filter((x) => x !== c))
        else setTokens([...list, c])
      }
    }
  }

  function matchesSelector(el, sel) {
    if (sel.includes(':not([data-bound="true"])')) {
      const base = sel.replace(':not([data-bound="true"])', '')
      return matchesSelector(el, base) && el.getAttribute('data-bound') !== 'true'
    }
    if (sel.startsWith('.')) {
      const parts = sel.slice(1).split('.')
      return parts.every((cls) => el.classList.contains(cls))
    }
    return false
  }

  function createEl(tag, className = '', attrs = {}) {
    const el = {
      tagName: tag.toUpperCase(),
      className,
      attributes: { ...attrs },
      children: [],
      parentNode: null,
      disabled: Boolean(attrs.disabled),
      textContent: '',
      _handlers: {},
      setAttribute: (k, v) => { el.attributes[k] = String(v) },
      getAttribute: (k) => (k in el.attributes ? el.attributes[k] : null),
      appendChild: (ch) => {
        ch.parentNode = el
        el.children.push(ch)
        return ch
      },
      addEventListener: (evt, fn) => {
        el._handlers[evt] = el._handlers[evt] || []
        el._handlers[evt].push(fn)
      },
      closest: (sel) => {
        let cur = el
        while (cur) {
          if (matchesSelector(cur, sel)) return cur
          cur = cur.parentNode
        }
        return null
      },
      querySelectorAll: (sel) => {
        const out = []
        const walk = (node) => {
          for (const ch of node.children) {
            if (matchesSelector(ch, sel)) out.push(ch)
            walk(ch)
          }
        }
        walk(el)
        return out
      },
      querySelector: (sel) => el.querySelectorAll(sel)[0] || null,
      click: () => {
        let stopped = false
        const event = {
          target: el,
          stopPropagation: () => { stopped = true }
        }
        let cur = el
        while (cur) {
          const list = cur._handlers?.click || []
          for (const fn of list) fn(event)
          if (stopped) break
          cur = cur.parentNode
        }
      }
    }
    el.classList = makeClassList(el)
    return el
  }

  function createCardDom() {
    const card = createEl('div', 'assessment-card dynamic-assessment-card', { 'data-assessment-id': 'dyn-1' })

    const opt1 = createEl('div', 'assessment-option-item', { 'data-id': '1', 'data-title': '1. Bedah Putusan' })
    const opt1Title = createEl('div', 'assessment-option-title')
    opt1Title.textContent = '1. Bedah Putusan'
    opt1.appendChild(opt1Title)

    const opt2 = createEl('div', 'assessment-option-item', { 'data-id': '2', 'data-title': '2. Proses Suksesi' })
    const opt2Title = createEl('div', 'assessment-option-title')
    opt2Title.textContent = '2. Proses Suksesi'
    opt2.appendChild(opt2Title)

    card.appendChild(opt1)
    card.appendChild(opt2)

    const presetAll = createEl('button', 'assessment-preset-chip', { 'data-preset': 'all' })
    card.appendChild(presetAll)

    const execBtn = createEl('button', 'assessment-execute-btn', { disabled: true })
    execBtn.disabled = true
    execBtn.textContent = 'Eksekusi Pilihan (0 Dipilih)'
    card.appendChild(execBtn)

    return { card, opt1, opt1Title, opt2, opt2Title, presetAll, execBtn }
  }

  return { createEl, createCardDom }
}

describe('capability-assessment dynamic cards', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('bindDynamicAssessmentCards men-toggle opsi, update tombol, dan mengeksekusi pilihan', () => {
    const { createEl, createCardDom } = createMiniDom()
    const container = createEl('div', 'chat-log')
    const { card, opt1, opt1Title, opt2, execBtn } = createCardDom()
    container.appendChild(card)

    const handleUserChat = vi.fn()
    const setExpression = vi.fn()
    const showSpeechBubble = vi.fn()
    const speak = vi.fn()

    bindDynamicAssessmentCards(container, {
      getController: () => ({ setExpression }),
      showSpeechBubble,
      speak,
      handleUserChat
    })

    expect(card.getAttribute('data-bound')).toBe('true')
    expect(execBtn.disabled).toBe(true)

    // Klik judul di dalam opsi #1 -> memilih opsi 1
    opt1Title.click()
    expect(opt1.classList.contains('selected')).toBe(true)
    expect(execBtn.disabled).toBe(false)
    expect(execBtn.textContent).toBe('Eksekusi Pilihan (1 Dipilih)')

    // Pilih opsi #2 -> jumlah pilihan menjadi 2
    opt2.click()
    expect(opt2.classList.contains('selected')).toBe(true)
    expect(execBtn.textContent).toBe('Eksekusi Pilihan (2 Dipilih)')

    // Batalkan opsi #2 -> kembali ke 1 pilihan
    opt2.click()
    expect(opt2.classList.contains('selected')).toBe(false)
    expect(execBtn.textContent).toBe('Eksekusi Pilihan (1 Dipilih)')

    // Eksekusi
    execBtn.click()
    expect(card.classList.contains('executed')).toBe(true)
    expect(execBtn.disabled).toBe(true)
    expect(execBtn.textContent).toBe('Sedang Mengeksekusi...')
    expect(setExpression).toHaveBeenCalledWith('composing')

    vi.advanceTimersByTime(400)
    expect(handleUserChat).toHaveBeenCalledTimes(1)
    expect(handleUserChat.mock.calls[0][0]).toContain('1. Bedah Putusan')
    expect(handleUserChat.mock.calls[0][1]).toContain('Memilih langkah: 1. Bedah Putusan')
  })

  it('preset Pilih Semua menandai semua opsi dan langsung mengeksekusi sekali', () => {
    const { createEl, createCardDom } = createMiniDom()
    const container = createEl('div', 'chat-log')
    const { opt1, opt2, presetAll, execBtn } = createCardDom()
    container.appendChild(opt1.parentNode)

    const handleUserChat = vi.fn()
    bindDynamicAssessmentCards(container, { handleUserChat })

    presetAll.click()
    expect(opt1.classList.contains('selected')).toBe(true)
    expect(opt2.classList.contains('selected')).toBe(true)
    expect(execBtn.textContent).toBe('Sedang Mengeksekusi...')

    vi.advanceTimersByTime(400)
    expect(handleUserChat).toHaveBeenCalledTimes(1)
    expect(handleUserChat.mock.calls[0][0]).toContain('1. Bedah Putusan')
    expect(handleUserChat.mock.calls[0][0]).toContain('2. Proses Suksesi')
  })

  it('attachDynamicAssessmentDelegation membuat kartu hasil innerHTML replace (belum bound) tetap bisa diklik dan tidak double-fire pada kartu bound', () => {
    const { createEl, createCardDom } = createMiniDom()
    const chatLog = createEl('div', 'chat-log')
    const handleUserChat = vi.fn()

    attachDynamicAssessmentDelegation(chatLog, { handleUserChat })
    // Pemanggilan kedua harus idempoten
    attachDynamicAssessmentDelegation(chatLog, { handleUserChat })
    expect(chatLog.getAttribute('data-assessment-delegated')).toBe('true')
    expect(chatLog._handlers.click).toHaveLength(1)

    // 1. Kartu hasil replace innerHTML (mis. message.complete tanpa bind ulang) -> tidak punya data-bound
    const unbound = createCardDom()
    chatLog.appendChild(unbound.card)

    unbound.opt1Title.click()
    expect(unbound.opt1.classList.contains('selected')).toBe(true)
    expect(unbound.execBtn.disabled).toBe(false)
    expect(unbound.execBtn.textContent).toBe('Eksekusi Pilihan (1 Dipilih)')

    unbound.execBtn.click()
    vi.advanceTimersByTime(400)
    expect(handleUserChat).toHaveBeenCalledTimes(1)

    // 2. Kartu yang sudah di-bind langsung -> tidak boleh ter-toggle 2 kali (tetap selected=true)
    const bound = createCardDom()
    const wrapper = createEl('div', 'avatar')
    wrapper.appendChild(bound.card)
    chatLog.appendChild(wrapper)
    bindDynamicAssessmentCards(wrapper, { handleUserChat })

    bound.opt2.click()
    expect(bound.opt2.classList.contains('selected')).toBe(true)
    expect(bound.execBtn.textContent).toBe('Eksekusi Pilihan (1 Dipilih)')
  })
})
