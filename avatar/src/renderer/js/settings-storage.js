/**
 * settings-storage.js — Controller UI panel "Penyimpanan" di Settings.
 * Menampilkan kapasitas terpakai sistem, daftar kategori (ala ChatGPT Storage + macOS),
 * drill-down thumbnail gambar & file, optimasi VACUUM DB, dan pembersihan aman.
 */

import { loadSettings, saveSettings } from './settings-store.js'
import { renderIcon } from './icons.js'
import { escapeHtml } from './utils.js'

let uiDeps = {
  showToast: () => {},
  confirmDialog: async () => true,
  navigateToSection: () => {}
}

let lastSummary = null
let activeDetailCategory = null
let latestScanToken = 0

export function formatBytes(bytes) {
  const num = Number(bytes || 0)
  if (!Number.isFinite(num) || num <= 0) return '0 B'
  if (num < 1024) return `${Math.round(num)} B`
  const kb = num / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1).replace('.', ',') : Math.round(kb)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb < 100 ? mb.toFixed(1).replace('.', ',') : Math.round(mb)} MB`
  const gb = mb / 1024
  return `${gb.toFixed(2).replace('.', ',')} GB`
}

function formatDate(ms) {
  const num = Number(ms || 0)
  if (!num) return ''
  try {
    return new Date(num).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return ''
  }
}

function getCategoryIconName(catId) {
  switch (catId) {
    case 'chat': return 'message-circle'
    case 'images': return 'eye'
    case 'files': return 'folder'
    case 'packages': return 'package'
    case 'cache': return 'trash-2'
    default: return 'hard-drive'
  }
}

function showOverviewView() {
  activeDetailCategory = null
  document.getElementById('storage-detail-view')?.classList.add('hidden')
  document.getElementById('storage-overview-view')?.classList.remove('hidden')
}

function renderSummary(summary) {
  lastSummary = summary
  const settings = loadSettings()
  const softCapMb = Number(settings.storage?.softCapMb || 1024)
  const capBytes = Math.max(128, softCapMb) * 1024 * 1024

  const headlineEl = document.getElementById('storage-used-headline')
  const barEl = document.getElementById('storage-bar')
  const legendEl = document.getElementById('storage-legend')
  const diskMetaEl = document.getElementById('storage-disk-meta')
  const catListEl = document.getElementById('storage-category-list')

  const capLabel = softCapMb >= 1024 ? `${(softCapMb / 1024).toFixed(softCapMb % 1024 === 0 ? 0 : 1).replace('.', ',')} GB` : `${softCapMb} MB`
  const usedBytes = Number(summary?.userDataBytes || 0)
  const ratio = capBytes > 0 ? usedBytes / capBytes : 0

  if (headlineEl) {
    headlineEl.textContent = `${formatBytes(usedBytes)} dari ${capLabel} telah digunakan`
  }

  const cats = Array.isArray(summary?.categories) ? summary.categories : []

  if (barEl) {
    barEl.replaceChildren()
    const totalRatio = Math.min(1, ratio)
    const denom = usedBytes > 0 ? (ratio > 1 ? usedBytes : capBytes) : 1
    for (const c of cats) {
      if (!c.bytes || c.bytes <= 0) continue
      const pct = Math.max(0.8, (c.bytes / denom) * 100)
      const seg = document.createElement('div')
      seg.className = `storage-bar-seg seg-${c.id}`
      seg.style.width = `${Math.min(100, pct).toFixed(2)}%`
      seg.title = `${c.label}: ${formatBytes(c.bytes)}`
      barEl.appendChild(seg)
    }
    barEl.classList.toggle('over-cap', ratio >= 1)
    barEl.dataset.totalPct = String(Math.round(totalRatio * 100))
  }

  if (legendEl) {
    legendEl.replaceChildren()
    for (const c of cats) {
      const item = document.createElement('span')
      item.className = 'storage-legend-item'
      const dot = document.createElement('span')
      dot.className = `storage-dot seg-${c.id}`
      const txt = document.createElement('span')
      txt.textContent = `${c.label} (${formatBytes(c.bytes)})`
      item.appendChild(dot)
      item.appendChild(txt)
      legendEl.appendChild(item)
    }
  }

  if (diskMetaEl) {
    diskMetaEl.classList.remove('warn', 'danger')
    const parts = []
    if (summary?.disk?.freeBytes) {
      parts.push(`Sisa ruang disk lokal: ${formatBytes(summary.disk.freeBytes)} dari ${formatBytes(summary.disk.totalBytes)}`)
    }
    if (ratio >= 1) {
      diskMetaEl.classList.add('danger')
      parts.unshift('⚠️ Melebihi batas pengingat — pertimbangkan membersihkan Cache, Gambar, atau Lampiran lama.')
    } else if (ratio >= 0.85) {
      diskMetaEl.classList.add('warn')
      parts.unshift('Mendekati batas pengingat penyimpanan.')
    } else {
      parts.unshift('Ruang data aman.')
    }
    diskMetaEl.textContent = parts.join(' · ')
  }

  if (catListEl) {
    catListEl.replaceChildren()
    for (const c of cats) {
      const row = document.createElement('button')
      row.type = 'button'
      row.className = 'storage-cat-row'
      row.dataset.categoryId = c.id

      const left = document.createElement('div')
      left.className = 'storage-cat-left'

      const iconWrap = document.createElement('span')
      iconWrap.className = `storage-cat-icon seg-${c.id}`
      iconWrap.innerHTML = renderIcon(getCategoryIconName(c.id), { size: 16 })

      const textWrap = document.createElement('div')
      textWrap.className = 'storage-cat-text'
      const title = document.createElement('div')
      title.className = 'storage-cat-title'
      title.textContent = c.label
      const meta = document.createElement('div')
      meta.className = 'storage-cat-meta'
      const unit = c.id === 'images' ? 'gambar' : (c.id === 'packages' ? 'item/file' : 'file')
      meta.textContent = `${formatBytes(c.bytes)} · ${c.itemCount} ${unit}`
      textWrap.appendChild(title)
      textWrap.appendChild(meta)

      left.appendChild(iconWrap)
      left.appendChild(textWrap)

      const chev = document.createElement('span')
      chev.className = 'storage-cat-chevron'
      chev.innerHTML = renderIcon('chevron-right', { size: 16 })

      row.appendChild(left)
      row.appendChild(chev)
      row.addEventListener('click', () => openCategoryDetail(c.id))
      catListEl.appendChild(row)
    }
  }

  renderEngineCard(summary?.engine || null, { loading: Boolean(summary?.enginePending) })
}

function renderEngineCard(engine, { loading = false, error = '' } = {}) {
  const engineCardEl = document.getElementById('storage-engine-card')
  if (!engineCardEl) return

  const breakdown = Array.isArray(engine?.breakdown) ? engine.breakdown : []
  engineCardEl.replaceChildren()

  const headRow = document.createElement('div')
  headRow.className = 'storage-engine-head'
  const infoLeft = document.createElement('div')
  const hTitle = document.createElement('div')
  hTitle.className = 'storage-cat-title'
  if (loading) {
    hTitle.textContent = 'Engine & Runtime Inti: Menghitung… ⏳'
  } else if (error) {
    hTitle.textContent = 'Engine & Runtime Inti'
  } else {
    hTitle.textContent = `Total Engine Inti: ${formatBytes(engine?.bytes || 0)}`
  }
  const hSub = document.createElement('div')
  hSub.className = 'hint'
  hSub.style.margin = '2px 0 0'
  hSub.textContent = error
    ? `Gagal memindai engine (${error}). Folder tetap dapat dibuka langsung.`
    : (loading
        ? 'Memindai folder hermes-agent, bin, dan lsp di latar belakang…'
        : 'Lingkungan Python & runtime AI inti (dipisah dari data interaksi Anda dan tidak dapat dihapus dari sini).')
  infoLeft.appendChild(hTitle)
  infoLeft.appendChild(hSub)

  const openBtn = document.createElement('button')
  openBtn.type = 'button'
  openBtn.className = 'mini-btn secondary'
  openBtn.textContent = '📂 Buka Folder Hermes'
  openBtn.addEventListener('click', () => {
    window.hermesAvatar?.storageAction?.('open-folder', { categoryId: 'hermes-root' })
  })

  headRow.appendChild(infoLeft)
  headRow.appendChild(openBtn)
  engineCardEl.appendChild(headRow)

  if (breakdown.length > 0) {
    const list = document.createElement('div')
    list.className = 'storage-engine-breakdown'
    for (const b of breakdown) {
      const item = document.createElement('div')
      item.className = 'storage-engine-row'
      const lbl = document.createElement('span')
      lbl.textContent = `${b.name}/ (${b.itemCount.toLocaleString('id-ID')} file)`
      const val = document.createElement('strong')
      val.textContent = formatBytes(b.bytes)
      item.appendChild(lbl)
      item.appendChild(val)
      list.appendChild(item)
    }
    engineCardEl.appendChild(list)
  }
}

export async function refreshStoragePanel(forceRefreshEngine = false) {
  const myToken = ++latestScanToken
  const headlineEl = document.getElementById('storage-used-headline')
  const refreshBtn = document.getElementById('storage-refresh-btn')

  if (typeof window.hermesAvatar?.getStorageSummary !== 'function') {
    if (headlineEl) headlineEl.textContent = 'API Penyimpanan belum termuat. Silakan restart aplikasi.'
    return null
  }

  if (headlineEl && !lastSummary) {
    headlineEl.textContent = 'Memindai penyimpanan lokal…'
  }
  if (refreshBtn) {
    refreshBtn.disabled = true
    refreshBtn.textContent = 'Memindai…'
  }

  try {
    // Fase 1: Pindai cepat 5 kategori data interaksi pengguna (selesai < 100ms, pakai cache engine bila tersedia)
    const res = await window.hermesAvatar.getStorageSummary({
      includeEngine: false,
      forceRefreshEngine
    })
    if (myToken !== latestScanToken) return null

    if (!res?.ok) {
      if (headlineEl) headlineEl.textContent = 'Gagal memindai penyimpanan'
      uiDeps.showToast('Gagal Memindai Penyimpanan', res?.error || 'Terjadi kesalahan', 'error', '❌')
      return null
    }

    renderSummary(res)
    if (activeDetailCategory) {
      await openCategoryDetail(activeDetailCategory, { skipSummaryRefresh: true })
    }

    // Fase 2: Bila cache engine kosong / diminta refresh paksa, hitung ukuran runtime Python di belakang layar
    if (res.enginePending || forceRefreshEngine) {
      renderEngineCard(null, { loading: true })
      window.hermesAvatar
        .getStorageSummary({ engineOnly: true, forceRefreshEngine })
        .then((engRes) => {
          if (myToken !== latestScanToken) return
          if (engRes?.ok && engRes.engine) {
            if (lastSummary) {
              lastSummary.engine = engRes.engine
              lastSummary.engineBytes = Number(engRes.engineBytes || engRes.engine.bytes || 0)
              lastSummary.totalBytes = Number(lastSummary.userDataBytes || 0) + lastSummary.engineBytes
              lastSummary.enginePending = false
            }
            renderEngineCard(engRes.engine)
          } else {
            renderEngineCard(null, { error: engRes?.error || 'Tidak tersedia' })
          }
        })
        .catch((engErr) => {
          if (myToken !== latestScanToken) return
          renderEngineCard(null, { error: engErr?.message || String(engErr) })
        })
    }

    return res
  } catch (err) {
    if (myToken !== latestScanToken) return null
    if (headlineEl) headlineEl.textContent = 'Gagal memindai penyimpanan'
    uiDeps.showToast('Gagal Memindai Penyimpanan', err?.message || String(err), 'error', '❌')
    return null
  } finally {
    if (myToken === latestScanToken && refreshBtn) {
      refreshBtn.disabled = false
      refreshBtn.textContent = 'Segarkan ↻'
    }
  }
}

function makeActionButton(label, cls, onClick) {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = `mini-btn ${cls}`
  btn.textContent = label
  btn.addEventListener('click', onClick)
  return btn
}

async function openCategoryDetail(categoryId, { skipSummaryRefresh = false } = {}) {
  activeDetailCategory = categoryId
  document.getElementById('storage-overview-view')?.classList.add('hidden')
  document.getElementById('storage-detail-view')?.classList.remove('hidden')

  const titleEl = document.getElementById('storage-detail-title')
  const metaEl = document.getElementById('storage-detail-meta')
  const actionsEl = document.getElementById('storage-detail-actions')
  const itemsEl = document.getElementById('storage-detail-items')

  if (itemsEl) {
    itemsEl.innerHTML = '<div class="muted" style="padding:12px;">Memuat rincian file…</div>'
  }

  const res = await window.hermesAvatar?.getStorageSummary?.({ categoryId })
  if (!res?.ok) {
    if (titleEl) titleEl.textContent = 'Gagal memuat rincian'
    if (itemsEl) itemsEl.innerHTML = `<div class="muted" style="padding:12px;">${escapeHtml(res?.error || 'Error')}</div>`
    return
  }

  const items = Array.isArray(res.items) ? res.items : []
  const catSummary = lastSummary?.categories?.find((c) => c.id === categoryId)

  if (titleEl) titleEl.textContent = res.label || categoryId
  if (metaEl) {
    const totalShown = catSummary ? formatBytes(catSummary.bytes) : formatBytes(items.reduce((a, b) => a + (b.size || 0), 0))
    metaEl.textContent = `Lokasi utama: ${res.primaryPath || '-'} · Total: ${totalShown}`
  }

  if (actionsEl) {
    actionsEl.replaceChildren()
    actionsEl.appendChild(
      makeActionButton('📂 Buka Folder', 'secondary', async () => {
        const r = await window.hermesAvatar?.storageAction?.('open-folder', { categoryId })
        if (!r?.ok) uiDeps.showToast('Gagal Membuka Folder', r?.error || 'Error', 'error', '❌')
      })
    )

    if (categoryId === 'chat') {
      actionsEl.appendChild(
        makeActionButton('⚡ Optimalkan Database (VACUUM)', 'primary', async (ev) => {
          const btn = ev.currentTarget
          btn.disabled = true
          btn.textContent = '⏳ Mengoptimalkan...'
          const vRes = await window.hermesAvatar?.storageAction?.('vacuum-db')
          btn.disabled = false
          btn.textContent = '⚡ Optimalkan Database (VACUUM)'
          if (vRes?.ok) {
            uiDeps.showToast(
              'Database Dioptimalkan ✅',
              `Sebelum: ${formatBytes(vRes.beforeBytes)} → Sesudah: ${formatBytes(vRes.afterBytes)} (hemat ${formatBytes(vRes.savedBytes)})`,
              'success',
              '⚡',
              4500
            )
            await refreshStoragePanel(false)
          } else {
            uiDeps.showToast('Optimasi DB Gagal', vRes?.error || 'Database sedang sibuk', 'error', '❌', 5000)
          }
        })
      )
      actionsEl.appendChild(
        makeActionButton('🗂️ Kelola Riwayat Sesi →', 'secondary', () => {
          uiDeps.navigateToSection('brain')
        })
      )
    }

    if (categoryId === 'packages') {
      actionsEl.appendChild(
        makeActionButton('📦 Buka Package Hub →', 'secondary', () => {
          uiDeps.navigateToSection('package')
        })
      )
    }

    if (res.cleanable && items.length > 0) {
      const clearLabel = categoryId === 'cache' ? '🧹 Bersihkan Semua Cache & Log' : '🗑️ Hapus Semua di Kategori Ini'
      actionsEl.appendChild(
        makeActionButton(clearLabel, 'del', async () => {
          const ok = await uiDeps.confirmDialog(
            `Bersihkan ${res.label}?`,
            'Seluruh file yang dapat dihapus di kategori ini akan dihapus permanen. Pengaturan, API key, dan riwayat chat tetap aman.'
          )
          if (!ok) return
          const cRes = await window.hermesAvatar?.storageAction?.('clear-category', { categoryId })
          if (cRes?.ok) {
            uiDeps.showToast(
              'Penyimpanan Dibersihkan 🧹',
              `${cRes.deletedCount} file dihapus · Menghemat ${formatBytes(cRes.freedBytes)}`,
              'success',
              '🧹',
              4000
            )
            await refreshStoragePanel(false)
          } else {
            uiDeps.showToast('Gagal Membersihkan', cRes?.error || 'Error', 'error', '❌')
          }
        })
      )
    }
  }

  if (!itemsEl) return
  itemsEl.replaceChildren()

  if (items.length === 0) {
    itemsEl.innerHTML = '<div class="muted" style="padding:14px;">Belum ada file tersimpan pada kategori ini.</div>'
    return
  }

  if (categoryId === 'images') {
    const grid = document.createElement('div')
    grid.className = 'storage-image-grid'
    for (const item of items) {
      const card = document.createElement('div')
      card.className = 'storage-image-card'

      const thumbBox = document.createElement('div')
      thumbBox.className = 'storage-thumb-wrap'
      if (item.thumbDataUrl) {
        const img = document.createElement('img')
        img.className = 'storage-thumb'
        img.src = item.thumbDataUrl
        img.alt = item.name
        thumbBox.appendChild(img)
      } else {
        const ph = document.createElement('div')
        ph.className = 'storage-thumb-placeholder'
        ph.innerHTML = renderIcon('eye', { size: 24 })
        thumbBox.appendChild(ph)
      }

      const info = document.createElement('div')
      info.className = 'storage-image-info'
      const nm = document.createElement('div')
      nm.className = 'storage-item-name'
      nm.title = item.path
      nm.textContent = item.name
      const sub = document.createElement('div')
      sub.className = 'storage-item-sub'
      sub.textContent = `${formatBytes(item.size)} · ${item.sourceLabel || ''}`
      info.appendChild(nm)
      info.appendChild(sub)

      const rowBtns = document.createElement('div')
      rowBtns.className = 'storage-image-actions'
      rowBtns.appendChild(
        makeActionButton('📂', 'secondary', () => {
          window.hermesAvatar?.storageAction?.('open-folder', { path: item.path })
        })
      )
      if (item.deletable) {
        rowBtns.appendChild(
          makeActionButton('🗑️', 'del', async () => {
            const ok = await uiDeps.confirmDialog('Hapus Gambar?', `Hapus permanen "${item.name}" (${formatBytes(item.size)})?`)
            if (!ok) return
            const dRes = await window.hermesAvatar?.storageAction?.('delete-item', { path: item.path })
            if (dRes?.ok) {
              uiDeps.showToast('Gambar Dihapus', `Menghemat ${formatBytes(dRes.freedBytes)}`, 'info', '🗑️')
              await refreshStoragePanel(false)
            } else {
              uiDeps.showToast('Gagal Hapus', dRes?.error || 'Error', 'error', '❌')
            }
          })
        )
      }

      card.appendChild(thumbBox)
      card.appendChild(info)
      card.appendChild(rowBtns)
      grid.appendChild(card)
    }
    itemsEl.appendChild(grid)
    return
  }

  const listWrap = document.createElement('div')
  listWrap.className = 'storage-item-list'
  for (const item of items) {
    const row = document.createElement('div')
    row.className = 'storage-item-row'

    const left = document.createElement('div')
    left.className = 'storage-item-main'
    const nm = document.createElement('div')
    nm.className = 'storage-item-name'
    nm.title = item.path
    nm.textContent = item.name
    const sub = document.createElement('div')
    sub.className = 'storage-item-sub'
    sub.textContent = [
      formatBytes(item.size),
      item.sourceLabel || '',
      formatDate(item.mtimeMs)
    ].filter(Boolean).join(' · ')
    left.appendChild(nm)
    left.appendChild(sub)

    const right = document.createElement('div')
    right.className = 'storage-item-btns'
    right.appendChild(
      makeActionButton('📂', 'secondary', () => {
        window.hermesAvatar?.storageAction?.('open-folder', { path: item.path })
      })
    )
    if (item.deletable) {
      right.appendChild(
        makeActionButton('🗑️', 'del', async () => {
          const ok = await uiDeps.confirmDialog('Hapus File?', `Hapus permanen "${item.name}" (${formatBytes(item.size)})?`)
          if (!ok) return
          const dRes = await window.hermesAvatar?.storageAction?.('delete-item', { path: item.path })
          if (dRes?.ok) {
            uiDeps.showToast('File Dihapus', `Menghemat ${formatBytes(dRes.freedBytes)}`, 'info', '🗑️')
            await refreshStoragePanel(false)
          } else {
            uiDeps.showToast('Gagal Hapus', dRes?.error || 'Error', 'error', '❌')
          }
        })
      )
    }

    row.appendChild(left)
    row.appendChild(right)
    listWrap.appendChild(row)
  }
  itemsEl.appendChild(listWrap)

  if (!skipSummaryRefresh && !lastSummary) {
    refreshStoragePanel(false)
  }
}

export function initStoragePanel({ showToast, confirmDialog, navigateToSection } = {}) {
  if (typeof showToast === 'function') uiDeps.showToast = showToast
  if (typeof confirmDialog === 'function') uiDeps.confirmDialog = confirmDialog
  if (typeof navigateToSection === 'function') uiDeps.navigateToSection = navigateToSection

  const softCapSelect = document.getElementById('storage-soft-cap-select')
  const archiveToggle = document.getElementById('storage-archive-uploads-toggle')
  const settings = loadSettings()

  if (softCapSelect) {
    softCapSelect.value = String(settings.storage?.softCapMb || 1024)
    softCapSelect.addEventListener('change', () => {
      const cur = loadSettings()
      cur.storage = { ...(cur.storage || {}), softCapMb: Number(softCapSelect.value) || 1024 }
      saveSettings(cur)
      if (lastSummary) renderSummary(lastSummary)
    })
  }

  if (archiveToggle) {
    archiveToggle.checked = settings.storage?.archiveUploads !== false
    archiveToggle.addEventListener('change', () => {
      const cur = loadSettings()
      cur.storage = { ...(cur.storage || {}), archiveUploads: Boolean(archiveToggle.checked) }
      saveSettings(cur)
      uiDeps.showToast(
        'Pengaturan Disimpan',
        archiveToggle.checked
          ? 'Screenshot & file drop akan diarsipkan otomatis ke folder Hermes.'
          : 'Pengarsipan otomatis screenshot & file drop dimatikan.',
        'info',
        '💾'
      )
    })
  }

  document.getElementById('storage-refresh-btn')?.addEventListener('click', () => {
    refreshStoragePanel(true)
  })

  document.getElementById('storage-back-btn')?.addEventListener('click', () => {
    showOverviewView()
  })

  document.getElementById('storage-quick-clean-cache-btn')?.addEventListener('click', async () => {
    const ok = await uiDeps.confirmDialog(
      'Bersihkan Cache, Log & Backup?',
      'Menghapus log server, cache model/audio, backup config.yaml lama, dan cache Chromium. Data obrolan dan API Key tetap aman.'
    )
    if (!ok) return
    const res = await window.hermesAvatar?.storageAction?.('clear-category', { categoryId: 'cache' })
    if (res?.ok) {
      uiDeps.showToast(
        'Cache Dibersihkan 🧹',
        `${res.deletedCount} file dibersihkan · Menghemat ${formatBytes(res.freedBytes)}`,
        'success',
        '🧹',
        4000
      )
      await refreshStoragePanel(false)
    } else {
      uiDeps.showToast('Gagal Membersihkan', res?.error || 'Terjadi kesalahan', 'error', '❌')
    }
  })
}
