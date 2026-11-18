/**
 * pomodoro-timer.js — Pomodoro & Focus Timer (ala YourMother)
 */

export function formatTimer(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function initPomodoroTimer(options = {}) {
  const {
    getLive2dPet = () => null,
    getController = () => null,
    getCompanionHud = () => null,
    showSpeechBubble = () => {},
    speak = () => {},
    onTile = () => {}
  } = options

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

  let timerTotalSeconds = 25 * 60
  let timerRemainingSeconds = 25 * 60
  let timerInterval = null
  let isTimerRunning = false
  let timerTask = typeof localStorage !== 'undefined' ? localStorage.getItem('hermes-timer-task') || '' : ''

  if (timerTaskInput && timerTask) {
    timerTaskInput.value = timerTask
  }

  timerTaskInput?.addEventListener('input', (e) => {
    timerTask = e.target.value.trim()
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('hermes-timer-task', timerTask)
    }
  })

  function updateTimerDisplay() {
    if (timerTimeDisplay) {
      timerTimeDisplay.textContent = formatTimer(timerRemainingSeconds)
    }
  }

  function updateTimerPanelPosition() {
    onTile()
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

      const autoOutfit = timerOutfitToggle ? timerOutfitToggle.checked : true
      if (autoOutfit) {
        getLive2dPet()?.setTimerFocusMode?.(false)
      }
    }

    onTile()
  }

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
    const total = Math.max(5, m * 60 + s)
    timerTotalSeconds = total
    timerRemainingSeconds = total
    updateTimerDisplay()
    closeCustomTimeBox()

    timerPresets.forEach((b) => b.classList.remove('active'))
    if (timerPresetCustomBtn) timerPresetCustomBtn.classList.add('active')

    if (timerStatusText) {
      timerStatusText.textContent = `Durasi kustom: ${formatTimer(total)}`
    }

    const autoOutfit = timerOutfitToggle ? timerOutfitToggle.checked : true
    const pet = getLive2dPet()
    if (autoOutfit && !pet?.isTimerFocusActive) {
      pet?.setTimerFocusMode?.(true)
    }
  }

  function startTimer() {
    const pet = getLive2dPet()
    const ctrl = getController()

    if (isTimerRunning) {
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

    isTimerRunning = true
    closeCustomTimeBox()
    if (timerStartBtn) {
      timerStartBtn.textContent = '⏸ Jeda'
      timerStartBtn.classList.add('running')
    }

    const taskName = timerTask || 'Fokus'
    if (timerStatusText) timerStatusText.textContent = `Sesi ${taskName} berlangsung...`

    const autoOutfit = timerOutfitToggle ? timerOutfitToggle.checked : true
    if (autoOutfit) {
      pet?.setTimerFocusMode?.(true)
    }

    if (pet?.model) {
      pet.spawnHeart(pet.model.x, pet.model.y - 120, '⏱️')
    }

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

        ctrl?.playEmote('happy')
        if (pet?.model) {
          pet.spawnHeart(pet.model.x, pet.model.y - 120, '🎉')
        }

        if (autoOutfit) {
          pet?.setTimerFocusMode?.(false)
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

    const autoOutfit = timerOutfitToggle ? timerOutfitToggle.checked : true
    if (autoOutfit && (!timerPanel || timerPanel.hidden)) {
      getLive2dPet()?.setTimerFocusMode?.(false)
    }

    if (timerStartBtn) {
      timerStartBtn.textContent = '▶ Mulai'
      timerStartBtn.classList.remove('running')
    }
    if (timerStatusText) timerStatusText.textContent = 'Siap untuk sesi fokus'
  }

  // Event Listeners
  if (timerToggle && timerPanel) {
    timerToggle.addEventListener('click', (e) => {
      e.stopPropagation()
      const willShow = timerPanel.hidden
      if (willShow) {
        timerPanel.hidden = false
        const hud = getCompanionHud()
        const hudW = hud?.offsetWidth || 64
        const hudH = hud?.offsetHeight || 320
        const hudLeft = parseFloat(hud?.style.left) || (window.innerWidth / 2 - hudW / 2)
        const hudTop = parseFloat(hud?.style.top) || (window.innerHeight - 100)
        updateTimerPanelPosition(hudLeft, hudTop, hudW, hudH)

        const autoOutfit = timerOutfitToggle ? timerOutfitToggle.checked : true
        if (autoOutfit) {
          getLive2dPet()?.setTimerFocusMode?.(true)
        }
      } else {
        closeTimerPanel({ stopTimer: true })
      }
    })
  }

  timerCloseBtn?.addEventListener('click', () => {
    closeTimerPanel({ stopTimer: true })
  })

  timerOutfitToggle?.addEventListener('change', () => {
    const pet = getLive2dPet()
    if (!timerOutfitToggle.checked) {
      pet?.setTimerFocusMode?.(false)
    } else if (!timerPanel?.hidden || isTimerRunning) {
      pet?.setTimerFocusMode?.(true)
    }
  })

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

      const autoOutfit = timerOutfitToggle ? timerOutfitToggle.checked : true
      const pet = getLive2dPet()
      if (autoOutfit && !pet?.isTimerFocusActive) {
        pet?.setTimerFocusMode?.(true)
      }
    })
  })

  timerStartBtn?.addEventListener('click', startTimer)
  timerResetBtn?.addEventListener('click', resetTimer)

  function startFocusWithConfig({ minutes = 25, task = '' } = {}) {
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
    isTimerRunning = false
    closeCustomTimeBox()

    const safeMins = Math.max(1, Math.min(240, Math.round(Number(minutes) || 25)))
    const cleanTask = String(task || '').trim().slice(0, 60)

    if (cleanTask) {
      timerTask = cleanTask
      if (timerTaskInput) timerTaskInput.value = cleanTask
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('hermes-timer-task', cleanTask)
      }
    }

    timerTotalSeconds = safeMins * 60
    timerRemainingSeconds = timerTotalSeconds
    updateTimerDisplay()

    timerPresets.forEach((b) => {
      const btnMin = parseInt(b.dataset?.minutes, 10)
      b.classList.toggle('active', b !== timerPresetCustomBtn && btnMin === safeMins)
    })

    if (timerPanel) {
      timerPanel.hidden = false
      onTile()
    }

    startTimer()
    return {
      minutes: safeMins,
      task: timerTask
    }
  }

  function stopAndResetTimer() {
    resetTimer()
    return { ok: true }
  }

  return {
    getPanel: () => timerPanel,
    isRunning: () => isTimerRunning,
    getTask: () => timerTask,
    getOutfitToggle: () => timerOutfitToggle,
    formatTimer,
    updateTimerDisplay,
    closeTimerPanel,
    openCustomTimeBox,
    closeCustomTimeBox,
    applyCustomTime,
    startTimer,
    resetTimer,
    startFocusWithConfig,
    stopAndResetTimer
  }
}
