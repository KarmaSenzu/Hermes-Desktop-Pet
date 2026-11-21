/**
 * pomodoro-timer.js — Pomodoro & Focus Timer (ala YourMother)
 */

export function formatTimer(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Menghitung apakah sisa waktu sudah mencapai tepat salah satu milestone 20% (20%, 40%, 60%, 80%).
 * Mengembalikan info milestone agar avatar bisa menampilkan bubble pengingat berkala.
 */
export function getTimerMilestoneStep(totalSeconds, remainingSeconds) {
  const total = Math.floor(Number(totalSeconds) || 0)
  const rem = Math.floor(Number(remainingSeconds) || 0)
  if (total < 5 || rem <= 0 || rem >= total) return null

  const elapsed = total - rem
  for (let step = 1; step <= 4; step++) {
    const targetElapsed = Math.round((total * step) / 5)
    if (elapsed === targetElapsed) {
      return {
        step,
        elapsedPercent: step * 20,
        remainingPercent: 100 - step * 20,
        elapsedSeconds: elapsed,
        remainingSeconds: rem
      }
    }
  }
  return null
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
  const triggeredMilestones = new Set()
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

    // Sesi dianggap "belum dimulai" hanya jika sisa == total (atau sudah habis).
    const isPausedSession = !isTimerRunning && timerRemainingSeconds > 0 && timerRemainingSeconds < timerTotalSeconds

    if (isTimerRunning && !stopTimer) {
      // Masih berjalan → tetap jalan di latar belakang.
      showSpeechBubble(
        `⏱️ Timer tetap berjalan di latar belakang (Sisa ${formatTimer(timerRemainingSeconds)}). Aku akan mengingatkan tiap 20% waktu berjalan!`,
        4500
      )
    } else if (isPausedSession && !stopTimer) {
      // Dijeda → pertahankan sisa waktu & milestone, jangan reset.
      if (timerStartBtn) {
        timerStartBtn.textContent = '▶ Lanjutkan'
        timerStartBtn.classList.remove('running')
      }
      if (timerStatusText) timerStatusText.textContent = 'Sesi fokus dijeda'
      showSpeechBubble(
        `⏸️ Sesi fokus dijeda (Sisa ${formatTimer(timerRemainingSeconds)}). Buka Timer lagi untuk melanjutkan.`,
        4000
      )
    } else {
      // Tidak ada sesi aktif (belum mulai / sudah selesai / stopTimer eksplisit) → reset penuh.
      if (timerInterval) {
        clearInterval(timerInterval)
        timerInterval = null
      }
      isTimerRunning = false
      triggeredMilestones.clear()
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
    triggeredMilestones.clear()
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
      triggeredMilestones.clear()
      const startMsg = timerTask
        ? `Sesi ${timerTask} dimulai! Semangat ya, aku temani di sini 🌸`
        : 'Sesi fokus dimulai! Semangat ya, aku temani di sini 🌸'
      showSpeechBubble(startMsg, 6000)
      speak(startMsg, 'focus')
    }

    timerInterval = setInterval(() => {
      timerRemainingSeconds--
      updateTimerDisplay()

      const milestone = getTimerMilestoneStep(timerTotalSeconds, timerRemainingSeconds)
      if (milestone && !triggeredMilestones.has(milestone.step)) {
        triggeredMilestones.add(milestone.step)
        const taskLabel = timerTask ? ` (${timerTask})` : ''
        showSpeechBubble(
          `⏱️ Timer Fokus${taskLabel}: sudah ${milestone.elapsedPercent}% berjalan — sisa waktu ${formatTimer(timerRemainingSeconds)} (${milestone.remainingPercent}%)! 💪`,
          5500
        )
        if (pet?.model) {
          pet.spawnHeart(pet.model.x, pet.model.y - 120, '⏱️')
        }
      }

      if (timerRemainingSeconds <= 0) {
        clearInterval(timerInterval)
        timerInterval = null
        isTimerRunning = false
        triggeredMilestones.clear()
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
    triggeredMilestones.clear()
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
        closeTimerPanel({ stopTimer: false })
      }
    })
  }

  timerCloseBtn?.addEventListener('click', () => {
    closeTimerPanel({ stopTimer: false })
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
      triggeredMilestones.clear()
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
    triggeredMilestones.clear()
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
    isPaused: () => !isTimerRunning && timerRemainingSeconds > 0 && timerRemainingSeconds < timerTotalSeconds,
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
