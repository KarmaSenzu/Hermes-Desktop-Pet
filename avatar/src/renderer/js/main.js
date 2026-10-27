import { DesktopPet } from './desktop-pet.js'
import { loadModelFromBase64, loadMMDModel, loadFBXModel, loadVmdClip, loadGlbClip } from './model-loader.js'
import { AvatarController } from './avatar-controller.js'
import { Live2DAvatar } from './live2d-avatar.js'
import { voiceManager } from './voice-manager.js'
import { HermesClient } from './hermes-client.js'
import { AudioPlayer } from './audio-player.js'
import { synthesize } from './tts.js'
import { renderIcon } from './icons.js'
import { toSpeechText } from './speech-normalizer.js'
import { MusicPlayer } from './music-player.js'
import { tilingManager } from './tiling-manager.js'
import * as THREE from 'three'

/**
 * main.js — entry renderer untuk window avatar (index.html).
 * 1. Terima path model dari main process.
 * 2. Baca file model (via IPC) + load ke scene.
 * 3. Jalankan animasi idle + mock chat.
 */

const container = document.getElementById('app')
const pet = new DesktopPet(container)
pet.startRenderLoop()

let controller = null
let live2dPet = null
let mmdRef = null // { mesh, loader, helper } untuk playback .vmd
let modelScene = null // scene model aktif (untuk AnimationMixer .glb)
const audioPlayer = new AudioPlayer()
voiceManager.setAudioPlayer(audioPlayer)
const musicPlayer = new MusicPlayer()
musicPlayer.init()

// TTS on/off (bisa diatur lewat settings nanti).
let ttsEnabled = true

// Gabungan render-loop: idle (blink/napas/motion) + vrm.update + lip sync + mmd.
pet.onBeforeRender = (deltaMs) => {
  controller?.update(deltaMs)
  // three-vrm: update spring bone, lookAt, dll (delta dalam detik).
  controller?.vrm?.update?.(deltaMs / 1000)
  // MMD/GLB animation playback (AnimationMixer).
  animMixer?.update(deltaMs / 1000)
  if (audioPlayer.isPlaying && controller) {
    controller.setMouthLevel(audioPlayer.getLevel())
  }
}

// --- Interaksi desktop pet (fitur "ikuti kursor" + "klik → hati") ---
// Kursor bergerak → arahkan kepala/mata avatar ke kursor.
pet.onPointerMove = (clientX, clientY, w, h) => {
  controller?.lookAtPointer(clientX, clientY, w, h)
}

// Kursor keluar canvas → avatar kembali ke idle (berhenti mengikuti).
pet.onPointerLeave = () => {
  controller?.clearPointerLookAt()
}

// Klik pada avatar → mainkan reaksi sentuhan / greeting sesuai pengaturan animasi
pet.onAvatarClick = () => {
  triggerStateAnimation('greeting', 'sarangheo')
}

// Drag di area kosong → pindahkan window (gantikan app-region: drag).
pet.onDragMove = (dx, dy) => {
  window.hermesAvatar.dragMove(dx, dy)
}

// MIME type berdasarkan ekstensi file model.
const MIME_BY_EXT = {
  vrm: 'model/vrm',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  pmx: 'application/octet-stream',
  pmd: 'application/octet-stream',
  fbx: 'application/octet-stream'
}

// Ekstensi yang di-load via URL `model://` (butuh texture relatif dari disk).
const URL_BASED_EXTS = new Set(['pmx', 'pmd', 'fbx'])

// Terima path model dari main process (via preload).
window.hermesAvatar.onLoadModel(async (modelPath) => {
  try {
    const isLive2D = modelPath.toLowerCase().endsWith('.model3.json') || modelPath.toLowerCase().endsWith('.json')

    if (isLive2D) {
      const modelUrl = await window.hermesAvatar.getModelUrl(modelPath)
      // Hentikan render loop Three.js untuk hemat resource & cegah glitch double WebGL
      pet.stopRenderLoop()
      pet.renderer.domElement.style.display = 'none'

      if (!live2dPet) {
        live2dPet = new Live2DAvatar(container)
      } else {
        live2dPet.view.style.display = 'block'
      }
      await live2dPet.load(modelUrl)
      controller = live2dPet

      // Pasang handler klik pada avatar untuk toggle action menu ala YourMother
      live2dPet.onAvatarClick = () => {
        toggleCompanionMenu()
      }

      live2dPet.onDrag = () => {
        chatSheet?.classList.add('no-transition')
        timerPanel?.classList.add('no-transition')
        musicPanel?.classList.add('no-transition')
        tilingManager.tile()
        updateSpeechBubblePosition()
      }

      live2dPet.onDragEnd = () => {
        chatSheet?.classList.remove('no-transition')
        timerPanel?.classList.remove('no-transition')
        musicPanel?.classList.remove('no-transition')
      }

      live2dPet.onScaleChange = () => {
        tilingManager.tile()
        updateSpeechBubblePosition()
      }

      // Sinkronisasi gerakan mulut (lipsync) Live2D dengan output suara audio
      live2dPet.onUpdate = () => {
        if (audioPlayer.isPlaying) {
          live2dPet.setMouthLevel(audioPlayer.getLevel())
        } else {
          live2dPet.setMouthLevel(0)
        }
      }

      // Putar sapaan awal saat aplikasi dibuka + tampilkan balon dialog
      voiceManager.playStateVoice('welcome')
      showSpeechBubble('Halo! Selamat datang di Hermes Desktop Pet 👋', 5000)

      const exprNames = controller.availableExpressions()
      log('avatar', `Model Live2D dimuat. Ekspresi: ${exprNames.length}. Halo! 👋`)
      return
    }

    // Model 3D (VRM / GLB / MMD / FBX)
    pet.startRenderLoop()
    pet.renderer.domElement.style.display = 'block'
    if (live2dPet?.view) {
      live2dPet.view.style.display = 'none'
    }

    const result = await window.hermesAvatar.readModel(modelPath)
    if (!result.ok) throw new Error(result.error)

    const ext = result.ext

    let scene, vrm
    if (URL_BASED_EXTS.has(ext)) {
      // MMD/FBX: load via URL `model://` (custom protocol serve file + texture).
      const modelUrl = await window.hermesAvatar.getModelUrl(modelPath)
      if (ext === 'fbx') {
        const loaded = await loadFBXModel(modelUrl)
        scene = loaded.scene
        vrm = loaded.vrm
      } else {
        const loaded = await loadMMDModel(modelUrl)
        scene = loaded.scene
        vrm = loaded.vrm
        mmdRef = loaded.mmd // simpan untuk playback .vmd
      }
    } else {
      // VRM/GLB: load dari base64.
      const mime = MIME_BY_EXT[ext] || 'application/octet-stream'
      const loaded = await loadModelFromBase64(result.base64, mime)
      scene = loaded.scene
      vrm = loaded.vrm
    }

    pet.setModel(scene)
    modelScene = scene
    controller = new AvatarController(vrm)

    // Set pose default sesuai pengaturan (default A-pose).
    const pose = getPoseSetting()
    if (pose === 'a-pose') controller.setAPose()

    // Debug: tampilkan nama expression yang tersedia di model.
    const exprNames = controller.availableExpressions()
    log('avatar', `Ekspresi tersedia: ${exprNames.join(', ') || '(tidak ada)'}`)

    log('avatar', 'Model dimuat. Halo! 👋')
  } catch (err) {
    log('avatar', `Gagal memuat model: ${err.message}`)
  }
})

// --- Chat ke Hermes (Fase 2) ---
const form = document.getElementById('chat-form')
const input = document.getElementById('chat-input')
const chatLog = document.getElementById('chat-log')
const sendBtn = form.querySelector('button[type="submit"]')
const micBtn = document.getElementById('mic-btn')
const statusBubble = document.getElementById('status-bubble')
const chatSheet = document.getElementById('chat')
const commentToggle = document.getElementById('comment-toggle')
const sheetBackdrop = document.getElementById('sheet-backdrop')

// --- Elemen Chat Tools & Inline Executive Notulen (ala Antigravity) ---
const chatSummaryBtn = document.getElementById('chat-summary-btn')
const chatSizeToggleBtn = document.getElementById('chat-size-toggle-btn')
const chatResizeHandle = document.getElementById('chat-resize-handle')

// Riwayat sesi percakapan untuk pembuatan Notulen Rapat / Executive Summary
const sessionChatHistory = []
let isGeneratingSummary = false
let currentSummaryMarkdown = ''
let summaryStreamingBuffer = ''
let activeNotulenCard = null
let activeNotulenBody = null
let accumulatedDeltaText = ''

// Helper: isi tombol dengan icon Lucide (ganti emoji).
function setIcon(el, name, size = 18) {
  if (!el) return
  el.innerHTML = renderIcon(name, { size })
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

// --- Balon Subtitle Speech di Atas Kepala Avatar (ala YourMother) ---
const speechBubble = document.getElementById('speech-bubble')
const speechBubbleText = document.getElementById('speech-bubble-text')
let speechBubbleTimer = null

function updateSpeechBubblePosition() {
  if (!speechBubble || speechBubble.hidden || !live2dPet?.model) return

  const bounds = live2dPet._getAvatarBounds()
  if (!bounds) return

  const bubbleW = speechBubble.offsetWidth || 220
  const bubbleH = speechBubble.offsetHeight || 60
  const screenW = window.innerWidth
  const screenH = window.innerHeight

  let left = bounds.centerX - (bubbleW / 2)
  let top = bounds.top - bubbleH - 16

  if (top < 16) {
    top = bounds.top + 30
  }

  left = Math.max(16, Math.min(screenW - bubbleW - 16, left))
  top = Math.max(16, Math.min(screenH - bubbleH - 16, top))

  speechBubble.style.left = `${left}px`
  speechBubble.style.top = `${top}px`
}

function showSpeechBubble(text, duration = 6000) {
  if (!speechBubble || !speechBubbleText) return
  if (!text || !text.trim()) {
    hideSpeechBubble()
    return
  }

  speechBubbleText.textContent = text
  speechBubble.hidden = false
  requestAnimationFrame(() => {
    updateSpeechBubblePosition()
  })

  if (speechBubbleTimer) {
    clearTimeout(speechBubbleTimer)
    speechBubbleTimer = null
  }

  if (duration > 0) {
    speechBubbleTimer = setTimeout(() => {
      hideSpeechBubble()
    }, duration)
  }
}

function hideSpeechBubble() {
  if (!speechBubble) return
  speechBubble.hidden = true
  if (speechBubbleTimer) {
    clearTimeout(speechBubbleTimer)
    speechBubbleTimer = null
  }
}

speechBubble?.addEventListener('click', () => {
  hideSpeechBubble()
})

// --- Floating Companion Action Menu (ala YourMother MotherSelectMenu) ---
const companionHud = document.getElementById('companion-hud')

// --- Pemutar Musik & Lofi ala Spotify Mini ---
const musicPanel = document.getElementById('music-panel')

// --- Pomodoro & Focus Timer (ala YourMother) ---
const timerToggle = document.getElementById('timer-toggle')
const timerPanel = document.getElementById('timer-panel')
const timerCloseBtn = document.getElementById('timer-close-btn')
const timerTimeDisplay = document.getElementById('timer-time-display')
const timerStatusText = document.getElementById('timer-status-text')
const timerStartBtn = document.getElementById('timer-start-btn')
const timerResetBtn = document.getElementById('timer-reset-btn')
const timerPresets = document.querySelectorAll('.timer-preset-btn')

const timerTaskInput = document.getElementById('timer-task-input')
const timerDisplayBox = document.getElementById('timer-display-box')
const timerEditTimeBtn = document.getElementById('timer-edit-time-btn')
const timerCustomBox = document.getElementById('timer-custom-box')
const timerCustomMin = document.getElementById('timer-custom-min')
const timerCustomSec = document.getElementById('timer-custom-sec')
const timerCustomApplyBtn = document.getElementById('timer-custom-apply-btn')
const timerCustomCancelBtn = document.getElementById('timer-custom-cancel-btn')
const timerPresetCustomBtn = document.getElementById('timer-preset-custom-btn')
const timerOutfitToggle = document.getElementById('timer-outfit-toggle')

// --- Inisialisasi Tiling Window Manager (Auto-Layout / Auto-Adjust ala TWM) ---
tilingManager.init({
  avatarGetter: () => live2dPet?._getAvatarBounds(),
  hudElement: companionHud
})
tilingManager.register('timer', timerPanel, {
  baseWidth: 310,
  baseHeight: 240,
  minWidth: 280,
  type: 'tool'
})
tilingManager.register('music', musicPanel, {
  baseWidth: 325,
  baseHeight: 440,
  minWidth: 290,
  type: 'tool'
})
tilingManager.register('chat', chatSheet, {
  baseWidth: 380,
  baseHeight: 430,
  minWidth: 310,
  type: 'chat',
  getDimensions: () => getChatDimensions()
})

let timerTotalSeconds = 25 * 60
let timerRemainingSeconds = 25 * 60
let timerInterval = null
let isTimerRunning = false
let timerTask = localStorage.getItem('hermes-timer-task') || ''
if (timerTaskInput && timerTask) {
  timerTaskInput.value = timerTask
}

timerTaskInput?.addEventListener('input', (e) => {
  timerTask = e.target.value.trim()
  localStorage.setItem('hermes-timer-task', timerTask)
})

function formatTimer(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function updateTimerDisplay() {
  if (timerTimeDisplay) {
    timerTimeDisplay.textContent = formatTimer(timerRemainingSeconds)
  }
}

function updateTimerPanelPosition() {
  tilingManager.tile()
}

function updateMusicPanelPosition() {
  tilingManager.tile()
}

function updateMenuPosition() {
  tilingManager.tile()
}

// --- Preset Ukuran & Dimensi Chat ---
const CHAT_MODES = ['normal', 'expanded', 'compact']
const CHAT_MODE_DIMENSIONS = {
  compact: { width: 320, height: 290 },
  normal: { width: 380, height: 430 },
  expanded: { width: 560, height: 580 }
}
let chatModeIndex = 0

function getChatDimensions() {
  if (!chatSheet) return { width: 380, height: 430 }

  const styleW = parseFloat(chatSheet.style.getPropertyValue('--chat-width'))
  const styleH = parseFloat(chatSheet.style.getPropertyValue('--chat-height'))
  if (styleW && styleH) {
    return { width: styleW, height: styleH }
  }

  if (chatSheet.classList.contains('mode-compact')) {
    return CHAT_MODE_DIMENSIONS.compact
  }
  if (chatSheet.classList.contains('mode-expanded')) {
    return CHAT_MODE_DIMENSIONS.expanded
  }
  if (chatSheet.classList.contains('mode-normal')) {
    return CHAT_MODE_DIMENSIONS.normal
  }

  const curW = chatSheet.offsetWidth
  const curH = chatSheet.offsetHeight
  if (curW > 0 && curH > 0) {
    return { width: curW, height: curH }
  }

  return CHAT_MODE_DIMENSIONS.normal
}

function updateChatPosition() {
  tilingManager.tile()
}

function closeTimerPanel({ stopTimer = false } = {}) {
  if (!timerPanel) return
  timerPanel.hidden = true
  closeCustomTimeBox()

  if (stopTimer || !isTimerRunning) {
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
    isTimerRunning = false
    if (timerStartBtn) {
      timerStartBtn.textContent = '▶ Mulai'
      timerStartBtn.classList.remove('running')
    }
    if (timerStatusText) {
      timerStatusText.textContent = 'Siap untuk sesi fokus'
    }

    // Kembalikan ke pakaian casual saat jendela timer ditutup (di-close)
    const autoOutfit = timerOutfitToggle ? timerOutfitToggle.checked : true
    if (autoOutfit) {
      live2dPet?.setTimerFocusMode?.(false)
    }
  }

  // Auto-Adjust: Jendela yang tersisa otomatis bergeser mengisi ruang kosong
  tilingManager.tile()
}

function toggleCompanionMenu(forceState) {
  if (!companionHud) return
  const willShow = forceState !== undefined ? forceState : !companionHud.classList.contains('visible')

  if (willShow) {
    companionHud.classList.add('visible')
    requestAnimationFrame(() => {
      tilingManager.tile()
    })
  } else {
    companionHud.classList.remove('visible')
    // Jika timer TIDAK sedang berjalan, tutup panel timer dan kembalikan baju ke casual.
    if (timerPanel && !isTimerRunning) {
      closeTimerPanel({ stopTimer: false })
    }
    tilingManager.tile()
  }
}

// Listener event docking antar-panel (Auto-Layout / Auto-Adjust)
window.addEventListener('avatar:dock-panels-update', () => {
  tilingManager.tile()
})

// Listener riset musik online via Hermes AI
window.addEventListener('hermes:request-music-research', (e) => {
  const prompt = e.detail?.prompt || 'Tolong carikan rekomendasi stasiun lofi radio atau musik santai gratis di internet untuk menemani fokus!'
  if (chatSheet?.classList.contains('hidden')) {
    toggleChat()
  }
  if (input) {
    input.value = prompt
    input.focus()
  }
  showSpeechBubble('Mencarikan musik relaksasi di internet untukmu 🔍', 4000)
  form?.dispatchEvent(new Event('submit'))
})

// Tutup menu via tombol ✕
document.getElementById('hud-close-btn')?.addEventListener('click', (e) => {
  e.stopPropagation()
  toggleCompanionMenu(false)
})

// Klik di luar karakter dan menu otomatis menutup menu ala YourMother
window.addEventListener('mousedown', (e) => {
  if (e.target.closest('.interactive-ui')) return
  const hit = live2dPet?._hitTestModel(e.clientX, e.clientY)
  if (!hit) {
    toggleCompanionMenu(false)
  }
})

// --- Toggle Pomodoro Timer Panel ---
if (timerToggle && timerPanel) {
  timerToggle.addEventListener('click', (e) => {
    e.stopPropagation()
    const willShow = timerPanel.hidden
    if (willShow) {
      timerPanel.hidden = false
      const hudW = companionHud.offsetWidth || 64
      const hudH = companionHud.offsetHeight || 320
      const hudLeft = parseFloat(companionHud.style.left) || (window.innerWidth / 2 - hudW / 2)
      const hudTop = parseFloat(companionHud.style.top) || (window.innerHeight - 100)
      updateTimerPanelPosition(hudLeft, hudTop, hudW, hudH)

      // AUTO-GANTI BAJU: Langsung berubah ke jas & kacamata + animasi saat jendela timer diklik / dibuka
      const autoOutfit = timerOutfitToggle ? timerOutfitToggle.checked : true
      if (autoOutfit) {
        live2dPet?.setTimerFocusMode?.(true)
      }
    } else {
      closeTimerPanel({ stopTimer: true })
    }
  })
}

timerCloseBtn?.addEventListener('click', () => {
  closeTimerPanel({ stopTimer: true })
})

// Toggle Auto-Ganti Baju langsung bereaksi saat switch dicentang/dilepas
timerOutfitToggle?.addEventListener('change', () => {
  if (!timerOutfitToggle.checked) {
    live2dPet?.setTimerFocusMode?.(false)
  } else if (!timerPanel?.hidden || isTimerRunning) {
    live2dPet?.setTimerFocusMode?.(true)
  }
})

function openCustomTimeBox() {
  if (isTimerRunning) return
  if (!timerCustomBox) return
  timerCustomBox.hidden = false
  if (timerCustomMin) timerCustomMin.value = Math.floor(timerTotalSeconds / 60)
  if (timerCustomSec) timerCustomSec.value = String(timerTotalSeconds % 60).padStart(2, '0')
  timerCustomMin?.focus()
  timerCustomMin?.select()
}

function closeCustomTimeBox() {
  if (timerCustomBox) timerCustomBox.hidden = true
}

function applyCustomTime() {
  const m = parseInt(timerCustomMin?.value, 10) || 0
  const s = parseInt(timerCustomSec?.value, 10) || 0
  const total = Math.max(5, m * 60 + s) // minimal 5 detik
  timerTotalSeconds = total
  timerRemainingSeconds = total
  updateTimerDisplay()
  closeCustomTimeBox()

  timerPresets.forEach((b) => b.classList.remove('active'))
  if (timerPresetCustomBtn) timerPresetCustomBtn.classList.add('active')

  if (timerStatusText) {
    timerStatusText.textContent = `Durasi kustom: ${formatTimer(total)}`
  }

  // Pastikan pakaian fokus tetap aktif selama jendela timer terbuka
  const autoOutfit = timerOutfitToggle ? timerOutfitToggle.checked : true
  if (autoOutfit && !live2dPet?.isTimerFocusActive) {
    live2dPet?.setTimerFocusMode?.(true)
  }
}

timerDisplayBox?.addEventListener('click', (e) => {
  if (e.target.closest('#timer-edit-time-btn') || e.target === timerTimeDisplay || e.target === timerDisplayBox) {
    if (!isTimerRunning) openCustomTimeBox()
  }
})

timerEditTimeBtn?.addEventListener('click', (e) => {
  e.stopPropagation()
  if (!isTimerRunning) openCustomTimeBox()
})

timerPresetCustomBtn?.addEventListener('click', (e) => {
  e.stopPropagation()
  if (!isTimerRunning) openCustomTimeBox()
})

timerCustomApplyBtn?.addEventListener('click', applyCustomTime)
timerCustomCancelBtn?.addEventListener('click', closeCustomTimeBox)

timerCustomMin?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') applyCustomTime()
})
timerCustomSec?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') applyCustomTime()
})

timerPresets.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (isTimerRunning) return
    if (btn === timerPresetCustomBtn) return
    closeCustomTimeBox()
    timerPresets.forEach((b) => b.classList.remove('active'))
    btn.classList.add('active')
    const mins = parseInt(btn.dataset.minutes, 10) || 25
    timerTotalSeconds = mins * 60
    timerRemainingSeconds = timerTotalSeconds
    updateTimerDisplay()
    if (timerStatusText) timerStatusText.textContent = `Sesi fokus ${mins} menit`

    // Pastikan pakaian fokus tetap aktif selama jendela timer terbuka
    const autoOutfit = timerOutfitToggle ? timerOutfitToggle.checked : true
    if (autoOutfit && !live2dPet?.isTimerFocusActive) {
      live2dPet?.setTimerFocusMode?.(true)
    }
  })
})

function startTimer() {
  if (isTimerRunning) {
    // Jeda (Pause)
    clearInterval(timerInterval)
    timerInterval = null
    isTimerRunning = false
    if (timerStartBtn) {
      timerStartBtn.textContent = '▶ Lanjutkan'
      timerStartBtn.classList.remove('running')
    }
    if (timerStatusText) timerStatusText.textContent = 'Sesi fokus dijeda'
    return
  }

  // Mulai (Start)
  isTimerRunning = true
  closeCustomTimeBox()
  if (timerStartBtn) {
    timerStartBtn.textContent = '⏸ Jeda'
    timerStartBtn.classList.add('running')
  }

  const taskName = timerTask || 'Fokus'
  if (timerStatusText) timerStatusText.textContent = `Sesi ${taskName} berlangsung...`

  // 1. Ganti Baju Fokus (Jas & Kacamata) bila diaktifkan ala YourMother
  const autoOutfit = timerOutfitToggle ? timerOutfitToggle.checked : true
  if (autoOutfit) {
    live2dPet?.setTimerFocusMode?.(true)
  }

  // 2. Efek visual & sapaan AI
  if (live2dPet?.model) {
    live2dPet.spawnHeart(live2dPet.model.x, live2dPet.model.y - 120, '⏱️')
  }

  // Jika baru mulai dari awal, berikan sapaan semangat personal
  if (timerRemainingSeconds === timerTotalSeconds) {
    const startMsg = timerTask
      ? `Sesi ${timerTask} dimulai! Semangat ya, aku temani di sini 🌸`
      : 'Sesi fokus dimulai! Semangat ya, aku temani di sini 🌸'
    showSpeechBubble(startMsg, 6000)
    speak(startMsg, 'focus')
  }

  timerInterval = setInterval(() => {
    timerRemainingSeconds--
    updateTimerDisplay()

    if (timerRemainingSeconds <= 0) {
      clearInterval(timerInterval)
      timerInterval = null
      isTimerRunning = false
      if (timerStartBtn) {
        timerStartBtn.textContent = '▶ Mulai Sesi Baru'
        timerStartBtn.classList.remove('running')
      }
      if (timerStatusText) timerStatusText.textContent = '🎉 Selesai! Saatnya istirahat'

      controller?.playEmote('happy')
      if (live2dPet?.model) {
        live2dPet.spawnHeart(live2dPet.model.x, live2dPet.model.y - 120, '🎉')
      }

      // Kembali ke baju santai/casual setelah sesi fokus selesai
      if (autoOutfit) {
        live2dPet?.setTimerFocusMode?.(false)
      }

      const finishMsg = timerTask
        ? `Waktu fokus untuk ${timerTask} selesai! Kerja bagus sekali. Yuk istirahat dulu sejenak 🌸`
        : 'Waktu fokus selesai! Kerja bagus sekali. Yuk istirahat dulu sejenak 🌸'
      showSpeechBubble(finishMsg, 9000)
      speak(finishMsg, 'happy')
    }
  }, 1000)
}

function resetTimer() {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
  isTimerRunning = false
  timerRemainingSeconds = timerTotalSeconds
  updateTimerDisplay()
  closeCustomTimeBox()

  // Hanya kembalikan outfit ke casual bila jendela timer sudah tertutup.
  // Selama jendela timer masih muncul, avatar tetap mengenakan baju fokus.
  const autoOutfit = timerOutfitToggle ? timerOutfitToggle.checked : true
  if (autoOutfit && (!timerPanel || timerPanel.hidden)) {
    live2dPet?.setTimerFocusMode?.(false)
  }

  if (timerStartBtn) {
    timerStartBtn.textContent = '▶ Mulai'
    timerStartBtn.classList.remove('running')
  }
  if (timerStatusText) timerStatusText.textContent = 'Siap untuk sesi fokus'
}

timerStartBtn?.addEventListener('click', startTimer)
timerResetBtn?.addEventListener('click', resetTimer)
// --- Toggle chat: klik ikon → sembunyikan/tampilkan chat ---
function toggleChat() {
  if (!chatSheet) return
  const isHidden = chatSheet.classList.contains('hidden')
  if (isHidden) {
    chatSheet.classList.add('no-transition')
    chatSheet.classList.remove('hidden')
    // Posisikan window chat tepat di samping tubuh avatar secara instan & akurat
    updateChatPosition()
    void chatSheet.offsetWidth
    requestAnimationFrame(() => {
      updateChatPosition()
      chatSheet.classList.remove('no-transition')
    })

    window.hermesAvatar?.setChatFocus?.(true)
    window.hermesAvatar?.setIgnoreMouse?.(false)
    if (live2dPet) live2dPet.ignoringMouse = false

    setTimeout(() => {
      input?.focus()
    }, 50)
  } else {
    chatSheet.classList.add('hidden')
    input?.blur()
    window.hermesAvatar?.setChatFocus?.(false)

    // Kembalikan click-through jika kursor di luar avatar
    window.hermesAvatar?.setIgnoreMouse?.(true, true)
    if (live2dPet) live2dPet.ignoringMouse = true

    // Auto-Adjust: Jendela yang tersisa otomatis bergeser mengisi ruang kosong
    tilingManager.tile()
  }
}

commentToggle?.addEventListener('click', (e) => {
  e.stopPropagation()
  toggleChat()
})

document.getElementById('chat-close-btn')?.addEventListener('click', (e) => {
  e.stopPropagation()
  toggleChat()
})

// Pastikan input chat menerima ketikan secara lancar tanpa interupsi
input?.addEventListener('keydown', (e) => {
  e.stopPropagation() // Cegah shortcut global atau handler level document menelan karakter ketikan
})

input?.addEventListener('keyup', (e) => {
  e.stopPropagation()
})

input?.addEventListener('keypress', (e) => {
  e.stopPropagation()
})

input?.addEventListener('focus', () => {
  window.hermesAvatar?.setIgnoreMouse?.(false)
  if (live2dPet) live2dPet.ignoringMouse = false
})

input?.addEventListener('mousedown', (e) => {
  e.stopPropagation()
  window.hermesAvatar?.setIgnoreMouse?.(false)
  if (live2dPet) live2dPet.ignoringMouse = false
})

chatSheet?.addEventListener('mouseenter', () => {
  window.hermesAvatar?.setIgnoreMouse?.(false)
  if (live2dPet) live2dPet.ignoringMouse = false
})

chatSheet?.addEventListener('mouseleave', (e) => {
  // Bila mouse keluar dari kotak chat, periksa apakah berada di atas avatar atau menu
  const hitChar = live2dPet?._hitTestModel?.(e.clientX, e.clientY)
  const hitUI = !!e.relatedTarget?.closest?.('.interactive-ui')
  if (!hitChar && !hitUI) {
    window.hermesAvatar?.setIgnoreMouse?.(true, true)
    if (live2dPet) live2dPet.ignoringMouse = true
  }
})

chatSheet?.addEventListener('mousedown', (e) => {
  e.stopPropagation()
  window.hermesAvatar?.setIgnoreMouse?.(false)
  if (live2dPet) live2dPet.ignoringMouse = false
})

function applyChatMode(mode, save = true) {
  if (!chatSheet) return
  chatSheet.classList.remove('mode-compact', 'mode-normal', 'mode-expanded')
  chatSheet.style.removeProperty('--chat-width')
  chatSheet.style.removeProperty('--chat-height')

  let targetW = null
  let targetH = null

  if (mode === 'custom') {
    try {
      const savedCustom = JSON.parse(localStorage.getItem('hermes-chat-size') || '{}')
      if (savedCustom.width && savedCustom.height) {
        targetW = savedCustom.width
        targetH = savedCustom.height
        chatSheet.style.setProperty('--chat-width', `${savedCustom.width}px`)
        chatSheet.style.setProperty('--chat-height', `${savedCustom.height}px`)
      } else {
        chatSheet.classList.add('mode-normal')
        targetW = CHAT_MODE_DIMENSIONS.normal.width
        targetH = CHAT_MODE_DIMENSIONS.normal.height
      }
    } catch {
      chatSheet.classList.add('mode-normal')
      targetW = CHAT_MODE_DIMENSIONS.normal.width
      targetH = CHAT_MODE_DIMENSIONS.normal.height
    }
  } else {
    chatSheet.classList.add(`mode-${mode}`)
    chatModeIndex = CHAT_MODES.indexOf(mode)
    if (chatModeIndex < 0) chatModeIndex = 0
    if (CHAT_MODE_DIMENSIONS[mode]) {
      targetW = CHAT_MODE_DIMENSIONS[mode].width
      targetH = CHAT_MODE_DIMENSIONS[mode].height
    }
  }

  if (save) {
    localStorage.setItem('hermes-chat-mode', mode)
  }

  if (chatSizeToggleBtn) {
    const labels = {
      compact: 'Ringkas (320px)',
      normal: 'Normal (380px)',
      expanded: 'Luas (560px)',
      custom: 'Kustom'
    }
    chatSizeToggleBtn.title = `Mode Ukuran: ${labels[mode] || mode} (Klik untuk ganti preset)`
  }

  updateChatPosition(targetW, targetH)
}

// Inisialisasi ukuran chat tersimpan
const initialChatMode = localStorage.getItem('hermes-chat-mode') || 'normal'
applyChatMode(initialChatMode, false)

// Tombol toggle preset ukuran chat
chatSizeToggleBtn?.addEventListener('click', (e) => {
  e.stopPropagation()
  chatModeIndex = (chatModeIndex + 1) % CHAT_MODES.length
  const nextMode = CHAT_MODES[chatModeIndex]
  applyChatMode(nextMode, true)
  showSpeechBubble(`Ukuran Chat: ${nextMode.toUpperCase()} ⛶`, 1800)
})

// Handle drag resize bebas pada sudut chat
if (chatResizeHandle && chatSheet) {
  let isResizing = false
  let startX = 0
  let startY = 0
  let startWidth = 380
  let startHeight = 430

  chatResizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    isResizing = true
    chatSheet.classList.add('is-resizing')
    startX = e.clientX
    startY = e.clientY
    startWidth = chatSheet.offsetWidth
    startHeight = chatSheet.offsetHeight

    window.hermesAvatar?.setIgnoreMouse?.(false)
    if (live2dPet) live2dPet.ignoringMouse = false

    const onMouseMove = (ev) => {
      if (!isResizing) return
      // Handle ada di top-left: geser ke kiri menambah lebar, geser ke atas menambah tinggi
      const deltaX = startX - ev.clientX
      const deltaY = startY - ev.clientY

      const newWidth = Math.max(290, Math.min(820, startWidth + deltaX))
      const newHeight = Math.max(250, Math.min(Math.floor(window.innerHeight * 0.85), startHeight + deltaY))

      chatSheet.classList.remove('mode-compact', 'mode-normal', 'mode-expanded')
      chatSheet.style.setProperty('--chat-width', `${newWidth}px`)
      chatSheet.style.setProperty('--chat-height', `${newHeight}px`)

      updateChatPosition(newWidth, newHeight)
    }

    const onMouseUp = () => {
      if (!isResizing) return
      isResizing = false
      chatSheet.classList.remove('is-resizing')
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)

      const finalWidth = chatSheet.offsetWidth
      const finalHeight = chatSheet.offsetHeight
      localStorage.setItem('hermes-chat-mode', 'custom')
      localStorage.setItem('hermes-chat-size', JSON.stringify({ width: finalWidth, height: finalHeight }))
      if (chatSizeToggleBtn) {
        chatSizeToggleBtn.title = 'Mode Ukuran: Kustom (Klik untuk ganti preset)'
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  })
}

// --- Renderer Markdown Komprehensif & Terstruktur untuk Chat & Notulen ---
function formatInline(text) {
  if (!text) return ''
  return text
    // Inline code `code`
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    // Bold **text** or __text__
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    // Italic *text* or _text_
    .replace(/(^|[^\*])\*([^\*\n]+)\*([^\*]|$)/g, '$1<em>$2</em>$3')
    .replace(/(^|[^_])_([^_\n]+)_([^_]|$)/g, '$1<em>$2</em>$3')
    // Strikethrough ~~text~~
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    // Links [text](url)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
}

function parseMarkdownTables(text) {
  const tableBlockRegex = /(?:^|\n)((?:[ \t]*\|?[^\n|]+(?:\|[^\n|]+)+\|?[ \t]*\n)(?:[ \t]*\|?[ \t]*(?::?-{2,}:?[ \t]*\|)+(?:[ \t]*:?-{2,}:?[ \t]*)?\n)(?:[ \t]*\|?[^\n|]+(?:\|[^\n|]+)+\|?[ \t]*(?:\n|$))+)/g

  return text.replace(tableBlockRegex, (match, block) => {
    const lines = block.trim().split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length < 2) return match

    const headerLine = lines[0]
    const separatorLine = lines[1]
    const dataLines = lines.slice(2)

    if (!/^\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?$/.test(separatorLine)) {
      return match
    }

    const parseRow = (line) => {
      let clean = line.replace(/^\|/, '').replace(/\|$/, '')
      return clean.split('|').map((cell) => cell.trim())
    }

    const parseAlignments = (line) => {
      let clean = line.replace(/^\|/, '').replace(/\|$/, '')
      return clean.split('|').map((cell) => {
        const c = cell.trim()
        if (c.startsWith(':') && c.endsWith(':')) return 'center'
        if (c.endsWith(':')) return 'right'
        return 'left'
      })
    }

    const alignments = parseAlignments(separatorLine)
    const headers = parseRow(headerLine)

    let out = '\n<div class="table-container"><table class="markdown-table"><thead><tr>'
    headers.forEach((h, i) => {
      const align = alignments[i] ? ` style="text-align:${alignments[i]}"` : ''
      out += `<th${align}>${formatInline(h)}</th>`
    })
    out += '</tr></thead><tbody>'

    dataLines.forEach((rowLine) => {
      const cells = parseRow(rowLine)
      out += '<tr>'
      headers.forEach((_, i) => {
        const val = cells[i] !== undefined ? cells[i] : ''
        const align = alignments[i] ? ` style="text-align:${alignments[i]}"` : ''
        out += `<td${align}>${formatInline(val)}</td>`
      })
      out += '</tr>'
    })

    out += '</tbody></table></div>\n'
    return out
  })
}

function renderMarkdown(md) {
  if (!md) return ''

  // 1. Standarisasi line break Windows CRLF -> LF
  let raw = String(md).replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // 2. Proteksi & Ekstrak Code Blocks (```lang ... ```)
  const codeBlocks = []
  raw = raw.replace(/```([a-z0-9_-]+)?\n([\s\S]*?)```/gi, (_, lang, code) => {
    const idx = codeBlocks.length
    const cleanCode = escapeHtml(code.trim())
    codeBlocks.push(`<pre class="code-block"><code class="language-${lang || 'text'}">${cleanCode}</code></pre>`)
    return `\n%%CODEBLOCK_${idx}%%\n`
  })

  // 3. Escape HTML pada sisa teks agar aman
  let text = escapeHtml(raw)

  // 4. Parse Tables
  text = parseMarkdownTables(text)

  // 5. Horizontal Rules (---, ***, ___)
  text = text.replace(/^[ \t]*([-*_]){3,}[ \t]*$/gm, '\n<hr class="markdown-hr">\n')

  // 6. Blockquotes (> ...)
  text = text.replace(/(?:^[ \t]*\&gt;[^\n]*(?:\n|$))+/gm, (match) => {
    const lines = match.split('\n')
      .map((l) => l.replace(/^[ \t]*\&gt;\s?/, '').trim())
      .filter(Boolean)
    return `\n<blockquote>${lines.map(formatInline).join('<br>')}</blockquote>\n`
  })

  // 7. Parse line by line dengan state machine terstruktur untuk list & sub-items
  const rawLines = text.split('\n')
  const blocks = []
  let currentList = null // { type: 'ol' | 'ul', items: [] }
  let currentParagraph = []

  function flushParagraph() {
    if (currentParagraph.length > 0) {
      const pText = currentParagraph.join('\n').trim()
      if (pText) {
        blocks.push(`<p>${formatInline(pText).replace(/\n/g, '<br>')}</p>`)
      }
      currentParagraph = []
    }
  }

  function flushList() {
    if (currentList) {
      const tag = currentList.type
      const itemsHtml = currentList.items.map((it) => {
        let titleHtml = formatInline(it.text)
        let subHtml = ''
        if (it.subLines && it.subLines.length > 0) {
          const formattedSubLines = it.subLines.map((sl) => {
            const bMatch = sl.match(/^[-*+•]\s+(.*)$/)
            if (bMatch) {
              return `<li class="sub-bullet-item">${formatInline(bMatch[1])}</li>`
            }
            return `<div class="sub-paragraph">${formatInline(sl)}</div>`
          })

          if (formattedSubLines.some((l) => l.startsWith('<li'))) {
            subHtml = `<ul class="sub-list">${formattedSubLines.join('')}</ul>`
          } else {
            subHtml = `<div class="sub-content">${formattedSubLines.join('')}</div>`
          }
        }

        if (tag === 'ol') {
          return `<li class="numbered-item" data-num="${it.num}"><div class="item-title">${titleHtml}</div>${subHtml}</li>`
        }

        if (it.isTask) {
          const check = it.checked ? '☑' : '☐'
          const cls = it.checked ? 'task-item completed' : 'task-item'
          return `<li class="${cls}"><span class="task-checkbox">${check}</span> <div class="item-title">${titleHtml}</div>${subHtml}</li>`
        }

        return `<li class="bullet-item"><div class="item-title">${titleHtml}</div>${subHtml}</li>`
      }).join('')

      blocks.push(`<${tag} class="markdown-${tag}">${itemsHtml}</${tag}>`)
      currentList = null
    }
  }

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]
    const trimmed = line.trim()

    // Baris kosong
    if (!trimmed) {
      flushParagraph()
      let nextNonEmptyIndex = -1
      for (let j = i + 1; j < rawLines.length; j++) {
        if (rawLines[j].trim()) {
          nextNonEmptyIndex = j
          break
        }
      }

      if (nextNonEmptyIndex !== -1 && currentList) {
        const nextLine = rawLines[nextNonEmptyIndex].trim()
        const isNextList = /^(\d+\.|[-*+•]|- \[[ xX]\])/.test(nextLine)
        const isNextMajorBlock = /^(\#{1,6}\s+|<hr|<div|<blockquote|%%CODEBLOCK_)/.test(nextLine)

        if (isNextMajorBlock) {
          flushList()
        } else if (!isNextList && currentList.type === 'ol') {
          continue
        } else if (!isNextList) {
          flushList()
        }
      } else if (!currentList) {
        continue
      }
      continue
    }

    // A. Blok HTML langsung
    if (trimmed.startsWith('<div class="table-container">') ||
        trimmed.startsWith('<hr class="markdown-hr">') ||
        trimmed.startsWith('<blockquote>') ||
        trimmed.startsWith('%%CODEBLOCK_')) {
      flushParagraph()
      flushList()
      blocks.push(trimmed)
      continue
    }

    // B. Header
    const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (headerMatch) {
      flushParagraph()
      flushList()
      const level = headerMatch[1].length
      const title = formatInline(headerMatch[2])
      blocks.push(`<h${level}>${title}</h${level}>`)
      continue
    }

    // C. Task Item
    const taskMatch = trimmed.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/)
    if (taskMatch) {
      flushParagraph()
      if (!currentList || currentList.type !== 'ul') {
        flushList()
        currentList = { type: 'ul', items: [] }
      }
      const checked = taskMatch[1].toLowerCase() === 'x'
      currentList.items.push({ isTask: true, checked, text: taskMatch[2], subLines: [] })
      continue
    }

    // D. Numbered List Item (1. Title)
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/)
    if (numMatch) {
      flushParagraph()
      if (!currentList || currentList.type !== 'ol') {
        flushList()
        currentList = { type: 'ol', items: [] }
      }
      currentList.items.push({ num: numMatch[1], text: numMatch[2], subLines: [] })
      continue
    }

    // E. Bullet List Item
    const bulletMatch = trimmed.match(/^[-*+•]\s+(.*)$/)
    if (bulletMatch) {
      flushParagraph()
      if (currentList && currentList.type === 'ol' && currentList.items.length > 0) {
        const lastItem = currentList.items[currentList.items.length - 1]
        lastItem.subLines.push(trimmed)
        continue
      }
      if (!currentList || currentList.type !== 'ul') {
        flushList()
        currentList = { type: 'ul', items: [] }
      }
      currentList.items.push({ text: bulletMatch[1], subLines: [] })
      continue
    }

    // F. Sub-detail dari list item yang sedang aktif
    if (currentList && currentList.items.length > 0) {
      const lastItem = currentList.items[currentList.items.length - 1]
      lastItem.subLines.push(trimmed)
      continue
    }

    // G. Paragraf normal
    flushList()
    currentParagraph.push(trimmed)
  }

  flushParagraph()
  flushList()

  // 8. Restore Codeblocks
  let finalHtml = blocks.join('\n')
  finalHtml = finalHtml.replace(/%%CODEBLOCK_(\d+)%%/g, (_, idx) => {
    return codeBlocks[Number(idx)] || ''
  })

  return finalHtml
}

// Cek apakah pesan adalah perintah membuat notulen / ringkasan percakapan
function isSummaryRequest(text) {
  if (!text) return false
  const t = text.trim().toLowerCase()
  return (
    /^(?:tolong\s+)?(?:buatkan|buat|bikin|tampilkan|open|generate|show)?\s*(?:notulen|ringkasan|summary|minutes)(?:\s+(?:rapat|meeting|percakapan|diskusi|chat|sesi))?/i.test(t) ||
    /(?:buatkan|bikin|tuliskan)\s+(?:notulen|ringkasan)/i.test(t)
  )
}

// Finalisasi kartu notulen di chat dengan tombol aksi interaktif
function finalizeActiveNotulenCard(markdown) {
  if (!activeNotulenCard) return
  const actions = activeNotulenCard.querySelector('.notulen-card-actions')
  if (actions) actions.style.display = 'flex'

  const copyBtn = activeNotulenCard.querySelector('.notulen-copy-btn')
  const fileBtn = activeNotulenCard.querySelector('.notulen-file-btn')
  const memBtn = activeNotulenCard.querySelector('.notulen-mem-btn')

  copyBtn?.addEventListener('click', async (e) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(markdown)
      const orig = copyBtn.textContent
      copyBtn.textContent = '✓ Tersalin!'
      showSpeechBubble('Notulen berhasil disalin ke clipboard! 📋', 3000)
      setTimeout(() => { copyBtn.textContent = orig }, 2500)
    } catch (err) {
      console.error('Gagal salin notulen:', err)
    }
  })

  fileBtn?.addEventListener('click', (e) => {
    e.stopPropagation()
    try {
      const now = new Date()
      const dStr = now.toISOString().slice(0, 10)
      const tStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
      const filename = `Notulen_Hermes_${dStr}_${tStr}.md`
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      const orig = fileBtn.textContent
      fileBtn.textContent = '✓ Tersimpan!'
      showSpeechBubble(`Notulen diunduh sebagai ${filename} 💾`, 3500)
      setTimeout(() => { fileBtn.textContent = orig }, 2500)
    } catch (err) {
      console.error('Gagal simpan file notulen:', err)
    }
  })

  memBtn?.addEventListener('click', async (e) => {
    e.stopPropagation()
    if (!hermesReady) {
      showSpeechBubble('Hermes belum terhubung untuk simpan memori ⚠️', 3000)
      return
    }
    const orig = memBtn.textContent
    memBtn.disabled = true
    memBtn.textContent = '🧠 Menyimpan...'
    try {
      const memPrompt = `[Instruksi Sistem Mnemosyne: Simpan ringkasan notulen berikut ke dalam memori jangka panjang]:\n${markdown}`
      await hermes.submitPrompt(memPrompt)
      memBtn.textContent = '✓ Tersimpan di Mnemosyne!'
      controller?.setExpression('happy')
      showSpeechBubble('Notulen tersimpan permanen di memori Mnemosyne! 🧠', 4000)
      speak('Notulen percakapan berhasil disimpan ke memori jangka panjang Mnemosyne.', 'happy')
      setTimeout(() => {
        memBtn.disabled = false
        memBtn.textContent = orig
      }, 3500)
    } catch (err) {
      memBtn.disabled = false
      memBtn.textContent = '⚠️ Gagal Simpan'
      showSpeechBubble(`Gagal simpan ke Mnemosyne: ${err.message}`, 3500)
      setTimeout(() => { memBtn.textContent = orig }, 3000)
    }
  })
}

// Eksekusi Pembuatan Notulen Eksekutif LANGSUNG DI CHAT (ala Antigravity)
async function generateExecutiveSummary() {
  // Pastikan chat terbuka agar pengguna bisa melihat prosesnya
  if (chatSheet?.classList.contains('hidden')) {
    toggleChat()
  }

  // Minimal 2 pesan percakapan bermakna
  const meaningfulMessages = sessionChatHistory.filter(
    (m) => m.text && !m.text.startsWith('Halo! Selamat datang') && !m.text.startsWith('Model')
  )

  if (meaningfulMessages.length < 2) {
    showSpeechBubble('Percakapan belum cukup untuk dibuatkan notulen. Mari diskusi dulu! 💬', 4000)
    log('avatar', '⚠️ *Percakapan belum cukup untuk dibuatkan notulen. Mari mengobrol terlebih dahulu!* 💬')
    speak('Percakapan kita belum cukup banyak untuk dibuatkan notulen.', 'neutral')
    return
  }

  if (!hermesReady) {
    showSpeechBubble('Hermes belum terhubung ⚠️', 3000)
    log('avatar', '⚠️ *Hermes belum terhubung ke sistem.*')
    return
  }

  const now = new Date()
  const dateFormatted = now.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
  const timeFormatted = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit'
  })

  // Buat Kartu Notulen Eksekutif langsung di dalam Chat Stream!
  activeNotulenCard = document.createElement('div')
  activeNotulenCard.className = 'avatar notulen-chat-card'
  activeNotulenCard.innerHTML = `
    <div class="notulen-card-header">
      <div class="notulen-badge">📋 NOTULEN PERCAKAPAN EKSEKUTIF</div>
      <span class="notulen-timestamp">📅 ${dateFormatted}, ${timeFormatted} WIB</span>
    </div>
    <div class="notulen-card-body markdown-body">
      <div class="summary-loading">
        <div class="summary-spinner"></div>
        <p>Sedang menganalisis ${meaningfulMessages.length} pesan, membersihkan teks (denoising), dan menyusun notulen...</p>
      </div>
    </div>
    <div class="notulen-card-actions" style="display: none;">
      <button type="button" class="notulen-card-btn notulen-copy-btn" title="Salin ke clipboard">📋 Salin Markdown</button>
      <button type="button" class="notulen-card-btn notulen-file-btn" title="Unduh file .md">💾 Simpan (.md)</button>
      <button type="button" class="notulen-card-btn notulen-mem-btn primary" title="Simpan permanen ke Mnemosyne">🧠 Simpan ke Mnemosyne</button>
    </div>
  `
  chatLog.appendChild(activeNotulenCard)
  chatLog.scrollTop = chatLog.scrollHeight

  activeNotulenBody = activeNotulenCard.querySelector('.notulen-card-body')

  controller?.setExpression('thinking')
  setStatus('Menyusun Notulen 📋')
  showSpeechBubble('Menyusun notulen eksekutif di chat... 📋', 4000)
  speak('Saya sedang menganalisis percakapan kita dan menyusun notulen langsung di chat.', 'neutral')

  // Buat transkrip teks percakapan
  const transcriptLines = meaningfulMessages.map((m) => {
    const sender = m.role === 'user' ? 'Pengguna' : 'Hermes AI'
    return `[${m.time}] ${sender}: ${m.text}`
  })
  const transcriptText = transcriptLines.join('\n')

  const prompt = `[INSTRUKSI SISTEM: EXECUTIVE MEETING MINUTES & CONVERSATION SUMMARY ALA ANTIGRAVITY]
Anda bertindak sebagai Executive Intelligence AI tingkat tinggi. Buatlah Notulen & Ringkasan Percakapan Resmi yang sangat rapi, koheren, dan profesional seperti gaya laporan eksekutif Google Antigravity.

Transkrip percakapan sesi ini:
---
${transcriptText}
---

Instruksi Khusus:
1. Lakukan Pembersihan Teks (Denoising): Buang kata-kata gagap, pengulangan kata, dan bahasa lisan tidak perlu.
2. Restrukturisasi Kalimat: Ubah dialog santai menjadi bahasa tulis profesional dan berwibawa.
3. Ekstraksi Keputusan & Action Items: Pisahkan mana ide utama, keputusan yang dicapai, dan tugas tindak lanjut.
4. Gunakan format Markdown yang presisi dengan struktur persis seperti di bawah:

# 📋 Executive Summary: Sesi Diskusi Hermes AI

> **Ringkasan Eksekutif:**
> [Tuliskan 2-3 kalimat ringkas intisari percakapan, topik utama yang dibahas, dan kesimpulan akhir tanpa basa-basi]

### 💡 Poin-Poin Kunci & Diskusi Utama (Key Takeaways)
- **[Topik/Poin 1]:** Penjelasan padat dan jelas.
- **[Topik/Poin 2]:** Penjelasan padat dan jelas.

### 🎯 Keputusan yang Disepakati (Decisions Made)
- [Keputusan konkret 1]
- [Keputusan konkret 2]

### ✅ Action Items & Tindak Lanjut
- [ ] [Langkah konkret berikutnya 1]
- [ ] [Langkah konkret berikutnya 2]

### 📝 Catatan Teknis / Konteks Tambahan
[Cantumkan detail teknis, command, path, konfigurasi, atau referensi penting yang disebut dalam sesi. Jika tidak ada, tulis "Sesi diskusi umum."]

Pedoman: Jangan tambahkan tag emosi seperti [emotion:...] atau [affect:...]. Langsung tuliskan output Markdown.`

  isGeneratingSummary = true
  summaryStreamingBuffer = ''
  currentSummaryMarkdown = ''
  setInputLocked(true)

  try {
    await hermes.submitPrompt(prompt)
  } catch (err) {
    isGeneratingSummary = false
    setInputLocked(false)
    if (activeNotulenBody) {
      activeNotulenBody.innerHTML = `<p style="color: #f87171;">⚠️ Gagal meminta ringkasan: ${escapeHtml(err.message)}</p>`
    }
  }
}

// Event listener tombol Notulen di header (jika ada)
chatSummaryBtn?.addEventListener('click', (e) => {
  e.stopPropagation()
  generateExecutiveSummary()
})

// ==========================================================================
// AI Assessment Tool / Multiple Choice Interactive Capabilities System
// ==========================================================================

let activeAssessmentCard = null

// Cek apakah pesan adalah pertanyaan seputar kemampuan / menu fitur / apa yang bisa dilakukan
function isCapabilityRequest(text) {
  if (!text) return false
  const t = text.toLowerCase().trim()
  return (
    /\b(apa\s+(?:saja\s+)?(?:yang\s+)?(?:bisa\s+)?(?:kamu|anda)\s+(?:bisa|lakukan)|kamu\s+bisa\s+apa|bisa\s+(?:bantu|tolong)\s+apa|fitur\s+(?:apa\s+)?saja|kemampuan(?:mu)?|keunggulan(?:mu)?|menu\s+(?:fitur|bantuan|kemampuan)|bisa\s+apa\s+aja|kemampuan\s+kamu|fitur\s+kamu|keunggulan\s+kamu)\b/i.test(t) ||
    /^(?:menu|bantuan|fitur|capabilities|help|apa saja yang anda bisa)$/i.test(t)
  )
}

// Cek apakah pesan adalah pilihan/instruksi eksekusi nomor atau opsi (misal: "coba 1 dan 3", "jalankan no 2", dll.)
function extractAssessmentChoices(text) {
  if (!text) return null
  const t = text.toLowerCase().trim()

  // Pola jika pengguna menyebut "semua" / "all"
  if (/\b(?:semua|all)\b/i.test(t) && /\b(?:coba|jalankan|pilih|eksekusi|demo|tes)\b/i.test(t)) {
    return ['weather', 'apps', 'news', 'summary']
  }

  // Harus ada indikasi memilih opsi / perintah coba / angka langsung
  const hasChoiceIntent =
    /\b(?:coba|jalankan|pilih|eksekusi|nomor|no|opsi|fitur|tolong|tes|demo)\b/i.test(t) ||
    /^[0-9,\s&dan+serta]+$/i.test(t)
  if (!hasChoiceIntent) return null

  const selected = new Set()

  // 1: Cuaca
  if (/\b1\b/.test(t) || /\b(?:satu|cuaca|weather)\b/i.test(t)) selected.add('weather')
  // 2: Aplikasi
  if (/\b2\b/.test(t) || /\b(?:dua|aplikasi|apps|app|software|program)\b/i.test(t)) selected.add('apps')
  // 3: Berita
  if (/\b3\b/.test(t) || /\b(?:tiga|berita|news|kabar)\b/i.test(t)) selected.add('news')
  // 4: Notulen
  if (/\b4\b/.test(t) || /\b(?:empat|notulen|ringkasan|summary|minutes)\b/i.test(t)) selected.add('summary')

  return selected.size > 0 ? Array.from(selected) : null
}

// Tampilkan Kartu Pilihan Ganda Interaktif (AI Capability Assessment Card) di Chat
function showCapabilityAssessmentCard() {
  if (chatSheet?.classList.contains('hidden')) {
    toggleChat()
  }

  controller?.setExpression('happy')
  showSpeechBubble('Berikut 4 keunggulan utamaku! Pilih yang ingin kamu coba 🎯', 4000)
  speak('Berikut empat keunggulan utama saya. Silakan pilih nomor atau fitur yang ingin langsung saya demonstrasikan.', 'happy')

  const card = document.createElement('div')
  card.className = 'avatar assessment-card'
  card.innerHTML = `
    <div class="assessment-card-header">
      <div class="assessment-badge">🎯 AI CAPABILITY ASSESSMENT TOOL</div>
      <span class="assessment-type-pill">Multi-Select Aktif</span>
    </div>
    <div class="assessment-prompt-text">
      Halo! Saya asisten desktop AI pribadimu. Pilih satu atau beberapa kemampuan di bawah untuk langsung saya demonstrasikan:
    </div>
    <div class="assessment-options-list">
      <div class="assessment-option-item" data-id="weather">
        <div class="assessment-custom-checkbox"></div>
        <div class="assessment-option-content">
          <div class="assessment-option-title">1. 🌦️ Info Cuaca Real-Time</div>
          <div class="assessment-option-desc">Suhu, kelembapan & kondisi langit Jakarta saat ini (live sensor BMKG / Open-Meteo).</div>
        </div>
      </div>
      <div class="assessment-option-item" data-id="apps">
        <div class="assessment-custom-checkbox"></div>
        <div class="assessment-option-content">
          <div class="assessment-option-title">2. 🚀 Kontrol Sistem (Multi-App Launcher)</div>
          <div class="assessment-option-desc">Membuka aplikasi (Word, VS Code, Task Manager) serentak dalam hitungan milidetik.</div>
        </div>
      </div>
      <div class="assessment-option-item" data-id="news">
        <div class="assessment-custom-checkbox"></div>
        <div class="assessment-option-content">
          <div class="assessment-option-title">3. 🇮🇩 Berita Terkini Indonesia Hari Ini</div>
          <div class="assessment-option-desc">Rangkuman 4 tajuk utama terhangat dari Google News RSS terbitan beberapa jam/menit lalu.</div>
        </div>
      </div>
      <div class="assessment-option-item" data-id="summary">
        <div class="assessment-custom-checkbox"></div>
        <div class="assessment-option-content">
          <div class="assessment-option-title">4. 📋 Notulen Eksekutif Otomatis</div>
          <div class="assessment-option-desc">Merangkum sesi obrolan menjadi kartu notulen rapi yang siap disalin atau disimpan permanen.</div>
        </div>
      </div>
    </div>
    <div class="assessment-quick-presets">
      <span style="font-size: 10px; color: #94a3b8; align-self: center;">Preset Cepat:</span>
      <button type="button" class="assessment-preset-chip" data-preset="weather,news">⚡ Cuaca & Berita (1 & 3)</button>
      <button type="button" class="assessment-preset-chip" data-preset="weather">🌦️ Cuaca Saja (1)</button>
      <button type="button" class="assessment-preset-chip" data-preset="apps">🚀 Aplikasi Saja (2)</button>
      <button type="button" class="assessment-preset-chip" data-preset="all">🔥 Jalankan Semua (1-4)</button>
    </div>
    <div class="assessment-footer">
      <button type="button" class="assessment-execute-btn" disabled>⚡ Eksekusi Pilihan (0 Dipilih)</button>
      <span class="assessment-status-text">Ketik / sebut angka (misal: "coba 1 dan 3")</span>
    </div>
  `

  chatLog.appendChild(card)
  chatLog.scrollTop = chatLog.scrollHeight
  activeAssessmentCard = card

  const optionItems = card.querySelectorAll('.assessment-option-item')
  const executeBtn = card.querySelector('.assessment-execute-btn')
  const presetChips = card.querySelectorAll('.assessment-preset-chip')

  function updateExecuteButton() {
    const selected = card.querySelectorAll('.assessment-option-item.selected')
    const count = selected.length
    if (count === 0) {
      executeBtn.disabled = true
      executeBtn.textContent = '⚡ Eksekusi Pilihan (0 Dipilih)'
    } else {
      executeBtn.disabled = false
      executeBtn.textContent = `⚡ Eksekusi Pilihan (${count} Dipilih)`
    }
  }

  optionItems.forEach((item) => {
    item.addEventListener('click', () => {
      item.classList.toggle('selected')
      updateExecuteButton()
    })
  })

  presetChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const preset = chip.getAttribute('data-preset')
      if (preset === 'all') {
        optionItems.forEach((it) => it.classList.add('selected'))
      } else {
        const ids = preset.split(',')
        optionItems.forEach((it) => {
          const id = it.getAttribute('data-id')
          if (ids.includes(id)) it.classList.add('selected')
          else it.classList.remove('selected')
        })
      }
      updateExecuteButton()
      executeBtn.click()
    })
  })

  executeBtn.addEventListener('click', async () => {
    const selectedItems = Array.from(card.querySelectorAll('.assessment-option-item.selected'))
    const ids = selectedItems.map((it) => it.getAttribute('data-id'))
    if (ids.length === 0) return

    executeBtn.disabled = true
    executeBtn.textContent = '⏳ Sedang Mengeksekusi...'
    await executeSelectedCapabilities(ids, card)
  })
}

// Eksekusi Pilihan Kemampuan Terpilih
async function executeSelectedCapabilities(selectedIds, cardRef = null) {
  if (!selectedIds || selectedIds.length === 0) return

  // Sinkronisasi status visual kartu
  const card = cardRef || activeAssessmentCard
  if (card) {
    const optionItems = card.querySelectorAll('.assessment-option-item')
    optionItems.forEach((it) => {
      const id = it.getAttribute('data-id')
      if (selectedIds.includes(id)) it.classList.add('selected')
    })
    const execBtn = card.querySelector('.assessment-execute-btn')
    if (execBtn) {
      execBtn.disabled = true
      execBtn.textContent = '✓ Sedang Dijalankan...'
    }
  }

  // Tampilkan ekspresi & bubble proses
  controller?.setExpression('composing')
  showSpeechBubble(`Mengeksekusi ${selectedIds.length} fitur terpilih... ⚡`, 3500)

  // 1. Tangani Cuaca (weather)
  let weatherResult = null
  if (selectedIds.includes('weather')) {
    try {
      const w = await window.hermesAvatar?.getLiveWeather?.('Jakarta')
      if (w && w.ok) {
        weatherResult = w
      }
    } catch (err) {
      console.warn('[Assessment] Gagal ambil cuaca:', err)
    }
  }

  // 2. Tangani Berita (news)
  let newsResult = null
  if (selectedIds.includes('news')) {
    try {
      const n = await window.hermesAvatar?.getLiveNews?.()
      if (n && n.ok && Array.isArray(n.items) && n.items.length > 0) {
        newsResult = n.items.slice(0, 4)
      }
    } catch (err) {
      console.warn('[Assessment] Gagal ambil berita:', err)
    }
  }

  // 3. Tangani Aplikasi (apps)
  let appsResult = null
  if (selectedIds.includes('apps')) {
    try {
      await window.hermesAvatar?.launchApp?.('taskmgr.exe')
      appsResult = { launched: ['Task Manager'] }
    } catch (err) {
      appsResult = { error: err.message }
    }
  }

  // Format balasan Markdown rapi
  const now = new Date()
  const dateFormatted = now.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
  const timeFormatted = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

  const markdownSections = [
    `## ⚡ Hasil Eksekusi Demonstrasi Kemampuan\n> **Waktu Eksekusi:** ${dateFormatted}, pukul ${timeFormatted} WIB\n`
  ]

  if (weatherResult) {
    markdownSections.push(`### 🌦️ 1. Cuaca Jakarta Hari Ini\n` +
      `- **Kondisi Langit:** ${weatherResult.condition} 🌤️\n` +
      `- **Suhu Saat Ini:** ${weatherResult.temp}°C\n` +
      `- **Kelembapan:** ${weatherResult.humidity}% | **Kecepatan Angin:** ${weatherResult.wind} km/jam\n` +
      `*Prakiraan sensor resmi Open-Meteo & BMKG untuk wilayah Jakarta.*\n`)
  }

  if (appsResult) {
    markdownSections.push(`### 🚀 2. Kontrol Sistem Windows (Multi-App)\n` +
      `- **Status:** Berhasil meluncurkan **Task Manager** ke layar kerja Anda! 💻\n` +
      `*Catatan: Anda juga bisa meminta saya membuka banyak aplikasi sekaligus, misal: "Buka Word, Task Manager dan VS Code".*\n`)
  }

  if (newsResult) {
    const list = newsResult.map((it, idx) => `${idx + 1}. **${it.title}**`).join('\n')
    markdownSections.push(`### 🇮🇩 3. Berita Terkini Indonesia Hari Ini\n` +
      `${list}\n` +
      `*Sumber resmi Google News RSS terbitan beberapa jam/menit lalu.*\n`)
  }

  if (selectedIds.includes('summary')) {
    markdownSections.push(`### 📋 4. Notulen Eksekutif Otomatis\n` +
      `- **Status:** Menyiapkan notulen percakapan interaktif di chat... ⏳\n`)
  }

  const finalMarkdown = markdownSections.join('\n---\n\n')

  // Render bubble jawaban Hermes
  log('avatar', finalMarkdown)

  // 4. Tangani Notulen jika dipilih
  if (selectedIds.includes('summary')) {
    setTimeout(() => {
      generateExecutiveSummary()
    }, 600)
  }

  // Suara TTS
  controller?.setExpression('happy')
  if (weatherResult && newsResult) {
    speak(`Berikut info cuaca Jakarta suhu ${weatherResult.temp} derajat dan empat berita terkini di Indonesia hari ini.`, 'happy')
  } else if (weatherResult) {
    speak(`Cuaca Jakarta saat ini ${weatherResult.condition} dengan suhu ${weatherResult.temp} derajat.`, 'happy')
  } else if (newsResult) {
    speak(`Berikut rangkuman berita terkini di Indonesia hari ini.`, 'happy')
  } else if (appsResult) {
    speak(`Task manager berhasil saya luncurkan ke sistem Anda.`, 'happy')
  } else {
    speak(`Demonstrasi fitur selesai dieksekusi.`, 'happy')
  }

  if (card) {
    const execBtn = card.querySelector('.assessment-execute-btn')
    if (execBtn) execBtn.textContent = '✓ Selesai Dieksekusi'
  }
}

window.addEventListener('resize', () => {
  if (companionHud?.classList.contains('visible')) {
    updateMenuPosition()
  }
  if (!chatSheet?.classList.contains('hidden')) {
    updateChatPosition()
  }
  updateSpeechBubblePosition()
})

// --- Mute / Unmute Suara TTS ala YourMother (MotherMute) ---
const muteBtn = document.getElementById('mute-btn')
const muteIcon = document.getElementById('mute-icon')
const muteLabel = document.getElementById('mute-label')

muteBtn?.addEventListener('click', () => {
  ttsEnabled = !ttsEnabled
  if (muteIcon) muteIcon.textContent = ttsEnabled ? '🔊' : '🔇'
  if (muteLabel) muteLabel.textContent = ttsEnabled ? 'Suara' : 'Bisu'
  if (live2dPet?.model) {
    live2dPet.spawnHeart(live2dPet.model.x, live2dPet.model.y - 120, ttsEnabled ? '🔊' : '🔇')
  }
  showSpeechBubble(ttsEnabled ? 'Suara diaktifkan 🔊' : 'Suara dibisukan 🔇', 2500)
})

// --- Kontrol Zoom / Skala & Reset Posisi ---
document.getElementById('zoom-in-btn')?.addEventListener('click', () => {
  live2dPet?.zoomIn()
})

document.getElementById('zoom-out-btn')?.addEventListener('click', () => {
  live2dPet?.zoomOut()
})

document.getElementById('reset-pos-btn')?.addEventListener('click', () => {
  live2dPet?.resetPosition()
  live2dPet?.resetZoom()
})

// --- Buka Window Settings dari HUD ---
document.getElementById('settings-btn')?.addEventListener('click', (e) => {
  e.stopPropagation()
  window.hermesAvatar?.openSettings()
})

// --- Tutup Avatar & Kembali ke Launcher Utama ---
document.getElementById('exit-avatar-btn')?.addEventListener('click', (e) => {
  e.stopPropagation()
  window.hermesAvatar?.closeAvatar()
})

// Mainkan emote custom (.vmd untuk MMD, .glb untuk GLB/VRM).
let animMixer = null

// Cek apakah AnimationClip cocok dengan bone model (hindari body "kacau").
function clipMatchesModel(clip, root) {
  const modelBones = new Set()
  root.traverse((o) => { if (o.isBone || o.isSkinnedMesh) modelBones.add(o.name) })

  let match = 0
  let total = 0
  for (const track of clip.tracks) {
    const boneName = track.name.split('.')[0]
    total++
    if (modelBones.has(boneName)) match++
  }

  // Minimal 90% track cocok → anggap valid (sangat ketat, hindari body kacau).
  return total === 0 ? false : (match / total) >= 0.9
}

async function playCustomEmote(anim) {
  try {
    const format = (anim.format || '').toLowerCase()

    if (format === 'vmd') {
      if (!mmdRef || !mmdRef.mesh) {
        log('avatar', '(emote .vmd butuh model MMD .pmx)')
        return
      }
      const url = await window.hermesAvatar.getModelUrl(anim.path)
      const clip = await loadVmdClip(url, mmdRef.mesh)

      if (!clipMatchesModel(clip, mmdRef.mesh)) {
        log('avatar', '(animasi tidak cocok dengan model — lewati)')
        return
      }

      if (animMixer) { animMixer.stopAllAction(); animMixer = null }
      animMixer = new THREE.AnimationMixer(mmdRef.mesh)
      const action = animMixer.clipAction(clip)
      action.setLoop(THREE.LoopOnce)
      action.clampWhenFinished = true
      action.play()
      log('avatar', `Memutar: ${anim.name}`)

    } else if (format === 'glb' || format === 'gltf') {
      if (!modelScene) {
        log('avatar', '(belum ada model)')
        return
      }
      const url = await window.hermesAvatar.getModelUrl(anim.path)
      const clips = await loadGlbClip(url)
      if (!clips.length) {
        log('avatar', '(file .glb tidak punya animasi)')
        return
      }

      if (!clipMatchesModel(clips[0], modelScene)) {
        // Log nama bone untuk diagnosa (animasi vs model) ke chat + console.
        const clipBones = clips[0].tracks.map((t) => t.name.split('.')[0])
        const modelBones = []
        modelScene.traverse((o) => { if (o.isBone) modelBones.push(o.name) })
        log('avatar', `[anim] bone animasi: ${clipBones.slice(0, 10).join(', ')}...`)
        log('avatar', `[model] bone model: ${modelBones.slice(0, 10).join(', ')}...`)
        console.warn('[anim] bone animasi:', clipBones.join(', '))
        return
      }

      if (animMixer) { animMixer.stopAllAction(); animMixer = null }
      animMixer = new THREE.AnimationMixer(modelScene)
      const action = animMixer.clipAction(clips[0])
      action.setLoop(THREE.LoopOnce)
      action.clampWhenFinished = true
      action.play()
      log('avatar', `Memutar: ${anim.name}`)

    } else {
      log('avatar', `(format emote tidak didukung: .${format})`)
    }
  } catch (err) {
    log('avatar', `Gagal putar emote: ${err?.message || err}`)
  }
}

// --- Idle Chatter Berkala ala YourMother (motherSpeakFrequency) & Pengaturan Dinamis ---
const DEFAULT_IDLE_CHATTER_LINES = [
  'Jangan lupa minum air putih ya 💧',
  'Postur tubuhnya ditegakkan dulu yuk, biar punggung tidak pegal 🧘',
  'Fokus kerja hebat banget! Semangat terus ya ✨',
  'Sudah istirahatkan mata sejenak belum? Coba lihat ke kejauhan sebentar 👀',
  'Ada yang bisa kubantu dengan AI Hermes? Buka chat kapan saja ya 💬',
  'Tarik napas dalam-dalam... hembuskan perlahan 🌸'
]

function getIdleReminderConfig() {
  try {
    const raw = localStorage.getItem('hermes-avatar-settings')
    if (raw) {
      const s = JSON.parse(raw)
      if (s.idleReminder) {
        return {
          enabled: s.idleReminder.enabled !== false,
          intervalMinutes: Math.max(1, parseInt(s.idleReminder.intervalMinutes, 10) || 10),
          lines: Array.isArray(s.idleReminder.lines) && s.idleReminder.lines.length > 0
            ? s.idleReminder.lines
            : DEFAULT_IDLE_CHATTER_LINES
        }
      }
    }
  } catch {}
  return {
    enabled: true,
    intervalMinutes: 10,
    lines: DEFAULT_IDLE_CHATTER_LINES
  }
}

let idleChatterTimer = null

function scheduleNextIdleChatter() {
  if (idleChatterTimer) {
    clearTimeout(idleChatterTimer)
    idleChatterTimer = null
  }
  const cfg = getIdleReminderConfig()
  if (!cfg.enabled) return

  // Beri sedikit variasi acak +/- 15% agar percakapan terasa natural
  const baseMs = cfg.intervalMinutes * 60 * 1000
  const jitterMs = (Math.random() * 0.3 - 0.15) * baseMs
  const delayMs = Math.max(15000, Math.floor(baseMs + jitterMs))

  idleChatterTimer = setTimeout(() => {
    triggerIdleChatter()
    scheduleNextIdleChatter()
  }, delayMs)
}

function triggerIdleChatter(forcedLine = null) {
  const cfg = getIdleReminderConfig()
  if (!cfg.enabled && !forcedLine) return
  // Hanya berbunyi jika suara aktif, tidak sedang tidur, tidak sedang sesi timer, dan tidak sedang bicara
  if (live2dPet?.isSleeping || isSpeaking || isTimerRunning) return

  const line = forcedLine || cfg.lines[Math.floor(Math.random() * cfg.lines.length)]
  showSpeechBubble(line, 8000)
  speak(line, 'neutral')
}

// Sinkronisasi otomatis saat konfigurasi di Pengaturan berubah
window.addEventListener('storage', (e) => {
  if (e.key === 'hermes-avatar-settings') {
    scheduleNextIdleChatter()
  }
})

// Trigger instan dari tombol tes di Pengaturan
window.hermesAvatar?.onTriggerIdleChatter?.((line) => {
  triggerIdleChatter(line)
})

scheduleNextIdleChatter()

// Escape juga menutup chat (sembunyikan), bukan tutup window.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!chatSheet.classList.contains('hidden')) {
      chatSheet.classList.add('hidden')
      commentToggle.textContent = '💬'
      window.hermesAvatar?.setChatFocus?.(false)
    }
  }
})

// Kunci input selama Hermes sedang bekerja agar perintah tidak bertabrakan.
let busy = false

function setInputLocked(locked) {
  busy = locked
  input.disabled = locked
  sendBtn.disabled = locked
  micBtn.disabled = locked
  input.placeholder = locked ? '⏳ Hermes sedang bekerja…' : 'Ketik pesan...'
  form.classList.toggle('is-busy', locked)
  if (!locked) input.focus()
}

// --- Bubble status di atas avatar (thinking/processing/speaking/idle) ---
// Saat idle, bubble tetap tampil dengan teks netral (titik), bukan hilang.
const IDLE_BUBBLE = '· · ·'

function setStatus(text) {
  if (statusBubble) {
    if (!text) {
      // Idle: tampilkan bubble netral.
      statusBubble.hidden = false
      statusBubble.textContent = IDLE_BUBBLE
    } else {
      statusBubble.hidden = false
      statusBubble.textContent = text
    }
  }

  if (text && text !== IDLE_BUBBLE && !isSpeaking) {
    showSpeechBubble(text, 4000)
  }
}

// --- Sanitasi teks jawaban: bersihkan tag internal & format ANSI (tetap jaga newline & markdown) ---
function cleanText(text) {
  return (text || '')
    // Hapus tag emosi/affect/gesture internal Hermes bila ada.
    .replace(/\[(?:emotion|affect|gesture):[^\]]*\]/gi, '')
    // Hapus markup ANSI bila ada.
    .replace(/\x1b\[[0-9;]*m/g, '')
    // Standardisasi line break Windows CRLF -> LF
    .replace(/\r\n/g, '\n')
    .trim()
}

function log(who, text) {
  const line = document.createElement('div')
  line.className = who
  if (who === 'user') {
    line.innerHTML = `<span class="sender-tag user-tag">Kamu:</span> ${escapeHtml(text)}`
  } else {
    line.innerHTML = `<span class="sender-tag">Hermes:</span><div class="chat-body markdown-body">${renderMarkdown(text)}</div>`
  }
  chatLog.appendChild(line)
  chatLog.scrollTop = chatLog.scrollHeight

  // Simpan riwayat percakapan sesi untuk Notulen / Executive Summary
  sessionChatHistory.push({
    role: who === 'user' ? 'user' : 'assistant',
    text: String(text || '').trim(),
    time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  })
}

// Inisialisasi client Hermes (connect + buat session).
let hermes = null
let hermesReady = false
let streamingLine = null // div untuk teks streaming (message.delta)
let toolProgressEl = null // Elemen animasi status proses tool melayang sementara

function updateToolProgress(label) {
  if (!toolProgressEl) {
    toolProgressEl = document.createElement('div')
    toolProgressEl.className = 'avatar tool-progress-pill'
    toolProgressEl.innerHTML = `<div class="tool-spinner"></div><span class="tool-progress-text">${escapeHtml(label)}</span>`
    chatLog.appendChild(toolProgressEl)
    chatLog.scrollTop = chatLog.scrollHeight
  } else {
    const textSpan = toolProgressEl.querySelector('.tool-progress-text')
    if (textSpan) textSpan.textContent = label
    chatLog.scrollTop = chatLog.scrollHeight
  }
}

function removeToolProgress() {
  if (toolProgressEl) {
    toolProgressEl.remove()
    toolProgressEl = null
  }
}

async function initHermes() {
  try {
    // Baca WS URL + token dari main process (env saat app diluncurkan).
    const cfg = await window.hermesAvatar.getHermesConfig()
    hermes = new HermesClient(cfg.wsUrl, cfg.token)

    await hermes.connect()
    await hermes.createSession('Avatar chat')
    hermesReady = true
    log('avatar', 'Terhubung ke Hermes. Siap! 👋')

    // Event masuk debug (filter session.info untuk menjaga kerahasiaan memori profil pengguna).
    hermes.onAny((params) => {
      const t = params?.type
      if (t && !['message.delta', 'thinking.delta', 'session.info'].includes(t)) {
        console.log('[event masuk]', t, JSON.stringify(params?.payload ?? {}))
      }
    })

    // Jawaban final.
    hermes.on('message.complete', (evt) => {
      removeToolProgress()
      // Jika ini adalah respon pembuatan notulen eksekutif:
      if (isGeneratingSummary) {
        isGeneratingSummary = false
        const rawText = evt?.payload?.text ?? summaryStreamingBuffer
        currentSummaryMarkdown = rawText
        if (activeNotulenBody) {
          activeNotulenBody.innerHTML = renderMarkdown(rawText)
        }
        finalizeActiveNotulenCard(currentSummaryMarkdown)
        activeNotulenCard = null
        activeNotulenBody = null
        setInputLocked(false)
        controller?.setExpression('happy')
        setStatus('Notulen Siap 📋')
        showSpeechBubble('Notulen eksekutif selesai disusun di chat! 📋', 4500)
        speak('Notulen percakapan sudah selesai saya susun langsung di tampilan chat.', 'happy')
        return
      }

      const rawText = evt?.payload?.text ?? accumulatedDeltaText

      // Tangkap tag [affect:...] [gesture:...] [emotion:...] (dari skill avatar-emote-controller).
      const tags = parseTags(rawText)

      const text = cleanText(rawText)

      if (streamingLine) {
        const body = streamingLine.querySelector('.chat-body')
        if (body) {
          body.innerHTML = renderMarkdown(text)
        }
        streamingLine = null
        sessionChatHistory.push({
          role: 'assistant',
          text,
          time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
        })
      } else if (text) {
        log('avatar', text)
      }

      accumulatedDeltaText = ''

      // Hermes selesai bekerja → buka kembali kolom chat.
      setInputLocked(false)

      // Emosi/affect: prioritas tag dari Hermes, fallback heuristik.
      const emotion = tags.emotion || tags.affect || detectEmotion(text)
      controller?.setExpression(emotion)

      // Gesture one-off → mainkan emote procedural (jika ada mapping).
      if (tags.gesture) {
        const emoteName = gestureToEmote(tags.gesture)
        if (emoteName) controller?.playEmote(emoteName)
      }

      // --- Pisahkan display text vs speech text ---
      // displayText = teks lengkap (Markdown) → tampil di chat log.
      // speechText = teks natural untuk TTS (tanpa markdown, ringkas kalimat).
      const vs = getVoiceSettings()
      const speechText = toSpeechText(rawText, { maxChars: vs.verbosity === 'full' ? 1500 : 500 })
      lastSummary = speechText ? summaryText(speechText) : ''
      setStatus(lastSummary)
      console.log('[speech] ttsEnabled=', ttsEnabled, 'len=', speechText?.length, 'verbosity=', vs.verbosity)

      // TTS + lip sync: baca speechText (bukan Markdown).
      if (ttsEnabled && speechText.trim()) {
        speak(speechText, emotion)
      } else {
        // Jika TTS mati/kosong, tampilkan ekspresi ramah lalu otomatis kembali netral setelah 5 detik
        setTimeout(() => {
          controller?.setExpression('neutral')
        }, 5000)
      }
    })

    // Streaming delta (teks muncul saat Hermes mengetik / menyusun jawaban).
    hermes.on('message.delta', (evt) => {
      removeToolProgress()
      if (controller?.currentEmotion !== 'composing') {
        controller?.setExpression('composing')
      }
      if (isGeneratingSummary) {
        const rawChunk = evt?.payload?.text ?? ''
        if (rawChunk) {
          summaryStreamingBuffer += rawChunk
          if (activeNotulenBody) {
            activeNotulenBody.innerHTML = renderMarkdown(summaryStreamingBuffer)
            chatLog.scrollTop = chatLog.scrollHeight
          }
        }
        return
      }

      const chunk = evt?.payload?.text ?? ''
      if (!chunk) return
      accumulatedDeltaText += chunk
      const text = cleanText(accumulatedDeltaText)

      if (!streamingLine) {
        streamingLine = document.createElement('div')
        streamingLine.className = 'avatar'
        streamingLine.innerHTML = `<span class="sender-tag">Hermes:</span><div class="chat-body markdown-body"></div>`
        chatLog.appendChild(streamingLine)
      }
      const body = streamingLine.querySelector('.chat-body')
      if (body) {
        body.innerHTML = renderMarkdown(text)
      }
      chatLog.scrollTop = chatLog.scrollHeight
    })

    // Turn dimulai → thinking (sesuai gaya aktif) + kunci input + bubble + bicara progress.
    hermes.on('message.start', () => {
      removeToolProgress()
      accumulatedDeltaText = ''
      streamingLine = null
      triggerStateAnimation('thinking', 'glasses')
      setStatus('Memproses…')
      setConversationState('thinking')
      sayProgress('Memproses')
      setInputLocked(true)
    })

    // Thinking presisi (reasoning stream) → pasang gaya berpikir aktif.
    hermes.on('thinking.delta', () => {
      triggerStateAnimation('thinking', 'glasses')
      setStatus('Berpikir…')
    })

    // Tool mulai dipakai → gaya berpikir aktif + indikator animasi melayang sementara (chat log tetap bersih).
    hermes.on('tool.start', (evt) => {
      const tool = evt?.payload?.name || evt?.payload?.tool || 'tool'
      const label = toolLabel(tool)
      triggerStateAnimation('thinking', 'glasses')
      updateToolProgress(label)
      setStatus(label)
    })

    // Tool selesai → "Menyusun jawaban…" + ganti ekspresi sesuai gaya memproses aktif.
    hermes.on('tool.complete', () => {
      updateToolProgress('Menyusun jawaban…')
      setStatus('Menyusun jawaban…')
      sayProgress('Menyusun jawaban')
      triggerStateAnimation('processing', 'charterer')
    })

    // Turn error/berhenti → pastikan input tidak terkunci selamanya.
    hermes.on('error', () => {
      removeToolProgress()
      setInputLocked(false)
      controller?.setExpression('neutral')
      setStatus('')
      accumulatedDeltaText = ''
      if (isGeneratingSummary) {
        isGeneratingSummary = false
        if (activeNotulenBody) {
          activeNotulenBody.innerHTML = `<p style="color: #f87171;">⚠️ Terjadi kesalahan saat menyusun notulen.</p>`
        }
        activeNotulenCard = null
        activeNotulenBody = null
      }
    })
    hermes.on('turn.complete', () => {
      removeToolProgress()
      setInputLocked(false)
      setStatus('')
      accumulatedDeltaText = ''
      if (isGeneratingSummary) {
        isGeneratingSummary = false
        activeNotulenCard = null
        activeNotulenBody = null
      }
    })

    // Status perekaman suara dari Hermes (STT)
    hermes.on('voice.status', (evt) => {
      const st = evt?.payload?.status || evt?.payload?.state
      console.log('[hermes voice.status]', st)
      if (st === 'recording') {
        recording = true
        micBtn?.classList.add('recording')
        if (micBtn) micBtn.textContent = '⏹️'
        showSpeechBubble('Mendengarkan suara Anda... 🎙️', 4000)
      } else if (st === 'transcribing') {
        showSpeechBubble('Menerjemahkan suara (Whisper)... ⏳', 3000)
      } else if (st === 'idle' || st === 'off') {
        recording = false
        micBtn?.classList.remove('recording')
        if (micBtn) micBtn.textContent = '🎤'
      }
    })

    // Hasil transkripsi suara → cek fast-path atau kirim ke Hermes sebagai teks + ekspresi berpikir.
    hermes.on('voice.transcript', async (evt) => {
      const text = evt?.payload?.text ?? ''
      if (text.trim()) {
        log('user', text)

        // Cek apakah perintah membuat notulen / ringkasan percakapan
        if (isSummaryRequest(text)) {
          generateExecutiveSummary()
          return
        }

        // Cek apakah perintah menampilkan Menu Keunggulan / Assessment Tool
        if (isCapabilityRequest(text)) {
          showCapabilityAssessmentCard()
          return
        }

        // Cek apakah perintah memilih opsi demonstrasi assessment (misal: "coba 1 dan 3")
        const assessmentChoices = extractAssessmentChoices(text)
        if (assessmentChoices) {
          await executeSelectedCapabilities(assessmentChoices)
          return
        }

        setInputLocked(true)

        // Cek Fast-Path Aplikasi terlebih dahulu (<50ms!)
        const fastLaunched = await tryFastLaunchApp(text)
        if (fastLaunched) {
          setInputLocked(false)
          return
        }

        controller?.setExpression('thinking')
        setStatus('Berpikir…')
        buildPrompt(text)
          .then((p) => hermes.submitPrompt(p))
          .catch((err) => {
            log('avatar', `Gagal kirim suara: ${err.message}`)
            setInputLocked(false)
          })
      }
    })
  } catch (err) {
    hermesReady = false
    log('avatar', `⚠️ Gagal hubung Hermes: ${err.message}`)
  }
}

initHermes()

// Bubble idle tampil sejak awal (sebelum ada event).
setStatus('')

// --- Emosi heuristik (Fase 3 awal) ---
// Klasifikasi teks sederhana → ekspresi. Bisa diganti tag [emotion:] nanti.

// Mapping nama tool Hermes → progress deskriptif (untuk bubble status).
function toolLabel(name) {
  const t = String(name || '').toLowerCase()
  const map = [
    [/browser_navigate|navigate/, 'Membuka halaman…'],
    [/browser_click|click/, 'Mengklik elemen…'],
    [/browser_type|type/, 'Mengetik di browser…'],
    [/browser_snapshot|snapshot/, 'Melihat halaman…'],
    [/browser_scroll|scroll/, 'Menggulir halaman…'],
    [/browser_console|browser_vision/, 'Menganalisis browser…'],
    [/tab/, 'Mengelola tab…'],
    [/browser/, 'Mengontrol browser…'],
    [/terminal|process|execute_code|shell/, 'Menjalankan terminal…'],
    [/ha_|homeassistant/, 'Mengontrol perangkat…'],
    [/read_file|search_files/, 'Membaca file…'],
    [/write_file|patch/, 'Menulis file…'],
    [/file/, 'Mengakses file…'],
    [/pdf/, 'Membaca dokumen PDF…'],
    [/weather|wttr|meteo/, 'Memeriksa cuaca…'],
    [/scrapling|scrape/, 'Mengekstrak web cepat…'],
    [/duckduckgo|ddgs/, 'Mencari di DuckDuckGo…'],
    [/memory|mnemosyne/, 'Mengingat…'],
    [/image_generate/, 'Membuat gambar…'],
    [/todo/, 'Mengatur tugas…'],
    [/web|search/, 'Mencari di web…'],
    [/project/, 'Mengelola proyek…']
  ]
  for (const [re, label] of map) {
    if (re.test(t)) return label
  }
  return 'Memproses…'
}

// Parse tag [affect:...] [gesture:...] [emotion:...] dari awal jawaban.
function parseTags(rawText) {
  const tags = { affect: null, gesture: null, emotion: null }
  const s = String(rawText || '')
  const mAffect = s.match(/\[affect:([a-zA-Z]+)\]/i)
  const mGesture = s.match(/\[gesture:([a-zA-Z]+)\]/i)
  const mEmotion = s.match(/\[emotion:([a-zA-Z]+)\]/i)
  if (mAffect) tags.affect = mAffect[1].toLowerCase()
  if (mGesture) tags.gesture = mGesture[1].toLowerCase()
  if (mEmotion) tags.emotion = mEmotion[1].toLowerCase()
  return tags
}

// Map gesture name → emote procedural (bounce/jump/wave/nod).
function gestureToEmote(gesture) {
  const map = {
    bounce: 'bounce',
    jump: 'jump',
    wave: 'wave',
    nod: 'nod',
    bow: 'nod',
    shrug: 'jump',
    dance: 'bounce',
    clap: 'wave',
    wink: 'nod'
  }
  return map[gesture] || null
}

function detectEmotion(text) {
  const t = (text || '').toLowerCase()

  if (/(terima kasih|thanks|mantap|bagus|hebat|oke|siap|berhasil|selamat|🎉|😊|👍|halo|hai|senang|bisa|tentu|sudah|ya|sama-sama|dengan senang hati)/.test(t)) {
    return 'happy'
  }
  if (/(maaf|sedih|gagal|error|tidak bisa|maafkan|😢|😞)/.test(t)) {
    return 'sad'
  }
  if (/(hati-hati|jangan|awas|bahaya|⚠️)/.test(t)) {
    return 'angry'
  }
  if (/[!]{2,}|[?]{2,}/.test(text || '')) {
    return 'happy'
  }
  return 'neutral'
}

// --- Ringkasan jawaban (untuk bubble di atas avatar) ---
let lastSummary = ''

function summaryText(text) {
  const t = (text || '').trim()
  if (!t) return ''
  const MAX = 80
  return t.length > MAX ? t.slice(0, MAX).trimEnd() + '…' : t
}

// --- TTS + lip sync (dengan antrian audio) ---
const speechQueue = []
let isSpeaking = false

// --- State machine percakapan suara ---
// idle | listening | transcribing | thinking | speaking | interrupted | error
let conversationState = 'idle'

function setConversationState(state) {
  const prev = conversationState
  conversationState = state
  console.log(`[state] ${prev} → ${state}`)
}

// Interupsi: hentikan audio + batalkan antrian TTS (barge-in).
function interruptSpeech() {
  audioPlayer.stop()
  speechQueue.length = 0
  isSpeaking = false
  controller?.setMouthLevel(0)
  musicPlayer?.duck(false)
  setConversationState('interrupted')
}

// Bungkus Promise dengan timeout (hindari TTS hang selamanya).
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('TTS timeout')), ms))
  ])
}

async function processSpeechQueue() {
  if (isSpeaking) return
  isSpeaking = true
  musicPlayer?.duck(true)
  try {
    while (speechQueue.length > 0) {
      const item = speechQueue.shift()
      const { text, emotion, isProgress } = item

      // Skip teks kosong / terlalu panjang (hindari TTS hang).
      if (!text || !text.trim()) continue
      if (text.length > 1000) continue // sangat panjang → skip TTS

      if (isProgress) setStatus('Speaking')
      setConversationState('speaking')
      if (text) showSpeechBubble(text, 12000)
      try {
        const vs = getVoiceSettings()
        const { buffer } = await withTimeout(
          synthesize(text, vs.voice, {
            provider: vs.provider,
            kokoroEndpoint: vs.kokoroEndpoint,
            speed: vs.speed,
            intonation: vs.intonation
          }),
          15000
        )
        if (emotion) controller?.setExpression(emotion)
        await audioPlayer.play(buffer)
      } catch (err) {
        console.error('[TTS error]', err?.message || err)
      }
      controller?.setMouthLevel(0)
      controller?.setExpression('neutral')
    }
  } finally {
    isSpeaking = false
    musicPlayer?.duck(false)
    hideSpeechBubble()
    // Kembalikan bubble ke ringkasan terakhir (jika ada) atau idle.
    setStatus(lastSummary || '')
    if (conversationState === 'speaking') setConversationState('idle')
  }
}

function speak(text, emotion = 'neutral', { isProgress = false } = {}) {
  speechQueue.push({ text, emotion, isProgress })
  processSpeechQueue()
}

// Progress singkat (dibaca TTS tanpa mengubah ringkasan final).
function sayProgress(text) {
  if (!ttsEnabled) return
  if (!text) return
  speak(text, 'neutral', { isProgress: true })
}

// Fast-path & Self-learning App Launcher
let cachedInstalledApps = []

async function initFastAppLauncher() {
  try {
    const res = await window.hermesAvatar?.getInstalledApps?.()
    if (res?.ok && Array.isArray(res.apps)) {
      cachedInstalledApps = res.apps
    }
  } catch (err) {
    console.warn('[FastApp] Inisialisasi daftar aplikasi gagal:', err)
  }
}
initFastAppLauncher()

// Kamus alias populer untuk aplikasi umum Windows
const KNOWN_APP_ALIASES = {
  vscode: ['visual studio code', 'code'],
  'vs code': ['visual studio code', 'code'],
  vsc: ['visual studio code'],
  code: ['visual studio code'],
  word: ['word', 'microsoft word'],
  excel: ['excel', 'microsoft excel'],
  powerpoint: ['powerpoint', 'ppt', 'microsoft powerpoint'],
  ppt: ['powerpoint', 'microsoft powerpoint'],
  taskmgr: ['task manager'],
  'task manager': ['task manager'],
  taskman: ['task manager'],
  'pengelola tugas': ['task manager'],
  chrome: ['google chrome'],
  edge: ['microsoft edge'],
  calc: ['kalkulator', 'calculator'],
  kalkulator: ['kalkulator', 'calculator', 'calc'],
  calculator: ['kalkulator', 'calculator', 'calc'],
  explorer: ['file explorer'],
  cmd: ['command prompt'],
  terminal: ['windows terminal', 'terminal'],
  paint: ['paint', 'mspaint']
}

function extractAppQueries(text) {
  if (!text) return []
  const cleaned = text.trim()
  // Pattern pencocokan perintah buka aplikasi (mendukung tunggal maupun jamak):
  // "buka word, task manager dan vscode", "tolong buka notepad dan kalkulator", "jalankan chrome", dsb
  const match = cleaned.match(
    /^(?:tolong\s+)?(?:buka|bukakan|jalankan|putar|open|launch|start|run)\s+(?:aplikasi\s+|app\s+)?(.+?)(?:\s+(?:dong|ya|sekarang|cepet|please))?[.!?]*$/i
  )
  if (!match || !match[1]) return []

  const raw = match[1].trim()
  // Pecah berdasarkan koma (,), titik koma (;), ampersand (&), atau kata sambung ("dan", "and", "serta", "lalu", "plus")
  const parts = raw.split(/[,;&]|\s+(?:dan|and|serta|lalu|kemudian|plus)\s+/i)

  const queries = []
  for (const part of parts) {
    // Bersihkan prefix seperti "aplikasi", "app", "buka", "jalankan", "open" yang berulang di setiap bagian
    const cleanedPart = part
      .replace(/^(?:aplikasi\s+|app\s+|buka\s+|bukakan\s+|jalankan\s+|open\s+|launch\s+|start\s+|run\s+)/i, '')
      .trim()
    if (cleanedPart) {
      queries.push(cleanedPart)
    }
  }

  return queries
}

function findMatchingApp(query) {
  if (!query) return null
  const q = query.toLowerCase().replace(/^(aplikasi|app)\s+/, '').trim()
  if (!q) return null
  const qCompact = q.replace(/[\s\-_]+/g, '')

  // 1. Cek aplikasi bawaan umum / developer tools secara langsung (pasti berhasil instan tanpa tergantung cache)
  const BUILTIN_DIRECT_APPS = [
    { name: 'Task Manager', command: 'taskmgr.exe', keys: ['task manager', 'taskmgr', 'taskman', 'pengelola tugas'] },
    { name: 'Visual Studio Code', command: 'code', keys: ['vscode', 'vs code', 'code', 'vsc', 'visual studio code'] },
    { name: 'Microsoft Word', command: 'winword.exe', keys: ['word', 'ms word', 'microsoft word', 'winword'] },
    { name: 'Microsoft Excel', command: 'excel.exe', keys: ['excel', 'ms excel', 'microsoft excel'] },
    { name: 'Microsoft PowerPoint', command: 'powerpnt.exe', keys: ['powerpoint', 'ppt', 'ms powerpoint', 'powerpnt'] },
    { name: 'Google Chrome', command: 'chrome.exe', keys: ['chrome', 'google chrome'] },
    { name: 'Microsoft Edge', command: 'msedge.exe', keys: ['edge', 'msedge', 'microsoft edge'] },
    { name: 'Notepad', command: 'notepad.exe', keys: ['notepad', 'catatan'] },
    { name: 'Kalkulator', command: 'calc.exe', keys: ['calc', 'kalkulator', 'calculator'] },
    { name: 'File Explorer', command: 'explorer.exe', keys: ['explorer', 'file explorer'] },
    { name: 'Command Prompt', command: 'cmd.exe', keys: ['cmd', 'command prompt'] },
    { name: 'PowerShell', command: 'powershell.exe', keys: ['powershell', 'pwsh'] },
    { name: 'Terminal', command: 'wt.exe', keys: ['terminal', 'windows terminal', 'wt'] },
    { name: 'Paint', command: 'mspaint.exe', keys: ['paint', 'mspaint', 'gambar'] }
  ]

  for (const b of BUILTIN_DIRECT_APPS) {
    if (b.keys.includes(q) || b.keys.some((k) => k.replace(/[\s\-_]+/g, '') === qCompact)) {
      return b
    }
  }

  // 2. Cek di pengaturan pengguna (settings.actionApps)
  try {
    const raw = localStorage.getItem('hermes-avatar-settings')
    if (raw) {
      const s = JSON.parse(raw)
      const actionApps = s.actionApps || []
      const found = actionApps.find((a) => {
        if (!a.name) return false
        const n = a.name.toLowerCase()
        return n === q || n.includes(q) || q.includes(n)
      })
      if (found) return found
    }
  } catch {}

  // 3. Cek di daftar aplikasi Windows terpasang (cachedInstalledApps)
  if (cachedInstalledApps && cachedInstalledApps.length > 0) {
    // A. Exact match pada nama aplikasi atau alias bawaan
    const exact = cachedInstalledApps.find((a) => {
      const n = a.name.toLowerCase()
      if (n === q) return true
      if (a.aliases && a.aliases.some((alias) => alias.toLowerCase() === q)) return true
      return false
    })
    if (exact) return exact

    // B. Match lewat KNOWN_APP_ALIASES (misal 'vscode' -> 'Visual Studio Code')
    const targetNames = KNOWN_APP_ALIASES[q] || []
    for (const tgt of targetNames) {
      const foundTarget = cachedInstalledApps.find((a) => {
        const n = a.name.toLowerCase()
        return n === tgt || n.includes(tgt)
      })
      if (foundTarget) return foundTarget
    }

    // C. Compact match (tanpa spasi/simbol, misal 'taskmanager' == 'Task Manager')
    const compactMatch = cachedInstalledApps.find((a) => {
      const nCompact = a.name.toLowerCase().replace(/[\s\-_]+/g, '')
      if (nCompact === qCompact) return true
      if (a.aliases && a.aliases.some((alias) => alias.toLowerCase().replace(/[\s\-_]+/g, '') === qCompact)) {
        return true
      }
      return false
    })
    if (compactMatch) return compactMatch

    // D. Substring match (hanya jika panjang query >= 3 agar tidak false positive)
    if (q.length >= 3) {
      const partial = cachedInstalledApps.find((a) => {
        const n = a.name.toLowerCase()
        if (n.includes(q) || (n.length >= 4 && q.includes(n))) return true
        if (
          a.aliases &&
          a.aliases.some(
            (alias) => alias.toLowerCase().includes(q) || (alias.length >= 4 && q.includes(alias.toLowerCase()))
          )
        ) {
          return true
        }
        return false
      })
      if (partial) return partial
    }
  }

  return null
}

async function tryFastLaunchApp(text) {
  const queries = extractAppQueries(text)
  if (!queries || queries.length === 0) return false

  // Cek apakah perintah mengarah ke Pemutar Musik bawaan avatar
  const isMusicQuery = queries.some((q) => /^(?:musik|music|lofi|lagu|player|pemutar musik)$/i.test(q))
  if (isMusicQuery) {
    musicPlayer.showWindow()
    if (!musicPlayer.isPlaying) {
      musicPlayer.playTrack(musicPlayer.currentTrackIndex)
    }
    showSpeechBubble('Memutar musik lofi companion untukmu 🎵', 3500)
    speak('Memutar musik companion untukmu sekarang!', 'happy')
    return true
  }

  // Pastikan cachedInstalledApps terisi jika saat startup belum siap
  if (!cachedInstalledApps || cachedInstalledApps.length === 0) {
    try {
      const res = await window.hermesAvatar?.getInstalledApps?.()
      if (res?.ok && Array.isArray(res.apps)) {
        cachedInstalledApps = res.apps
      }
    } catch {}
  }

  const matchedApps = []
  const missingApps = []

  for (const q of queries) {
    const matched = findMatchingApp(q)
    if (matched) {
      // Hindari duplikasi jika pengguna menyebut aplikasi yang sama
      const id = (matched.command || matched.path || matched.name).toLowerCase()
      if (!matchedApps.some((m) => (m.command || m.path || m.name).toLowerCase() === id)) {
        matchedApps.push(matched)
      }
    } else {
      missingApps.push(q)
    }
  }

  // Jika tidak ada satu pun aplikasi yang cocok sama sekali
  if (matchedApps.length === 0) {
    if (missingApps.length > 0) {
      const missingList = missingApps.map((q) => `"${q}"`).join(', ')
      log('avatar', `Aplikasi ${missingList} belum ditemukan di sistem.`)
      showSpeechBubble(`Aplikasi ${missingList} belum terdaftar 🤔`, 3500)
      speak(`Aku belum tahu lokasi aplikasi ${missingList}. Kamu bisa menambahkannya di Pengaturan.`, 'neutral')
      return true
    }
    return false
  }

  // Set ekspresi gembira saat meluncurkan aplikasi
  controller?.setExpression('happy')

  if (matchedApps.length === 1) {
    const app = matchedApps[0]
    setStatus(`Membuka ${app.name}… 🚀`)
    showSpeechBubble(`Membuka ${app.name}... 🚀`, 3500)
    log('avatar', `🚀 Membuka ${app.name}...`)
    speak(`Membuka ${app.name} sekarang!`, 'happy')
  } else {
    const names = matchedApps.map((a) => a.name).join(', ')
    setStatus(`Membuka ${matchedApps.length} aplikasi… 🚀`)
    showSpeechBubble(`Membuka ${names}... 🚀`, 4500)
    log('avatar', `🚀 Membuka ${matchedApps.length} aplikasi sekaligus: ${names}`)
    speak(`Membuka ${matchedApps.length} aplikasi sekaligus: ${names}!`, 'happy')
  }

  // Luncurkan seluruh aplikasi yang cocok
  for (const app of matchedApps) {
    try {
      const res = await window.hermesAvatar?.launchApp(app.command || app.path)
      if (!res?.ok) {
        log('avatar', `⚠️ Gagal membuka ${app.name}: ${res?.error || 'Unknown error'}`)
      }
    } catch (err) {
      log('avatar', `⚠️ Error membuka ${app.name}: ${err.message}`)
    }
    // Jeda singkat 200ms antar proses agar OS Windows stabil
    if (matchedApps.length > 1) {
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  // Berikan catatan jika sebagian aplikasi yang diminta tidak ditemukan
  if (missingApps.length > 0) {
    const missingList = missingApps.map((q) => `"${q}"`).join(', ')
    log('avatar', `ℹ️ Catatan: aplikasi ${missingList} tidak ditemukan di sistem.`)
  }

  return true
}

// Baca daftar aplikasi terdaftar (dari localStorage settings + scanned apps) → konteks untuk Hermes.
function getRegisteredApps() {
  const list = []
  try {
    const raw = localStorage.getItem('hermes-avatar-settings')
    if (raw) {
      const s = JSON.parse(raw)
      for (const a of s.actionApps || []) {
        if (a.name) list.push(a.command ? `${a.name} (path: "${a.command}")` : a.name)
      }
    }
  } catch {}
  if (cachedInstalledApps && cachedInstalledApps.length > 0) {
    for (const a of cachedInstalledApps.slice(0, 25)) {
      if (a.name && !list.some((x) => x.startsWith(a.name))) {
        list.push(a.name)
      }
    }
  }
  return list
}

// Baca pose default (a-pose / t-pose) dari localStorage settings.
function getPoseSetting() {
  try {
    const raw = localStorage.getItem('hermes-avatar-settings')
    if (!raw) return 'a-pose'
    const s = JSON.parse(raw)
    return s.stateAnimations?.idle || s.pose || 'a-pose'
  } catch {
    return 'a-pose'
  }
}

// Ambil konfigurasi gaya animasi status dari localStorage
function getStateAnimationSetting(stateKey, fallback) {
  try {
    const raw = localStorage.getItem('hermes-avatar-settings')
    if (!raw) return fallback
    const s = JSON.parse(raw)
    return s.stateAnimations?.[stateKey] || fallback
  } catch {
    return fallback
  }
}

function getSavedAnimations() {
  try {
    const raw = localStorage.getItem('hermes-avatar-settings')
    if (!raw) return []
    const s = JSON.parse(raw)
    return s.animations || []
  } catch {
    return []
  }
}

// Mainkan gaya animasi berdasarkan status avatar (berpikir, jam, memproses, menyapa, idle)
async function triggerStateAnimation(stateKey, fallbackStyle) {
  const style = getStateAnimationSetting(stateKey, fallbackStyle)
  if (style && style.startsWith('custom:')) {
    const animId = style.replace('custom:', '')
    const anim = getSavedAnimations().find((a) => a.id === animId)
    if (anim) {
      await playCustomEmote(anim)
      return
    }
  }

  if (stateKey === 'thinking') {
    if (style === 'neutral') controller?.setExpression('neutral')
    else if (style === 'ponder') controller?.setExpression('ponder')
    else if (style === 'curious') controller?.setExpression('curious')
    else controller?.setExpression('thinking')
  } else if (stateKey === 'watch') {
    if (live2dPet?.setWatchStyle) {
      live2dPet.setWatchStyle(style || 'watch_suit')
    } else {
      live2dPet?.setTimerFocusMode?.(style !== 'casual', style || 'watch_suit')
    }
  } else if (stateKey === 'processing') {
    if (style === 'focus') controller?.setExpression('focus')
    else if (style === 'relaxed') controller?.setExpression('relaxed')
    else controller?.setExpression('composing')
  } else if (stateKey === 'greeting') {
    if (style === 'sarangheo') {
      controller?.setExpression('happy')
    } else if (style === 'wave') {
      if (live2dPet) {
        live2dPet.setExpression('wave')
      } else {
        controller?.playEmote('wave')
      }
    } else if (style === 'bounce') {
      controller?.playEmote('bounce')
    } else {
      controller?.playEmote(style || 'bounce')
    }
  } else if (stateKey === 'idle') {
    if (style === 't-pose') {
      if (controller?.setTPose) controller.setTPose()
    } else {
      if (controller?.setAPose) controller.setAPose()
    }
  }
}

let previewResetTimer = null

// Mengembalikan avatar ke kondisi awal yang bersih setelah pengujian
function restoreAvatarAfterPreview() {
  const isFocusSessionActive = isTimerRunning || (!timerPanel?.hidden && (timerOutfitToggle ? timerOutfitToggle.checked : true))
  if (isFocusSessionActive) {
    // Jika timer Pomodoro/fokus benar-benar sedang aktif, pulihkan pakaian kerja/jam
    const watchStyle = getStateAnimationSetting('watch', 'watch_suit')
    live2dPet?.setWatchStyle?.(watchStyle)
  } else {
    // Sesi santai biasa: bersihkan aksesoris dan kembalikan ke pose idle default
    live2dPet?.resetAllAccessories?.()
    controller?.setExpression?.('neutral')
    const pose = getPoseSetting()
    if (pose === 't-pose') {
      controller?.setTPose?.()
    } else {
      controller?.setAPose?.()
    }
  }
}

// Listener untuk preview / pengujian animasi langsung dari Settings
window.hermesAvatar?.onPreviewAnimation?.(async (data) => {
  if (!data) return

  // Batalkan timer reset sebelumnya jika ada pengujian beruntun
  if (previewResetTimer) {
    clearTimeout(previewResetTimer)
    previewResetTimer = null
  }

  // Bersihkan pose/ekspresi sebelumnya secara instan sebelum memainkan gaya baru
  live2dPet?.resetAllAccessories?.()
  controller?.setExpression?.('neutral')
  if (animMixer) {
    animMixer.stopAllAction()
  }

  try {
    if (data.anim && data.anim.path) {
      await playCustomEmote(data.anim)
    } else if (data.state) {
      await triggerStateAnimation(data.state, data.style)
    }
  } catch (err) {
    console.warn('[Avatar] Gagal memutar animasi preview:', err)
  }

  // Otomatis kembalikan avatar ke mode normal/idle setelah 3.8 detik
  previewResetTimer = setTimeout(() => {
    restoreAvatarAfterPreview()
    previewResetTimer = null
  }, 3800)
})

// Baca setting TTS/conversation dari localStorage (default aman).
function getVoiceSettings() {
  try {
    const raw = localStorage.getItem('hermes-avatar-settings')
    const s = raw ? JSON.parse(raw) : {}
    const provider = s.tts?.provider || 'kokoro'
    let voice = s.tts?.voice || (provider === 'kokoro' ? 'af_heart' : 'id-ID-GadisNeural')
    if (provider === 'kokoro' && !/^[a-z]{2}_/i.test(voice)) {
      voice = 'af_heart'
    } else if (provider === 'edge' && /^[a-z]{2}_/i.test(voice)) {
      voice = 'id-ID-GadisNeural'
    }
    return {
      voice,
      provider,
      intonation: s.tts?.intonation || 'anime',
      kokoroEndpoint: s.tts?.kokoroEndpoint || 'http://127.0.0.1:8880',
      speed: s.tts?.speed || 1.0,
      verbosity: s.tts?.verbosity || 'concise',
      bargeIn: s.conversation?.bargeIn !== false,
      continuous: !!s.conversation?.continuous
    }
  } catch {
    return {
      voice: 'af_heart',
      provider: 'kokoro',
      intonation: 'anime',
      kokoroEndpoint: 'http://127.0.0.1:8880',
      speed: 1.0,
      verbosity: 'concise',
      bargeIn: true,
      continuous: false
    }
  }
}

// Prepend konteks waktu real-time, cuaca live, berita live hari ini & aplikasi terdaftar agar respon 100% akurat & instan <2 detik.
async function buildPrompt(text) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  const timeContext = `[WAKTU & TANGGAL SISTEM SAAT INI: ${dateStr}, pukul ${timeStr} WIB.\n` +
    `ATURAN MUTLAK: Hari ini adalah ${dateStr}. Seluruh jawaban, ramalan cuaca, atau rangkuman berita WAJIB mengacu pada hari ini (${dateStr}). Jangan pernah memberikan tanggal lampau/lama seolah-olah itu hari ini!]\n`

  const apps = getRegisteredApps()
  const appCtx = apps.length > 0 ? `[Aplikasi terdaftar di sistem pengguna: ${apps.join(', ')}]\n` : ''

  // Cek apakah pertanyaan pengguna terkait cuaca
  let liveWeatherCtx = ''
  if (/\b(cuaca|suhu|hujan|panas|prakiraan cuaca|derajat|payung)\b/i.test(text)) {
    try {
      const w = await window.hermesAvatar?.getLiveWeather?.('Jakarta')
      if (w && w.ok) {
        liveWeatherCtx = `[DATA REAL-TIME CUACA HARI INI (${dateStr}) SUMBER OPEN-METEO/BMKG:\n` +
          `- Kota: ${w.city}\n` +
          `- Kondisi: ${w.condition}\n` +
          `- Suhu saat ini: ${w.temp}°C\n` +
          `- Kelembapan udara: ${w.humidity}%\n` +
          `- Kecepatan angin: ${w.wind} km/jam\n` +
          `INSTRUKSI: Gunakan data resmi di atas untuk menjawab cuaca hari ini (${dateStr}) secara lugas, ramah, dan ringkas dalam 2-3 kalimat saja. Tidak perlu menjalankan tools terminal lain.]\n`
      }
    } catch (err) {
      console.warn('[LiveWeather] Gagal ambil cuaca:', err)
    }
  }

  // Cek apakah pertanyaan pengguna terkait berita / info Indonesia terkini
  let liveNewsCtx = ''
  if (/\b(berita|kabar|informasi indonesia|peristiwa|terkini|update hari ini|berita hari ini|kabar hari ini)\b/i.test(text)) {
    try {
      const n = await window.hermesAvatar?.getLiveNews?.()
      if (n && n.ok && Array.isArray(n.items) && n.items.length > 0) {
        const headlines = n.items.slice(0, 4).map((it, idx) => `${idx + 1}. ${it.title}`).join('\n')
        liveNewsCtx = `[DATA RESMI BERITA TERKINI INDONESIA HARI INI (${dateStr}) SUMBER GOOGLE NEWS RSS TERVERIFIKASI:\n` +
          `${headlines}\n` +
          `INSTRUKSI: Gunakan berita resmi di atas untuk merangkum berita Indonesia hari ini (${dateStr}). Rangkum menjadi 3-4 poin berita terkini yang padat, menarik, dan informatif (maksimal 150 kata total). Tidak perlu membuka browser atau terminal.]\n`
      }
    } catch (err) {
      console.warn('[LiveNews] Gagal ambil berita:', err)
    }
  }

  const speedHint = `[PANDUAN RESPON CEPAT:
1. Jika butuh info berita tambahan di luar konteks, jalankan: 'ddgs news -q "<topik>" -r id-id -t d -m 4' (timelimit 24 jam terakhir).
2. Jika butuh cek cuaca kota lain, jalankan: 'ddgs text -q "cuaca <kota> hari ini" -r id-id -t d -m 2'.
3. Selalu sebutkan hari dan tanggal yang tepat (${dateStr}) dan gunakan format Markdown yang rapi.]\n`

  return `${timeContext}${appCtx}${liveWeatherCtx}${liveNewsCtx}${speedHint}\n${text}`
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const text = input.value.trim()
  if (!text) return

  if (busy) {
    log('avatar', '(sibuk) Tunggu Hermes selesai dulu ya…')
    return
  }

  log('user', text)
  input.value = ''

  // Cek apakah perintah membuat notulen / ringkasan percakapan
  if (isSummaryRequest(text)) {
    generateExecutiveSummary()
    return
  }

  // Cek apakah perintah menampilkan Menu Keunggulan / Assessment Tool
  if (isCapabilityRequest(text)) {
    showCapabilityAssessmentCard()
    return
  }

  // Cek apakah perintah memilih opsi demonstrasi assessment (misal: "coba 1 dan 3")
  const assessmentChoices = extractAssessmentChoices(text)
  if (assessmentChoices) {
    await executeSelectedCapabilities(assessmentChoices)
    return
  }

  // Cek Fast-Path Aplikasi terlebih dahulu (<50ms!)
  const fastLaunched = await tryFastLaunchApp(text)
  if (fastLaunched) {
    return
  }

  if (!hermesReady) {
    log('avatar', '(offline) Hermes belum terhubung.')
    return
  }

  // Kunci kolom chat selama Hermes bekerja.
  setInputLocked(true)

  try {
    const finalPrompt = await buildPrompt(text)
    await hermes.submitPrompt(finalPrompt)
  } catch (err) {
    log('avatar', `Gagal kirim: ${err.message}`)
    setInputLocked(false)
  }
})

// --- Tombol mic (push-to-talk via Hermes voice.record) ---
let recording = false

async function toggleMic() {
  if (!hermesReady) {
    log('avatar', '(offline) Hermes belum terhubung.')
    showSpeechBubble('Hermes belum terhubung ⚠️', 2500)
    return
  }

  try {
    if (!recording) {
      // Barge-in: jika diizinkan & Hermes sedang bicara, hentikan dulu.
      const vs = getVoiceSettings()
      if (vs.bargeIn && (conversationState === 'speaking' || isSpeaking)) {
        interruptSpeech()
      }
      await hermes.voiceToggle('on')
      await hermes.voiceRecord('start')
      recording = true
      setConversationState('listening')
      micBtn.textContent = '⏹️'
      micBtn.classList.add('recording')
      showSpeechBubble('Mendengarkan suara Anda... 🎙️', 4000)
    } else {
      await hermes.voiceRecord('stop')
      recording = false
      setConversationState('transcribing')
      micBtn.textContent = '🎤'
      micBtn.classList.remove('recording')
      showSpeechBubble('Menerjemahkan suara... ⏳', 3000)
    }
  } catch (err) {
    log('avatar', `Mic gagal: ${err.message}`)
    showSpeechBubble(`Mic error: ${err.message}`, 3000)
    recording = false
    micBtn.textContent = '🎤'
    micBtn.classList.remove('recording')
  }
}

micBtn?.addEventListener('click', (e) => {
  e.stopPropagation()
  toggleMic()
})

// --- Global shortcut (dari main process) ---
window.hermesAvatar.onShortcut((payload) => {
  const action = payload?.action
  if (action === 'toggle-chat') {
    toggleChat()
  } else if (action === 'toggle-mic') {
    toggleMic()
  }
})

// --- Web Companion (Chrome & Edge Extension) Ask AI Prompt Handler ---
window.hermesAvatar.onWebPrompt?.(async (data) => {
  if (!data) return

  // 1. Buka jendela chat jika sedang tersembunyi
  if (chatSheet?.classList.contains('hidden')) {
    toggleChat()
  }

  const title = (data.title || 'Halaman Web').trim()
  const url = (data.url || '').trim()
  const snippet = (data.text || '').trim()
  const question = (data.prompt || 'Tolong jelaskan teks berikut:').trim()

  // Format pesan pengguna dengan referensi sumber web yang elegan
  let userDisplay = `🌐 **[${escapeHtml(title)}](${escapeHtml(url)})**\n\n`
  if (snippet && snippet !== url) {
    const preview = snippet.length > 280 ? snippet.slice(0, 280) + '…' : snippet
    userDisplay += `> _"${escapeHtml(preview)}"_\n\n`
  }
  userDisplay += `❓ **Pertanyaan:** ${escapeHtml(question)}`

  log('user', userDisplay)

  // Emosi avatar: curious / thinking
  controller?.setExpression('curious')
  showSpeechBubble('Menerima pertanyaan dari browser! 🌐 Menganalisis...', 4000)

  if (!hermesReady) {
    log('avatar', '⚠️ **Hermes AI Daemon belum aktif di background.** Silakan periksa status koneksi di menu Pengaturan.')
    speak('Hermes belum terhubung, silakan nyalakan service di pengaturan.', 'neutral')
    return
  }

  setInputLocked(true)

  try {
    const promptPayload = `[PERTANYAAN DARI CHROME/EDGE EXTENSION (HERMES WEB COMPANION)]
Sumber Halaman: ${title} (${url})
Teks / Kutipan dari Web:
"""
${snippet}
"""

Instruksi / Pertanyaan Pengguna:
${question}

Panduan Format:
1. Berikan intisari singkat 1-2 kalimat di awal.
2. Rangkum penjelasan dan fakta-fakta kunci menjadi 3-4 poin/bullet penting (key takeaways) yang mudah dipahami.
3. Gunakan bahasa Indonesia yang santun, lugas, dan bersahabat.`

    const finalPrompt = await buildPrompt(promptPayload)
    await hermes.submitPrompt(finalPrompt)
  } catch (err) {
    log('avatar', `Gagal memproses pertanyaan web: ${err.message}`)
    setInputLocked(false)
  }
})

