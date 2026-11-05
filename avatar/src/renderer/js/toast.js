/**
 * toast.js — Floating Toast Alert ala macOS System Settings
 */

import { escapeHtml } from './utils.js'

export function showToast(title, message = '', type = 'info', icon = null, duration = 3200) {
  const container = document.getElementById('mac-toast-container')
  if (!container) return

  const toast = document.createElement('div')
  toast.className = `mac-toast ${type}`

  let iconText = icon
  if (!iconText) {
    if (type === 'success') iconText = '✅'
    else if (type === 'error') iconText = '❌'
    else if (type === 'running') iconText = '🚀'
    else iconText = 'ℹ️'
  }

  toast.innerHTML = `
    <div class="mac-toast-icon">${iconText}</div>
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
