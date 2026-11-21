import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')

import {
  getStorageSummary,
  getStorageEngineSummary,
  listStorageCategoryItems,
  deleteStorageItem,
  clearStorageCategory,
  vacuumHermesStateDb,
  archiveScreenCapture,
  archiveDroppedFile
} from '../src/main/storage-service.js'

const tempDirs = []

async function makeTempSandbox() {
  const root = await mkdtemp(join(tmpdir(), 'hermes-storage-test-'))
  tempDirs.push(root)
  const hermesHome = join(root, 'hermes')
  const avatarHome = join(root, 'hermes-avatar')
  const userDataDir = join(root, 'userData')
  await mkdir(hermesHome, { recursive: true })
  await mkdir(avatarHome, { recursive: true })
  await mkdir(userDataDir, { recursive: true })
  return { root, hermesHome, avatarHome, userDataDir, legacyHermesHome: join(root, 'legacy-hermes') }
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
})

// PNG 1x1 transparan minimal
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

describe('storage-service', () => {
  it('1) getStorageSummary menghitung kategori userDataBytes terpisah dari engineBytes', async () => {
    const sb = await makeTempSandbox()
    await mkdir(join(sb.hermesHome, 'sessions'), { recursive: true })
    await mkdir(join(sb.hermesHome, 'images'), { recursive: true })
    await mkdir(join(sb.hermesHome, 'attachments'), { recursive: true })
    await mkdir(join(sb.hermesHome, 'logs'), { recursive: true })
    await mkdir(join(sb.hermesHome, 'hermes-agent'), { recursive: true })
    await mkdir(join(sb.avatarHome, 'packages', 'kokoro'), { recursive: true })
    await mkdir(join(sb.userDataDir, 'Code Cache'), { recursive: true })

    await writeFile(join(sb.hermesHome, 'state.db'), Buffer.alloc(4096))
    await writeFile(join(sb.hermesHome, 'sessions', 's1.json'), Buffer.alloc(1024))
    await writeFile(join(sb.hermesHome, 'images', 'snap.png'), TINY_PNG)
    await writeFile(join(sb.hermesHome, 'attachments', 'doc.pdf'), Buffer.alloc(2048))
    await writeFile(join(sb.avatarHome, 'packages', 'kokoro', 'model.onnx'), Buffer.alloc(8192))
    await writeFile(join(sb.hermesHome, 'logs', 'server.log'), Buffer.alloc(1500))
    await writeFile(join(sb.userDataDir, 'Code Cache', 'js.bin'), Buffer.alloc(500))
    await writeFile(join(sb.hermesHome, 'hermes-agent', 'runtime.bin'), Buffer.alloc(16384))

    const summary = await getStorageSummary({ ...sb, forceRefreshEngine: true })
    expect(summary.ok).toBe(true)

    const byId = Object.fromEntries(summary.categories.map((c) => [c.id, c]))
    expect(byId.chat.bytes).toBe(5120)
    expect(byId.images.bytes).toBe(TINY_PNG.length)
    expect(byId.files.bytes).toBe(2048)
    expect(byId.packages.bytes).toBe(8192)
    expect(byId.cache.bytes).toBe(2000)

    expect(summary.userDataBytes).toBe(5120 + TINY_PNG.length + 2048 + 8192 + 2000)
    expect(summary.engineBytes).toBe(16384)
    expect(summary.totalBytes).toBe(summary.userDataBytes + 16384)
  })

  it('2) listStorageCategoryItems menghasilkan thumbDataUrl gambar & daftar file terurut terbaru', async () => {
    const sb = await makeTempSandbox()
    await mkdir(join(sb.hermesHome, 'images'), { recursive: true })
    await mkdir(join(sb.hermesHome, 'attachments'), { recursive: true })

    await writeFile(join(sb.hermesHome, 'images', 'sample.png'), TINY_PNG)
    await writeFile(join(sb.hermesHome, 'attachments', 'first.txt'), 'satu')
    await new Promise((r) => setTimeout(r, 25))
    await writeFile(join(sb.hermesHome, 'attachments', 'second.txt'), 'dua panjang')

    const imgList = await listStorageCategoryItems('images', sb)
    expect(imgList.ok).toBe(true)
    expect(imgList.items).toHaveLength(1)
    expect(imgList.items[0].isImage).toBe(true)
    expect(imgList.items[0].deletable).toBe(true)
    expect(imgList.items[0].thumbDataUrl).toMatch(/^data:image\/png;base64,/)

    const fileList = await listStorageCategoryItems('files', sb)
    expect(fileList.ok).toBe(true)
    expect(fileList.items.map((i) => i.name)).toEqual(['second.txt', 'first.txt'])
  })

  it('3) archiveScreenCapture & archiveDroppedFile menyimpan rapi dengan sanitasi nama dan batas ukuran', async () => {
    const sb = await makeTempSandbox()
    const capRes = await archiveScreenCapture(Buffer.from('fake-jpg-bytes'), sb)
    expect(capRes.ok).toBe(true)
    expect(existsSync(capRes.path)).toBe(true)
    expect(capRes.path.startsWith(join(sb.hermesHome, 'images'))).toBe(true)

    const dropDir = join(sb.root, 'drops')
    await mkdir(dropDir, { recursive: true })
    const docSrc = join(dropDir, 'report.txt')
    await writeFile(docSrc, 'isi laporan rahasia')

    // Nama mengandung path traversal ../../evil.txt → wajib disanitasi ke basename aman di attachments/
    const docRes = await archiveDroppedFile({ sourcePath: docSrc, fileName: '../../evil name.txt' }, sb)
    expect(docRes.ok).toBe(true)
    expect(docRes.category).toBe('files')
    expect(docRes.path.startsWith(join(sb.hermesHome, 'attachments'))).toBe(true)
    expect(await readFile(docRes.path, 'utf8')).toBe('isi laporan rahasia')

    const imgSrc = join(dropDir, 'foto.png')
    await writeFile(imgSrc, TINY_PNG)
    const imgRes = await archiveDroppedFile({ sourcePath: imgSrc, fileName: 'foto.png' }, sb)
    expect(imgRes.ok).toBe(true)
    expect(imgRes.category).toBe('images')
    expect(imgRes.path.startsWith(join(sb.hermesHome, 'images'))).toBe(true)

    // Melebihi maxBytes dilewati aman
    const bigRes = await archiveDroppedFile({ sourcePath: docSrc, fileName: 'big.txt', maxBytes: 4 }, sb)
    expect(bigRes.ok).toBe(true)
    expect(bigRes.skipped).toBe(true)
    expect(bigRes.reason).toBe('too-large')
  })

  it('4) deleteStorageItem menghapus item kategori aman dan menolak config.yaml / .env / state.db / luar root', async () => {
    const sb = await makeTempSandbox()
    await mkdir(join(sb.hermesHome, 'images'), { recursive: true })
    await mkdir(join(sb.hermesHome, 'hermes-agent'), { recursive: true })

    const imgFile = join(sb.hermesHome, 'images', 'hapus.png')
    const cfgFile = join(sb.hermesHome, 'config.yaml')
    const envFile = join(sb.hermesHome, '.env')
    const dbFile = join(sb.hermesHome, 'state.db')
    const engineFile = join(sb.hermesHome, 'hermes-agent', 'core.py')
    const outsideFile = join(sb.root, 'outside.txt')

    await writeFile(imgFile, TINY_PNG)
    await writeFile(cfgFile, 'model:\n  default: test\n')
    await writeFile(envFile, 'API_KEY=secret\n')
    await writeFile(dbFile, Buffer.alloc(512))
    await writeFile(engineFile, 'print("core")\n')
    await writeFile(outsideFile, 'jangan hapus')

    const okDel = await deleteStorageItem(imgFile, sb)
    expect(okDel.ok).toBe(true)
    expect(existsSync(imgFile)).toBe(false)

    for (const protectedPath of [cfgFile, envFile, dbFile, engineFile, outsideFile]) {
      const blocked = await deleteStorageItem(protectedPath, sb)
      expect(blocked.ok).toBe(false)
      expect(existsSync(protectedPath)).toBe(true)
    }
  })

  it('5) clearStorageCategory membersihkan cache/logs/backup tanpa menyentuh config.yaml/state.db & menolak kategori terlindungi', async () => {
    const sb = await makeTempSandbox()
    await mkdir(join(sb.hermesHome, 'logs'), { recursive: true })
    await mkdir(join(sb.hermesHome, 'cache'), { recursive: true })
    await mkdir(join(sb.userDataDir, 'Cache'), { recursive: true })

    const cfgFile = join(sb.hermesHome, 'config.yaml')
    const dbFile = join(sb.hermesHome, 'state.db')
    const bakFile = join(sb.hermesHome, 'config.yaml.bak-20261121')
    const logFile = join(sb.hermesHome, 'logs', 'hermes.log')
    const ucFile = join(sb.userDataDir, 'Cache', 'f_001')

    await writeFile(cfgFile, 'model:\n  default: test\n')
    await writeFile(dbFile, Buffer.alloc(1024))
    await writeFile(bakFile, 'old backup')
    await writeFile(logFile, 'log line')
    await writeFile(ucFile, 'cached')

    const res = await clearStorageCategory('cache', sb)
    expect(res.ok).toBe(true)
    expect(res.deletedCount).toBe(3)
    expect(existsSync(bakFile)).toBe(false)
    expect(existsSync(logFile)).toBe(false)
    expect(existsSync(ucFile)).toBe(false)
    expect(existsSync(cfgFile)).toBe(true)
    expect(existsSync(dbFile)).toBe(true)

    const blockedChat = await clearStorageCategory('chat', sb)
    expect(blockedChat.ok).toBe(false)
    const blockedEngine = await clearStorageCategory('engine', sb)
    expect(blockedEngine.ok).toBe(false)
  })

  it('6) vacuumHermesStateDb mengoptimalkan state.db temp dan melaporkan before/after/savedBytes', async () => {
    const sb = await makeTempSandbox()
    const dbPath = join(sb.hermesHome, 'state.db')
    const db = new DatabaseSync(dbPath)
    db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, body TEXT);')
    const ins = db.prepare('INSERT INTO items (body) VALUES (?)')
    const bigText = 'x'.repeat(2000)
    for (let i = 0; i < 80; i++) {
      ins.run(bigText)
    }
    db.exec('DELETE FROM items;')
    db.close()

    const vRes = await vacuumHermesStateDb(sb)
    expect(vRes.ok).toBe(true)
    expect(vRes.beforeBytes).toBeGreaterThan(vRes.afterBytes)
    expect(vRes.savedBytes).toBeGreaterThan(0)
  })

  it('7) mode 2-fase getStorageSummary({ includeEngine: false }) & getStorageEngineSummary memakai cache engine dengan benar', async () => {
    const sb = await makeTempSandbox()
    await mkdir(join(sb.hermesHome, 'hermes-agent'), { recursive: true })
    await writeFile(join(sb.hermesHome, 'state.db'), Buffer.alloc(2048))
    await writeFile(join(sb.hermesHome, 'hermes-agent', 'runtime.bin'), Buffer.alloc(12288))

    const phase1 = await getStorageSummary({ ...sb, includeEngine: false })
    expect(phase1.ok).toBe(true)
    expect(phase1.enginePending).toBe(true)
    expect(phase1.engine).toBeNull()
    expect(phase1.userDataBytes).toBe(2048)

    const phase2 = await getStorageEngineSummary(sb)
    expect(phase2.ok).toBe(true)
    expect(phase2.engineBytes).toBe(12288)
    expect(phase2.engine.breakdown.find((b) => b.name === 'hermes-agent')?.bytes).toBe(12288)

    const cachedPhase1 = await getStorageSummary({ ...sb, includeEngine: false })
    expect(cachedPhase1.ok).toBe(true)
    expect(cachedPhase1.enginePending).toBe(false)
    expect(cachedPhase1.engineBytes).toBe(12288)
    expect(cachedPhase1.engine).not.toBeNull()
  })
})
