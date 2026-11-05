import { describe, it, expect } from 'vitest'
import {
  toolLabel,
  parseTags,
  gestureToEmote,
  detectEmotion,
  summaryText
} from '../src/renderer/js/emotion-detector.js'

describe('emotion-detector', () => {
  describe('detectEmotion', () => {
    it('detects happy emotion from praise and gratitude', () => {
      expect(detectEmotion('Terima kasih banyak atas bantuannya!')).toBe('happy')
      expect(detectEmotion('Wah hebat sekali hasilnya!')).toBe('happy')
      expect(detectEmotion('Bagus banget!')).toBe('happy')
    })

    it('detects sad emotion from apologetic or error text', () => {
      expect(detectEmotion('Maaf, saya gagal menjalankan proses')).toBe('sad')
      expect(detectEmotion('Terjadi error saat memuat file')).toBe('sad')
    })

    it('detects angry emotion from warning words', () => {
      expect(detectEmotion('Hati-hati jangan diubah')).toBe('angry')
      expect(detectEmotion('Awas bahaya listrik')).toBe('angry')
    })

    it('defaults to neutral when no matching emotion', () => {
      expect(detectEmotion('Saya sedang membaca dokumen ini.')).toBe('neutral')
      expect(detectEmotion('')).toBe('neutral')
    })
  })

  describe('parseTags', () => {
    it('extracts affect, gesture, and emotion tags', () => {
      const text = '[affect:positive] [gesture:wave] [emotion:joy] Halo kawan!'
      const tags = parseTags(text)
      expect(tags.affect).toBe('positive')
      expect(tags.gesture).toBe('wave')
      expect(tags.emotion).toBe('joy')
    })

    it('returns nulls when tags are not present', () => {
      const tags = parseTags('Halo biasa tanpa tag')
      expect(tags.affect).toBeNull()
      expect(tags.gesture).toBeNull()
      expect(tags.emotion).toBeNull()
    })
  })

  describe('gestureToEmote', () => {
    it('maps known gestures to emotes', () => {
      expect(gestureToEmote('wave')).toBe('wave')
      expect(gestureToEmote('bounce')).toBe('bounce')
      expect(gestureToEmote('jump')).toBe('jump')
      expect(gestureToEmote('bow')).toBe('nod')
      expect(gestureToEmote('wink')).toBe('nod')
    })

    it('returns null for unknown gestures', () => {
      expect(gestureToEmote('fly')).toBeNull()
      expect(gestureToEmote(null)).toBeNull()
    })
  })

  describe('toolLabel', () => {
    it('maps tool names to descriptive labels', () => {
      expect(toolLabel('browser_navigate')).toBe('Membuka halaman…')
      expect(toolLabel('terminal')).toBe('Menjalankan terminal…')
      expect(toolLabel('read_file')).toBe('Membaca file…')
      expect(toolLabel('write_file')).toBe('Menulis file…')
      expect(toolLabel('weather_jakarta')).toBe('Memeriksa cuaca…')
      expect(toolLabel('unknown_custom_tool')).toBe('Memproses…')
    })
  })

  describe('summaryText', () => {
    it('truncates long text and adds ellipsis', () => {
      const long = 'A'.repeat(100)
      const res = summaryText(long, 80)
      expect(res.length).toBe(81) // 80 + '…'
      expect(res.endsWith('…')).toBe(true)
    })

    it('leaves short text untouched', () => {
      expect(summaryText('Halo dunia')).toBe('Halo dunia')
    })

    it('handles empty input safely', () => {
      expect(summaryText('')).toBe('')
      expect(summaryText(null)).toBe('')
    })
  })
})
