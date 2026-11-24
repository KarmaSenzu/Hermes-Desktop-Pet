/**
 * settings-animations.js — Panel konfigurasi animasi, pose, emote, dan pemetaan status avatar
 */

import { escapeHtml } from './utils.js'
import { showToast } from './toast.js'
import { renderIcon } from './icons.js'

let settings = null
let saveSettings = null
let statusEl = null
let showConfirm = (message) => Promise.resolve(confirm(message))

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
      { id: 'glasses', label: 'Kacamata Fokus (Default Bawaan)' },
      { id: 'ponder', label: 'Merenung Serius & Tenang' },
      { id: 'curious', label: 'Menatap Penasaran' },
      { id: 'neutral', label: 'Netral Tanpa Kacamata' }
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
      { id: 'watch_suit', label: 'Jas & Jam Tangan Disiplin (Default)' },
      { id: 'watch_only', label: 'Cek Jam Tangan Saja (Kasual)' },
      { id: 'glasses_only', label: 'Kacamata Belajar Tanpa Jam' },
      { id: 'casual', label: 'Pakaian Santai Bebas' }
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
      { id: 'charterer', label: 'Roll Rambut Cepat (Default Bawaan)' },
      { id: 'focus', label: 'Fokus Konsentrasi Tinggi' },
      { id: 'relaxed', label: 'Santai Menunggu' }
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
      { id: 'sarangheo', label: 'Tangan Sarangheo (Love & Blush - Default)' },
      { id: 'bounce', label: 'Melompat Ringan (Bounce)' },
      { id: 'wave', label: 'Melambaikan Tangan (Wave)' }
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
      { id: 'a-pose', label: 'A-Pose (Tangan di Samping Natural - Default)' },
      { id: 't-pose', label: 'T-Pose (Tangan Terentang)' }
    ]
  }
]

const ANIM_MENU = [
  { id: 'state-mapping', icon: 'sliders', theme: 'indigo', label: 'Pemetaan Gaya Status Avatar', desc: 'Atur gaya avatar saat berpikir, megang jam, memproses, menyapa, dan diam' },
  { id: 'idle-reminder', icon: 'bell', theme: 'rose', label: 'Pengingat Idle & Postur Tubuh', desc: 'Atur kalimat pengingat (minum air, tegakkan badan, dll) & interval kemunculannya saat avatar santai/idle' },
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
    return anim ? anim.name : 'Kustom'
  }
  return 'Aktif'
}

function customOptionsForState(targetState, activeVal) {
  const list = (settings.animations || []).filter((a) => !a.targetState || a.targetState === targetState || a.targetState === 'custom')
  if (!list.length) return ''
  const opts = list.map((a) => {
    const isSelected = activeVal === `custom:${a.id}` ? 'selected' : ''
    return `<option value="custom:${escapeHtml(a.id)}" ${isSelected}>${escapeHtml(a.name)} (.${escapeHtml(a.format)})</option>`
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

let currentPhraseAudio = null
async function previewPhraseVoice(text) {
  if (currentPhraseAudio) {
    try {
      currentPhraseAudio.pause()
    } catch {}
    currentPhraseAudio = null
  }
  try {
    const voice = settings.tts?.voice || 'af_heart'
    const provider = settings.tts?.provider || 'kokoro'
    const speed = settings.tts?.speed || 1.0
    const intonation = settings.tts?.intonation || 'sweet'
    const kokoroEndpoint = settings.tts?.kokoroEndpoint || 'http://127.0.0.1:8880'

    showToast('Memproses Suara…', text, 'running', '🎙️', 2500)
    const res = await window.hermesAvatar?.synthesizeSpeech?.(text, voice, {
      provider,
      speed,
      intonation,
      kokoroEndpoint
    })
    if (res?.ok) {
      const audioSrc = res.dataUrl || (res.base64 ? `data:${res.mimeType || 'audio/mpeg'};base64,${res.base64}` : null)
      if (audioSrc) {
        currentPhraseAudio = new Audio(audioSrc)
        currentPhraseAudio.play()
        showToast('Memutar Suara Pengingat', text, 'success', '🔊', 3000)
      }
    }
  } catch (err) {
    showToast('Gagal Memutar Audio', err.message, 'error', '❌')
  }
}

function renderAnimMenu() {
  const animCount = customAnimations().length
  const defaultPose = settings.stateAnimations?.idle === 't-pose' || settings.pose === 't-pose' ? 'T-Pose' : 'A-Pose'

  animMenu.innerHTML = ANIM_MENU.map((m) => {
    let countBadge = ''
    if (m.id === 'state-mapping') {
      countBadge = `<span class="format-count-pill on">5 Status Aktif</span>`
    } else if (m.id === 'idle-reminder') {
      const cfg = settings.idleReminder || {}
      const isEn = cfg.enabled !== false
      const count = (cfg.lines || []).length
      countBadge = isEn
        ? `<span class="format-count-pill on">${cfg.intervalMinutes || 10}m (${count} Kalimat)</span>`
        : `<span class="format-count-pill off">Nonaktif</span>`
    } else if (m.id === 'add') {
      countBadge = `<span class="format-count-pill off">+ Unggah</span>`
    } else if (m.id === 'pose-saved') {
      countBadge = animCount > 0
        ? `<span class="format-count-pill on">${animCount} File</span>`
        : `<span class="format-count-pill off">0 File</span>`
    } else if (m.id === 'emote') {
      const total = BUILTIN_EMOTES.length + customEmotes().length
      countBadge = `<span class="format-count-pill on">${total} Emote</span>`
    } else if (m.id === 'pose-default') {
      countBadge = `<span class="format-count-pill on">${defaultPose}</span>`
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
              <button type="button" class="mini-btn use btn-test-state" data-state="${def.key}" title="Uji coba gaya ini langsung di avatar"><span class="btn-svg-icon">${renderIcon('play', { size: 12 })}</span> Uji</button>
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
          showToast('Gaya Avatar Diperbarui', `${def.label}: ${sel.options[sel.selectedIndex].text}`, 'success', '✨')
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
        showToast('Menguji Gerakan Avatar', `Memainkan sampel ${def?.label || stateKey}`, 'info', '⚡', 2500)
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
              <option value="thinking">Berpikir (Thinking / Reasoning)</option>
              <option value="watch">Megang Jam (Timer &amp; Fokus)</option>
              <option value="processing">Memproses (Menyusun Respon)</option>
              <option value="greeting">Menyapa &amp; Sentuhan (Greeting / Love)</option>
              <option value="idle">Postur Diam (Idle Standby)</option>
              <option value="custom">Animasi Kustom Umum</option>
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
            <button type="button" class="mini-btn use" id="pose-test-btn" title="Uji coba pose ini"><span class="btn-svg-icon">${renderIcon('play', { size: 12 })}</span> Uji</button>
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
      showToast('Pose Default Disimpan', `Pose aktif: ${sel.options[sel.selectedIndex].text}`, 'success', '🎬')
    }
    testBtn.onclick = () => {
      previewStateAnimation('idle', sel.value)
      showToast('Menguji Postur Diam', `Pose: ${sel.options[sel.selectedIndex].text}`, 'info', '⚡')
    }

  } else if (sub === 'idle-reminder') {
    const cfg = settings.idleReminder || {
      enabled: true,
      intervalMinutes: 10,
      lines: [
        'Jangan lupa minum air putih ya',
        'Postur tubuhnya ditegakkan dulu yuk, biar punggung tidak pegal',
        'Fokus kerja hebat banget! Semangat terus ya',
        'Sudah istirahatkan mata sejenak belum? Coba lihat ke kejauhan sebentar',
        'Ada yang bisa kubantu dengan AI Hermes? Buka chat kapan saja ya',
        'Tarik napas dalam-dalam... hembuskan perlahan'
      ]
    }

    const intervals = [
      { val: 1, label: '1 Menit (Tes Cepat)' },
      { val: 3, label: '3 Menit (Sering)' },
      { val: 5, label: '5 Menit' },
      { val: 10, label: '10 Menit (Bawaan Ideal)' },
      { val: 15, label: '15 Menit' },
      { val: 20, label: '20 Menit' },
      { val: 30, label: '30 Menit (Santai)' },
      { val: 45, label: '45 Menit' },
      { val: 60, label: '60 Menit (1 Jam)' }
    ]

    animDetail.innerHTML = `
      <div class="group-header">Konfigurasi Pengingat Santai (Idle Chatter)</div>
      <div class="card">
        <div class="settings-row">
          <div class="format-emblem theme-rose">
            ${renderIcon('bell', { size: 18 })}
          </div>
          <div class="format-info-col">
            <div class="format-title-line">
              <span class="format-title">Aktifkan Pengingat Berkala</span>
            </div>
            <p class="format-desc-text">Avatar akan sesekali berbicara ramah mengingatkan kesehatan & postur saat sedang santai</p>
          </div>
          <div class="row-control">
            <input id="idle-rem-enabled" type="checkbox" class="mac-switch" ${cfg.enabled !== false ? 'checked' : ''} />
          </div>
        </div>

        <div class="settings-row">
          <div class="format-emblem theme-blue">
            ${renderIcon('clock', { size: 18 })}
          </div>
          <div class="format-info-col">
            <div class="format-title-line">
              <span class="format-title">Interval Frekuensi Waktu</span>
            </div>
            <p class="format-desc-text">Seberapa sering avatar akan memunculkan kalimat pengingat saat idle</p>
          </div>
          <div class="row-control">
            <select id="idle-rem-interval" class="mac-select">
              ${intervals.map((i) => `<option value="${i.val}" ${i.val === (cfg.intervalMinutes || 10) ? 'selected' : ''}>${i.label}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <div class="group-header" style="margin-top:20px;">Koleksi Kalimat Pengingat Mandiri</div>
      <div class="card padded">
        <p class="hint" style="margin-top:0; margin-bottom:12px;">
          Tulis kalimat pengingat kustom Anda sendiri (misal: tegakkan badan, minum air, istirahatkan mata). Avatar akan memilih kalimat ini secara acak saat waktu tiba.
        </p>

        <div style="display:flex; gap:8px; margin-bottom:14px;">
          <input id="idle-rem-new-input" type="text" class="mac-input" style="flex:1;" placeholder="Ketik kalimat pengingat baru... (cth. Luruskan kaki dan rilekskan bahu)" />
          <button id="idle-rem-add-btn" class="mini-btn primary" style="height:34px; padding:0 14px;">+ Tambah</button>
        </div>

        <div id="idle-rem-list" class="anim-list"></div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.06);">
          <button id="idle-rem-reset-btn" class="mini-btn browse" title="Kembalikan ke 6 kalimat pengingat bawaan"><span class="btn-svg-icon">${renderIcon('refresh-cw', { size: 12 })}</span> Reset ke Bawaan</button>
          <button id="idle-rem-test-btn" class="mini-btn use" title="Langsung tampilkan salah satu kalimat di avatar sekarang"><span class="btn-svg-icon">${renderIcon('play', { size: 12 })}</span> Uji di Avatar Sekarang</button>
        </div>
      </div>
    `

    const toggleEn = document.getElementById('idle-rem-enabled')
    const selInterval = document.getElementById('idle-rem-interval')
    const inputNew = document.getElementById('idle-rem-new-input')
    const btnAdd = document.getElementById('idle-rem-add-btn')
    const listEl = document.getElementById('idle-rem-list')
    const btnReset = document.getElementById('idle-rem-reset-btn')
    const btnTest = document.getElementById('idle-rem-test-btn')

    const renderList = () => {
      const lines = settings.idleReminder?.lines || []
      if (lines.length === 0) {
        listEl.innerHTML = `<div style="text-align:center; padding:16px; color:var(--text-secondary); font-size:13px;">Belum ada kalimat pengingat. Tambahkan di atas atau klik Reset ke Bawaan.</div>`
        return
      }

      listEl.innerHTML = lines.map((line, idx) => `
        <div class="app-item" style="padding:8px 12px;">
          <div class="app-item-main" style="gap:10px;">
            <span class="btn-svg-icon">${renderIcon('message-circle', { size: 15 })}</span>
            <span style="font-size:13px; line-height:1.4;">${escapeHtml(line)}</span>
          </div>
          <div style="display:flex; gap:6px; flex-shrink:0;">
            <button type="button" class="mini-btn browse btn-test-phrase" data-idx="${idx}" title="Uji suara kalimat ini">${renderIcon('volume-2', { size: 13 })}</button>
            <button type="button" class="mini-btn danger btn-del-phrase" data-idx="${idx}" title="Hapus kalimat ini">${renderIcon('x', { size: 13 })}</button>
          </div>
        </div>
      `).join('')

      listEl.querySelectorAll('.btn-test-phrase').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx, 10)
          const text = (settings.idleReminder?.lines || [])[idx]
          if (text) previewPhraseVoice(text)
        })
      })

      listEl.querySelectorAll('.btn-del-phrase').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx, 10)
          const lines = settings.idleReminder?.lines || []
          if (idx >= 0 && idx < lines.length) {
            const removed = lines.splice(idx, 1)[0]
            settings.idleReminder.lines = lines
            saveSettings(settings)
            renderList()
            showToast('Kalimat Dihapus', removed, 'info', '🗑️', 2500)
          }
        })
      })
    }

    renderList()

    toggleEn.onchange = () => {
      settings.idleReminder = settings.idleReminder || {}
      settings.idleReminder.enabled = toggleEn.checked
      saveSettings(settings)
      showToast(toggleEn.checked ? 'Pengingat Idle Aktif' : 'Pengingat Idle Dimatikan', 'Status pengingat telah diperbarui.', 'success', toggleEn.checked ? '🔔' : '🔕')
    }

    selInterval.onchange = () => {
      settings.idleReminder = settings.idleReminder || {}
      const mins = parseInt(selInterval.value, 10) || 10
      settings.idleReminder.intervalMinutes = mins
      saveSettings(settings)
      showToast('Interval Diperbarui', `Pengingat akan muncul setiap ~${mins} menit saat santai`, 'success', '⏱️')
    }

    const addLine = () => {
      const text = inputNew.value.trim()
      if (!text) return
      settings.idleReminder = settings.idleReminder || {}
      settings.idleReminder.lines = settings.idleReminder.lines || []
      settings.idleReminder.lines.push(text)
      saveSettings(settings)
      inputNew.value = ''
      renderList()
      showToast('Kalimat Pengingat Ditambahkan', text, 'success', '✨')
    }

    btnAdd.addEventListener('click', addLine)
    inputNew.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        addLine()
      }
    })

    btnReset.addEventListener('click', () => {
      settings.idleReminder = settings.idleReminder || {}
      settings.idleReminder.lines = [
        'Jangan lupa minum air putih ya',
        'Postur tubuhnya ditegakkan dulu yuk, biar punggung tidak pegal',
        'Fokus kerja hebat banget! Semangat terus ya',
        'Sudah istirahatkan mata sejenak belum? Coba lihat ke kejauhan sebentar',
        'Ada yang bisa kubantu dengan AI Hermes? Buka chat kapan saja ya',
        'Tarik napas dalam-dalam... hembuskan perlahan'
      ]
      saveSettings(settings)
      renderList()
      showToast('Kalimat Bawaan Dipulihkan', '6 kalimat pengingat bawaan telah direset.', 'success', '🔄')
    })

    btnTest.addEventListener('click', async () => {
      const lines = settings.idleReminder?.lines || []
      const sample = lines.length > 0 ? lines[Math.floor(Math.random() * lines.length)] : 'Semangat fokus kerjanya ya!'
      try {
        const res = await window.hermesAvatar?.triggerIdleChatter?.(sample)
        if (res && res.ok === false) {
          showToast('Avatar Belum Aktif', 'Mulai desktop avatar terlebih dahulu untuk menguji di layar.', 'info', '⚠️')
        } else {
          showToast('Pengingat Dimunculkan di Layar', sample, 'success', '🔔')
        }
      } catch (err) {
        showToast('Info', err.message, 'info', 'ℹ️')
      }
    })
  }
}

function renderPoseListHtml() {
  const anims = customAnimations()
  if (anims.length === 0) {
    return `<div style="text-align:center; padding:24px 12px;">
      <p class="hint" style="margin-bottom:12px;">Belum ada animasi custom yang diunggah.</p>
      <button type="button" class="mini-btn use btn-upload-anim-trigger">+ Unggah Animasi Baru</button>
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
        ${isStateActive ? '<span class="voice-badge-pill">Aktif</span>' : ''}
      </div>
      <div style="display:flex; gap:6px; align-items:center;">
        <button class="mini-btn use anim-test-btn" data-id="${escapeHtml(a.id)}" title="Uji animasi langsung di avatar"><span class="btn-svg-icon">${renderIcon('play', { size: 12 })}</span> Uji</button>
        ${!isStateActive && a.targetState ? `<button class="mini-btn edit anim-activate-btn" data-id="${escapeHtml(a.id)}" data-state="${escapeHtml(a.targetState)}">Pasang Aktif</button>` : ''}
        <button class="mini-btn del anim-del-btn" data-id="${escapeHtml(a.id)}">Hapus</button>
      </div>
    </div>`
  }).join('')
}

function bindPoseListEvents() {
  const container = document.getElementById('pose-list')
  if (!container) return

  // Tombol tambah animasi saat list kosong
  container.querySelectorAll('.btn-upload-anim-trigger').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelector('[data-sub="add"]')?.click()
    })
  })

  // Uji animasi
  container.querySelectorAll('.anim-test-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const a = (settings.animations || []).find((x) => x.id === btn.dataset.id)
      if (a) {
        await window.hermesAvatar?.previewAnimation?.({ anim: a, state: a.targetState || 'custom' })
        showToast('Menguji Animasi', `Memainkan: ${a.name}`, 'info', '⚡', 2500)
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
      showToast('Gaya Animasi Terpasang', `Animasi aktif untuk status ${state}`, 'success', '✨')
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
      <button class="mini-btn use emote-test-btn" data-emote="${escapeHtml(e.id)}"><span class="btn-svg-icon">${renderIcon('play', { size: 12 })}</span> Uji</button>
    </div>`
  }).join('')
}

function bindEmoteTestEvents() {
  document.querySelectorAll('.emote-test-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const emote = btn.dataset.emote
      await window.hermesAvatar?.previewAnimation?.({ state: 'greeting', style: emote })
      showToast('Menguji Emote', `Memainkan emote: ${emote}`, 'info', '⚡', 2500)
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
      showToast('Pilih File Terlebih Dahulu', 'Klik tombol Pilih File untuk mencari animasi gerakan', 'error', '⚠️')
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
    showToast('Animasi Disimpan', `"${name}" berhasil diunggah${autoApply ? ' dan dijadikan gaya aktif' : ''}`, 'success', '🎉')
    openAnimDetail('state-mapping')
  })
}

export function renderAnimationSettings() {
  renderAnimMenu()
  animMenuView.classList.remove('hidden')
  animDetailView.classList.add('hidden')
}

animBackBtn?.addEventListener('click', () => {
  animDetailView?.classList.add('hidden')
  animMenuView?.classList.remove('hidden')
  renderAnimMenu()
})


export function initAnimationsPanel(ctx) {
  settings = ctx.settings
  saveSettings = ctx.saveSettings
  statusEl = ctx.statusEl
  if (typeof ctx.showConfirm === 'function') showConfirm = ctx.showConfirm
}
