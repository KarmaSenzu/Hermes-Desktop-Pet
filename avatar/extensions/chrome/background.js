/**
 * background.js — Service Worker untuk Hermes Web Companion
 * Menangani context menu (klik kanan), shortcut keyboard, dan forward ke Avatar desktop di port 9124.
 */

const AVATAR_BRIDGE_URL = 'http://127.0.0.1:9124'

// Setup Context Menus saat ekstensi dipasang
chrome.runtime.onInstalled.addListener(() => {
  // Menu 1: Tanyakan seleksi teks
  chrome.contextMenus.create({
    id: 'hermes-ask-selection',
    title: 'Tanyakan ke Hermes Avatar 🎙️',
    contexts: ['selection']
  })

  // Menu 2: Jelaskan istilah/kode
  chrome.contextMenus.create({
    id: 'hermes-explain-selection',
    title: 'Jelaskan Poin Ini 💡',
    contexts: ['selection']
  })

  // Menu 3: Rangkum seluruh halaman
  chrome.contextMenus.create({
    id: 'hermes-summarize-page',
    title: 'Rangkum Halaman Ini dengan Hermes 📑',
    contexts: ['page']
  })
})

// Handler klik Context Menu
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return

  if (info.menuItemId === 'hermes-ask-selection') {
    const selectedText = (info.selectionText || '').trim()
    if (!selectedText) return
    await sendToAvatar({
      text: selectedText,
      prompt: 'Tolong jelaskan teks berikut secara ringkas dan sebutkan poin-poin pentingnya:',
      url: tab.url,
      title: tab.title || 'Halaman Web'
    })
  } else if (info.menuItemId === 'hermes-explain-selection') {
    const selectedText = (info.selectionText || '').trim()
    if (!selectedText) return
    await sendToAvatar({
      text: selectedText,
      prompt: 'Jelaskan istilah atau kode ini dengan bahasa yang mudah dipahami:',
      url: tab.url,
      title: tab.title || 'Halaman Web'
    })
  } else if (info.menuItemId === 'hermes-summarize-page') {
    // Minta content script mengambil teks utama artikel
    chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_TEXT' }, async (response) => {
      const pageText = (response?.text || '').slice(0, 4000).trim()
      await sendToAvatar({
        text: pageText || `URL: ${tab.url}`,
        prompt: 'Rangkum artikel/halaman web ini ke dalam beberapa poin kunci terpenting:',
        url: tab.url,
        title: tab.title || 'Halaman Web'
      })
    })
  }
})

// Handler keyboard shortcut (Alt + A)
chrome.commands.onCommand.addListener((command) => {
  if (command === 'ask-avatar') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0] || !tabs[0].id) return
      chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_SELECTED_TEXT' }, async (res) => {
        const text = (res?.text || '').trim()
        if (text) {
          await sendToAvatar({
            text,
            prompt: 'Tolong jelaskan teks yang saya seleksi ini:',
            url: tabs[0].url,
            title: tabs[0].title || 'Halaman Web'
          })
        }
      })
    })
  }
})

// Terima pesan dari popup atau content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'PING_AVATAR') {
    checkAvatarOnline().then((online) => sendResponse({ online }))
    return true
  }
  if (request.action === 'SEND_PROMPT') {
    sendToAvatar(request.payload).then((res) => sendResponse(res))
    return true
  }
})

// Fungsi kirim payload ke Avatar Desktop
async function sendToAvatar(payload) {
  try {
    const res = await fetch(`${AVATAR_BRIDGE_URL}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return { ok: true, data }
  } catch (err) {
    console.warn('[Hermes Extension] Desktop Avatar tidak merespons:', err.message)
    // Berikan badge / notifikasi jika desktop pet belum menyala
    notifyOffline()
    return { ok: false, error: err.message }
  }
}

// Cek apakah Avatar desktop sedang aktif
async function checkAvatarOnline() {
  try {
    const res = await fetch(`${AVATAR_BRIDGE_URL}/api/ping`, {
      method: 'GET',
      cache: 'no-store'
    })
    return res.ok
  } catch {
    return false
  }
}

function notifyOffline() {
  chrome.action.setBadgeText({ text: 'OFF' })
  chrome.action.setBadgeBackgroundColor({ color: '#f87171' })
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' })
  }, 4000)
}
