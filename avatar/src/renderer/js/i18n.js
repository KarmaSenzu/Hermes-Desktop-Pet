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
    'settings.language.en': 'English'
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
    'settings.language.en': 'English'
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
