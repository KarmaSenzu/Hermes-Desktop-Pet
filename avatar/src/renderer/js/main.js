import { DesktopPet } from './desktop-pet.js'
import { loadModelFromBase64, loadMMDModel, loadFBXModel, loadVmdClip, loadGlbClip } from './model-loader.js'
import { AvatarController } from './avatar-controller.js'
import { HermesClient } from './hermes-client.js'
import { AudioPlayer } from './audio-player.js'
import { synthesize } from './tts.js'
import { renderIcon } from './icons.js'
import { toSpeechText } from './speech-normalizer.js'
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
let mmdRef = null // { mesh, loader, helper } untuk playback .vmd
let modelScene = null // scene model aktif (untuk AnimationMixer .glb)
const audioPlayer = new AudioPlayer()

// TTS on/off (bisa diatur lewat settings nanti).
let ttsEnabled = true

// Gabungan render-loop: idle (blink/napas/motion) + vrm.update + lip sync + mmd.
pet.onBeforeRender = (deltaMs) => {
  controller?.update(deltaMs)
  // three-vrm: update spring bone, lookAt, dll (delta dalam detik).
  controller?.vrm?.update(deltaMs / 1000)
  // MMD/GLB animation playback (AnimationMixer).
  animMixer?.update(deltaMs / 1000)
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

// Helper: isi tombol dengan icon Lucide (ganti emoji).
function setIcon(el, name, size = 18) {
  if (!el) return
  el.innerHTML = renderIcon(name, { size })
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

// Terapkan icon Lucide ke tombol-tombol UI (ganti emoji).
setIcon(commentToggle, 'message-circle')
setIcon(document.getElementById('emote-toggle'), 'smile')
setIcon(document.getElementById('settings-btn'), 'settings', 16)
setIcon(micBtn, 'mic', 16)

// --- Toggle chat: klik ikon → sembunyikan/tampilkan chat (hanya avatar). ---
function toggleChat() {
  const hidden = chatSheet.classList.toggle('hidden')
  // Ubah ikon sesuai state: message-circle ↔ x.
  setIcon(commentToggle, hidden ? 'message-circle' : 'x')
}

commentToggle.addEventListener('click', toggleChat)

// --- Emote panel ---
const emoteToggle = document.getElementById('emote-toggle')
const emotePanel = document.getElementById('emote-panel')

// Emote bawaan (procedural) — id memetakan ke controller.playEmote().
const BUILTIN_EMOTES = [
  { id: 'bounce', icon: 'arrow-up', label: 'Bounce' },
  { id: 'jump', icon: 'arrow-up', label: 'Jump' },
  { id: 'wave', icon: 'hand', label: 'Wave' },
  { id: 'nod', icon: 'smile', label: 'Nod' }
]

// Baca emote custom (upload .glb/.vmd, type=emote) dari localStorage.
function getCustomEmotes() {
  try {
    const raw = localStorage.getItem('hermes-avatar-settings')
    if (!raw) return []
    const s = JSON.parse(raw)
    return (s.animations || []).filter((a) => a.type === 'emote')
  } catch {
    return []
  }
}

function renderEmotePanel() {
  if (!emotePanel) return

  const builtin = BUILTIN_EMOTES.map((e) => {
    return `<button class="emote-item" data-emote="${e.id}">${renderIcon(e.icon, { size: 16 })} <span>${escapeHtml(e.label)}</span></button>`
  }).join('')

  const custom = getCustomEmotes().map((a) => {
    return `<button class="emote-item" data-custom="${escapeHtml(a.id)}">${renderIcon('film', { size: 16 })} <span>${escapeHtml(a.name)}</span></button>`
  }).join('')

  emotePanel.innerHTML = builtin + custom

  // Bind klik: emote bawaan → playEmote(); custom → play .vmd/.glb.
  emotePanel.querySelectorAll('.emote-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const builtinId = btn.dataset.emote
      const customId = btn.dataset.custom
      if (builtinId) {
        controller?.playEmote(builtinId)
      } else if (customId) {
        const anim = getCustomEmotes().find((a) => a.id === customId)
        if (anim) playCustomEmote(anim)
      }
      emotePanel.hidden = true
    })
  })
}

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

if (emoteToggle && emotePanel) {
  emoteToggle.addEventListener('click', () => {
    renderEmotePanel()
    emotePanel.hidden = !emotePanel.hidden
  })

  // Klik di luar panel → tutup.
  document.addEventListener('click', (e) => {
    if (!emotePanel.hidden && !emotePanel.contains(e.target) && !emoteToggle.contains(e.target)) {
      emotePanel.hidden = true
    }
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

      // Tangkap tag [affect:...] [gesture:...] [emotion:...] (dari skill avatar-emote-controller).
      const tags = parseTags(rawText)

      const text = cleanText(rawText)

      if (streamingLine) {
        streamingLine.textContent = `Hermes: ${text}`
        streamingLine = null
      } else if (text) {
        log('avatar', text)
      }

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
      setConversationState('thinking')
      sayProgress('Memproses')
      setInputLocked(true)
    })

    // Thinking presisi (reasoning stream) → "Berpikir…".
    hermes.on('thinking.delta', () => {
      controller?.setExpression('thinking')
      setStatus('Berpikir…')
    })

    // Tool mulai dipakai → bubble spesifik (tanpa bicara, hindari queue menumpuk).
    hermes.on('tool.start', (evt) => {
      const tool = evt?.payload?.name || evt?.payload?.tool || 'tool'
      const label = toolLabel(tool)
      log('avatar', `${label}`)
      setStatus(label)
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
  try {
    while (speechQueue.length > 0) {
      const item = speechQueue.shift()
      const { text, emotion, isProgress } = item

      // Skip teks kosong / terlalu panjang (hindari TTS hang).
      if (!text || !text.trim()) continue
      if (text.length > 1000) continue // sangat panjang → skip TTS

      if (isProgress) setStatus('Speaking')
      setConversationState('speaking')
      try {
        const { buffer } = await withTimeout(synthesize(text), 15000)
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

// Baca pose default (a-pose / t-pose) dari localStorage settings.
function getPoseSetting() {
  try {
    const raw = localStorage.getItem('hermes-avatar-settings')
    if (!raw) return 'a-pose'
    const s = JSON.parse(raw)
    return s.pose || 'a-pose'
  } catch {
    return 'a-pose'
  }
}

// Baca setting TTS/conversation dari localStorage (default aman).
function getVoiceSettings() {
  try {
    const raw = localStorage.getItem('hermes-avatar-settings')
    const s = raw ? JSON.parse(raw) : {}
    return {
      speed: s.tts?.speed || 1.0,
      verbosity: s.tts?.verbosity || 'concise',
      bargeIn: s.conversation?.bargeIn !== false,
      continuous: !!s.conversation?.continuous
    }
  } catch {
    return { speed: 1.0, verbosity: 'concise', bargeIn: true, continuous: false }
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
    } else {
      await hermes.voiceRecord('stop')
      recording = false
      setConversationState('transcribing')
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
