/**
 * emotion-detector.js — Deteksi emosi, pemetaan gesture, parsing tag, dan label tool
 */

/**
 * Mapping nama tool Hermes -> progress deskriptif (untuk bubble status).
 */
export function toolLabel(name) {
  const t = String(name || '').toLowerCase()
  const map = [
    [/browser_navigate|navigate/, 'Membuka halaman…'],
    [/browser_click|click/, 'Mengklik elemen…'],
    [/browser_type|type/, 'Mengetik di browser…'],
    [/browser_snapshot|snapshot/, 'Melihat halaman…'],
    [/browser_scroll|scroll/, 'Menggulir halaman…'],
    [/browser_console|browser_vision/, 'Menganalisis browser…'],
    [/tab/, 'Mengelola tab…'],
    [/browser/, 'Mengontrol browser…'],
    [/terminal|process|execute_code|shell/, 'Menjalankan terminal…'],
    [/ha_|homeassistant/, 'Mengontrol perangkat…'],
    [/read_file|search_files/, 'Membaca file…'],
    [/write_file|patch/, 'Menulis file…'],
    [/file/, 'Mengakses file…'],
    [/pdf/, 'Membaca dokumen PDF…'],
    [/weather|wttr|meteo/, 'Memeriksa cuaca…'],
    [/scrapling|scrape/, 'Mengekstrak web cepat…'],
    [/duckduckgo|ddgs/, 'Mencari di DuckDuckGo…'],
    [/memory|mnemosyne/, 'Mengingat…'],
    [/image_generate/, 'Membuat gambar…'],
    [/todo/, 'Mengatur tugas…'],
    [/web|search/, 'Mencari di web…'],
    [/project/, 'Mengelola proyek…']
  ]
  for (const [re, label] of map) {
    if (re.test(t)) return label
  }
  return 'Memproses…'
}

/**
 * Parse tag [affect:...] [gesture:...] [emotion:...] dari awal jawaban.
 */
export function parseTags(rawText) {
  const tags = { affect: null, gesture: null, emotion: null }
  const s = String(rawText || '')
  const mAffect = s.match(/\[affect:([a-zA-Z]+)\]/i)
  const mGesture = s.match(/\[gesture:([a-zA-Z]+)\]/i)
  const mEmotion = s.match(/\[emotion:([a-zA-Z]+)\]/i)
  if (mAffect) tags.affect = mAffect[1].toLowerCase()
  if (mGesture) tags.gesture = mGesture[1].toLowerCase()
  if (mEmotion) tags.emotion = mEmotion[1].toLowerCase()
  return tags
}

/**
 * Map gesture name -> emote procedural (bounce/jump/wave/nod).
 */
export function gestureToEmote(gesture) {
  const map = {
    bounce: 'bounce',
    jump: 'jump',
    wave: 'wave',
    nod: 'nod',
    bow: 'nod',
    shrug: 'jump',
    dance: 'bounce',
    clap: 'wave',
    wink: 'nod'
  }
  return map[gesture] || null
}

/**
 * Klasifikasi teks sederhana -> ekspresi (happy, sad, angry, neutral).
 */
export function detectEmotion(text) {
  const t = (text || '').toLowerCase()

  if (/(maaf|sedih|gagal|error|tidak bisa|maafkan|😢|😞)/.test(t)) {
    return 'sad'
  }
  if (/(hati-hati|jangan|awas|bahaya|⚠️)/.test(t)) {
    return 'angry'
  }
  if (/\b(terima kasih|thanks|mantap|bagus|hebat|oke|siap|berhasil|selamat|halo|hai|senang|bisa|tentu|sudah|ya|sama-sama|dengan senang hati)\b|[🎉😊👍]/.test(t)) {
    return 'happy'
  }
  if (/[!]{2,}|[?]{2,}/.test(text || '')) {
    return 'happy'
  }
  return 'neutral'
}

/**
 * Ringkasan teks jawaban untuk bubble di atas avatar.
 */
export function summaryText(text, max = 80) {
  const t = (text || '').trim()
  if (!t) return ''
  return t.length > max ? t.slice(0, max).trimEnd() + '…' : t
}
