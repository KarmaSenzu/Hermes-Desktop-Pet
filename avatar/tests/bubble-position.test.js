import { describe, it, expect } from 'vitest'
import { computeHeadBubblePosition, getDefaultAvatarBounds } from '../src/renderer/js/bubble-position.js'

describe('bubble-position', () => {
  it('memusatkan bubble tepat di atas kepala avatar pada berbagai posisi layar', () => {
    const screenW = 1920
    const screenH = 1080

    // Avatar di sisi kiri layar
    const leftPos = computeHeadBubblePosition({
      bounds: { centerX: 300, top: 420 },
      bubbleW: 200,
      bubbleH: 36,
      screenW,
      screenH,
      margin: 16,
      headGap: 12
    })
    expect(leftPos).toEqual({ left: 200, top: 372 })

    // Avatar di sisi tengah layar
    const midPos = computeHeadBubblePosition({
      bounds: { centerX: 960, top: 300 },
      bubbleW: 220,
      bubbleH: 40,
      screenW,
      screenH,
      margin: 16,
      headGap: 12
    })
    expect(midPos).toEqual({ left: 850, top: 248 })

    // Avatar di sisi kanan layar
    const rightPos = computeHeadBubblePosition({
      bounds: { centerX: 1650, top: 500 },
      bubbleW: 240,
      bubbleH: 36,
      screenW,
      screenH,
      margin: 16,
      headGap: 12
    })
    expect(rightPos).toEqual({ left: 1530, top: 452 })
  })

  it('menjaga posisi bubble tetap di dalam viewport saat avatar dekat tepi kiri atau kanan', () => {
    const screenW = 1440
    const screenH = 900

    const nearLeft = computeHeadBubblePosition({
      bounds: { centerX: 40, top: 350 },
      bubbleW: 220,
      bubbleH: 36,
      screenW,
      screenH,
      margin: 16
    })
    expect(nearLeft.left).toBe(16)

    const nearRight = computeHeadBubblePosition({
      bounds: { centerX: 1410, top: 350 },
      bubbleW: 220,
      bubbleH: 36,
      screenW,
      screenH,
      margin: 16
    })
    expect(nearRight.left).toBe(1440 - 220 - 16)
  })

  it('melakukan fallback ke dalam area aman jika kepala avatar terlalu dekat dengan tepi atas layar', () => {
    const pos = computeHeadBubblePosition({
      bounds: { centerX: 700, top: 18 },
      bubbleW: 200,
      bubbleH: 40,
      screenW: 1280,
      screenH: 720,
      margin: 16,
      headGap: 14
    })
    expect(pos.top).toBe(46)
    expect(pos.top).toBeGreaterThanOrEqual(16)
  })

  it('menumpuk status bubble tepat di atas speech bubble tanpa saling menimpa', () => {
    const avoidRect = { left: 800, right: 1040, top: 220, bottom: 280, width: 240, height: 60 }
    const pos = computeHeadBubblePosition({
      bounds: { centerX: 920, top: 296 },
      bubbleW: 210,
      bubbleH: 34,
      screenW: 1920,
      screenH: 1080,
      margin: 16,
      avoidRect,
      stackGap: 8
    })
    expect(pos.left).toBe(815)
    expect(pos.top).toBe(178)
    expect(pos.top + 34).toBeLessThanOrEqual(avoidRect.top)
  })

  it('menempatkan status bubble di bawah avoidRect jika ruang atas tidak mencukupi', () => {
    const avoidRect = { left: 700, right: 940, top: 24, bottom: 84, width: 240, height: 60 }
    const pos = computeHeadBubblePosition({
      bounds: { centerX: 820, top: 20 },
      bubbleW: 200,
      bubbleH: 34,
      screenW: 1440,
      screenH: 900,
      margin: 16,
      avoidRect,
      stackGap: 8
    })
    expect(pos.top).toBe(92)
    expect(pos.top).toBeGreaterThanOrEqual(avoidRect.bottom + 8)
  })

  it('getDefaultAvatarBounds menghasilkan area terpusat yang valid dalam viewport', () => {
    const bounds = getDefaultAvatarBounds(1440, 900)
    expect(bounds.centerX).toBe(720)
    expect(bounds.left).toBeGreaterThan(0)
    expect(bounds.right).toBeLessThan(1440)
    expect(bounds.top).toBeGreaterThanOrEqual(48)
    expect(bounds.bottom).toBeLessThan(900)
  })
})
