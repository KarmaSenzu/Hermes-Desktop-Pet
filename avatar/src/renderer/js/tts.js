/**
 * tts.js
 * Text-to-Speech — memanggil main process via IPC.
 * Main process kini memakai endpoint /api/audio/speak milik Hermes (stabil),
 * dengan fallback msedge-tts. Renderer tinggal menangani dua bentuk respons:
 *   - { dataUrl }  → data:audio/mpeg;base64,.... (jalur Hermes)
 *   - { base64 }   → base64 mentah (fallback msedge-tts)
 */

const VOICE_DEFAULT = 'id-ID-GadisNeural'

/**
 * Generate audio untuk teks → kembalikan { buffer, mimeType }.
 * buffer adalah ArrayBuffer berisi audio (mp3).
 */
export async function synthesize(text, voice = VOICE_DEFAULT, options = {}) {
  const result = await window.hermesAvatar.synthesizeSpeech(text, voice, options)
  if (!result || !result.ok) throw new Error(result?.error || 'TTS gagal (tidak ada respons dari engine suara)')

  let base64 = result.base64 || ''
  let mimeType = result.mimeType || 'audio/mpeg'

  // Jalur Hermes/SAPI/Kokoro mengembalikan data URL lengkap. Ambil payload setelah koma
  // PERTAMA (hindari regex yang gagal bila payload kosong/berisi karakter khusus).
  if (!base64 && result.dataUrl) {
    const commaIdx = result.dataUrl.indexOf(',')
    const header = commaIdx >= 0 ? result.dataUrl.slice(0, commaIdx) : ''
    const payload = commaIdx >= 0 ? result.dataUrl.slice(commaIdx + 1) : ''
    if (header.startsWith('data:') && header.includes(';base64')) {
      const m = header.slice(5).split(';')[0]
      if (m) mimeType = m
      base64 = payload
    }
  }

  if (!base64 || !base64.trim()) {
    throw new Error(
      `TTS mengembalikan audio kosong (keys: ${Object.keys(result).join(', ') || '—'})`
    )
  }

  // base64 → ArrayBuffer (untuk decodeAudioData di audio-player).
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return {
    buffer: bytes.buffer,
    mimeType
  }
}
