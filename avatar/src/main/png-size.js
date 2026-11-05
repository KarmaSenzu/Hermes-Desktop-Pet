/**
 * png-size.js — Parser ukuran PNG langsung dari chunk IHDR tanpa dependensi eksternal.
 */

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

/**
 * Membaca dimensi { width, height } dari buffer header PNG (minimal 24 byte).
 * Mengembalikan null jika buffer tidak valid atau bukan PNG.
 *
 * @param {Buffer|Uint8Array} buffer
 * @returns {{ width: number, height: number } | null}
 */
export function readPngSize(buffer) {
  if (!buffer || buffer.length < 24) return null

  // Validasi 8-byte PNG signature
  for (let i = 0; i < 8; i++) {
    if (buffer[i] !== PNG_SIGNATURE[i]) return null
  }

  // Validasi chunk type IHDR (byte 12..15)
  const isIhdr =
    buffer[12] === 0x49 && // 'I'
    buffer[13] === 0x48 && // 'H'
    buffer[14] === 0x44 && // 'D'
    buffer[15] === 0x52    // 'R'
  if (!isIhdr) return null

  // Baca width & height (UInt32 Big Endian)
  const width = ((buffer[16] << 24) | (buffer[17] << 16) | (buffer[18] << 8) | buffer[19]) >>> 0
  const height = ((buffer[20] << 24) | (buffer[21] << 16) | (buffer[22] << 8) | buffer[23]) >>> 0

  if (width === 0 || height === 0) return null

  return { width, height }
}

/**
 * Menghitung estimasi memori tekstur GPU dalam MegaBytes (MB).
 * Rumus: Math.round(sum(w * h * 4) * 1.33 / 1048576)
 *
 * @param {Array<{ width: number, height: number }>} sizes
 * @returns {number}
 */
export function estimateTextureMB(sizes) {
  if (!Array.isArray(sizes) || sizes.length === 0) return 0

  let totalBytes = 0
  for (const s of sizes) {
    if (s && typeof s.width === 'number' && typeof s.height === 'number') {
      totalBytes += s.width * s.height * 4
    }
  }

  return Math.round((totalBytes * 1.33) / 1048576)
}
