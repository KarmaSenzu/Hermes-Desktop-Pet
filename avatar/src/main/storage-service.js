/**
 * storage-service.js — Layanan analisis, pengelolaan, dan pengarsipan penyimpanan lokal
 * untuk seluruh data Hermes Agent + Aplikasi Desktop Avatar (chat DB, gambar, file lampiran,
 * paket/skill, cache/log/backup, serta ringkasan read-only engine terpasang).
 */

import { existsSync, realpathSync } from 'node:fs'
import { copyFile, lstat, mkdir, readdir, readFile, rm, statfs, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { randomBytes } from 'node:crypto'

import { resolveHermesHomeDir } from './hermes-brain-service.js'

const nodeRequire = createRequire(import.meta.url)

const ENGINE_CACHE_TTL_MS = 5 * 60_000
const engineSizeCache = new Map()

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp)$/i
const IMAGE_THUMB_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

const MAX_ITEMS_LIST = 200
const MAX_THUMBS = 48
const MAX_THUMB_BYTES = 2 * 1024 * 1024
const DEFAULT_MAX_ARCHIVE_BYTES = 25 * 1024 * 1024

// File sensitif / inti yang DILARANG keras dihapus melalui Storage Manager
const HARD_PROTECTED_BASENAMES = new Set([
  'config.yaml',
  '.env',
  'state.db',
  'state.db-wal',
  'state.db-shm',
  'kanban.db',
  'kanban.db.dispatch.lock',
  'kanban.db.init.lock',
  'verification_evidence.db',
  'soul.md',
  'user.md',
  'memory.md',
  'auth.json',
  'auth.lock',
  'session-token',
  'bridge-token',
  'llm_providers.json',
  'apps_cache.json',
  'music_library.json',
  'shortcuts.json',
  'gateway_state.json',
  'channel_directory.json',
  'install-state.json',
  'paths.json'
])

const HERMES_ROOT_CACHE_FILES = new Set([
  'models_dev_cache.json',
  'provider_models_cache.json',
  'ollama_cloud_models_cache.json',
  'context_length_cache.yaml',
  'interrupt_debug.log'
])

const USER_DATA_CACHE_DIRS = [
  'Cache',
  'Code Cache',
  'GPUCache',
  'GrShaderCache',
  'ShaderCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache'
]

function isHermesRootCacheOrBackupFile(name) {
  const lower = String(name || '').toLowerCase()
  if (!lower || HARD_PROTECTED_BASENAMES.has(lower)) return false
  if (HERMES_ROOT_CACHE_FILES.has(lower)) return true
  if (lower.startsWith('config.yaml.bak') || lower.startsWith('config.yaml.corrupt.')) return true
  if (lower.startsWith('soul.md.bak')) return true
  return false
}

function normCmpPath(p) {
  const r = resolve(String(p || ''))
  return process.platform === 'win32' ? r.toLowerCase() : r
}

function resolveRoots(opts = {}) {
  const home = homedir()
  const hermesHome = resolve(opts.hermesHome || resolveHermesHomeDir())
  const avatarHome = resolve(opts.avatarHome || join(home, '.hermes-avatar'))
  const legacyHermesHome = resolve(opts.legacyHermesHome || join(home, '.hermes'))
  const userDataDir = opts.userDataDir ? resolve(opts.userDataDir) : null
  return { hermesHome, avatarHome, legacyHermesHome, userDataDir }
}

function isInsideRealDir(realDir, realTarget) {
  try {
    const a = process.platform === 'win32' ? realDir.toLowerCase() : realDir
    const b = process.platform === 'win32' ? realTarget.toLowerCase() : realTarget
    const rel = relative(a, b)
    if (!rel) return false // harus di dalam folder, bukan folder root itu sendiri
    const first = rel.split(sep)[0]
    return first !== '..' && !isAbsolute(rel)
  } catch {
    return false
  }
}

async function getFileStatSafe(filePath) {
  try {
    const st = await lstat(filePath)
    if (st.isSymbolicLink() || !st.isFile()) return null
    return st
  } catch {
    return null
  }
}

async function scanDirStats(dirPath, { collectFiles = false, sourceLabel = '', maxDepth = 12 } = {}) {
  let bytes = 0
  let itemCount = 0
  const files = []
  if (!dirPath || !existsSync(dirPath)) return { bytes, itemCount, files }

  const queue = [{ dir: dirPath, depth: 0 }]
  while (queue.length > 0) {
    const batch = queue.splice(0, 64)
    await Promise.all(
      batch.map(async ({ dir, depth }) => {
        if (depth > maxDepth) return
        let entries
        try {
          entries = await readdir(dir, { withFileTypes: true })
        } catch {
          return
        }
        const fileNames = []
        for (const ent of entries) {
          if (ent.isSymbolicLink()) continue
          if (ent.isDirectory()) {
            queue.push({ dir: join(dir, ent.name), depth: depth + 1 })
          } else if (ent.isFile()) {
            fileNames.push(ent.name)
          }
        }
        for (let i = 0; i < fileNames.length; i += 128) {
          const chunk = fileNames.slice(i, i + 128)
          const stats = await Promise.all(chunk.map((name) => getFileStatSafe(join(dir, name))))
          for (let j = 0; j < chunk.length; j++) {
            const st = stats[j]
            if (!st) continue
            bytes += st.size
            itemCount += 1
            if (collectFiles) {
              const name = chunk[j]
              files.push({
                name,
                path: join(dir, name),
                size: st.size,
                mtimeMs: Number(st.mtimeMs || 0),
                ext: extname(name).toLowerCase(),
                sourceLabel
              })
            }
          }
        }
      })
    )
  }
  return { bytes, itemCount, files }
}

async function scanFileList(filePaths, { collectFiles = false, sourceLabel = '' } = {}) {
  let bytes = 0
  let itemCount = 0
  const files = []
  for (const fp of filePaths) {
    if (!fp) continue
    const st = await getFileStatSafe(fp)
    if (!st) continue
    bytes += st.size
    itemCount += 1
    if (collectFiles) {
      files.push({
        name: basename(fp),
        path: fp,
        size: st.size,
        mtimeMs: Number(st.mtimeMs || 0),
        ext: extname(fp).toLowerCase(),
        sourceLabel
      })
    }
  }
  return { bytes, itemCount, files }
}

async function findHermesRootCacheFiles(hermesHome) {
  if (!existsSync(hermesHome)) return []
  try {
    const entries = await readdir(hermesHome, { withFileTypes: true })
    return entries
      .filter((e) => e.isFile() && isHermesRootCacheOrBackupFile(e.name))
      .map((e) => join(hermesHome, e.name))
  } catch {
    return []
  }
}

async function getCategorySources(roots) {
  const { hermesHome, avatarHome, legacyHermesHome, userDataDir } = roots

  const skillDirs = [join(hermesHome, 'skills')]
  const legacySkills = join(legacyHermesHome, 'skills')
  if (normCmpPath(legacySkills) !== normCmpPath(skillDirs[0])) {
    skillDirs.push(legacySkills)
  }

  const hermesCacheFiles = await findHermesRootCacheFiles(hermesHome)
  const userDataCacheDirs = userDataDir
    ? USER_DATA_CACHE_DIRS.map((sub) => ({ path: join(userDataDir, sub), label: `Electron ${sub}` }))
    : []

  return {
    chat: {
      id: 'chat',
      label: 'Riwayat Chat & Database',
      description: 'Database percakapan FTS5 (state.db), transkrip sesi, kanban, dan memori jangka panjang.',
      color: 'blue',
      primaryPath: hermesHome,
      cleanable: false,
      canVacuum: true,
      dirs: [
        { path: join(hermesHome, 'sessions'), label: 'sessions' },
        { path: join(hermesHome, 'memories'), label: 'memories' }
      ],
      files: [
        { path: join(hermesHome, 'state.db'), label: 'Database Sesi' },
        { path: join(hermesHome, 'state.db-wal'), label: 'WAL DB' },
        { path: join(hermesHome, 'state.db-shm'), label: 'SHM DB' },
        { path: join(hermesHome, 'kanban.db'), label: 'Kanban DB' },
        { path: join(hermesHome, 'verification_evidence.db'), label: 'Verification DB' },
        { path: join(hermesHome, 'SOUL.md'), label: 'SOUL.md' }
      ]
    },
    images: {
      id: 'images',
      label: 'Gambar & Tangkapan Layar',
      description: 'Arsip gambar yang dikirim, tangkapan layar Screen Vision, dan cache visual.',
      color: 'purple',
      primaryPath: join(hermesHome, 'images'),
      cleanable: true,
      canVacuum: false,
      dirs: [
        { path: join(hermesHome, 'images'), label: 'Hermes Images' },
        { path: join(hermesHome, 'image_cache'), label: 'Image Cache' }
      ],
      files: [
        { path: join(avatarHome, 'latest-screen-capture.jpg'), label: 'Screenshot Terakhir' }
      ]
    },
    files: {
      id: 'files',
      label: 'File & Lampiran',
      description: 'Dokumen yang dijatuhkan ke avatar, lampiran sesi, dan output tugas Cron.',
      color: 'green',
      primaryPath: join(hermesHome, 'attachments'),
      cleanable: true,
      canVacuum: false,
      dirs: [
        { path: join(hermesHome, 'attachments'), label: 'Lampiran Hermes' },
        { path: join(hermesHome, 'cron', 'output'), label: 'Output Cron' },
        { path: join(avatarHome, 'attachments'), label: 'Lampiran Avatar' }
      ],
      files: []
    },
    packages: {
      id: 'packages',
      label: 'Paket, Model & Skill',
      description: 'Model TTS/Live2D/3D terunduh di Package Hub, skill AI, dan ekstensi companion.',
      color: 'orange',
      primaryPath: join(avatarHome, 'packages'),
      cleanable: false,
      canVacuum: false,
      dirs: [
        { path: join(avatarHome, 'packages'), label: 'Packages' },
        ...skillDirs.map((p) => ({ path: p, label: 'Skills' })),
        { path: join(avatarHome, 'extensions'), label: 'Extensions' },
        { path: join(avatarHome, 'scripts'), label: 'Scripts' }
      ],
      files: []
    },
    cache: {
      id: 'cache',
      label: 'Cache, Log & Backup',
      description: 'Log server, cache model/audio, backup config.yaml lama, dan cache Chromium (aman dibersihkan).',
      color: 'slate',
      primaryPath: join(hermesHome, 'logs'),
      cleanable: true,
      canVacuum: false,
      dirs: [
        { path: join(hermesHome, 'logs'), label: 'Hermes Logs' },
        { path: join(hermesHome, 'cache'), label: 'Hermes Cache' },
        { path: join(hermesHome, 'audio_cache'), label: 'Audio Cache' },
        ...userDataCacheDirs
      ],
      files: hermesCacheFiles.map((fp) => ({ path: fp, label: 'Cache / Backup Hermes' }))
    }
  }
}

async function computeCategoryStats(spec) {
  let bytes = 0
  let itemCount = 0
  for (const d of spec.dirs || []) {
    const res = await scanDirStats(d.path, { collectFiles: false })
    bytes += res.bytes
    itemCount += res.itemCount
  }
  for (const f of spec.files || []) {
    const res = await scanFileList([f.path], { collectFiles: false })
    bytes += res.bytes
    itemCount += res.itemCount
  }
  return {
    id: spec.id,
    label: spec.label,
    description: spec.description,
    color: spec.color,
    bytes,
    itemCount,
    primaryPath: spec.primaryPath,
    cleanable: spec.cleanable,
    canVacuum: spec.canVacuum
  }
}

function getCachedEngineStats(hermesHome) {
  const key = normCmpPath(hermesHome)
  const cached = engineSizeCache.get(key)
  if (cached && (Date.now() - cached.at < ENGINE_CACHE_TTL_MS)) {
    return cached.value
  }
  return null
}

async function getEngineStats(hermesHome, forceRefresh = false) {
  const key = normCmpPath(hermesHome)
  if (!forceRefresh) {
    const cached = getCachedEngineStats(hermesHome)
    if (cached) return cached
  }

  const parts = ['hermes-agent', 'bin', 'lsp']
  const breakdown = await Promise.all(
    parts.map(async (name) => {
      const p = join(hermesHome, name)
      const res = await scanDirStats(p, { collectFiles: false, maxDepth: 16 })
      return { name, path: p, bytes: res.bytes, itemCount: res.itemCount }
    })
  )
  const totalBytes = breakdown.reduce((acc, b) => acc + b.bytes, 0)
  const totalItems = breakdown.reduce((acc, b) => acc + b.itemCount, 0)

  const value = {
    id: 'engine',
    label: 'Engine & Runtime Terpasang',
    bytes: totalBytes,
    itemCount: totalItems,
    primaryPath: hermesHome,
    breakdown
  }
  engineSizeCache.set(key, { at: Date.now(), value })
  return value
}

async function readDiskStatsSafe(probePath) {
  try {
    const target = existsSync(probePath) ? probePath : homedir()
    const fsInfo = await statfs(target)
    const bsize = Number(fsInfo?.bsize || 0)
    const blocks = Number(fsInfo?.blocks || 0)
    const avail = Number(fsInfo?.bavail ?? fsInfo?.bfree ?? 0)
    const totalBytes = bsize * blocks
    const freeBytes = bsize * avail
    if (!Number.isFinite(totalBytes) || !Number.isFinite(freeBytes) || totalBytes <= 0) {
      return null
    }
    return { totalBytes, freeBytes }
  } catch {
    return null
  }
}

/**
 * Mengambil ringkasan ukuran kategori Engine & Runtime (`hermes-agent`, `bin`, `lsp`).
 */
export async function getStorageEngineSummary(opts = {}) {
  try {
    const roots = resolveRoots(opts)
    const engine = await getEngineStats(roots.hermesHome, Boolean(opts.forceRefreshEngine))
    return { ok: true, engine, engineBytes: engine.bytes }
  } catch (err) {
    return { ok: false, error: err?.message || String(err), engine: null, engineBytes: 0 }
  }
}

/**
 * Mengambil ringkasan seluruh penyimpanan sistem lokal (data pengguna + info engine terpisah).
 */
export async function getStorageSummary(opts = {}) {
  try {
    const roots = resolveRoots(opts)
    const specs = await getCategorySources(roots)
    const orderedIds = ['chat', 'images', 'files', 'packages', 'cache']
    const includeEngine = opts.includeEngine !== false
    const forceRefreshEngine = Boolean(opts.forceRefreshEngine)

    const [categories, disk] = await Promise.all([
      Promise.all(orderedIds.map((id) => computeCategoryStats(specs[id]))),
      readDiskStatsSafe(roots.hermesHome)
    ])
    const userDataBytes = categories.reduce((acc, c) => acc + c.bytes, 0)

    let engine = null
    let enginePending = false
    if (includeEngine) {
      engine = await getEngineStats(roots.hermesHome, forceRefreshEngine)
    } else if (!forceRefreshEngine) {
      engine = getCachedEngineStats(roots.hermesHome)
      enginePending = !engine
    } else {
      enginePending = true
    }

    const engineBytes = Number(engine?.bytes || 0)

    return {
      ok: true,
      scannedAt: Date.now(),
      roots,
      userDataBytes,
      engineBytes,
      enginePending,
      totalBytes: userDataBytes + engineBytes,
      disk,
      categories,
      engine
    }
  } catch (err) {
    return { ok: false, error: err?.message || String(err), categories: [], userDataBytes: 0, engineBytes: 0, enginePending: false, totalBytes: 0 }
  }
}

async function makeThumbDataUrl(filePath, ext, size) {
  const mime = IMAGE_THUMB_MIME[ext]
  if (!mime || size > MAX_THUMB_BYTES) return null
  try {
    const buf = await readFile(filePath)
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

/**
 * Mengambil daftar item rinci (file / folder paket / thumbnail gambar) untuk satu kategori.
 */
export async function listStorageCategoryItems(categoryId, opts = {}) {
  try {
    const cid = String(categoryId || '').trim()
    const roots = resolveRoots(opts)
    const specs = await getCategorySources(roots)
    const spec = specs[cid]
    if (!spec) {
      return { ok: false, error: `Kategori penyimpanan tidak dikenal: ${cid}`, items: [] }
    }

    const collected = []

    if (cid === 'packages') {
      // Tampilkan per-folder level 1 agar jelas paket/skill mana yang memakan ruang terbesar.
      for (const d of spec.dirs) {
        if (!existsSync(d.path)) continue
        let entries = []
        try {
          entries = await readdir(d.path, { withFileTypes: true })
        } catch {
          continue
        }
        for (const ent of entries) {
          if (ent.isSymbolicLink()) continue
          const full = join(d.path, ent.name)
          if (ent.isDirectory()) {
            const subStats = await scanDirStats(full, { collectFiles: false })
            collected.push({
              name: ent.name,
              path: full,
              size: subStats.bytes,
              mtimeMs: 0,
              ext: '',
              sourceLabel: `${d.label} (${subStats.itemCount} file)`,
              deletable: false,
              isImage: false,
              isDir: true,
              thumbDataUrl: null
            })
          } else if (ent.isFile()) {
            const st = await getFileStatSafe(full)
            if (!st) continue
            collected.push({
              name: ent.name,
              path: full,
              size: st.size,
              mtimeMs: Number(st.mtimeMs || 0),
              ext: extname(ent.name).toLowerCase(),
              sourceLabel: d.label,
              deletable: false,
              isImage: false,
              isDir: false,
              thumbDataUrl: null
            })
          }
        }
      }
      collected.sort((a, b) => b.size - a.size)
      return {
        ok: true,
        categoryId: cid,
        label: spec.label,
        primaryPath: spec.primaryPath,
        cleanable: spec.cleanable,
        canVacuum: spec.canVacuum,
        items: collected.slice(0, MAX_ITEMS_LIST)
      }
    }

    for (const d of spec.dirs) {
      const res = await scanDirStats(d.path, { collectFiles: true, sourceLabel: d.label })
      collected.push(...res.files)
    }
    for (const f of spec.files) {
      const res = await scanFileList([f.path], { collectFiles: true, sourceLabel: f.label })
      collected.push(...res.files)
    }

    collected.sort((a, b) => b.mtimeMs - a.mtimeMs || b.size - a.size)
    const sliced = collected.slice(0, MAX_ITEMS_LIST)

    let thumbCount = 0
    const items = []
    for (const item of sliced) {
      const isImage = cid === 'images' || IMAGE_EXT_RE.test(item.ext)
      let thumbDataUrl = null
      if (cid === 'images' && IMAGE_THUMB_MIME[item.ext] && thumbCount < MAX_THUMBS) {
        thumbDataUrl = await makeThumbDataUrl(item.path, item.ext, item.size)
        if (thumbDataUrl) thumbCount += 1
      }
      items.push({
        ...item,
        deletable: spec.cleanable && !HARD_PROTECTED_BASENAMES.has(item.name.toLowerCase()),
        isImage,
        isDir: false,
        thumbDataUrl
      })
    }

    return {
      ok: true,
      categoryId: cid,
      label: spec.label,
      primaryPath: spec.primaryPath,
      cleanable: spec.cleanable,
      canVacuum: spec.canVacuum,
      items
    }
  } catch (err) {
    return { ok: false, error: err?.message || String(err), items: [] }
  }
}

async function getDeletableSpec(roots) {
  const specs = await getCategorySources(roots)
  const allowedDirs = []
  const allowedExactFiles = []
  for (const cid of ['images', 'files', 'cache']) {
    for (const d of specs[cid].dirs || []) allowedDirs.push(d.path)
    for (const f of specs[cid].files || []) allowedExactFiles.push(f.path)
  }

  const protectedDirs = [
    join(roots.hermesHome, 'hermes-agent'),
    join(roots.hermesHome, 'bin'),
    join(roots.hermesHome, 'lsp'),
    join(roots.hermesHome, 'memories'),
    join(roots.hermesHome, 'skills'),
    join(roots.legacyHermesHome, 'skills'),
    join(roots.avatarHome, 'packages')
  ]

  return { allowedDirs, allowedExactFiles, protectedDirs }
}

function isTargetInDeletableScope(realTarget, spec) {
  const base = basename(realTarget).toLowerCase()
  if (HARD_PROTECTED_BASENAMES.has(base)) return false

  for (const pd of spec.protectedDirs) {
    if (!existsSync(pd)) continue
    try {
      const realPd = realpathSync(pd)
      if (normCmpPath(realTarget) === normCmpPath(realPd) || isInsideRealDir(realPd, realTarget)) {
        return false
      }
    } catch { /* ignore */ }
  }

  for (const exact of spec.allowedExactFiles) {
    if (!existsSync(exact)) continue
    try {
      const realExact = realpathSync(exact)
      if (normCmpPath(realTarget) === normCmpPath(realExact)) return true
    } catch { /* ignore */ }
  }

  for (const dir of spec.allowedDirs) {
    if (!existsSync(dir)) continue
    try {
      const realDir = realpathSync(dir)
      if (isInsideRealDir(realDir, realTarget)) return true
    } catch { /* ignore */ }
  }

  return false
}

/**
 * Menghapus satu file pada kategori yang aman (images / files / cache) dengan validasi path & blacklist keras.
 */
export async function deleteStorageItem(targetPath, opts = {}) {
  try {
    const raw = String(targetPath || '').trim()
    if (!raw || !existsSync(raw)) {
      return { ok: false, error: 'File tidak ditemukan di disk.' }
    }

    const st = await getFileStatSafe(raw)
    if (!st) {
      return { ok: false, error: 'Target bukan file reguler yang dapat dihapus satuan.' }
    }

    const realTarget = realpathSync(raw)
    const roots = resolveRoots(opts)
    const spec = await getDeletableSpec(roots)
    if (!isTargetInDeletableScope(realTarget, spec)) {
      return { ok: false, error: 'Path dilindungi dan tidak diizinkan dihapus dari Storage Manager.' }
    }

    const freedBytes = st.size
    await rm(realTarget, { force: true })
    return { ok: true, deletedPath: realTarget, freedBytes }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}

/**
 * Membersihkan seluruh isi kategori aman (`images`, `files`, atau `cache`) tanpa menyentuh config/DB inti.
 */
export async function clearStorageCategory(categoryId, opts = {}) {
  const cid = String(categoryId || '').trim()
  if (!['images', 'files', 'cache'].includes(cid)) {
    return { ok: false, error: `Kategori "${cid}" dilindungi dan tidak dapat dikosongkan massal.` }
  }

  try {
    const roots = resolveRoots(opts)
    const specs = await getCategorySources(roots)
    const targetSpec = specs[cid]
    const deletableSpec = await getDeletableSpec(roots)

    let deletedCount = 0
    let freedBytes = 0
    let skippedCount = 0

    for (const d of targetSpec.dirs || []) {
      const scanned = await scanDirStats(d.path, { collectFiles: true })
      for (const f of scanned.files) {
        if (!existsSync(f.path)) continue
        let realTarget
        try {
          realTarget = realpathSync(f.path)
        } catch {
          skippedCount += 1
          continue
        }
        if (!isTargetInDeletableScope(realTarget, deletableSpec)) {
          skippedCount += 1
          continue
        }
        try {
          await rm(realTarget, { force: true })
          deletedCount += 1
          freedBytes += f.size
        } catch {
          skippedCount += 1
        }
      }
    }

    for (const f of targetSpec.files || []) {
      const st = await getFileStatSafe(f.path)
      if (!st) continue
      let realTarget
      try {
        realTarget = realpathSync(f.path)
      } catch {
        skippedCount += 1
        continue
      }
      if (!isTargetInDeletableScope(realTarget, deletableSpec)) {
        skippedCount += 1
        continue
      }
      try {
        await rm(realTarget, { force: true })
        deletedCount += 1
        freedBytes += st.size
      } catch {
        skippedCount += 1
      }
    }

    return { ok: true, categoryId: cid, deletedCount, freedBytes, skippedCount }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}

async function getDbTotalSize(dbPath) {
  let total = 0
  for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    const st = await getFileStatSafe(p)
    if (st) total += st.size
  }
  return total
}

/**
 * Menjalankan WAL checkpoint + SQLite VACUUM pada state.db untuk mengecilkan file setelah sesi dihapus.
 */
export async function vacuumHermesStateDb(opts = {}) {
  const roots = resolveRoots(opts)
  const dbPath = join(roots.hermesHome, 'state.db')
  if (!existsSync(dbPath)) {
    return { ok: false, error: 'Database state.db Hermes tidak ditemukan.' }
  }

  let db = null
  try {
    const beforeBytes = await getDbTotalSize(dbPath)
    const { DatabaseSync } = nodeRequire('node:sqlite')
    db = new DatabaseSync(dbPath)
    db.exec('PRAGMA busy_timeout = 3000;')
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);')
    } catch { /* abaikan bila bukan WAL mode */ }
    db.exec('VACUUM;')
    db.close()
    db = null

    const afterBytes = await getDbTotalSize(dbPath)
    return {
      ok: true,
      dbPath,
      beforeBytes,
      afterBytes,
      savedBytes: Math.max(0, beforeBytes - afterBytes)
    }
  } catch (err) {
    try { db?.close() } catch { /* ignore */ }
    const msg = String(err?.message || err || '')
    if (/locked|busy/i.test(msg)) {
      return { ok: false, error: 'Database sedang dipakai aktif oleh Hermes. Coba lagi saat chat tidak sedang berjalan.' }
    }
    return { ok: false, error: msg || 'Gagal mengoptimalkan database state.db' }
  }
}

/**
 * Validasi target folder / file kategori sebelum dibuka di Explorer.
 */
export async function resolveSafeStorageFolder(categoryId, itemPath = null, opts = {}) {
  const roots = resolveRoots(opts)
  const allowedRoots = [roots.hermesHome, roots.avatarHome, roots.legacyHermesHome, roots.userDataDir]
    .filter(Boolean)
    .map((p) => resolve(p))

  if (itemPath) {
    const raw = String(itemPath).trim()
    if (!existsSync(raw)) return { ok: false, error: 'Lokasi file/folder tidak ditemukan.' }
    const realTarget = realpathSync(raw)
    const insideAllowed = allowedRoots.some((r) => {
      if (!existsSync(r)) return false
      const realR = realpathSync(r)
      return normCmpPath(realTarget) === normCmpPath(realR) || isInsideRealDir(realR, realTarget)
    })
    if (!insideAllowed) {
      return { ok: false, error: 'Lokasi berada di luar folder data sistem.' }
    }
    const st = await lstat(realTarget)
    return { ok: true, path: realTarget, isFile: st.isFile() }
  }

  const cid = String(categoryId || '').trim()
  if (!cid || cid === 'hermes-root') {
    return { ok: true, path: roots.hermesHome, isFile: false }
  }
  if (cid === 'engine') {
    return { ok: true, path: roots.hermesHome, isFile: false }
  }

  const specs = await getCategorySources(roots)
  const spec = specs[cid]
  if (!spec) {
    return { ok: false, error: `Kategori tidak dikenal: ${cid}` }
  }
  return { ok: true, path: spec.primaryPath, isFile: false }
}

function buildTimestampTag() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `${date}_${time}_${randomBytes(2).toString('hex')}`
}

/**
 * Mengarsipkan buffer screenshot Screen Vision ke `<hermesHome>/images/`.
 */
export async function archiveScreenCapture(jpgBuffer, opts = {}) {
  try {
    if (!jpgBuffer || !Buffer.isBuffer(jpgBuffer) || jpgBuffer.length === 0) {
      return { ok: false, error: 'Buffer gambar kosong' }
    }
    const roots = resolveRoots(opts)
    const imgDir = join(roots.hermesHome, 'images')
    await mkdir(imgDir, { recursive: true })
    const outPath = join(imgDir, `screen_${buildTimestampTag()}.jpg`)
    await writeFile(outPath, jpgBuffer)
    return { ok: true, path: outPath, size: jpgBuffer.length }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}

/**
 * Mengarsipkan file atau gambar yang dijatuhkan (drag & drop) ke avatar
 * ke `<hermesHome>/images/` atau `<hermesHome>/attachments/`.
 */
export async function archiveDroppedFile({
  sourcePath,
  fileName,
  maxBytes = DEFAULT_MAX_ARCHIVE_BYTES
} = {}, opts = {}) {
  try {
    const src = String(sourcePath || '').trim()
    if (!src || !existsSync(src)) {
      return { ok: false, error: 'File sumber tidak ditemukan di disk.' }
    }
    const st = await getFileStatSafe(src)
    if (!st) {
      return { ok: false, error: 'Sumber bukan file reguler.' }
    }
    if (st.size > maxBytes) {
      return { ok: true, skipped: true, reason: 'too-large', size: st.size }
    }

    const rawBase = basename(String(fileName || src).replace(/[/\\]+/g, sep))
    const sanitized = rawBase.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^[._-]+/, '')
    const safeName = (!sanitized || sanitized === '..') ? 'lampiran' : sanitized

    const roots = resolveRoots(opts)
    const isImage = IMAGE_EXT_RE.test(extname(safeName))
    const category = isImage ? 'images' : 'files'
    const targetDir = join(roots.hermesHome, isImage ? 'images' : 'attachments')
    await mkdir(targetDir, { recursive: true })

    const destPath = join(targetDir, `drop_${buildTimestampTag()}_${safeName}`)
    await copyFile(src, destPath)
    return { ok: true, category, path: destPath, size: st.size }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}
