/**
 * voice-manager.js
 * Memutar audio statis (.wav) dari aset referensi untuk state non-dialog
 * (welcome, idle, sleep, angry, touch/klik, bye, visit).
 *
 * Percakapan dinamis utama tetap ditangani oleh TTS Hermes (Edge TTS).
 */

const STATE_AUDIO_MAP = {
  welcome: ['welcome_1.wav'],
  intro:   ['intro_1.wav', 'intro_2.wav', 'intro_3.wav', 'intro_4.wav'],
  idle:    ['idle_1.wav', 'idle_2.wav', 'idle_3.wav', 'idle_4.wav', 'idle_5.wav'],
  sleep:   ['sleep_1.wav'],
  angry:   ['angry_1.wav'],
  bye:     ['bye_1.wav'],
  visit:   ['visit_1.wav'],
  touch:   ['multi_1.wav', 'multi_2.wav', 'multi_3.wav']
}

export class VoiceManager {
  constructor() {
    this.currentAudio = null
    this.isPlaying = false
    this.audioBaseDir = null
    this.audioPlayer = null
  }

  setAudioPlayer(player) {
    this.audioPlayer = player
  }

  /**
   * Set base directory audio atau biarkan resolve via model:// URL
   */
  async init() {
    try {
      const defaultModel = await window.hermesAvatar.getDefaultModelPath()
      // Path model: .../assets/live2d/mother/20250106.model3.json
      // Path audio: .../assets/audio/mother/
      const normalized = (defaultModel || '').replace(/\\/g, '/')
      const assetsIndex = normalized.lastIndexOf('/assets/')
      if (assetsIndex !== -1) {
        this.audioBaseDir = normalized.slice(0, assetsIndex) + '/assets/audio/mother'
      }
    } catch (e) {
      console.warn('[voice-manager] init fallback:', e)
    }
  }

  /**
   * Putar audio statis berdasarkan nama state.
   */
  async playStateVoice(state) {
    const list = STATE_AUDIO_MAP[state]
    if (!list || list.length === 0) return

    const file = list[Math.floor(Math.random() * list.length)]
    if (!this.audioBaseDir) {
      await this.init()
    }

    const candidatePaths = [
      this.audioBaseDir ? `${this.audioBaseDir}/${file}` : null,
      `assets/audio/mother/${file}`
    ].filter(Boolean)

    for (const filePath of candidatePaths) {
      try {
        if (this.audioPlayer) {
          const res = await window.hermesAvatar?.readModel?.(filePath)
          if (res && res.ok && res.base64) {
            const binaryString = atob(res.base64)
            const len = binaryString.length
            const bytes = new Uint8Array(len)
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i)
            }
            this.isPlaying = true
            await this.audioPlayer.play(bytes.buffer)
            this.isPlaying = false
            return
          }
        }

        // Fallback HTML5 Audio jika audioPlayer belum siap
        const url = await window.hermesAvatar?.getModelUrl?.(filePath)
        if (url) {
          this.stop()
          const audio = new Audio(url)
          this.currentAudio = audio
          this.isPlaying = true

          audio.onended = () => {
            this.isPlaying = false
            this.currentAudio = null
          }
          audio.onerror = (e) => {
            console.warn(`[voice-manager] Gagal memutar audio ${file}:`, e)
            this.isPlaying = false
            this.currentAudio = null
          }

          await audio.play()
          return
        }
      } catch (err) {
        console.warn(`[voice-manager] Gagal coba putar ${filePath}:`, err)
      }
    }
  }

  stop() {
    if (this.audioPlayer) {
      try {
        this.audioPlayer.stop()
      } catch {}
    }
    if (this.currentAudio) {
      this.currentAudio.pause()
      this.currentAudio.currentTime = 0
      this.currentAudio = null
    }
    this.isPlaying = false
  }
}

export const voiceManager = new VoiceManager()
