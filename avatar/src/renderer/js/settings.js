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
    syncInstallStateFromMain()
  } else if (sectionId === 'llm') {
    closeLlmSubpanel()
    refreshProviderQuota(false)
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

function applyUiMode(mode) {
  const normalized = mode === 'advanced' ? 'advanced' : 'simple'
  document.body.setAttribute('data-ui-mode', normalized)
  const iconEl = document.getElementById('ui-mode-icon')
  const textEl = document.getElementById('ui-mode-text')
  if (normalized === 'advanced') {
    if (iconEl) iconEl.textContent = '🛠️'
    if (textEl) textEl.textContent = 'Mode Teknis'
  } else {
    if (iconEl) iconEl.textContent = '✨'
    if (textEl) textEl.textContent = 'Mode Sederhana'
  }
}

function initUiModeSwitcher() {
  const initialMode = settings.uiMode === 'advanced' ? 'advanced' : 'simple'
  applyUiMode(initialMode)

  const toggleBtn = document.getElementById('ui-mode-toggle-btn')
  toggleBtn?.addEventListener('click', () => {
    const current = document.body.getAttribute('data-ui-mode') === 'advanced' ? 'advanced' : 'simple'
    const next = current === 'simple' ? 'advanced' : 'simple'
    settings.uiMode = next
    saveSettings(settings)
    applyUiMode(next)
    showToast(
      next === 'simple' ? 'Mode Sederhana Aktif ✨' : 'Mode Teknis Aktif 🛠️',
      next === 'simple'
        ? 'Menampilkan antarmuka ringkas yang ramah pengguna.'
        : 'Menampilkan seluruh opsi port, URL endpoint, dan terminal developer.',
      'info',
      next === 'simple' ? '✨' : '🛠️'
    )
  })
}

// --- Status service & Package Hub & Home Prerequisites ---
const homeSetupAlert = document.getElementById('home-setup-alert')
const alertOpenPkgBtn = document.getElementById('alert-open-pkg-btn')
const alertInstallAllBtn = document.getElementById('alert-install-all-btn')
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

const pkgInstallAllBtn = document.getElementById('pkg-install-all-btn')
const pkgGlobalProgressWrap = document.getElementById('pkg-global-progress-wrap')
const pkgGlobalProgressText = document.getElementById('pkg-global-progress-text')
const pkgGlobalProgressPct = document.getElementById('pkg-global-progress-pct')
const pkgGlobalProgressBar = document.getElementById('pkg-global-progress-bar')
const pkgResumeBar = document.getElementById('pkg-resume-bar')
const pkgResumeInstallBtn = document.getElementById('pkg-resume-install-btn')
const pkgInstallChecklist = document.getElementById('pkg-install-checklist')

const pkgStatusHermes = document.getElementById('pkg-status-hermes')
const pkgStatusRouter = document.getElementById('pkg-status-router')
const pkgStatusKokoro = document.getElementById('pkg-status-kokoro')
const pkgStatusPython = document.getElementById('pkg-status-python')
const pkgPythonVersion = document.getElementById('pkg-python-version')
const packageOverallStatus = document.getElementById('package-overall-status')
const pkgHermesStartBtn = document.getElementById('pkg-hermes-start-btn')
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
const pkgCompanionOneclickBtn = document.getElementById('pkg-companion-oneclick-btn')
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

alertInstallAllBtn?.addEventListener('click', async () => {
  navigateToSection('package')
  await runOneClickPackageInstall('all', alertInstallAllBtn)
})

// Handler tombol Nyalakan Hermes di kartu Prasyarat Home
homeStartHermesBtn?.addEventListener('click', async () => {
  homeStartHermesBtn.disabled = true
  homeStartHermesBtn.textContent = 'Menyalakan…'
  showToast('Menyalakan Hermes AI...', 'Memulai daemon hermes serve di port 9119', 'running', '⚡')
  try {
    let res = await window.hermesAvatar.startHermesServer()
    if (!res?.ok && !res?.already && typeof window.hermesAvatar?.installPackage === 'function') {
      homeStartHermesBtn.textContent = 'Memasang…'
      showToast('Memasang Hermes Otomatis...', 'Hermes belum terdeteksi — memasang di latar belakang tanpa terminal', 'running', '📦', 9000)
      res = await window.hermesAvatar.installPackage('hermes')
      await loadDetectedPathsOnce(true)
    }
    if (res?.ok || res?.already) {
      showToast('Hermes Aktif! ✅', 'Daemon AI siap di port 9119', 'success', '⚡')
    } else {
      showToast('Gagal Menyalakan Hermes', res?.error || 'Pastikan koneksi internet stabil atau buka Package Hub', 'error', '❌')
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
    let hermesRes = await window.hermesAvatar.startHermesServer()
    if (!hermesRes?.ok && !hermesRes?.already && typeof window.hermesAvatar?.installPackage === 'function') {
      prereqAutoBtn.textContent = '📦 Memasang Hermes…'
      showToast('Hermes Belum Terpasang', 'Memasang Hermes Agent otomatis di latar belakang...', 'running', '📦', 10000)
      await window.hermesAvatar.installPackage('hermes')
      await loadDetectedPathsOnce(true)
    }
    await window.hermesAvatar.startKokoroServer()
    await new Promise(r => setTimeout(r, 1200))
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

let lastServiceStatus = null
let lastDetectedPaths = null
const activeOneClickInstalls = new Set()

function updatePackageQuickButtons(s = lastServiceStatus, dp = lastDetectedPaths) {
  if (s) lastServiceStatus = s
  if (dp) lastDetectedPaths = dp
  const curStatus = lastServiceStatus || {}
  const curPaths = lastDetectedPaths || {}

  document.querySelectorAll('.pkg-quick-install-btn[data-oneclick-pkg]').forEach((btn) => {
    if (btn.dataset.installing === '1') return
    const pkgId = btn.dataset.oneclickPkg
    let running = false
    let installed = false

    if (pkgId === 'hermes') {
      running = !!curStatus.hermes
      installed = !!curPaths.hermes?.ok
    } else if (pkgId === '9router') {
      running = !!curStatus.router
      installed = !!curPaths.router?.ok
    } else if (pkgId === 'kokoro') {
      running = !!curStatus.kokoro
      installed = !!curPaths.kokoroInstalled
    } else if (pkgId === 'python') {
      running = !!curPaths.python?.ok
      installed = !!curPaths.python?.ok
    }

    if (running) {
      btn.classList.add('ready')
    } else if (installed) {
      btn.classList.remove('ready')
      btn.textContent = '⚡ Nyalakan 1-Klik'
    } else {
      btn.classList.remove('ready')
      btn.textContent = '⚡ Install 1-Klik'
    }
  })
}

function renderInstallChecklist(queueState) {
  if (!pkgInstallChecklist || !queueState || !queueState.items) return
  const order = ['python', 'hermes', '9router', 'kokoro']
  const items = order.map((id) => queueState.items[id]).filter(Boolean)

  const hasAnyProgress = Boolean(
    queueState.active ||
    items.some((it) => it.status !== 'pending' || (Number(it.percent) || 0) > 0)
  )
  const hasFailed = items.some((it) => it.status === 'failed')
  const hasDone = items.some((it) => it.status === 'done')
  const hasPending = items.some((it) => it.status === 'pending')
  const canResume = !queueState.active && (hasFailed || (hasDone && hasPending))

  if (!hasAnyProgress) {
    pkgInstallChecklist.hidden = true
    if (pkgResumeBar) pkgResumeBar.hidden = true
    if (pkgResumeInstallBtn) pkgResumeInstallBtn.hidden = true
    return
  }

  pkgInstallChecklist.hidden = false
  pkgInstallChecklist.innerHTML = ''

  const icons = {
    pending: '⏸️',
    running: '⏳',
    done: '✅',
    failed: '❌'
  }

  for (const item of items) {
    const row = document.createElement('div')
    row.className = `pkg-checklist-item ${item.status || 'pending'}`

    const left = document.createElement('div')
    left.className = 'pkg-checklist-left'

    const iconEl = document.createElement('span')
    iconEl.className = 'pkg-checklist-icon'
    iconEl.textContent = icons[item.status] || '⏸️'

    const infoEl = document.createElement('div')
    infoEl.className = 'pkg-checklist-info'

    const titleEl = document.createElement('span')
    titleEl.className = 'pkg-checklist-title'
    titleEl.textContent = item.label || item.id

    const msgEl = document.createElement('span')
    msgEl.className = 'pkg-checklist-msg'
    msgEl.textContent = item.error || item.message || 'Menunggu'
    msgEl.title = msgEl.textContent

    infoEl.appendChild(titleEl)
    infoEl.appendChild(msgEl)
    left.appendChild(iconEl)
    left.appendChild(infoEl)

    const right = document.createElement('div')
    right.className = 'pkg-checklist-status'

    const pctEl = document.createElement('span')
    pctEl.className = 'pkg-checklist-pct'
    pctEl.textContent = `${Math.max(0, Math.min(100, Number(item.percent) || 0))}%`
    right.appendChild(pctEl)

    if (item.status === 'failed' && !queueState.active) {
      const retryBtn = document.createElement('button')
      retryBtn.type = 'button'
      retryBtn.className = 'mini-btn browse'
      retryBtn.textContent = '🔄 Coba Lagi'
      retryBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        runOneClickPackageInstall(item.id, retryBtn)
      })
      right.appendChild(retryBtn)
    }

    row.appendChild(left)
    row.appendChild(right)
    pkgInstallChecklist.appendChild(row)
  }

  if (pkgResumeBar) pkgResumeBar.hidden = !canResume
  if (pkgResumeInstallBtn) pkgResumeInstallBtn.hidden = !canResume

  if (queueState.active && pkgGlobalProgressWrap) {
    pkgGlobalProgressWrap.hidden = false
    const overallPct = Math.max(0, Math.min(100, Number(queueState.overallPercent) || 0))
    if (pkgGlobalProgressPct) pkgGlobalProgressPct.textContent = `${overallPct}%`
    if (pkgGlobalProgressBar) pkgGlobalProgressBar.style.width = `${overallPct}%`
    const runningItem = items.find((it) => it.status === 'running')
    if (runningItem && pkgGlobalProgressText) {
      pkgGlobalProgressText.textContent = `[${runningItem.label}] ${runningItem.message || 'Memproses...'}`
    }
  }
}

async function syncInstallStateFromMain() {
  if (typeof window.hermesAvatar?.getInstallState !== 'function') return
  try {
    const state = await window.hermesAvatar.getInstallState()
    if (state) renderInstallChecklist(state)
  } catch (err) {
    console.warn('[Settings] Gagal sinkronisasi state instalasi:', err)
  }
}

let pkgProgressListenerAttached = false
function initPackageInstallProgressSync() {
  if (pkgProgressListenerAttached) return
  if (typeof window.hermesAvatar?.onPackageInstallProgress !== 'function') return
  pkgProgressListenerAttached = true

  window.hermesAvatar.onPackageInstallProgress((info) => {
    if (!info) return
    const pct = Math.max(0, Math.min(100, Number(info.percent) || 0))
    const msg = String(info.message || 'Memproses instalasi otomatis...')

    if (pkgGlobalProgressWrap) pkgGlobalProgressWrap.hidden = false
    if (pkgGlobalProgressText) pkgGlobalProgressText.textContent = msg
    if (pkgGlobalProgressPct) pkgGlobalProgressPct.textContent = `${pct}%`
    if (pkgGlobalProgressBar) pkgGlobalProgressBar.style.width = `${pct}%`

    const targetLogId = info.subPkg || (info.pkgId !== 'all' && info.pkgId !== 'resume' ? info.pkgId : null)
    if (targetLogId) {
      const inlineLog = document.getElementById(`pkg-inline-log-${targetLogId}`)
      if (inlineLog) inlineLog.textContent = `⏳ [${pct}%] ${msg}`
    }

    if (info.queue) {
      renderInstallChecklist(info.queue)
    }
  })
}

async function runOneClickPackageInstall(pkgId, triggerBtn = null) {
  const id = String(pkgId || '').trim().toLowerCase()
  if (!id || activeOneClickInstalls.has(id)) return
  if (typeof window.hermesAvatar?.installPackage !== 'function') {
    showToast('Fitur Belum Tersedia', 'Restart aplikasi agar modul installer aktif.', 'warning', '⚠️')
    return
  }

  activeOneClickInstalls.add(id)
  const relatedBtns = Array.from(document.querySelectorAll(`[data-oneclick-pkg="${id}"]`))
  if (triggerBtn && !relatedBtns.includes(triggerBtn)) relatedBtns.push(triggerBtn)
  if ((id === 'all' || id === 'resume') && pkgInstallAllBtn && !relatedBtns.includes(pkgInstallAllBtn)) {
    relatedBtns.push(pkgInstallAllBtn)
  }
  if (id === 'resume' && pkgResumeInstallBtn && !relatedBtns.includes(pkgResumeInstallBtn)) {
    relatedBtns.push(pkgResumeInstallBtn)
  }

  const origLabels = new Map()
  for (const b of relatedBtns) {
    origLabels.set(b, b.textContent)
    b.disabled = true
    b.dataset.installing = '1'
    b.textContent = '⏳ Memasang…'
  }

  const labels = {
    all: 'Semua Paket',
    resume: 'Lanjutkan Instalasi Tertunda',
    hermes: 'Hermes Agent',
    '9router': '9Router Gateway',
    kokoro: 'Kokoro-TTS',
    python: 'Python 3.12'
  }
  const pkgTitle = labels[id] || id

  const isBatch = id === 'all' || id === 'resume'
  if (pkgGlobalProgressWrap) pkgGlobalProgressWrap.hidden = false
  if (pkgGlobalProgressText) pkgGlobalProgressText.textContent = `Memulai ${pkgTitle} (berjalan otomatis di latar belakang)...`
  if (pkgGlobalProgressPct) pkgGlobalProgressPct.textContent = '3%'
  if (pkgGlobalProgressBar) pkgGlobalProgressBar.style.width = '3%'
  if (!isBatch) {
    const inlineLog = document.getElementById(`pkg-inline-log-${id}`)
    if (inlineLog) inlineLog.textContent = `⏳ [3%] Menyiapkan ${pkgTitle} di latar belakang...`
  }

  showToast(`Menyiapkan ${pkgTitle}...`, 'Proses berjalan senyap di latar belakang (bisa ditinggal).', 'running', '📦', 8000)

  try {
    const res = await window.hermesAvatar.installPackage(id)
    await loadDetectedPathsOnce(true)
    await refreshServiceStatus()
    if (res?.queue) {
      renderInstallChecklist(res.queue)
    } else {
      await syncInstallStateFromMain()
    }

    const inlineEl = !isBatch ? document.getElementById(`pkg-inline-log-${id}`) : null
    if (res?.ok) {
      if (pkgGlobalProgressPct) pkgGlobalProgressPct.textContent = '100%'
      if (pkgGlobalProgressBar) pkgGlobalProgressBar.style.width = '100%'
      if (pkgGlobalProgressText) pkgGlobalProgressText.textContent = `✅ ${pkgTitle} selesai dipasang dan siap digunakan!`
      if (inlineEl) inlineEl.textContent = `✅ ${pkgTitle} berhasil disiapkan & siap digunakan.`
      showToast(`${pkgTitle} Siap! ✅`, 'Instalasi & aktivasi latar belakang berhasil diselesaikan.', 'success', '🎉', 5000)
    } else {
      const errText = res?.error || 'Sebagian paket gagal. Klik "Lanjutkan (Continue)" untuk mencoba kembali bagian yang gagal.'
      if (pkgGlobalProgressText) pkgGlobalProgressText.textContent = `⚠️ ${errText}`
      if (inlineEl) inlineEl.textContent = `❌ ${errText}`
      showToast(`Pemasangan ${pkgTitle} Perlu Perhatian ⚠️`, errText, 'error', '❌', 7000)
    }
  } catch (err) {
    const errMsg = err?.message || String(err)
    const inlineEl = !isBatch ? document.getElementById(`pkg-inline-log-${id}`) : null
    if (inlineEl) inlineEl.textContent = `❌ Error: ${errMsg}`
    showToast(`Error Pemasangan ${pkgTitle}`, errMsg, 'error', '❌', 7000)
  } finally {
    activeOneClickInstalls.delete(id)
    for (const b of relatedBtns) {
      delete b.dataset.installing
      b.disabled = false
      b.textContent = origLabels.get(b) || '⚡ Install 1-Klik'
    }
    updatePackageQuickButtons()
  }
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
    const needRouter = !!settings.routerChecked
    const allReady = s.hermes && (!needRouter || s.router) && isTtsOk
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

    updatePackageQuickButtons(s, null)
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
        : 'Belum terpasang. Klik tombol ⚡ Install 1-Klik untuk pemasangan otomatis.'
    }
    if (pkgHermesSourceBadge) {
      pkgHermesSourceBadge.textContent = dp.hermes?.ok
        ? (dp.hermes.source || 'Terdeteksi')
        : 'Belum Terpasang ❌'
      pkgHermesSourceBadge.className = `badge ${dp.hermes?.ok ? (dp.hermes.isCustom ? 'info' : 'ready') : 'warning'}`
    }
    if (pkgHermesStartBtn) {
      pkgHermesStartBtn.style.display = dp.hermes?.ok ? 'inline-block' : 'none'
    }
    if (pkgHermesResetBtn) {
      pkgHermesResetBtn.style.display = dp.hermes?.isCustom ? 'inline-block' : 'none'
    }

    // 4. 9Router Status & Path
    if (pkgRouterLocation) {
      pkgRouterLocation.textContent = dp.router?.ok
        ? dp.router.cmd
        : 'Belum terpasang. Klik tombol ⚡ Install 1-Klik untuk pemasangan otomatis.'
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
    updatePackageQuickButtons(null, dp)
  } catch (err) {
    console.warn('[Settings] Gagal memuat status deteksi path:', err)
  }
}

function bindPackageActions() {
  // 0. Tombol Instalasi 1-Klik Otomatis (Semua Paket, Continue/Resume & Per-Paket)
  pkgInstallAllBtn?.addEventListener('click', (e) => {
    e.stopPropagation()
    runOneClickPackageInstall('all', pkgInstallAllBtn)
  })

  pkgResumeInstallBtn?.addEventListener('click', (e) => {
    e.stopPropagation()
    runOneClickPackageInstall('resume', pkgResumeInstallBtn)
  })

  document.querySelectorAll('[data-oneclick-pkg]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const pkgId = btn.dataset.oneclickPkg
      if (pkgId) {
        runOneClickPackageInstall(pkgId, btn)
      }
    })
  })

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

  // 5b. Tombol Kontrol Jalur Kustom & Start Senyap (Hermes, 9Router, Kokoro, Python)
  pkgHermesStartBtn?.addEventListener('click', async () => {
    pkgHermesStartBtn.disabled = true
    showToast('Menyalakan Hermes...', 'Memulai daemon hermes serve di port 9119...', 'running', '⚡', 7000)
    try {
      const res = await window.hermesAvatar?.startHermesServer?.()
      if (res?.ok || res?.already) {
        showToast('Hermes Aktif! 🟢', 'Port 9119 online dan siap melayani AI', 'success', '⚡', 4500)
      } else {
        showToast('Gagal Menyalakan Hermes', res?.error || 'Port 9119 tidak aktif', 'error', '❌', 6000)
      }
      await refreshServiceStatus()
    } catch (err) {
      showToast('Error Hermes', err.message, 'error', '❌')
    } finally {
      pkgHermesStartBtn.disabled = false
    }
  })

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
  pkgCompanionOneclickBtn?.addEventListener('click', async () => {
    pkgCompanionOneclickBtn.disabled = true
    try {
      const res = await window.hermesAvatar.openPackageFolder('chrome-extension')
      if (res?.ok && res?.path) {
        try {
          await navigator.clipboard.writeText(res.path)
        } catch {}
        showToast(
          'Folder Siap & Path Tersalin! ⚡',
          'Di Chrome/Edge, aktifkan Developer mode → Load unpacked → Tempel path folder (Ctrl+V)',
          'success',
          '🌐',
          8000
        )
        if (pkgBridgeLog) {
          pkgBridgeLog.innerHTML = `✅ Folder ekstensi dibuka &amp; path disalin ke clipboard: <code>${escapeHtml(res.path)}</code><br>👉 Buka <code>chrome://extensions</code> → aktifkan <strong>Developer mode</strong> → klik <strong>Load unpacked</strong> → tempel (<kbd>Ctrl+V</kbd>) lalu klik Select.`
        }
      } else {
        showToast('Gagal Menyiapkan Ekstensi', res?.error || 'Folder tidak ditemukan', 'error', '❌')
      }
    } catch (err) {
      showToast('Error Ekstensi', err.message, 'error', '❌')
    } finally {
      pkgCompanionOneclickBtn.disabled = false
    }
  })

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

    // Bila menggunakan Kokoro TTS dan servernya belum aktif, coba nyalakan otomatis; fallback aman ke Edge-TTS
    if (settings.tts?.provider === 'kokoro' && !s.kokoro) {
      showToast('Menyiapkan Vokal Kokoro...', 'Menyalakan server Kokoro TTS...', 'running', '🎙️')
      await window.hermesAvatar.startKokoroServer()
      await new Promise((r) => setTimeout(r, 1400))
      s = await window.hermesAvatar.getServiceStatus()
      if (!s.kokoro) {
        settings.tts.provider = 'edge'
        if (/^[a-z]{2}_/i.test(settings.tts.voice || '')) {
          settings.tts.voice = 'id-ID-GadisNeural'
        }
        saveSettings(settings)
        loadVoiceUI()
        showToast('Menggunakan Suara Cloud Otomatis 🔊', 'Layanan suara lokal belum terpasang; beralih otomatis ke Edge-TTS agar avatar langsung siap bicara.', 'info', '🔊', 4500)
      }
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
  updateOAuthHubStatusBadges()
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
      btn.disabled = true
      const original = btn.textContent
      btn.textContent = '⏳ Mengaktifkan…'
      try {
        await activateLlmProvider(p)
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
      if (settings.llm.activeId === id) {
        settings.llm.activeId = settings.llm.providers[0]?.id || null
      }
      if (editingProviderId === id) resetProviderForm()
      saveSettings(settings)
      syncLlmProvidersToDisk()
      renderLlmList()
      await refreshModelOptions()
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
      openLlmSubpanel('add-provider')
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

async function activateLlmProvider(p) {
  if (!p?.model) {
    statusEl.textContent = '⚠️ Model kosong.'
    return false
  }
  showToast('Mengaktifkan Provider...', `Menyetel ${p.name} (${p.model}) ke Hermes...`, 'running', '🧠')
  const res = await window.hermesAvatar.setLlmProvider({
    name: p.name,
    baseUrl: p.baseUrl || 'http://127.0.0.1:20128/v1',
    apiKey: p.apiKey || '',
    model: p.model
  })
  if (!res.ok) {
    showToast('Gagal Mengaktifkan Provider', res.error || 'Terjadi kesalahan konfigurasi', 'error', '❌', 6000)
    throw new Error(res.error)
  }

  if (p.model) {
    p.models = Array.from(new Set([...(Array.isArray(p.models) ? p.models : []), p.model].filter(Boolean)))
  }
  settings.llm.activeId = p.id
  saveSettings(settings)
  syncLlmProvidersToDisk()

  if (res.warning) {
    statusEl.textContent = `✓ Provider "${p.name}" disimpan, tetapi: ${res.warning}`
    showToast('Perhatian Restart Hermes ⚠️', res.warning, 'warning', '⚠️', 6000)
  } else {
    statusEl.textContent = `✓ Provider "${p.name}" diaktifkan (${p.model}).`
    showToast('Provider Diaktifkan! ✅', `${p.name} kini aktif sebagai otak percakapan avatar (${p.model})`, 'success', '✨', 4500)
  }

  updateOAuthHubStatusBadges()
  renderLlmList()
  await refreshLlmActive()
  await refreshModelOptions()
  await refreshServiceStatus()
  await refreshProviderQuota(false)
  return true
}

let cachedQuotaData = { accounts: [], modelGroups: [] }
let quotaViewMode = 'both'
let quotaHideExpired = false
let quotaAutoRefreshEnabled = true
let quotaCountdownSec = 55
let quotaTimerStarted = false
const QUOTAS_PER_PAGE = 10
const accountQuotaPages = new Map()

function getQuotaBarColor(pct) {
  if (pct < 30) return 'var(--red, #ff453a)'
  if (pct <= 70) return 'var(--orange, #ff9f0a)'
  return 'var(--green, #30d158)'
}

function getQuotaColorClass(pct) {
  const n = Number(pct ?? 100)
  if (n < 30) return 'low'
  if (n <= 70) return 'mid'
  return ''
}

function renderDonutSvg(pct) {
  const safePct = Math.max(0, Math.min(100, Number(pct) || 0))
  const circumference = 2 * Math.PI * 11
  const offset = circumference * (1 - safePct / 100)
  const cls = getQuotaColorClass(safePct)
  return `<svg class="quota-donut-svg" viewBox="0 0 28 28" aria-hidden="true">
    <circle class="quota-donut-bg" cx="14" cy="14" r="11"></circle>
    <circle class="quota-donut-fg ${cls}" cx="14" cy="14" r="11" stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"></circle>
  </svg>`
}

function applyQuotaViewVisibility() {
  const accSec = document.getElementById('quota-accounts-section')
  const ringSec = document.getElementById('quota-rings-section')
  if (accSec) accSec.style.display = quotaViewMode === 'rings' ? 'none' : 'block'
  if (ringSec) ringSec.style.display = quotaViewMode === 'cards' ? 'none' : 'block'
}

function syncQuotaProviderFilterOptions(accounts) {
  const sel = document.getElementById('quota-filter-provider')
  if (!sel) return
  const prev = sel.value || 'all'
  const labels = Array.from(new Set((accounts || []).map((a) => a.providerLabel).filter(Boolean)))
  sel.innerHTML = '<option value="all">All Providers</option>' + labels
    .map((lbl) => `<option value="${escapeHtml(lbl)}">${escapeHtml(lbl)}</option>`)
    .join('')
  sel.value = labels.includes(prev) ? prev : 'all'
}

function renderRouterAccountCards() {
  const grid = document.getElementById('quota-accounts-grid')
  if (!grid) return
  const providerVal = document.getElementById('quota-filter-provider')?.value || 'all'
  const statusVal = document.getElementById('quota-filter-status')?.value || 'all'

  let list = [...(cachedQuotaData.accounts || [])]
  if (providerVal !== 'all') {
    list = list.filter((a) => a.providerLabel === providerVal)
  }
  if (statusVal === 'available') {
    list = list.filter((a) => !a.isExpiredOrInvalid)
  } else if (statusVal === 'expired') {
    list = list.filter((a) => a.isExpiredOrInvalid)
  }
  if (quotaHideExpired) {
    list = list.filter((a) => !a.isExpiredOrInvalid)
  }

  // Urutkan akun sehat/tersedia di atas agar cepat terlihat, pertahankan urutan lain dari backend
  list.sort((a, b) => Number(a.isExpiredOrInvalid) - Number(b.isExpiredOrInvalid))

  if (list.length === 0) {
    grid.innerHTML = '<p class="hint" style="padding:10px 2px;">Tidak ada akun yang cocok dengan filter saat ini.</p>'
    return
  }

  grid.innerHTML = list.map((acc) => {
    const iconCls = acc.authType === 'oauth' ? 'oauth' : ''
    const iconGlyph = acc.authType === 'oauth' ? '🔗' : '🤖'
    const pillCls = acc.isActive ? 'on' : ''
    const quotas = Array.isArray(acc.quotas) ? acc.quotas : []
    const totalQuotas = acc.totalQuotas || quotas.length
    let bodyHtml = ''

    if (acc.isExpiredOrInvalid) {
      const msg = escapeHtml(acc.errorMessage || `${acc.providerLabel} credential invalid or expired.`)
      bodyHtml = `<div class="acc-expired-box">${msg}</div><div class="acc-expired-footer">${msg}</div>`
    } else if (quotas.length === 0) {
      const msg = escapeHtml(acc.errorMessage || 'Belum ada data kuota tersedia untuk koneksi ini.')
      bodyHtml = `<div class="acc-expired-box">${msg}</div>`
    } else {
      const totalPages = Math.max(1, Math.ceil(totalQuotas / QUOTAS_PER_PAGE))
      let curPage = Number(accountQuotaPages.get(acc.id) || 1)
      if (!Number.isFinite(curPage) || curPage < 1) curPage = 1
      if (curPage > totalPages) curPage = totalPages
      accountQuotaPages.set(acc.id, curPage)

      const startIdx = (curPage - 1) * QUOTAS_PER_PAGE
      const pageQuotas = quotas.slice(startIdx, startIdx + QUOTAS_PER_PAGE)

      const subheadHtml = `<div class="acc-quotas-subhead">
        <span>${totalQuotas} quota${totalQuotas > 1 ? 's' : ''}</span>
        ${acc.plan ? `<span class="acc-plan-tag" title="${escapeHtml(acc.plan)}">${escapeHtml(acc.plan)}</span>` : ''}
      </div>`

      const rows = pageQuotas.map((q) => {
        const pct = Math.max(0, Math.min(100, Number(q.remainingPct ?? 100)))
        const cls = getQuotaColorClass(pct)
        const usedText = q.usedFormatted ?? String(q.used ?? 0)
        const limitText = q.limitFormatted ?? String(q.limit ?? 0)
        const metaRight = q.unlimited ? 'Unlimited' : `${pct}%`
        const metaLeft = q.unlimited ? `${usedText} used · Unlimited` : `${usedText} / ${limitText}`
        return `<div class="acc-quota-row">
          <div class="acc-quota-label-col" title="${escapeHtml(q.label)}">
            <span class="acc-dot ${cls}"></span>
            <span>${escapeHtml(q.label)}</span>
          </div>
          <div class="acc-bar-col">
            <div class="acc-bar-track"><div class="acc-bar-fill ${cls}" style="width:${pct}%"></div></div>
            <div class="acc-bar-meta">
              <span>${escapeHtml(metaLeft)}</span>
              <span class="acc-pct-text ${cls}">${escapeHtml(metaRight)}</span>
            </div>
          </div>
          <div class="acc-reset-text">${escapeHtml(q.resetText || '')}</div>
        </div>`
      }).join('')

      const shownStart = startIdx + 1
      const shownEnd = Math.min(startIdx + QUOTAS_PER_PAGE, totalQuotas)
      const paginationHtml = totalPages > 1
        ? `<div class="acc-pagination-box">
            <div class="acc-pagination-meta">
              <span>Showing ${shownStart}-${shownEnd} of ${totalQuotas}</span>
              <span>Page ${curPage} / ${totalPages}</span>
            </div>
            <div class="acc-pagination-btns">
              <button type="button" class="acc-page-btn" data-acc-id="${escapeHtml(acc.id)}" data-page="${curPage - 1}" ${curPage <= 1 ? 'disabled' : ''}>Prev</button>
              <button type="button" class="acc-page-btn" data-acc-id="${escapeHtml(acc.id)}" data-page="${curPage + 1}" ${curPage >= totalPages ? 'disabled' : ''}>Next</button>
            </div>
          </div>`
        : ''

      bodyHtml = `${subheadHtml}<div class="acc-quotas-list">${rows}</div>${paginationHtml}`
    }

    return `<div class="router-acc-card ${acc.isExpiredOrInvalid ? 'expired' : ''}">
      <div class="router-acc-header">
        <div class="router-acc-identity">
          <span class="router-acc-icon ${iconCls}">${iconGlyph}</span>
          <div class="router-acc-titles">
            <span class="router-acc-provider">${escapeHtml(acc.providerLabel)}</span>
            <span class="router-acc-name">${escapeHtml(acc.accountName)}</span>
          </div>
        </div>
        <div class="router-acc-actions">
          <button type="button" class="acc-mini-refresh" title="Segarkan status akun">↻</button>
          <span class="acc-status-pill ${pillCls}" title="${acc.isActive ? 'Aktif' : 'Nonaktif'}"></span>
        </div>
      </div>
      ${bodyHtml}
    </div>`
  }).join('')

  grid.querySelectorAll('.acc-mini-refresh').forEach((btn) => {
    btn.addEventListener('click', () => refreshProviderQuota(true))
  })

  grid.querySelectorAll('.acc-page-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const accId = btn.dataset.accId
      const nextPage = Number(btn.dataset.page || 1)
      if (accId && Number.isFinite(nextPage)) {
        accountQuotaPages.set(accId, nextPage)
        renderRouterAccountCards()
      }
    })
  })
}

function renderOAuthModelRings() {
  const container = document.getElementById('quota-rings-container')
  if (!container) return
  const groups = cachedQuotaData.modelGroups || []
  if (groups.length === 0) {
    container.innerHTML = ''
    return
  }

  container.innerHTML = groups.map((grp) => {
    const rowsHtml = (grp.rows || []).map((r) => {
      const pct = Math.max(0, Math.min(100, Number(r.remainingPct ?? 100)))
      const cls = getQuotaColorClass(pct)
      return `<div class="oauth-limit-row">
        <div class="oauth-limit-texts">
          <span class="oauth-limit-title">${escapeHtml(r.label)}</span>
          <span class="oauth-limit-sub">${escapeHtml(r.subtext || '')}</span>
        </div>
        <div class="oauth-limit-right">
          <span class="oauth-limit-pct ${cls}">${pct}%</span>
          ${renderDonutSvg(pct)}
        </div>
      </div>`
    }).join('')

    return `<div class="oauth-model-group">
      <div class="oauth-group-title">
        <span>${escapeHtml(grp.title)}</span>
        <span class="oauth-group-info" title="${escapeHtml(grp.tooltip || '')}">ⓘ</span>
      </div>
      <div class="oauth-limit-card">${rowsHtml}</div>
    </div>`
  }).join('')
}

async function refreshProviderQuota(interactive = false) {
  const tierEl = document.getElementById('quota-tier-label')
  const complianceEl = document.getElementById('quota-compliance-badge')
  const summaryEl = document.getElementById('quota-summary-text')
  const metricsEl = document.getElementById('quota-metrics-row')
  const barEl = document.getElementById('quota-progress-bar')
  const btnEl = document.getElementById('quota-refresh-btn')
  if (!tierEl || !summaryEl) return

  const providers = settings.llm?.providers || []
  const activeProv = providers.find((p) => p.id === settings.llm?.activeId) || providers[0]

  if (btnEl) {
    btnEl.disabled = true
    btnEl.textContent = 'Memeriksa…'
  }
  quotaCountdownSec = 55

  try {
    const res = await window.hermesAvatar?.checkProviderQuota?.(
      activeProv?.baseUrl || '',
      activeProv?.apiKey || ''
    )

    if (res && Array.isArray(res.accounts)) {
      cachedQuotaData = {
        accounts: res.accounts || [],
        modelGroups: res.modelGroups || []
      }
      syncQuotaProviderFilterOptions(cachedQuotaData.accounts)
      renderRouterAccountCards()
      renderOAuthModelRings()
      applyQuotaViewVisibility()
    }

    if (!res || !res.ok) {
      if (res?.unconfigured) {
        tierEl.textContent = 'Belum Ada Akun'
        tierEl.className = 'badge'
        if (complianceEl) complianceEl.textContent = 'Siap Dihubungkan'
        summaryEl.textContent = 'Gunakan tombol Login 1-Klik OpenRouter (Gratis) atau Hubungkan 9Router Lokal di bawah.'
        if (metricsEl) metricsEl.textContent = 'Belum ada provider AI yang tersimpan.'
      } else {
        const provLabel = activeProv?.name || res?.configuredProvider || 'Hermes Config'
        const modelLabel = activeProv?.model || res?.configuredModel || '-'
        tierEl.textContent = 'Tidak Terjangkau'
        tierEl.className = 'badge warning'
        if (complianceEl) complianceEl.textContent = 'Perlu Cek Koneksi'
        summaryEl.textContent = res?.error || 'Tidak dapat menghubungi endpoint provider saat ini.'
        if (metricsEl) metricsEl.textContent = `Provider aktif: ${provLabel} (${modelLabel})`
        if (interactive) {
          showToast('Gagal Memeriksa Kuota', res?.error || 'Endpoint tidak merespons', 'warning', '⚠️')
        }
      }
      if (barEl) barEl.style.width = '0%'
      const quotaBadgeEl = document.getElementById('llm-menu-badge-quota')
      if (quotaBadgeEl) {
        quotaBadgeEl.className = 'format-count-pill off'
        quotaBadgeEl.textContent = '⚡ Cek Kuota'
      }
      return
    }

    const provDisplayName = activeProv?.name || res.configuredProvider || (res.providerType === '9router' ? '9Router Lokal' : 'Hermes Config')
    const provDisplayModel = activeProv?.model || res.configuredModel || '-'

    tierEl.textContent = res.tierLabel || 'Aktif'
    tierEl.className = res.isFreeTier || res.providerType === 'openrouter' ? 'badge ready' : 'badge info'
    if (complianceEl) complianceEl.textContent = res.complianceBadge || 'Patuh ToS'
    summaryEl.textContent = res.summary || 'Provider siap digunakan.'

    let pct = 100
    let metrics = `Provider: ${provDisplayName} · Model: ${provDisplayModel}`

    if (res.providerType === 'openrouter' && typeof res.limit === 'number' && res.limit > 0 && typeof res.limitRemaining === 'number') {
      pct = Math.max(0, Math.min(100, Math.round((res.limitRemaining / res.limit) * 100)))
      metrics = `Sisa kredit: $${res.limitRemaining.toFixed(2)} / $${res.limit.toFixed(2)} · Pemakaian: $${(res.usage ?? 0).toFixed(2)}`
    } else if (res.rateLimits?.reqRemaining !== null && res.rateLimits?.reqRemaining !== undefined && res.rateLimits?.reqLimit) {
      pct = Math.max(0, Math.min(100, Math.round((res.rateLimits.reqRemaining / res.rateLimits.reqLimit) * 100)))
      const tokPart = res.rateLimits.tokRemaining !== null && res.rateLimits.tokRemaining !== undefined
        ? ` · Sisa token: ${res.rateLimits.tokRemaining}`
        : ''
      metrics = `Sisa request: ${res.rateLimits.reqRemaining}/${res.rateLimits.reqLimit}${tokPart}`
    } else if (res.providerType === '9router') {
      pct = typeof res.primaryQuotaPct === 'number'
        ? res.primaryQuotaPct
        : (res.modelsCount > 0 ? 100 : 15)
      const accPart = res.primaryAccountSummary ? ` · ${res.primaryAccountSummary}` : ''
      metrics = `Jalur 9Router Lokal · Model aktif: ${provDisplayModel} · ${res.modelsCount ?? 0} model${accPart}`
    } else {
      const hintPart = res.dailyLimitHint ? ` · Batas gratis ~${res.dailyLimitHint} req/hari` : ''
      const modelPart = typeof res.modelsCount === 'number' ? ` · ${res.modelsCount} model tersedia` : ''
      metrics = `Provider: ${provDisplayName} (${provDisplayModel})${modelPart}${hintPart}`
    }

    if (barEl) {
      barEl.style.width = `${pct}%`
      barEl.style.background = getQuotaBarColor(pct)
    }
    if (metricsEl) metricsEl.textContent = metrics

    const quotaBadgeEl = document.getElementById('llm-menu-badge-quota')
    if (quotaBadgeEl) {
      const accCount = Array.isArray(res.accounts) ? res.accounts.length : 0
      const pctShow = typeof res.primaryQuotaPct === 'number' ? res.primaryQuotaPct : pct
      quotaBadgeEl.className = 'format-count-pill on'
      quotaBadgeEl.textContent = accCount > 0
        ? `🟢 ${accCount} Akun · Sisa ${pctShow}%`
        : `🟢 Sisa ${pctShow}%`
    }
    updateOAuthHubStatusBadges()
    if (interactive) {
      showToast('Status Kuota Diperbarui 📊', res.summary, 'success', '📊')
    }
  } catch (err) {
    tierEl.textContent = 'Perlu Muat Ulang'
    tierEl.className = 'badge warning'
    if (complianceEl) complianceEl.textContent = 'Info'
    summaryEl.textContent = err?.message || 'Terjadi kesalahan saat memeriksa kuota.'
    if (barEl) barEl.style.width = '0%'
    if (interactive) {
      showToast('Gagal Cek Kuota', err?.message || String(err), 'error', '❌')
    }
  } finally {
    if (btnEl) {
      btnEl.disabled = false
      btnEl.textContent = 'Cek Kuota ↻'
    }
  }
}

function openLlmSubpanel(subId) {
  const menuView = document.getElementById('llm-menu-view')
  const detailView = document.getElementById('llm-detail-view')
  if (!menuView || !detailView) return

  menuView.classList.add('hidden')
  detailView.classList.remove('hidden')

  detailView.querySelectorAll('.llm-subpanel').forEach((panelEl) => {
    const isTarget = panelEl.dataset.subpanel === subId
    panelEl.classList.toggle('hidden', !isTarget)
  })

  const contentEl = document.querySelector('.content')
  if (contentEl) contentEl.scrollTop = 0

  if (subId === 'quota-monitor') {
    refreshProviderQuota(false)
  }
}

function closeLlmSubpanel() {
  const menuView = document.getElementById('llm-menu-view')
  const detailView = document.getElementById('llm-detail-view')
  if (!menuView || !detailView) return

  detailView.classList.add('hidden')
  detailView.querySelectorAll('.llm-subpanel').forEach((panelEl) => {
    panelEl.classList.add('hidden')
  })
  menuView.classList.remove('hidden')

  const contentEl = document.querySelector('.content')
  if (contentEl) contentEl.scrollTop = 0

  document.querySelectorAll('#llm-sub-menu .format-item[data-llm-sub]').forEach((item) => {
    const triggerOpen = () => {
      const subId = item.dataset.llmSub
      if (subId) openLlmSubpanel(subId)
    }
    item.addEventListener('click', triggerOpen)
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        triggerOpen()
      }
    })
  })

  document.getElementById('llm-back-btn')?.addEventListener('click', () => {
    closeLlmSubpanel()
  })

  document.getElementById('btn-jump-quota-from-router')?.addEventListener('click', () => {
    openLlmSubpanel('quota-monitor')
  })

  document.getElementById('btn-jump-add-provider')?.addEventListener('click', () => {
    resetProviderForm()
    openLlmSubpanel('add-provider')
  })

  updateOAuthHubStatusBadges()
}

function updateOAuthHubStatusBadges() {
  const providers = settings.llm?.providers || []
  const activeId = settings.llm?.activeId || (providers[0] ? providers[0].id : null)
  const hubTargets = {
    openrouter: ['https://openrouter.ai'],
    gemini: ['https://generativelanguage.googleapis.com'],
    groq: ['https://api.groq.com'],
    mistral: ['https://api.mistral.ai'],
    '9router': ['http://127.0.0.1:20128', 'http://localhost:20128']
  }

  let oauthActive = false
  let routerSavedOrActive = false

  for (const [key, origins] of Object.entries(hubTargets)) {
    const el = document.getElementById(`hub-status-${key}`)
    const matches = providers.filter((prov) => {
      const origin = getUrlOrigin(prov.baseUrl)
      if (origin && origins.includes(origin)) return true
      return key === '9router' && prov.authType === '9router'
    })
    const isActive = matches.some((prov) => prov.id === activeId)
    if (key === '9router' && (isActive || matches.length > 0)) {
      routerSavedOrActive = true
    } else if (key !== '9router' && isActive) {
      oauthActive = true
    }

    if (!el) continue
    if (isActive) {
      el.className = 'badge ready'
      el.textContent = 'Aktif ✓'
    } else if (matches.length > 0) {
      el.className = 'badge info'
      el.textContent = 'Tersimpan'
    } else {
      el.className = 'badge'
      el.textContent = 'Siap Login'
    }
  }

  const savedMenuBadge = document.getElementById('llm-menu-badge-saved')
  if (savedMenuBadge) {
    savedMenuBadge.className = `format-count-pill ${providers.length > 0 ? 'on' : 'off'}`
    savedMenuBadge.textContent = `${providers.length} Tersimpan`
  }

  const oauthMenuBadge = document.getElementById('llm-menu-badge-oauth')
  if (oauthMenuBadge) {
    oauthMenuBadge.className = 'format-count-pill on'
    oauthMenuBadge.textContent = oauthActive ? '🟢 OAuth Aktif' : '🛡️ 4 Penyedia Gratis'
  }

  const hasLiveRouterAcc = (cachedQuotaData?.accounts || []).some(
    (a) => a.source === '9router' && !a.isExpiredOrInvalid
  )
  const routerMenuBadge = document.getElementById('llm-menu-badge-router')
  if (routerMenuBadge) {
    if (routerSavedOrActive || hasLiveRouterAcc) {
      routerMenuBadge.className = 'format-count-pill on'
      routerMenuBadge.textContent = '🟢 Aktif (:20128)'
    } else {
      routerMenuBadge.className = 'format-count-pill off'
      routerMenuBadge.textContent = 'Siap Hubungkan'
    }
  }
}

function syncLlmProvidersToDisk() {
  try {
    window.hermesAvatar?.saveLlmProviders?.({
      activeId: settings.llm?.activeId || null,
      providers: settings.llm?.providers || []
    }).catch(() => {})
  } catch { /* ignore */ }
}

async function initPersistentLlmProviders() {
  try {
    const res = await window.hermesAvatar?.loadLlmProviders?.()
    if (!res?.ok || !Array.isArray(res.providers)) return

    settings.llm = settings.llm || { providers: [] }
    const localList = Array.isArray(settings.llm.providers) ? settings.llm.providers : []
    const normUrl = (u) => String(u || '').trim().replace(/\/+$/, '').toLowerCase()

    const merged = []
    const findMatch = (candidate) => merged.find(
      (x) => (candidate.id && x.id === candidate.id) ||
        (normUrl(x.baseUrl) === normUrl(candidate.baseUrl) &&
          String(x.name || '').trim().toLowerCase() === String(candidate.name || '').trim().toLowerCase())
    )

    for (const item of [...res.providers, ...localList]) {
      if (!item || typeof item !== 'object') continue
      const existing = findMatch(item)
      const itemModels = [item.model, ...(Array.isArray(item.models) ? item.models : [])].filter(Boolean)
      if (existing) {
        existing.apiKey = item.apiKey || existing.apiKey || ''
        existing.model = existing.model || item.model || ''
        existing.authType = existing.authType || item.authType || ''
        existing.models = Array.from(new Set([...(existing.models || []), ...itemModels]))
      } else {
        merged.push({
          id: String(item.id || Date.now().toString(36)),
          name: item.name || 'Provider AI',
          baseUrl: item.baseUrl || '',
          apiKey: item.apiKey || '',
          model: item.model || itemModels[0] || '',
          models: Array.from(new Set(itemModels)),
          authType: item.authType || ''
        })
      }
    }

    settings.llm.providers = merged
    if (!settings.llm.activeId && res.activeId) {
      settings.llm.activeId = res.activeId
    }
    if (settings.llm.activeId && !merged.some((p) => p.id === settings.llm.activeId)) {
      settings.llm.activeId = merged[0]?.id || null
    }
    saveSettings(settings)
    syncLlmProvidersToDisk()
    updateOAuthHubStatusBadges()
    renderLlmList()
    refreshLlmActive()
    refreshModelOptions()
  } catch (err) {
    console.warn('[initPersistentLlmProviders] info:', err?.message || err)
  }
}

function upsertLlmProvider(entry) {
  settings.llm = settings.llm || { providers: [] }
  settings.llm.providers = settings.llm.providers || []
  const normUrl = (u) => String(u || '').trim().replace(/\/+$/, '').toLowerCase()
  const existing = settings.llm.providers.find(
    (x) => normUrl(x.baseUrl) === normUrl(entry.baseUrl) &&
      (!entry.name || !x.name || x.name.toLowerCase() === entry.name.toLowerCase()) &&
      (!entry.authType || !x.authType || x.authType === entry.authType)
  )
  if (existing) {
    existing.name = entry.name
    if (entry.apiKey) existing.apiKey = entry.apiKey
    existing.model = entry.model || existing.model
    existing.models = Array.from(new Set([...(existing.models || []), existing.model, entry.model].filter(Boolean)))
    existing.authType = entry.authType || existing.authType
    saveSettings(settings)
    syncLlmProvidersToDisk()
    return existing
  }
  const models = Array.from(new Set([entry.model, ...(Array.isArray(entry.models) ? entry.models : [])].filter(Boolean)))
  const created = { id: Date.now().toString(36), ...entry, models }
  settings.llm.providers.push(created)
  saveSettings(settings)
  syncLlmProvidersToDisk()
  return created
}

function initDualTrackActions() {
  const oauthBtn = document.getElementById('btn-oauth-openrouter')
  const geminiKeyBtn = document.getElementById('btn-get-gemini-key')
  const quickRouterBtn = document.getElementById('btn-quick-9router')
  const openRouterWebBtn = document.getElementById('btn-open-9router-web')
  const quotaRefreshBtn = document.getElementById('quota-refresh-btn')

  quotaRefreshBtn?.addEventListener('click', () => {
    refreshProviderQuota(true)
  })

  document.querySelectorAll('#quota-view-tabs .quota-tab-btn').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      quotaViewMode = tabBtn.dataset.quotaView || 'both'
      document.querySelectorAll('#quota-view-tabs .quota-tab-btn').forEach((b) => {
        b.classList.toggle('active', b === tabBtn)
      })
      applyQuotaViewVisibility()
    })
  })

  document.getElementById('quota-filter-provider')?.addEventListener('change', renderRouterAccountCards)
  document.getElementById('quota-filter-status')?.addEventListener('change', renderRouterAccountCards)

  const hideExpiredBtn = document.getElementById('quota-toggle-empty-btn')
  hideExpiredBtn?.addEventListener('click', () => {
    quotaHideExpired = !quotaHideExpired
    hideExpiredBtn.classList.toggle('active', quotaHideExpired)
    hideExpiredBtn.textContent = quotaHideExpired ? '✅ Show All' : '🚫 Hide Expired'
    renderRouterAccountCards()
  })

  const autoRefreshBtn = document.getElementById('quota-autorefresh-btn')
  if (autoRefreshBtn) {
    autoRefreshBtn.classList.toggle('active', quotaAutoRefreshEnabled)
    autoRefreshBtn.addEventListener('click', () => {
      quotaAutoRefreshEnabled = !quotaAutoRefreshEnabled
      autoRefreshBtn.classList.toggle('active', quotaAutoRefreshEnabled)
    })
  }

  if (!quotaTimerStarted) {
    quotaTimerStarted = true
    setInterval(() => {
      const countdownEl = document.getElementById('quota-countdown')
      const llmPanelActive = document.getElementById('panel-llm')?.classList.contains('active')
      if (!quotaAutoRefreshEnabled || document.visibilityState === 'hidden') return
      if (!llmPanelActive) return
      quotaCountdownSec--
      if (quotaCountdownSec <= 0) {
        quotaCountdownSec = 55
        refreshProviderQuota(false)
      }
      if (countdownEl) countdownEl.textContent = String(quotaCountdownSec)
    }, 1000)
  }

  applyQuotaViewVisibility()

  oauthBtn?.addEventListener('click', async () => {
    oauthBtn.disabled = true
    const origText = oauthBtn.textContent
    oauthBtn.textContent = '⏳ Menunggu Login di Browser…'
    showToast('Login OpenRouter OAuth 🔗', 'Selesaikan otorisasi di browser Anda untuk menghubungkan akun secara otomatis.', 'running', '🔗', 6000)
    try {
      const res = await window.hermesAvatar?.startOAuthLogin?.('openrouter')
      if (!res?.ok || !res.provider) {
        throw new Error(res?.error || 'Login OAuth dibatalkan atau gagal')
      }
      const savedProv = upsertLlmProvider(res.provider)
      await activateLlmProvider(savedProv)
      showToast('Akun OpenRouter Terhubung! 🎉', 'Login OAuth berhasil dan langsung diaktifkan.', 'success', '✨', 5000)
    } catch (err) {
      statusEl.textContent = `✗ OAuth gagal: ${err?.message || err}`
      showToast('Login OAuth Gagal', err?.message || String(err), 'error', '❌', 6000)
    } finally {
      oauthBtn.disabled = false
      oauthBtn.textContent = origText
    }
  })

  geminiKeyBtn?.addEventListener('click', () => {
    document.querySelector('#llm-preset-grid [data-preset="gemini"]')?.click()
    window.hermesAvatar?.openExternalUrl?.('https://aistudio.google.com/app/apikey')
    showToast('Google AI Studio Dibuka 🔑', 'Buat API key gratis di browser, lalu tempel di kolom API Key.', 'info', '🔑', 5000)
  })

  quickRouterBtn?.addEventListener('click', async () => {
    quickRouterBtn.disabled = true
    const origText = quickRouterBtn.textContent
    quickRouterBtn.textContent = '⏳ Menghubungkan 9Router…'
    showToast('Menghubungkan 9Router Lokal...', 'Mendeteksi service 9Router di port 20128...', 'running', '⚡')
    try {
      await window.hermesAvatar?.startRouter?.().catch(() => {})
      const baseUrl = 'http://127.0.0.1:20128/v1'
      const epRes = await window.hermesAvatar?.fetchEndpointModels?.(baseUrl, '')
      if (!epRes?.ok) {
        throw new Error(epRes?.error || '9Router tidak aktif di port 20128. Pastikan 9Router sudah terpasang dan berjalan.')
      }
      const detectedModel = Array.isArray(epRes.models) && epRes.models.length > 0 ? epRes.models[0] : 'default'
      const savedProv = upsertLlmProvider({
        name: '9Router Lokal',
        baseUrl,
        apiKey: '',
        model: detectedModel,
        authType: '9router'
      })
      await activateLlmProvider(savedProv)
    } catch (err) {
      statusEl.textContent = `✗ 9Router gagal terhubung: ${err?.message || err}`
      showToast('9Router Belum Aktif', err?.message || String(err), 'warning', '⚠️', 6000)
    } finally {
      quickRouterBtn.disabled = false
      quickRouterBtn.textContent = origText
    }
  })

  openRouterWebBtn?.addEventListener('click', () => {
    window.hermesAvatar?.openExternalUrl?.('http://127.0.0.1:20128')
    showToast('Dashboard 9Router Dibuka 🌐', 'Kelola akun login 9Router Anda di browser.', 'info', '🌐', 3500)
  })

  document.getElementById('btn-open-9router-providers')?.addEventListener('click', () => {
    window.hermesAvatar?.openExternalUrl?.('http://127.0.0.1:20128/dashboard/providers')
    showToast(
      'Halaman Akun 9Router Dibuka 🔐',
      'Tambahkan atau login akun OAuth (Claude, Codex, Gemini CLI, Kiro) lewat dashboard 9Router.',
      'info',
      '🔐',
      4500
    )
  })

  document.querySelectorAll('#oauth-login-hub [data-open-url]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.openUrl
      if (url) window.hermesAvatar?.openExternalUrl?.(url)
      const target = btn.dataset.presetTarget
      if (target) {
        document.querySelector(`#llm-preset-grid [data-preset="${target}"]`)?.click()
      }
      showToast(
        'Halaman Login Provider Dibuka 🌐',
        'Masuk dengan akun Google/GitHub Anda, salin API Key, lalu klik "Tempel & Aktifkan ⚡" di kartu ini.',
        'info',
        '🔑',
        5500
      )
    })
  })

  document.querySelectorAll('.oauth-paste-activate-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.oauth-provider-card')
      const inlineInput = card?.querySelector('.oauth-inline-key')
      let rawKey = (inlineInput?.value || '').trim()

      if (!rawKey) {
        try {
          rawKey = (await navigator.clipboard.readText() || '').trim()
        } catch {
          rawKey = ''
        }
      }

      if (!rawKey || /^https?:\/\//i.test(rawKey) || rawKey.length < 8) {
        inlineInput?.focus()
        showToast(
          'API Key Belum Ditemukan',
          'Silakan klik tombol Login di langkah 1 untuk menyalin API Key terlebih dahulu, lalu klik Tempel & Aktifkan.',
          'warning',
          '🔑',
          5500
        )
        return
      }

      const name = btn.dataset.name || 'Provider AI'
      const baseUrl = btn.dataset.baseurl || ''
      const model = btn.dataset.model || ''
      if (!baseUrl || !model) return

      btn.disabled = true
      const origText = btn.textContent
      btn.textContent = '⏳ Mengaktifkan…'
      try {
        const keyRes = await encryptProviderKey(rawKey, baseUrl)
        if (!keyRes.ok) return
        const savedProv = upsertLlmProvider({
          name,
          baseUrl,
          apiKey: keyRes.value,
          model,
          authType: 'apikey'
        })
        if (inlineInput) inlineInput.value = ''
        await activateLlmProvider(savedProv)
      } catch (err) {
        statusEl.textContent = `✗ Gagal mengaktifkan ${name}: ${err?.message || err}`
        showToast('Gagal Mengaktifkan Provider', err?.message || String(err), 'error', '❌', 6000)
      } finally {
        btn.disabled = false
        btn.textContent = origText
      }
    })
  })

  updateOAuthHubStatusBadges()
}

function initLlmPresets() {
  const grid = document.getElementById('llm-preset-grid')
  const baseUrlRow = document.getElementById('llm-base-url-row')
  if (!grid) return

  grid.querySelectorAll('.llm-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.llm-preset-btn').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')

      editingProviderId = null
      llmAddBtn.textContent = 'Simpan & Aktifkan Provider ⚡'
      llmName.value = btn.dataset.name || ''
      llmBaseUrl.value = btn.dataset.baseurl || ''
      llmModel.value = btn.dataset.model || ''

      const isCustom = btn.dataset.preset === 'custom'
      if (baseUrlRow) {
        baseUrlRow.classList.toggle('force-visible', isCustom)
      }

      if (btn.dataset.needskey === '0') {
        llmApiKey.value = ''
        llmApiKey.placeholder = 'Kosongkan saja (otomatis untuk layanan lokal)'
      } else {
        llmApiKey.placeholder = 'Tempel API key Anda di sini...'
        llmApiKey.focus()
      }
      statusEl.textContent = isCustom
        ? 'Silakan isi alamat server, API key, dan nama model kustom Anda.'
        : `Preset "${llmName.value}" dipilih. Tempel API key lalu klik Simpan & Aktifkan.`
    })
  })
}

function resetProviderForm() {
  editingProviderId = null
  llmName.value = ''
  llmBaseUrl.value = ''
  llmApiKey.value = ''
  llmApiKey.placeholder = 'Tempel API key di sini (opsional untuk lokal)...'
  llmModel.value = ''
  llmAddBtn.textContent = 'Simpan & Aktifkan Provider ⚡'
  document.getElementById('llm-base-url-row')?.classList.remove('force-visible')
  document.querySelectorAll('#llm-preset-grid .llm-preset-btn').forEach((b) => b.classList.remove('active'))
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

async function encryptProviderKey(keyInput, baseUrl) {
  if (!keyInput) return { ok: true, value: '' }
  const encRes = await window.hermesAvatar.encryptSecret(keyInput, baseUrl)
  if (!encRes?.ok) {
    statusEl.textContent = `⚠️ Gagal mengenkripsi kunci: ${encRes?.error || 'URL atau kunci tidak valid'}`
    showToast('Enkripsi Kunci Gagal', encRes?.error || 'URL atau kunci tidak valid', 'error', '❌', 6000)
    return { ok: false }
  }
  return { ok: true, value: encRes.value }
}

function getUrlOrigin(raw) {
  try {
    const u = new URL(String(raw || '').trim())
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.origin : null
  } catch {
    return null
  }
}

llmAddBtn.addEventListener('click', async () => {
  const name = llmName.value.trim()
  if (!name) {
    statusEl.textContent = '⚠️ Isi nama provider.'
    showToast('Nama Provider Kosong', 'Harap masukkan nama provider LLM', 'error', '⚠️')
    return
  }

  const baseUrl = llmBaseUrl.value.trim()
  if (!baseUrl) {
    statusEl.textContent = '⚠️ Pilih salah satu preset penyedia AI di atas terlebih dahulu.'
    showToast('Pilih Preset AI', 'Silakan klik salah satu preset penyedia AI di atas terlebih dahulu.', 'warning', '⚠️')
    return
  }

  const keyInput = llmApiKey.value.trim()
  const model = llmModel.value.trim()
  const keyRes = await encryptProviderKey(keyInput, baseUrl)
  if (!keyRes.ok) return

  let savedProvider = null

  if (editingProviderId) {
    const p = settings.llm.providers.find((x) => x.id === editingProviderId)
    if (!p) {
      resetProviderForm()
      return
    }
    let apiKeyEnc = keyRes.value
    if (!keyInput) {
      const sameOrigin = getUrlOrigin(p.baseUrl) && getUrlOrigin(p.baseUrl) === getUrlOrigin(baseUrl)
      if (sameOrigin) {
        apiKeyEnc = p.apiKey || ''
      } else {
        statusEl.textContent = 'URL berubah, kunci lama tidak dibawa. Masukkan ulang jika perlu.'
        showToast('Perhatian Kunci API ⚠️', 'URL berubah, kunci lama tidak dibawa. Masukkan ulang jika perlu.', 'warning', '⚠️', 6000)
      }
    }
    p.name = name
    p.baseUrl = baseUrl
    p.apiKey = apiKeyEnc
    p.model = model
    p.models = Array.from(new Set([...(Array.isArray(p.models) ? p.models : []), model].filter(Boolean)))
    savedProvider = p
    if (!statusEl.textContent.includes('URL berubah')) {
      statusEl.textContent = 'Provider diperbarui.'
    }
  } else {
    savedProvider = {
      id: Date.now().toString(36),
      name,
      baseUrl,
      apiKey: keyRes.value,
      model,
      models: model ? [model] : []
    }
    settings.llm.providers.push(savedProvider)
    statusEl.textContent = 'Provider ditambahkan.'
  }

  saveSettings(settings)
  syncLlmProvidersToDisk()
  resetProviderForm()
  renderLlmList()
  await refreshModelOptions()

  if (savedProvider.model && savedProvider.baseUrl) {
    try {
      await activateLlmProvider(savedProvider)
    } catch (err) {
      statusEl.textContent = `✓ Tersimpan, namun gagal aktifkan: ${err?.message || err}`
    }
  } else {
    showToast('Provider Tersimpan! 🎉', `${name} berhasil disimpan ke daftar LLM`, 'success', '💾')
  }
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
              custom.push({ value: m, label: `${activeProv.name} — ${m}`, providerId: activeProv.id || '' })
            }
          }
        }
      } catch (_) {}
    }

    // 2. Tambahkan semua model dari daftar provider tersimpan user (termasuk riwayat model per provider)
    for (const p of (settings.llm.providers || [])) {
      const provModels = Array.from(new Set([p.model, ...(Array.isArray(p.models) ? p.models : [])].filter(Boolean)))
      for (const m of provModels) {
        if (!seenModels.has(m)) {
          seenModels.add(m)
          custom.push({ value: m, label: `${p.name} — ${m}`, providerId: p.id || '' })
        }
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
                custom.push({ value: m, label: `${name} — ${m}`, providerId: '' })
              }
            }
          }
        }
      }
    } catch (_) {}

    // Fallback bila sama sekali belum terdeteksi
    let options = custom
    if (options.length === 0) {
      options.push({ value: '', label: 'Belum ada model terdeteksi di endpoint', providerId: '' })
    }

    llmSwitchModel.innerHTML = options
      .map((o) => `<option value="${escapeHtml(o.value)}" data-provider-id="${escapeHtml(o.providerId || '')}">${escapeHtml(o.label)}</option>`)
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
  refreshProviderQuota(false)
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
  const selectedOpt = llmSwitchModel.options?.[llmSwitchModel.selectedIndex]
  const optProvId = selectedOpt?.dataset?.providerId || ''
  llmSwitchBtn.disabled = true
  showToast('Menerapkan Model LLM...', `Mengalihkan model aktif ke "${value}"`, 'running', '🧠')
  try {
    const provs = settings.llm.providers || []
    const activeProv = provs.find((p) => p.id === settings.llm.activeId) || provs[0]
    const targetProv = (optProvId && provs.find((p) => p.id === optProvId)) ||
      provs.find((p) => p.model === value || (Array.isArray(p.models) && p.models.includes(value))) ||
      activeProv
    const res = await window.hermesAvatar.setLlmProvider({
      name: targetProv?.name || 'custom',
      baseUrl: targetProv?.baseUrl || 'http://127.0.0.1:20128/v1',
      apiKey: targetProv?.apiKey || '',
      model: value
    })
    if (!res.ok) {
      throw new Error(res.error || 'Gagal menyetel provider LLM')
    }

    if (targetProv) {
      targetProv.model = value
      targetProv.models = Array.from(new Set([value, ...(Array.isArray(targetProv.models) ? targetProv.models : [])].filter(Boolean)))
      settings.llm.activeId = targetProv.id
      saveSettings(settings)
      syncLlmProvidersToDisk()
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
    showToast('Gagal Menerapkan Model', err?.message || err, 'error', '❌', 6000)
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
    const currentVer = res.currentVersion ? (res.currentVersion.startsWith('v') ? res.currentVersion : `v${res.currentVersion}`) : 'v0.1.6'
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
    }, 400)
    return
  }

  if (isUpdating) return
  if (!cachedUpdateInfo || !cachedUpdateInfo.downloadUrl || !cachedUpdateInfo.assetName) {
    showToast('Paket Pembaruan Belum Tersedia', 'Membuka halaman rilis di browser untuk unduhan manual...', 'warning', '🌐')
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

  if (bannerProgressStatus) bannerProgressStatus.textContent = 'Menghubungkan ke server pembaruan...'
  if (modalProgressStatus) modalProgressStatus.textContent = 'Menghubungkan ke server pembaruan...'

  showToast('Mengunduh Pembaruan ⚡', `Mengunduh rilis ${cachedUpdateInfo.latestVersion}...`, 'info', '⬇')

  try {
    const res = await window.hermesAvatar?.downloadAndApplyUpdate?.(cachedUpdateInfo.downloadUrl, cachedUpdateInfo.assetName)
    if (res && res.ok) {
      updateReadyToRestart = true
      isUpdating = false

      if (bannerProgressBar) bannerProgressBar.style.width = '100%'
      if (modalProgressBar) modalProgressBar.style.width = '100%'

      const restartMsg = 'Pembaruan selesai! Memulai ulang otomatis dalam 2 detik... 🚀'
      if (bannerProgressStatus) bannerProgressStatus.textContent = restartMsg
      if (modalProgressStatus) modalProgressStatus.textContent = restartMsg

      if (bannerProgressPercent) bannerProgressPercent.textContent = '100%'
      if (modalProgressPercent) modalProgressPercent.textContent = '100%'

      if (bannerBtn) {
        bannerBtn.disabled = false
        bannerBtn.textContent = 'Memulai Ulang… 🔄'
        bannerBtn.style.background = '#10b981'
      }
      if (modalBtn) {
        modalBtn.disabled = false
        modalBtn.textContent = 'Memulai Ulang… 🔄'
        modalBtn.style.background = '#10b981'
      }

      showToast('Pembaruan Selesai! 🎉', 'Memulai ulang aplikasi secara otomatis...', 'success', '✨', 5000)
      setTimeout(() => {
        window.hermesAvatar?.relaunchApp?.()
      }, 1800)
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
    const p = `${info.percent ?? 0}%`
    const stage = info.stage || 'downloading'
    let desc = `Mengunduh pembaruan: ${info.transferredMb || 0} MB / ${info.totalMb || 0} MB (${p})`
    if (stage === 'verifying') {
      desc = 'Memverifikasi keaslian paket pembaruan...'
      if (isUpdating) {
        if (downloadBtn) downloadBtn.textContent = 'Memverifikasi… 🔒'
        if (modalDownload) modalDownload.textContent = 'Memverifikasi… 🔒'
      }
    } else if (stage === 'installing') {
      desc = 'Menyiapkan instalasi pembaruan...'
      if (isUpdating) {
        if (downloadBtn) downloadBtn.textContent = 'Memasang… ⚙️'
        if (modalDownload) modalDownload.textContent = 'Memasang… ⚙️'
      }
    }

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
  initUiModeSwitcher()
  initLlmPresets()
  initDualTrackActions()
  initWindowControls()
  initHistoryControls()
  initSidebarSearch()
  renderNav()
  initPackageInstallProgressSync()
  syncInstallStateFromMain()
  refreshServiceStatus()
  loadDetectedPathsOnce(false)
  bindPackageActions()
  loadVoiceUI()
  initPersistentLlmProviders()
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
