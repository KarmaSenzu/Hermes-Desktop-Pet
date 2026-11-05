/**
 * settings-shortcuts.js — Panel konfigurasi pintasan keyboard global (Shortcut)
 */

import { escapeHtml } from './utils.js'
import { showToast } from './toast.js'
import { renderIcon } from './icons.js'

export function formatKeyName(part) {
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

export function renderKeycapsHtml(accel) {
  if (!accel || !accel.trim()) {
    return `<span class="shortcut-keycaps muted" style="font-size:12px; color:var(--text-secondary);">Klik untuk atur</span>`
  }
  const parts = accel.split('+')
  const caps = parts.map((p) => `<kbd class="mac-kbd">${escapeHtml(formatKeyName(p))}</kbd>`)
  return `<span class="shortcut-keycaps">${caps.join('<span class="kbd-joiner">+</span>')}</span>`
}

export function keyEventToAccelerator(e) {
  const key = e.key
  if (['Control', 'Shift', 'Alt', 'Meta', 'Escape'].includes(key)) return null

  const mods = []
  if (e.metaKey || e.ctrlKey) mods.push('CommandOrControl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')

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

export async function renderShortcuts(shortcutList, statusEl) {
  if (!shortcutList) return
  try {
    const list = await window.hermesAvatar.getShortcuts()
    if (!list || list.length === 0) {
      shortcutList.innerHTML = '<p class="hint" style="padding:16px;">Tidak ada shortcut.</p>'
      return
    }
    shortcutList.innerHTML = list
      .map((s) => {
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
      })
      .join('')

    shortcutList.querySelectorAll('.shortcut-card-row').forEach((row) => {
      const trigger = row.querySelector('.shortcut-key-trigger')
      const saveBtn = row.querySelector('.shortcut-save')
      const id = row.dataset.id

      let isRecording = false

      const startRecording = () => {
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
        } else {
          const accel = keyEventToAccelerator(e)
          if (accel) {
            stopRecording(true, accel)
          }
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
          if (statusEl) statusEl.textContent = 'Shortcut disimpan.'
        } catch (err) {
          if (statusEl) statusEl.textContent = `Gagal simpan shortcut: ${err?.message || err}`
          showToast('Gagal Simpan Shortcut', err?.message || err, 'error', '❌')
        } finally {
          saveBtn.disabled = false
          saveBtn.textContent = 'Simpan'
        }
      })
    })

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
