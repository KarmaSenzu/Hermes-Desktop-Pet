/**
 * i18n.js — Internationalization (L10n) ringan untuk renderer.
 *
 * Desain:
 *  - `id` adalah bahasa sumber (canonical). `en` adalah terjemahan.
 *  - `t(key, vars)` mengambil string aktif + interpolasi `{var}`.
 *  - `setLocale(locale)` mengganti bahasa + menyiarkan perubahan (event lokal + storage lintas-window).
 *  - Dilengkapi helper `applyTranslations(root)` untuk patch DOM via atribut data-i18n.
 *
 * Modul ini diimpor oleh window avatar & settings (lewat chunk bersama Vite).
 */

export const SUPPORTED_LOCALES = ['id', 'en']
export const DEFAULT_LOCALE = 'id'
const LANG_KEY = 'hermes-avatar-language'

const DICT = {
  id: {
    // ── Common ──
    'common.save': 'Simpan',
    'common.cancel': 'Batal',
    'common.close': 'Tutup',
    'common.ok': 'Oke',
    'common.yes': 'Ya',
    'common.no': 'Tidak',
    'common.loading': 'Memuat…',
    'common.error': 'Terjadi kesalahan',
    'common.retry': 'Coba lagi',
    'common.search': 'Cari',
    // ── Avatar (bubble/speech) ──
    'avatar.welcome': 'Halo! Selamat datang di Hermes Desktop Pet',
    'avatar.music.playing': 'Memutar musik companion untukmu.',
    'avatar.music.playingSpeak': 'Memutar musik companion untukmu sekarang!',
    'avatar.voice.on': 'Suara diaktifkan 🔊',
    'avatar.voice.off': 'Suara dibisukan 🔇',
    'avatar.thinking': 'Hermes sedang bekerja…',
    'avatar.input.placeholder': 'Ketik pesan...',
    'avatar.app.notFound': 'Aplikasi {name} tidak cocok dengan daftar lokal.',
    // ── Idle chatter (health reminders) ──
    'avatar.idle.lines': [
      'Jangan lupa minum air putih ya 💧',
      'Postur tubuhnya ditegakkan dulu yuk, biar punggung tidak pegal 🧘',
      'Fokus kerja hebat banget! Semangat terus ya ✨',
      'Istirahatkan mata sebentar, lihat sesuatu yang jauh selama 20 detik 👀',
      'Sudah makan belum? Jangan sampai telat makan ya 🍚',
      'Tarik napas dalam-dalam, rileks sejenak 🌿'
    ],
    // ── Settings: language ──
    'settings.language.title': 'Bahasa Antarmuka',
    'settings.language.desc': 'Pilih bahasa tampilan aplikasi. Perubahan langsung diterapkan.',
    'settings.language.id': 'Bahasa Indonesia',
    'settings.language.en': 'English',
    // ── Nav / sidebar (selalu terlihat) ──
    'nav.home': 'Home',
    'nav.package': 'Package Hub',
    'nav.character': 'Karakter & Model',
    'nav.animation': 'Animasi & Emote',
    'nav.voice': 'Suara & TTS',
    'nav.llm': 'LLM & Provider',
    'nav.skill': 'Skill & Ekstensi',
    'nav.brain': 'Hermes Brain & Otomasi',
    'nav.storage': 'Penyimpanan',
    'nav.action': 'Perintah & App',
    'nav.shortcut': 'Shortcut Global',
    // ── Shell / chrome ──
    'shell.search': 'Cari',

    // ── Panel: Karakter ──
    'panel.character.title': 'Karakter',
    'panel.character.subtitle': 'Kelola & pilih avatar.',
    'panel.character.group.formats': 'Format yang Didukung',
    'common.back': 'Kembali',
    // ── Panel: Animasi ──
    'panel.animation.title': 'Animasi',
    'panel.animation.subtitle': 'Atur gaya avatar saat berpikir, memegang jam/timer, memproses, serta kelola animasi kustom.',
    'panel.animation.group.categories': 'Kategori Animasi & Pose',
    // ── Panel: Shortcut ──
    'panel.shortcut.title': 'Shortcut Global',
    'panel.shortcut.subtitle': 'Kombinasi tombol pintasan yang dapat ditekan di aplikasi manapun.',
    'panel.shortcut.group.list': 'Daftar Pintasan Keyboard',
    'panel.shortcut.hint': 'Shortcut global tetap aktif di latar belakang (background) saat Anda sedang membuka aplikasi lain.',
    // ── Panel: Perintah & App ──
    'panel.action.title': 'Perintah & Aplikasi',
    'panel.action.subtitle': 'Atur izin aksi sistem & integrasi peluncuran aplikasi lokal.',
    'panel.action.group.permissions': 'Hak Akses & Izin Sistem',
    'panel.action.hint': 'Aksi berisiko tinggi (terminal/shell) otomatis meminta dialog konfirmasi sebelum dijalankan.',
    'panel.action.group.apps': 'Aplikasi Lokal Terintegrasi',
    'panel.action.scan.title': 'Pindai Aplikasi Otomatis',
    'panel.action.scan.desc': 'Deteksi otomatis seluruh aplikasi terpasang (Windows / macOS / Linux)',
    'panel.action.scan.btn': 'Pindai Aplikasi',
    'panel.action.add.title': 'Tambah Aplikasi Manual',
    'panel.action.add.desc': 'Daftarkan file .exe, .lnk, atau .app aplikasi lokal',
    'panel.action.add.namePh': 'Nama aplikasi',
    'panel.action.add.pathPh': 'Path .exe / .lnk / .app',
    'panel.action.add.pick': 'Pilih…',
    'panel.action.add.btn': 'Tambah',
    'panel.action.group.registered': 'Daftar Aplikasi Terdaftar',
    // ── Panel: Penyimpanan ──
    'panel.storage.title': 'Penyimpanan',
    'panel.storage.subtitle': 'Lihat pemakaian ruang lokal sistem oleh obrolan, gambar, file lampiran, paket, dan cache Anda.',
    'panel.storage.scanning': 'Memindai penyimpanan lokal…',
    'panel.storage.calc': 'Menghitung rincian direktori...',
    'panel.storage.capLabel': 'Batas Pengingat:',
    'panel.storage.refresh': 'Segarkan',
    'panel.storage.archive': 'Arsipkan otomatis screenshot & file yang dijatuhkan ke avatar',
    'panel.storage.cleanCache': 'Bersihkan Cache & Log',
    'panel.storage.group.manage': 'Kelola penyimpanan',
    'panel.storage.manageHint': 'Klik kategori di bawah untuk melihat rincian isi folder, pratinjau gambar, atau mengosongkan ruang.',
    'panel.storage.group.engine': 'Engine & Runtime (Info Saja)',
    'panel.storage.backToStorage': 'Kembali ke Penyimpanan',
    'panel.storage.detailTitle': 'Rincian Kategori',
    // ── Panel: Skill ──
    'panel.skill.title': 'Skill & Ekstensi',
    'panel.skill.subtitle': 'Kelola kemampuan AI, alat bantu, dan integrasi Hermes.',
    'panel.skill.group.installed': 'Pustaka Skill Terpasang',
    'panel.skill.searchPh': 'Cari skill terpasang...',
    'panel.skill.reload': 'Muat Ulang',
    'panel.skill.reloadTitle': 'Muat ulang daftar skill dari disk',
    'panel.skill.group.install': 'Install Skill dari Hub Resmi',
    'panel.skill.idLabel': 'Skill Identifier',
    'panel.skill.idPh': 'official/research/...',
    'panel.skill.installBtn': 'Install Skill',
    'panel.skill.group.create': 'Buat / Unggah Skill Kustom (Opsional)',
    'panel.skill.create.title': 'Buat Skill Baru (Tulis SKILL.md / Upload)',
    'panel.skill.create.sub': 'Tambahkan instruksi AI, prompt kustom, atau file markdown sendiri',
    'panel.skill.name.label': 'Nama Skill',
    'panel.skill.name.desc': 'Identifier unik (huruf kecil & strip)',
    'panel.skill.name.ph': 'cth. my-custom-skill',
    'panel.skill.category.label': 'Kategori (Opsional)',
    'panel.skill.category.desc': 'Pengelompokan folder skill',
    'panel.skill.category.ph': 'cth. general / productivity',
    'panel.skill.content.label': 'Isi Instruksi (SKILL.md):',
    'panel.skill.content.ph': 'Tulis instruksi skill dan peran AI di sini...',
    'panel.skill.upload': 'Unggah File .md',
    'panel.skill.save': 'Simpan Skill ke Disk',
  },
  en: {
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.ok': 'OK',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.loading': 'Loading…',
    'common.error': 'Something went wrong',
    'common.retry': 'Retry',
    'common.search': 'Search',
    'avatar.welcome': 'Hi! Welcome to Hermes Desktop Pet 👋',
    'avatar.music.playing': 'Playing companion music for you.',
    'avatar.music.playingSpeak': 'Playing companion music for you now!',
    'avatar.voice.on': 'Sound on 🔊',
    'avatar.voice.off': 'Sound muted 🔇',
    'avatar.thinking': 'Hermes is working…',
    'avatar.input.placeholder': 'Type a message...',
    'avatar.app.notFound': 'App {name} does not match the local list.',
    'avatar.idle.lines': [
      "Don't forget to drink water 💧",
      'Straighten your posture, keep your back relaxed 🧘',
      'Great focus! Keep it up ✨',
      'Rest your eyes — look at something far for 20 seconds 👀',
      'Have you eaten? Try not to skip meals 🍚',
      'Take a deep breath and relax for a moment 🌿'
    ],
    'settings.language.title': 'Interface Language',
    'settings.language.desc': 'Choose the app display language. Changes apply instantly.',
    'settings.language.id': 'Bahasa Indonesia',
    'settings.language.en': 'English',
    'nav.home': 'Home',
    'nav.package': 'Package Hub',
    'nav.character': 'Characters & Models',
    'nav.animation': 'Animations & Emotes',
    'nav.voice': 'Voice & TTS',
    'nav.llm': 'LLM & Providers',
    'nav.skill': 'Skills & Extensions',
    'nav.brain': 'Hermes Brain & Automation',
    'nav.storage': 'Storage',
    'nav.action': 'Commands & Apps',
    'nav.shortcut': 'Global Shortcuts',
    'shell.search': 'Search',

    'panel.character.title': 'Characters',
    'panel.character.subtitle': 'Manage & choose avatars.',
    'panel.character.group.formats': 'Supported Formats',
    'common.back': 'Back',
    'panel.animation.title': 'Animations',
    'panel.animation.subtitle': 'Control how the avatar looks while thinking, holding a clock/timer, processing, and manage custom animations.',
    'panel.animation.group.categories': 'Animation Categories & Poses',
    'panel.shortcut.title': 'Global Shortcuts',
    'panel.shortcut.subtitle': 'Keyboard shortcuts you can press in any application.',
    'panel.shortcut.group.list': 'Keyboard Shortcut List',
    'panel.shortcut.hint': 'Global shortcuts stay active in the background while you are using other applications.',
    'panel.action.title': 'Commands & Applications',
    'panel.action.subtitle': 'Configure system action permissions & local app launch integration.',
    'panel.action.group.permissions': 'Access & System Permissions',
    'panel.action.hint': 'High-risk actions (terminal/shell) automatically request a confirmation dialog before running.',
    'panel.action.group.apps': 'Integrated Local Applications',
    'panel.action.scan.title': 'Scan Applications Automatically',
    'panel.action.scan.desc': 'Automatically detect all installed applications (Windows / macOS / Linux)',
    'panel.action.scan.btn': 'Scan Applications',
    'panel.action.add.title': 'Add Application Manually',
    'panel.action.add.desc': 'Register a local app .exe, .lnk, or .app file',
    'panel.action.add.namePh': 'Application name',
    'panel.action.add.pathPh': 'Path to .exe / .lnk / .app',
    'panel.action.add.pick': 'Choose…',
    'panel.action.add.btn': 'Add',
    'panel.action.group.registered': 'Registered Applications',
    'panel.storage.title': 'Storage',
    'panel.storage.subtitle': 'View local disk usage by your chats, images, attachments, packages, and cache.',
    'panel.storage.scanning': 'Scanning local storage…',
    'panel.storage.calc': 'Calculating directory details...',
    'panel.storage.capLabel': 'Reminder Cap:',
    'panel.storage.refresh': 'Refresh',
    'panel.storage.archive': 'Automatically archive screenshots & files dropped onto the avatar',
    'panel.storage.cleanCache': 'Clear Cache & Logs',
    'panel.storage.group.manage': 'Manage storage',
    'panel.storage.manageHint': 'Click a category below to view folder contents, preview images, or free up space.',
    'panel.storage.group.engine': 'Engine & Runtime (Info Only)',
    'panel.storage.backToStorage': 'Back to Storage',
    'panel.storage.detailTitle': 'Category Details',
    'panel.skill.title': 'Skills & Extensions',
    'panel.skill.subtitle': 'Manage AI capabilities, tools, and Hermes integrations.',
    'panel.skill.group.installed': 'Installed Skill Library',
    'panel.skill.searchPh': 'Search installed skills...',
    'panel.skill.reload': 'Reload',
    'panel.skill.reloadTitle': 'Reload the skill list from disk',
    'panel.skill.group.install': 'Install Skill from Official Hub',
    'panel.skill.idLabel': 'Skill Identifier',
    'panel.skill.idPh': 'official/research/...',
    'panel.skill.installBtn': 'Install Skill',
    'panel.skill.group.create': 'Create / Upload Custom Skill (Optional)',
    'panel.skill.create.title': 'Create New Skill (Write SKILL.md / Upload)',
    'panel.skill.create.sub': 'Add your own AI instructions, custom prompts, or markdown files',
    'panel.skill.name.label': 'Skill Name',
    'panel.skill.name.desc': 'Unique identifier (lowercase & dashes)',
    'panel.skill.name.ph': 'e.g. my-custom-skill',
    'panel.skill.category.label': 'Category (Optional)',
    'panel.skill.category.desc': 'Skill folder grouping',
    'panel.skill.category.ph': 'e.g. general / productivity',
    'panel.skill.content.label': 'Instruction Content (SKILL.md):',
    'panel.skill.content.ph': 'Write the skill instructions and AI role here...',
    'panel.skill.upload': 'Upload .md File',
    'panel.skill.save': 'Save Skill to Disk'
  }
}

let currentLocale = DEFAULT_LOCALE
const listeners = new Set()
const _anyHandlers = new Set()

function normalizeLocale(loc) {
  const l = String(loc || '').toLowerCase()
  if (l.startsWith('en')) return 'en'
  if (l.startsWith('id')) return 'id'
  return DEFAULT_LOCALE
}

export function getLocale() {
  return currentLocale
}

/** Interpolasi `{var}` dari objek vars. */
function interpolate(str, vars) {
  if (!vars) return str
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
}

/**
 * Terjemahkan key. Bila key tidak ada di locale aktif, fallback ke DEFAULT_LOCALE,
 * lalu ke key itu sendiri. Mendukung nilai array (mis. idle lines).
 */
export function t(key, vars) {
  const table = DICT[currentLocale] || DICT[DEFAULT_LOCALE]
  const base = DICT[DEFAULT_LOCALE]
  let val = table[key]
  if (val == null) val = base[key]
  if (val == null) return key
  if (Array.isArray(val)) return val.map((v) => interpolate(v, vars))
  return interpolate(val, vars)
}

export function tList(key) {
  const table = DICT[currentLocale] || DICT[DEFAULT_LOCALE]
  const val = table[key] || DICT[DEFAULT_LOCALE][key]
  return Array.isArray(val) ? val.slice() : []
}

/**
 * Ganti bahasa aktif. Menyimpan ke localStorage, mengatur <html lang>,
 * memberi tahu listener lokal dan mengirim event `storage` (lintas-window).
 */
export function setLocale(loc, { persist = true } = {}) {
  const next = normalizeLocale(loc)
  const changed = next !== currentLocale
  currentLocale = next
  try {
    document.documentElement.lang = next
  } catch { /* abaikan */ }
  if (persist) {
    try { localStorage.setItem(LANG_KEY, next) } catch { /* abaikan */ }
  }
  if (changed || persist) {
    for (const fn of listeners) {
      try { fn(next) } catch { /* abaikan */ }
    }
    for (const fn of _anyHandlers) {
      try { fn(next) } catch { /* abaikan */ }
    }
  }
  return next
}

/** Muat bahasa dari localStorage (boot). Tidak menimpa bila belum ada (default id). */
export function initLocale() {
  let loc = null
  try { loc = localStorage.getItem(LANG_KEY) } catch { /* abaikan */ }
  currentLocale = normalizeLocale(loc || DEFAULT_LOCALE)
  try { document.documentElement.lang = currentLocale } catch { /* abaikan */ }
  return currentLocale
}

/** Daftarkan listener perubahan bahasa. Kembalikan fungsi unsubscribe. */
export function onLocaleChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Terapkan terjemahan ke DOM: elemen dengan `data-i18n="key"` (textContent),
 *  `data-i18n-html="key"` (innerHTML), `data-i18n-attr="title|placeholder|aria-label:key"`. */
export function applyTranslations(root = document) {
  if (!root || !root.querySelectorAll) return
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const k = el.getAttribute('data-i18n')
    if (k) el.textContent = t(k)
  })
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const k = el.getAttribute('data-i18n-html')
    if (k) el.innerHTML = t(k)
  })
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    const spec = String(el.getAttribute('data-i18n-attr') || '')
    // format: "title:i18n.key" atau "title:i18n.key,placeholder:i18n.key2"
    for (const part of spec.split(',')) {
      const [attr, key] = part.split(':').map((s) => s.trim())
      if (attr && key) el.setAttribute(attr, t(key))
    }
  })
}

// Muat otomatis saat modul diimpor (aman di semua window renderer).
initLocale()

// Sinkronkan saat window lain mengganti bahasa (event storage lintas-window).
try {
  window.addEventListener('storage', (e) => {
    if (e.key !== LANG_KEY) return
    setLocale(e.newValue || DEFAULT_LOCALE, { persist: false })
  })
} catch { /* abaikan */ }
