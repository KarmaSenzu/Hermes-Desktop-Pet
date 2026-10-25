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
  if (!result.ok) throw new Error(result.error || 'TTS gagal')

  let base64 = result.base64 || ''
  let mimeType = result.mimeType || 'audio/mpeg'

  // Jalur Hermes mengembalikan data URL lengkap.
  if (result.dataUrl) {
    const match = result.dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (match) {
      mimeType = match[1] || mimeType
      base64 = match[2] || ''
    }
  }

  if (!base64) throw new Error('TTS mengembalikan audio kosong')

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
