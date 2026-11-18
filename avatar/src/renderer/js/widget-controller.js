/**
 * widget-controller.js — Pengendali Perintah Widget (Timer, Musik, Vision, File Drop, Briefing)
 * serta generator kartu interaktif di chat Hermes Avatar.
 */

function cleanExtractedTask(raw) {
  return String(raw || '')
    .replace(/\b(?:dong|ya|sekarang|please|tolong|sebentar|selama)\b/gi, '')
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '')
    .trim()
}

/**
 * Mem-parse perintah bahasa alami pengguna untuk widget Timer, Musik, Screen Vision, & Briefing.
 * Dirancang sebagai fungsi murni agar cepat (<5ms) & mudah diuji di Vitest.
 */
export function parseWidgetCommand(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  const lower = raw.toLowerCase()

  // 1. Screen Vision ("Lihat Layarku")
  if (
    /\b(?:lihat|cek|baca|analisis|analisa|periksa|tangkap|screenshot|intip)\s+(?:layar(?:ku|nya| ini| komputer| pc)?|screen(?:shot)?|tampilan(?:\s+layar)?|error\s+(?:di\s+)?layar)/i.test(lower) ||
    /\b(?:ada\s+error\s+apa\s+di\s+layar|apa\s+(?:yg|yang)\s+(?:ada\s+)?di\s+layar|lihat\s+error\s+ini)\b/i.test(lower)
  ) {
    return { action: 'screen-vision', question: raw }
  }

  // 2. Smart Daily Briefing ("Mulai Sesi Kerja" / "Briefing Hari Ini")
  if (
    /^(?:tolong\s+)?(?:buka|mulai|tampilkan|beri(?:kan)?|cek)?\s*(?:briefing(?:\s+hari\s+ini|\s+harian|\s+kerja)?|sapaan\s+(?:pagi|siang|sore|malam)|mulai\s+sesi\s+kerja(?:\s+(?:dong|ya|sekarang))?)[.!?]*$/i.test(lower)
  ) {
    return { action: 'daily-briefing' }
  }

  // 3. Kontrol Timer Stop / Reset
  if (/^(?:tolong\s+)?(?:hentikan|matikan|stop|pause|jeda|reset)\s+(?:timer|pomodoro|waktu\s+fokus|sesi\s+fokus)/i.test(lower)) {
    return { action: 'timer-stop' }
  }

  // 4. Kontrol Musik Playback (Next / Prev / Pause / Volume)
  if (/^(?:tolong\s+)?(?:ganti\s+ke\s+)?(?:lagu|musik|track)\s+(?:berikutnya|selanjutnya|next)|^next\s+(?:track|song|music)$/i.test(lower)) {
    return { action: 'music-next' }
  }
  if (/^(?:tolong\s+)?(?:lagu|musik|track)\s+(?:sebelumnya|prev|kemarin)|^prev(?:ious)?\s+(?:track|song|music)$/i.test(lower)) {
    return { action: 'music-prev' }
  }
  if (/^(?:tolong\s+)?(?:hentikan|matikan|stop|jeda|pause)\s+(?:musik|lagu|audio|lofi)/i.test(lower)) {
    return { action: 'music-pause' }
  }

  const volMatch = lower.match(/(?:atur|ubah|stel|set|besarkan|kecilkan)?\s*volume(?:\s+musik)?\s*(?:ke|jadi|di)?\s*(\d{1,3})\s*%?/i)
  if (volMatch) {
    return {
      action: 'music-volume',
      level: Math.max(0, Math.min(100, Number(volMatch[1])))
    }
  }

  // 5. Mulai Timer / Fokus
  const hasTimerKeyword = /\b(?:timer|pomodoro|mulai\s+fokus|sesi\s+fokus|hitung\s+mundur|mode\s+fokus)\b/i.test(lower)
  const hasMusicWord = /\b(?:musik|lagu|playlist|radio|spotify|youtube)\b/i.test(lower)
  if (hasTimerKeyword && !hasMusicWord) {
    let minutes = null
    const minMatch = lower.match(/(\d+)\s*(?:menit|mnt|min)\b/i)
    const hrMatch = lower.match(/(\d+)\s*jam\b/i)
    if (minMatch) {
      minutes = Math.max(1, Math.min(240, Number(minMatch[1])))
    } else if (hrMatch) {
      minutes = Math.max(1, Math.min(240, Number(hrMatch[1]) * 60))
    }

    let task = ''
    const taskMatch = raw.match(/\b(?:untuk|buat|tugas|ngapain|ngerjain|mengerjakan)\s+(.+)$/i)
    if (taskMatch && taskMatch[1]) {
      task = cleanExtractedTask(
        taskMatch[1].replace(/\b\d+\s*(?:menit|mnt|min|jam)\b/gi, '')
      )
    }

    if (minutes !== null || task) {
      return {
        action: 'timer-start-direct',
        minutes: minutes || 25,
        task
      }
    }
    return { action: 'timer-ask-setup' }
  }

  // 6. Musik / Playlist Picker atau Putar Spesifik
  if (/^(?:tolong\s+)?(?:pilih(?:kan)?|buka|tampilkan|lihat)\s+(?:playlist|daftar\s+(?:lagu|musik)|musik|lofi)[.!?]*$/i.test(lower)) {
    return { action: 'music-ask-playlist' }
  }

  const playMatch = raw.match(/^(?:tolong\s+)?(?:putar(?:kan)?|play|nyalakan|setel|hidupkan)\s+(?:playlist\s+|musik\s+|lagu\s+)?(.+?)[.!?]*$/i)
  if (playMatch) {
    const afterVerb = String(playMatch[1] || '').trim()
    const cleaned = afterVerb
      .replace(/\b(?:dong|ya|sekarang|please|dulu)\b/gi, '')
      .trim()
    const genericMusicOnly = /^(?:musik|lagu|lofi|lo-fi|playlist|audio|musik\s+lofi|lofi\s+beats?)?$/i.test(cleaned)
    if (genericMusicOnly) {
      return { action: 'music-ask-playlist' }
    }
    if (cleaned) {
      return { action: 'music-play-specific', query: cleaned }
    }
  }

  return null
}

/**
 * Memeriksa apakah error respon AI berkaitan dengan kuota habis, rate-limit (429/402), model overload (503), atau model dihentikan (404).
 */
export function isQuotaOrRateLimitError(errorText) {
  const t = String(errorText || '').toLowerCase()
  return /(429|402|503|high demand|no longer available|rate[\s_-]*limit|quota[\s_-]*(exceeded|habis|exhausted)|insufficient[\s_-]*(quota|balance|credit)|credit.*exhausted|too many requests)/i.test(t)
}

/**
 * Memilih kandidat provider AI cadangan yang valid & berbeda dari provider aktif saat ini.
 */
export function selectFailoverCandidate(candidates = [], currentBaseUrl = '', currentModel = '') {
  if (!Array.isArray(candidates) || candidates.length === 0) return null
  const normUrl = (u) => String(u || '').trim().replace(/\/+$/, '').toLowerCase()
  const curUrl = normUrl(currentBaseUrl)
  const curMod = String(currentModel || '').trim().toLowerCase()

  const valid = candidates.filter((c) => c && c.baseUrl && c.model && /^https?:\/\//i.test(c.baseUrl))
  const different = valid.filter((c) => (
    normUrl(c.baseUrl) !== curUrl || String(c.model).trim().toLowerCase() !== curMod
  ))
  if (different.length === 0) return null

  const priorityScore = (c) => {
    const u = normUrl(c.baseUrl)
    if (u.includes('generativelanguage.googleapis.com')) return 0
    if (u.includes('api.groq.com')) return 1
    if (u.includes('openrouter.ai')) return 2
    if (u.includes('api.mistral.ai')) return 3
    if (u.includes('127.0.0.1') || u.includes('localhost')) return 4
    return 5
  }

  return [...different].sort((a, b) => priorityScore(a) - priorityScore(b))[0]
}

function appendCardToChat(chatLog, card) {
  if (!chatLog) return
  chatLog.appendChild(card)
  chatLog.scrollTop = chatLog.scrollHeight
}

/**
 * Kartu Interaktif Pemilihan Playlist & Lagu Pengguna ("Ingin memulai playlist yang mana?")
 */
export function renderMusicPlaylistPickerCard({
  chatLog,
  musicPlayer,
  showSpeechBubble = () => {},
  speak = () => {},
  onAfterPick = () => {}
}) {
  if (!chatLog || !musicPlayer) return null
  const snapshot = musicPlayer.getLibrarySnapshot()
  const favSet = new Set(snapshot.favorites || [])

  // Prioritaskan playlist/lagu milik pengguna terlebih dahulu (Favorit, Custom Online/YT, Lokal), lalu kurasi & fokus
  const sortedTracks = [...snapshot.tracks].sort((a, b) => {
    const score = (t) => {
      if (favSet.has(t.id)) return 0
      if (t.id.startsWith('local-') || t.id.startsWith('online-')) return 1
      if (t.category === 'online') return 2
      if (t.category === 'focus') return 3
      return 4
    }
    return score(a) - score(b)
  })

  let activeCat = snapshot.favorites.length > 0
    ? 'favorite'
    : (snapshot.onlineCustomCount + snapshot.localCustomCount > 0
        ? (snapshot.onlineCustomCount > 0 ? 'online' : 'local')
        : 'all')

  const card = document.createElement('div')
  card.className = 'avatar assessment-card widget-card'

  const header = document.createElement('div')
  header.className = 'assessment-card-header'
  const badge = document.createElement('div')
  badge.className = 'assessment-badge'
  badge.textContent = '🎵 PILIH PLAYLIST & LAGU ANDA'
  const pill = document.createElement('span')
  pill.className = 'assessment-type-pill'
  pill.textContent = `${snapshot.tracks.length} Koleksi`
  header.appendChild(badge)
  header.appendChild(pill)
  card.appendChild(header)

  const promptEl = document.createElement('div')
  promptEl.className = 'assessment-prompt-text'
  promptEl.textContent = 'Ingin memutar playlist atau lagu yang mana? Klik salah satu di bawah ini:'
  card.appendChild(promptEl)

  const catsWrap = document.createElement('div')
  catsWrap.className = 'assessment-quick-presets'
  card.appendChild(catsWrap)

  const listWrap = document.createElement('div')
  listWrap.className = 'widget-track-list'
  card.appendChild(listWrap)

  const footer = document.createElement('div')
  footer.className = 'assessment-footer'
  const playCatBtn = document.createElement('button')
  playCatBtn.type = 'button'
  playCatBtn.className = 'assessment-execute-btn'
  playCatBtn.textContent = '▶ Putar Playlist Terpilih'
  const statusSpan = document.createElement('span')
  statusSpan.className = 'assessment-status-text'
  statusSpan.textContent = 'Klik lagu atau kategori untuk memutar'
  footer.appendChild(playCatBtn)
  footer.appendChild(statusSpan)
  card.appendChild(footer)

  const renderTracks = () => {
    const visibleTracks = sortedTracks.filter((t) => {
      if (activeCat === 'all') return true
      if (activeCat === 'favorite') return favSet.has(t.id)
      return t.category === activeCat
    })

    catsWrap.replaceChildren()
    for (const cat of snapshot.categories) {
      if (cat.count === 0 && cat.id !== 'all') continue
      const cBtn = document.createElement('button')
      cBtn.type = 'button'
      cBtn.className = `assessment-preset-chip ${activeCat === cat.id ? 'active-chip' : ''}`
      cBtn.textContent = `${cat.label} (${cat.count})`
      cBtn.addEventListener('click', () => {
        activeCat = cat.id
        renderTracks()
      })
      catsWrap.appendChild(cBtn)
    }

    listWrap.replaceChildren()
    if (visibleTracks.length === 0) {
      const emptyEl = document.createElement('div')
      emptyEl.className = 'widget-empty-note'
      emptyEl.textContent = 'Belum ada lagu di playlist ini. Pilih kategori lain atau tambahkan lagu dari panel Musik.'
      listWrap.appendChild(emptyEl)
      playCatBtn.disabled = true
      return
    }

    playCatBtn.disabled = false
    for (const tr of visibleTracks.slice(0, 8)) {
      const itemBtn = document.createElement('button')
      itemBtn.type = 'button'
      itemBtn.className = 'widget-list-btn'

      const left = document.createElement('span')
      left.className = 'widget-list-title'
      left.textContent = `${favSet.has(tr.id) ? '❤️ ' : '▶ '}${tr.title}`

      const right = document.createElement('span')
      right.className = 'widget-list-sub'
      right.textContent = `${tr.artist || 'Unknown'} · ${tr.badge || tr.category}`

      itemBtn.appendChild(left)
      itemBtn.appendChild(right)
      itemBtn.addEventListener('click', () => {
        const played = musicPlayer.playTrackById(tr.id)
        if (played) {
          pill.textContent = 'Memutar ♪'
          statusSpan.textContent = `Memutar: ${played.title}`
          showSpeechBubble(`Memutar "${played.title}" 🎵`, 4500)
          speak(`Baik, aku putarkan ${played.title}.`, 'happy')
          onAfterPick(played)
        }
      })
      listWrap.appendChild(itemBtn)
    }
  }

  playCatBtn.addEventListener('click', () => {
    const played = musicPlayer.playCategory(activeCat)
    if (played) {
      pill.textContent = 'Memutar ♪'
      statusSpan.textContent = `Memutar playlist: ${played.title}`
      showSpeechBubble(`Memutar playlist pilihanmu: "${played.title}" 🎵`, 4500)
      speak(`Baik, aku mulai putar dari playlist pilihanmu.`, 'happy')
      onAfterPick(played)
    }
  })

  renderTracks()
  appendCardToChat(chatLog, card)
  return card
}

/**
 * Kartu Interaktif Setup Sesi Fokus ("Mau mulai fokus buat apa & berapa menit?")
 */
export function renderFocusSetupCard({
  chatLog,
  pomodoroTimer,
  musicPlayer,
  showSpeechBubble = () => {},
  speak = () => {},
  onStartFocus = () => {}
}) {
  if (!chatLog || !pomodoroTimer) return null
  const lastTask = pomodoroTimer.getTask?.() || ''
  let chosenMinutes = 25

  const card = document.createElement('div')
  card.className = 'avatar assessment-card widget-card'

  const header = document.createElement('div')
  header.className = 'assessment-card-header'
  const badge = document.createElement('div')
  badge.className = 'assessment-badge'
  badge.textContent = '⏱️ ATUR SESI FOKUS'
  const pill = document.createElement('span')
  pill.className = 'assessment-type-pill'
  pill.textContent = 'Siap Mulai'
  header.appendChild(badge)
  header.appendChild(pill)
  card.appendChild(header)

  const promptEl = document.createElement('div')
  promptEl.className = 'assessment-prompt-text'
  promptEl.textContent = 'Mau mulai fokus buat apa kali ini, dan berapa menit?'
  card.appendChild(promptEl)

  const taskInput = document.createElement('input')
  taskInput.type = 'text'
  taskInput.className = 'widget-text-input'
  taskInput.placeholder = 'Contoh: Coding fitur baru, Belajar materi, Menulis laporan...'
  taskInput.maxLength = 60
  if (lastTask) taskInput.value = lastTask
  card.appendChild(taskInput)

  const quickTasks = document.createElement('div')
  quickTasks.className = 'assessment-quick-presets'
  const taskIdeas = [...new Set([lastTask, 'Coding Project', 'Belajar & Riset', 'Menulis & Dokumen', 'Kerja Mendalam'].filter(Boolean))]
  for (const idea of taskIdeas) {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'assessment-preset-chip'
    chip.textContent = idea
    chip.addEventListener('click', () => {
      taskInput.value = idea
    })
    quickTasks.appendChild(chip)
  }
  card.appendChild(quickTasks)

  const durRow = document.createElement('div')
  durRow.className = 'assessment-quick-presets'
  const durButtons = []
  for (const mins of [15, 25, 45, 60]) {
    const dBtn = document.createElement('button')
    dBtn.type = 'button'
    dBtn.className = `assessment-preset-chip ${mins === chosenMinutes ? 'active-chip' : ''}`
    dBtn.textContent = `⏱️ ${mins} Menit`
    dBtn.addEventListener('click', () => {
      chosenMinutes = mins
      durButtons.forEach((b, idx) => b.classList.toggle('active-chip', [15, 25, 45, 60][idx] === mins))
    })
    durButtons.push(dBtn)
    durRow.appendChild(dBtn)
  }
  card.appendChild(durRow)

  const askMusicLabel = document.createElement('label')
  askMusicLabel.className = 'widget-check-row'
  const askMusicCb = document.createElement('input')
  askMusicCb.type = 'checkbox'
  askMusicCb.checked = true
  const askMusicTxt = document.createElement('span')
  askMusicTxt.textContent = 'Sekalian tawarkan pilihan playlist musik pendamping'
  askMusicLabel.appendChild(askMusicCb)
  askMusicLabel.appendChild(askMusicTxt)
  card.appendChild(askMusicLabel)

  const footer = document.createElement('div')
  footer.className = 'assessment-footer'
  const startBtn = document.createElement('button')
  startBtn.type = 'button'
  startBtn.className = 'assessment-execute-btn'
  startBtn.textContent = '🚀 Mulai Fokus Sekarang'
  const statusSpan = document.createElement('span')
  statusSpan.className = 'assessment-status-text'
  statusSpan.textContent = 'Kostum kerja aktif otomatis'
  footer.appendChild(startBtn)
  footer.appendChild(statusSpan)
  card.appendChild(footer)

  startBtn.addEventListener('click', () => {
    const taskName = taskInput.value.trim() || 'Fokus Kerja'
    pomodoroTimer.startFocusWithConfig({ minutes: chosenMinutes, task: taskName })
    pill.textContent = `Aktif (${chosenMinutes}m)`
    statusSpan.textContent = `Sesi "${taskName}" berjalan`
    startBtn.disabled = true
    onStartFocus({ minutes: chosenMinutes, task: taskName })

    if (askMusicCb.checked && musicPlayer) {
      renderMusicPlaylistPickerCard({
        chatLog,
        musicPlayer,
        showSpeechBubble,
        speak
      })
    }
  })

  appendCardToChat(chatLog, card)
  return card
}

/**
 * Kartu Sapaan Kontekstual Pintar ("Smart Daily Briefing") saat aplikasi pertama aktif.
 */
export function renderSmartBriefingCard({
  chatLog,
  pomodoroTimer,
  musicPlayer,
  showSpeechBubble = () => {},
  speak = () => {},
  onCaptureScreen = () => {}
}) {
  if (!chatLog) return null
  const hour = new Date().getHours()
  const greetingTime = hour < 11
    ? 'Selamat Pagi 🌅'
    : hour < 15
      ? 'Selamat Siang ☀️'
      : hour < 18
        ? 'Selamat Sore 🌇'
        : 'Selamat Malam 🌙'

  const lib = musicPlayer?.getLibrarySnapshot?.() || { favorites: [], onlineCustomCount: 0, localCustomCount: 0 }
  const customCount = (lib.onlineCustomCount || 0) + (lib.localCustomCount || 0)
  const lastTask = pomodoroTimer?.getTask?.() || ''

  const card = document.createElement('div')
  card.className = 'avatar assessment-card widget-card'

  const header = document.createElement('div')
  header.className = 'assessment-card-header'
  const badge = document.createElement('div')
  badge.className = 'assessment-badge'
  badge.textContent = `✨ BRIEFING HARIAN · ${greetingTime.toUpperCase()}`
  const pill = document.createElement('span')
  pill.className = 'assessment-type-pill'
  pill.textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  header.appendChild(badge)
  header.appendChild(pill)
  card.appendChild(header)

  const bodyMsg = document.createElement('div')
  bodyMsg.className = 'assessment-prompt-text'
  const taskHint = lastTask ? ` Fokus terakhir: "${lastTask}".` : ''
  const musicHint = ` Tersedia ${lib.favorites?.length || 0} favorit & ${customCount} musik kustom.`
  bodyMsg.textContent = `${greetingTime}! Aku siap menemanimu.${taskHint}${musicHint} Mau mulai aktivitas apa dulu sekarang?`
  card.appendChild(bodyMsg)

  const actions = document.createElement('div')
  actions.className = 'assessment-quick-presets'

  const focusBtn = document.createElement('button')
  focusBtn.type = 'button'
  focusBtn.className = 'assessment-execute-btn'
  focusBtn.textContent = '⏱️ Mulai Sesi Fokus'
  focusBtn.addEventListener('click', () => {
    renderFocusSetupCard({ chatLog, pomodoroTimer, musicPlayer, showSpeechBubble, speak })
    showSpeechBubble('Mau mulai fokus buat apa hari ini? ⏱️', 4000)
  })

  const musicBtn = document.createElement('button')
  musicBtn.type = 'button'
  musicBtn.className = 'assessment-preset-chip active-chip'
  musicBtn.textContent = '🎵 Pilih Playlist Musik'
  musicBtn.addEventListener('click', () => {
    renderMusicPlaylistPickerCard({ chatLog, musicPlayer, showSpeechBubble, speak })
    showSpeechBubble('Pilih playlist atau lagu yang ingin kamu putar 🎵', 4000)
  })

  const visionBtn = document.createElement('button')
  visionBtn.type = 'button'
  visionBtn.className = 'assessment-preset-chip'
  visionBtn.textContent = '📸 Lihat Layar Sekarang'
  visionBtn.addEventListener('click', () => {
    onCaptureScreen()
  })

  actions.appendChild(focusBtn)
  actions.appendChild(musicBtn)
  actions.appendChild(visionBtn)
  card.appendChild(actions)

  appendCardToChat(chatLog, card)
  return card
}

/**
 * Kartu Pratinjau Screen Vision ("Lihat Layarku") + Kontrol Retake, Batalkan & Kirim ke Hermes AI.
 */
export function renderScreenVisionCard({
  chatLog,
  dataUrl,
  filePath,
  openWindows = [],
  initialQuestion = '',
  label = 'Layar Penuh',
  onRetake = () => {},
  onCancel = () => {},
  onSubmitPrompt = () => {}
}) {
  if (!chatLog) return null

  const card = document.createElement('div')
  card.className = 'avatar assessment-card widget-card vision-card'

  const header = document.createElement('div')
  header.className = 'assessment-card-header'

  const badgeWrap = document.createElement('div')
  badgeWrap.className = 'assessment-badge-group'

  const badge = document.createElement('div')
  badge.className = 'assessment-badge'
  badge.textContent = '📸 SCREEN VISION · LIHAT LAYAR'

  const pill = document.createElement('span')
  pill.className = 'assessment-type-pill'
  pill.textContent = label || 'Tertangkap'

  badgeWrap.appendChild(badge)
  badgeWrap.appendChild(pill)

  // Tombol ✕ untuk membatalkan dan menghapus kartu dari chat
  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.className = 'assessment-close-card-btn'
  closeBtn.title = 'Batalkan & Hapus Tangkapan Layar Ini'
  closeBtn.innerHTML = '✕'
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    card.classList.add('removing')
    setTimeout(() => {
      card.remove()
      onCancel?.()
    }, 120)
  })

  header.appendChild(badgeWrap)
  header.appendChild(closeBtn)
  card.appendChild(header)

  if (dataUrl) {
    const imgWrap = document.createElement('div')
    imgWrap.className = 'vision-thumb-wrap'
    const img = document.createElement('img')
    img.src = dataUrl
    img.alt = 'Pratinjau Tangkapan Layar'
    img.className = 'vision-thumb-img'
    imgWrap.appendChild(img)
    card.appendChild(imgWrap)
  }

  if (openWindows.length > 0) {
    const winMeta = document.createElement('div')
    winMeta.className = 'widget-meta-line'
    winMeta.textContent = `Jendela aktif: ${openWindows.slice(0, 4).join(' · ')}`
    card.appendChild(winMeta)
  }

  const qInput = document.createElement('input')
  qInput.type = 'text'
  qInput.className = 'widget-text-input'
  qInput.placeholder = 'Apa yang ingin ditanyakan tentang layar ini?'
  qInput.value = initialQuestion || 'Tolong analisis tangkapan layar saya dan bantu jelaskan atau periksa jika ada error.'
  card.appendChild(qInput)

  const presets = document.createElement('div')
  presets.className = 'assessment-quick-presets'
  const quickQuestions = [
    { label: '🐞 Cek Error', text: 'Periksa error atau masalah yang terlihat pada tangkapan layar ini dan beri solusinya.' },
    { label: '📝 Jelaskan Layar', text: 'Jelaskan isi dan konteks dari tangkapan layar ini secara ringkas dalam Bahasa Indonesia.' },
    { label: '🌐 Terjemahkan', text: 'Terjemahkan seluruh teks penting yang ada pada tangkapan layar ini ke Bahasa Indonesia.' }
  ]
  for (const item of quickQuestions) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'assessment-preset-chip'
    btn.textContent = item.label
    btn.addEventListener('click', () => {
      qInput.value = item.text
    })
    presets.appendChild(btn)
  }
  card.appendChild(presets)

  const footer = document.createElement('div')
  footer.className = 'assessment-footer'

  const actionRow = document.createElement('div')
  actionRow.className = 'assessment-action-row'

  const sendBtn = document.createElement('button')
  sendBtn.type = 'button'
  sendBtn.className = 'assessment-execute-btn'
  sendBtn.textContent = '🚀 Analisis dengan Hermes AI'

  const retakeBtn = document.createElement('button')
  retakeBtn.type = 'button'
  retakeBtn.className = 'assessment-retake-btn'
  retakeBtn.title = 'Ulangi tangkapan layar jika pilihan/posisi salah'
  retakeBtn.textContent = '🔄 Tangkap Ulang'

  const discardBtn = document.createElement('button')
  discardBtn.type = 'button'
  discardBtn.className = 'assessment-discard-btn'
  discardBtn.title = 'Batalkan & Hapus Kartu Ini'
  discardBtn.textContent = '🗑️ Batalkan'

  actionRow.appendChild(sendBtn)
  actionRow.appendChild(retakeBtn)
  actionRow.appendChild(discardBtn)
  footer.appendChild(actionRow)

  const statusSpan = document.createElement('span')
  statusSpan.className = 'assessment-status-text'
  statusSpan.textContent = filePath ? 'Snapshot siap dianalisis' : ''
  footer.appendChild(statusSpan)

  card.appendChild(footer)

  sendBtn.addEventListener('click', () => {
    const question = qInput.value.trim() || 'Tolong analisis tangkapan layar saya.'
    sendBtn.disabled = true
    retakeBtn.disabled = true
    discardBtn.disabled = true
    closeBtn.disabled = true
    pill.textContent = 'Dikirim'
    statusSpan.textContent = 'Mengirim ke Hermes...'
    onSubmitPrompt({ filePath, openWindows, question })
  })

  retakeBtn.addEventListener('click', () => {
    card.classList.add('removing')
    setTimeout(() => {
      card.remove()
      onRetake?.()
    }, 120)
  })

  discardBtn.addEventListener('click', () => {
    card.classList.add('removing')
    setTimeout(() => {
      card.remove()
      onCancel?.()
    }, 120)
  })

  appendCardToChat(chatLog, card)
  return card
}

/**
 * Kartu Aksi Cepat untuk File yang di-Drag & Drop langsung ke tubuh Avatar.
 */
export function renderDroppedFileCard({
  chatLog,
  files = [],
  onAnalyzeFile = () => {}
}) {
  if (!chatLog || !files.length) return null

  const card = document.createElement('div')
  card.className = 'avatar assessment-card widget-card'

  const header = document.createElement('div')
  header.className = 'assessment-card-header'
  const badge = document.createElement('div')
  badge.className = 'assessment-badge'
  badge.textContent = '📂 FILE DITERIMA AVATAR'
  const pill = document.createElement('span')
  pill.className = 'assessment-type-pill'
  pill.textContent = `${files.length} Berkas`
  header.appendChild(badge)
  header.appendChild(pill)
  card.appendChild(header)

  const namesList = document.createElement('div')
  namesList.className = 'widget-meta-line'
  namesList.textContent = files.map((f) => f.name || f.path).join(', ')
  card.appendChild(namesList)

  const promptEl = document.createElement('div')
  promptEl.className = 'assessment-prompt-text'
  promptEl.textContent = 'Mau diapakan file ini? Pilih salah satu aksi cepat di bawah:'
  card.appendChild(promptEl)

  const actions = document.createElement('div')
  actions.className = 'assessment-quick-presets'
  const modes = [
    { label: '📄 Rangkum Dokumen', instruction: 'Baca file berikut dan buatkan ringkasan yang jelas, terstruktur, dan mudah dipahami dalam Bahasa Indonesia.' },
    { label: '🔍 Cari Poin Penting', instruction: 'Ekstrak seluruh poin kunci, angka penting, dan kesimpulan utama dari file berikut.' },
    { label: '🇮🇩 Terjemahkan', instruction: 'Baca isi file berikut lalu terjemahkan ke Bahasa Indonesia yang natural dan akurat.' }
  ]
  for (const m of modes) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'assessment-preset-chip active-chip'
    b.textContent = m.label
    b.addEventListener('click', () => {
      pill.textContent = 'Diproses'
      actions.querySelectorAll('button').forEach((btn) => { btn.disabled = true })
      onAnalyzeFile({ files, instruction: m.instruction, label: m.label })
    })
    actions.appendChild(b)
  }
  card.appendChild(actions)

  appendCardToChat(chatLog, card)
  return card
}
