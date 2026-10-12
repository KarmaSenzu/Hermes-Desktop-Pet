/**
 * settings.js — entry untuk settings.html (home pertama saat app dibuka).
 * Layout ala macOS System Settings: sidebar kiri + panel konten kanan.
 */

import { loadSettings, saveSettings } from './settings-store.js'
import { renderIcon } from './icons.js'

const startBtn = document.getElementById('start-btn')
const statusEl = document.getElementById('status')
const routerCheck = document.getElementById('router-check')
const hermesStatus = document.getElementById('hermes-status')

let settings = loadSettings()

// --- Info format (lengkap: deskripsi, kemampuan, kelebihan, kekurangan) ---
const FORMAT_INFO = [
  {
    ext: 'vrm', label: 'VRM', desc: 'Standar avatar anime (VRoid / three-vrm).',
    full: 'Format VRM dirancang khusus untuk avatar humanoid. Mendukung blendshape ekspresi wajah, bone rig standar, dan spring bone (rambut/rok bergerak).',
    features: ['Ekspresi wajah (blink, happy, sad, angry)', 'Lip sync blendshape (aa/ih/ou/ee/oh)', 'Bone rig humanoid standar', 'Spring bone (rambut/rok)'],
    pros: 'Ekspresi & lip sync paling lengkap',
    cons: 'Butuh model VRM (banyak yang berlisensi)'
  },
  {
    ext: 'glb', label: 'GLB / glTF', desc: 'Format 3D modern & ringan (WebGL).',
    full: 'glTF/GLB adalah format 3D standar web. Ringan, cepat dimuat, didukung luas. Bisa berisi bone & morph, tapi ekspresi wajah tergantung modelnya.',
    features: ['Ringan & cepat dimuat', 'Didukung luas (three.js native)', 'Bone rig + morph target', 'Cocok untuk low-poly'],
    pros: 'Paling ringan & cepat',
    cons: 'Ekspresi wajah tergantung model'
  },
  {
    ext: 'pmx', label: 'PMX / PMD (MMD)', desc: 'Format MikuMikuDance (MMD.js).',
    full: 'PMX/PMD adalah format MMD (MikuMikuDance). Punya morph ekspresi (あいうえお untuk lip sync) & physics. Texture sering .tga dan butuh folder utuh.',
    features: ['Morph ekspresi & lip sync (あいうえお)', 'Physics rambut/rok (MMD.js)', 'Banyak model gratis', 'Motion .vmd'],
    pros: 'Banyak model gratis + morph ekspresi',
    cons: 'Texture .tga, butuh folder utuh'
  },
  {
    ext: 'fbx', label: 'FBX', desc: 'Format 3D umum (Blender / Maya).',
    full: 'FBX adalah format pertukaran 3D yang luas dipakai. Punya bone rig + animasi, tapi umumnya TANPA blendshape wajah, sehingga ekspresi & lip sync minim.',
    features: ['Bone rig + animasi', 'Umum & banyak aset', 'Ekspor dari Blender/Maya'],
    pros: 'Sangat umum, banyak rig',
    cons: 'Tanpa blendshape → ekspresi/lip sync minim'
  }
]

// --- Definisi sidebar (terpusat; icon = nama Lucide outline) ---
const SECTIONS = [
  { id: 'home', icon: 'house', label: 'Home' },
  { id: 'character', icon: 'user-round', label: 'Karakter' },
  { id: 'animation', icon: 'film', label: 'Animasi' },
  { id: 'voice', icon: 'mic', label: 'Suara' },
  { id: 'llm', icon: 'brain', label: 'LLM & Provider' },
  { id: 'skill', icon: 'puzzle', label: 'Skill' },
  { id: 'action', icon: 'terminal', label: 'Perintah' },
  { id: 'shortcut', icon: 'keyboard', label: 'Shortcut' }
]

// --- Navigasi sidebar ---
const nav = document.getElementById('nav')
const panels = document.querySelectorAll('.panel')

function renderNav() {
  nav.innerHTML = SECTIONS.map((s, i) => {
    const active = i === 0 ? 'active' : ''
    return `<button class="nav-item ${active}" data-section="${s.id}">
      <span class="nav-icon">${renderIcon(s.icon, { size: 20 })}</span> ${escapeHtml(s.label)}
    </button>`
  }).join('')

  nav.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      nav.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'))
      item.classList.add('active')
      const section = item.dataset.section
      panels.forEach((p) => p.classList.remove('active'))
      document.getElementById(`panel-${section}`).classList.add('active')
    })
  })
}

// --- Status service (hanya Hermes; 9Router = checklist manual) ---
async function refreshServiceStatus() {
  try {
    const s = await window.hermesAvatar.getServiceStatus()
    setBadge(hermesStatus, s.hermes, 'Aktif', 'Mati')
  } catch {
    hermesStatus.textContent = '?'
  }
}

function setBadge(el, running, onText, offText) {
  el.textContent = running ? onText : offText
  el.classList.toggle('on', running)
  el.classList.toggle('off', !running)
}

// --- Karakter aktif (tampil di Home) ---
const activeCharEl = document.getElementById('active-char')

function renderActiveChar() {
  const active = (settings.characters || []).find((c) => c.active)
  if (!active) {
    activeCharEl.innerHTML = '<p class="hint">Belum ada karakter aktif. Pilih di sidebar Karakter.</p>'
    return
  }
  const thumb = active.image
    ? `<img class="char-thumb" src="${active.image}" alt="" />`
    : `<div class="char-thumb placeholder">${renderIcon('user-round', { size: 24 })}</div>`
  activeCharEl.innerHTML = `
    <div class="active-char-row">
      ${thumb}
      <div class="active-char-info">
        <strong>${escapeHtml(active.name)}</strong>
        <span class="muted">.${escapeHtml(active.format)}</span>
      </div>
    </div>`
}

// --- Karakter (2-level: daftar format → detail format) ---
const formatList = document.getElementById('format-list')
const formatView = document.getElementById('format-view')
const formatDetailView = document.getElementById('format-detail-view')
const formatDetail = document.getElementById('format-detail')
const backToFormats = document.getElementById('back-to-formats')

let currentFormat = null
let pendingImage = null // foto JPG (data URL) untuk karakter baru
let editingCharId = null // null = tambah; id = edit karakter

function extOf(path) {
  return (path || '').split('.').pop().toLowerCase()
}

// VIEW 1: daftar format (card klik-able)
function renderFormatList() {
  formatList.innerHTML = FORMAT_INFO.map((f) => {
    const count = (settings.characters || []).filter((c) => c.format === f.ext).length
    return `<div class="format-item" data-ext="${f.ext}">
      <div class="format-head">
        <span class="format-badge">${escapeHtml(f.label)}</span>
        <span class="muted">.${f.ext} · ${count} karakter</span>
      </div>
      <p class="format-desc">${escapeHtml(f.desc)}</p>
      <div class="format-chevron">›</div>
    </div>`
  }).join('')

  formatList.querySelectorAll('.format-item').forEach((el) => {
    el.addEventListener('click', () => openFormatDetail(el.dataset.ext))
  })
}

// VIEW 2: detail format
function openFormatDetail(ext) {
  currentFormat = ext
  const f = FORMAT_INFO.find((x) => x.ext === ext)
  if (!f) return

  const chars = (settings.characters || []).filter((c) => c.format === ext)

  formatDetail.innerHTML = `
    <div class="card">
      <h2>${escapeHtml(f.label)} <span class="muted">(.${f.ext})</span></h2>
      <p class="format-full">${escapeHtml(f.full)}</p>
      <div class="feature-list">
        ${f.features.map((feat) => `<div class="feature">• ${escapeHtml(feat)}</div>`).join('')}
      </div>
      <div class="format-pros"><span class="tag plus">+ ${escapeHtml(f.pros)}</span></div>
      <div class="format-cons"><span class="tag minus">− ${escapeHtml(f.cons)}</span></div>
    </div>

    <div class="card">
      <h2>Tambah Karakter ${escapeHtml(f.label)}</h2>
      <label class="field">
        <span>Nama</span>
        <input id="char-name" type="text" placeholder="cth. Ryo, Fushu" />
      </label>
      <label class="field">
        <span>File model (.${f.ext})</span>
        <div class="path-row">
          <input id="char-path" type="text" placeholder="path/ke/model.${f.ext}" />
          <button type="button" id="char-browse-btn" class="browse">Pilih…</button>
        </div>
      </label>
      <label class="field">
        <span>Foto (JPG/PNG, opsional)</span>
        <div class="path-row">
          <input id="char-image" type="file" accept="image/*" />
        </div>
      </label>
      <button id="char-add-btn" class="primary">Simpan Karakter</button>
    </div>

    <div class="card">
      <h2>Karakter ${escapeHtml(f.label)}</h2>
      <div id="char-gallery" class="char-gallery">
        ${renderGallery(chars)}
      </div>
    </div>
  `

  formatView.classList.add('hidden')
  formatDetailView.classList.remove('hidden')

  // Bind elemen baru.
  document.getElementById('char-browse-btn').addEventListener('click', async () => {
    try {
      const filePath = await window.hermesAvatar.pickModelFile()
      if (filePath) document.getElementById('char-path').value = filePath
    } catch (err) {
      statusEl.textContent = `Gagal buka dialog: ${err.message}`
    }
  })

  document.getElementById('char-image').addEventListener('change', (e) => {
    const file = e.target.files[0]
    if (!file) { pendingImage = null; return }
    const reader = new FileReader()
    reader.onload = () => { pendingImage = reader.result }
    reader.readAsDataURL(file)
  })

  document.getElementById('char-add-btn').addEventListener('click', () => {
    const path = document.getElementById('char-path').value.trim()
    const name = document.getElementById('char-name').value.trim()

    if (editingCharId) {
      // Mode edit: update metadata (nama + foto). Path tetap (format tidak berubah).
      const c = settings.characters.find((x) => x.id === editingCharId)
      if (c) {
        if (name) c.name = name
        if (pendingImage) c.image = pendingImage
        saveSettings(settings)
        statusEl.textContent = 'Karakter diperbarui.'
      }
      editingCharId = null
      pendingImage = null
      openFormatDetail(ext)
      return
    }

    // Mode tambah.
    if (!path) { statusEl.textContent = '⚠️ Pilih file model.'; return }
    const finalName = name || path.split('/').pop() || 'Karakter'
    const id = Date.now().toString(36)
    settings.characters.push({ id, name: finalName, path, format: ext, image: pendingImage || '', active: false })
    saveSettings(settings)
    pendingImage = null
    openFormatDetail(ext) // refresh detail (galeri + reset form)
    statusEl.textContent = 'Karakter disimpan.'
  })

  document.getElementById('char-gallery').addEventListener('click', async (e) => {
    const btn = e.target.closest('.mini-btn')
    if (!btn) return
    const id = btn.dataset.id
    const action = btn.dataset.action
    if (action === 'use') {
      settings.characters.forEach((c) => { c.active = c.id === id })
      saveSettings(settings)
      renderActiveChar()
      openFormatDetail(ext)
    } else if (action === 'edit') {
      const c = settings.characters.find((x) => x.id === id)
      if (!c) return
      editingCharId = id
      pendingImage = c.image || null
      // Isi form dengan data karakter untuk diedit.
      const nameInput = document.getElementById('char-name')
      const pathInput = document.getElementById('char-path')
      if (nameInput) nameInput.value = c.name
      if (pathInput) pathInput.value = c.path
      const addBtn = document.getElementById('char-add-btn')
      if (addBtn) addBtn.textContent = 'Simpan Perubahan'
      // Scroll ke form.
      const formCard = addBtn?.closest('.card')
      if (formCard) formCard.scrollIntoView({ behavior: 'smooth', block: 'start' })
      statusEl.textContent = `Mengedit: ${c.name}`
    } else if (action === 'delete') {
      const c = settings.characters.find((x) => x.id === id)
      const ok = await showConfirm(`Hapus karakter "${c?.name || ''}"?`, { title: 'Hapus Karakter' })
      if (!ok) return
      settings.characters = settings.characters.filter((x) => x.id !== id)
      if (editingCharId === id) editingCharId = null
      saveSettings(settings)
      renderActiveChar()
      openFormatDetail(ext)
    }
  })
}

function renderGallery(chars) {
  if (chars.length === 0) return '<p class="hint">Belum ada karakter.</p>'
  return `<div class="char-grid">` + chars.map((c) => {
    const active = c.active ? 'active' : ''
    const thumb = c.image
      ? `<img class="char-thumb" src="${c.image}" alt="" />`
      : `<div class="char-thumb placeholder">${renderIcon('user-round', { size: 24 })}</div>`
    return `<div class="char-card ${active}" data-id="${c.id}">
      ${thumb}
      <div class="char-card-name">${escapeHtml(c.name)}</div>
      <div class="char-card-actions">
        <button class="mini-btn use" data-action="use" data-id="${c.id}">Gunakan</button>
        <button class="mini-btn edit" data-action="edit" data-id="${c.id}">Edit</button>
        <button class="mini-btn del" data-action="delete" data-id="${c.id}">Hapus</button>
      </div>
    </div>`
  }).join('') + `</div>`
}

backToFormats.addEventListener('click', () => {
  formatDetailView.classList.add('hidden')
  formatView.classList.remove('hidden')
  renderFormatList()
})

// --- Tombol Mulai (pakai karakter aktif) ---
startBtn.addEventListener('click', async () => {
  const active = (settings.characters || []).find((c) => c.active)
  if (!active) {
    statusEl.textContent = '⚠️ Pilih karakter aktif dulu (sidebar Karakter).'
    return
  }

  startBtn.disabled = true
  statusEl.textContent = 'Memulai…'

  try {
    await window.hermesAvatar.startAvatar(active.path)
    startBtn.disabled = false
    statusEl.textContent = ''
  } catch (err) {
    statusEl.textContent = `Gagal: ${err.message}`
    startBtn.disabled = false
  }
})

// Saat settings tampil lagi, reset state.
window.addEventListener('focus', () => {
  startBtn.disabled = false
})

setInterval(refreshServiceStatus, 3000)

// --- Checklist 9Router (pengingat manual, persisten) ---
routerCheck.checked = !!settings.routerChecked
routerCheck.addEventListener('change', () => {
  settings.routerChecked = routerCheck.checked
  saveSettings(settings)
})

// --- Suara (TTS & STT & Percakapan) ---
const ttsEnabled = document.getElementById('tts-enabled')
const ttsVoice = document.getElementById('tts-voice')
const ttsSpeed = document.getElementById('tts-speed')
const ttsVerbosity = document.getElementById('tts-verbosity')
const sttModel = document.getElementById('stt-model')
const sttLanguage = document.getElementById('stt-language')
const convBargeIn = document.getElementById('conv-barge-in')
const convContinuous = document.getElementById('conv-continuous')

function loadVoiceUI() {
  ttsEnabled.checked = settings.tts.enabled
  ttsVoice.value = settings.tts.voice
  ttsSpeed.value = String(settings.tts.speed ?? 1.0)
  ttsVerbosity.value = settings.tts.verbosity || 'concise'
  sttModel.value = settings.stt.model
  sttLanguage.value = settings.stt.language
  convBargeIn.checked = settings.conversation?.bargeIn !== false
  convContinuous.checked = !!settings.conversation?.continuous
}

function saveVoiceUI() {
  settings.tts.enabled = ttsEnabled.checked
  settings.tts.voice = ttsVoice.value
  settings.tts.speed = parseFloat(ttsSpeed.value) || 1.0
  settings.tts.verbosity = ttsVerbosity.value
  settings.stt.model = sttModel.value
  settings.stt.language = sttLanguage.value
  settings.conversation = settings.conversation || {}
  settings.conversation.bargeIn = convBargeIn.checked
  settings.conversation.continuous = convContinuous.checked
  saveSettings(settings)

  // Terapkan ke Hermes (voice + STT model/bahasa) agar benar-benar berlaku.
  window.hermesAvatar.setTtsConfig({ voice: settings.tts.voice }).catch(() => {})
  window.hermesAvatar.setSttConfig({
    model: settings.stt.model,
    language: settings.stt.language
  }).catch(() => {})
}

;['tts-enabled', 'tts-voice', 'tts-speed', 'tts-verbosity', 'stt-model', 'stt-language', 'conv-barge-in', 'conv-continuous'].forEach((id) => {
  document.getElementById(id).addEventListener('change', saveVoiceUI)
})

// --- LLM & Provider ---
const llmName = document.getElementById('llm-name')
const llmBaseUrl = document.getElementById('llm-base-url')
const llmApiKey = document.getElementById('llm-api-key')
const llmModel = document.getElementById('llm-model')
const llmAddBtn = document.getElementById('llm-add-btn')
const llmList = document.getElementById('llm-list')

function maskKey(key) {
  if (!key) return ''
  return '••••••••' // apiKey sudah terenkripsi, tampilkan mask saja
}

let editingProviderId = null // null = mode tambah; id = mode edit

function renderLlmList() {
  const providers = settings.llm.providers || []
  if (providers.length === 0) {
    llmList.innerHTML = '<p class="hint">Belum ada provider.</p>'
    return
  }
  llmList.innerHTML = providers
    .map((p) => {
      return `<div class="llm-item" data-id="${escapeHtml(p.id)}">
        <div class="llm-item-main">
          <strong>${escapeHtml(p.name)}</strong>
          <span class="muted">${escapeHtml(p.model || '')}</span>
          <button class="mini-btn activate llm-activate" data-id="${escapeHtml(p.id)}">Aktifkan</button>
          <button class="mini-btn test llm-test" data-id="${escapeHtml(p.id)}">Tes</button>
          <button class="mini-btn edit llm-edit" data-id="${escapeHtml(p.id)}">Edit</button>
          <button class="mini-btn del llm-del" data-id="${escapeHtml(p.id)}">Hapus</button>
        </div>
        <div class="llm-item-sub">${escapeHtml(p.baseUrl || '')} · ${maskKey(p.apiKey)}</div>
      </div>`
    })
    .join('')

  // Bind tombol "Aktifkan" → set model + base_url ke Hermes.
  llmList.querySelectorAll('.llm-activate').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id
      const p = settings.llm.providers.find((x) => x.id === id)
      if (!p?.model) { statusEl.textContent = '⚠️ Model kosong.'; return }

      btn.disabled = true
      const original = btn.textContent
      btn.textContent = '…'

      try {
        // Set model aktif via `hermes config set` (mekanisme resmi, pasti benar).
        const res = await window.hermesAvatar.setModel(p.model)
        if (!res.ok) throw new Error(res.error)

        statusEl.textContent = `✓ Provider "${p.name}" diaktifkan (${p.model}).`
        await refreshLlmActive()
        await refreshModelOptions()
      } catch (err) {
        statusEl.textContent = `✗ Gagal aktifkan: ${err?.message || err}`
      } finally {
        btn.disabled = false
        btn.textContent = original
      }
    })
  })

  // Bind tombol hapus.
  llmList.querySelectorAll('.llm-del').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id
      const p = settings.llm.providers.find((x) => x.id === id)
      const ok = await showConfirm(`Hapus provider "${p?.name || ''}"?`, { title: 'Hapus Provider' })
      if (!ok) return
      settings.llm.providers = settings.llm.providers.filter((x) => x.id !== id)
      if (editingProviderId === id) resetProviderForm()
      saveSettings(settings)
      renderLlmList()
      statusEl.textContent = 'Provider dihapus.'
    })
  })

  // Bind tombol edit.
  llmList.querySelectorAll('.llm-edit').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id
      const p = settings.llm.providers.find((x) => x.id === id)
      if (!p) return
      editingProviderId = id
      llmName.value = p.name
      llmBaseUrl.value = p.baseUrl || ''
      // Decrypt API key untuk diedit.
      const decRes = await window.hermesAvatar.decryptSecret(p.apiKey || '')
      llmApiKey.value = decRes.ok ? decRes.value : ''
      llmModel.value = p.model || ''
      llmAddBtn.textContent = 'Simpan Perubahan'
      statusEl.textContent = `Mengedit: ${p.name}`
    })
  })

  // Bind tombol tes koneksi (chat completion sungguhan).
  llmList.querySelectorAll('.llm-test').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id
      const p = settings.llm.providers.find((x) => x.id === id)
      if (!p?.baseUrl) { statusEl.textContent = '⚠️ Base URL kosong.'; return }
      if (!p?.model) { statusEl.textContent = '⚠️ Model kosong.'; return }

      btn.disabled = true
      const originalText = btn.textContent
      btn.textContent = '…'

      // Decrypt API key untuk dikirim.
      let apiKey = ''
      try {
        const decRes = await window.hermesAvatar.decryptSecret(p.apiKey || '')
        apiKey = decRes.ok ? decRes.value : ''
      } catch { /* key kosong */ }

      try {
        const res = await window.hermesAvatar.testConnection(p.baseUrl, p.model, apiKey)
        if (res.ok) {
          btn.textContent = '✓'
          btn.classList.add('test-ok')
          statusEl.textContent = `✓ ${p.model} berfungsi (HTTP ${res.status ?? 'ok'})`
        } else {
          btn.textContent = '✗'
          btn.classList.add('test-fail')
          statusEl.textContent = `✗ Gagal: ${res.error || 'tidak berfungsi'}`
        }
      } catch (err) {
        btn.textContent = '✗'
        btn.classList.add('test-fail')
        statusEl.textContent = `✗ Gagal: ${err?.message || err}`
      } finally {
        btn.disabled = false
        // Kembalikan label "Tes" setelah beberapa detik.
        setTimeout(() => {
          btn.textContent = originalText
          btn.classList.remove('test-ok', 'test-fail')
        }, 2500)
      }
    })
  })
}

function resetProviderForm() {
  editingProviderId = null
  llmName.value = ''
  llmBaseUrl.value = ''
  llmApiKey.value = ''
  llmModel.value = ''
  llmAddBtn.textContent = 'Simpan Provider'
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

// --- Modal konfirmasi (custom, sesuai tema) ---
const confirmModal = document.getElementById('confirm-modal')
const confirmTitle = document.getElementById('confirm-title')
const confirmMessage = document.getElementById('confirm-message')
const confirmOk = document.getElementById('confirm-ok')
const confirmCancel = document.getElementById('confirm-cancel')

function showConfirm(message, { title = 'Konfirmasi', okLabel = 'Hapus', danger = true } = {}) {
  return new Promise((resolve) => {
    let settled = false

    confirmTitle.textContent = title
    confirmMessage.textContent = message
    confirmOk.textContent = okLabel
    confirmOk.classList.toggle('danger', danger)

    confirmModal.hidden = false

    const finish = (val) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(val)
    }

    const cleanup = () => {
      confirmModal.hidden = true
      confirmOk.removeEventListener('click', onOk)
      confirmCancel.removeEventListener('click', onCancel)
      confirmModal.removeEventListener('click', onBackdrop)
      document.removeEventListener('keydown', onKey)
    }

    const onOk = () => finish(true)
    const onCancel = () => finish(false)
    const onBackdrop = (e) => {
      if (e.target === confirmModal) finish(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') finish(false)
    }

    confirmOk.addEventListener('click', onOk)
    confirmCancel.addEventListener('click', onCancel)
    confirmModal.addEventListener('click', onBackdrop)
    document.addEventListener('keydown', onKey)

    // Fokus tombol batal agar keyboard/aksesibilitas baik.
    confirmCancel.focus()
  })
}

llmAddBtn.addEventListener('click', async () => {
  const name = llmName.value.trim()
  if (!name) {
    statusEl.textContent = '⚠️ Isi nama provider.'
    return
  }

  // Enkripsi API key sebelum disimpan (aman, tidak plaintext di localStorage).
  const apiKeyPlain = llmApiKey.value.trim()
  const encRes = await window.hermesAvatar.encryptSecret(apiKeyPlain)
  const apiKeyEnc = encRes.ok ? encRes.value : ''

  if (editingProviderId) {
    // Mode edit: update provider yang ada.
    const p = settings.llm.providers.find((x) => x.id === editingProviderId)
    if (p) {
      p.name = name
      p.baseUrl = llmBaseUrl.value.trim()
      p.apiKey = apiKeyEnc
      p.model = llmModel.value.trim()
      saveSettings(settings)
      statusEl.textContent = 'Provider diperbarui.'
    }
    resetProviderForm()
  } else {
    // Mode tambah.
    settings.llm.providers.push({
      id: Date.now().toString(36),
      name,
      baseUrl: llmBaseUrl.value.trim(),
      apiKey: apiKeyEnc,
      model: llmModel.value.trim()
    })
    saveSettings(settings)
    statusEl.textContent = 'Provider disimpan (lokal).'
    llmName.value = ''
    llmBaseUrl.value = ''
    llmApiKey.value = ''
    llmModel.value = ''
  }

  renderLlmList()
})

// --- LLM via RPC (model aktif + switch via dropdown) ---
const llmActiveEl = document.getElementById('llm-active')
const llmRefreshBtn = document.getElementById('llm-refresh-btn')
const llmSwitchModel = document.getElementById('llm-switch-model')
const llmSwitchBtn = document.getElementById('llm-switch-btn')

function modelItemHtml(r) {
  return `<div class="llm-item">
    <div class="llm-item-main"><strong>${escapeHtml(r.model || '—')}</strong></div>
    <div class="llm-item-sub">provider: ${escapeHtml(r.provider || '—')}</div>
  </div>`
}

async function refreshLlmActive() {
  const homeModelEl = document.getElementById('home-model')
  try {
    const res = await window.hermesAvatar.rpc('config.get', { key: 'provider' })
    if (!res.ok) throw new Error(res.error)
    const r = res.result
    const html = modelItemHtml(r)
    llmActiveEl.innerHTML = html
    if (homeModelEl) homeModelEl.innerHTML = html
  } catch (err) {
    const fallback = `<p class="hint">Tidak dapat memuat (${escapeHtml(err?.message || err)})</p>`
    llmActiveEl.innerHTML = fallback
    if (homeModelEl) homeModelEl.innerHTML = fallback
  }
}

// Ambil daftar model dari model.options — HANYA custom/user-defined provider
// (mis. 9Router / "Hermes Avatar"), bukan provider canonical (OpenRouter, dll).
async function refreshModelOptions() {
  try {
    const res = await window.hermesAvatar.rpc('model.options', {})
    if (!res.ok) throw new Error(res.error)
    const providers = res.result?.providers || []

    const custom = []

    for (const p of providers) {
      const slug = p.slug || 'custom'
      const name = p.name || slug
      const models = p.models || []
      const isCustom = p.is_user_defined || slug === 'custom' || /^custom(:|$)/.test(slug) || /localhost|127\.0\.0\.1/.test(p.base_url || '')

      if (!isCustom) continue // abaikan provider canonical (OpenRouter, Anthropic, dll)

      for (const m of models) {
        // Value = nama model langsung (tanpa prefix), karena switch pakai
        // config.set model.default (bukan format custom:model yang salah parse).
        custom.push({ value: m, label: `${name} — ${m}` })
      }
      if (models.length === 0) {
        custom.push({ value: '', label: name })
      }
    }

    // Jika tidak ada custom, fallback tampilkan semua (jaga-jaga).
    let options = custom
    if (custom.length === 0) {
      for (const p of providers) {
        const slug = p.slug || 'custom'
        const name = p.name || slug
        for (const m of (p.models || [])) {
          options.push({ value: `${slug}:${m}`, label: `${name} — ${m}` })
        }
      }
    }

    llmSwitchModel.innerHTML = options.length
      ? options.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('')
      : '<option value="">Tidak ada model</option>'
  } catch (err) {
    llmSwitchModel.innerHTML = `<option value="">Gagal memuat (${escapeHtml(err?.message || err)})</option>`
  }
}

llmRefreshBtn.addEventListener('click', () => {
  refreshLlmActive()
  refreshModelOptions()
})

// --- Skill Hermes ---
const skillList = document.getElementById('skill-list')
const skillRefreshBtn = document.getElementById('skill-refresh-btn')
const skillSearch = document.getElementById('skill-search')

let allSkills = [] // cache: [{name, category}]

async function loadSkills() {
  const res = await window.hermesAvatar.rpc('skills.manage', { action: 'list' })
  if (!res.ok) throw new Error(res.error)
  const skills = res.result?.skills

  // skills bisa: Dict { category: [names] } ATAU Array.
  const flat = []
  if (Array.isArray(skills)) {
    for (const s of skills) flat.push({ name: typeof s === 'string' ? s : s.name, category: typeof s === 'string' ? '' : (s.category || 'general') })
  } else if (skills && typeof skills === 'object') {
    for (const [cat, names] of Object.entries(skills)) {
      for (const n of names) flat.push({ name: n, category: cat })
    }
  }
  return flat
}

function groupByCategory(list) {
  const map = {}
  for (const s of list) {
    const cat = s.category || 'general'
    if (!map[cat]) map[cat] = []
    map[cat].push(s.name)
  }
  return map
}

function renderSkills() {
  const q = (skillSearch.value || '').trim().toLowerCase()

  let filtered = allSkills
  if (q) {
    filtered = allSkills.filter((s) => s.name.toLowerCase().includes(q) || (s.category || '').toLowerCase().includes(q))
  }

  if (filtered.length === 0) {
    skillList.innerHTML = '<p class="hint">Tidak ada skill.</p>'
    return
  }

  const grouped = groupByCategory(filtered)
  const cats = Object.keys(grouped).sort()

  skillList.innerHTML = cats.map((cat) => {
    const names = grouped[cat]
    const items = names.map((n) => {
      return `<span class="skill-chip">
        <span class="skill-chip-name">${escapeHtml(n)}</span>
        <button class="skill-chip-del" data-name="${escapeHtml(n)}" data-cat="${escapeHtml(cat)}" title="Hapus skill">×</button>
      </span>`
    }).join('')
    return `<div class="skill-acc">
      <button class="skill-acc-head" type="button">
        <span class="skill-acc-cat">${escapeHtml(cat)}</span>
        <span class="skill-acc-count">${names.length}</span>
        <span class="skill-acc-arrow">▾</span>
      </button>
      <div class="skill-acc-body">
        <div class="skill-chips">${items}</div>
      </div>
    </div>`
  }).join('')

  // Accordion toggle.
  skillList.querySelectorAll('.skill-acc-head').forEach((head) => {
    head.addEventListener('click', () => {
      const acc = head.parentElement
      acc.classList.toggle('open')
    })
  })

  // Tombol hapus skill.
  skillList.querySelectorAll('.skill-chip-del').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const name = btn.dataset.name
      const cat = btn.dataset.cat
      const ok = await showConfirm(`Hapus skill "${name}"? Tindakan ini tidak bisa dibatalkan.`, { title: 'Hapus Skill' })
      if (!ok) return
      try {
        const res = await window.hermesAvatar.deleteSkill({ name, category: cat })
        if (!res.ok) throw new Error(res.error)
        statusEl.textContent = 'Skill dihapus.'
        reloadAndRefreshSkills()
      } catch (err) {
        statusEl.textContent = `Gagal hapus skill: ${err?.message || err}`
      }
    })
  })
}

async function refreshSkills() {
  try {
    allSkills = await loadSkills()
    renderSkills()
  } catch (err) {
    skillList.innerHTML = `<p class="hint">Gagal memuat (${escapeHtml(err?.message || err)})</p>`
  }
}

// Reload skill di Hermes (agar add/delete langsung terdeteksi) + refresh list.
async function reloadAndRefreshSkills() {
  try {
    await window.hermesAvatar.rpc('skills.reload', {})
  } catch (err) {
    // reload opsional — jangan hentikan refresh list.
    console.warn('[skills.reload]', err?.message || err)
  }
  await refreshSkills()
}

skillRefreshBtn.addEventListener('click', refreshSkills)
skillSearch.addEventListener('input', renderSkills)

// --- Tambah skill (upload .md atau ketik manual) ---
const skillName = document.getElementById('skill-name')
const skillCategory = document.getElementById('skill-category')
const skillContent = document.getElementById('skill-content')
const skillAddBtn = document.getElementById('skill-add-btn')
const skillUploadBtn = document.getElementById('skill-upload-btn')
const skillFile = document.getElementById('skill-file')
const skillFileName = document.getElementById('skill-file-name')

// Upload file .md → baca isi → isi textarea + nama otomatis.
skillUploadBtn.addEventListener('click', () => skillFile.click())

skillFile.addEventListener('change', () => {
  const file = skillFile.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    skillContent.value = reader.result
    // Auto-isi nama dari nama file (tanpa ekstensi) jika kosong.
    if (!skillName.value) {
      skillName.value = file.name.replace(/\.(md|markdown)$/i, '')
    }
    skillFileName.textContent = file.name
  }
  reader.readAsText(file)
})

skillAddBtn.addEventListener('click', async () => {
  const name = skillName.value.trim()
  const content = skillContent.value.trim()
  if (!name || !content) {
    statusEl.textContent = '⚠️ Isi nama & isi skill (atau unggah file .md).'
    return
  }
  skillAddBtn.disabled = true
  try {
    const res = await window.hermesAvatar.addSkill({
      name,
      category: skillCategory.value.trim(),
      content
    })
    if (!res.ok) throw new Error(res.error)
    statusEl.textContent = 'Skill disimpan.'
    skillName.value = ''
    skillCategory.value = ''
    skillContent.value = ''
    skillFileName.textContent = ''
    skillFile.value = ''
    reloadAndRefreshSkills()
  } catch (err) {
    statusEl.textContent = `Gagal simpan skill: ${err?.message || err}`
  } finally {
    skillAddBtn.disabled = false
  }
})

// --- Install skill dari hub ---
const skillInstallId = document.getElementById('skill-install-id')
const skillInstallBtn = document.getElementById('skill-install-btn')

skillInstallBtn.addEventListener('click', async () => {
  const id = skillInstallId.value.trim()
  if (!id) { statusEl.textContent = '⚠️ Isi Skill ID.'; return }

  skillInstallBtn.disabled = true
  skillInstallBtn.textContent = 'Menginstall…'
  try {
    const res = await window.hermesAvatar.installSkill(id)
    if (!res.ok) throw new Error(res.error)
    statusEl.textContent = `Skill "${id}" diinstall.`
    skillInstallId.value = ''
    reloadAndRefreshSkills()
  } catch (err) {
    statusEl.textContent = `Gagal install skill: ${err?.message || err}`
  } finally {
    skillInstallBtn.disabled = false
    skillInstallBtn.textContent = 'Install Skill'
  }
})

// --- Animasi (2-level: menu → detail sub-panel) ---
const animMenuView = document.getElementById('anim-menu-view')
const animDetailView = document.getElementById('anim-detail-view')
const animMenu = document.getElementById('anim-menu')
const animDetail = document.getElementById('anim-detail')
const animBackBtn = document.getElementById('anim-back-btn')

const BUILTIN_EMOTES = [
  { id: 'bounce', icon: 'arrow-up', label: 'Bounce' },
  { id: 'jump', icon: 'arrow-up', label: 'Jump' },
  { id: 'wave', icon: 'hand', label: 'Wave' },
  { id: 'nod', icon: 'smile', label: 'Nod' }
]

const ANIM_MENU = [
  { id: 'pose-default', icon: 'user', label: 'Pose Default', desc: 'Pilih pose saat idle (A-pose / T-pose)' },
  { id: 'pose-saved', icon: 'film', label: 'Pose Tersimpan', desc: 'Animasi pose custom yang diupload' },
  { id: 'emote', icon: 'smile', label: 'Emote', desc: 'Emote bawaan + custom (panel avatar)' },
  { id: 'add', icon: 'plus', label: 'Tambah Animasi', desc: 'Upload file animasi (GLB / VMD)' }
]

function customPoses() { return (settings.animations || []).filter((a) => a.type === 'pose') }
function customEmotes() { return (settings.animations || []).filter((a) => a.type === 'emote') }

function renderAnimMenu() {
  animMenu.innerHTML = ANIM_MENU.map((m) => {
    return `<div class="format-item" data-sub="${m.id}">
      <div class="format-head">
        <span class="format-badge">${renderIcon(m.icon, { size: 16 })}</span>
        <span>${escapeHtml(m.label)}</span>
      </div>
      <p class="format-desc">${escapeHtml(m.desc)}</p>
      <div class="format-chevron">›</div>
    </div>`
  }).join('')

  animMenu.querySelectorAll('.format-item').forEach((el) => {
    el.addEventListener('click', () => openAnimDetail(el.dataset.sub))
  })
}

function openAnimDetail(sub) {
  animMenuView.classList.add('hidden')
  animDetailView.classList.remove('hidden')

  if (sub === 'pose-default') {
    animDetail.innerHTML = `
      <div class="card">
        <h2>Pose Default</h2>
        <p class="hint">Pose yang dipakai avatar saat diam (idle).</p>
        <label class="field">
          <span>Pose</span>
          <select id="pose-select">
            <option value="a-pose">A-pose (tangan di samping)</option>
            <option value="t-pose">T-pose (tangan terentang)</option>
          </select>
        </label>
      </div>`
    const sel = document.getElementById('pose-select')
    sel.value = settings.pose || 'a-pose'
    sel.onchange = () => {
      settings.pose = sel.value
      saveSettings(settings)
      statusEl.textContent = 'Pose default disimpan.'
    }
  } else if (sub === 'pose-saved') {
    animDetail.innerHTML = `<div class="card">
      <h2>Pose Tersimpan</h2>
      <p class="hint">Animasi pose custom (.glb/.vmd) yang diupload. Bisa dihapus.</p>
      <div id="pose-list" class="anim-list">${renderPoseListHtml()}</div>
    </div>`
    bindAnimDeleteIn('#pose-list')
  } else if (sub === 'emote') {
    animDetail.innerHTML = `<div class="card">
      <h2>Emote</h2>
      <p class="hint">Emote bawaan (procedural) + custom (upload).</p>
      <div id="emote-list" class="anim-list">${renderEmoteListHtml()}</div>
    </div>`
    bindAnimDeleteIn('#emote-list')
  } else if (sub === 'add') {
    animDetail.innerHTML = `
      <div class="card">
        <h2>Tambah Animasi</h2>
        <p class="hint">Format: <code>.glb</code> (GLB + animation) atau <code>.vmd</code> (MMD motion).</p>
        <div class="path-row" style="margin-bottom:12px;">
          <input id="anim-name" type="text" placeholder="Nama animasi" />
          <button type="button" id="anim-pick-btn" class="browse">Pilih file…</button>
        </div>
        <label class="field">
          <span>Path file</span>
          <input id="anim-path" type="text" placeholder="otomatis terisi" readonly />
        </label>
        <label class="field">
          <span>Tipe</span>
          <select id="anim-type">
            <option value="pose">Pose (default / idle)</option>
            <option value="emote">Emote (panel emote avatar)</option>
          </select>
        </label>
        <button id="anim-add-btn" class="primary">Simpan Animasi</button>
      </div>`
    bindAnimAddForm()
  }
}

function renderPoseListHtml() {
  const poses = customPoses()
  if (poses.length === 0) return '<p class="hint">Belum ada pose custom.</p>'
  return poses.map((a) => animItemHtml(a)).join('')
}

function renderEmoteListHtml() {
  const builtin = BUILTIN_EMOTES.map((e) => {
    return `<div class="app-item">
      <div class="app-item-main">${renderIcon(e.icon, { size: 16 })}<strong>${escapeHtml(e.label)}</strong></div>
      <span class="muted">bawaan</span>
    </div>`
  }).join('')
  const custom = customEmotes().map((a) => animItemHtml(a)).join('')
  return builtin + custom || '<p class="hint">Belum ada emote.</p>'
}

function animItemHtml(a) {
  return `<div class="app-item" data-id="${escapeHtml(a.id)}">
    <div class="app-item-main">
      ${renderIcon('film', { size: 16 })}
      <strong>${escapeHtml(a.name)}</strong>
      <span class="muted">.${escapeHtml(a.format)}</span>
    </div>
    <button class="mini-btn del anim-del" data-id="${escapeHtml(a.id)}">Hapus</button>
  </div>`
}

function bindAnimDeleteIn(selector) {
  const container = document.querySelector(selector)
  if (!container) return
  container.querySelectorAll('.anim-del').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id
      const a = (settings.animations || []).find((x) => x.id === id)
      const ok = await showConfirm(`Hapus animasi "${a?.name || ''}"?`, { title: 'Hapus Animasi' })
      if (!ok) return
      settings.animations = (settings.animations || []).filter((x) => x.id !== id)
      saveSettings(settings)
      openAnimDetail('pose-saved')
    })
  })
}

function bindAnimAddForm() {
  document.getElementById('anim-pick-btn').addEventListener('click', async () => {
    try {
      const filePath = await window.hermesAvatar.pickAnimation()
      if (!filePath) return
      document.getElementById('anim-path').value = filePath
      const base = filePath.split('/').pop().replace(/\.(glb|gltf|vmd)$/i, '')
      const nameEl = document.getElementById('anim-name')
      if (!nameEl.value) nameEl.value = base
    } catch (err) {
      statusEl.textContent = `Gagal pilih animasi: ${err?.message || err}`
    }
  })

  document.getElementById('anim-add-btn').addEventListener('click', () => {
    const path = document.getElementById('anim-path').value.trim()
    if (!path) { statusEl.textContent = '⚠️ Pilih file animasi.'; return }
    const name = document.getElementById('anim-name').value.trim() || path.split('/').pop() || 'Animasi'
    const format = path.split('.').pop().toLowerCase()
    const type = document.getElementById('anim-type').value
    settings.animations = settings.animations || []
    settings.animations.push({ id: Date.now().toString(36), name, path, format, type })
    saveSettings(settings)
    statusEl.textContent = `Animasi "${name}" disimpan sebagai ${type === 'pose' ? 'Pose' : 'Emote'}.`
    openAnimDetail(type === 'pose' ? 'pose-saved' : 'emote')
  })
}

function renderAnimationSettings() {
  renderAnimMenu()
  animMenuView.classList.remove('hidden')
  animDetailView.classList.add('hidden')
}

animBackBtn.addEventListener('click', () => {
  animDetailView.classList.add('hidden')
  animMenuView.classList.remove('hidden')
  renderAnimMenu()
})
// --- Perintah (allowlist aksi) ---
const actionList = document.getElementById('action-list')

const ACTION_DEFS = [
  { id: 'open_app', icon: 'play', label: 'Buka aplikasi', desc: 'Buka / jalankan aplikasi (Activity Monitor, browser, dll)' },
  { id: 'open_website', icon: 'globe', label: 'Buka website', desc: 'Buka URL / cari di web' },
  { id: 'browser_control', icon: 'monitor', label: 'Kontrol browser', desc: 'Kelola tab, navigasi, interaksi halaman' },
  { id: 'system_monitor', icon: 'activity', label: 'Aktivitas sistem', desc: 'Lihat proses / monitor yang berjalan' },
  { id: 'file_access', icon: 'folder', label: 'Akses file', desc: 'Baca / tulis file' },
  { id: 'terminal', icon: 'terminal', label: 'Terminal / shell', desc: 'Jalankan perintah shell (berisiko)' }
]

function renderActions() {
  const actions = settings.actions || {}
  actionList.innerHTML = ACTION_DEFS.map((a) => {
    const checked = actions[a.id] ? 'checked' : ''
    return `<label class="switch-row">
      <span class="action-label">
        <span class="action-name">${renderIcon(a.icon, { size: 18 })} ${escapeHtml(a.label)}</span>
        <span class="action-desc">${escapeHtml(a.desc)}</span>
      </span>
      <input type="checkbox" data-action="${a.id}" ${checked} />
    </label>`
  }).join('')

  actionList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      settings.actions = settings.actions || {}
      settings.actions[cb.dataset.action] = cb.checked
      saveSettings(settings)
      statusEl.textContent = 'Preferensi aksi disimpan.'
    })
  })
}

// --- Aplikasi terdaftar (bisa dibuka) — CRUD ---
const appName = document.getElementById('app-name')
const appCommand = document.getElementById('app-command')
const appAddBtn = document.getElementById('app-add-btn')
const appPickBtn = document.getElementById('app-pick-btn')
const appList = document.getElementById('app-list')

let pendingAppIcon = '' // icon (data URL) untuk aplikasi yang akan ditambah

function renderAppList() {
  const apps = settings.actionApps || []
  if (apps.length === 0) {
    appList.innerHTML = '<p class="hint">Belum ada aplikasi terdaftar.</p>'
    return
  }
  appList.innerHTML = apps.map((a) => {
    const icon = a.icon
      ? `<img class="app-icon" src="${a.icon}" alt="" />`
      : `<span class="app-icon placeholder">${renderIcon('play', { size: 16 })}</span>`
    return `<div class="app-item" data-id="${escapeHtml(a.id)}">
      <div class="app-item-main">
        ${icon}
        <strong>${escapeHtml(a.name)}</strong>
        ${a.command ? `<code class="app-cmd">${escapeHtml(a.command)}</code>` : ''}
      </div>
      <button class="mini-btn del app-del" data-id="${escapeHtml(a.id)}">Hapus</button>
    </div>`
  }).join('')

  appList.querySelectorAll('.app-del').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id
      const a = (settings.actionApps || []).find((x) => x.id === id)
      const ok = await showConfirm(`Hapus aplikasi "${a?.name || ''}"?`, { title: 'Hapus Aplikasi' })
      if (!ok) return
      settings.actionApps = (settings.actionApps || []).filter((x) => x.id !== id)
      saveSettings(settings)
      renderAppList()
      statusEl.textContent = 'Aplikasi dihapus.'
    })
  })
}

// Pilih aplikasi via dialog → isi nama + path + ambil icon.
appPickBtn.addEventListener('click', async () => {
  try {
    const filePath = await window.hermesAvatar.pickApp()
    if (!filePath) return
    appCommand.value = filePath
    // Auto nama dari path (basename tanpa ekstensi).
    const base = filePath.split('/').pop().replace(/\.(app|exe|desktop|lnk)$/i, '')
    if (!appName.value) appName.value = base
    // Ambil icon asli.
    const iconRes = await window.hermesAvatar.getAppIcon(filePath)
    pendingAppIcon = iconRes.ok ? iconRes.dataUrl : ''
  } catch (err) {
    statusEl.textContent = `Gagal pilih aplikasi: ${err?.message || err}`
  }
})

appAddBtn.addEventListener('click', () => {
  const name = appName.value.trim()
  if (!name) {
    statusEl.textContent = '⚠️ Isi nama aplikasi.'
    return
  }
  settings.actionApps = settings.actionApps || []
  settings.actionApps.push({
    id: Date.now().toString(36),
    name,
    command: appCommand.value.trim(),
    icon: pendingAppIcon || ''
  })
  saveSettings(settings)
  renderAppList()
  appName.value = ''
  appCommand.value = ''
  pendingAppIcon = ''
  statusEl.textContent = 'Aplikasi ditambahkan.'
})

// --- Shortcut global ---
const shortcutList = document.getElementById('shortcut-list')

async function renderShortcuts() {
  try {
    const list = await window.hermesAvatar.getShortcuts()
    if (!list || list.length === 0) {
      shortcutList.innerHTML = '<p class="hint">Tidak ada shortcut.</p>'
      return
    }
    shortcutList.innerHTML = list.map((s) => {
      return `<div class="shortcut-row" data-id="${escapeHtml(s.id)}">
        <span>${escapeHtml(s.label)}</span>
        <div class="shortcut-edit">
          <input class="shortcut-input" type="text" value="${escapeHtml(s.accel)}" placeholder="Tekan kombinasi..." readonly />
          <button class="mini-btn use shortcut-save" data-id="${escapeHtml(s.id)}">Simpan</button>
        </div>
      </div>`
    }).join('')

    // Bind key capture (deteksi keyboard) + tombol simpan.
    shortcutList.querySelectorAll('.shortcut-input').forEach((input) => {
      input.addEventListener('focus', () => input.classList.add('capturing'))
      input.addEventListener('blur', () => input.classList.remove('capturing'))

      input.addEventListener('keydown', (e) => {
        e.preventDefault()
        const accel = keyEventToAccelerator(e)
        if (accel) input.value = accel
      })
    })

    shortcutList.querySelectorAll('.shortcut-save').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id
        const row = btn.closest('.shortcut-row')
        const input = row.querySelector('.shortcut-input')
        const accel = input.value.trim()
        if (!accel) { statusEl.textContent = '⚠️ Tekan kombinasi dulu.'; return }
        try {
          const res = await window.hermesAvatar.setShortcut(id, accel)
          if (!res.ok) throw new Error(res.error)
          statusEl.textContent = 'Shortcut disimpan.'
          renderShortcuts()
        } catch (err) {
          statusEl.textContent = `Gagal simpan shortcut: ${err?.message || err}`
        }
      })
    })
  } catch (err) {
    shortcutList.innerHTML = `<p class="hint">Gagal memuat (${escapeHtml(err?.message || err)})</p>`
  }
}

// Ubah KeyboardEvent → string accelerator Electron (rapi & konsisten).
function keyEventToAccelerator(e) {
  const key = e.key
  // Abaikan tombol modifier saja.
  if (['Control', 'Shift', 'Alt', 'Meta', 'Escape'].includes(key)) return null

  const mods = []
  if (e.metaKey || e.ctrlKey) mods.push('CommandOrControl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')

  // Normalisasi key utama.
  let main = key
  if (key === ' ') main = 'Space'
  else if (key === 'ArrowUp') main = 'Up'
  else if (key === 'ArrowDown') main = 'Down'
  else if (key === 'ArrowLeft') main = 'Left'
  else if (key === 'ArrowRight') main = 'Right'
  else if (key.length === 1) main = key.toUpperCase()
  else if (key.startsWith('F') && /^F\d+$/.test(key)) main = key
  else main = key

  if (!main) return null
  return [...mods, main].join('+')
}

llmSwitchBtn.addEventListener('click', async () => {
  const value = llmSwitchModel.value.trim()
  if (!value) {
    statusEl.textContent = '⚠️ Pilih model dulu.'
    return
  }
  llmSwitchBtn.disabled = true
  try {
    const res = await window.hermesAvatar.setModel(value)
    if (!res.ok) throw new Error(res.error)
    statusEl.textContent = 'Model diterapkan.'
    await refreshLlmActive()
  } catch (err) {
    statusEl.textContent = `Gagal switch model: ${err?.message || err}`
  } finally {
    llmSwitchBtn.disabled = false
  }
})

function init() {
  renderNav()
  refreshServiceStatus()
  loadVoiceUI()
  renderLlmList()
  renderFormatList()
  renderActiveChar()
  refreshLlmActive()
  refreshModelOptions()
  renderAnimationSettings()
  renderActions()
  renderAppList()
  renderShortcuts()
  refreshSkills()
}

init()
