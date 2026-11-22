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

// Helper ambil token bridge dari chrome.storage.local (dengan auto-fallback ke bridge-token.json terpasang)
async function getBridgeToken() {
  try {
    const data = await chrome.storage.local.get('bridgeToken')
    const stored = (data?.bridgeToken || '').trim()
    if (stored) return stored
  } catch {
    // Abaikan, lanjutkan fallback ke bridge-token.json
  }
  try {
    const res = await fetch(chrome.runtime.getURL('bridge-token.json'))
    if (res.ok) {
      const parsed = await res.json().catch(() => null)
      const fileToken = String(parsed?.bridgeToken || '').trim()
      if (fileToken) {
        await chrome.storage.local.set({ bridgeToken: fileToken }).catch(() => {})
        return fileToken
      }
    }
  } catch {
    // bridge-token.json opsional (mis. saat dimuat langsung dari repo dev)
  }
  return ''
}

// Terima pesan dari popup atau content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'PING_AVATAR') {
    checkAvatarOnline().then((status) => sendResponse(status))
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
    const token = await getBridgeToken()
    const res = await fetch(`${AVATAR_BRIDGE_URL}/api/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hermes-Bridge-Token': token
      },
      body: JSON.stringify(payload)
    })
    if (res.status === 401 || res.status === 403) {
      console.warn('[Hermes Extension] Token bridge belum diset / salah')
      notifyAuthError()
      return { ok: false, error: 'Token bridge belum diset / salah' }
    }
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
    const token = await getBridgeToken()
    const res = await fetch(`${AVATAR_BRIDGE_URL}/api/ping`, {
      method: 'GET',
      headers: {
        'X-Hermes-Bridge-Token': token
      },
      cache: 'no-store'
    })
    if (res.status === 401 || res.status === 403) {
      notifyAuthError()
      return { online: false, authError: true, error: 'Token bridge belum diset / salah' }
    }
    return { online: res.ok }
  } catch {
    return { online: false }
  }
}

function notifyAuthError() {
  chrome.action.setBadgeText({ text: 'AUTH' })
  chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' })
  chrome.action.setTitle({ title: 'Token bridge belum diset / salah' })
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' })
    chrome.action.setTitle({ title: 'Hermes Web Companion' })
  }, 5000)
}

function notifyOffline() {
  chrome.action.setBadgeText({ text: 'OFF' })
  chrome.action.setBadgeBackgroundColor({ color: '#f87171' })
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' })
  }, 4000)
}

