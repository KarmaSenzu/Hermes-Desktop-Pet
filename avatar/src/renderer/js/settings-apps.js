/**
 * settings-apps.js — Panel konfigurasi izin aksi sistem dan daftar aplikasi terdaftar (CRUD)
 */

import { escapeHtml } from './utils.js'
import { showToast } from './toast.js'
import { renderIcon } from './icons.js'

export const ACTION_DEFS = [
  { id: 'open_app', icon: 'play', theme: 'blue', label: 'Buka Aplikasi', desc: 'Buka / jalankan executable lokal (Spotify, VS Code, Browser)' },
  { id: 'open_website', icon: 'globe', theme: 'emerald', label: 'Buka Website & URL', desc: 'Akses link website atau lakukan pencarian di web browser' },
  { id: 'browser_control', icon: 'monitor', theme: 'purple', label: 'Kontrol Browser Otomatis', desc: 'Kelola tab aktif, navigasi URL, dan interaksi halaman' },
  { id: 'system_monitor', icon: 'activity', theme: 'amber', label: 'Monitor Aktivitas Sistem', desc: 'Pantau penggunaan CPU, memori, dan status proses berjalan' },
  { id: 'file_access', icon: 'folder', theme: 'indigo', label: 'Akses File & Folder', desc: 'Membaca dan menulis file lokal avatar di disk pengguna' },
  { id: 'terminal', icon: 'terminal', theme: 'rose', label: 'Terminal & Shell Command', desc: 'Jalankan perintah baris shell (dilindungi dialog konfirmasi)' }
]

export function renderActions({ actionList, settings, saveSettings, statusEl }) {
  if (!actionList) return
  const actions = settings.actions || {}
  actionList.innerHTML = ACTION_DEFS.map((a) => {
    const checked = actions[a.id] ? 'checked' : ''
    return `<div class="settings-row" style="padding: 10px 16px;">
      <div class="format-emblem theme-${a.theme}">
        ${renderIcon(a.icon, { size: 18 })}
      </div>
      <div class="format-info-col">
        <div class="format-title-line">
          <span class="format-title">${escapeHtml(a.label)}</span>
        </div>
        <p class="format-desc-text">${escapeHtml(a.desc)}</p>
      </div>
      <div class="row-control">
        <input type="checkbox" class="mac-switch" data-action="${a.id}" ${checked} />
      </div>
    </div>`
  }).join('')

  actionList.querySelectorAll('.mac-switch').forEach((cb) => {
    cb.addEventListener('change', () => {
      settings.actions = settings.actions || {}
      settings.actions[cb.dataset.action] = cb.checked
      saveSettings(settings)
      if (statusEl) statusEl.textContent = 'Preferensi aksi disimpan.'
      const def = ACTION_DEFS.find((x) => x.id === cb.dataset.action)
      showToast('Izin Sistem Diperbarui 🛡️', `${def?.label || cb.dataset.action}: ${cb.checked ? 'Diizinkan' : 'Dinonaktifkan'}`, 'info', '🛡️')
    })
  })
}

export function renderAppList({ appList, settings, saveSettings, statusEl, showConfirm }) {
  if (!appList) return
  const apps = settings.actionApps || []
  if (apps.length === 0) {
    appList.innerHTML = '<p class="hint" style="padding:16px;">Belum ada aplikasi yang terdaftar.</p>'
    return
  }
  appList.innerHTML = apps.map((a) => {
    const iconHtml = a.icon
      ? `<img class="app-icon" src="${a.icon}" alt="" />`
      : renderIcon('play', { size: 17 })
    return `<div class="format-item app-row" data-id="${escapeHtml(a.id)}">
      <div class="format-emblem theme-blue">
        ${iconHtml}
      </div>
      <div class="format-info-col">
        <div class="format-title-line">
          <span class="format-title">${escapeHtml(a.name)}</span>
        </div>
        <p class="format-desc-text" style="font-family:'SF Mono', monospace; font-size:11px;">${escapeHtml(a.id ? 'ID: ' + a.id : (a.command || 'Aplikasi terdaftar'))}</p>
      </div>
      <div class="format-status-col">
        <button class="mini-btn del app-del" data-id="${escapeHtml(a.id)}" title="Hapus aplikasi">${renderIcon('trash-2', { size: 13 })} Hapus</button>
      </div>
    </div>`
  }).join('')

  appList.querySelectorAll('.app-del').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id
      const a = (settings.actionApps || []).find((x) => x.id === id)
      const ok = typeof showConfirm === 'function' ? await showConfirm(`Hapus aplikasi "${a?.name || ''}"?`, { title: 'Hapus Aplikasi' }) : true
      if (!ok) return
      settings.actionApps = (settings.actionApps || []).filter((x) => x.id !== id)
      saveSettings(settings)
      renderAppList({ appList, settings, saveSettings, statusEl, showConfirm })
      if (statusEl) statusEl.textContent = 'Aplikasi dihapus.'
    })
  })
}

export function initAppsPanel({
  actionList,
  appName,
  appCommand,
  appAddBtn,
  appPickBtn,
  appScanBtn,
  appList,
  settings,
  saveSettings,
  statusEl,
  showConfirm
}) {
  let pendingAppIcon = ''

  renderActions({ actionList, settings, saveSettings, statusEl })
  renderAppList({ appList, settings, saveSettings, statusEl, showConfirm })

  appPickBtn?.addEventListener('click', async () => {
    try {
      const filePath = await window.hermesAvatar.pickApp()
      if (!filePath) return
      if (appCommand) appCommand.value = filePath
      const base = filePath.split(/[/\\]/).pop().replace(/\.(app|exe|desktop|lnk)$/i, '')
      if (appName && !appName.value) appName.value = base
      const iconRes = await window.hermesAvatar.getAppIcon(filePath)
      pendingAppIcon = iconRes.ok ? iconRes.dataUrl : ''
    } catch (err) {
      if (statusEl) statusEl.textContent = `Gagal pilih aplikasi: ${err?.message || err}`
    }
  })

  appScanBtn?.addEventListener('click', async () => {
    try {
      appScanBtn.disabled = true
      appScanBtn.textContent = '⏳ Memindai Windows…'
      if (statusEl) statusEl.textContent = 'Memindai semua shortcut aplikasi Windows...'
      showToast('Memindai Aplikasi Windows... 🔍', 'Mendeteksi executable di Start Menu & Registry', 'running', '🔍')
      const res = await window.hermesAvatar.scanInstalledApps()
      if (res?.ok && Array.isArray(res.apps)) {
        settings.actionApps = settings.actionApps || []
        const existingNames = new Set(settings.actionApps.map((a) => a.name.toLowerCase()))
        let added = 0
        for (const item of res.apps) {
          if (!existingNames.has(item.name.toLowerCase())) {
            existingNames.add(item.name.toLowerCase())
            settings.actionApps.push({
              id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
              name: item.name,
              command: item.command,
              icon: ''
            })
            added++
          }
        }
        saveSettings(settings)
        renderAppList({ appList, settings, saveSettings, statusEl, showConfirm })
        if (statusEl) statusEl.textContent = `✅ Berhasil memindai! ${added} aplikasi baru ditambahkan (${res.apps.length} total terdeteksi).`
        showToast('Pemindaian Selesai! 🎉', `${added} aplikasi baru berhasil didaftarkan`, 'success', '⚡')
      } else {
        if (statusEl) statusEl.textContent = `⚠️ Gagal memindai: ${res?.error || 'Tidak ada aplikasi ditemukan'}`
        showToast('Pemindaian Gagal', res?.error || 'Aplikasi tidak terdeteksi', 'error', '⚠️')
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = `⚠️ Error pemindaian: ${err?.message || err}`
      showToast('Error Pemindaian', err?.message || err, 'error', '❌')
    } finally {
      appScanBtn.disabled = false
      appScanBtn.textContent = '🔍 Pindai Otomatis (Scan Windows)'
    }
  })

  appAddBtn?.addEventListener('click', () => {
    const name = (appName?.value || '').trim()
    if (!name) {
      if (statusEl) statusEl.textContent = '⚠️ Isi nama aplikasi.'
      showToast('Nama Aplikasi Kosong', 'Harap isi nama aplikasi yang ingin ditambahkan', 'error', '⚠️')
      return
    }
    settings.actionApps = settings.actionApps || []
    settings.actionApps.push({
      id: Date.now().toString(36),
      name,
      command: (appCommand?.value || '').trim(),
      icon: pendingAppIcon || ''
    })
    saveSettings(settings)
    renderAppList({ appList, settings, saveSettings, statusEl, showConfirm })
    showToast('Aplikasi Ditambahkan! ✅', `Aplikasi "${name}" siap dipanggil via perintah suara/chat`, 'success', '⚡')
    if (appName) appName.value = ''
    if (appCommand) appCommand.value = ''
    pendingAppIcon = ''
    if (statusEl) statusEl.textContent = 'Aplikasi ditambahkan.'
  })
}

export function adaptPlatformCommands() {
  const isMac = (window.hermesAvatar?.platform === 'darwin') ||
    navigator.userAgent.includes('Macintosh') ||
    (navigator.platform && navigator.platform.toUpperCase().indexOf('MAC') >= 0)
  const isWin = window.hermesAvatar?.platform === 'win32'

  if (isMac || !isWin) {
    document.querySelectorAll('code').forEach((el) => {
      if (el.textContent.includes('py -m pip install')) {
        el.textContent = 'python3 -m pip install kokoro-onnx soundfile --break-system-packages'
      } else if (el.textContent.includes('py scripts/kokoro_server.py')) {
        el.textContent = 'python3 scripts/kokoro_server.py'
      }
    })

    document.querySelectorAll('[data-terminal-cmd]').forEach((btn) => {
      let cmd = btn.getAttribute('data-terminal-cmd')
      if (cmd && cmd.startsWith('py -m pip install')) {
        btn.setAttribute('data-terminal-cmd', 'python3 -m pip install kokoro-onnx soundfile --break-system-packages')
      } else if (cmd && cmd.startsWith('py scripts/')) {
        btn.setAttribute('data-terminal-cmd', 'python3 scripts/kokoro_server.py')
      }
    })

    document.querySelectorAll('[data-copy]').forEach((btn) => {
      let cmd = btn.getAttribute('data-copy')
      if (cmd && cmd.startsWith('py -m pip install')) {
        btn.setAttribute('data-copy', 'python3 -m pip install kokoro-onnx soundfile --break-system-packages')
      } else if (cmd && cmd.startsWith('py scripts/')) {
        btn.setAttribute('data-copy', 'python3 scripts/kokoro_server.py')
      }
    })
  }
}

export function detectPlatform() {
  const isMac = (window.hermesAvatar?.platform === 'darwin') ||
    navigator.userAgent.includes('Macintosh') ||
    (navigator.platform && navigator.platform.toUpperCase().indexOf('MAC') >= 0)
  if (isMac) {
    document.documentElement.classList.add('is-mac')
    document.body.classList.add('is-mac')
  }
}
