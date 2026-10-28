/**
 * app-registry.js — Registry aplikasi terpasang berbasis SHA-256 ID.
 *
 * Mencegah pengiriman path sistem dari renderer. Renderer hanya menerima
 * dan mengirim appId acak (16 karakter hex). Main process mengelola path
 * dan verifikasi ekstensi aman sebelum peluncuran.
 */

import { createHash } from 'node:crypto'
import { extname, basename } from 'node:path'

export const ALLOWED_EXTENSIONS = new Set(['.exe', '.lnk', '.app', '.appimage', '.desktop'])
export const DISALLOWED_EXTENSIONS = new Set(['.bat', '.cmd', '.ps1', '.vbs', '.js', '.sh', '.py'])

/**
 * Menghasilkan ID stabil 16-karakter hex dari path huruf kecil.
 *
 * @param {string} filePath
 * @returns {string}
 */
export function computeAppId(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) return ''
  return createHash('sha256').update(filePath.toLowerCase().trim()).digest('hex').slice(0, 16)
}

/**
 * Memeriksa apakah ekstensi file termasuk dalam allowlist aman.
 *
 * @param {string} filePath
 * @returns {boolean}
 */
export function isAllowedExtension(filePath) {
  if (typeof filePath !== 'string') return false
  const ext = extname(filePath).toLowerCase()
  return ALLOWED_EXTENSIONS.has(ext) && !DISALLOWED_EXTENSIONS.has(ext)
}

/**
 * Factory membuat registry aplikasi dengan injeksi dependensi.
 */
export function createAppRegistry({
  cacheFile,
  fs,
  shell,
  dialog,
  execFile,
  platform = process.platform
}) {
  let registry = []

  function load() {
    try {
      if (fs.existsSync(cacheFile)) {
        const raw = fs.readFileSync(cacheFile, 'utf8')
        const data = JSON.parse(raw)
        if (Array.isArray(data)) {
          registry = data.map((item) => {
            const pathVal = item.path || item.command || ''
            const idVal = item.id || computeAppId(pathVal)
            return {
              id: idVal,
              name: item.name || basename(pathVal),
              path: pathVal,
              source: item.source || 'scan',
              addedAt: item.addedAt || new Date().toISOString()
            }
          }).filter(item => item.id && item.path)
        }
      }
    } catch {
      registry = []
    }
  }

  function save() {
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(registry, null, 2), 'utf8')
    } catch (err) {
      console.warn('[app-registry] Gagal menyimpan cache aplikasi:', err)
    }
  }

  function findById(id) {
    if (!id || typeof id !== 'string') return null
    return registry.find(a => a.id === id) || null
  }

  function getPublicList() {
    return registry.map(a => ({ id: a.id, name: a.name }))
  }

  async function launchById(id) {
    if (!id || typeof id !== 'string') {
      return { ok: false, error: 'ID aplikasi tidak valid' }
    }
    const app = findById(id)
    if (!app) {
      return { ok: false, error: 'Aplikasi tidak terdaftar' }
    }
    if (!fs.existsSync(app.path)) {
      return { ok: false, error: 'File aplikasi tidak ditemukan di disk' }
    }
    if (!isAllowedExtension(app.path)) {
      return { ok: false, error: 'Tipe file aplikasi tidak diizinkan' }
    }

    if (platform === 'win32') {
      const err = await shell.openPath(app.path)
      if (err) return { ok: false, error: err }
      return { ok: true }
    } else if (platform === 'darwin') {
      return new Promise((resolve) => {
        execFile('open', ['-a', app.path], (err) => {
          if (err) resolve({ ok: false, error: err.message || String(err) })
          else resolve({ ok: true })
        })
      })
    } else {
      try {
        const child = execFile(app.path, [], { detached: true, stdio: 'ignore' })
        child.unref()
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err.message || String(err) }
      }
    }
  }

  async function registerApp(filePath, name, source = 'user') {
    if (!filePath || !fs.existsSync(filePath)) {
      return { ok: false, error: 'File tidak ditemukan' }
    }
    if (!isAllowedExtension(filePath)) {
      return { ok: false, error: 'Ekstensi file tidak diizinkan (.exe, .lnk, .app, .appimage, .desktop)' }
    }

    const id = computeAppId(filePath)
    const appName = name || basename(filePath).replace(/\.(exe|lnk|app|appimage|desktop)$/i, '')
    const existing = findById(id)
    if (existing) {
      existing.name = appName
    } else {
      registry.push({
        id,
        name: appName,
        path: filePath,
        source,
        addedAt: new Date().toISOString()
      })
    }
    save()
    return { ok: true, app: { id, name: appName } }
  }

  async function learnAppWithConfirmation(targetPath, name) {
    if (!targetPath || typeof targetPath !== 'string') {
      return { ok: false, error: 'Path tidak valid' }
    }
    if (!fs.existsSync(targetPath)) {
      return { ok: false, error: 'File tidak ditemukan di disk' }
    }
    if (!isAllowedExtension(targetPath)) {
      return { ok: false, error: 'Ekstensi file ditolak' }
    }

    const choice = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Izinkan', 'Batal'],
      defaultId: 1,
      cancelId: 1,
      message: 'Izinkan avatar membuka aplikasi ini?',
      detail: targetPath
    })

    if (choice.response !== 0) {
      return { ok: false, error: 'Penambahan aplikasi dibatalkan oleh pengguna' }
    }

    return registerApp(targetPath, name, 'user')
  }

  function setScannedApps(scannedList) {
    const userApps = registry.filter(a => a.source === 'user')
    const userIds = new Set(userApps.map(a => a.id))

    const newEntries = [...userApps]
    for (const item of scannedList) {
      const pathVal = item.path || item.command || ''
      if (!pathVal || !isAllowedExtension(pathVal) || !fs.existsSync(pathVal)) continue
      const id = computeAppId(pathVal)
      if (!userIds.has(id)) {
        newEntries.push({
          id,
          name: item.name,
          path: pathVal,
          source: 'scan',
          addedAt: new Date().toISOString()
        })
      }
    }
    registry = newEntries
    save()
    return getPublicList()
  }

  // Inisialisasi awal
  load()

  return {
    getPublicList,
    findById,
    launchById,
    registerApp,
    learnAppWithConfirmation,
    setScannedApps,
    getRegistry: () => [...registry]
  }
}
