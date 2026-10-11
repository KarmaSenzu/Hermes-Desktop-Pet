/**
 * shortcuts.js (main process)
 * Global shortcut yang bisa di-custom user & tersimpan di
 * `~/.hermes-avatar/shortcuts.json` (di luar repo, cross-platform).
 */

import { globalShortcut } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const STATE_DIR = join(homedir(), '.hermes-avatar')
const FILE = join(STATE_DIR, 'shortcuts.json')

// Default (fallback jika belum ada file).
const DEFAULT_SHORTCUTS = [
  { id: 'toggle-chat', accel: 'CommandOrControl+Shift+Space', label: 'Buka / tutup chat' },
  { id: 'toggle-mic', accel: 'CommandOrControl+Shift+M', label: 'Rekam suara' },
  { id: 'open-settings', accel: 'CommandOrControl+Shift+S', label: 'Buka pengaturan' }
]

function load() {
  try {
    if (existsSync(FILE)) {
      const data = JSON.parse(readFileSync(FILE, 'utf8'))
      if (Array.isArray(data) && data.length > 0) return data
    }
  } catch {
    // fallback ke default
  }
  return structuredClone(DEFAULT_SHORTCUTS)
}

function save(list) {
  try {
    mkdirSync(STATE_DIR, { recursive: true })
    writeFileSync(FILE, JSON.stringify(list, null, 2), 'utf8')
  } catch (err) {
    console.error('[shortcuts] save failed:', err?.message || err)
  }
}

let registered = []

export function registerShortcuts(onTrigger) {
  unregisterShortcuts()
  const list = load()
  for (const sc of list) {
    try {
      globalShortcut.register(sc.accel, () => onTrigger(sc.id, sc.accel))
      registered.push(sc.accel)
    } catch (err) {
      console.error('[shortcuts] register failed:', sc.accel, err?.message || err)
    }
  }
  return list
}

export function unregisterShortcuts() {
  globalShortcut.unregisterAll()
  registered = []
}

export function getShortcutList() {
  return load()
}

export function updateShortcut(id, newAccel) {
  const list = load()
  const item = list.find((s) => s.id === id)
  if (!item) throw new Error(`shortcut "${id}" tidak ditemukan`)
  item.accel = newAccel
  save(list)
  return list
}
