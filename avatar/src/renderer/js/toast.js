/**
 * toast.js — Floating Toast Alert ala macOS System Settings
 */

import { escapeHtml } from './utils.js'
import { renderIcon } from './icons.js'

const EMOJI_TO_ICON = {
  '✅': 'check-circle',
  '✓': 'check-circle',
  '❌': 'circle-alert',
  '⚠️': 'alert-triangle',
  '⚠': 'alert-triangle',
  '🚀': 'zap',
  '⚡': 'zap',
  'ℹ️': 'info',
  'ℹ': 'info',
  '✨': 'sparkles',
  '🛠️': 'wrench',
  '🛠': 'wrench',
  '🔑': 'shield-check',
  '🔊': 'volume-2',
  '💾': 'check-circle',
  '🧹': 'trash-2',
  '🗑️': 'trash-2',
  '🗑': 'trash-2',
  '📦': 'package',
  '🔔': 'bell'
}

export function showToast(title, message = '', type = 'info', icon = null, duration = 3200) {
  const container = document.getElementById('mac-toast-container')
  if (!container) return

  const toast = document.createElement('div')
  toast.className = `mac-toast ${type}`

  let iconName = 'info'
  if (icon && EMOJI_TO_ICON[icon]) {
    iconName = EMOJI_TO_ICON[icon]
  } else if (icon && /^[a-z0-9-]+$/.test(icon)) {
    iconName = icon
  } else if (type === 'success') {
    iconName = 'check-circle'
  } else if (type === 'error') {
    iconName = 'circle-alert'
  } else if (type === 'warning') {
    iconName = 'alert-triangle'
  } else if (type === 'running') {
    iconName = 'zap'
  }

  toast.innerHTML = `
    <div class="mac-toast-icon">${renderIcon(iconName, { size: 16 })}</div>
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
