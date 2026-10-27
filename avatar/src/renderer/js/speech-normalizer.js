/**
 * speech-normalizer.js
 * Lapisan terpisah untuk mengubah teks display (Markdown) → teks yang
 * enak dibaca TTS (natural Indonesian speech).
 *
 * PRINSIP: jangan merusak teks display. Fungsi di sini hanya dipakai untuk TTS.
 * Teks display tetap pakai cleanText (di main.js) + Markdown render.
 */

/**
 * Konversi teks Markdown → teks natural untuk dibaca TTS.
 * - Hapus simbol markdown (#, **, `, ---, dll) tanpa hapus konten.
 * - Konversi heading/list → transisi natural.
 * - Ringkas code block (jangan baca per baris).
 * - Potong ke batas kalimat (bukan di tengah kata).
 */
export function toSpeechText(markdown, { maxChars = 500 } = {}) {
  if (!markdown) return ''

  let s = String(markdown)

  // 0. Assessment Card & placeholder -> jangan dibaca oleh TTS
  s = s.replace(/<assessment[\s\S]*?(?:<\/assessment>|$)/gi, '')
  s = s.replace(/@@@DYNAMICASSESSMENTCARD\d+@@@/g, '')
  s = s.replace(/%%DYNAMIC(?:<em>)?_?ASSESSMENT_?(?:<\/em>)?\d+%%/gi, '')

  // 1. Code block (fenced) → ringkas, jangan baca per baris.
  s = s.replace(/```[\s\S]*?```/g, ' [ada contoh kode di layar] ')
  // Inline code → hapus backtick (baca isinya).
  s = s.replace(/`([^`]*)`/g, '$1')

  // 2. Image → hapus (tidak dibaca).
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')

  // 3. Link → teks saja (bukan URL).
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  // URL mentah → ganti "link".
  s = s.replace(/https?:\/\/[^\s)]+/g, 'link')

  // 4. Horizontal separator → hapus.
  s = s.replace(/^[-\*_]{3,}\s*$/gm, '')

  // 5. Heading (#, ##, ###) → transisi natural.
  s = s.replace(/^#{1,6}\s+(.*)$/gm, '$1.')

  // 6. Bold & italic → hapus tanda (baca teksnya).
  s = s.replace(/(\*\*|__)(.*?)\1/g, '$2')
  s = s.replace(/(\*|_)(.*?)\1/g, '$2')

  // 7. Bullet list → transisi "lalu, ...".
  s = s.replace(/^\s*[-*+]\s+/gm, '')
  // 8. Numbered list → hapus angka.
  s = s.replace(/^\s*\d+[.)]\s+/gm, '')

  // 9. Bersihkan emoji & simbol grafis agar tidak dieja oleh TTS.
  s = s.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}\u{FE00}-\u{FE0F}]/gu, ' ')

  // 10. Ekspansi singkatan informal & bahasa percakapan Indonesia agar dibaca natural
  const ABBREVIATIONS = [
    [/\byg\b/gi, 'yang'],
    [/\bdgn\b/gi, 'dengan'],
    [/\butk\b/gi, 'untuk'],
    [/\btdk\b/gi, 'tidak'],
    [/\bsdh\b/gi, 'sudah'],
    [/\bbgt\b/gi, 'banget'],
    [/\bdll\.?/gi, 'dan lain-lain'],
    [/\bdsb\.?/gi, 'dan sebagainya'],
    [/\bdst\.?/gi, 'dan seterusnya'],
    [/\btsb\.?/gi, 'tersebut'],
    [/\bttg\b/gi, 'tentang'],
    [/\bkrn\b/gi, 'karena'],
    [/\bkalo\b|\bklo\b/gi, 'kalau'],
    [/\bgmn\b/gi, 'gimana'],
    [/\bpd\b/gi, 'pada'],
    [/\bgk\b|\bga\b|\bgak\b/gi, 'nggak']
  ]
  for (const [re, repl] of ABBREVIATIONS) {
    s = s.replace(re, repl)
  }

  // 11. Rapikan tanda baca berulang (... -> ., !!! -> !, ??? -> ?)
  s = s.replace(/\.{2,}/g, '.')
  s = s.replace(/!{2,}/g, '!')
  s = s.replace(/\?{2,}/g, '?')

  // 12. Rapatkan whitespace & bersihkan sisa tanda.
  s = s.replace(/\s+/g, ' ').trim()

  // 13. Potong ke batas kalimat (jangan di tengah kata).
  s = truncateToSentence(s, maxChars)

  return s
}

/**
 * Potong teks ke ~maxChars, tapi berhenti di akhir kalimat (titik/!/?).
 */
function truncateToSentence(text, maxChars) {
  if (text.length <= maxChars) return text
  const cut = text.slice(0, maxChars)
  const lastPunct = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'))
  if (lastPunct > maxChars * 0.5) {
    return cut.slice(0, lastPunct + 1).trim()
  }
  return cut.trimEnd() + '…'
}
