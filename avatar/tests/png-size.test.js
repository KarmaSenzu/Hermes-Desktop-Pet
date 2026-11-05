import { describe, it, expect } from 'vitest'
import { readPngSize, estimateTextureMB } from '../src/main/png-size.js'

describe('png-size', () => {
  function makeMinimalPngHeader(width, height, validSignature = true) {
    const buf = Buffer.alloc(24)
    if (validSignature) {
      buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0)
    } else {
      buf.set([0, 0, 0, 0, 0, 0, 0, 0], 0)
    }
    // Chunk length 13
    buf.writeUInt32BE(13, 8)
    // Chunk type 'IHDR'
    buf.write('IHDR', 12, 'ascii')
    // Width & Height
    buf.writeUInt32BE(width, 16)
    buf.writeUInt32BE(height, 20)
    return buf
  }

  it('membaca buffer PNG minimal buatan (signature + IHDR 4096x4096) -> {4096, 4096}', () => {
    const buf = makeMinimalPngHeader(4096, 4096, true)
    const size = readPngSize(buf)
    expect(size).toEqual({ width: 4096, height: 4096 })
  })

  it('signature salah -> null', () => {
    const buf = makeMinimalPngHeader(4096, 4096, false)
    const size = readPngSize(buf)
    expect(size).toBeNull()

    // Buffer terlalu pendek (< 24 byte)
    expect(readPngSize(Buffer.alloc(10))).toBeNull()
    // Null/undefined input
    expect(readPngSize(null)).toBeNull()
  })

  it('estimasi 16 tekstur 4096 ≈ 1360 MB (toleransi 5%)', () => {
    const sizes = Array(16).fill({ width: 4096, height: 4096 })
    const estimate = estimateTextureMB(sizes)

    // Nilai eksak: 16 * 4096 * 4096 * 4 = 1,073,741,824 byte
    // 1,073,741,824 * 1.33 / 1048576 = 1361.92 -> Math.round -> 1362
    // Toleransi 5% dari 1360: [1292 .. 1428]
    expect(estimate).toBeGreaterThanOrEqual(1360 * 0.95)
    expect(estimate).toBeLessThanOrEqual(1360 * 1.05)
    expect(estimate).toBe(1362)
  })
})
