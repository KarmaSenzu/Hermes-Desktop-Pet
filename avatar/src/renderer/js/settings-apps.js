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
      showToast('Izin Sistem Diperbarui', `${def?.label || cb.dataset.action}: ${cb.checked ? 'Diizinkan' : 'Dinonaktifkan'}`, 'info', '🛡️')
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
      <div class="format-status-col" style="gap:6px;">
        <button type="button" class="mini-btn secondary app-launch" data-id="${escapeHtml(a.id)}" data-name="${escapeHtml(a.name)}" title="Uji buka aplikasi"><span class="btn-svg-icon">${renderIcon('play', { size: 12 })}</span> Buka</button>
        <button type="button" class="mini-btn del app-del" data-id="${escapeHtml(a.id)}" title="Hapus aplikasi"><span class="btn-svg-icon">${renderIcon('trash-2', { size: 12 })}</span> Hapus</button>
      </div>
    </div>`
  }).join('')

  appList.querySelectorAll('.app-launch').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id
      const name = btn.dataset.name || 'Aplikasi'
      btn.disabled = true
      const origHtml = btn.innerHTML
      btn.textContent = 'Membuka…'
      try {
        const res = await window.hermesAvatar?.launchApp?.(id, name)
        if (res?.ok) {
          showToast('Aplikasi Dibuka', `${name} berhasil dijalankan.`, 'success', '🚀', 3000)
          if (statusEl) statusEl.textContent = `Membuka ${name}...`
        } else {
          showToast('Gagal Membuka Aplikasi', res?.error || 'Aplikasi tidak ditemukan', 'error', '❌', 5000)
          if (statusEl) statusEl.textContent = `Gagal membuka ${name}: ${res?.error || 'Error'}`
        }
      } catch (err) {
        showToast('Gagal Membuka Aplikasi', err?.message || String(err), 'error', '❌', 5000)
      } finally {
        btn.disabled = false
        btn.innerHTML = origHtml
      }
    })
  })

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
  let pendingAppId = ''

  renderActions({ actionList, settings, saveSettings, statusEl })
  renderAppList({ appList, settings, saveSettings, statusEl, showConfirm })

  // Perbaiki ID acak lama pada settings.actionApps menggunakan registry resmi SHA-256 dari main process
  ;(async () => {
    try {
      const list = settings.actionApps || []
      const hasStaleId = list.some((a) => !/^[0-9a-f]{16}$/i.test(String(a?.id || '')))
      if (!hasStaleId || !window.hermesAvatar?.getInstalledApps) return
      const res = await window.hermesAvatar.getInstalledApps()
      if (!res?.ok || !Array.isArray(res.apps)) return
      const byName = new Map(res.apps.map((r) => [String(r.name || '').toLowerCase(), r.id]))
      let repaired = false
      for (const a of list) {
        if (!/^[0-9a-f]{16}$/i.test(String(a?.id || ''))) {
          const realId = byName.get(String(a?.name || '').toLowerCase())
          if (realId) {
            a.id = realId
            repaired = true
          }
        }
      }
      if (repaired) {
        saveSettings(settings)
        renderAppList({ appList, settings, saveSettings, statusEl, showConfirm })
      }
    } catch { /* ignore */ }
  })()

  appPickBtn?.addEventListener('click', async () => {
    try {
      const picked = await window.hermesAvatar.pickApp()
      if (!picked) return
      if (typeof picked === 'object' && picked.id) {
        pendingAppId = picked.id
        if (appName) appName.value = picked.name || appName.value || ''
        if (appCommand) appCommand.value = picked.id
        const iconRes = await window.hermesAvatar.getAppIcon(picked.id)
        pendingAppIcon = iconRes?.ok ? iconRes.dataUrl : ''
      } else if (typeof picked === 'string') {
        if (appCommand) appCommand.value = picked
        const base = picked.split(/[/\\]/).pop().replace(/\.(app|exe|desktop|lnk)$/i, '')
        if (appName && !appName.value) appName.value = base
        const iconRes = await window.hermesAvatar.getAppIcon(picked)
        pendingAppIcon = iconRes?.ok ? iconRes.dataUrl : ''
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = `Gagal pilih aplikasi: ${err?.message || err}`
    }
  })

  appScanBtn?.addEventListener('click', async () => {
    try {
      appScanBtn.disabled = true
      appScanBtn.textContent = 'Memindai Windows…'
      if (statusEl) statusEl.textContent = 'Memindai semua shortcut aplikasi Windows...'
      showToast('Memindai Aplikasi Windows…', 'Mendeteksi executable di Start Menu & Desktop', 'running', '🔍')
      const res = await window.hermesAvatar.scanInstalledApps()
      if (res?.ok && Array.isArray(res.apps)) {
        settings.actionApps = settings.actionApps || []
        const byName = new Map(settings.actionApps.map((a) => [String(a.name || '').toLowerCase(), a]))
        let added = 0
        let updated = 0
        for (const item of res.apps) {
          const key = String(item.name || '').toLowerCase()
          if (!key) continue
          const realId = item.id || ''
          const existing = byName.get(key)
          if (existing) {
            if (realId && existing.id !== realId) {
              existing.id = realId
              updated++
            }
            if (item.command && !existing.command) existing.command = item.command
          } else {
            const entry = {
              id: realId || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
              name: item.name,
              command: item.command || '',
              icon: ''
            }
            settings.actionApps.push(entry)
            byName.set(key, entry)
            added++
          }
        }
        saveSettings(settings)
        renderAppList({ appList, settings, saveSettings, statusEl, showConfirm })
        const detail = updated > 0
          ? `${added} aplikasi baru ditambahkan, ${updated} ID disinkronkan (${res.apps.length} total terdeteksi).`
          : `${added} aplikasi baru ditambahkan (${res.apps.length} total terdeteksi).`
        if (statusEl) statusEl.textContent = `Berhasil memindai: ${detail}`
        showToast('Pemindaian Selesai', detail, 'success', '⚡')
      } else {
        if (statusEl) statusEl.textContent = `Gagal memindai: ${res?.error || 'Tidak ada aplikasi ditemukan'}`
        showToast('Pemindaian Gagal', res?.error || 'Aplikasi tidak terdeteksi', 'error', '⚠️')
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = `Error pemindaian: ${err?.message || err}`
      showToast('Error Pemindaian', err?.message || err, 'error', '❌')
    } finally {
      appScanBtn.disabled = false
      appScanBtn.innerHTML = `<span class="btn-svg-icon">${renderIcon('search', { size: 13 })}</span> Pindai Otomatis (Scan Windows)`
    }
  })

  appAddBtn?.addEventListener('click', () => {
    const name = (appName?.value || '').trim()
    if (!name) {
      if (statusEl) statusEl.textContent = 'Isi nama aplikasi.'
      showToast('Nama Aplikasi Kosong', 'Harap isi nama aplikasi yang ingin ditambahkan', 'error', '⚠️')
      return
    }
    settings.actionApps = settings.actionApps || []
    settings.actionApps.push({
      id: pendingAppId || Date.now().toString(36),
      name,
      command: (appCommand?.value || '').trim(),
      icon: pendingAppIcon || ''
    })
    saveSettings(settings)
    renderAppList({ appList, settings, saveSettings, statusEl, showConfirm })
    showToast('Aplikasi Ditambahkan', `Aplikasi "${name}" siap dipanggil via perintah suara/chat`, 'success', '⚡')
    if (appName) appName.value = ''
    if (appCommand) appCommand.value = ''
    pendingAppIcon = ''
    pendingAppId = ''
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
