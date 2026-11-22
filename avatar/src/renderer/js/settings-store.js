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

import { CHARACTER_THUMBS } from './character-thumbs.js'

const KEY = 'hermes-avatar-settings'

const DEFAULT_SETTINGS = {
  uiMode: 'simple', // 'simple' (ramah pemula) | 'advanced' (opsi teknis developer)
  tts: {
    enabled: true,
    provider: 'edge',           // 'edge' (Cloud, Zero-Install) | 'kokoro' (Lokal AI Opsional)
    voice: 'id-ID-GadisNeural', // Suara default Bahasa Indonesia natural langsung siap pakai
    kokoroEndpoint: 'http://127.0.0.1:8880',
    speed: 1.0,                 // kecepatan bicara (0.5 - 2.0)
    verbosity: 'concise'        // 'concise' | 'full' — seberapa ringkas jawaban dibaca
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
    providers: [],
    dailyUsage: { date: '', count: 0 }
  },
  characters: [
    {
      id: 'mother-live2d',
      name: 'Mother (Live2D)',
      path: 'assets/live2d/mother/20250106.model3.json',
      format: 'model3.json',
      image: CHARACTER_THUMBS.mother || '',
      active: true
    },
    {
      id: 'jingliu-live2d',
      name: 'Jingliu (Live2D)',
      path: 'assets/live2d/jingliu/jingliu.model3.json',
      format: 'model3.json',
      image: CHARACTER_THUMBS.jingliu || '',
      active: false
    },
    {
      id: 'huohuo-live2d',
      name: 'HuoHuo (Live2D)',
      path: 'assets/live2d/huohuo/huohuo.model3.json',
      format: 'model3.json',
      image: CHARACTER_THUMBS.huohuo || '',
      active: false
    },
    {
      id: 'sparkle-live2d',
      name: 'Sparkle (Live2D)',
      path: 'assets/live2d/sparkle/Sparkle.model3.json',
      format: 'model3.json',
      image: CHARACTER_THUMBS.sparkle || '',
      active: false
    },
    {
      id: 'ellen-live2d',
      name: 'Ellen Joe (Live2D)',
      path: 'assets/live2d/ellen/ellen.model3.json',
      format: 'model3.json',
      image: CHARACTER_THUMBS.ellen || '',
      active: false
    },
    {
      id: 'jane-live2d',
      name: 'Jane Doe (Live2D)',
      path: 'assets/live2d/jane/jane.model3.json',
      format: 'model3.json',
      image: CHARACTER_THUMBS.jane || '',
      active: false
    },
    {
      id: 'camellya-live2d',
      name: 'Camellya (Live2D)',
      path: 'assets/live2d/camellya/camellya.model3.json',
      format: 'model3.json',
      image: CHARACTER_THUMBS.camellya || '',
      active: false
    },
    {
      id: 'allium-live2d',
      name: 'Allium (Live2D)',
      path: 'assets/live2d/allium/allium.model3.json',
      format: 'model3.json',
      image: CHARACTER_THUMBS.allium || '',
      active: false
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
      'Jangan lupa minum air putih ya',
      'Postur tubuhnya ditegakkan dulu yuk, biar punggung tidak pegal',
      'Fokus kerja hebat banget! Semangat terus ya',
      'Sudah istirahatkan mata sejenak belum? Coba lihat ke kejauhan sebentar',
      'Ada yang bisa kubantu dengan AI Hermes? Buka chat kapan saja ya',
      'Tarik napas dalam-dalam... hembuskan perlahan'
    ]
  },
  storage: {
    softCapMb: 1024,
    archiveUploads: true
  }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return structuredClone(DEFAULT_SETTINGS)
    const parsed = JSON.parse(raw)
    const merged = { ...structuredClone(DEFAULT_SETTINGS), ...parsed }
    merged.uiMode = merged.uiMode === 'advanced' ? 'advanced' : 'simple'
    if (!merged.characters || merged.characters.length === 0) {
      merged.characters = structuredClone(DEFAULT_SETTINGS.characters)
    } else {
      // Bersihkan model gina dan amier yang sebelumnya dicoba
      merged.characters = merged.characters.filter((c) => c.id !== 'gina-live2d' && c.id !== 'amier-live2d')
      const existingIds = new Set(merged.characters.map((c) => c.id))
      for (const defChar of DEFAULT_SETTINGS.characters) {
        if (!existingIds.has(defChar.id)) {
          merged.characters.push(structuredClone(defChar))
        }
      }
    }
    // Isi foto profil bawaan jika belum ada gambar
    merged.characters.forEach((c) => {
      if (!c.image) {
        const key = c.id.replace('-live2d', '')
        if (CHARACTER_THUMBS[key]) {
          c.image = CHARACTER_THUMBS[key]
        }
      }
    })
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
    merged.storage = {
      ...DEFAULT_SETTINGS.storage,
      ...(parsed.storage || {})
    }
    if (!Array.isArray(merged.idleReminder.lines) || merged.idleReminder.lines.length === 0) {
      merged.idleReminder.lines = [...DEFAULT_SETTINGS.idleReminder.lines]
    }
    if (Array.isArray(merged.llm?.providers)) {
      merged.llm.providers = merged.llm.providers.map((prov) => {
        if (!prov || typeof prov !== 'object') return prov
        const isGemini = String(prov.baseUrl || '').toLowerCase().includes('generativelanguage.googleapis.com')
        const mod = String(prov.model || '').replace(/^models\//i, '')
        if (isGemini && /^gemini-(?:1\.0|1\.5|2\.0|2\.5)-flash(?:-(?:exp|latest))?$/i.test(mod)) {
          return { ...prov, model: 'gemini-3.5-flash-lite' }
        }
        return prov
      })
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
