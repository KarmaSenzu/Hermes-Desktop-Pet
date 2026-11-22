import { describe, it, expect } from 'vitest'
import { toSpeechText, splitSpeechChunks } from '../src/renderer/js/speech-normalizer.js'

describe('speech-normalizer', () => {
  describe('toSpeechText', () => {
    it('menghapus tag assessment, markdown, dan menormalisasi singkatan bahasa Indonesia', () => {
      const md = `## Ringkasan Sistem
Ini **penjelasan** singkat dgn *detail* utk kamu krn sdh selesai.
\`\`\`js
console.log('secret code');
\`\`\`
Lihat [dokumentasi](https://example.com) untuk info ttg fitur ini.
<assessment title="Opsi" prompt="Pilih:">
  <option id="1" title="1. Opsi A">Detail A</option>
</assessment>`

      const speech = toSpeechText(md, { maxChars: 600 })
      expect(speech).toContain('Ringkasan Sistem.')
      expect(speech).toContain('dengan detail untuk kamu karena sudah selesai.')
      expect(speech).toContain('[ada contoh kode di layar]')
      expect(speech).toContain('dokumentasi')
      expect(speech).not.toContain('https://example.com')
      expect(speech).not.toContain('<assessment')
      expect(speech).not.toContain('Opsi A')
      expect(speech).not.toContain('**')
    })

    it('memotong panjang teks dengan sopan di batas kalimat', () => {
      const long = 'Kalimat pertama cukup pendek. Kalimat kedua juga jelas. Kalimat ketiga agak panjang untuk menguji batas.'
      const clipped = toSpeechText(long, { maxChars: 60 })
      expect(clipped.length).toBeLessThanOrEqual(60)
      expect(clipped.endsWith('.')).toBe(true)
    })
  })

  describe('splitSpeechChunks', () => {
    it('mengembalikan array kosong untuk input kosong atau whitespace', () => {
      expect(splitSpeechChunks('')).toEqual([])
      expect(splitSpeechChunks('   \n  ')).toEqual([])
      expect(splitSpeechChunks(null)).toEqual([])
    })

    it('menjaga teks singkat tetap menjadi satu chunk utuh', () => {
      expect(splitSpeechChunks('Halo, selamat pagi!')).toEqual(['Halo, selamat pagi!'])
    })

    it('memecah teks panjang (>1000 karakter) per kalimat <= maxChunkChars tanpa membuangnya', () => {
      const sentences = Array.from({ length: 18 }, (_, i) => `Kalimat nomor ${i + 1} menjelaskan rincian sistem desktop avatar secara utuh dan alami.`)
      const text = sentences.join(' ')
      expect(text.length).toBeGreaterThan(1200)

      const chunks = splitSpeechChunks(text, { maxChunkChars: 200, maxTotalChars: 1800 })
      expect(chunks.length).toBeGreaterThan(5)
      for (const ch of chunks) {
        expect(ch.length).toBeLessThanOrEqual(200)
        expect(ch.length).toBeGreaterThan(0)
      }
      const rejoined = chunks.join(' ')
      expect(rejoined).toContain('Kalimat nomor 1 ')
      expect(rejoined).toContain('Kalimat nomor 16 ')
    })

    it('memecah satu kalimat sangat panjang pada koma atau batas kata', () => {
      const oneLongSentence =
        'Komponen pertama mengatur antarmuka visual karakter desktop, ' +
        'komponen kedua mengelola aliran audio suara secara paralel, ' +
        'komponen ketiga menyinkronkan percakapan latar belakang dengan aman, ' +
        'dan komponen keempat memastikan memori tetap ringan sepanjang waktu.'

      const chunks = splitSpeechChunks(oneLongSentence, { maxChunkChars: 140, maxTotalChars: 1800 })
      expect(chunks.length).toBeGreaterThanOrEqual(2)
      for (const ch of chunks) {
        expect(ch.length).toBeLessThanOrEqual(140)
      }
    })
  })
})
