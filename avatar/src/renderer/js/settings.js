/**
 * settings.js — entry untuk settings.html (home pertama saat app dibuka).
 * Layout ala macOS System Settings: sidebar kiri + panel konten kanan.
 */

import { loadSettings, saveSettings } from './settings-store.js'

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

// --- Definisi sidebar (terpusat, mudah ditambah item/skill baru) ---
const SECTIONS = [
  { id: 'home', icon: '🏠', label: 'Home' },
  { id: 'character', icon: '🎭', label: 'Karakter' },
  { id: 'voice', icon: '🎤', label: 'Suara' },
  { id: 'llm', icon: '🧠', label: 'LLM & Provider' },
  { id: 'shortcut', icon: '⌨️', label: 'Shortcut' }
]

// --- Navigasi sidebar ---
const nav = document.getElementById('nav')
const panels = document.querySelectorAll('.panel')

function renderNav() {
  nav.innerHTML = SECTIONS.map((s, i) => {
    const active = i === 0 ? 'active' : ''
    return `<button class="nav-item ${active}" data-section="${s.id}">
      <span class="nav-icon">${s.icon}</span> ${escapeHtml(s.label)}
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
    : `<div class="char-thumb placeholder">🎭</div>`
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
    if (!path) { statusEl.textContent = '⚠️ Pilih file model.'; return }
    const name = document.getElementById('char-name').value.trim() || path.split('/').pop() || 'Karakter'
    const id = Date.now().toString(36)
    settings.characters.push({ id, name, path, format: ext, image: pendingImage || '', active: false })
    saveSettings(settings)
    pendingImage = null
    openFormatDetail(ext) // refresh detail (galeri + reset form)
    statusEl.textContent = 'Karakter disimpan.'
  })

  document.getElementById('char-gallery').addEventListener('click', (e) => {
    const btn = e.target.closest('.mini-btn')
    if (!btn) return
    const id = btn.dataset.id
    const action = btn.dataset.action
    if (action === 'use') {
      settings.characters.forEach((c) => { c.active = c.id === id })
      saveSettings(settings)
      renderActiveChar()
      openFormatDetail(ext)
    } else if (action === 'delete') {
      settings.characters = settings.characters.filter((c) => c.id !== id)
      saveSettings(settings)
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
      : `<div class="char-thumb placeholder">🎭</div>`
    return `<div class="char-card ${active}" data-id="${c.id}">
      ${thumb}
      <div class="char-card-name">${escapeHtml(c.name)}</div>
      <div class="char-card-actions">
        <button class="mini-btn use" data-action="use" data-id="${c.id}">Gunakan</button>
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

// --- Suara (TTS & STT) ---
const ttsEnabled = document.getElementById('tts-enabled')
const ttsVoice = document.getElementById('tts-voice')
const sttModel = document.getElementById('stt-model')
const sttLanguage = document.getElementById('stt-language')

function loadVoiceUI() {
  ttsEnabled.checked = settings.tts.enabled
  ttsVoice.value = settings.tts.voice
  sttModel.value = settings.stt.model
  sttLanguage.value = settings.stt.language
}

function saveVoiceUI() {
  settings.tts.enabled = ttsEnabled.checked
  settings.tts.voice = ttsVoice.value
  settings.stt.model = sttModel.value
  settings.stt.language = sttLanguage.value
  saveSettings(settings)
}

;['tts-enabled', 'tts-voice', 'stt-model', 'stt-language'].forEach((id) => {
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
  if (key.length <= 6) return '••••'
  return key.slice(0, 4) + '••••' + key.slice(-4)
}

function renderLlmList() {
  const providers = settings.llm.providers || []
  if (providers.length === 0) {
    llmList.innerHTML = '<p class="hint">Belum ada provider.</p>'
    return
  }
  llmList.innerHTML = providers
    .map((p) => {
      return `<div class="llm-item">
        <div class="llm-item-main">
          <strong>${escapeHtml(p.name)}</strong>
          <span class="muted">${escapeHtml(p.model || '')}</span>
        </div>
        <div class="llm-item-sub">${escapeHtml(p.baseUrl || '')} · ${maskKey(p.apiKey)}</div>
      </div>`
    })
    .join('')
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

llmAddBtn.addEventListener('click', () => {
  const name = llmName.value.trim()
  if (!name) {
    statusEl.textContent = '⚠️ Isi nama provider.'
    return
  }
  settings.llm.providers.push({
    name,
    baseUrl: llmBaseUrl.value.trim(),
    apiKey: llmApiKey.value.trim(),
    model: llmModel.value.trim()
  })
  saveSettings(settings)
  renderLlmList()
  llmName.value = ''
  llmBaseUrl.value = ''
  llmApiKey.value = ''
  llmModel.value = ''
  statusEl.textContent = 'Provider disimpan (lokal).'
})

// --- LLM via RPC (model aktif + switch) ---
const llmActiveEl = document.getElementById('llm-active')
const llmRefreshBtn = document.getElementById('llm-refresh-btn')
const llmSwitchModel = document.getElementById('llm-switch-model')
const llmSwitchBtn = document.getElementById('llm-switch-btn')

async function refreshLlmActive() {
  try {
    const res = await window.hermesAvatar.rpc('config.get', { key: 'provider' })
    if (!res.ok) throw new Error(res.error)
    const r = res.result
    llmActiveEl.innerHTML = `
      <div class="llm-item">
        <div class="llm-item-main"><strong>${escapeHtml(r.model || '—')}</strong></div>
        <div class="llm-item-sub">provider: ${escapeHtml(r.provider || '—')}</div>
      </div>`
  } catch (err) {
    llmActiveEl.innerHTML = `<p class="hint">Tidak dapat memuat (${escapeHtml(err?.message || err)})</p>`
  }
}

llmRefreshBtn.addEventListener('click', refreshLlmActive)

llmSwitchBtn.addEventListener('click', async () => {
  const value = llmSwitchModel.value.trim()
  if (!value) {
    statusEl.textContent = '⚠️ Isi model (format: custom:nama-model).'
    return
  }
  llmSwitchBtn.disabled = true
  try {
    const res = await window.hermesAvatar.rpc('config.set', { key: 'model', value })
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
}

init()
