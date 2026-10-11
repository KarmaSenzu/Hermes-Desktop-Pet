import { DesktopPet } from './desktop-pet.js'
import { loadModelFromBase64, loadMMDModel, loadFBXModel } from './model-loader.js'
import { AvatarController } from './avatar-controller.js'
import { HermesClient } from './hermes-client.js'
import { AudioPlayer } from './audio-player.js'
import { synthesize } from './tts.js'

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
const audioPlayer = new AudioPlayer()

// TTS on/off (bisa diatur lewat settings nanti).
let ttsEnabled = true

// Gabungan render-loop: idle (blink/napas/motion) + vrm.update + lip sync.
pet.onBeforeRender = (deltaMs) => {
  controller?.update(deltaMs)
  // three-vrm: update spring bone, lookAt, dll (delta dalam detik).
  controller?.vrm?.update(deltaMs / 1000)
  if (audioPlayer.isPlaying && controller) {
    controller.setMouthLevel(audioPlayer.getLevel())
  }
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
      }
    } else {
      // VRM/GLB: load dari base64.
      const mime = MIME_BY_EXT[ext] || 'application/octet-stream'
      const loaded = await loadModelFromBase64(result.base64, mime)
      scene = loaded.scene
      vrm = loaded.vrm
    }

    pet.setModel(scene)
    controller = new AvatarController(vrm)

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

// --- Toggle chat: klik ikon → sembunyikan/tampilkan chat (hanya avatar). ---
function toggleChat() {
  const hidden = chatSheet.classList.toggle('hidden')
  // Ubah ikon sesuai state.
  commentToggle.textContent = hidden ? '💬' : '✕'
}

commentToggle.addEventListener('click', toggleChat)

// Tombol emote DVD → trigger animasi bounce di main process.
const dvdBtn = document.getElementById('dvd-btn')
if (dvdBtn) {
  dvdBtn.addEventListener('click', () => {
    window.hermesAvatar.dvdBounce()
  })
}

// Tombol pengaturan → tutup avatar & kembali ke settings.
const settingsBtn = document.getElementById('settings-btn')
if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    window.hermesAvatar.closeAvatar()
  })
}

// Escape juga menutup chat (sembunyikan), bukan tutup window.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!chatSheet.classList.contains('hidden')) {
      chatSheet.classList.add('hidden')
      commentToggle.textContent = '💬'
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
  if (!statusBubble) return
  if (!text) {
    // Idle: tampilkan bubble netral.
    statusBubble.hidden = false
    statusBubble.textContent = IDLE_BUBBLE
    return
  }
  statusBubble.hidden = false
  statusBubble.textContent = text
}

// --- Sanitasi teks jawaban: buang emoji/emot & tag, fokus teks bersih ---
function cleanText(text) {
  return (text || '')
    // Hapus tag emosi [emotion:...] bila Hermes menyisipkannya.
    .replace(/\[emotion:[^\]]*\]/gi, '')
    // Hapus emoji umum (termasuk emoji tangan/gesture).
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    // Hapus markup ANSI bila ada.
    .replace(/\x1b\[[0-9;]*m/g, '')
    // Rapatkan spasi ganda & trim.
    .replace(/\s+/g, ' ')
    .trim()
}

function log(who, text) {
  const line = document.createElement('div')
  line.className = who
  line.textContent = `${who === 'user' ? 'Kamu' : 'Hermes'}: ${text}`
  chatLog.appendChild(line)
  chatLog.scrollTop = chatLog.scrollHeight
}

// Inisialisasi client Hermes (connect + buat session).
let hermes = null
let hermesReady = false
let streamingLine = null // div untuk teks streaming (message.delta)

async function initHermes() {
  try {
    // Baca WS URL + token dari main process (env saat app diluncurkan).
    const cfg = await window.hermesAvatar.getHermesConfig()
    hermes = new HermesClient(cfg.wsUrl, cfg.token)

    await hermes.connect()
    await hermes.createSession('Avatar chat')
    hermesReady = true
    log('avatar', 'Terhubung ke Hermes. Siap! 👋')

    // DEBUG: tampilkan SEMUA event masuk (hapus setelah stabil).
    hermes.onAny((params) => {
      const t = params?.type
      if (t && !['message.delta', 'thinking.delta'].includes(t)) {
        console.log('[event masuk]', t, JSON.stringify(params?.payload ?? {}))
      }
    })

    // Jawaban final.
    hermes.on('message.complete', (evt) => {
      const rawText = evt?.payload?.text ?? ''

      // Tangkap emosi dari tag [emotion:...] di awal (sebelum dibersihkan).
      const tagMatch = rawText.match(/^\s*\[emotion:([a-z]+)\]\s*/i)
      const taggedEmotion = tagMatch ? tagMatch[1].toLowerCase() : null

      const text = cleanText(rawText)

      if (streamingLine) {
        streamingLine.textContent = `Hermes: ${text}`
        streamingLine = null
      } else if (text) {
        log('avatar', text)
      }

      // Hermes selesai bekerja → buka kembali kolom chat.
      setInputLocked(false)

      // Emosi: prioritas tag dari Hermes, fallback heuristik.
      const emotion = taggedEmotion || detectEmotion(text)
      controller?.setExpression(emotion)

      // Tampilkan ringkasan jawaban di bubble (pendek, muat di atas avatar).
      lastSummary = summaryText(text)
      setStatus(lastSummary)

      // TTS + lip sync (teks tampil penuh dulu, lalu audio).
      if (ttsEnabled && text.trim()) {
        speak(text, emotion)
      }
    })

    // Streaming delta (teks muncul saat Hermes mengetik).
    hermes.on('message.delta', (evt) => {
      const chunk = cleanText(evt?.payload?.text ?? '')
      if (!chunk) return
      if (!streamingLine) {
        streamingLine = document.createElement('div')
        streamingLine.className = 'avatar'
        chatLog.appendChild(streamingLine)
      }
      streamingLine.textContent = `Hermes: ${streamingLine.textContent.replace(/^Hermes: /, '')}${chunk}`
      chatLog.scrollTop = chatLog.scrollHeight
    })

    // Turn dimulai → thinking + kunci input + bubble + bicara progress.
    hermes.on('message.start', () => {
      controller?.setExpression('thinking')
      setStatus('Memproses…')
      sayProgress('Memproses')
      setInputLocked(true)
    })

    // Thinking presisi (reasoning stream) → "Berpikir…".
    hermes.on('thinking.delta', () => {
      controller?.setExpression('thinking')
      setStatus('Berpikir…')
    })

    // Tool mulai dipakai → bubble spesifik + bicara progress.
    hermes.on('tool.start', (evt) => {
      const tool = evt?.payload?.name || evt?.payload?.tool || 'tool'
      const label = toolLabel(tool)
      log('avatar', `${label}`)
      setStatus(label)
      sayProgress(label)
    })

    // Tool selesai → "Menyusun jawaban…".
    hermes.on('tool.complete', () => {
      setStatus('Menyusun jawaban…')
      sayProgress('Menyusun jawaban')
    })

    // Turn error/berhenti → pastikan input tidak terkunci selamanya.
    hermes.on('error', () => {
      setInputLocked(false)
      setStatus('')
    })
    hermes.on('turn.complete', () => {
      setInputLocked(false)
      setStatus('')
    })

    // Hasil transkripsi suara → kirim ke Hermes sebagai teks.
    hermes.on('voice.transcript', (evt) => {
      const text = evt?.payload?.text ?? ''
      if (text.trim()) {
        log('user', text)
        setInputLocked(true)
        hermes.submitPrompt(buildPrompt(text)).catch((err) => {
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

function detectEmotion(text) {
  const t = (text || '').toLowerCase()

  if (/(terima kasih|thanks|mantap|bagus|hebat|oke|siap|berhasil|selamat|🎉|😊|👍)/.test(t)) {
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

async function processSpeechQueue() {
  if (isSpeaking) return
  isSpeaking = true
  try {
    while (speechQueue.length > 0) {
      const item = speechQueue.shift()
      const { text, emotion, isProgress } = item

      if (isProgress) setStatus('Speaking')
      try {
        const { buffer } = await synthesize(text)
        if (emotion) controller?.setExpression(emotion)
        await audioPlayer.play(buffer)
      } catch (err) {
        console.error('[TTS error]', err)
      }
      controller?.setMouthLevel(0)
      controller?.setExpression('neutral')
    }
  } finally {
    isSpeaking = false
    // Kembalikan bubble ke ringkasan terakhir (jika ada) atau idle.
    setStatus(lastSummary || '')
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

// Baca daftar aplikasi terdaftar (dari localStorage settings) → konteks untuk Hermes.
function getRegisteredApps() {
  try {
    const raw = localStorage.getItem('hermes-avatar-settings')
    if (!raw) return []
    const s = JSON.parse(raw)
    return (s.actionApps || []).map((a) => a.name).filter(Boolean)
  } catch {
    return []
  }
}

// Prepend konteks aplikasi terdaftar agar Hermes tahu "buka <app>" = buka aplikasi.
function buildPrompt(text) {
  const apps = getRegisteredApps()
  if (apps.length === 0) return text
  const ctx = `[Aplikasi terdaftar yang bisa dibuka: ${apps.join(', ')}]`
  return `${ctx}\n${text}`
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

  if (!hermesReady) {
    log('avatar', '(offline) Hermes belum terhubung.')
    return
  }

  // Kunci kolom chat selama Hermes bekerja.
  setInputLocked(true)

  try {
    await hermes.submitPrompt(buildPrompt(text))
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
    return
  }

  try {
    if (!recording) {
      await hermes.voiceToggle('on')
      await hermes.voiceRecord('start')
      recording = true
      micBtn.textContent = '⏹️'
      micBtn.classList.add('recording')
    } else {
      await hermes.voiceRecord('stop')
      recording = false
      micBtn.textContent = '🎤'
      micBtn.classList.remove('recording')
    }
  } catch (err) {
    log('avatar', `Mic gagal: ${err.message}`)
  }
}

micBtn.addEventListener('click', toggleMic)

// --- Global shortcut (dari main process) ---
window.hermesAvatar.onShortcut((payload) => {
  const action = payload?.action
  if (action === 'toggle-chat') {
    toggleChat()
  } else if (action === 'toggle-mic') {
    toggleMic()
  }
})
