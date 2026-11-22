import { describe, it, expect } from 'vitest'
import {
  resolveSafeCropRect,
  pickMatchingScreenSource
} from '../src/main/screen-capture-utils.js'

describe('screen-capture-utils', () => {
  describe('resolveSafeCropRect', () => {
    it('memetakan koordinat CSS secara proporsional pada layar 3440x1440 dan viewport height-1 (1439)', () => {
      // 719 * (1440/1439) = 719.4996 -> 719; 720 * (1440/1439) = 720.5003 -> 721 (menutup tepat sampai y=1440)
      const rect = resolveSafeCropRect(
        {
          cssX: 344,
          cssY: 719,
          cssWidth: 688,
          cssHeight: 720,
          viewportWidth: 3440,
          viewportHeight: 1439
        },
        { width: 3440, height: 1440 }
      )

      expect(rect).toEqual({
        x: 344,
        y: 719,
        width: 688,
        height: 721
      })
      expect(rect.y + rect.height).toBe(1440)
    })

    it('memetakan koordinat secara proporsional saat DPR 1.5 atau thumbnail fallback di-scale ke 1920x1080', () => {
      // DPR 1.5: CSS 1280x720 -> image 1920x1080
      const dprRect = resolveSafeCropRect(
        {
          cssX: 100,
          cssY: 200,
          cssWidth: 400,
          cssHeight: 300,
          viewportWidth: 1280,
          viewportHeight: 720
        },
        { width: 1920, height: 1080 }
      )
      expect(dprRect).toEqual({ x: 150, y: 300, width: 600, height: 450 })

      // Fallback thumbnail capped 1920x803 dari viewport 3440x1439
      const scaledRect = resolveSafeCropRect(
        {
          cssX: 1720,
          cssY: 0,
          cssWidth: 1720,
          cssHeight: 1439,
          viewportWidth: 3440,
          viewportHeight: 1439
        },
        { width: 1920, height: 803 }
      )
      expect(scaledRect).toEqual({ x: 960, y: 0, width: 960, height: 803 })
    })

    it('mendukung fallback x/y/width/height langsung saat viewport tidak tersedia', () => {
      const rect = resolveSafeCropRect(
        { x: 120, y: 80, width: 500, height: 400 },
        { width: 1920, height: 1080 }
      )
      expect(rect).toEqual({ x: 120, y: 80, width: 500, height: 400 })
    })

    it('meng-clamp koordinat negatif atau melebihi batas gambar secara aman', () => {
      const rect = resolveSafeCropRect(
        {
          cssX: -50,
          cssY: 2000,
          cssWidth: 5000,
          cssHeight: 900,
          viewportWidth: 1920,
          viewportHeight: 1080
        },
        { width: 1920, height: 1080 }
      )

      expect(rect).toEqual({
        x: 0,
        y: 1079,
        width: 1920,
        height: 1
      })
      expect(rect.x + rect.width).toBeLessThanOrEqual(1920)
      expect(rect.y + rect.height).toBeLessThanOrEqual(1080)
    })

    it('mengembalikan null untuk ukuran gambar kosong atau cropRect tidak valid', () => {
      expect(resolveSafeCropRect(null, { width: 1920, height: 1080 })).toBeNull()
      expect(resolveSafeCropRect({ x: 0, y: 0, width: 100, height: 100 }, { width: 0, height: 1080 })).toBeNull()
      expect(resolveSafeCropRect({ x: 0, y: 0, width: 100, height: 100 }, null)).toBeNull()
    })
  })

  describe('pickMatchingScreenSource', () => {
    const makeThumb = (empty) => ({ isEmpty: () => empty })

    it('memilih source screen yang display_id cocok dan thumbnail-nya tidak kosong', () => {
      const sources = [
        { id: 'window:10:0', display_id: '2', thumbnail: makeThumb(false) },
        { id: 'screen:0:0', display_id: '1', thumbnail: makeThumb(false) },
        { id: 'screen:1:0', display_id: '2', thumbnail: makeThumb(false) }
      ]
      const picked = pickMatchingScreenSource(sources, 2)
      expect(picked?.id).toBe('screen:1:0')
    })

    it('melewati source dengan thumbnail kosong dan fallback ke screen valid lain', () => {
      const sources = [
        { id: 'screen:1:0', display_id: '2', thumbnail: makeThumb(true) },
        { id: 'screen:0:0', display_id: '1', thumbnail: makeThumb(false) }
      ]
      const picked = pickMatchingScreenSource(sources, '2')
      expect(picked?.id).toBe('screen:0:0')
    })

    it('mengembalikan null untuk array kosong atau bukan array', () => {
      expect(pickMatchingScreenSource([], 1)).toBeNull()
      expect(pickMatchingScreenSource(null, 1)).toBeNull()
    })
  })
})
