/**
 * settings-store.js
 * Persistensi pengaturan avatar (sementara pakai localStorage).
 *
 * SETIAP SIDEBAR PUNYA NAMESPACE SENDIRI (rapi & mudah ditambah):
 *   settings.tts        -> sidebar "Suara"
 *   settings.stt        -> sidebar "Suara" (bagian STT)
 *   settings.llm        -> sidebar "LLM & Provider"
 *   settings.characters -> sidebar "Karakter"
 *   (nanti) settings.shortcuts -> sidebar "Shortcut"
 *   (nanti) settings.skills    -> sidebar "Skill" (fitur Hermes mendatang)
 *
 * Nanti secret (API key) dipindah ke safeStorage Electron (P2 final).
 */

const KEY = 'hermes-avatar-settings'

const DEFAULT_SETTINGS = {
  tts: {
    enabled: true,
    voice: 'id-ID-GadisNeural'
  },
  stt: {
    model: 'base',
    language: 'id'
  },
  llm: {
    providers: []
  },
  characters: [], // daftar karakter tersimpan: [{ id, name, path, format, active }]
  routerChecked: false, // checklist pengingat 9Router (manual oleh user)
  actions: { // allowlist aksi (Perintah) — { id: boolean }
    open_app: true,
    open_website: true,
    browser_control: true,
    system_monitor: true,
    file_access: true,
    terminal: false
  },
  actionApps: [] // daftar aplikasi terdaftar: [{ id, name, command }]
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return structuredClone(DEFAULT_SETTINGS)
    return { ...structuredClone(DEFAULT_SETTINGS), ...JSON.parse(raw) }
  } catch {
    return structuredClone(DEFAULT_SETTINGS)
  }
}

export function saveSettings(settings) {
  localStorage.setItem(KEY, JSON.stringify(settings))
}

export function getSettings() {
  return loadSettings()
}
