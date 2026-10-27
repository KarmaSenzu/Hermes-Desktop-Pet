/**
 * popup.js — Logika Popup Hermes Web Companion
 * Memeriksa status Avatar desktop, membaca tab aktif, dan mengirimkan aksi cepat/prompt.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const connBadge = document.getElementById('conn-badge')
  const connText = document.getElementById('conn-text')
  const pageTitleEl = document.getElementById('page-title')
  const pageUrlEl = document.getElementById('page-url')
  const btnSummarize = document.getElementById('btn-quick-summarize')
  const btnPoints = document.getElementById('btn-quick-points')
  const btnExplain = document.getElementById('btn-quick-explain')
  const btnTranslate = document.getElementById('btn-quick-translate')
  const askForm = document.getElementById('ask-form')
  const customPromptInput = document.getElementById('custom-prompt')
  const btnSubmit = document.getElementById('btn-submit')
  const statusToast = document.getElementById('status-toast')
  const linkOpenDocs = document.getElementById('link-open-docs')
  const bridgeTokenInput = document.getElementById('bridge-token-input')
  const btnSaveToken = document.getElementById('btn-save-token')
  const tokenStatusHint = document.getElementById('token-status-hint')

  const MASKED_TOKEN = '****************'
  let activeTab = null
  let isAvatarOnline = false

  // 1. Dapatkan Tab yang sedang aktif
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tabs && tabs[0]) {
      activeTab = tabs[0]
      pageTitleEl.textContent = activeTab.title || 'Halaman Web'
      pageUrlEl.textContent = activeTab.url || ''
    }
  } catch (err) {
    pageTitleEl.textContent = 'Gagal memuat info halaman'
    console.error(err)
  }

  // Muat status token bridge dari chrome.storage.local (hanya ditampilkan dalam bentuk bintang)
  async function loadTokenState() {
    try {
      const data = await chrome.storage.local.get('bridgeToken')
      if (data?.bridgeToken) {
        bridgeTokenInput.value = MASKED_TOKEN
        if (tokenStatusHint) tokenStatusHint.textContent = 'Tersimpan (••••••••)'
      } else {
        bridgeTokenInput.value = ''
        if (tokenStatusHint) tokenStatusHint.textContent = 'Belum diset'
      }
    } catch {
      bridgeTokenInput.value = ''
    }
  }

  bridgeTokenInput?.addEventListener('focus', () => {
    if (bridgeTokenInput.value === MASKED_TOKEN) {
      bridgeTokenInput.value = ''
    }
  })

  bridgeTokenInput?.addEventListener('blur', async () => {
    if (!bridgeTokenInput.value.trim()) {
      const data = await chrome.storage.local.get('bridgeToken')
      if (data?.bridgeToken) {
        bridgeTokenInput.value = MASKED_TOKEN
      }
    }
  })

  btnSaveToken?.addEventListener('click', async () => {
    const val = (bridgeTokenInput.value || '').trim()
    if (!val) {
      showToast('Token bridge tidak boleh kosong!', true)
      return
    }
    if (val === MASKED_TOKEN) {
      showToast('Token tidak berubah.')
      return
    }
    await chrome.storage.local.set({ bridgeToken: val })
    bridgeTokenInput.value = MASKED_TOKEN
    if (tokenStatusHint) tokenStatusHint.textContent = 'Tersimpan (••••••••)'
    showToast('Token bridge berhasil disimpan!')
    await checkConnection()
  })

  // 2. Periksa status koneksi ke Desktop Pet
  async function checkConnection() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'PING_AVATAR' })
      if (response?.authError) {
        isAvatarOnline = false
        updateBadge(false, 'Token bridge belum diset / salah')
        showToast('Token bridge belum diset / salah', true)
        return
      }
      isAvatarOnline = !!(response && response.online)
      updateBadge(isAvatarOnline)
    } catch {
      isAvatarOnline = false
      updateBadge(false)
    }
  }

  function updateBadge(online, customMsg = null) {
    if (customMsg) {
      connBadge.className = 'conn-badge offline'
      connText.textContent = 'Auth Error 🔒'
      connBadge.title = customMsg
      return
    }
    connBadge.className = 'conn-badge ' + (online ? 'online' : 'offline')
    connText.textContent = online ? 'Terhubung 🟢' : 'Avatar Mati 🔴'
    connBadge.title = online
      ? 'Terhubung dengan Hermes Desktop Pet di port 9124'
      : 'Aplikasi Hermes Desktop Pet belum berjalan di komputer Anda'
  }

  function showToast(msg, isError = false) {
    statusToast.textContent = msg
    statusToast.className = 'status-toast ' + (isError ? 'error' : 'success')
    statusToast.classList.remove('hidden')
    setTimeout(() => {
      statusToast.classList.add('hidden')
    }, 4500)
  }

  await loadTokenState()

  // 3. Ambil teks artikel dari tab aktif
  async function getTabContent() {
    if (!activeTab || !activeTab.id) return { text: '', selection: '' }
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(activeTab.id, { action: 'GET_PAGE_TEXT' }, (res) => {
        if (chrome.runtime.lastError || !res) {
          resolve({ text: '', selection: '' })
        } else {
          resolve(res)
        }
      })
    })
  }

  // 4. Kirim prompt ke Desktop Pet
  async function sendToAvatar(promptText, extraContext = '') {
    if (!isAvatarOnline) {
      showToast('Hermes Avatar belum berjalan! Silakan buka aplikasi desktop Hermes terlebih dahulu.', true)
      return
    }

    setLoading(true)
    try {
      const content = await getTabContent()
      const textToUse = extraContext || content.selection || content.text || `URL: ${activeTab?.url || ''}`

      const payload = {
        prompt: promptText,
        text: (textToUse || '').slice(0, 4500),
        url: activeTab?.url || '',
        title: activeTab?.title || 'Web Page'
      }

      const res = await chrome.runtime.sendMessage({
        action: 'SEND_PROMPT',
        payload
      })

      if (res && res.ok) {
        showToast('Terkirim ke Hermes Avatar! 🚀 Avatar sedang menganalisis & bersiap menjelaskan...')
        customPromptInput.value = ''
      } else {
        showToast(`Gagal mengirim: ${res?.error || 'Koneksi terputus'}`, true)
      }
    } catch (err) {
      showToast(`Error: ${err.message}`, true)
    } finally {
      setLoading(false)
    }
  }

  function setLoading(loading) {
    btnSubmit.disabled = loading
    if (loading) {
      btnSubmit.innerHTML = '<span>Mengirim...</span>'
    } else {
      btnSubmit.innerHTML = '<span>Kirim 🚀</span>'
    }
  }

  // 5. Action listeners
  btnSummarize?.addEventListener('click', () => {
    sendToAvatar('Rangkum artikel/halaman web ini ke dalam beberapa poin kunci terpenting secara ringkas:')
  })

  btnPoints?.addEventListener('click', () => {
    sendToAvatar('Ekstrak poin-poin aksi, insight utama, dan kesimpulan paling krusial dari halaman ini:')
  })

  btnExplain?.addEventListener('click', () => {
    sendToAvatar('Jelaskan topik atau ide yang dibahas pada halaman ini dengan analogi sederhana yang mudah dimengerti:')
  })

  btnTranslate?.addEventListener('click', () => {
    sendToAvatar('Terjemahkan dan jelaskan isi inti halaman ini ke dalam Bahasa Indonesia yang santun dan jelas:')
  })

  askForm?.addEventListener('submit', (e) => {
    e.preventDefault()
    const prompt = (customPromptInput.value || '').trim()
    if (!prompt) {
      showToast('Silakan ketik pertanyaan Anda terlebih dahulu!', true)
      return
    }
    sendToAvatar(prompt)
  })

  linkOpenDocs?.addEventListener('click', (e) => {
    e.preventDefault()
    chrome.tabs.create({ url: 'https://github.com/KarmaSenzu/Hermes-Desktop-Pet#readme' })
  })

  // Jalankan cek koneksi awal
  checkConnection()
})
