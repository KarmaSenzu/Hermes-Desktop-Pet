/**
 * content.js — Script yang berjalan di dalam tab halaman web Chrome
 * Menyediakan ekstraksi teks artikel, penanganan seleksi, dan floating quick-ask tooltip.
 */

// Listener pesan dari background service worker
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'GET_SELECTED_TEXT') {
    const sel = window.getSelection().toString()
    sendResponse({ text: sel })
    return true
  }

  if (request.action === 'GET_PAGE_TEXT') {
    // Coba ambil konten artikel utama
    const article = document.querySelector('article') || document.querySelector('main') || document.querySelector('.post-content') || document.body
    // Hapus script, style, nav, footer dari ekstraksi teks
    const clone = article.cloneNode(true)
    clone.querySelectorAll('script, style, noscript, nav, footer, header, aside, .advertisement, [aria-hidden="true"]').forEach((el) => el.remove())
    const text = clone.innerText || clone.textContent || ''
    sendResponse({ text: text.replace(/\s+/g, ' ').trim() })
    return true
  }
})

// --- Floating Quick Ask Tooltip saat seleksi teks ---
let tooltipEl = null

function getOrCreateTooltip() {
  if (tooltipEl) return tooltipEl
  tooltipEl = document.createElement('div')
  tooltipEl.id = 'hermes-quick-tooltip'
  tooltipEl.innerHTML = `
    <button type="button" class="hermes-tooltip-btn" title="Tanyakan ke Hermes Avatar">
      <span class="hermes-tooltip-icon">🤖</span>
      <span class="hermes-tooltip-label">Tanya Avatar</span>
    </button>
  `
  document.body.appendChild(tooltipEl)

  tooltipEl.querySelector('button').addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const sel = window.getSelection().toString().trim()
    if (!sel) return
    hideTooltip()
    chrome.runtime.sendMessage({
      action: 'SEND_PROMPT',
      payload: {
        text: sel,
        prompt: 'Tolong jelaskan teks berikut dan berikan poin-poin pentingnya:',
        url: window.location.href,
        title: document.title || 'Halaman Web'
      }
    })
  })

  return tooltipEl
}

function showTooltip(x, y) {
  const el = getOrCreateTooltip()
  el.style.left = `${Math.max(10, x)}px`
  el.style.top = `${Math.max(10, y)}px`
  el.classList.add('visible')
}

function hideTooltip() {
  if (tooltipEl) {
    tooltipEl.classList.remove('visible')
  }
}

document.addEventListener('mouseup', () => {
  setTimeout(() => {
    const sel = window.getSelection()
    const text = sel ? sel.toString().trim() : ''
    if (text && text.length >= 3) {
      try {
        const range = sel.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        const x = rect.left + window.scrollX + (rect.width / 2) - 45
        const y = rect.top + window.scrollY - 36
        showTooltip(x, y)
      } catch {
        hideTooltip()
      }
    } else {
      hideTooltip()
    }
  }, 30)
})

document.addEventListener('mousedown', (e) => {
  if (tooltipEl && !tooltipEl.contains(e.target)) {
    hideTooltip()
  }
})
