/**
 * settings.js — entry untuk settings.html (home pertama saat app dibuka).
 * Layout ala macOS System Settings: sidebar kiri + panel konten kanan.
 */

import { loadSettings, saveSettings } from './settings-store.js'
import { renderIcon } from './icons.js'
import { escapeHtml } from './utils.js'
import { showToast } from './toast.js'
export { showToast }
import { initAnimationsPanel, renderAnimationSettings } from './settings-animations.js'
import { renderShortcuts } from './settings-shortcuts.js'
import { initAppsPanel, adaptPlatformCommands, detectPlatform } from './settings-apps.js'
import { initMusicPanel } from './settings-music.js'

const startBtn = document.getElementById('start-btn')
const statusEl = document.getElementById('status')
const routerCheck = document.getElementById('router-check')
const hermesStatus = document.getElementById('hermes-status')

let settings = loadSettings()

// --- Info format (lengkap: deskripsi, kemampuan, kelebihan, kekurangan) ---
const FORMAT_INFO = [
  {
    ext: 'vrm', label: 'VRM', title: 'VRM Anime 3D', icon: 'user-round', theme: 'vrm',
    desc: 'Standar avatar anime humanoid 3D (VRoid / three-vrm)',
    full: 'Format VRM dirancang khusus untuk avatar humanoid. Mendukung blendshape ekspresi wajah, bone rig standar, dan spring bone (rambut/rok bergerak).',
    features: ['Ekspresi wajah (blink, happy, sad, angry)', 'Lip sync blendshape (aa/ih/ou/ee/oh)', 'Bone rig humanoid standar', 'Spring bone (rambut/rok)'],
    pros: 'Ekspresi & lip sync paling lengkap',
    cons: 'Butuh model VRM (banyak yang berlisensi)'
  },
  {
    ext: 'glb', label: 'GLB / glTF', title: 'GLB / glTF 3D', icon: 'package', theme: 'glb',
    desc: 'Format 3D modern, cepat dimuat & sangat ringan (WebGL)',
    full: 'glTF/GLB adalah format 3D standar web. Ringan, cepat dimuat, didukung luas. Bisa berisi bone & morph, tapi ekspresi wajah tergantung modelnya.',
    features: ['Ringan & cepat dimuat', 'Didukung luas (three.js native)', 'Bone rig + morph target', 'Cocok untuk low-poly'],
    pros: 'Paling ringan & cepat',
    cons: 'Ekspresi wajah tergantung model'
  },
  {
    ext: 'pmx', label: 'PMX / PMD', title: 'MMD (PMX / PMD)', icon: 'activity', theme: 'pmx',
    desc: 'Model anime MikuMikuDance dengan physics & motion .vmd',
    full: 'PMX/PMD adalah format MMD (MikuMikuDance). Punya morph ekspresi (あいうえお untuk lip sync) & physics. Texture sering .tga dan butuh folder utuh.',
    features: ['Morph ekspresi & lip sync (あいうえお)', 'Physics rambut/rok (MMD.js)', 'Banyak model gratis', 'Motion .vmd'],
    pros: 'Banyak model gratis + morph ekspresi',
    cons: 'Texture .tga, butuh folder utuh'
  },
  {
    ext: 'fbx', label: 'FBX', title: 'FBX 3D Rigged', icon: 'folder', theme: 'fbx',
    desc: 'Format aset 3D industri umum dari Blender atau Maya',
    full: 'FBX adalah format pertukaran 3D yang luas dipakai. Punya bone rig + animasi, tapi umumnya TANPA blendshape wajah, sehingga ekspresi & lip sync minim.',
    features: ['Bone rig + animasi', 'Umum & banyak aset', 'Ekspor dari Blender/Maya'],
    pros: 'Sangat umum, banyak rig',
    cons: 'Tanpa blendshape → ekspresi/lip sync minim'
  },
  {
    ext: 'model3.json', label: 'Live2D', title: 'Live2D Cubism 4', icon: 'sparkles', theme: 'live2d',
    desc: 'Avatar 2D interaktif hidup dengan physics & sentuhan dinamis',
    full: 'Format Live2D Cubism 4 (.model3.json). Mendukung ekspresi kaya, physics dinamis (rambut, pakaian), motion reaksi sentuhan, dan lip sync halus.',
    features: ['Ekspresi wajah & emosi kaya', 'Physics dinamis (rambut & baju)', 'Reaksi sentuhan & motion', 'Lip sync ParamMouthOpenY'],
    pros: 'Visual anime 2D hidup & ekspresif',
    cons: 'Membutuhkan file Cubism 4 lengkap (.moc3, textures, json)'
  }
]

// --- Definisi sidebar (terpusat; icon = nama Lucide outline + color badge macOS) ---
const SECTIONS = [
  { id: 'home', icon: 'house', label: 'Home', color: 'blue' },
  { id: 'package', icon: 'package', label: 'Package Hub', color: 'orange' },
  { id: 'character', icon: 'user-round', label: 'Karakter & Model', color: 'green' },
  { id: 'animation', icon: 'film', label: 'Animasi & Emote', color: 'purple' },
  { id: 'voice', icon: 'mic', label: 'Suara & TTS', color: 'red' },
  { id: 'llm', icon: 'brain', label: 'LLM & Provider', color: 'indigo' },
  { id: 'skill', icon: 'puzzle', label: 'Skill & Ekstensi', color: 'teal' },
  { id: 'action', icon: 'terminal', label: 'Perintah & App', color: 'slate' },
  { id: 'shortcut', icon: 'keyboard', label: 'Shortcut Global', color: 'amber' }
]

// --- Navigasi sidebar & history ala macOS ---
const nav = document.getElementById('nav')
const panels = document.querySelectorAll('.panel')
let navHistory = ['home']
let navHistoryIndex = 0

function updateNavHistoryUI() {
  const backBtn = document.getElementById('nav-back-btn')
  const fwdBtn = document.getElementById('nav-forward-btn')
  if (backBtn) backBtn.disabled = navHistoryIndex <= 0
  if (fwdBtn) fwdBtn.disabled = navHistoryIndex >= navHistory.length - 1
}

function renderNav() {
  nav.innerHTML = SECTIONS.map((s, i) => {
    const active = i === 0 ? 'active' : ''
    return `<button class="nav-item ${active}" data-section="${s.id}">
      <span class="nav-icon-badge badge-${s.color}">
        <span class="nav-icon">${renderIcon(s.icon, { size: 14 })}</span>
      </span>
      <span class="nav-label">${escapeHtml(s.label)}</span>
      <span class="nav-chevron">›</span>
    </button>`
  }).join('')

  nav.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      navigateToSection(item.dataset.section)
    })
  })
}

function navigateToSection(sectionId, pushHistory = true) {
  const sec = SECTIONS.find((s) => s.id === sectionId) || SECTIONS[0]

  if (pushHistory) {
    if (navHistory[navHistoryIndex] !== sectionId) {
      navHistory = navHistory.slice(0, navHistoryIndex + 1)
      navHistory.push(sectionId)
      navHistoryIndex = navHistory.length - 1
    }
  }
  updateNavHistoryUI()

  nav.querySelectorAll('.nav-item').forEach((n) => {
    n.classList.toggle('active', n.dataset.section === sectionId)
  })
  panels.forEach((p) => p.classList.remove('active'))
  document.getElementById(`panel-${sectionId}`)?.classList.add('active')

  const titleEl = document.getElementById('current-section-title')
  if (titleEl) {
    titleEl.textContent = sec.label
  }

  if (sectionId === 'package') {
    loadDetectedPathsOnce(false)
  }
}

// Kontrol Window ala macOS (traffic lights: close, minimize, maximize)
function initWindowControls() {
  document.getElementById('btn-win-close')?.addEventListener('click', () => {
    window.hermesAvatar?.windowClose?.()
  })

  document.getElementById('btn-win-minimize')?.addEventListener('click', () => {
    window.hermesAvatar?.windowMinimize?.()
  })

  document.getElementById('btn-win-maximize')?.addEventListener('click', () => {
    window.hermesAvatar?.windowMaximize?.()
  })
}

// Navigasi History (< dan > di Header macOS)
function initHistoryControls() {
  document.getElementById('nav-back-btn')?.addEventListener('click', () => {
    if (navHistoryIndex > 0) {
      navHistoryIndex--
      navigateToSection(navHistory[navHistoryIndex], false)
    }
  })

  document.getElementById('nav-forward-btn')?.addEventListener('click', () => {
    if (navHistoryIndex < navHistory.length - 1) {
      navHistoryIndex++
      navigateToSection(navHistory[navHistoryIndex], false)
    }
  })
}

// Filter Pencarian di Sidebar
function initSidebarSearch() {
  const searchInput = document.getElementById('sidebar-search-input')
  if (!searchInput) return
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim()
    nav.querySelectorAll('.nav-item').forEach((item) => {
      const text = item.textContent.toLowerCase()
      if (!query || text.includes(query)) {
        item.style.display = 'flex'
      } else {
        item.style.display = 'none'
      }
    })
  })
}

// Switcher Mode Hitam / Putih (Dark & Light Mode)
const THEME_KEY = 'hermes-settings-theme'

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem(THEME_KEY, theme)

  const iconEl = document.getElementById('theme-icon')
  const textEl = document.getElementById('theme-text')
  if (theme === 'light') {
    if (iconEl) iconEl.textContent = '☀️'
    if (textEl) textEl.textContent = 'Mode Terang'
  } else {
    if (iconEl) iconEl.textContent = '🌙'
    if (textEl) textEl.textContent = 'Mode Gelap'
  }
}

function initThemeSwitcher() {
  const saved = localStorage.getItem(THEME_KEY) || 'dark'
  applyTheme(saved)

  const toggleBtn = document.getElementById('theme-toggle-btn')
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark'
      const next = current === 'dark' ? 'light' : 'dark'
      applyTheme(next)
    })
  }
}

// --- Status service & Package Hub & Home Prerequisites ---
const homeSetupAlert = document.getElementById('home-setup-alert')
const alertOpenPkgBtn = document.getElementById('alert-open-pkg-btn')
const homePrereqBadge = document.getElementById('home-prereq-badge')
const homeStartHermesBtn = document.getElementById('home-start-hermes-btn')
const homeCharDesc = document.getElementById('home-char-desc')
const homeTtsStatus = document.getElementById('home-tts-status')
const homeTtsDesc = document.getElementById('home-tts-desc')

const prereqModal = document.getElementById('prerequisite-modal')
const prereqModalList = document.getElementById('prereq-modal-list')
const prereqCancelBtn = document.getElementById('prereq-cancel-btn')
const prereqHubBtn = document.getElementById('prereq-hub-btn')
const prereqAutoBtn = document.getElementById('prereq-auto-btn')
const prereqForceBtn = document.getElementById('prereq-force-btn')
const prereqLlmBtn = document.getElementById('prereq-llm-btn')

const pkgStatusHermes = document.getElementById('pkg-status-hermes')
const pkgStatusRouter = document.getElementById('pkg-status-router')
const pkgStatusKokoro = document.getElementById('pkg-status-kokoro')
const pkgStatusPython = document.getElementById('pkg-status-python')
const pkgPythonVersion = document.getElementById('pkg-python-version')
const packageOverallStatus = document.getElementById('package-overall-status')
const pkgStartKokoroBtn = document.getElementById('pkg-start-kokoro-btn')
const pkgInstallKokoroBtn = document.getElementById('pkg-install-kokoro-btn')
const pkgOpenFolderBtn = document.getElementById('pkg-open-folder-btn')
const pkgCleanBtn = document.getElementById('pkg-clean-btn')
const pkgUninstallPipBtn = document.getElementById('pkg-uninstall-pip-btn')
const pkgKokoroPipStatus = document.getElementById('pkg-kokoro-pip-status')
const pkgKokoroModelStatus = document.getElementById('pkg-kokoro-model-status')
const pkgKokoroLocation = document.getElementById('pkg-kokoro-location')
const pkgKokoroLog = document.getElementById('pkg-kokoro-log')

const pkgStatusCompanion = document.getElementById('pkg-status-companion')
const pkgBridgeStatusText = document.getElementById('pkg-bridge-status-text')
const pkgOpenExtensionFolderBtn = document.getElementById('pkg-open-extension-folder-btn')
const pkgTestBridgeBtn = document.getElementById('pkg-test-bridge-btn')
const pkgBridgeLog = document.getElementById('pkg-bridge-log')

// Smart Path Discovery Elements
const pkgDrivesInfo = document.getElementById('pkg-drives-info')
const pkgHermesLocation = document.getElementById('pkg-hermes-location')
const pkgHermesSourceBadge = document.getElementById('pkg-hermes-source-badge')
const pkgHermesBrowseBtn = document.getElementById('pkg-hermes-browse-btn')
const pkgHermesResetBtn = document.getElementById('pkg-hermes-reset-btn')

const pkgRouterLocation = document.getElementById('pkg-router-location')
const pkgRouterSourceBadge = document.getElementById('pkg-router-source-badge')
const pkgRouterBrowseBtn = document.getElementById('pkg-router-browse-btn')
const pkgRouterStartBtn = document.getElementById('pkg-router-start-btn')
const pkgRouterResetBtn = document.getElementById('pkg-router-reset-btn')

const pkgKokoroSourceBadge = document.getElementById('pkg-kokoro-source-badge')
const pkgKokoroBrowseBtn = document.getElementById('pkg-kokoro-browse-btn')
const pkgKokoroResetBtn = document.getElementById('pkg-kokoro-reset-btn')

const pkgPythonLocation = document.getElementById('pkg-python-location')
const pkgPythonSourceBadge = document.getElementById('pkg-python-source-badge')
const pkgPythonBrowseBtn = document.getElementById('pkg-python-browse-btn')
const pkgPythonResetBtn = document.getElementById('pkg-python-reset-btn')

// Toast dikelola oleh modul terpisah toast.js

// Dialog konfirmasi tema macOS / Dark
function confirmDialog(title, message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal')
    const titleEl = document.getElementById('confirm-title')
    const msgEl = document.getElementById('confirm-message')
    const cancelBtn = document.getElementById('confirm-cancel')
    const okBtn = document.getElementById('confirm-ok')

    if (!modal) {
      resolve(window.confirm(`${title}\n\n${message}`))
      return
    }

    if (titleEl) titleEl.textContent = title
    if (msgEl) msgEl.textContent = message
    modal.hidden = false

    const cleanup = () => {
      modal.hidden = true
      cancelBtn?.removeEventListener('click', onCancel)
      okBtn?.removeEventListener('click', onOk)
    }

    const onCancel = () => {
      cleanup()
      resolve(false)
    }
    const onOk = () => {
      cleanup()
      resolve(true)
    }

    cancelBtn?.addEventListener('click', onCancel)
    okBtn?.addEventListener('click', onOk)
  })
}

alertOpenPkgBtn?.addEventListener('click', () => {
  navigateToSection('package')
})

// Handler tombol Nyalakan Hermes di kartu Prasyarat Home
homeStartHermesBtn?.addEventListener('click', async () => {
  homeStartHermesBtn.disabled = true
  homeStartHermesBtn.textContent = 'Menyalakan…'
  showToast('Menyalakan Hermes AI...', 'Memulai daemon hermes serve di port 9119', 'running', '⚡')
  try {
    const res = await window.hermesAvatar.startHermesServer()
    if (res?.ok || res?.already) {
      showToast('Hermes Aktif! ✅', 'Daemon AI siap di port 9119', 'success', '⚡')
    } else {
      showToast('Gagal Menyalakan Hermes', res?.error || 'Pastikan Hermes CLI sudah terpasang', 'error', '❌')
    }
    await refreshServiceStatus()
  } catch (err) {
    showToast('Gagal Menyalakan Hermes', err?.message || err, 'error', '❌')
  } finally {
    homeStartHermesBtn.disabled = false
    homeStartHermesBtn.textContent = 'Nyalakan ⚡'
  }
})

// Prerequisite Modal Actions
prereqCancelBtn?.addEventListener('click', () => {
  if (prereqModal) prereqModal.hidden = true
})

prereqHubBtn?.addEventListener('click', () => {
  if (prereqModal) prereqModal.hidden = true
  navigateToSection('package')
})

prereqLlmBtn?.addEventListener('click', () => {
  if (prereqModal) prereqModal.hidden = true
  navigateToSection('llm')
})

// Cache status model LLM aktif
let cachedLlmModelInfo = { ok: false, model: null, provider: null }

async function checkActiveLlmModel() {
  try {
    if (window.hermesAvatar?.getCurrentModel) {
      const res = await window.hermesAvatar.getCurrentModel()
      if (res && res.ok && res.model) {
        cachedLlmModelInfo = { ok: true, model: res.model, provider: res.provider || 'default' }
        return cachedLlmModelInfo
      }
    }
    // Fallback RPC config.get
    const res = await window.hermesAvatar.rpc('config.get', { key: 'provider' })
    if (res && res.ok && res.result) {
      const model = (res.result.model || '').trim()
      const provider = (res.result.provider || '').trim()
      if (model && model !== '—' && model !== 'none' && model !== 'Tidak ada model') {
        cachedLlmModelInfo = { ok: true, model, provider: provider || 'default' }
        return cachedLlmModelInfo
      }
    }
  } catch (err) {
    console.warn('[checkActiveLlmModel] check error:', err)
  }
  cachedLlmModelInfo = { ok: false, model: null, provider: null }
  return cachedLlmModelInfo
}

prereqAutoBtn?.addEventListener('click', async () => {
  prereqAutoBtn.disabled = true
  prereqAutoBtn.textContent = '⏳ Menyiapkan…'
  showToast('Menyiapkan Layanan Otomatis...', 'Menjalankan Hermes & Kokoro...', 'running', '⚡')
  try {
    await window.hermesAvatar.startHermesServer()
    await window.hermesAvatar.startKokoroServer()
    await new Promise(r => setTimeout(r, 1800))
    await refreshServiceStatus()

    const active = (settings.characters || []).find((c) => c.active)
    const s = await window.hermesAvatar.getServiceStatus()
    const llmInfo = await checkActiveLlmModel()

    if (s.hermes && active && llmInfo.ok) {
      if (prereqModal) prereqModal.hidden = true
      showToast('Prasyarat Siap! 🚀', 'Memulai avatar ke desktop...', 'success', '✨')
      await launchAvatarDirect(active.path)
    } else {
      if (!llmInfo.ok) {
        showToast('Model LLM Belum Dipilih 🤖', 'Harap klik "Pilih Model LLM 🤖" untuk memilih model AI sebelum memulai.', 'error', '⚠️', 6000)
      } else {
        showToast('Layanan Masih Perlu Penyiapan', 'Buka menu Package Hub untuk instalasi paket', 'info', 'ℹ️')
      }
      renderPrereqModalItems(s, active, llmInfo)
    }
  } catch (err) {
    showToast('Gagal Menyiapkan', err.message, 'error', '❌')
  } finally {
    prereqAutoBtn.disabled = false
    prereqAutoBtn.textContent = '⚡ Nyalakan Otomatis'
  }
})

prereqForceBtn?.addEventListener('click', async () => {
  if (prereqModal) prereqModal.hidden = true
  const active = (settings.characters || []).find((c) => c.active)
  if (active) {
    showToast('Memulai Mode Tampilan Saja 🎮', 'Avatar tampil di desktop tanpa koneksi AI', 'info', '🎮')
    await launchAvatarDirect(active.path)
  }
})

function renderPrereqModalItems(s, active, llmInfo = null) {
  if (!prereqModalList) return
  const currentLlm = llmInfo || cachedLlmModelInfo || { ok: false }
  const isCharOk = !!active
  const isHermesOk = !!s.hermes
  const isLlmOk = !!currentLlm.ok
  const isRouterOk = !!s.router
  const isTtsOk = !!(s.kokoro || settings.tts?.provider === 'edge')

  prereqModalList.innerHTML = `
    <div class="prereq-card">
      <div class="prereq-card-left">
        <span class="prereq-card-icon">🎭</span>
        <div class="prereq-card-texts">
          <span class="prereq-card-title">Model Karakter Visual</span>
          <span class="prereq-card-desc">${isCharOk ? escapeHtml(active.name) : 'Belum ada model aktif terpilih'}</span>
        </div>
      </div>
      <span class="prereq-pill ${isCharOk ? 'ready' : 'missing'}">${isCharOk ? 'Siap ✅' : 'Belum Dipilih ❌'}</span>
    </div>

    <div class="prereq-card">
      <div class="prereq-card-left">
        <span class="prereq-card-icon">🧠</span>
        <div class="prereq-card-texts">
          <span class="prereq-card-title">Otak AI Hermes (Port 9119)</span>
          <span class="prereq-card-desc">Layanan utama berpikir, memori & tools</span>
        </div>
      </div>
      <span class="prereq-pill ${isHermesOk ? 'ready' : 'missing'}">${isHermesOk ? 'Aktif ✅' : 'Belum Aktif ⚠️'}</span>
    </div>

    <div class="prereq-card">
      <div class="prereq-card-left">
        <span class="prereq-card-icon">🤖</span>
        <div class="prereq-card-texts">
          <span class="prereq-card-title">Model AI / LLM (Otak Percakapan)</span>
          <span class="prereq-card-desc">${isLlmOk ? `${escapeHtml(currentLlm.model)} ${currentLlm.provider ? `(${escapeHtml(currentLlm.provider)})` : ''}` : 'Belum ada model AI dipilih! Wajib diatur agar avatar bisa menjawab.'}</span>
        </div>
      </div>
      <span class="prereq-pill ${isLlmOk ? 'ready' : 'missing'}">${isLlmOk ? 'Siap ✅' : 'Belum Dipilih ❌'}</span>
    </div>

    <div class="prereq-card">
      <div class="prereq-card-left">
        <span class="prereq-card-icon">🌐</span>
        <div class="prereq-card-texts">
          <span class="prereq-card-title">Proxy Model 9Router (Port 20128)</span>
          <span class="prereq-card-desc">Proxy LLM multi-model lokal</span>
        </div>
      </div>
      <span class="prereq-pill ${isRouterOk ? 'ready' : 'warning'}">${isRouterOk ? 'Aktif ✅' : 'Offline (Opsional)'}</span>
    </div>

    <div class="prereq-card">
      <div class="prereq-card-left">
        <span class="prereq-card-icon">🔊</span>
        <div class="prereq-card-texts">
          <span class="prereq-card-title">Mesin Suara Avatar (TTS)</span>
          <span class="prereq-card-desc">${settings.tts?.provider === 'kokoro' ? 'Kokoro-TTS Lokal (:8880)' : 'Edge-TTS Cloud Online'}</span>
        </div>
      </div>
      <span class="prereq-pill ${isTtsOk ? 'ready' : 'warning'}">${isTtsOk ? 'Siap ✅' : 'Belum Siap ⚠️'}</span>
    </div>
  `
}

function showPrerequisitesModal(s, active = null, llmInfo = null) {
  const currentActive = active || (settings.characters || []).find((c) => c.active)
  renderPrereqModalItems(s, currentActive, llmInfo)
  if (prereqModal) prereqModal.hidden = false
}

// Status service (9Router, Hermes, Kokoro, Bridge) — murni cek port via TCP non-blocking (<0.1ms, 0% CPU)
async function refreshServiceStatus() {
  try {
    const s = await window.hermesAvatar.getServiceStatus()
    setBadge(hermesStatus, s.hermes, 'Aktif', 'Mati')

    if (pkgStatusHermes) setBadge(pkgStatusHermes, s.hermes, 'Aktif (Port 9119)', 'Belum Aktif')
    if (pkgStatusRouter) setBadge(pkgStatusRouter, s.router, 'Aktif (Port 20128)', 'Belum Aktif')
    if (pkgStatusKokoro) setBadge(pkgStatusKokoro, s.kokoro, 'Aktif (Port 8880)', 'Belum Aktif')
    if (pkgStatusCompanion) setBadge(pkgStatusCompanion, s.companion, 'Bridge Aktif (Port 9124)', 'Siap Digunakan')

    if (pkgBridgeStatusText) {
      pkgBridgeStatusText.textContent = s.companion ? 'Aktif di 127.0.0.1:9124 ✅' : 'Port 9124 (Menunggu Permintaan)'
      pkgBridgeStatusText.style.color = s.companion ? '#7ee787' : '#8b949e'
    }

    // Periksa status model LLM jika belum diketahui
    let llmInfo = cachedLlmModelInfo
    if (!llmInfo.model) {
      llmInfo = await checkActiveLlmModel()
    }

    // Update Kartu Prasyarat di Home (5 item lengkap)
    const active = (settings.characters || []).find((c) => c.active)
    const isCharOk = !!active
    const isHermesOk = !!s.hermes
    const isLlmOk = !!llmInfo.ok
    const isRouterOk = !!s.router
    const isTtsOk = !!(s.kokoro || settings.tts?.provider === 'edge')

    let readyCount = 0
    if (isCharOk) readyCount++
    if (isHermesOk) readyCount++
    if (isLlmOk) readyCount++
    if (isRouterOk) readyCount++
    if (isTtsOk) readyCount++

    if (homePrereqBadge) {
      if (readyCount === 5) {
        homePrereqBadge.textContent = '5/5 Siap Memulai ✅'
        homePrereqBadge.className = 'badge ready'
      } else {
        homePrereqBadge.textContent = `${readyCount}/5 Prasyarat Terpenuhi`
        homePrereqBadge.className = 'badge warning'
      }
    }

    if (homeStartHermesBtn) {
      homeStartHermesBtn.style.display = s.hermes ? 'none' : 'inline-block'
    }

    if (homeCharDesc) {
      homeCharDesc.textContent = active ? `${active.name} (${active.format || 'Live2D / 3D'})` : 'Pilih karakter aktif di menu Karakter'
    }

    if (homeTtsStatus) {
      if (settings.tts?.provider === 'kokoro') {
        setBadge(homeTtsStatus, s.kokoro, 'Aktif (Kokoro :8880)', 'Belum Aktif (:8880)')
      } else {
        homeTtsStatus.textContent = 'Aktif (Edge Cloud) ✅'
        homeTtsStatus.className = 'badge ready'
      }
    }

    // Tampilkan alert banner di Home bila ada service inti yang belum jalan
    const allReady = s.hermes && s.router && isTtsOk
    if (homeSetupAlert) {
      homeSetupAlert.classList.toggle('hidden', allReady)
    }

    if (packageOverallStatus) {
      if (allReady) {
        packageOverallStatus.textContent = '✅ Semua Paket Siap Digunakan'
        packageOverallStatus.className = 'overall-badge ready'
      } else {
        packageOverallStatus.textContent = '⚠️ Persiapan Diperlukan (Ada modul belum aktif)'
        packageOverallStatus.className = 'overall-badge attention'
      }
    }
  } catch {
    if (hermesStatus) hermesStatus.textContent = '?'
  }
}

// Pengecekan direktori & binary path — HANYA berjalan 1x saat aplikasi dibuka atau diminta tombol manual
let pathDiscoveryLoaded = false

async function loadDetectedPathsOnce(force = false) {
  if (pathDiscoveryLoaded && !force) return
  if (typeof window.hermesAvatar?.getDetectedPaths !== 'function') return

  try {
    let dp = null
    if (force && typeof window.hermesAvatar?.rescanPaths === 'function') {
      const res = await window.hermesAvatar.rescanPaths()
      dp = res?.all || res
    } else {
      dp = await window.hermesAvatar.getDetectedPaths()
    }
    if (!dp) return

    // 1. Info Logical Drives yang dipindai (C:, D:, dll)
    if (pkgDrivesInfo && dp.drives) {
      pkgDrivesInfo.textContent = `Drive: ${dp.drives.map((d) => d + ':').join(', ')}`
    }

    // 2. Python Status & Path
    if (pkgStatusPython) {
      setBadge(pkgStatusPython, dp.python?.ok, 'Terpasang', 'Belum Terpasang')
    }
    if (pkgPythonVersion) {
      pkgPythonVersion.textContent = dp.python?.ok
        ? `Versi: ${dp.python.version}`
        : 'Python 3.10+ belum terpasang di C: atau D:'
    }
    if (pkgPythonLocation) {
      pkgPythonLocation.textContent = dp.python?.ok
        ? dp.python.cmd
        : 'Belum terpasang di C: atau D:. Silakan pasang Python 3.10+'
    }
    if (pkgPythonSourceBadge) {
      pkgPythonSourceBadge.textContent = dp.python?.ok
        ? (dp.python.source || 'Terdeteksi')
        : 'Belum Terpasang ❌'
      pkgPythonSourceBadge.className = `badge ${dp.python?.ok ? (dp.python.isCustom ? 'info' : 'ready') : 'warning'}`
    }
    if (pkgPythonResetBtn) {
      pkgPythonResetBtn.style.display = dp.python?.isCustom ? 'inline-block' : 'none'
    }

    // 3. Hermes Status & Path
    if (pkgHermesLocation) {
      pkgHermesLocation.textContent = dp.hermes?.ok
        ? dp.hermes.cmd
        : 'Belum terpasang di C: atau D:. Silakan pasang Hermes via terminal di bawah.'
    }
    if (pkgHermesSourceBadge) {
      pkgHermesSourceBadge.textContent = dp.hermes?.ok
        ? (dp.hermes.source || 'Terdeteksi')
        : 'Belum Terpasang ❌'
      pkgHermesSourceBadge.className = `badge ${dp.hermes?.ok ? (dp.hermes.isCustom ? 'info' : 'ready') : 'warning'}`
    }
    if (pkgHermesResetBtn) {
      pkgHermesResetBtn.style.display = dp.hermes?.isCustom ? 'inline-block' : 'none'
    }

    // 4. 9Router Status & Path
    if (pkgRouterLocation) {
      pkgRouterLocation.textContent = dp.router?.ok
        ? dp.router.cmd
        : 'Belum terpasang di C: atau D:. Jalankan: npm i -g 9router'
    }
    if (pkgRouterSourceBadge) {
      pkgRouterSourceBadge.textContent = dp.router?.ok
        ? (dp.router.source || 'Terdeteksi')
        : 'Belum Terpasang ❌'
      pkgRouterSourceBadge.className = `badge ${dp.router?.ok ? (dp.router.isCustom ? 'info' : 'ready') : 'warning'}`
    }
    if (pkgRouterStartBtn) {
      pkgRouterStartBtn.style.display = dp.router?.ok ? 'inline-block' : 'none'
    }
    if (pkgRouterResetBtn) {
      pkgRouterResetBtn.style.display = dp.router?.isCustom ? 'inline-block' : 'none'
    }

    // 5. Kokoro Model & Pip Status
    if (pkgKokoroPipStatus) {
      if (dp.kokoroInstalled) {
        pkgKokoroPipStatus.textContent = 'Terpasang ✅'
        pkgKokoroPipStatus.style.color = '#7ee787'
      } else {
        pkgKokoroPipStatus.textContent = 'Belum Terpasang ❌'
        pkgKokoroPipStatus.style.color = '#ff7b72'
      }
    }
    if (pkgKokoroModelStatus) {
      if (dp.kokoro?.modelReady) {
        pkgKokoroModelStatus.textContent = dp.kokoro.sizeMb ? `Siap di Disk (${dp.kokoro.sizeMb} MB) ✅` : 'Siap di Disk ✅'
        pkgKokoroModelStatus.style.color = '#7ee787'
      } else {
        pkgKokoroModelStatus.textContent = 'Belum Diunduh (Otomatis saat start)'
        pkgKokoroModelStatus.style.color = '#8b949e'
      }
    }
    if (pkgKokoroLocation && dp.kokoro?.dir) {
      pkgKokoroLocation.textContent = dp.kokoro.dir
    }
    if (pkgKokoroSourceBadge) {
      pkgKokoroSourceBadge.textContent = dp.kokoro?.modelReady
        ? (dp.kokoro.source || 'Siap')
        : 'Belum Siap ⚠️'
      pkgKokoroSourceBadge.className = `badge ${dp.kokoro?.modelReady ? (dp.kokoro.isCustom ? 'info' : 'ready') : 'warning'}`
    }
    if (pkgKokoroResetBtn) {
      pkgKokoroResetBtn.style.display = dp.kokoro?.isCustom ? 'inline-block' : 'none'
    }

    pathDiscoveryLoaded = true
  } catch (err) {
    console.warn('[Settings] Gagal memuat status deteksi path:', err)
  }
}

function bindPackageActions() {
  // 1. Accordion Toggle (Buka / Tutup Card)
  document.querySelectorAll('.pkg-header').forEach((header) => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('.badge')) return
      const card = header.closest('.pkg-card')
      if (card) {
        card.classList.toggle('active')
      }
    })
  })

  // 2. Subtab Switcher: Download & Install vs Kelola Service
  document.querySelectorAll('.pkg-tab-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const card = btn.closest('.pkg-card')
      if (!card) return
      const targetTab = btn.dataset.tab

      card.querySelectorAll('.pkg-tab-btn').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')

      card.querySelectorAll('.pkg-tab-panel').forEach((panel) => {
        if (panel.dataset.panel === targetTab) {
          panel.classList.add('active')
        } else {
          panel.classList.remove('active')
        }
      })
    })
  })

  // 3. Tombol Eksekusi Langsung di Terminal PowerShell
  document.querySelectorAll('[data-terminal-cmd]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const cmd = btn.dataset.terminalAction || btn.dataset.terminalCmd
      if (!cmd) return

      const actionTitle = btn.dataset.actionTitle || 'Membuka Terminal PowerShell...'
      showToast(actionTitle, `Jendela terminal dibuka untuk menjalankan perintah`, 'info', '⚡', 4000)

      try {
        if (typeof window.hermesAvatar?.runInTerminal === 'function') {
          const res = await window.hermesAvatar.runInTerminal(cmd)
          if (!res?.ok) {
            showToast('Gagal Membuka Terminal ❌', res?.error || 'Unknown error', 'error', '❌')
            return
          }
        } else {
          await navigator.clipboard.writeText(cmd)
          showToast('Perintah Tersalin! 📋', 'Tempel di PowerShell: ' + cmd, 'success', '📋')
        }

        // Jika perintah menjalankan server Kokoro, auto-polling sampai port 8880 aktif
        if (cmd.includes('kokoro') || cmd.includes('8880')) {
          let attempts = 0
          const pollTimer = setInterval(async () => {
            attempts++
            const check = await window.hermesAvatar.checkSystemPackages?.()
            if (check?.kokoro?.running) {
              clearInterval(pollTimer)
              refreshServiceStatus()
              showToast('Server Kokoro Terdeteksi Aktif! 🟢', 'Port 8880 berhasil terhubung dari terminal', 'success', '🎉', 4500)
            } else if (attempts >= 10) {
              clearInterval(pollTimer)
              refreshServiceStatus()
            }
          }, 1500)
        }
      } catch (err) {
        showToast('Error Eksekusi Terminal', err.message, 'error', '❌')
      }
    })
  })

  // 4. Bind tombol salin perintah terminal (copy to clipboard)
  document.querySelectorAll('.copy-cmd-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const cmd = btn.dataset.copy
      if (!cmd) return
      try {
        await navigator.clipboard.writeText(cmd)
        showToast('Perintah Tersalin! 📋', cmd, 'success', '✅')
        const origText = btn.textContent
        btn.textContent = 'Tersalin! ✅'
        btn.classList.add('primary')
        setTimeout(() => {
          btn.textContent = origText
          btn.classList.remove('primary')
        }, 1800)
      } catch {
        btn.textContent = 'Gagal salin'
      }
    })
  })

  // 5. Tombol Periksa & Pindai Ulang Seluruh Drive (Hanya berjalan ketika tombol diklik manual)
  document.getElementById('pkg-refresh-all-btn')?.addEventListener('click', async () => {
    showToast('Memindai Drive (C:, D:)...', 'Mencari direktori & binary Hermes, Python, 9Router...', 'info', '🔍', 4000)
    await loadDetectedPathsOnce(true)
    await refreshServiceStatus()
    showToast('Pemeriksaan Selesai! 🎯', 'Status lokasi binary dan prasyarat berhasil diperbarui', 'success', '✅')
  })

  // 5b. Tombol Kontrol Jalur Kustom (Hermes, 9Router, Kokoro, Python)
  pkgHermesBrowseBtn?.addEventListener('click', async () => {
    if (typeof window.hermesAvatar?.browseCustomPath !== 'function') return
    const res = await window.hermesAvatar.browseCustomPath('hermes_bin', 'file')
    if (res?.ok) {
      showToast('Jalur Hermes Diperbarui', res.path, 'success', '📂')
      await loadDetectedPathsOnce(true)
      await refreshServiceStatus()
    }
  })

  pkgHermesResetBtn?.addEventListener('click', async () => {
    await window.hermesAvatar?.setCustomPath?.('hermes_bin', null)
    showToast('Reset Jalur Hermes', 'Mengembalikan ke deteksi otomatis sistem', 'info', '🔄')
    await loadDetectedPathsOnce(true)
    await refreshServiceStatus()
  })

  pkgRouterBrowseBtn?.addEventListener('click', async () => {
    if (typeof window.hermesAvatar?.browseCustomPath !== 'function') return
    const res = await window.hermesAvatar.browseCustomPath('router_bin', 'file')
    if (res?.ok) {
      showToast('Jalur 9Router Diperbarui', res.path, 'success', '📂')
      await loadDetectedPathsOnce(true)
      await refreshServiceStatus()
    }
  })

  pkgRouterResetBtn?.addEventListener('click', async () => {
    await window.hermesAvatar?.setCustomPath?.('router_bin', null)
    showToast('Reset Jalur 9Router', 'Mengembalikan ke deteksi otomatis sistem', 'info', '🔄')
    await loadDetectedPathsOnce(true)
    await refreshServiceStatus()
  })

  pkgRouterStartBtn?.addEventListener('click', async () => {
    pkgRouterStartBtn.disabled = true
    showToast('Menyalakan 9Router...', 'Memulai daemon 9Router di port 20128...', 'running', '⚡', 7000)
    try {
      const res = await window.hermesAvatar?.startRouter?.()
      if (res?.ok) {
        showToast('9Router Aktif! 🟢', 'Port 20128 online dan siap melayani permintaan model', 'success', '⚡', 4500)
      } else {
        showToast('Gagal Menyalakan 9Router', res?.error || 'Port 20128 tidak aktif', 'error', '❌', 6000)
      }
      await refreshServiceStatus()
    } catch (err) {
      showToast('Error 9Router', err.message, 'error', '❌')
    } finally {
      pkgRouterStartBtn.disabled = false
    }
  })

  pkgKokoroBrowseBtn?.addEventListener('click', async () => {
    if (typeof window.hermesAvatar?.browseCustomPath !== 'function') return
    const res = await window.hermesAvatar.browseCustomPath('kokoro_model_dir', 'dir')
    if (res?.ok) {
      showToast('Folder Model Kokoro Diperbarui', res.path, 'success', '📂')
      await loadDetectedPathsOnce(true)
      await refreshServiceStatus()
    }
  })

  pkgKokoroResetBtn?.addEventListener('click', async () => {
    await window.hermesAvatar?.setCustomPath?.('kokoro_model_dir', null)
    showToast('Reset Folder Model Kokoro', 'Mengembalikan ke folder default terpusat', 'info', '🔄')
    await loadDetectedPathsOnce(true)
    await refreshServiceStatus()
  })

  pkgPythonBrowseBtn?.addEventListener('click', async () => {
    if (typeof window.hermesAvatar?.browseCustomPath !== 'function') return
    const res = await window.hermesAvatar.browseCustomPath('python_bin', 'file')
    if (res?.ok) {
      showToast('Jalur Python Diperbarui', res.path, 'success', '📂')
      await loadDetectedPathsOnce(true)
      await refreshServiceStatus()
    }
  })

  pkgPythonResetBtn?.addEventListener('click', async () => {
    await window.hermesAvatar?.setCustomPath?.('python_bin', null)
    showToast('Reset Jalur Python', 'Mengembalikan ke deteksi otomatis sistem', 'info', '🔄')
    await loadDetectedPathsOnce(true)
    await refreshServiceStatus()
  })

  // 6. Kokoro Server Actions
  if (pkgStartKokoroBtn) {
    pkgStartKokoroBtn.addEventListener('click', async () => {
      pkgStartKokoroBtn.disabled = true
      showToast('Menjalankan Server Kokoro...', 'Sedang menginisialisasi server ONNX (port 8880)...', 'running', '🎙️', 9000)
      if (pkgKokoroLog) pkgKokoroLog.innerHTML = '⏳ Memulai server Kokoro (<code>scripts/kokoro_server.py</code>)... Menunggu port 8880 aktif...'
      try {
        const res = await window.hermesAvatar.startKokoroServer()
        // Periksa status aktual secara teliti
        await refreshServiceStatus()
        const check = await window.hermesAvatar.checkSystemPackages?.()
        const isPortActive = !!(check?.kokoro?.running || res?.ok)

        if (res?.ok && isPortActive) {
          if (pkgKokoroLog) pkgKokoroLog.innerHTML = '✅ Server Kokoro berhasil aktif di port <code>8880</code> (<code>http://127.0.0.1:8880</code>).'
          showToast('Server Kokoro Aktif! 🟢', 'Port 8880 berhasil terhubung dan siap digunakan', 'success', '🎙️', 4500)
        } else {
          const errMsg = res?.error || 'Port 8880 belum aktif setelah dimulai. Periksa apakah dependensi python kokoro-onnx sudah terpasang.'
          if (pkgKokoroLog) pkgKokoroLog.innerHTML = `❌ Gagal: ${escapeHtml(errMsg)}.<br>👉 Anda juga dapat menggunakan tombol: <strong>"⚡ Buka Terminal & Jalankan Server"</strong>.`
          showToast('Server Belum Aktif ❌', errMsg, 'error', '❌', 6000)
        }
      } catch (err) {
        if (pkgKokoroLog) pkgKokoroLog.innerHTML = `❌ Error: ${escapeHtml(err.message)}`
        showToast('Error Server', err.message, 'error', '❌')
      } finally {
        pkgStartKokoroBtn.disabled = false
      }
    })
  }

  if (pkgInstallKokoroBtn) {
    pkgInstallKokoroBtn.addEventListener('click', async () => {
      pkgInstallKokoroBtn.disabled = true
      showToast('Memasang Dependensi Kokoro...', 'Menjalankan pip install kokoro-onnx soundfile', 'info', '📦')
      if (pkgKokoroLog) {
        pkgKokoroLog.innerHTML = '⏳ Menjalankan: <code>py -m pip install kokoro-onnx soundfile</code>... (Mohon tunggu 30–60 detik)'
      }
      try {
        const res = await window.hermesAvatar.installKokoroDeps()
        if (res.ok) {
          if (pkgKokoroLog) {
            pkgKokoroLog.innerHTML = '✅ Sukses terpasang! Sekarang Anda bisa klik <strong>"Jalankan Server Kokoro"</strong>.'
          }
          showToast('Dependensi Berhasil Terpasang! ✅', 'kokoro-onnx & soundfile siap', 'success', '🎉')
          await loadDetectedPathsOnce(true)
          refreshServiceStatus()
        } else {
          if (pkgKokoroLog) {
            pkgKokoroLog.innerHTML = `⚠️ Otomatisasi belum berhasil: ${escapeHtml(res.error)}.<br>👉 Silakan <strong>Salin</strong> perintah terminal di atas dan jalankan di PowerShell.`
          }
          showToast('Instalasi Otomatis Gagal', 'Gunakan opsi terminal PowerShell', 'error', '⚠️')
        }
      } catch (err) {
        if (pkgKokoroLog) {
          pkgKokoroLog.innerHTML = `⚠️ Gagal otomatis: ${escapeHtml(err.message)}.<br>👉 Silakan <strong>Salin</strong> perintah terminal di atas dan jalankan di PowerShell.`
        }
        showToast('Gagal Instalasi', err.message, 'error', '❌')
      } finally {
        pkgInstallKokoroBtn.disabled = false
      }
    })
  }

  if (pkgOpenFolderBtn) {
    pkgOpenFolderBtn.addEventListener('click', async () => {
      try {
        if (typeof window.hermesAvatar?.openPackageFolder !== 'function') {
          showToast('Perlu Restart Dev', 'Restart terminal npm run dev untuk menerapkan fitur', 'info', '⚠️')
          return
        }
        const res = await window.hermesAvatar.openPackageFolder('kokoro')
        if (res.ok) {
          showToast('Membuka Folder Paket 📁', res.path, 'info', '📂')
          if (pkgKokoroLog) {
            pkgKokoroLog.innerHTML = `📂 Folder paket dibuka: <code>${escapeHtml(res.path)}</code><br><span style="font-size:11px; color:var(--text-secondary);">💡 Model suara (<code>kokoro-v1.0.onnx</code> ~340MB) akan otomatis diunduh ke folder ini saat server pertama kali dijalankan.</span>`
          }
        }
      } catch (err) {
        showToast('Gagal Buka Folder', err.message, 'error', '❌')
      }
    })
  }

  if (pkgCleanBtn) {
    pkgCleanBtn.addEventListener('click', async () => {
      const ok = await confirmDialog(
        'Hapus Model & Cache Kokoro?',
        'Tindakan ini akan menghapus file model ONNX (~300MB) dari ~/.hermes-avatar/packages/kokoro/ untuk menghemat ruang disk. Anda bisa mengunduhnya kembali kapan saja saat server Kokoro dijalankan.'
      )
      if (!ok) return
      pkgCleanBtn.disabled = true
      showToast('Membersihkan Cache...', 'Menghapus model ONNX dari disk', 'info', '🗑️')
      try {
        const res = await window.hermesAvatar.cleanPackage('kokoro')
        if (res.ok) {
          showToast('Cache Berhasil Dibersihkan! 🗑️', 'Ruang disk berhasil dihemat', 'success', '✅')
          if (pkgKokoroLog) pkgKokoroLog.innerHTML = '🗑️ File model dan cache berhasil dibersihkan dari disk.'
          await loadDetectedPathsOnce(true)
          refreshServiceStatus()
        } else {
          showToast('Gagal Bersihkan Cache', res.error, 'error', '❌')
        }
      } catch (err) {
        showToast('Error Bersihkan Cache', err.message, 'error', '❌')
      } finally {
        pkgCleanBtn.disabled = false
      }
    })
  }

  if (pkgUninstallPipBtn) {
    pkgUninstallPipBtn.addEventListener('click', async () => {
      const ok = await confirmDialog(
        'Uninstall Dependensi Pip?',
        'Tindakan ini akan mencopot modul Python "kokoro-onnx" dan "soundfile" dari sistem.'
      )
      if (!ok) return
      pkgUninstallPipBtn.disabled = true
      showToast('Mencopot Dependensi...', 'Menjalankan pip uninstall kokoro-onnx soundfile', 'info', '⚠️')
      try {
        const res = await window.hermesAvatar.uninstallKokoroDeps()
        if (res.ok) {
          showToast('Dependensi Dicopot! ✅', 'Modul python telah dihapus', 'success', '✅')
          if (pkgKokoroLog) pkgKokoroLog.innerHTML = '✅ Modul Python berhasil dicopot.'
          await loadDetectedPathsOnce(true)
          refreshServiceStatus()
        } else {
          showToast('Gagal Uninstall', res.error, 'error', '❌')
        }
      } catch (err) {
        showToast('Error Uninstall', err.message, 'error', '❌')
      } finally {
        pkgUninstallPipBtn.disabled = false
      }
    })
  }

  // 7. Hermes Web Companion (Ekstensi Chrome/Edge)
  if (pkgOpenExtensionFolderBtn) {
    pkgOpenExtensionFolderBtn.addEventListener('click', async () => {
      try {
        const res = await window.hermesAvatar.openPackageFolder('chrome-extension')
        if (res.ok) {
          showToast('Membuka Folder Ekstensi 📂', res.path, 'info', '📂')
          if (pkgBridgeLog) {
            pkgBridgeLog.innerHTML = `📂 Folder ekstensi dibuka: <code>${escapeHtml(res.path)}</code><br>👉 Di Chrome/Edge, klik <strong>"Load unpacked"</strong> lalu pilih folder <strong>chrome</strong> ini.`
          }
        } else {
          showToast('Gagal Buka Folder', res.error, 'error', '❌')
        }
      } catch (err) {
        showToast('Error', err.message, 'error', '❌')
      }
    })
  }

  const pkgCopyExtensionPathBtn = document.getElementById('pkg-copy-extension-path-btn')
  if (pkgCopyExtensionPathBtn) {
    pkgCopyExtensionPathBtn.addEventListener('click', async () => {
      try {
        const res = await window.hermesAvatar.openPackageFolder('chrome-extension')
        if (res.ok && res.path) {
          await navigator.clipboard.writeText(res.path)
          showToast('Path Ekstensi Disalin! 📋', res.path, 'success', '📋')
          if (pkgBridgeLog) {
            pkgBridgeLog.innerHTML = `📋 Path folder ekstensi disalin ke clipboard: <code>${escapeHtml(res.path)}</code><br>💡 Di jendela pemilih file Chrome (macOS), tekan <strong>Cmd + Shift + G</strong> lalu paste!`
          }
        }
      } catch (err) {
        showToast('Gagal Salin Path', err.message, 'error', '❌')
      }
    })
  }

  if (pkgTestBridgeBtn) {
    pkgTestBridgeBtn.addEventListener('click', async () => {
      pkgTestBridgeBtn.disabled = true
      showToast('Menguji Bridge Lokal...', 'Ping http://127.0.0.1:9124/api/ping', 'info', '⚡')
      try {
        const res = await fetch('http://127.0.0.1:9124/api/ping', { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          showToast('Bridge Terhubung Sempurna! ✅', 'Port 9124 siap melayani ekstensi browser', 'success', '🌐')
          if (pkgBridgeLog) {
            pkgBridgeLog.innerHTML = `✅ <strong>Bridge HTTP Online:</strong> ${escapeHtml(data.app)} (v${escapeHtml(data.version)}) pada port <code>9124</code>.`
          }
        } else {
          showToast('Bridge Merespons Kode: ' + res.status, 'Periksa log server', 'error', '⚠️')
        }
      } catch (err) {
        showToast('Bridge Belum Merespons', 'Pastikan aplikasi berjalan', 'error', '❌')
        if (pkgBridgeLog) {
          pkgBridgeLog.innerHTML = `❌ Gagal menghubungi bridge: <code>${escapeHtml(err.message)}</code>`
        }
      } finally {
        pkgTestBridgeBtn.disabled = false
      }
    })
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
    activeCharEl.innerHTML = '<span class="muted" style="font-size:12px;">Pilih di menu Karakter</span>'
    return
  }
  const thumb = active.image
    ? `<img src="${active.image}" alt="" style="width:24px; height:24px; border-radius:50%; object-fit:cover;" />`
    : renderIcon('user-round', { size: 14 })
  activeCharEl.innerHTML = `
    <div class="active-char-pill" style="display:inline-flex; align-items:center; gap:8px; padding:4px 10px; border-radius:14px; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.28);">
      ${thumb}
      <span style="font-size:12.5px; font-weight:600; color:var(--text);">${escapeHtml(active.name)}</span>
      <span class="format-pill-tag">.${escapeHtml(active.format)}</span>
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

// VIEW 1: daftar format (card klik-able ala macOS)
function renderFormatList() {
  formatList.innerHTML = FORMAT_INFO.map((f) => {
    const count = (settings.characters || []).filter((c) => c.format === f.ext).length
    return `<div class="format-item" data-ext="${f.ext}">
      <div class="format-emblem theme-${f.theme}">
        ${renderIcon(f.icon, { size: 18 })}
      </div>
      <div class="format-info-col">
        <div class="format-title-line">
          <span class="format-title">${escapeHtml(f.title || f.label)}</span>
          <span class="format-pill-tag">.${f.ext}</span>
        </div>
        <p class="format-desc-text">${escapeHtml(f.desc)}</p>
      </div>
      <div class="format-status-col">
        ${count > 0 
          ? `<span class="format-count-pill on">🟢 ${count} Karakter</span>`
          : `<span class="format-count-pill off">0 Karakter</span>`
        }
        <span class="format-arrow">${renderIcon('chevron-right', { size: 16 })}</span>
      </div>
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
    <div class="group-header">Informasi Format & Spesifikasi</div>
    <div class="card padded">
      <h2 style="margin-top:0; font-size:16px;">${escapeHtml(f.label)} <span class="muted" style="font-size:12px; font-weight:normal;">(.${f.ext})</span></h2>
      <p class="format-full" style="font-size:13px; line-height:1.5; color:var(--text);">${escapeHtml(f.full)}</p>
      <div class="feature-list" style="margin: 10px 0;">
        ${f.features.map((feat) => `<div class="feature" style="font-size:12px;">• ${escapeHtml(feat)}</div>`).join('')}
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
        <span class="tag plus" style="padding:4px 10px; border-radius:6px; font-size:12px;">+ ${escapeHtml(f.pros)}</span>
        <span class="tag minus" style="padding:4px 10px; border-radius:6px; font-size:12px;">− ${escapeHtml(f.cons)}</span>
      </div>
    </div>

    <div class="group-header">Tambah / Edit Karakter ${escapeHtml(f.label)}</div>
    <div class="card">
      <div class="settings-row">
        <div class="row-label">
          <span class="row-title">Nama Karakter</span>
          <span class="row-desc">Nama panggilan avatar</span>
        </div>
        <div class="row-control">
          <input id="char-name" type="text" class="mac-input" placeholder="cth. Ryo / Fushu" />
        </div>
      </div>
      <div class="settings-row">
        <div class="row-label">
          <span class="row-title">File Model (.${f.ext})</span>
          <span class="row-desc">Path file model 3D / 2D pada hard disk</span>
        </div>
        <div class="row-control" style="gap:6px;">
          <input id="char-path" type="text" class="mac-input" style="width: min(220px, 35vw);" placeholder="path/ke/model.${f.ext}" />
          <button type="button" id="char-browse-btn" class="mini-btn browse">Pilih File…</button>
        </div>
      </div>
      <div class="settings-row">
        <div class="row-label">
          <span class="row-title">Foto Profil (Thumbnail)</span>
          <span class="row-desc">Gambar JPG/PNG (opsional)</span>
        </div>
        <div class="row-control">
          <input id="char-image" type="file" accept="image/*" class="mac-input" style="padding:4px;" />
        </div>
      </div>
      <div class="settings-row">
        <div class="row-label">
          <span class="row-title">Aksi</span>
        </div>
        <div class="row-control">
          <button id="char-add-btn" class="mini-btn primary">Simpan Karakter</button>
        </div>
      </div>
    </div>

    <div class="group-header">Daftar Karakter ${escapeHtml(f.label)} Tersimpan</div>
    <div class="card padded">
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
      const res = await window.hermesAvatar.pickModelFile()
      if (res) {
        const filePath = typeof res === 'string' ? res : res.path
        const estimateMB = typeof res === 'object' ? res.estimateMB : 0
        if (filePath) document.getElementById('char-path').value = filePath
        if (estimateMB > 512) {
          showToast(
            'Model Berat ⚠️',
            `Model ini diperkirakan memakai ±${estimateMB} MB memori grafis. Pertimbangkan tekstur ≤ 2048 px.`,
            'warning',
            '⚠️',
            6000
          )
        }
      }
    } catch (err) {
      statusEl.textContent = `Gagal buka dialog: ${err.message}`
      showToast('Gagal Memilih File', err.message, 'error', '❌')
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
        showToast('Karakter Diperbarui! ✅', `Perubahan avatar ${name} disimpan`, 'success', '💾')
      }
      editingCharId = null
      pendingImage = null
      openFormatDetail(ext)
      return
    }

    // Mode tambah.
    if (!path) {
      statusEl.textContent = '⚠️ Pilih file model.'
      showToast('File Model Belum Dipilih', 'Pilih file model 3D/2D terlebih dahulu', 'error', '⚠️')
      return
    }
    const baseName = path.split(/[/\\]/).pop().replace(/\.(vrm|glb|gltf|pmx|pmd|fbx|model3\.json|json)$/i, '')
    const finalName = name || baseName || 'Karakter'
    const id = Date.now().toString(36)
    settings.characters.push({ id, name: finalName, path, format: ext, image: pendingImage || '', active: false })
    saveSettings(settings)
    showToast('Karakter Ditambahkan! 🎉', `${finalName} berhasil didaftarkan`, 'success', '✨')
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
      const selectedChar = settings.characters.find((c) => c.id === id)
      settings.characters.forEach((c) => { c.active = c.id === id })
      saveSettings(settings)
      renderActiveChar()
      openFormatDetail(ext)
      showToast('Karakter Aktif Diubah! ✨', `${selectedChar?.name || 'Karakter'} sekarang aktif sebagai avatar desktop`, 'success', '✨')
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
      showToast('Karakter Dihapus 🗑️', `Avatar ${c?.name} telah dihapus`, 'info', '🗑️')
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

// Helper langsung menjalankan window avatar
async function launchAvatarDirect(path) {
  startBtn.disabled = true
  statusEl.textContent = 'Memulai…'
  showToast('Memulai Avatar... 🚀', 'Menyiapkan window desktop pet', 'running', '🚀')
  try {
    const res = await window.hermesAvatar.startAvatar(path)
    if (res && res.ok === false) {
      throw new Error(res.error || 'Gagal memulai avatar')
    }
    startBtn.disabled = false
    statusEl.textContent = ''
    showToast('Avatar Aktif! ✨', 'Model siap berinteraksi di desktop', 'success', '✨')
  } catch (err) {
    statusEl.textContent = `Gagal: ${err.message}`
    startBtn.disabled = false
    showToast('Gagal Memulai Avatar', err.message, 'error', '❌')
  }
}

// --- Tombol Mulai (dengan pemeriksaan Prerequisites & Alert Modal) ---
startBtn.addEventListener('click', async () => {
  const active = (settings.characters || []).find((c) => c.active)
  if (!active) {
    statusEl.textContent = '⚠️ Pilih karakter aktif dulu (sidebar Karakter).'
    showToast('Karakter Belum Dipilih', 'Pilih karakter aktif di menu Karakter & Model', 'error', '⚠️')
    showPrerequisitesModal({ hermes: false, router: false, kokoro: false }, null, { ok: false })
    return
  }

  // Validasi file karakter pada disk
  try {
    const checkFile = await window.hermesAvatar.readModel(active.path)
    if (checkFile && checkFile.ok === false) {
      statusEl.textContent = `File model tidak ditemukan: ${active.path}`
      showToast('File Model Hilang / Rusak', `File tidak ada di: ${active.path}`, 'error', '❌')
      const s = await window.hermesAvatar.getServiceStatus()
      const llmInfo = await checkActiveLlmModel()
      showPrerequisitesModal(s, active, llmInfo)
      return
    }
  } catch (err) {
    showToast('File Model Bermasalah', err.message, 'error', '❌')
    return
  }

  // Cek kesiapan service inti (Prerequisites)
  try {
    let s = await window.hermesAvatar.getServiceStatus()

    // Bila Hermes belum aktif, coba nyalakan otomatis dulu
    if (!s.hermes) {
      showToast('Menghubungkan Otak AI...', 'Mencoba mengaktifkan daemon Hermes...', 'running', '🧠')
      await window.hermesAvatar.startHermesServer()
      await new Promise((r) => setTimeout(r, 1400))
      s = await window.hermesAvatar.getServiceStatus()
    }

    // Bila menggunakan Kokoro TTS dan servernya belum aktif, coba nyalakan otomatis
    if (settings.tts?.provider === 'kokoro' && !s.kokoro) {
      showToast('Menyiapkan Vokal Kokoro...', 'Menyalakan server Kokoro TTS...', 'running', '🎙️')
      await window.hermesAvatar.startKokoroServer()
      await new Promise((r) => setTimeout(r, 1400))
      s = await window.hermesAvatar.getServiceStatus()
    }

    // Periksa status model AI / LLM (Otak Percakapan)
    const llmInfo = await checkActiveLlmModel()

    // Periksa apakah ada layanan atau model yang belum siap
    const isHermesReady = !!s.hermes
    const isLlmReady = !!llmInfo.ok
    const isTtsReady = !!(s.kokoro || settings.tts?.provider === 'edge')
    const isRouterReady = settings.routerChecked ? !!s.router : true

    // Jika ada layanan atau model LLM yang belum siap, tampilkan pop-up modal Prasyarat & BLOKIR masuk!
    if (!isHermesReady || !isLlmReady || !isTtsReady || !isRouterReady) {
      if (!isLlmReady) {
        statusEl.textContent = '⚠️ Model LLM belum dipilih. Buka menu Model & Provider LLM.'
        showToast('Model LLM Belum Dipilih! 🤖', 'Avatar membutuhkan model AI untuk berpikir. Silakan periksa menu Model & Provider LLM terlebih dahulu.', 'error', '⚠️', 6000)
      } else {
        statusEl.textContent = '⚠️ Menunggu prasyarat layanan siap...'
      }
      showPrerequisitesModal(s, active, llmInfo)
      return
    }

    // Semua 5 prasyarat terpenuhi -> mulai avatar langsung
    await launchAvatarDirect(active.path)
  } catch (err) {
    statusEl.textContent = `Gagal: ${err.message}`
    showToast('Gagal Memulai Avatar', err.message, 'error', '❌')
  }
})

// Saat settings tampil lagi, reset state.
window.addEventListener('focus', () => {
  startBtn.disabled = false
})

// Polling status service secara ramah CPU (hanya jika jendela sedang aktif/terlihat)
setInterval(() => {
  if (document.visibilityState !== 'hidden') {
    refreshServiceStatus()
  }
}, 4500)

// --- Checklist 9Router (pengingat manual, persisten) ---
routerCheck.checked = !!settings.routerChecked
routerCheck.addEventListener('change', () => {
  settings.routerChecked = routerCheck.checked
  saveSettings(settings)
})

// --- Suara (TTS & STT & Percakapan) ---
const ttsEnabled = document.getElementById('tts-enabled')
const ttsProvider = document.getElementById('tts-provider')
const ttsCountryFilter = document.getElementById('tts-country-filter')
const ttsVoice = document.getElementById('tts-voice')
const ttsVoiceMatchCount = document.getElementById('tts-voice-match-count')
const ttsVoiceBadge = document.getElementById('tts-voice-badge')
const ttsIntonation = document.getElementById('tts-intonation')
const ttsKokoroEndpoint = document.getElementById('tts-kokoro-endpoint')
const kokoroEndpointField = document.getElementById('kokoro-endpoint-field')
const ttsSpeed = document.getElementById('tts-speed')
const ttsVerbosity = document.getElementById('tts-verbosity')
const sttModel = document.getElementById('stt-model')
const sttLanguage = document.getElementById('stt-language')
const convBargeIn = document.getElementById('conv-barge-in')
const convContinuous = document.getElementById('conv-continuous')

export const VOICE_CATALOG = [
  // 🇯🇵 Jepang (Anime Seiyuu)
  { id: 'jf_alpha', name: 'Alpha', gender: 'Perempuan', country: 'jp', countryName: 'Jepang', trait: 'Anime Ceria & Heroine ⭐', provider: 'kokoro' },
  { id: 'jf_gongitsune', name: 'Gongitsune', gender: 'Perempuan', country: 'jp', countryName: 'Jepang', trait: 'Anime Imut & Nada Tinggi (Mascot/Tsundere)', provider: 'kokoro' },
  { id: 'jf_nezumi', name: 'Nezumi', gender: 'Perempuan', country: 'jp', countryName: 'Jepang', trait: 'Anime Lembut & Manis (Kuudere)', provider: 'kokoro' },
  { id: 'jf_tebukuro', name: 'Tebukuro', gender: 'Perempuan', country: 'jp', countryName: 'Jepang', trait: 'Anime Kasual & Natural', provider: 'kokoro' },
  { id: 'jm_kumo', name: 'Kumo', gender: 'Laki-laki', country: 'jp', countryName: 'Jepang', trait: 'Anime Keren & Tenang (Ikemen)', provider: 'kokoro' },

  // 🇮🇩 Indonesia (Edge Natural)
  { id: 'id-ID-GadisNeural', name: 'Gadis', gender: 'Perempuan', country: 'id', countryName: 'Indonesia', trait: 'Bahasa Indonesia Alami & Ramah ⭐', provider: 'edge' },
  { id: 'id-ID-ArdiNeural', name: 'Ardi', gender: 'Laki-laki', country: 'id', countryName: 'Indonesia', trait: 'Bahasa Indonesia Formal & Jelas', provider: 'edge' },

  // 🇺🇸 Amerika Serikat (US English)
  { id: 'af_heart', name: 'Heart', gender: 'Perempuan', country: 'us', countryName: 'Amerika Serikat', trait: 'Ekspresif & Paling Populer ⭐', provider: 'kokoro' },
  { id: 'af_bella', name: 'Bella', gender: 'Perempuan', country: 'us', countryName: 'Amerika Serikat', trait: 'Hangat, Ramah & Keibuan', provider: 'kokoro' },
  { id: 'af_nicole', name: 'Nicole', gender: 'Perempuan', country: 'us', countryName: 'Amerika Serikat', trait: 'Ceria & Berenergi Tinggi', provider: 'kokoro' },
  { id: 'af_sky', name: 'Sky', gender: 'Perempuan', country: 'us', countryName: 'Amerika Serikat', trait: 'Halus, Ringan & Merdu', provider: 'kokoro' },
  { id: 'af_sarah', name: 'Sarah', gender: 'Perempuan', country: 'us', countryName: 'Amerika Serikat', trait: 'Dewasa, Jelas & Naratif', provider: 'kokoro' },
  { id: 'af_nova', name: 'Nova', gender: 'Perempuan', country: 'us', countryName: 'Amerika Serikat', trait: 'Percaya Diri & Tajam', provider: 'kokoro' },
  { id: 'af_river', name: 'River', gender: 'Perempuan', country: 'us', countryName: 'Amerika Serikat', trait: 'Santai & Lembut', provider: 'kokoro' },
  { id: 'af_jessica', name: 'Jessica', gender: 'Perempuan', country: 'us', countryName: 'Amerika Serikat', trait: 'Artikulatif & Cerdas', provider: 'kokoro' },
  { id: 'am_adam', name: 'Adam', gender: 'Laki-laki', country: 'us', countryName: 'Amerika Serikat', trait: 'Berat, Tenang & Narator ⭐', provider: 'kokoro' },
  { id: 'am_michael', name: 'Michael', gender: 'Laki-laki', country: 'us', countryName: 'Amerika Serikat', trait: 'Tegas, Tegap & Percaya Diri', provider: 'kokoro' },
  { id: 'am_echo', name: 'Echo', gender: 'Laki-laki', country: 'us', countryName: 'Amerika Serikat', trait: 'Resonan & Dalam', provider: 'kokoro' },
  { id: 'am_eric', name: 'Eric', gender: 'Laki-laki', country: 'us', countryName: 'Amerika Serikat', trait: 'Santai & Percakapan Harian', provider: 'kokoro' },
  { id: 'am_fenrir', name: 'Fenrir', gender: 'Laki-laki', country: 'us', countryName: 'Amerika Serikat', trait: 'Kuat, Berat & Berkarakter', provider: 'kokoro' },
  { id: 'am_liam', name: 'Liam', gender: 'Laki-laki', country: 'us', countryName: 'Amerika Serikat', trait: 'Muda & Ceria', provider: 'kokoro' },
  { id: 'am_onyx', name: 'Onyx', gender: 'Laki-laki', country: 'us', countryName: 'Amerika Serikat', trait: 'Dingin & Berwibawa', provider: 'kokoro' },

  // 🇬🇧 Inggris / British
  { id: 'bf_alice', name: 'Alice', gender: 'Perempuan', country: 'uk', countryName: 'Inggris (UK)', trait: 'Aksen British Anggun & Royal', provider: 'kokoro' },
  { id: 'bf_emma', name: 'Emma', gender: 'Perempuan', country: 'uk', countryName: 'Inggris (UK)', trait: 'Aksen British Elegan', provider: 'kokoro' },
  { id: 'bf_isabella', name: 'Isabella', gender: 'Perempuan', country: 'uk', countryName: 'Inggris (UK)', trait: 'Aksen British Formal & Lembut', provider: 'kokoro' },
  { id: 'bf_lily', name: 'Lily', gender: 'Perempuan', country: 'uk', countryName: 'Inggris (UK)', trait: 'Aksen British Manis', provider: 'kokoro' },
  { id: 'bm_daniel', name: 'Daniel', gender: 'Laki-laki', country: 'uk', countryName: 'Inggris (UK)', trait: 'Aksen British Lembut & Bersahabat', provider: 'kokoro' },
  { id: 'bm_george', name: 'George', gender: 'Laki-laki', country: 'uk', countryName: 'Inggris (UK)', trait: 'Aksen British Sopan & Berwibawa', provider: 'kokoro' },
  { id: 'bm_lewis', name: 'Lewis', gender: 'Laki-laki', country: 'uk', countryName: 'Inggris (UK)', trait: 'Aksen British Dinamis', provider: 'kokoro' },

  // 🇪🇸 Spanyol
  { id: 'ef_dora', name: 'Dora', gender: 'Perempuan', country: 'es', countryName: 'Spanyol', trait: 'Aksen Spanyol Cerah & Ekspresif', provider: 'kokoro' },
  { id: 'em_alex', name: 'Alex', gender: 'Laki-laki', country: 'es', countryName: 'Spanyol', trait: 'Aksen Spanyol Santai', provider: 'kokoro' },
  { id: 'em_santa', name: 'Santa', gender: 'Laki-laki', country: 'es', countryName: 'Spanyol', trait: 'Aksen Spanyol Hangat', provider: 'kokoro' },

  // 🇫🇷 Prancis
  { id: 'ff_siwis', name: 'Siwis', gender: 'Perempuan', country: 'fr', countryName: 'Prancis', trait: 'Aksen Prancis Lembut & Romantis', provider: 'kokoro' },

  // 🇮🇹 Italia
  { id: 'if_sara', name: 'Sara', gender: 'Perempuan', country: 'it', countryName: 'Italia', trait: 'Aksen Italia Melodis & Ekspresif', provider: 'kokoro' },
  { id: 'im_nicola', name: 'Nicola', gender: 'Laki-laki', country: 'it', countryName: 'Italia', trait: 'Aksen Italia Bersemangat', provider: 'kokoro' },

  // 🇧🇷 Brasil / Portugis
  { id: 'pf_dora', name: 'Dora (BR)', gender: 'Perempuan', country: 'br', countryName: 'Brasil', trait: 'Aksen Portugis Brasil Ceria', provider: 'kokoro' },
  { id: 'pm_alex', name: 'Alex (BR)', gender: 'Laki-laki', country: 'br', countryName: 'Brasil', trait: 'Aksen Portugis Brasil Hangat', provider: 'kokoro' },

  // 🇮🇳 India / Hindi
  { id: 'hf_alpha', name: 'Alpha (IN)', gender: 'Perempuan', country: 'in', countryName: 'India', trait: 'Aksen Hindi Hangat & Berirama', provider: 'kokoro' },
  { id: 'hf_beta', name: 'Beta (IN)', gender: 'Perempuan', country: 'in', countryName: 'India', trait: 'Aksen Hindi Jelas & Cepat', provider: 'kokoro' },
  { id: 'hm_omega', name: 'Omega (IN)', gender: 'Laki-laki', country: 'in', countryName: 'India', trait: 'Aksen Hindi Berwibawa', provider: 'kokoro' },
  { id: 'hm_psi', name: 'Psi (IN)', gender: 'Laki-laki', country: 'in', countryName: 'India', trait: 'Aksen Hindi Santai', provider: 'kokoro' },

  // 🇨🇳 Tiongkok / Mandarin
  { id: 'zf_xiaobei', name: 'Xiaobei', gender: 'Perempuan', country: 'cn', countryName: 'Tiongkok', trait: 'Aksen Mandarin Manis & Imut', provider: 'kokoro' },
  { id: 'zf_xiaoni', name: 'Xiaoni', gender: 'Perempuan', country: 'cn', countryName: 'Tiongkok', trait: 'Aksen Mandarin Ramah', provider: 'kokoro' },
  { id: 'zf_xiaoxiao', name: 'Xiaoxiao', gender: 'Perempuan', country: 'cn', countryName: 'Tiongkok', trait: 'Aksen Mandarin Ceria', provider: 'kokoro' },
  { id: 'zm_yunjian', name: 'Yunjian', gender: 'Laki-laki', country: 'cn', countryName: 'Tiongkok', trait: 'Aksen Mandarin Dewasa & Tenang', provider: 'kokoro' },
  { id: 'zm_yunxi', name: 'Yunxi', gender: 'Laki-laki', country: 'cn', countryName: 'Tiongkok', trait: 'Aksen Mandarin Santai', provider: 'kokoro' }
]

function updateVoiceBadge(voiceId) {
  const item = VOICE_CATALOG.find((v) => v.id === voiceId)
  if (item) {
    const provName = item.provider === 'kokoro' ? 'Kokoro-TTS' : 'Edge-TTS'
    const flagMap = { jp: '🇯🇵', id: '🇮🇩', us: '🇺🇸', uk: '🇬🇧', es: '🇪🇸', fr: '🇫🇷', it: '🇮🇹', br: '🇧🇷', in: '🇮🇳', cn: '🇨🇳' }
    const flag = flagMap[item.country] || '🌐'
    if (ttsVoiceBadge) {
      ttsVoiceBadge.textContent = `${flag} ${item.countryName} · ${item.gender}`
    }
    if (ttsVoiceMatchCount) {
      ttsVoiceMatchCount.textContent = `${item.name}: ${item.trait} (${provName})`
    }
  } else {
    if (ttsVoiceBadge) ttsVoiceBadge.textContent = `Karakter: ${voiceId}`
  }
}

function renderVoiceOptions(activeVoiceId) {
  if (!ttsVoice) return
  const targetVoice = activeVoiceId || ttsVoice.value || settings.tts.voice || 'af_heart'
  const country = ttsCountryFilter?.value || 'all'

  const filtered = VOICE_CATALOG.filter((v) => {
    if (country !== 'all' && v.country !== country) return false
    return true
  })

  // Kelompokkan berdasarkan negara
  const groups = {}
  filtered.forEach((v) => {
    if (!groups[v.countryName]) groups[v.countryName] = []
    groups[v.countryName].push(v)
  })

  ttsVoice.innerHTML = ''
  if (filtered.length === 0) {
    const opt = document.createElement('option')
    opt.value = ''
    opt.textContent = 'Tidak ada karakter cocok'
    opt.disabled = true
    ttsVoice.appendChild(opt)
    return
  }

  const flagMap = {
    'Jepang': '🇯🇵 Jepang (Anime Seiyuu)',
    'Indonesia': '🇮🇩 Indonesia (Edge Natural)',
    'Amerika Serikat': '🇺🇸 Amerika Serikat',
    'Inggris (UK)': '🇬🇧 Inggris / British',
    'Spanyol': '🇪🇸 Spanyol',
    'Prancis': '🇫🇷 Prancis',
    'Italia': '🇮🇹 Italia',
    'Brasil': '🇧🇷 Brasil / Portugis',
    'India': '🇮🇳 India / Hindi',
    'Tiongkok': '🇨🇳 Tiongkok / Mandarin'
  }

  let foundTarget = false
  for (const [cName, list] of Object.entries(groups)) {
    const optgroup = document.createElement('optgroup')
    optgroup.label = flagMap[cName] || cName
    list.forEach((v) => {
      const opt = document.createElement('option')
      opt.value = v.id
      opt.textContent = `${v.name} (${v.gender})`
      if (v.id === targetVoice) {
        opt.selected = true
        foundTarget = true
      }
      optgroup.appendChild(opt)
    })
    ttsVoice.appendChild(optgroup)
  }

  if (!foundTarget && filtered.length > 0) {
    ttsVoice.value = filtered[0].id
  }

  updateVoiceBadge(ttsVoice.value)
}

function updateTtsProviderVisibility() {
  if (kokoroEndpointField && ttsProvider) {
    kokoroEndpointField.style.display = ttsProvider.value === 'kokoro' ? 'flex' : 'none'
  }
}

function loadVoiceUI() {
  ttsEnabled.checked = settings.tts.enabled
  const provider = settings.tts.provider || 'kokoro'
  if (ttsProvider) ttsProvider.value = provider
  
  let curVoice = settings.tts.voice || (provider === 'kokoro' ? 'af_heart' : 'id-ID-GadisNeural')
  if (provider === 'kokoro' && !/^[a-z]{2}_/i.test(curVoice)) {
    curVoice = 'af_heart'
    settings.tts.voice = curVoice
    saveSettings(settings)
  }

  // Pilih negara filter yang cocok dengan suara yang sedang aktif
  const item = VOICE_CATALOG.find((v) => v.id === curVoice)
  if (item && ttsCountryFilter) {
    ttsCountryFilter.value = item.country
  }

  renderVoiceOptions(curVoice)
  if (ttsVoice) ttsVoice.value = curVoice
  updateVoiceBadge(curVoice)

  if (ttsIntonation) ttsIntonation.value = settings.tts?.intonation || 'anime'
  if (ttsKokoroEndpoint) ttsKokoroEndpoint.value = settings.tts.kokoroEndpoint || 'http://127.0.0.1:8880'
  ttsSpeed.value = String(settings.tts.speed ?? 1.0)
  ttsVerbosity.value = settings.tts.verbosity || 'concise'
  sttModel.value = settings.stt.model
  sttLanguage.value = settings.stt.language
  convBargeIn.checked = settings.conversation?.bargeIn !== false
  convContinuous.checked = !!settings.conversation?.continuous
  updateTtsProviderVisibility()
}

ttsCountryFilter?.addEventListener('change', () => {
  renderVoiceOptions()
  saveVoiceUI()
})

ttsVoice?.addEventListener('change', () => {
  const chosen = ttsVoice.value
  const item = VOICE_CATALOG.find((v) => v.id === chosen)
  if (item && item.provider && ttsProvider) {
    ttsProvider.value = item.provider
  }
  updateVoiceBadge(chosen)
  saveVoiceUI()
})

ttsProvider?.addEventListener('change', () => {
  if (ttsProvider.value === 'kokoro' && !/^[a-z]{2}_/i.test(ttsVoice.value)) {
    ttsVoice.value = 'af_heart'
  } else if (ttsProvider.value === 'edge' && /^[a-z]{2}_/i.test(ttsVoice.value)) {
    ttsVoice.value = 'id-ID-GadisNeural'
  }
  updateVoiceBadge(ttsVoice.value)
  saveVoiceUI()
})

function saveVoiceUI() {
  settings.tts.enabled = ttsEnabled.checked
  if (ttsVoice && ttsVoice.value) {
    settings.tts.voice = ttsVoice.value
    const item = VOICE_CATALOG.find((v) => v.id === ttsVoice.value)
    if (item && item.provider) {
      settings.tts.provider = item.provider
      if (ttsProvider) ttsProvider.value = item.provider
    }
  } else if (ttsProvider) {
    settings.tts.provider = ttsProvider.value
  }
  if (ttsIntonation) settings.tts.intonation = ttsIntonation.value
  if (ttsKokoroEndpoint) settings.tts.kokoroEndpoint = ttsKokoroEndpoint.value.trim() || 'http://127.0.0.1:8880'
  settings.tts.speed = parseFloat(ttsSpeed.value) || 1.0
  settings.tts.verbosity = ttsVerbosity.value
  settings.stt.model = sttModel.value
  settings.stt.language = sttLanguage.value
  settings.conversation = settings.conversation || {}
  settings.conversation.bargeIn = convBargeIn.checked
  settings.conversation.continuous = convContinuous.checked
  saveSettings(settings)
  updateTtsProviderVisibility()

  // Terapkan ke Hermes (voice + STT model/bahasa) agar benar-benar berlaku.
  window.hermesAvatar.setTtsConfig({ voice: settings.tts.voice }).catch(() => {})
  window.hermesAvatar.setSttConfig({
    model: settings.stt.model,
    language: settings.stt.language
  }).catch(() => {})
}

;['tts-enabled', 'tts-provider', 'tts-intonation', 'tts-kokoro-endpoint', 'tts-speed', 'tts-verbosity', 'stt-model', 'stt-language', 'conv-barge-in', 'conv-continuous'].forEach((id) => {
  document.getElementById(id)?.addEventListener('change', saveVoiceUI)
})

// --- Pengujian Suara / Audio Preview ---
const ttsTestBtn = document.getElementById('tts-test-btn')
const ttsTestInput = document.getElementById('tts-test-input')
const ttsTestIcon = document.getElementById('tts-test-icon')
const ttsTestText = document.getElementById('tts-test-text')
let currentTestAudio = null

ttsTestBtn?.addEventListener('click', async () => {
  // Jika sedang memutar suara, hentikan pemutaran
  if (currentTestAudio && !currentTestAudio.paused) {
    currentTestAudio.pause()
    currentTestAudio.currentTime = 0
    currentTestAudio = null
    ttsTestBtn.disabled = false
    if (ttsTestIcon) ttsTestIcon.textContent = '🔊'
    if (ttsTestText) ttsTestText.textContent = 'Uji'
    showToast('Pemutaran Dihentikan ⏹️', 'Sampel audio tes dihentikan', 'info', '⏹️')
    return
  }

  const text = (ttsTestInput?.value || '').trim() || 'Halo! Saya adalah avatar desktop pintar Anda.'
  const voice = ttsVoice?.value || 'af_heart'
  const provider = ttsProvider?.value || 'kokoro'
  const intonation = ttsIntonation?.value || 'anime'
  const speed = parseFloat(ttsSpeed?.value) || 1.0
  const kokoroEndpoint = ttsKokoroEndpoint?.value.trim() || 'http://127.0.0.1:8880'

  ttsTestBtn.disabled = true
  if (ttsTestIcon) ttsTestIcon.textContent = '⏳'
  if (ttsTestText) ttsTestText.textContent = '...'

  showToast('Memproses Audio... 🎙️', `Sintesis ucapan [${voice}] via ${provider}`, 'running', '🎙️', 3500)

  try {
    const res = await window.hermesAvatar.synthesizeSpeech(text, voice, {
      provider,
      speed,
      intonation,
      kokoroEndpoint,
      noFallback: true
    })

    if (!res || !res.ok) {
      throw new Error(res?.error || 'Gagal memproses audio TTS')
    }

    const audioSrc = res.dataUrl || (res.base64 ? `data:${res.mimeType || 'audio/mpeg'};base64,${res.base64}` : null)
    if (!audioSrc) {
      throw new Error('Respons audio kosong')
    }

    currentTestAudio = new Audio(audioSrc)
    ttsTestBtn.disabled = false
    if (ttsTestIcon) ttsTestIcon.textContent = '⏹️'
    if (ttsTestText) ttsTestText.textContent = 'Stop'

    const engineLabel = res.isKokoro ? 'Kokoro-TTS (Lokal AI)' : (provider === 'kokoro' ? 'Kokoro' : 'Edge-TTS')
    showToast('Memutar Sampel Suara 🔊', `Model: ${voice} [${engineLabel}] (${speed}x)`, 'success', '🔊', 4500)

    currentTestAudio.onended = () => {
      currentTestAudio = null
      if (ttsTestIcon) ttsTestIcon.textContent = '🔊'
      if (ttsTestText) ttsTestText.textContent = 'Uji'
    }

    currentTestAudio.onerror = () => {
      currentTestAudio = null
      if (ttsTestIcon) ttsTestIcon.textContent = '🔊'
      if (ttsTestText) ttsTestText.textContent = 'Uji'
      showToast('Error Pemutaran Audio', 'Format audio tidak dapat diputar', 'error', '❌')
    }

    await currentTestAudio.play()
  } catch (err) {
    ttsTestBtn.disabled = false
    if (ttsTestIcon) ttsTestIcon.textContent = '🔊'
    if (ttsTestText) ttsTestText.textContent = 'Uji'
    showToast('Gagal Uji Suara', err.message || err, 'error', '❌')
  }
})

// Pustaka musik dikelola oleh modul terpisah settings-music.js

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
    llmList.innerHTML = '<p class="hint" style="padding:16px;">Belum ada provider yang tersimpan.</p>'
    return
  }
  const activeId = settings.llm.activeId || (providers[0] ? providers[0].id : null)

  llmList.innerHTML = providers
    .map((p) => {
      const isActive = (p.id === activeId)
      return `<div class="format-item llm-row ${isActive ? 'active-provider' : ''}" data-id="${escapeHtml(p.id)}" style="${isActive ? 'border: 1px solid rgba(34,197,94,0.45); background: rgba(34,197,94,0.06); box-shadow: 0 0 12px rgba(34,197,94,0.12); border-radius: 8px;' : ''}">
        <div class="format-emblem ${isActive ? 'theme-green' : 'theme-indigo'}">
          ${renderIcon('brain', { size: 18 })}
        </div>
        <div class="format-info-col">
          <div class="format-title-line" style="display:flex; align-items:center; gap:8px;">
            <span class="format-title">${escapeHtml(p.name)}</span>
            ${isActive ? `<span class="badge ready" style="padding:2px 8px; font-size:11px;">Aktif Digunakan ✅</span>` : ''}
            ${p.model ? `<span class="format-pill-tag">${escapeHtml(p.model)}</span>` : ''}
          </div>
          <p class="format-desc-text">${escapeHtml(p.baseUrl || '')} · <span class="muted">${maskKey(p.apiKey)}</span></p>
        </div>
        <div class="format-status-col" style="gap:6px;">
          ${isActive
            ? `<button class="mini-btn success llm-activate" data-id="${escapeHtml(p.id)}" disabled style="background:rgba(34,197,94,0.18); border-color:#22c55e; color:#4ade80; cursor:default;">Aktif ✅</button>`
            : `<button class="mini-btn primary llm-activate" data-id="${escapeHtml(p.id)}" title="Aktifkan sebagai model utama">Aktifkan</button>`
          }
          <button class="mini-btn secondary llm-test" data-id="${escapeHtml(p.id)}" title="Tes koneksi ke endpoint">Tes</button>
          <button class="mini-btn browse llm-edit" data-id="${escapeHtml(p.id)}" title="Edit konfigurasi provider">Edit</button>
          <button class="mini-btn del llm-del" data-id="${escapeHtml(p.id)}" title="Hapus provider ini">${renderIcon('trash-2', { size: 13 })}</button>
        </div>
      </div>`
    })
    .join('')

  // Bind tombol "Aktifkan" → set model + base_url + api_key ke Hermes.
  llmList.querySelectorAll('.llm-activate:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id
      const p = settings.llm.providers.find((x) => x.id === id)
      if (!p?.model) { statusEl.textContent = '⚠️ Model kosong.'; return }

      btn.disabled = true
      const original = btn.textContent
      btn.textContent = '⏳ Mengaktifkan…'
      showToast('Mengaktifkan Provider...', `Menyetel ${p.name} (${p.model}) ke Hermes...`, 'running', '🧠')

      try {
        // Set full provider config ke Hermes (kirim p.apiKey ciphertext apa adanya, atau '')
        const res = await window.hermesAvatar.setLlmProvider({
          name: p.name,
          baseUrl: p.baseUrl || 'http://localhost:20128/v1',
          apiKey: p.apiKey || '',
          model: p.model
        })
        if (!res.ok) {
          showToast('Gagal Mengaktifkan Provider', res.error || 'Terjadi kesalahan konfigurasi', 'error', '❌', 6000)
          throw new Error(res.error)
        }

        settings.llm.activeId = p.id
        saveSettings(settings)

        if (res.warning) {
          statusEl.textContent = `✓ Provider "${p.name}" disimpan, tetapi: ${res.warning}`
          showToast('Perhatian Restart Hermes ⚠️', res.warning, 'warning', '⚠️', 6000)
        } else {
          statusEl.textContent = `✓ Provider "${p.name}" diaktifkan (${p.model}).`
          showToast('Provider Diaktifkan! ✅', `${p.name} kini aktif sebagai otak percakapan avatar (${p.model})`, 'success', '✨', 4500)
        }

        renderLlmList()
        await refreshLlmActive()
        await refreshModelOptions()
        await refreshServiceStatus()
      } catch (err) {
        statusEl.textContent = `✗ Gagal aktifkan: ${err?.message || err}`
        showToast('Gagal Mengaktifkan Provider', err?.message || err, 'error', '❌')
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
    btn.addEventListener('click', () => {
      const id = btn.dataset.id
      const p = settings.llm.providers.find((x) => x.id === id)
      if (!p) return
      editingProviderId = id
      llmName.value = p.name
      llmBaseUrl.value = p.baseUrl || ''
      // Form edit: JANGAN mendekripsi. llmApiKey.value = '' dan pasang placeholder informatif
      llmApiKey.value = ''
      llmApiKey.placeholder = p.apiKey
        ? '•••••••• (tersimpan, kosongkan untuk mempertahankan)'
        : 'Kosong = otomatis untuk 9Router lokal'
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

      try {
        const res = await window.hermesAvatar.testConnection(p.baseUrl, p.model, p.apiKey || '')
        if (res.ok) {
          btn.textContent = '✓'
          btn.classList.add('test-ok')
          statusEl.textContent = `✓ ${p.model} berfungsi (HTTP ${res.status ?? 'ok'})`
        } else {
          btn.textContent = '✗'
          btn.classList.add('test-fail')
          statusEl.textContent = `✗ Gagal: ${res.error || 'tidak berfungsi'}`
          showToast('Uji Koneksi Gagal', res.error || 'Koneksi ke endpoint gagal', 'error', '❌', 6000)
        }
      } catch (err) {
        btn.textContent = '✗'
        btn.classList.add('test-fail')
        statusEl.textContent = `✗ Gagal: ${err?.message || err}`
        showToast('Uji Koneksi Gagal', err?.message || String(err), 'error', '❌', 6000)
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
  llmApiKey.placeholder = 'Kosong = otomatis untuk 9Router lokal'
  llmModel.value = ''
  llmAddBtn.textContent = 'Simpan Provider'
}

// escapeHtml diimpor dari utils.js

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
    showToast('Nama Provider Kosong', 'Harap masukkan nama provider LLM', 'error', '⚠️')
    return
  }

  const baseUrl = llmBaseUrl.value.trim()
  const keyInput = llmApiKey.value.trim()
  let apiKeyEnc = ''

  function getUrlOrigin(raw) {
    try {
      const u = new URL(String(raw || '').trim())
      return (u.protocol === 'http:' || u.protocol === 'https:') ? u.origin : null
    } catch {
      return null
    }
  }

  if (editingProviderId) {
    // Mode edit: update provider yang ada.
    const p = settings.llm.providers.find((x) => x.id === editingProviderId)
    if (!p) {
      resetProviderForm()
      return
    }

    if (keyInput) {
      const encRes = await window.hermesAvatar.encryptSecret(keyInput, baseUrl)
      if (!encRes?.ok) {
        statusEl.textContent = `⚠️ Gagal mengenkripsi kunci: ${encRes?.error || 'URL atau kunci tidak valid'}`
        showToast('Enkripsi Kunci Gagal', encRes?.error || 'URL atau kunci tidak valid', 'error', '❌', 6000)
        return
      }
      apiKeyEnc = encRes.value
    } else {
      const oldOrigin = getUrlOrigin(p.baseUrl)
      const newOrigin = getUrlOrigin(baseUrl)
      if (oldOrigin && newOrigin && oldOrigin === newOrigin) {
        apiKeyEnc = p.apiKey || ''
      } else {
        apiKeyEnc = ''
        statusEl.textContent = 'URL berubah, kunci lama tidak dibawa. Masukkan ulang jika perlu.'
        showToast('Perhatian Kunci API ⚠️', 'URL berubah, kunci lama tidak dibawa. Masukkan ulang jika perlu.', 'warning', '⚠️', 6000)
      }
    }

    p.name = name
    p.baseUrl = baseUrl
    p.apiKey = apiKeyEnc
    p.model = llmModel.value.trim()
    saveSettings(settings)
    if (!statusEl.textContent.includes('URL berubah')) {
      statusEl.textContent = 'Provider diperbarui.'
    }
    showToast('Provider Diperbarui! ✅', `Konfigurasi ${name} telah diupdate`, 'success', '💾')
    resetProviderForm()
  } else {
    // Mode tambah provider baru.
    if (keyInput) {
      const encRes = await window.hermesAvatar.encryptSecret(keyInput, baseUrl)
      if (!encRes?.ok) {
        statusEl.textContent = `⚠️ Gagal mengenkripsi kunci: ${encRes?.error || 'URL atau kunci tidak valid'}`
        showToast('Enkripsi Kunci Gagal', encRes?.error || 'URL atau kunci tidak valid', 'error', '❌', 6000)
        return
      }
      apiKeyEnc = encRes.value
    } else {
      apiKeyEnc = ''
    }

    settings.llm.providers.push({
      id: Date.now().toString(36),
      name,
      baseUrl,
      apiKey: apiKeyEnc,
      model: llmModel.value.trim()
    })
    saveSettings(settings)
    statusEl.textContent = 'Provider ditambahkan.'
    showToast('Provider Ditambahkan! 🎉', `${name} berhasil ditambahkan ke daftar LLM`, 'success', '💾')
    resetProviderForm()
  }

  renderLlmList()
  await refreshModelOptions()
})

// --- LLM via RPC (model aktif + switch via dropdown) ---
const llmActiveEl = document.getElementById('llm-active')
const llmRefreshBtn = document.getElementById('llm-refresh-btn')
const llmSwitchModel = document.getElementById('llm-switch-model')
const llmSwitchBtn = document.getElementById('llm-switch-btn')

function modelItemHtml(r) {
  const modelName = r.model || '—'
  const providerName = r.provider || 'default'
  return `<div class="llm-pill-badge" style="display:inline-flex; align-items:center; gap:8px; padding:4px 10px; border-radius:14px; background:rgba(59,130,246,0.12); border:1px solid rgba(59,130,246,0.28);">
    <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#34d399; box-shadow:0 0 6px #34d399;"></span>
    <span style="font-size:12.5px; font-weight:600; color:var(--text);">${escapeHtml(modelName)}</span>
    <span style="font-size:11px; color:var(--text-secondary); opacity:0.8;">(${escapeHtml(providerName)})</span>
  </div>`
}

async function refreshLlmActive() {
  const homeModelEl = document.getElementById('home-model')
  try {
    const info = await checkActiveLlmModel()
    if (info.ok) {
      const html = modelItemHtml(info)
      if (llmActiveEl) llmActiveEl.innerHTML = html
      if (homeModelEl) homeModelEl.innerHTML = html
    } else {
      const fallback = `<div class="llm-pill-badge" style="display:inline-flex; align-items:center; gap:8px; padding:4px 10px; border-radius:14px; background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3);">
        <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#ef4444; box-shadow:0 0 6px #ef4444;"></span>
        <span style="font-size:12.5px; font-weight:600; color:#f87171;">Belum Dipilih ⚠️</span>
        <span style="font-size:11px; color:var(--text-secondary); opacity:0.8;">(Pilih di LLM & Provider)</span>
      </div>`
      if (llmActiveEl) llmActiveEl.innerHTML = fallback
      if (homeModelEl) homeModelEl.innerHTML = fallback
    }
  } catch (err) {
    const fallback = `<p class="hint">Tidak dapat memuat (${escapeHtml(err?.message || err)})</p>`
    if (llmActiveEl) llmActiveEl.innerHTML = fallback
    if (homeModelEl) homeModelEl.innerHTML = fallback
  }
}

// Ambil daftar model aktual dari endpoint aktif (mis. 9Router / Ollama) & provider tersimpan
async function refreshModelOptions() {
  try {
    const activeProv = (settings.llm.providers || []).find((p) => p.id === settings.llm.activeId) || (settings.llm.providers || [])[0]
    const custom = []
    const seenModels = new Set()

    // 1. Ambil model langsung dari endpoint provider yang sedang aktif (mis. 9Router :20128/v1/models)
    if (activeProv?.baseUrl) {
      try {
        const epRes = await window.hermesAvatar.fetchEndpointModels(activeProv.baseUrl, activeProv.apiKey || '')
        if (epRes && !epRes.ok && epRes.error) {
          showToast('Model Endpoint Gagal', epRes.error, 'warning', '⚠️', 5000)
        }
        if (epRes && epRes.ok && Array.isArray(epRes.models) && epRes.models.length > 0) {
          for (const m of epRes.models) {
            if (!seenModels.has(m)) {
              seenModels.add(m)
              custom.push({ value: m, label: `${activeProv.name} — ${m}` })
            }
          }
        }
      } catch (_) {}
    }

    // 2. Tambahkan semua model dari daftar provider tersimpan user
    for (const p of (settings.llm.providers || [])) {
      if (p.model && !seenModels.has(p.model)) {
        seenModels.add(p.model)
        custom.push({ value: p.model, label: `${p.name} — ${p.model}` })
      }
    }

    // 3. Tambahkan custom provider dari RPC model.options jika ada
    try {
      const res = await window.hermesAvatar.rpc('model.options', {})
      if (res && res.ok) {
        const providers = res.result?.providers || []
        for (const p of providers) {
          const slug = p.slug || 'custom'
          const name = p.name || slug
          const isCustom = p.is_user_defined || slug === 'custom' || /^custom(:|$)/.test(slug) || /localhost|127\.0\.0\.1/.test(p.base_url || '')
          if (isCustom) {
            for (const m of (p.models || [])) {
              if (!seenModels.has(m)) {
                seenModels.add(m)
                custom.push({ value: m, label: `${name} — ${m}` })
              }
            }
          }
        }
      }
    } catch (_) {}

    // Fallback bila sama sekali belum terdeteksi
    let options = custom
    if (options.length === 0) {
      options.push({ value: '', label: 'Belum ada model terdeteksi di endpoint' })
    }

    llmSwitchModel.innerHTML = options
      .map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
      .join('')

    // Sinkronkan pilihan dropdown dengan model aktif saat ini
    const curModel = cachedLlmModelInfo?.model || activeProv?.model
    if (curModel && seenModels.has(curModel)) {
      llmSwitchModel.value = curModel
    }
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
      const isCore = n.toLowerCase().includes('mnemosyne')
      const coreBadge = isCore ? '<span class="skill-core-badge" style="background:#8b5cf6;color:#fff;font-size:10px;padding:2px 6px;border-radius:4px;margin-left:6px;font-weight:600;">WAJIB</span>' : ''
      const actionBtn = isCore
        ? `<span class="skill-chip-lock" title="Skill bawaan sistem (wajib) — tidak dapat dihapus" style="opacity:0.7;font-size:11px;margin-left:4px;cursor:default;">🔒</span>`
        : `<button class="skill-chip-del" data-name="${escapeHtml(n)}" data-cat="${escapeHtml(cat)}" title="Hapus skill">×</button>`
      return `<span class="skill-chip ${isCore ? 'core-skill' : ''}" style="${isCore ? 'border-color:#8b5cf6;' : ''}">
        <span class="skill-chip-name">${escapeHtml(n)}</span>
        ${coreBadge}
        ${actionBtn}
      </span>`
    }).join('')
    return `<div class="skill-acc">
      <button class="skill-acc-head" type="button">
        <span class="format-emblem theme-teal" style="width:26px; height:26px; border-radius:6px; margin-right:8px; display:inline-flex; align-items:center; justify-content:center;">
          ${renderIcon('folder', { size: 14 })}
        </span>
        <span class="skill-acc-cat">${escapeHtml(cat)}</span>
        <span class="format-count-pill off" style="margin-left:auto; margin-right:10px;">${names.length} Skill</span>
        <span class="skill-acc-arrow">${renderIcon('chevron-down', { size: 14 })}</span>
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
    showToast('Form Belum Lengkap', 'Isi nama & isi instruksi skill (.md)', 'error', '⚠️')
    return
  }
  skillAddBtn.disabled = true
  showToast('Menyimpan Skill...', `Menulis ${name} ke ~/.hermes/skills/`, 'running', '🧩')
  try {
    const res = await window.hermesAvatar.addSkill({
      name,
      category: skillCategory.value.trim(),
      content
    })
    if (!res.ok) throw new Error(res.error)
    statusEl.textContent = 'Skill disimpan.'
    showToast('Skill Disimpan! ✅', `Skill ${name} berhasil dibuat`, 'success', '🧩')
    skillName.value = ''
    skillCategory.value = ''
    skillContent.value = ''
    skillFileName.textContent = ''
    skillFile.value = ''
    reloadAndRefreshSkills()
  } catch (err) {
    statusEl.textContent = `Gagal simpan skill: ${err?.message || err}`
    showToast('Gagal Simpan Skill', err?.message || err, 'error', '❌')
  } finally {
    skillAddBtn.disabled = false
  }
})

// --- Install skill dari hub ---
const skillInstallId = document.getElementById('skill-install-id')
const skillInstallBtn = document.getElementById('skill-install-btn')

skillInstallBtn.addEventListener('click', async () => {
  const id = skillInstallId.value.trim()
  if (!id) {
    statusEl.textContent = '⚠️ Isi Skill ID.'
    showToast('Skill ID Kosong', 'Masukkan ID skill dari Hub', 'error', '⚠️')
    return
  }

  skillInstallBtn.disabled = true
  skillInstallBtn.textContent = 'Menginstall…'
  showToast('Mengunduh Skill...', `Mengambil "${id}" dari repository`, 'running', '📥')
  try {
    const res = await window.hermesAvatar.installSkill(id)
    if (!res.ok) throw new Error(res.error)
    statusEl.textContent = `Skill "${id}" diinstall.`
    showToast('Skill Terpasang! ✅', `Skill "${id}" siap digunakan`, 'success', '🎉')
    skillInstallId.value = ''
    reloadAndRefreshSkills()
  } catch (err) {
    statusEl.textContent = `Gagal install skill: ${err?.message || err}`
    showToast('Gagal Install Skill', err?.message || err, 'error', '❌')
  } finally {
    skillInstallBtn.disabled = false
    skillInstallBtn.textContent = 'Install Skill'
  }
})

// Animasi dikelola oleh modul terpisah settings-animations.js

// Allowlist aksi dan aplikasi terdaftar dikelola oleh modul terpisah settings-apps.js

// Shortcut global dikelola oleh modul terpisah settings-shortcuts.js

llmSwitchBtn.addEventListener('click', async () => {
  const value = llmSwitchModel.value.trim()
  if (!value) {
    statusEl.textContent = '⚠️ Pilih model dulu.'
    showToast('Pilih Model Dulu', 'Silakan pilih model LLM dari daftar pilihan', 'error', '⚠️')
    return
  }
  llmSwitchBtn.disabled = true
  showToast('Menerapkan Model LLM...', `Mengalihkan model aktif ke "${value}"`, 'running', '🧠')
  try {
    const activeProv = (settings.llm.providers || []).find((p) => p.id === settings.llm.activeId) || (settings.llm.providers || [])[0]
    const res = await window.hermesAvatar.setLlmProvider({
      name: activeProv?.name || 'custom',
      baseUrl: activeProv?.baseUrl || 'http://localhost:20128/v1',
      apiKey: activeProv?.apiKey || '',
      model: value
    })
    if (!res.ok) {
      showToast('Gagal Menerapkan Model', res.error || 'Gagal menyetel provider LLM', 'error', '❌', 6000)
      throw new Error(res.error)
    }

    if (activeProv) {
      activeProv.model = value
      saveSettings(settings)
    }

    if (res.warning) {
      statusEl.textContent = `Model diterapkan, tetapi: ${res.warning}`
      showToast('Perhatian Restart Hermes ⚠️', res.warning, 'warning', '⚠️', 6000)
    } else {
      statusEl.textContent = 'Model diterapkan.'
      showToast('Model Diterapkan! ✅', `Model LLM aktif: ${value}`, 'success', '🧠')
    }
    await refreshLlmActive()
    await refreshModelOptions()
    await refreshServiceStatus()
    renderLlmList()
  } catch (err) {
    statusEl.textContent = `Gagal switch model: ${err?.message || err}`
    showToast('Gagal Menerapkan Model', err?.message || err, 'error', '❌')
  } finally {
    llmSwitchBtn.disabled = false
  }
})

// Platform commands & detectPlatform diimpor dari settings-apps.js

let cachedUpdateInfo = null

async function checkAppUpdates(interactive = false) {
  const banner = document.getElementById('home-update-banner')
  const bannerTag = document.getElementById('update-banner-tag')
  const bannerDesc = document.getElementById('update-banner-desc')
  const footerVerTag = document.getElementById('footer-version-tag')
  const footerUpdateBadge = document.getElementById('footer-update-badge')
  const homeVerBadge = document.getElementById('home-version-badge')
  const homeVerDesc = document.getElementById('home-version-desc')
  const checkBtn = document.getElementById('home-check-update-btn')

  if (checkBtn && interactive) {
    checkBtn.disabled = true
    checkBtn.textContent = 'Memeriksa…'
  }

  if (interactive) {
    showToast('Memeriksa Pembaruan...', 'Menghubungi server rilis GitHub...', 'info', '🔄')
  }

  try {
    const res = await window.hermesAvatar?.checkAppUpdate?.()
    if (!res || !res.ok) {
      if (interactive) {
        showToast('Gagal Periksa Pembaruan', res?.error || 'Tidak dapat terhubung ke GitHub', 'error', '❌')
      }
      return
    }

    cachedUpdateInfo = res
    const currentVer = res.currentVersion ? (res.currentVersion.startsWith('v') ? res.currentVersion : `v${res.currentVersion}`) : 'v0.1.4'
    const latestVer = res.latestVersion ? (res.latestVersion.startsWith('v') ? res.latestVersion : `v${res.latestVersion}`) : currentVer

    if (footerVerTag) footerVerTag.textContent = currentVer
    if (homeVerDesc) homeVerDesc.textContent = `Versi terpasang: ${currentVer}`

    if (res.hasUpdate) {
      if (banner) banner.classList.remove('hidden')
      if (bannerTag) bannerTag.textContent = latestVer
      if (bannerDesc) bannerDesc.textContent = `Versi ${latestVer} sudah tersedia dengan perbaikan bug dan peningkatan fitur.`
      if (footerUpdateBadge) footerUpdateBadge.style.display = 'inline-block'
      if (homeVerBadge) {
        homeVerBadge.textContent = `Update ${latestVer} Tersedia! 🚀`
        homeVerBadge.className = 'badge ready'
      }

      if (interactive) {
        showToast(`Versi Baru ${latestVer} Tersedia! 🚀`, 'Klik tombol "Unduh Update" di banner untuk memperbarui.', 'success', '🎉', 5000)
      }
    } else {
      if (banner) banner.classList.add('hidden')
      if (footerUpdateBadge) footerUpdateBadge.style.display = 'none'
      if (homeVerBadge) {
        homeVerBadge.textContent = `${currentVer} Terbaru ✅`
        homeVerBadge.className = 'badge ready'
      }

      if (interactive) {
        showToast('Aplikasi Sudah Versi Terbaru ✅', `Anda sedang menggunakan versi ${currentVer} (paling mutakhir).`, 'success', '✨')
      }
    }
  } catch (err) {
    if (interactive) {
      showToast('Error', err.message, 'error', '❌')
    }
  } finally {
    if (checkBtn) {
      checkBtn.disabled = false
      checkBtn.textContent = 'Cek Update 🔄'
    }
  }
}

let isUpdating = false
let updateReadyToRestart = false

async function triggerOtaUpdate() {
  if (updateReadyToRestart) {
    showToast('Memulai Ulang Aplikasi... 🔄', 'Menerapkan pembaruan versi terbaru...', 'running', '🚀')
    setTimeout(() => {
      window.hermesAvatar?.relaunchApp?.()
    }, 600)
    return
  }

  if (isUpdating) return
  if (!cachedUpdateInfo || !cachedUpdateInfo.downloadUrl) {
    showToast('URL Unduhan Tidak Ditemukan', 'Membuka halaman rilis di browser...', 'warning', '🌐')
    window.hermesAvatar?.openExternalUrl?.(cachedUpdateInfo?.releaseUrl || 'https://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases')
    return
  }

  isUpdating = true

  const bannerBtn = document.getElementById('update-download-btn')
  const modalBtn = document.getElementById('modal-download-btn')
  const bannerProgressWrap = document.getElementById('banner-progress-wrap')
  const bannerProgressBar = document.getElementById('banner-progress-bar')
  const bannerProgressStatus = document.getElementById('banner-progress-status')
  const bannerProgressPercent = document.getElementById('banner-progress-percent')

  const modalProgressWrap = document.getElementById('modal-progress-wrap')
  const modalProgressBar = document.getElementById('modal-progress-bar')
  const modalProgressStatus = document.getElementById('modal-progress-status')
  const modalProgressPercent = document.getElementById('modal-progress-percent')

  if (bannerBtn) {
    bannerBtn.disabled = true
    bannerBtn.textContent = 'Mengunduh… ⏳'
  }
  if (modalBtn) {
    modalBtn.disabled = true
    modalBtn.textContent = 'Mengunduh… ⏳'
  }

  if (bannerProgressWrap) bannerProgressWrap.classList.remove('hidden')
  if (modalProgressWrap) modalProgressWrap.classList.remove('hidden')

  showToast('Mengunduh Pembaruan ⚡', `Mengunduh rilis ${cachedUpdateInfo.latestVersion}...`, 'info', '⬇')

  try {
    const res = await window.hermesAvatar?.downloadAndApplyUpdate?.(cachedUpdateInfo.downloadUrl, cachedUpdateInfo.assetName)
    if (res && res.ok) {
      updateReadyToRestart = true
      isUpdating = false

      if (bannerProgressBar) bannerProgressBar.style.width = '100%'
      if (modalProgressBar) modalProgressBar.style.width = '100%'

      if (bannerProgressStatus) bannerProgressStatus.textContent = 'Pembaruan siap diterapkan! ✅'
      if (modalProgressStatus) modalProgressStatus.textContent = 'Pembaruan siap diterapkan! ✅'

      if (bannerProgressPercent) bannerProgressPercent.textContent = '100%'
      if (modalProgressPercent) modalProgressPercent.textContent = '100%'

      if (bannerBtn) {
        bannerBtn.disabled = false
        bannerBtn.textContent = 'Mulai Ulang & Terapkan 🔄'
        bannerBtn.style.background = '#10b981'
      }
      if (modalBtn) {
        modalBtn.disabled = false
        modalBtn.textContent = 'Mulai Ulang & Terapkan 🔄'
        modalBtn.style.background = '#10b981'
      }

      showToast('Pembaruan Berhasil Dipasang! 🎉', 'Klik tombol "Mulai Ulang" untuk membuka versi terbaru.', 'success', '✨', 8000)
    } else {
      throw new Error(res?.error || 'Gagal menerapkan pembaruan')
    }
  } catch (err) {
    isUpdating = false
    if (bannerBtn) {
      bannerBtn.disabled = false
      bannerBtn.textContent = 'Coba Lagi / Unduh Manual 📥'
    }
    if (modalBtn) {
      modalBtn.disabled = false
      modalBtn.textContent = 'Unduh Manual di Browser 🌐'
    }
    showToast('Gagal Memasang Update', `${err.message}. Membuka browser...`, 'error', '❌')
    window.hermesAvatar?.openExternalUrl?.(cachedUpdateInfo.downloadUrl || cachedUpdateInfo.releaseUrl)
  }
}

function showUpdateModal() {
  const modal = document.getElementById('update-modal')
  const curVerEl = document.getElementById('modal-current-ver')
  const latVerEl = document.getElementById('modal-latest-ver')
  const dateEl = document.getElementById('modal-release-date')
  const changelogEl = document.getElementById('modal-changelog-content')
  const cliCmdEl = document.getElementById('modal-cli-cmd')

  if (!modal) return

  const cur = cachedUpdateInfo?.currentVersion || '0.1.4'
  const lat = cachedUpdateInfo?.latestVersion || 'v0.1.4'
  const date = cachedUpdateInfo?.releaseDate || 'Rilis Terbaru'
  const changelog = cachedUpdateInfo?.changelog || 'Pembaruan stabilitas dan perbaikan bug.'

  if (curVerEl) curVerEl.textContent = cur.startsWith('v') ? cur : `v${cur}`
  if (latVerEl) latVerEl.textContent = lat.startsWith('v') ? lat : `v${lat}`
  if (dateEl) dateEl.textContent = date
  if (changelogEl) changelogEl.textContent = changelog

  if (cliCmdEl) {
    const isWin = window.hermesAvatar?.platform === 'win32'
    cliCmdEl.textContent = isWin
      ? 'irm https://raw.githubusercontent.com/KarmaSenzu/Hermes-Desktop-Pet/main/update.ps1 | iex'
      : 'curl -fsSL https://raw.githubusercontent.com/KarmaSenzu/Hermes-Desktop-Pet/main/update.sh | bash'
  }

  modal.hidden = false
}

function hideUpdateModal() {
  const modal = document.getElementById('update-modal')
  if (modal) modal.hidden = true
}

function initAppUpdateChecker() {
  const banner = document.getElementById('home-update-banner')
  const downloadBtn = document.getElementById('update-download-btn')
  const detailsBtn = document.getElementById('update-details-btn')
  const dismissBtn = document.getElementById('update-dismiss-btn')
  const checkBtn = document.getElementById('home-check-update-btn')
  const sidebarFooter = document.getElementById('sidebar-footer')

  const modalClose = document.getElementById('update-modal-close')
  const modalCancel = document.getElementById('modal-cancel-btn')
  const modalGithub = document.getElementById('modal-github-btn')
  const modalDownload = document.getElementById('modal-download-btn')
  const modalCopyCli = document.getElementById('modal-copy-cli-btn')
  const modalCliCmd = document.getElementById('modal-cli-cmd')

  setTimeout(() => {
    checkAppUpdates(false)
  }, 1200)

  checkBtn?.addEventListener('click', () => {
    checkAppUpdates(true)
  })

  dismissBtn?.addEventListener('click', () => {
    if (banner) banner.classList.add('hidden')
  })

  detailsBtn?.addEventListener('click', () => {
    showUpdateModal()
  })

  sidebarFooter?.addEventListener('click', () => {
    if (cachedUpdateInfo?.hasUpdate) {
      showUpdateModal()
    } else {
      checkAppUpdates(true)
    }
  })

  // Tombol update instan di banner (OTA in-app)
  downloadBtn?.addEventListener('click', () => {
    triggerOtaUpdate()
  })

  // Tombol update instan di modal (OTA in-app)
  modalDownload?.addEventListener('click', () => {
    triggerOtaUpdate()
  })

  modalClose?.addEventListener('click', hideUpdateModal)
  modalCancel?.addEventListener('click', hideUpdateModal)
  modalGithub?.addEventListener('click', () => {
    const url = cachedUpdateInfo?.releaseUrl || 'https://github.com/KarmaSenzu/Hermes-Desktop-Pet/releases'
    window.hermesAvatar?.openExternalUrl?.(url)
  })

  // Salin perintah 1-baris CLI
  modalCopyCli?.addEventListener('click', () => {
    const cmd = modalCliCmd?.textContent || 'curl -fsSL https://raw.githubusercontent.com/KarmaSenzu/Hermes-Desktop-Pet/main/update.sh | bash'
    navigator.clipboard?.writeText(cmd)
    modalCopyCli.textContent = 'Tersalin! ✅'
    showToast('Perintah Tersalin! 📋', 'Tempel dan jalankan di Terminal untuk update kilat.', 'success', '📋')
    setTimeout(() => {
      modalCopyCli.textContent = 'Salin 📋'
    }, 2000)
  })

  // Listener kemajuan unduhan real-time dari main process
  window.hermesAvatar?.onUpdateProgress?.((info) => {
    const p = `${info.percent}%`
    const desc = `Mengunduh: ${info.transferredMb || 0} MB / ${info.totalMb || 0} MB (${p})`

    const bannerProgressBar = document.getElementById('banner-progress-bar')
    const bannerProgressStatus = document.getElementById('banner-progress-status')
    const bannerProgressPercent = document.getElementById('banner-progress-percent')

    const modalProgressBar = document.getElementById('modal-progress-bar')
    const modalProgressStatus = document.getElementById('modal-progress-status')
    const modalProgressPercent = document.getElementById('modal-progress-percent')

    if (bannerProgressBar) bannerProgressBar.style.width = p
    if (bannerProgressPercent) bannerProgressPercent.textContent = p
    if (bannerProgressStatus) bannerProgressStatus.textContent = desc

    if (modalProgressBar) modalProgressBar.style.width = p
    if (modalProgressPercent) modalProgressPercent.textContent = p
    if (modalProgressStatus) modalProgressStatus.textContent = desc
  })
}

function initProfileAvatar() {
  const profileImg = document.querySelector('.profile-avatar-img')
  if (profileImg) {
    profileImg.addEventListener('error', () => {
      profileImg.style.display = 'none'
      const fallback = profileImg.nextElementSibling
      if (fallback) fallback.style.display = 'flex'
    })
  }
}

function init() {
  detectPlatform()
  initProfileAvatar()
  adaptPlatformCommands()
  initThemeSwitcher()
  initWindowControls()
  initHistoryControls()
  initSidebarSearch()
  renderNav()
  refreshServiceStatus()
  loadDetectedPathsOnce(false)
  bindPackageActions()
  loadVoiceUI()
  renderLlmList()
  renderFormatList()
  renderActiveChar()
  refreshLlmActive()
  refreshModelOptions()
  initMusicPanel({
    btnOpenMusicFolder: document.getElementById('btn-open-music-folder'),
    btnRefreshMusicStats: document.getElementById('btn-refresh-music-stats'),
    musicStatsDesc: document.getElementById('music-stats-desc'),
    settingsMusicUrl: document.getElementById('settings-music-url'),
    btnSettingsAddStream: document.getElementById('btn-settings-add-stream'),
    settingsMusicFeedback: document.getElementById('settings-music-feedback')
  })

  initAnimationsPanel({ settings, saveSettings, statusEl })
  renderAnimationSettings()

  initAppsPanel({
    actionList: document.getElementById('action-list'),
    appName: document.getElementById('app-name'),
    appCommand: document.getElementById('app-command'),
    appAddBtn: document.getElementById('app-add-btn'),
    appPickBtn: document.getElementById('app-pick-btn'),
    appScanBtn: document.getElementById('app-scan-btn'),
    appList: document.getElementById('app-list'),
    settings,
    saveSettings,
    statusEl,
    showConfirm: confirmDialog
  })

  renderShortcuts(document.getElementById('shortcut-list'), statusEl)
  refreshSkills()
  initAppUpdateChecker()
}

init()
