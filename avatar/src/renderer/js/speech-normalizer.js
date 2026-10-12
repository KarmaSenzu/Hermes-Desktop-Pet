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

  // 9. Rapatkan whitespace & bersihkan sisa tanda.
  s = s.replace(/\s+/g, ' ').trim()

  // 10. Potong ke batas kalimat (jangan di tengah kata).
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
