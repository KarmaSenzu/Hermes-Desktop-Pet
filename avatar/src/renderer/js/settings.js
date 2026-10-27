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

// --- Floating Toast Alert macOS Style ---
export function showToast(title, message = '', type = 'info', icon = null, duration = 3200) {
  const container = document.getElementById('mac-toast-container')
  if (!container) return

  const toast = document.createElement('div')
  toast.className = `mac-toast ${type}`

  let iconText = icon
  if (!iconText) {
    if (type === 'success') iconText = '✅'
    else if (type === 'error') iconText = '❌'
    else if (type === 'running') iconText = '🚀'
    else iconText = 'ℹ️'
  }

  toast.innerHTML = `
    <div class="mac-toast-icon">${iconText}</div>
    <div class="mac-toast-content">
      <div class="mac-toast-title">${escapeHtml(title)}</div>
      ${message ? `<div class="mac-toast-desc">${escapeHtml(message)}</div>` : ''}
    </div>
  `

  container.appendChild(toast)

  const dismiss = () => {
    toast.classList.add('hide')
    setTimeout(() => toast.remove(), 240)
  }

  const timer = setTimeout(dismiss, duration)
  toast.addEventListener('click', () => {
    clearTimeout(timer)
    dismiss()
  })
}

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
    if (s.hermes && active) {
      if (prereqModal) prereqModal.hidden = true
      showToast('Prasyarat Siap! 🚀', 'Memulai avatar ke desktop...', 'success', '✨')
      await launchAvatarDirect(active.path)
    } else {
      showToast('Layanan Masih Perlu Penyiapan', 'Buka menu Package Hub untuk instalasi paket', 'info', 'ℹ️')
      renderPrereqModalItems(s, active)
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

function renderPrereqModalItems(s, active) {
  if (!prereqModalList) return
  const isCharOk = !!active
  const isHermesOk = !!s.hermes
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

function showPrerequisitesModal(s) {
  const active = (settings.characters || []).find((c) => c.active)
  renderPrereqModalItems(s, active)
  if (prereqModal) prereqModal.hidden = false
}

async function refreshServiceStatus() {
  try {
    const s = await window.hermesAvatar.getServiceStatus()
    setBadge(hermesStatus, s.hermes, 'Aktif', 'Mati')

    if (pkgStatusHermes) setBadge(pkgStatusHermes, s.hermes, 'Aktif (Port 9119)', 'Belum Aktif')
    if (pkgStatusRouter) setBadge(pkgStatusRouter, s.router, 'Aktif (Port 20128)', 'Belum Aktif')
    if (pkgStatusKokoro) setBadge(pkgStatusKokoro, s.kokoro, 'Aktif (Port 8880)', 'Belum Aktif')
    if (pkgStatusCompanion) setBadge(pkgStatusCompanion, s.companion, 'Bridge Aktif (Port 9124)', 'Siap Digunakan')
    if (pkgStatusPython) setBadge(pkgStatusPython, s.pythonOk, 'Terpasang', 'Belum Terpasang')
    if (pkgPythonVersion) pkgPythonVersion.textContent = s.pythonOk ? `Versi: ${s.pythonVersion}` : 'Python 3.10+ belum terdeteksi di PATH'

    if (pkgBridgeStatusText) {
      pkgBridgeStatusText.textContent = s.companion ? 'Aktif di 127.0.0.1:9124 ✅' : 'Port 9124 (Menunggu Permintaan)'
      pkgBridgeStatusText.style.color = s.companion ? '#7ee787' : '#8b949e'
    }

    if (pkgKokoroPipStatus) {
      if (s.kokoroInstalled) {
        pkgKokoroPipStatus.textContent = 'Terpasang ✅'
        pkgKokoroPipStatus.style.color = '#7ee787'
      } else {
        pkgKokoroPipStatus.textContent = 'Belum Terpasang'
        pkgKokoroPipStatus.style.color = '#ff7b72'
      }
    }

    if (pkgKokoroModelStatus) {
      if (s.kokoroModelReady) {
        pkgKokoroModelStatus.textContent = s.modelSizeMb ? `Siap di Disk (${s.modelSizeMb} MB) ✅` : 'Siap di Disk ✅'
        pkgKokoroModelStatus.style.color = '#7ee787'
      } else {
        pkgKokoroModelStatus.textContent = 'Belum Diunduh (Otomatis saat start)'
        pkgKokoroModelStatus.style.color = '#8b949e'
      }
    }

    if (pkgKokoroLocation && s.packagePath) {
      pkgKokoroLocation.textContent = s.packagePath
    }

    // Update Kartu Prasyarat di Home
    const active = (settings.characters || []).find((c) => c.active)
    const isCharOk = !!active
    const isHermesOk = !!s.hermes
    const isRouterOk = !!s.router
    const isTtsOk = !!(s.kokoro || settings.tts?.provider === 'edge')

    let readyCount = 0
    if (isCharOk) readyCount++
    if (isHermesOk) readyCount++
    if (isRouterOk) readyCount++
    if (isTtsOk) readyCount++

    if (homePrereqBadge) {
      if (readyCount === 4) {
        homePrereqBadge.textContent = '4/4 Siap Memulai ✅'
        homePrereqBadge.className = 'badge ready'
      } else {
        homePrereqBadge.textContent = `${readyCount}/4 Prasyarat Terpenuhi`
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
      const cmd = btn.dataset.terminalCmd
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

  // 5. Tombol Periksa Ulang Paket
  document.getElementById('pkg-refresh-all-btn')?.addEventListener('click', () => {
    showToast('Memindai Sistem...', 'Memeriksa status semua port & dependensi', 'info', '🔄')
    refreshServiceStatus()
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
      const filePath = await window.hermesAvatar.pickModelFile()
      if (filePath) document.getElementById('char-path').value = filePath
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
    showPrerequisitesModal({ hermes: false, router: false, kokoro: false })
    return
  }

  // Validasi file karakter pada disk
  try {
    const checkFile = await window.hermesAvatar.readModel(active.path)
    if (checkFile && checkFile.ok === false) {
      statusEl.textContent = `File model tidak ditemukan: ${active.path}`
      showToast('File Model Hilang / Rusak', `File tidak ada di: ${active.path}`, 'error', '❌')
      const s = await window.hermesAvatar.getServiceStatus()
      showPrerequisitesModal(s)
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

    // Jika Hermes masih belum aktif, tampilkan popup modal Prasyarat
    if (!s.hermes) {
      showPrerequisitesModal(s)
      return
    }

    // Semua prasyarat kritis terpenuhi -> mulai avatar langsung
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

setInterval(refreshServiceStatus, 3000)

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
  llmList.innerHTML = providers
    .map((p) => {
      return `<div class="format-item llm-row" data-id="${escapeHtml(p.id)}">
        <div class="format-emblem theme-indigo">
          ${renderIcon('brain', { size: 18 })}
        </div>
        <div class="format-info-col">
          <div class="format-title-line">
            <span class="format-title">${escapeHtml(p.name)}</span>
            ${p.model ? `<span class="format-pill-tag">${escapeHtml(p.model)}</span>` : ''}
          </div>
          <p class="format-desc-text">${escapeHtml(p.baseUrl || '')} · <span class="muted">${maskKey(p.apiKey)}</span></p>
        </div>
        <div class="format-status-col" style="gap:6px;">
          <button class="mini-btn primary llm-activate" data-id="${escapeHtml(p.id)}" title="Aktifkan sebagai model utama">Aktifkan</button>
          <button class="mini-btn secondary llm-test" data-id="${escapeHtml(p.id)}" title="Tes koneksi ke endpoint">Tes</button>
          <button class="mini-btn browse llm-edit" data-id="${escapeHtml(p.id)}" title="Edit konfigurasi provider">Edit</button>
          <button class="mini-btn del llm-del" data-id="${escapeHtml(p.id)}" title="Hapus provider ini">${renderIcon('trash-2', { size: 13 })}</button>
        </div>
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
    showToast('Nama Provider Kosong', 'Harap masukkan nama provider LLM', 'error', '⚠️')
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
      showToast('Provider Diperbarui! ✅', `Konfigurasi ${name} telah diupdate`, 'success', '💾')
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
    showToast('Provider Disimpan! ✅', `Provider ${name} berhasil ditambahkan`, 'success', '💾')
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

const AVATAR_STATES = [
  {
    key: 'thinking',
    icon: 'brain',
    theme: 'indigo',
    label: 'Gaya Saat Berpikir',
    desc: 'Gestur dan ekspresi saat avatar menganalisis atau bernalar',
    defaultOption: 'glasses',
    builtins: [
      { id: 'glasses', label: '👓 Kacamata Fokus (Default Bawaan)' },
      { id: 'ponder', label: '🤔 Merenung Serius & Tenang' },
      { id: 'curious', label: '🧐 Menatap Penasaran' },
      { id: 'neutral', label: '😐 Netral Tanpa Kacamata' }
    ]
  },
  {
    key: 'watch',
    icon: 'clock',
    theme: 'blue',
    label: 'Gaya Megang Jam (Timer & Fokus)',
    desc: 'Aksesoris dan gestur avatar saat jam kerja atau timer berjalan',
    defaultOption: 'watch_suit',
    builtins: [
      { id: 'watch_suit', label: '⌚ Jas & Jam Tangan Disiplin (Default)' },
      { id: 'watch_only', label: '⏱️ Cek Jam Tangan Saja (Kasual)' },
      { id: 'glasses_only', label: '👓 Kacamata Belajar Tanpa Jam' },
      { id: 'casual', label: '🌸 Pakaian Santai Bebas' }
    ]
  },
  {
    key: 'processing',
    icon: 'cpu',
    theme: 'teal',
    label: 'Gaya Memproses (Menyusun Respon)',
    desc: 'Visual saat meracik kalimat jawaban dan menjalankan tool AI',
    defaultOption: 'charterer',
    builtins: [
      { id: 'charterer', label: '🧻 Roll Rambut Cepat (Default Bawaan)' },
      { id: 'focus', label: '💻 Fokus Konsentrasi Tinggi' },
      { id: 'relaxed', label: '☕ Santai Menunggu' }
    ]
  },
  {
    key: 'greeting',
    icon: 'heart',
    theme: 'rose',
    label: 'Gaya Menyapa & Reaksi Sentuhan',
    desc: 'Reaksi avatar saat pertama menyapa atau ketika diklik/disentuh',
    defaultOption: 'sarangheo',
    builtins: [
      { id: 'sarangheo', label: '💖 Tangan Sarangheo (Love & Blush - Default)' },
      { id: 'bounce', label: '✨ Melompat Ringan (Bounce)' },
      { id: 'wave', label: '👋 Melambaikan Tangan (Wave)' }
    ]
  },
  {
    key: 'idle',
    icon: 'user',
    theme: 'purple',
    label: 'Postur Diam (Idle Standby)',
    desc: 'Pose dan postur tubuh avatar ketika tidak sedang bergerak',
    defaultOption: 'a-pose',
    builtins: [
      { id: 'a-pose', label: '🧍 A-Pose (Tangan di Samping Natural - Default)' },
      { id: 't-pose', label: '✝️ T-Pose (Tangan Terentang)' }
    ]
  }
]

const ANIM_MENU = [
  { id: 'state-mapping', icon: 'sliders', theme: 'indigo', label: 'Pemetaan Gaya Status Avatar', desc: 'Atur gaya avatar saat berpikir, megang jam, memproses, menyapa, dan diam' },
  { id: 'add', icon: 'upload-cloud', theme: 'emerald', label: 'Unggah Animasi Baru', desc: 'Unggah file animasi gerakan 3D (.glb, .vmd, .motion3.json, .bvh, .fbx)' },
  { id: 'pose-saved', icon: 'film', theme: 'purple', label: 'Animasi & Pose Tersimpan', desc: 'Kelola dan uji file animasi custom yang telah diunggah' },
  { id: 'emote', icon: 'smile', theme: 'amber', label: 'Emote & Ekspresi Bawaan', desc: 'Daftar emote bawaan & ekspresi interaktif avatar' },
  { id: 'pose-default', icon: 'user', theme: 'blue', label: 'Pose Default (Idle)', desc: 'Atur postur istirahat saat avatar diam (A-pose / T-pose)' }
]

function customAnimations() { return settings.animations || [] }
function customPoses() { return (settings.animations || []).filter((a) => a.type === 'pose' || a.targetState === 'idle') }
function customEmotes() { return (settings.animations || []).filter((a) => a.type === 'emote' || a.targetState !== 'idle') }

function getStateAnimActive(key, fallback) {
  return settings.stateAnimations?.[key] || fallback
}

function getStateLabel(def, activeVal) {
  const builtin = def.builtins.find((b) => b.id === activeVal)
  if (builtin) return builtin.label.split('(')[0].trim()
  if (activeVal && activeVal.startsWith('custom:')) {
    const id = activeVal.replace('custom:', '')
    const anim = (settings.animations || []).find((a) => a.id === id)
    return anim ? `🎬 ${anim.name}` : 'Kustom'
  }
  return 'Aktif'
}

function customOptionsForState(targetState, activeVal) {
  const list = (settings.animations || []).filter((a) => !a.targetState || a.targetState === targetState || a.targetState === 'custom')
  if (!list.length) return ''
  const opts = list.map((a) => {
    const isSelected = activeVal === `custom:${a.id}` ? 'selected' : ''
    return `<option value="custom:${escapeHtml(a.id)}" ${isSelected}>🎬 ${escapeHtml(a.name)} (.${escapeHtml(a.format)})</option>`
  }).join('')
  return `<optgroup label="Animasi Kustom Terpasang">${opts}</optgroup>`
}

async function previewStateAnimation(stateKey, value) {
  try {
    if (value && value.startsWith('custom:')) {
      const id = value.replace('custom:', '')
      const anim = (settings.animations || []).find((a) => a.id === id)
      if (anim) {
        await window.hermesAvatar?.previewAnimation?.({ anim, state: stateKey })
        return
      }
    }
    await window.hermesAvatar?.previewAnimation?.({ state: stateKey, style: value })
  } catch (err) {
    console.warn('[Settings] Gagal kirim preview animasi:', err)
  }
}

function renderAnimMenu() {
  const animCount = customAnimations().length
  const defaultPose = settings.stateAnimations?.idle === 't-pose' || settings.pose === 't-pose' ? 'T-Pose' : 'A-Pose'

  animMenu.innerHTML = ANIM_MENU.map((m) => {
    let countBadge = ''
    if (m.id === 'state-mapping') {
      countBadge = `<span class="format-count-pill on">⚡ 5 Status Aktif</span>`
    } else if (m.id === 'add') {
      countBadge = `<span class="format-count-pill off">+ Unggah</span>`
    } else if (m.id === 'pose-saved') {
      countBadge = animCount > 0
        ? `<span class="format-count-pill on">🟢 ${animCount} File</span>`
        : `<span class="format-count-pill off">0 File</span>`
    } else if (m.id === 'emote') {
      const total = BUILTIN_EMOTES.length + customEmotes().length
      countBadge = `<span class="format-count-pill on">${total} Emote</span>`
    } else if (m.id === 'pose-default') {
      countBadge = `<span class="format-count-pill on">⚡ ${defaultPose}</span>`
    }

    return `<div class="format-item" data-sub="${m.id}">
      <div class="format-emblem theme-${m.theme}">
        ${renderIcon(m.icon, { size: 18 })}
      </div>
      <div class="format-info-col">
        <div class="format-title-line">
          <span class="format-title">${escapeHtml(m.label)}</span>
        </div>
        <p class="format-desc-text">${escapeHtml(m.desc)}</p>
      </div>
      <div class="format-status-col">
        ${countBadge}
        <span class="format-arrow">${renderIcon('chevron-right', { size: 16 })}</span>
      </div>
    </div>`
  }).join('')

  animMenu.querySelectorAll('.format-item').forEach((el) => {
    el.addEventListener('click', () => openAnimDetail(el.dataset.sub))
  })
}

function openAnimDetail(sub) {
  animMenuView.classList.add('hidden')
  animDetailView.classList.remove('hidden')

  if (sub === 'state-mapping') {
    animDetail.innerHTML = `
      <div class="group-header">Pemetaan Gaya Status & Perilaku Avatar</div>
      <div class="card">
        ${AVATAR_STATES.map((def) => {
          const activeVal = getStateAnimActive(def.key, def.defaultOption)
          const badgeText = getStateLabel(def, activeVal)
          return `
          <div class="settings-row">
            <div class="format-emblem theme-${def.theme}">
              ${renderIcon(def.icon, { size: 18 })}
            </div>
            <div class="format-info-col">
              <div class="format-title-line">
                <span class="format-title">${escapeHtml(def.label)}</span>
                <span class="voice-badge-pill" id="badge-state-${def.key}">${escapeHtml(badgeText)}</span>
              </div>
              <p class="format-desc-text">${escapeHtml(def.desc)}</p>
            </div>
            <div class="row-control" style="gap:8px;">
              <select id="state-sel-${def.key}" class="mac-select" data-state="${def.key}">
                <optgroup label="Pilihan Bawaan Prosedural">
                  ${def.builtins.map((b) => `<option value="${b.id}" ${b.id === activeVal ? 'selected' : ''}>${b.label}</option>`).join('')}
                </optgroup>
                ${customOptionsForState(def.key, activeVal)}
              </select>
              <button type="button" class="mini-btn use btn-test-state" data-state="${def.key}" title="Uji coba gaya ini langsung di avatar">⚡ Uji</button>
            </div>
          </div>`
        }).join('')}
      </div>`

    // Bind event change & test per state
    AVATAR_STATES.forEach((def) => {
      const sel = document.getElementById(`state-sel-${def.key}`)
      const badge = document.getElementById(`badge-state-${def.key}`)
      if (sel) {
        sel.onchange = () => {
          const val = sel.value
          settings.stateAnimations = settings.stateAnimations || {}
          settings.stateAnimations[def.key] = val
          if (def.key === 'idle') {
            settings.pose = val
          }
          saveSettings(settings)
          if (badge) badge.textContent = getStateLabel(def, val)
          previewStateAnimation(def.key, val)
          showToast('Gaya Avatar Diperbarui! ✨', `${def.label}: ${sel.options[sel.selectedIndex].text}`, 'success', '✨')
        }
      }
    })

    animDetail.querySelectorAll('.btn-test-state').forEach((btn) => {
      btn.addEventListener('click', () => {
        const stateKey = btn.dataset.state
        const sel = document.getElementById(`state-sel-${stateKey}`)
        const val = sel?.value
        const def = AVATAR_STATES.find((s) => s.key === stateKey)
        previewStateAnimation(stateKey, val)
        showToast('Menguji Gerakan Avatar ⚡', `Memainkan sampel ${def?.label || stateKey}`, 'info', '⚡', 2500)
      })
    })

  } else if (sub === 'add') {
    animDetail.innerHTML = `
      <div class="group-header">Unggah Animasi Kustom Baru</div>
      <div class="card">
        <div class="settings-row">
          <div class="format-emblem theme-emerald">
            ${renderIcon('film', { size: 18 })}
          </div>
          <div class="format-info-col">
            <div class="format-title-line">
              <span class="format-title">Nama Gaya Animasi</span>
            </div>
            <p class="format-desc-text">Beri label unik untuk pose atau gerakan ini</p>
          </div>
          <div class="row-control">
            <input id="anim-name" type="text" class="mac-input" placeholder="cth. Pose Berpikir Detektif" />
          </div>
        </div>
        <div class="settings-row">
          <div class="format-emblem theme-blue">
            ${renderIcon('folder', { size: 18 })}
          </div>
          <div class="format-info-col">
            <div class="format-title-line">
              <span class="format-title">File Gerakan Animasi</span>
            </div>
            <p class="format-desc-text">Format: .glb, .gltf, .vmd, .motion3.json, .bvh, .fbx</p>
          </div>
          <div class="row-control" style="gap:6px;">
            <input id="anim-path" type="text" class="mac-input" style="width:160px; min-width:160px;" placeholder="Pilih file..." readonly />
            <button type="button" id="anim-pick-btn" class="mini-btn browse">Pilih File…</button>
          </div>
        </div>
        <div class="settings-row">
          <div class="format-emblem theme-purple">
            ${renderIcon('sliders', { size: 18 })}
          </div>
          <div class="format-info-col">
            <div class="format-title-line">
              <span class="format-title">Target Status Avatar</span>
            </div>
            <p class="format-desc-text">Status di mana animasi ini akan dimainkan</p>
          </div>
          <div class="row-control">
            <select id="anim-target-state" class="mac-select">
              <option value="thinking">🧠 Berpikir (Thinking / Reasoning)</option>
              <option value="watch">⌚ Megang Jam (Timer & Fokus)</option>
              <option value="processing">⚡ Memproses (Menyusun Respon)</option>
              <option value="greeting">💖 Menyapa & Sentuhan (Greeting / Love)</option>
              <option value="idle">🧍 Postur Diam (Idle Standby)</option>
              <option value="custom">🎬 Animasi Kustom Umum</option>
            </select>
          </div>
        </div>
        <div class="settings-row">
          <div class="format-emblem theme-amber">
            ${renderIcon('sparkles', { size: 18 })}
          </div>
          <div class="format-info-col">
            <div class="format-title-line">
              <span class="format-title">Langsung Jadikan Gaya Aktif</span>
            </div>
            <p class="format-desc-text">Otomatis pasang sebagai animasi aktif untuk status yang dipilih</p>
          </div>
          <div class="row-control">
            <input id="anim-auto-apply" type="checkbox" class="mac-switch" checked />
          </div>
        </div>
        <div class="settings-row">
          <div class="format-info-col">
            <p class="format-desc-text" style="color:var(--text-secondary);">File yang diunggah dapat diuji di avatar atau diganti kapan saja dari menu Pemetaan.</p>
          </div>
          <div class="row-control">
            <button id="anim-add-btn" class="mini-btn primary" style="height:32px; padding:0 16px;">Simpan & Terapkan Animasi</button>
          </div>
        </div>
      </div>`
    bindAnimAddForm()

  } else if (sub === 'pose-saved') {
    animDetail.innerHTML = `
      <div class="group-header">Daftar Animasi & Pose Tersimpan</div>
      <div class="card padded">
        <p class="hint" style="margin-top:0; margin-bottom:12px;">File animasi custom (.glb, .vmd, .motion3.json) yang telah diunggah ke avatar.</p>
        <div id="pose-list" class="anim-list">${renderPoseListHtml()}</div>
      </div>`
    bindPoseListEvents()

  } else if (sub === 'emote') {
    animDetail.innerHTML = `
      <div class="group-header">Daftar Emote & Ekspresi Bawaan</div>
      <div class="card padded">
        <p class="hint" style="margin-top:0; margin-bottom:12px;">Emote bawaan prosedural & reaksi interaktif avatar yang bisa diuji langsung.</p>
        <div id="emote-list" class="anim-list">${renderEmoteListHtml()}</div>
      </div>`
    bindEmoteTestEvents()

  } else if (sub === 'pose-default') {
    const curPose = settings.stateAnimations?.idle || settings.pose || 'a-pose'
    animDetail.innerHTML = `
      <div class="group-header">Konfigurasi Pose Diam (Idle)</div>
      <div class="card">
        <div class="settings-row">
          <div class="format-emblem theme-blue">
            ${renderIcon('user', { size: 18 })}
          </div>
          <div class="format-info-col">
            <div class="format-title-line">
              <span class="format-title">Postur Standby</span>
            </div>
            <p class="format-desc-text">Postur tubuh avatar ketika tidak sedang bergerak</p>
          </div>
          <div class="row-control" style="gap:8px;">
            <select id="pose-select" class="mac-select">
              <option value="a-pose" ${curPose === 'a-pose' ? 'selected' : ''}>A-pose (tangan di samping natural)</option>
              <option value="t-pose" ${curPose === 't-pose' ? 'selected' : ''}>T-pose (tangan terentang)</option>
            </select>
            <button type="button" class="mini-btn use" id="pose-test-btn" title="Uji coba pose ini">⚡ Uji</button>
          </div>
        </div>
      </div>`
    const sel = document.getElementById('pose-select')
    const testBtn = document.getElementById('pose-test-btn')
    sel.onchange = () => {
      settings.pose = sel.value
      settings.stateAnimations = settings.stateAnimations || {}
      settings.stateAnimations.idle = sel.value
      saveSettings(settings)
      previewStateAnimation('idle', sel.value)
      showToast('Pose Default Disimpan! 🎬', `Pose aktif: ${sel.options[sel.selectedIndex].text}`, 'success', '🎬')
    }
    testBtn.onclick = () => {
      previewStateAnimation('idle', sel.value)
      showToast('Menguji Postur Diam ⚡', `Pose: ${sel.options[sel.selectedIndex].text}`, 'info', '⚡')
    }
  }
}

function renderPoseListHtml() {
  const anims = customAnimations()
  if (anims.length === 0) {
    return `<div style="text-align:center; padding:24px 12px;">
      <p class="hint" style="margin-bottom:12px;">Belum ada animasi custom yang diunggah.</p>
      <button type="button" class="mini-btn use" onclick="document.querySelector('[data-sub=\\'add\\']')?.click()">+ Unggah Animasi Baru</button>
    </div>`
  }
  return anims.map((a) => {
    const isStateActive = Object.entries(settings.stateAnimations || {}).some(([k, v]) => v === `custom:${a.id}`)
    const targetLabel = a.targetState ? a.targetState.toUpperCase() : 'CUSTOM'
    return `<div class="app-item" data-id="${escapeHtml(a.id)}">
      <div class="app-item-main">
        ${renderIcon('film', { size: 16 })}
        <strong>${escapeHtml(a.name)}</strong>
        <span class="format-pill-tag">.${escapeHtml(a.format)}</span>
        <span class="format-count-pill off">${escapeHtml(targetLabel)}</span>
        ${isStateActive ? '<span class="voice-badge-pill">🟢 Aktif</span>' : ''}
      </div>
      <div style="display:flex; gap:6px; align-items:center;">
        <button class="mini-btn use anim-test-btn" data-id="${escapeHtml(a.id)}" title="Uji animasi langsung di avatar">⚡ Uji</button>
        ${!isStateActive && a.targetState ? `<button class="mini-btn edit anim-activate-btn" data-id="${escapeHtml(a.id)}" data-state="${escapeHtml(a.targetState)}">Pasang Aktif</button>` : ''}
        <button class="mini-btn del anim-del-btn" data-id="${escapeHtml(a.id)}">Hapus</button>
      </div>
    </div>`
  }).join('')
}

function bindPoseListEvents() {
  const container = document.getElementById('pose-list')
  if (!container) return

  // Uji animasi
  container.querySelectorAll('.anim-test-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const a = (settings.animations || []).find((x) => x.id === btn.dataset.id)
      if (a) {
        await window.hermesAvatar?.previewAnimation?.({ anim: a, state: a.targetState || 'custom' })
        showToast('Menguji Animasi ⚡', `Memainkan: ${a.name}`, 'info', '⚡', 2500)
      }
    })
  })

  // Pasang aktif
  container.querySelectorAll('.anim-activate-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { id, state } = btn.dataset
      settings.stateAnimations = settings.stateAnimations || {}
      settings.stateAnimations[state] = `custom:${id}`
      saveSettings(settings)
      openAnimDetail('pose-saved')
      showToast('Gaya Animasi Terpasang! ✨', `Animasi aktif untuk status ${state}`, 'success', '✨')
    })
  })

  // Hapus animasi
  container.querySelectorAll('.anim-del-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id
      const a = (settings.animations || []).find((x) => x.id === id)
      const ok = await showConfirm(`Hapus animasi "${a?.name || ''}"?`, { title: 'Hapus Animasi' })
      if (!ok) return
      settings.animations = (settings.animations || []).filter((x) => x.id !== id)
      // Bersihkan jika terpasang di stateAnimations
      if (settings.stateAnimations) {
        for (const [k, v] of Object.entries(settings.stateAnimations)) {
          if (v === `custom:${id}`) {
            const def = AVATAR_STATES.find((s) => s.key === k)
            settings.stateAnimations[k] = def?.defaultOption || 'glasses'
          }
        }
      }
      saveSettings(settings)
      openAnimDetail('pose-saved')
      showToast('Animasi Dihapus', `"${a?.name || ''}" telah dihapus`, 'info', '🗑️')
    })
  })
}

function renderEmoteListHtml() {
  return BUILTIN_EMOTES.map((e) => {
    return `<div class="app-item" data-emote="${escapeHtml(e.id)}">
      <div class="app-item-main">
        ${renderIcon(e.icon, { size: 16 })}
        <strong>${escapeHtml(e.label)}</strong>
        <span class="muted">bawaan</span>
      </div>
      <button class="mini-btn use emote-test-btn" data-emote="${escapeHtml(e.id)}">⚡ Uji</button>
    </div>`
  }).join('')
}

function bindEmoteTestEvents() {
  document.querySelectorAll('.emote-test-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const emote = btn.dataset.emote
      await window.hermesAvatar?.previewAnimation?.({ state: 'greeting', style: emote })
      showToast('Menguji Emote ⚡', `Memainkan emote: ${emote}`, 'info', '⚡', 2500)
    })
  })
}

function bindAnimAddForm() {
  const pickBtn = document.getElementById('anim-pick-btn')
  const pathInput = document.getElementById('anim-path')
  const nameInput = document.getElementById('anim-name')
  const targetStateSel = document.getElementById('anim-target-state')
  const autoApplyCheck = document.getElementById('anim-auto-apply')
  const addBtn = document.getElementById('anim-add-btn')

  pickBtn?.addEventListener('click', async () => {
    try {
      const filePath = await window.hermesAvatar.pickAnimation()
      if (!filePath) return
      if (pathInput) pathInput.value = filePath
      const base = filePath.split(/[/\\]/).pop().replace(/\.(glb|gltf|vmd|motion3\.json|bvh|fbx|json)$/i, '')
      if (nameInput && !nameInput.value) {
        nameInput.value = base
      }
    } catch (err) {
      showToast('Gagal Memilih File', err?.message || err, 'error', '❌')
    }
  })

  addBtn?.addEventListener('click', async () => {
    const path = pathInput?.value.trim()
    if (!path) {
      showToast('Pilih File Terlebih Dahulu ⚠️', 'Klik tombol Pilih File untuk mencari animasi gerakan', 'error', '⚠️')
      return
    }
    const name = nameInput?.value.trim() || path.split(/[/\\]/).pop() || 'Animasi'
    const format = path.split('.').pop().toLowerCase()
    const targetState = targetStateSel?.value || 'thinking'
    const autoApply = autoApplyCheck?.checked !== false

    const newAnim = {
      id: Date.now().toString(36),
      name,
      path,
      format,
      targetState,
      type: targetState === 'idle' ? 'pose' : 'emote',
      createdAt: Date.now()
    }

    settings.animations = settings.animations || []
    settings.animations.push(newAnim)

    if (autoApply && targetState !== 'custom') {
      settings.stateAnimations = settings.stateAnimations || {}
      settings.stateAnimations[targetState] = `custom:${newAnim.id}`
      if (targetState === 'idle') {
        settings.pose = `custom:${newAnim.id}`
      }
    }

    saveSettings(settings)
    await window.hermesAvatar?.previewAnimation?.({ anim: newAnim, state: targetState })
    showToast('Animasi Disimpan! 🎉', `"${name}" berhasil diunggah${autoApply ? ' dan dijadikan gaya aktif' : ''}`, 'success', '🎉')
    openAnimDetail('state-mapping')
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
  { id: 'open_app', icon: 'play', theme: 'blue', label: 'Buka Aplikasi', desc: 'Buka / jalankan executable lokal (Spotify, VS Code, Browser)' },
  { id: 'open_website', icon: 'globe', theme: 'emerald', label: 'Buka Website & URL', desc: 'Akses link website atau lakukan pencarian di web browser' },
  { id: 'browser_control', icon: 'monitor', theme: 'purple', label: 'Kontrol Browser Otomatis', desc: 'Kelola tab aktif, navigasi URL, dan interaksi halaman' },
  { id: 'system_monitor', icon: 'activity', theme: 'amber', label: 'Monitor Aktivitas Sistem', desc: 'Pantau penggunaan CPU, memori, dan status proses berjalan' },
  { id: 'file_access', icon: 'folder', theme: 'indigo', label: 'Akses File & Folder', desc: 'Membaca dan menulis file lokal avatar di disk pengguna' },
  { id: 'terminal', icon: 'terminal', theme: 'rose', label: 'Terminal & Shell Command', desc: 'Jalankan perintah baris shell (dilindungi dialog konfirmasi)' }
]

function renderActions() {
  const actions = settings.actions || {}
  actionList.innerHTML = ACTION_DEFS.map((a) => {
    const checked = actions[a.id] ? 'checked' : ''
    return `<div class="settings-row" style="padding: 10px 16px;">
      <div class="format-emblem theme-${a.theme}">
        ${renderIcon(a.icon, { size: 18 })}
      </div>
      <div class="format-info-col">
        <div class="format-title-line">
          <span class="format-title">${escapeHtml(a.label)}</span>
        </div>
        <p class="format-desc-text">${escapeHtml(a.desc)}</p>
      </div>
      <div class="row-control">
        <input type="checkbox" class="mac-switch" data-action="${a.id}" ${checked} />
      </div>
    </div>`
  }).join('')

  actionList.querySelectorAll('.mac-switch').forEach((cb) => {
    cb.addEventListener('change', () => {
      settings.actions = settings.actions || {}
      settings.actions[cb.dataset.action] = cb.checked
      saveSettings(settings)
      statusEl.textContent = 'Preferensi aksi disimpan.'
      const def = ACTION_DEFS.find((x) => x.id === cb.dataset.action)
      showToast('Izin Sistem Diperbarui 🛡️', `${def?.label || cb.dataset.action}: ${cb.checked ? 'Diizinkan' : 'Dinonaktifkan'}`, 'info', '🛡️')
    })
  })
}

// --- Aplikasi terdaftar (bisa dibuka) — CRUD ---
const appName = document.getElementById('app-name')
const appCommand = document.getElementById('app-command')
const appAddBtn = document.getElementById('app-add-btn')
const appPickBtn = document.getElementById('app-pick-btn')
const appScanBtn = document.getElementById('app-scan-btn')
const appList = document.getElementById('app-list')

let pendingAppIcon = '' // icon (data URL) untuk aplikasi yang akan ditambah

function renderAppList() {
  const apps = settings.actionApps || []
  if (apps.length === 0) {
    appList.innerHTML = '<p class="hint" style="padding:16px;">Belum ada aplikasi yang terdaftar.</p>'
    return
  }
  appList.innerHTML = apps.map((a) => {
    const iconHtml = a.icon
      ? `<img class="app-icon" src="${a.icon}" alt="" />`
      : renderIcon('play', { size: 17 })
    return `<div class="format-item app-row" data-id="${escapeHtml(a.id)}">
      <div class="format-emblem theme-blue">
        ${iconHtml}
      </div>
      <div class="format-info-col">
        <div class="format-title-line">
          <span class="format-title">${escapeHtml(a.name)}</span>
        </div>
        <p class="format-desc-text" style="font-family:'SF Mono', monospace; font-size:11px;">${escapeHtml(a.command || 'Executable path')}</p>
      </div>
      <div class="format-status-col">
        <button class="mini-btn del app-del" data-id="${escapeHtml(a.id)}" title="Hapus aplikasi">${renderIcon('trash-2', { size: 13 })} Hapus</button>
      </div>
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
    const base = filePath.split(/[/\\]/).pop().replace(/\.(app|exe|desktop|lnk)$/i, '')
    if (!appName.value) appName.value = base
    // Ambil icon asli.
    const iconRes = await window.hermesAvatar.getAppIcon(filePath)
    pendingAppIcon = iconRes.ok ? iconRes.dataUrl : ''
  } catch (err) {
    statusEl.textContent = `Gagal pilih aplikasi: ${err?.message || err}`
  }
})

// Pindai otomatis semua aplikasi Windows (Start Menu)
appScanBtn?.addEventListener('click', async () => {
  try {
    appScanBtn.disabled = true
    appScanBtn.textContent = '⏳ Memindai Windows…'
    statusEl.textContent = 'Memindai semua shortcut aplikasi Windows...'
    showToast('Memindai Aplikasi Windows... 🔍', 'Mendeteksi executable di Start Menu & Registry', 'running', '🔍')
    const res = await window.hermesAvatar.scanInstalledApps()
    if (res?.ok && Array.isArray(res.apps)) {
      settings.actionApps = settings.actionApps || []
      const existingNames = new Set(settings.actionApps.map((a) => a.name.toLowerCase()))
      let added = 0
      for (const item of res.apps) {
        if (!existingNames.has(item.name.toLowerCase())) {
          existingNames.add(item.name.toLowerCase())
          settings.actionApps.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name: item.name,
            command: item.command,
            icon: ''
          })
          added++
        }
      }
      saveSettings(settings)
      renderAppList()
      statusEl.textContent = `✅ Berhasil memindai! ${added} aplikasi baru ditambahkan (${res.apps.length} total terdeteksi).`
      showToast('Pemindaian Selesai! 🎉', `${added} aplikasi baru berhasil didaftarkan`, 'success', '⚡')
    } else {
      statusEl.textContent = `⚠️ Gagal memindai: ${res?.error || 'Tidak ada aplikasi ditemukan'}`
      showToast('Pemindaian Gagal', res?.error || 'Aplikasi tidak terdeteksi', 'error', '⚠️')
    }
  } catch (err) {
    statusEl.textContent = `⚠️ Error pemindaian: ${err?.message || err}`
    showToast('Error Pemindaian', err?.message || err, 'error', '❌')
  } finally {
    appScanBtn.disabled = false
    appScanBtn.textContent = '🔍 Pindai Otomatis (Scan Windows)'
  }
})

appAddBtn.addEventListener('click', () => {
  const name = appName.value.trim()
  if (!name) {
    statusEl.textContent = '⚠️ Isi nama aplikasi.'
    showToast('Nama Aplikasi Kosong', 'Harap isi nama aplikasi yang ingin ditambahkan', 'error', '⚠️')
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
  showToast('Aplikasi Ditambahkan! ✅', `Aplikasi "${name}" siap dipanggil via perintah suara/chat`, 'success', '⚡')
  appName.value = ''
  appCommand.value = ''
  pendingAppIcon = ''
  statusEl.textContent = 'Aplikasi ditambahkan.'
})

// --- Shortcut global ---
const shortcutList = document.getElementById('shortcut-list')

// Helper format accelerator untuk tampilan fisik keycap
function formatKeyName(part) {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
  switch (part) {
    case 'CommandOrControl':
      return isMac ? '⌘ Cmd' : 'Ctrl'
    case 'Control':
      return 'Ctrl'
    case 'Shift':
      return 'Shift'
    case 'Alt':
      return isMac ? '⌥ Opt' : 'Alt'
    case 'Meta':
      return isMac ? '⌘ Cmd' : 'Win'
    case 'Space':
      return 'Spasi'
    case 'Up':
      return '↑ Up'
    case 'Down':
      return '↓ Down'
    case 'Left':
      return '← Left'
    case 'Right':
      return '→ Right'
    default:
      return part
  }
}

function renderKeycapsHtml(accel) {
  if (!accel || !accel.trim()) {
    return `<span class="shortcut-keycaps muted" style="font-size:12px; color:var(--text-secondary);">Klik untuk atur</span>`
  }
  const parts = accel.split('+')
  const caps = parts.map((p) => `<kbd class="mac-kbd">${escapeHtml(formatKeyName(p))}</kbd>`)
  return `<span class="shortcut-keycaps">${caps.join('<span class="kbd-joiner">+</span>')}</span>`
}

async function renderShortcuts() {
  try {
    const list = await window.hermesAvatar.getShortcuts()
    if (!list || list.length === 0) {
      shortcutList.innerHTML = '<p class="hint" style="padding:16px;">Tidak ada shortcut.</p>'
      return
    }
    shortcutList.innerHTML = list.map((s) => {
      return `<div class="shortcut-card-row" data-id="${escapeHtml(s.id)}">
        <div class="shortcut-info">
          <span class="shortcut-title">${escapeHtml(s.label)}</span>
          <span class="shortcut-desc">ID Perintah: <code>${escapeHtml(s.id)}</code></span>
        </div>
        <div class="shortcut-action-group">
          <button type="button" class="shortcut-key-trigger" data-id="${escapeHtml(s.id)}" data-current="${escapeHtml(s.accel)}" data-new="${escapeHtml(s.accel)}" title="Klik untuk merekam kombinasi tombol baru">
            <span class="trigger-content">${renderKeycapsHtml(s.accel)}</span>
            <span class="shortcut-edit-icon">${renderIcon('pencil', { size: 12 })}</span>
          </button>
          <button class="mini-btn primary shortcut-save hidden" data-id="${escapeHtml(s.id)}" title="Simpan kombinasi tombol ini">Simpan</button>
        </div>
      </div>`
    }).join('')

    // Bind recording keyboard interaktif & tombol simpan
    shortcutList.querySelectorAll('.shortcut-card-row').forEach((row) => {
      const trigger = row.querySelector('.shortcut-key-trigger')
      const saveBtn = row.querySelector('.shortcut-save')
      const id = row.dataset.id

      let isRecording = false

      const startRecording = () => {
        // Matikan recording di baris lain jika ada
        shortcutList.querySelectorAll('.shortcut-key-trigger.recording').forEach((other) => {
          if (other !== trigger) {
            other.classList.remove('recording')
            const prev = other.dataset.new || other.dataset.current
            other.querySelector('.trigger-content').innerHTML = renderKeycapsHtml(prev)
          }
        })

        isRecording = true
        trigger.classList.add('recording')
        trigger.querySelector('.trigger-content').innerHTML = `
          <span class="kbd-rec-pulse"></span>
          <span class="kbd-rec-hint" style="font-size:11.5px; font-weight:500; color:var(--accent); margin-left:4px;">Tekan tombol... (Esc batal)</span>
        `
        trigger.focus()
      }

      const stopRecording = (applyNew = false, newAccel = null) => {
        isRecording = false
        trigger.classList.remove('recording')
        if (applyNew && newAccel) {
          trigger.dataset.new = newAccel
          trigger.querySelector('.trigger-content').innerHTML = renderKeycapsHtml(newAccel)
          if (newAccel !== trigger.dataset.current) {
            saveBtn.classList.remove('hidden')
          } else {
            saveBtn.classList.add('hidden')
          }
        } else {
          const prev = trigger.dataset.new || trigger.dataset.current
          trigger.querySelector('.trigger-content').innerHTML = renderKeycapsHtml(prev)
        }
      }

      trigger.addEventListener('click', (e) => {
        e.stopPropagation()
        if (isRecording) {
          stopRecording(false)
        } else {
          startRecording()
        }
      })

      trigger.addEventListener('keydown', (e) => {
        if (!isRecording) return
        e.preventDefault()
        e.stopPropagation()

        if (e.key === 'Escape') {
          stopRecording(false)
          return
        }

        const accel = keyEventToAccelerator(e)
        if (accel) {
          stopRecording(true, accel)
        }
      })

      saveBtn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const accel = (trigger.dataset.new || '').trim()
        if (!accel) {
          showToast('Kombinasi Kosong', 'Klik tombol kombinasi untuk merekam pintasan baru', 'error', '⚠️')
          return
        }
        try {
          saveBtn.disabled = true
          saveBtn.textContent = 'Menyimpan...'
          const res = await window.hermesAvatar.setShortcut(id, accel)
          if (!res?.ok) throw new Error(res?.error || 'Gagal menyimpan')
          trigger.dataset.current = accel
          saveBtn.classList.add('hidden')
          const label = row.querySelector('.shortcut-title')?.textContent || id
          const displayCombo = accel.split('+').map(formatKeyName).join(' + ')
          showToast('Shortcut Disimpan! ⌨️', `${label} diatur ke [${displayCombo}]`, 'success', '⌨️')
          statusEl.textContent = 'Shortcut disimpan.'
        } catch (err) {
          statusEl.textContent = `Gagal simpan shortcut: ${err?.message || err}`
          showToast('Gagal Simpan Shortcut', err?.message || err, 'error', '❌')
        } finally {
          saveBtn.disabled = false
          saveBtn.textContent = 'Simpan'
        }
      })
    })

    // Klik di luar membatalkan recording
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.shortcut-key-trigger')) {
        shortcutList.querySelectorAll('.shortcut-key-trigger.recording').forEach((tr) => {
          tr.classList.remove('recording')
          const prev = tr.dataset.new || tr.dataset.current
          tr.querySelector('.trigger-content').innerHTML = renderKeycapsHtml(prev)
        })
      }
    })
  } catch (err) {
    shortcutList.innerHTML = `<p class="hint" style="padding:16px;">Gagal memuat (${escapeHtml(err?.message || err)})</p>`
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
    showToast('Pilih Model Dulu', 'Silakan pilih model LLM dari daftar pilihan', 'error', '⚠️')
    return
  }
  llmSwitchBtn.disabled = true
  showToast('Menerapkan Model LLM...', `Mengalihkan model aktif ke "${value}"`, 'running', '🧠')
  try {
    const res = await window.hermesAvatar.setModel(value)
    if (!res.ok) throw new Error(res.error)
    statusEl.textContent = 'Model diterapkan.'
    showToast('Model Diterapkan! ✅', `Model LLM aktif: ${value}`, 'success', '🧠')
    await refreshLlmActive()
  } catch (err) {
    statusEl.textContent = `Gagal switch model: ${err?.message || err}`
    showToast('Gagal Menerapkan Model', err?.message || err, 'error', '❌')
  } finally {
    llmSwitchBtn.disabled = false
  }
})

function adaptPlatformCommands() {
  const isMac = (window.hermesAvatar?.platform === 'darwin') ||
    navigator.userAgent.includes('Macintosh') ||
    (navigator.platform && navigator.platform.toUpperCase().indexOf('MAC') >= 0)
  const isWin = window.hermesAvatar?.platform === 'win32'

  if (isMac || !isWin) {
    document.querySelectorAll('code').forEach((el) => {
      if (el.textContent.includes('py -m pip install')) {
        el.textContent = 'python3 -m pip install kokoro-onnx soundfile --break-system-packages'
      } else if (el.textContent.includes('py scripts/kokoro_server.py')) {
        el.textContent = 'python3 scripts/kokoro_server.py'
      }
    })

    document.querySelectorAll('[data-terminal-cmd]').forEach((btn) => {
      let cmd = btn.getAttribute('data-terminal-cmd')
      if (cmd && cmd.startsWith('py -m pip install')) {
        btn.setAttribute('data-terminal-cmd', 'python3 -m pip install kokoro-onnx soundfile --break-system-packages')
      } else if (cmd && cmd.startsWith('py scripts/')) {
        btn.setAttribute('data-terminal-cmd', 'python3 scripts/kokoro_server.py')
      }
    })

    document.querySelectorAll('[data-copy]').forEach((btn) => {
      let cmd = btn.getAttribute('data-copy')
      if (cmd && cmd.startsWith('py -m pip install')) {
        btn.setAttribute('data-copy', 'python3 -m pip install kokoro-onnx soundfile --break-system-packages')
      } else if (cmd && cmd.startsWith('py scripts/')) {
        btn.setAttribute('data-copy', 'python3 scripts/kokoro_server.py')
      }
    })
  }
}

function detectPlatform() {
  const isMac = (window.hermesAvatar?.platform === 'darwin') ||
    navigator.userAgent.includes('Macintosh') ||
    (navigator.platform && navigator.platform.toUpperCase().indexOf('MAC') >= 0)
  if (isMac) {
    document.documentElement.classList.add('is-mac')
    document.body.classList.add('is-mac')
  }
}

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
    const currentVer = res.currentVersion ? (res.currentVersion.startsWith('v') ? res.currentVersion : `v${res.currentVersion}`) : 'v0.1.3'
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

  const cur = cachedUpdateInfo?.currentVersion || '0.1.3'
  const lat = cachedUpdateInfo?.latestVersion || 'v0.1.3'
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

function init() {
  detectPlatform()
  adaptPlatformCommands()
  initThemeSwitcher()
  initWindowControls()
  initHistoryControls()
  initSidebarSearch()
  renderNav()
  refreshServiceStatus()
  bindPackageActions()
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
  initAppUpdateChecker()
}

init()
