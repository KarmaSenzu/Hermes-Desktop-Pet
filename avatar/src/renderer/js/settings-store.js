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
    provider: 'kokoro',    // 'kokoro' (Lokal AI) | 'edge' (Microsoft Cloud)
    voice: 'af_heart',     // Suara default anime: af_heart
    kokoroEndpoint: 'http://127.0.0.1:8880',
    speed: 1.0,            // kecepatan bicara (0.5 - 2.0)
    verbosity: 'concise'   // 'concise' | 'full' — seberapa ringkas jawaban dibaca
  },
  stt: {
    model: 'base',
    language: 'id'
  },
  conversation: {
    continuous: false, // auto-listen setelah selesai bicara
    bargeIn: true      // izinkan interupsi saat Hermes bicara
  },
  llm: {
    providers: []
  },
  characters: [
    {
      id: 'mother-live2d',
      name: 'Mother (Live2D)',
      path: 'assets/live2d/mother/20250106.model3.json',
      format: 'model3.json',
      active: true
    }
  ],
  routerChecked: false, // checklist pengingat 9Router (manual oleh user)
  actions: { // allowlist aksi (Perintah) — { id: boolean }
    open_app: true,
    open_website: true,
    browser_control: true,
    system_monitor: true,
    file_access: true,
    terminal: false
  },
  actionApps: [], // daftar aplikasi terdaftar: [{ id, name, command }]
  pose: 'a-pose', // pose default avatar: 'a-pose' | 't-pose'
  animations: [], // daftar animasi: [{ id, name, path, format, targetState, type, createdAt }]
  stateAnimations: {
    thinking: 'glasses',     // 'glasses' | 'ponder' | 'curious' | 'neutral' | 'custom:<id>'
    watch: 'watch_suit',     // 'watch_suit' | 'watch_only' | 'glasses_only' | 'casual' | 'custom:<id>'
    processing: 'charterer', // 'charterer' | 'focus' | 'relaxed' | 'custom:<id>'
    greeting: 'sarangheo',   // 'sarangheo' | 'bounce' | 'wave' | 'custom:<id>'
    idle: 'a-pose'           // 'a-pose' | 't-pose' | 'custom:<id>'
  },
  idleReminder: {
    enabled: true,
    intervalMinutes: 10,
    lines: [
      'Jangan lupa minum air putih ya 💧',
      'Postur tubuhnya ditegakkan dulu yuk, biar punggung tidak pegal 🧘',
      'Fokus kerja hebat banget! Semangat terus ya ✨',
      'Sudah istirahatkan mata sejenak belum? Coba lihat ke kejauhan sebentar 👀',
      'Ada yang bisa kubantu dengan AI Hermes? Buka chat kapan saja ya 💬',
      'Tarik napas dalam-dalam... hembuskan perlahan 🌸'
    ]
  }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return structuredClone(DEFAULT_SETTINGS)
    const parsed = JSON.parse(raw)
    const merged = { ...structuredClone(DEFAULT_SETTINGS), ...parsed }
    if (!merged.characters || merged.characters.length === 0) {
      merged.characters = structuredClone(DEFAULT_SETTINGS.characters)
    }
    if (!merged.characters.some((c) => c.active)) {
      merged.characters[0].active = true
    }
    merged.stateAnimations = {
      ...DEFAULT_SETTINGS.stateAnimations,
      ...(parsed.stateAnimations || {})
    }
    merged.idleReminder = {
      ...DEFAULT_SETTINGS.idleReminder,
      ...(parsed.idleReminder || {})
    }
    if (!Array.isArray(merged.idleReminder.lines) || merged.idleReminder.lines.length === 0) {
      merged.idleReminder.lines = [...DEFAULT_SETTINGS.idleReminder.lines]
    }
    return merged
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
