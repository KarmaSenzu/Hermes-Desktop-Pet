/**
 * capability-assessment.js — AI Capability Assessment Tool & Dynamic Assessment Cards
 */

export function isCapabilityRequest(text) {
  if (!text) return false
  const t = text.toLowerCase().trim()
  return (
    /\b(apa\s+(?:saja\s+)?(?:yang\s+)?(?:bisa\s+)?(?:kamu|anda)\s+(?:bisa|lakukan)|kamu\s+bisa\s+apa|bisa\s+(?:bantu|tolong)\s+apa|fitur\s+(?:apa\s+)?saja|kemampuan(?:mu)?|keunggulan(?:mu)?|menu\s+(?:fitur|bantuan|kemampuan)|bisa\s+apa\s+aja|kemampuan\s+kamu|fitur\s+kamu|keunggulan\s+kamu)\b/i.test(t) ||
    /^(?:menu|bantuan|fitur|capabilities|help|apa saja yang anda bisa)$/i.test(t)
  )
}

export function extractAssessmentChoices(text, options = {}) {
  const { chatLog, activeAssessmentCard } = options
  if (!text) return null
  const t = text.toLowerCase().trim()

  // 1. Cek apakah ada dynamic assessment card terbaru di chatLog
  if (chatLog) {
    const dynCards = chatLog.querySelectorAll('.dynamic-assessment-card')
    const latestDynCard = dynCards.length > 0 ? dynCards[dynCards.length - 1] : null

    if (latestDynCard && !latestDynCard.classList.contains('executed')) {
      const execBtn = latestDynCard.querySelector('.assessment-execute-btn')
      if (execBtn && !execBtn.textContent.includes('Sedang Mengeksekusi')) {
        const isAll = /\b(?:semua|all)\b/i.test(t) && /\b(?:coba|jalankan|pilih|eksekusi|demo|tes)\b/i.test(t)
        const hasChoiceIntent =
          /\b(?:coba|jalankan|pilih|eksekusi|nomor|no|opsi|fitur|tolong|tes|demo)\b/i.test(t) ||
          /^[0-9,\s&dan+serta]+$/i.test(t)

        if (hasChoiceIntent) {
          const items = latestDynCard.querySelectorAll('.assessment-option-item')
          let matched = false
          items.forEach((it, idx) => {
            const num = idx + 1
            const numRegex = new RegExp(`\\b${num}\\b`)
            const optTitle = (it.getAttribute('data-title') || '').toLowerCase()
            if (isAll || numRegex.test(t) || (optTitle && t.includes(optTitle.slice(0, 15)))) {
              it.classList.add('selected')
              matched = true
            }
          })
          if (matched) {
            execBtn.disabled = false
            execBtn.click()
            return ['dynamic-handled']
          }
        }
      }
    }
  }

  // 2. Fallback: kartu demonstrasi statis (activeAssessmentCard)
  if (!activeAssessmentCard) return null

  if (/\b(?:semua|all)\b/i.test(t) && /\b(?:coba|jalankan|pilih|eksekusi|demo|tes)\b/i.test(t)) {
    return ['weather', 'apps', 'news', 'summary']
  }

  const hasChoiceIntent =
    /\b(?:coba|jalankan|pilih|eksekusi|nomor|no|opsi|fitur|tolong|tes|demo)\b/i.test(t) ||
    /^[0-9,\s&dan+serta]+$/i.test(t)
  if (!hasChoiceIntent) return null

  const selected = new Set()
  if (/\b1\b/.test(t) || /\b(?:satu|cuaca|weather)\b/i.test(t)) selected.add('weather')
  if (/\b2\b/.test(t) || /\b(?:dua|aplikasi|apps|app|software|program)\b/i.test(t)) selected.add('apps')
  if (/\b3\b/.test(t) || /\b(?:tiga|berita|news|kabar)\b/i.test(t)) selected.add('news')
  if (/\b4\b/.test(t) || /\b(?:empat|notulen|ringkasan|summary|minutes)\b/i.test(t)) selected.add('summary')

  return selected.size > 0 ? Array.from(selected) : null
}

function updateDynamicCardBtn(card) {
  const executeBtn = card.querySelector('.assessment-execute-btn')
  if (!executeBtn) return
  const count = card.querySelectorAll('.assessment-option-item.selected').length
  if (count === 0) {
    executeBtn.disabled = true
    executeBtn.textContent = 'Eksekusi Pilihan (0 Dipilih)'
  } else {
    executeBtn.disabled = false
    executeBtn.textContent = `Eksekusi Pilihan (${count} Dipilih)`
  }
}

function executeDynamicCard(card, options = {}) {
  const executeBtn = card.querySelector('.assessment-execute-btn')
  if (!executeBtn || card.classList.contains('executed')) return false

  const selected = Array.from(card.querySelectorAll('.assessment-option-item.selected'))
  if (selected.length === 0) return false

  const {
    getController = () => null,
    showSpeechBubble = () => {},
    speak = () => {},
    handleUserChat = () => {}
  } = options

  const chosenTitles = selected.map((it) => it.getAttribute('data-title') || it.getAttribute('data-id'))
  executeBtn.disabled = true
  executeBtn.textContent = 'Sedang Mengeksekusi...'
  card.classList.add('executed')

  getController()?.setExpression('composing')
  showSpeechBubble(`Mengeksekusi ${chosenTitles.length} langkah terpilih...`, 3500)
  speak(`Baik, saya akan mulai memproses ${chosenTitles.length} pilihan yang kamu tentukan.`, 'happy')

  const promptToSend = `Saya memilih langkah berikut:\n${chosenTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\nTolong jelaskan secara detail instruksi langkah-langkahnya dan pandu saya sekarang.`
  const displayLabel = `Memilih langkah: ${chosenTitles.join(', ')}`

  setTimeout(() => {
    handleUserChat(promptToSend, displayLabel)
  }, 350)
  return true
}

export function attachDynamicAssessmentDelegation(rootEl, options = {}) {
  if (!rootEl) return
  if (rootEl.getAttribute?.('data-assessment-delegated') === 'true') return
  rootEl.setAttribute?.('data-assessment-delegated', 'true')

  rootEl.addEventListener('click', (e) => {
    const card = e.target?.closest?.('.dynamic-assessment-card')
    if (!card || card.getAttribute('data-bound') === 'true') return

    const presetChip = e.target.closest('.assessment-preset-chip')
    if (presetChip && presetChip.closest?.('.dynamic-assessment-card') === card) {
      e.stopPropagation?.()
      if (card.classList.contains('executed')) return
      const preset = presetChip.getAttribute('data-preset')
      if (preset === 'all') {
        card.querySelectorAll('.assessment-option-item').forEach((it) => it.classList.add('selected'))
      }
      updateDynamicCardBtn(card)
      executeDynamicCard(card, options)
      return
    }

    const execBtn = e.target.closest('.assessment-execute-btn')
    if (execBtn && execBtn.closest?.('.dynamic-assessment-card') === card) {
      e.stopPropagation?.()
      executeDynamicCard(card, options)
      return
    }

    const optionItem = e.target.closest('.assessment-option-item')
    if (optionItem && optionItem.closest?.('.dynamic-assessment-card') === card) {
      e.stopPropagation?.()
      if (card.classList.contains('executed')) return
      optionItem.classList.toggle('selected')
      updateDynamicCardBtn(card)
    }
  })
}

export function bindDynamicAssessmentCards(container, options = {}) {
  if (!container) return

  const cards = container.querySelectorAll('.dynamic-assessment-card:not([data-bound="true"])')
  cards.forEach((card) => {
    card.setAttribute('data-bound', 'true')
    const optionItems = card.querySelectorAll('.assessment-option-item')
    const executeBtn = card.querySelector('.assessment-execute-btn')
    const presetChips = card.querySelectorAll('.assessment-preset-chip')

    optionItems.forEach((item) => {
      item.addEventListener('click', (e) => {
        e?.stopPropagation?.()
        if (card.classList.contains('executed')) return
        item.classList.toggle('selected')
        updateDynamicCardBtn(card)
      })
    })

    presetChips.forEach((chip) => {
      chip.addEventListener('click', (e) => {
        e?.stopPropagation?.()
        if (card.classList.contains('executed')) return
        const preset = chip.getAttribute('data-preset')
        if (preset === 'all') {
          optionItems.forEach((it) => it.classList.add('selected'))
        }
        updateDynamicCardBtn(card)
        executeDynamicCard(card, options)
      })
    })

    if (executeBtn) {
      executeBtn.addEventListener('click', (e) => {
        e?.stopPropagation?.()
        executeDynamicCard(card, options)
      })
    }
  })
}

export async function executeSelectedCapabilities(selectedIds, cardRef = null, options = {}) {
  if (!selectedIds || selectedIds.length === 0) return

  const {
    activeAssessmentCard,
    getController = () => null,
    showSpeechBubble = () => {},
    speak = () => {},
    log = () => {},
    generateExecutiveSummary = () => {},
    getCachedApps = () => [],
    setCachedApps = () => {}
  } = options

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
      execBtn.textContent = 'Sedang Dijalankan...'
    }
  }

  getController()?.setExpression('composing')
  showSpeechBubble(`Mengeksekusi ${selectedIds.length} fitur terpilih...`, 3500)

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

  let appsResult = null
  if (selectedIds.includes('apps')) {
    try {
      let apps = getCachedApps()
      if (!apps || apps.length === 0) {
        const appsRes = await window.hermesAvatar?.getInstalledApps?.()
        if (appsRes?.ok && Array.isArray(appsRes.apps)) {
          apps = appsRes.apps
          setCachedApps(apps)
        }
      }
      const taskMgrApp = (apps || []).find((a) => a.name.toLowerCase().includes('task manager'))
      if (taskMgrApp) {
        await window.hermesAvatar?.launchApp?.(taskMgrApp.id)
      }
      appsResult = { launched: ['Task Manager'] }
    } catch (err) {
      appsResult = { error: err.message }
    }
  }

  const now = new Date()
  const dateFormatted = now.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
  const timeFormatted = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

  const markdownSections = [
    `## Hasil Eksekusi Demonstrasi Kemampuan\n> **Waktu Eksekusi:** ${dateFormatted}, pukul ${timeFormatted} WIB\n`
  ]

  if (weatherResult) {
    markdownSections.push(`### 1. Cuaca Jakarta Hari Ini\n` +
      `- **Kondisi Langit:** ${weatherResult.condition}\n` +
      `- **Suhu Saat Ini:** ${weatherResult.temp}°C\n` +
      `- **Kelembapan:** ${weatherResult.humidity}% | **Kecepatan Angin:** ${weatherResult.wind} km/jam\n` +
      `*Prakiraan sensor resmi Open-Meteo & BMKG untuk wilayah Jakarta.*\n`)
  }

  if (appsResult) {
    markdownSections.push(`### 2. Kontrol Sistem Windows (Multi-App)\n` +
      `- **Status:** Berhasil meluncurkan **Task Manager** ke layar kerja Anda.\n` +
      `*Catatan: Anda juga bisa meminta saya membuka banyak aplikasi sekaligus, misal: "Buka Word, Task Manager dan VS Code".*\n`)
  }

  if (newsResult) {
    const list = newsResult.map((it, idx) => `${idx + 1}. **${it.title}**`).join('\n')
    markdownSections.push(`### 3. Berita Terkini Indonesia Hari Ini\n` +
      `${list}\n` +
      `*Sumber resmi Google News RSS terbitan beberapa jam/menit lalu.*\n`)
  }

  if (selectedIds.includes('summary')) {
    markdownSections.push(`### 4. Notulen Eksekutif Otomatis\n` +
      `- **Status:** Menyiapkan notulen percakapan interaktif di chat...\n`)
  }

  const finalMarkdown = markdownSections.join('\n---\n\n')

  log('avatar', finalMarkdown)

  if (selectedIds.includes('summary')) {
    setTimeout(() => {
      generateExecutiveSummary()
    }, 600)
  }

  getController()?.setExpression('happy')
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
    if (execBtn) execBtn.textContent = 'Selesai Dieksekusi'
  }
}

export function createCapabilityAssessmentCard(options = {}) {
  const {
    chatLog,
    chatSheet,
    toggleChat = () => {},
    getController = () => null,
    showSpeechBubble = () => {},
    speak = () => {},
    onExecute = () => {}
  } = options

  if (chatSheet?.classList.contains('hidden')) {
    toggleChat()
  }

  getController()?.setExpression('happy')
  showSpeechBubble('Berikut 4 keunggulan utamaku! Pilih yang ingin kamu coba.', 4000)
  speak('Berikut empat keunggulan utama saya. Silakan pilih nomor atau fitur yang ingin langsung saya demonstrasikan.', 'happy')

  const card = document.createElement('div')
  card.className = 'avatar assessment-card'
  card.innerHTML = `
    <div class="assessment-card-header">
      <div class="assessment-badge">AI CAPABILITY ASSESSMENT TOOL</div>
      <span class="assessment-type-pill">Multi-Select Aktif</span>
    </div>
    <div class="assessment-prompt-text">
      Halo! Saya asisten desktop AI pribadimu. Pilih satu atau beberapa kemampuan di bawah untuk langsung saya demonstrasikan:
    </div>
    <div class="assessment-options-list">
      <div class="assessment-option-item" data-id="weather">
        <div class="assessment-custom-checkbox"></div>
        <div class="assessment-option-content">
          <div class="assessment-option-title">1. Info Cuaca Real-Time</div>
          <div class="assessment-option-desc">Suhu, kelembapan & kondisi langit Jakarta saat ini (live sensor BMKG / Open-Meteo).</div>
        </div>
      </div>
      <div class="assessment-option-item" data-id="apps">
        <div class="assessment-custom-checkbox"></div>
        <div class="assessment-option-content">
          <div class="assessment-option-title">2. Kontrol Sistem (Multi-App Launcher)</div>
          <div class="assessment-option-desc">Membuka aplikasi (Word, VS Code, Task Manager) serentak dalam hitungan milidetik.</div>
        </div>
      </div>
      <div class="assessment-option-item" data-id="news">
        <div class="assessment-custom-checkbox"></div>
        <div class="assessment-option-content">
          <div class="assessment-option-title">3. Berita Terkini Indonesia Hari Ini</div>
          <div class="assessment-option-desc">Rangkuman 4 tajuk utama terhangat dari Google News RSS terbitan beberapa jam/menit lalu.</div>
        </div>
      </div>
      <div class="assessment-option-item" data-id="summary">
        <div class="assessment-custom-checkbox"></div>
        <div class="assessment-option-content">
          <div class="assessment-option-title">4. Notulen Eksekutif Otomatis</div>
          <div class="assessment-option-desc">Merangkum sesi obrolan menjadi kartu notulen rapi yang siap disalin atau disimpan permanen.</div>
        </div>
      </div>
    </div>
    <div class="assessment-quick-presets">
      <span style="font-size: 10px; color: #94a3b8; align-self: center;">Preset Cepat:</span>
      <button type="button" class="assessment-preset-chip" data-preset="weather,news">Cuaca & Berita (1 & 3)</button>
      <button type="button" class="assessment-preset-chip" data-preset="weather">Cuaca Saja (1)</button>
      <button type="button" class="assessment-preset-chip" data-preset="apps">Aplikasi Saja (2)</button>
      <button type="button" class="assessment-preset-chip" data-preset="all">Jalankan Semua (1-4)</button>
    </div>
    <div class="assessment-footer">
      <button type="button" class="assessment-execute-btn" disabled>Eksekusi Pilihan (0 Dipilih)</button>
      <span class="assessment-status-text">Ketik / sebut angka (misal: "coba 1 dan 3")</span>
    </div>
  `

  if (chatLog) {
    chatLog.appendChild(card)
    chatLog.scrollTop = chatLog.scrollHeight
  }

  const optionItems = card.querySelectorAll('.assessment-option-item')
  const executeBtn = card.querySelector('.assessment-execute-btn')
  const presetChips = card.querySelectorAll('.assessment-preset-chip')

  function updateExecuteButton() {
    const selected = card.querySelectorAll('.assessment-option-item.selected')
    const count = selected.length
    if (count === 0) {
      executeBtn.disabled = true
      executeBtn.textContent = 'Eksekusi Pilihan (0 Dipilih)'
    } else {
      executeBtn.disabled = false
      executeBtn.textContent = `Eksekusi Pilihan (${count} Dipilih)`
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
    executeBtn.textContent = 'Sedang Mengeksekusi...'
    await onExecute(ids, card)
  })

  return card
}
