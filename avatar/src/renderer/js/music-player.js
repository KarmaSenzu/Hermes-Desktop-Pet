/**
 * MusicPlayer - Pemutar Musik & Lofi Companion ala Spotify Mini
 * Mendukung:
 * 1. Audio Lokal (.mp3, .wav, .ogg, .flac, .m4a) via model:// protocol
 * 2. YouTube Music / Video Links (https://youtube.com/watch?v=... / youtu.be/...) via YouTube IFrame Audio Embed
 * 3. Radio Streaming Online 24/7 (Live Lofi, Vaporwave, Ambient)
 * 4. Procedural Lofi Synthesizer bawaan (Web Audio API murni)
 * 5. Audio Ducking cerdas saat Hermes berbicara
 * 6. Pencarian real-time & Playlist Kategori
 */

import { renderIcon } from './icons.js'

// Preset Lagu Bawaan (Procedural Ambient Lofi - Langsung Putar Offline)
const BUILTIN_TRACKS = [
  {
    id: 'builtin-1',
    title: 'Cozy Rain & Warm Rhodes',
    artist: 'Hermes Chill Beats',
    category: 'focus',
    badge: 'Fokus',
    duration: 180,
    type: 'procedural',
    preset: 'cozy_rhodes'
  },
  {
    id: 'builtin-2',
    title: 'Midnight Study in Shibuya',
    artist: 'Tokyo Lofi Sessions',
    category: 'chill',
    badge: 'Santai',
    duration: 210,
    type: 'procedural',
    preset: 'shibuya_night'
  },
  {
    id: 'builtin-3',
    title: 'Cafe Latte Afternoon',
    artist: 'Hermes Companion',
    category: 'focus',
    badge: 'Fokus',
    duration: 195,
    type: 'procedural',
    preset: 'cafe_latte'
  },
  {
    id: 'builtin-4',
    title: 'Deep Focus Space Ambient',
    artist: 'Zenith Ambient Labs',
    category: 'focus',
    badge: 'Fokus',
    duration: 240,
    type: 'procedural',
    preset: 'space_ambient'
  },
  {
    id: 'builtin-5',
    title: 'Sakura Breeze Chillhop',
    artist: 'Akihiro & Hermes',
    category: 'chill',
    badge: 'Santai',
    duration: 175,
    type: 'procedural',
    preset: 'sakura_breeze'
  }
]

// Stasiun Radio & Lofi Stream 24/7 via direct HTTPS audio (kompatibel penuh dengan CSP media-src tanpa iframe YouTube)
const ONLINE_CURATED_STATIONS = [
  {
    id: 'online-stream-1',
    title: 'Nightwave Plaza — Vaporwave & City Pop',
    artist: 'Plaza One Radio',
    category: 'online',
    badge: 'Live 24/7',
    duration: 0,
    type: 'stream',
    url: 'https://radio.plaza.one/mp3'
  },
  {
    id: 'online-stream-2',
    title: 'SomaFM Groove Salad — Downtempo Chill',
    artist: 'SomaFM Ambient Beats',
    category: 'online',
    badge: 'Live 24/7',
    duration: 0,
    type: 'stream',
    url: 'https://ice2.somafm.com/groovesalad-128-mp3'
  },
  {
    id: 'online-stream-3',
    title: 'SomaFM Lush — Chillout & Vocals',
    artist: 'SomaFM Relax Lounge',
    category: 'online',
    badge: 'Live 24/7',
    duration: 0,
    type: 'stream',
    url: 'https://ice2.somafm.com/lush-128-mp3'
  },
  {
    id: 'online-stream-4',
    title: 'SomaFM DEF CON Radio — Coding & Focus',
    artist: 'SomaFM Synth & Electronic',
    category: 'online',
    badge: 'Live 24/7',
    duration: 0,
    type: 'stream',
    url: 'https://ice2.somafm.com/defcon-128-mp3'
  },
  {
    id: 'online-stream-5',
    title: 'Deep Focus Space Drone',
    artist: 'SomaFM Drone Zone',
    category: 'online',
    badge: 'Live 24/7',
    duration: 0,
    type: 'stream',
    url: 'https://ice4.somafm.com/dronezone-128-mp3'
  }
]

/**
 * Ekstraksi ID Video dari berbagai format URL YouTube:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - https://music.youtube.com/watch?v=VIDEO_ID
 */
export function extractYouTubeVideoId(url) {
  if (!url || typeof url !== 'string') return null
  const regExp = /(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/|live\/)|youtu\.be\/|music\.youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/i
  const match = url.match(regExp)
  return match ? match[1] : null
}

/**
 * Mengambil metadata resmi judul dan artis YouTube melalui Main Process (bebas blokir CSP)
 */
export async function fetchYouTubeInfo(videoId) {
  if (!videoId) return null
  try {
    if (typeof window?.hermesAvatar?.resolveMusicStream === 'function') {
      const res = await window.hermesAvatar.resolveMusicStream({ videoId })
      if (res && (res.title || res.artist)) {
        return {
          title: res.title || 'YouTube Audio',
          artist: res.artist || 'YouTube Creator',
          duration: Number(res.duration || 0),
          thumbnail: res.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
        }
      }
    }
  } catch (err) {
    console.warn('[YouTube Info] Gagal resolve via main process:', err)
  }
  return {
    title: 'YouTube Audio',
    artist: 'YouTube',
    duration: 0,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  }
}

function escapeMusicHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Procedural Lofi Synthesizer (Web Audio API murni)
 */
class ProceduralLofiEngine {
  constructor(audioCtx, destinationNode) {
    this.ctx = audioCtx
    this.dest = destinationNode
    this.isPlaying = false
    this.currentPreset = 'cozy_rhodes'
    this.timer = null
    this.step = 0
    this.noiseNode = null
  }

  getChordNotes(preset, step) {
    const progressions = {
      cozy_rhodes: [
        [146.83, 220.0, 261.63, 329.63, 392.0],
        [98.0, 196.0, 246.94, 329.63, 440.0],
        [130.81, 196.0, 246.94, 329.63, 392.0],
        [110.0, 220.0, 261.63, 329.63, 392.0]
      ],
      shibuya_night: [
        [174.61, 261.63, 329.63, 392.0, 523.25],
        [164.81, 246.94, 293.66, 392.0, 493.88],
        [146.83, 220.0, 261.63, 349.23, 440.0],
        [130.81, 196.0, 246.94, 329.63, 392.0]
      ],
      cafe_latte: [
        [110.0, 220.0, 261.63, 329.63, 493.88],
        [146.83, 220.0, 277.18, 369.99, 440.0],
        [98.0, 196.0, 246.94, 293.66, 392.0],
        [164.81, 246.94, 311.13, 392.0, 466.16]
      ],
      space_ambient: [
        [130.81, 196.0, 293.66, 369.99, 440.0],
        [146.83, 220.0, 329.63, 440.0, 587.33],
        [174.61, 261.63, 349.23, 440.0, 523.25],
        [110.0, 164.81, 246.94, 329.63, 440.0]
      ],
      sakura_breeze: [
        [220.0, 261.63, 329.63, 440.0, 493.88],
        [196.0, 246.94, 293.66, 392.0, 440.0],
        [174.61, 220.0, 261.63, 349.23, 392.0],
        [164.81, 196.0, 246.94, 329.63, 440.0]
      ]
    }
    const prog = progressions[preset] || progressions.cozy_rhodes
    return prog[step % prog.length]
  }

  start(preset = 'cozy_rhodes') {
    this.stop()
    this.isPlaying = true
    this.currentPreset = preset
    this.step = 0
    this.startVinylNoise()
    this.scheduleNextChord()
  }

  startVinylNoise() {
    try {
      const bufferSize = this.ctx.sampleRate * 2
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
      const output = noiseBuffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1
        const crackle = Math.random() > 0.998 ? (Math.random() * 2 - 1) * 3 : 0
        output[i] = (white * 0.15 + crackle) * 0.08
      }

      const whiteNoise = this.ctx.createBufferSource()
      whiteNoise.buffer = noiseBuffer
      whiteNoise.loop = true

      const filter = this.ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 1200
      filter.Q.value = 1.0

      const noiseGain = this.ctx.createGain()
      noiseGain.gain.value = 0.08

      whiteNoise.connect(filter)
      filter.connect(noiseGain)
      noiseGain.connect(this.dest)

      whiteNoise.start(0)
      this.noiseNode = { source: whiteNoise, gain: noiseGain }
    } catch (err) {
      console.warn('[LofiSynth] Vinyl noise init skip:', err)
    }
  }

  scheduleNextChord() {
    if (!this.isPlaying) return

    const notes = this.getChordNotes(this.currentPreset, this.step)
    const now = this.ctx.currentTime

    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(850, now)
    filter.Q.setValueAtTime(1.2, now)

    const chordGain = this.ctx.createGain()
    chordGain.gain.setValueAtTime(0.001, now)
    chordGain.gain.linearRampToValueAtTime(0.18, now + 0.18)
    chordGain.gain.exponentialRampToValueAtTime(0.04, now + 2.4)
    chordGain.gain.linearRampToValueAtTime(0.0001, now + 3.1)

    filter.connect(chordGain)
    chordGain.connect(this.dest)

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator()
      const isBass = idx === 0
      osc.type = isBass ? 'triangle' : 'sine'
      osc.frequency.setValueAtTime(freq, now)

      const detune = (Math.random() - 0.5) * 6
      osc.detune.setValueAtTime(detune, now)

      osc.connect(filter)
      osc.start(now)
      osc.stop(now + 3.2)
    })

    if (this.step % 2 === 1) {
      const melodyFreq = notes[notes.length - 1] * (Math.random() > 0.5 ? 1.5 : 1.25)
      const melOsc = this.ctx.createOscillator()
      melOsc.type = 'sine'
      melOsc.frequency.setValueAtTime(melodyFreq, now + 0.8)

      const melGain = this.ctx.createGain()
      melGain.gain.setValueAtTime(0.0001, now + 0.8)
      melGain.gain.linearRampToValueAtTime(0.08, now + 0.95)
      melGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.0)

      melOsc.connect(melGain)
      melGain.connect(this.dest)
      melOsc.start(now + 0.8)
      melOsc.stop(now + 2.1)
    }

    this.step++
    this.timer = setTimeout(() => {
      this.scheduleNextChord()
    }, 3000)
  }

  stop() {
    this.isPlaying = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.noiseNode) {
      try {
        this.noiseNode.source.stop()
        this.noiseNode.source.disconnect()
      } catch {}
      this.noiseNode = null
    }
  }
}

/**
 * Main MusicPlayer Controller
 */
export class MusicPlayer {
  constructor() {
    this.audioCtx = null
    this.masterGain = null
    this.duckGain = null
    this.lofiEngine = null

    // HTML5 Audio untuk file lokal & direct audio streams
    this.htmlAudio = new Audio()
    this.htmlAudio.preload = 'metadata'

    // YouTube IFrame Player
    this.ytPlayer = null
    this.ytReady = false
    this._ytApiRequested = false
    this.ytProgressTimer = null

    this.tracks = [...BUILTIN_TRACKS, ...ONLINE_CURATED_STATIONS]
    this.onlineTracks = []
    this.localTracks = []
    this.favorites = new Set()
    this.currentTrackIndex = 0
    this.isPlaying = false
    this.isDucked = false
    this.volume = 0.7
    this.isMuted = false
    this.prevVolume = 0.7
    this.isShuffle = false
    this.repeatMode = 'all'
    this.currentCategory = 'all'
    this.searchQuery = ''
    this.proceduralElapsedSeconds = 0
    this.proceduralInterval = null
    this._consecutiveAudioErrors = 0
    this.waitingForNetwork = false
    this._pendingNetworkJob = null
    this._networkRetryTimer = null
    this._activePlaybackEngine = 'none'
    this._bgStatusTimer = null
    this._cachedTrackIds = new Set()
    this._downloadingTrackIds = new Set()

    this.loadPersistedData()
    this.dom = {}
  }

  init() {
    this.cacheDom()
    // Pastikan panel musik tertutup dan status playback mati saat inisialisasi awal
    if (this.dom.panel) {
      this.dom.panel.hidden = true
    }
    this.isPlaying = false
    this.pause()
    this.bindEvents()
    this.renderTracklist()
    this.updateCurrentTrackDisplay()
    this.loadLibraryFromDisk().then(() => {
      this.checkAllCachedTracks()
    })
    this.listenToExternalUpdates()

    window.addEventListener('online', () => {
      this.tryResumeFromNetwork()
      this.refreshPendingMetadata()
    })
    window.addEventListener('offline', () => {
      if (this.isPlaying && this.getCurrentTrack()?.type !== 'procedural' && this.getCurrentTrack()?.type !== 'local') {
        this.onNetworkLost()
      }
    })
  }

  initYouTubeApi() {
    // Muat script YouTube IFrame Player API secara dinamis jika belum ada
    if (!window.YT) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      const firstScriptTag = document.getElementsByTagName('script')[0]
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag)
    }

    const onReady = () => {
      this.ytReady = true
    }

    if (window.onYouTubeIframeAPIReady) {
      const oldReady = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        oldReady()
        onReady()
      }
    } else {
      window.onYouTubeIframeAPIReady = onReady
    }
  }

  ensureYouTubePlayer(onReadyCb, attempt = 0) {
    if (this.ytPlayer) {
      if (this.ytReady) {
        onReadyCb?.()
      }
      return
    }

    if (!this._ytApiRequested) {
      this._ytApiRequested = true
      this.initYouTubeApi()
    }

    if (!window.YT || !window.YT.Player) {
      if (attempt >= 20) {
        console.warn('[YouTube Player] YouTube IFrame API tidak tersedia (diblokir CSP atau offline)')
        return
      }
      setTimeout(() => this.ensureYouTubePlayer(onReadyCb, attempt + 1), 300)
      return
    }

    this.ytPlayer = new window.YT.Player('youtube-player-element', {
      height: '200',
      width: '200',
      playerVars: {
        playsinline: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        rel: 0,
        autoplay: 0,
        origin: window.location.origin || 'http://localhost'
      },
      events: {
        onReady: () => {
          this.ytReady = true
          this.ytPlayer.setVolume(this.volume * 100)
          onReadyCb?.()
        },
        onStateChange: (event) => {
          if (this.getCurrentTrack()?.type !== 'youtube') return
          // YT.PlayerState: PLAYING = 1, PAUSED = 2, ENDED = 0, BUFFERING = 3
          if (event.data === 1) {
            this.isPlaying = true
            this.updatePlayStateUi(true)
            this.startYouTubeProgressTracker()
          } else if (event.data === 2) {
            this.isPlaying = false
            this.updatePlayStateUi(false)
            this.stopYouTubeProgressTracker()
          } else if (event.data === 0) {
            this.stopYouTubeProgressTracker()
            if (this.isPlaying) {
              this.handleTrackEnded()
            }
          }
        },
        onError: (err) => {
          console.warn('[YouTube Player] Error:', err)
          // Cegah auto-play / advance ke next track jika player sedang mati/idle
          if (this.isPlaying && this.getCurrentTrack()?.type === 'youtube') {
            this.next()
          }
        }
      }
    })
  }

  startYouTubeProgressTracker() {
    this.stopYouTubeProgressTracker()
    this.ytProgressTimer = setInterval(() => {
      if (this.ytPlayer && this.ytReady && this.getCurrentTrack()?.type === 'youtube') {
        const cur = this.ytPlayer.getCurrentTime() || 0
        const dur = this.ytPlayer.getDuration() || 0

        if (this.dom.currentTime) {
          this.dom.currentTime.textContent = this.formatTime(cur)
        }
        if (this.dom.duration) {
          this.dom.duration.textContent = dur > 0 ? this.formatTime(dur) : 'LIVE'
        }
        if (this.dom.seekBar && dur > 0) {
          this.dom.seekBar.value = String((cur / dur) * 100)
        }
      }
    }, 1000)
  }

  stopYouTubeProgressTracker() {
    if (this.ytProgressTimer) {
      clearInterval(this.ytProgressTimer)
      this.ytProgressTimer = null
    }
  }

  cacheDom() {
    this.dom.panel = document.getElementById('music-panel')
    this.dom.toggleBtn = document.getElementById('music-toggle')
    this.dom.closeBtn = document.getElementById('music-close-btn')
    this.dom.disc = document.getElementById('music-disc')
    this.dom.discIcon = document.getElementById('music-disc-icon')
    this.dom.title = document.getElementById('music-title')
    this.dom.artist = document.getElementById('music-artist')
    this.dom.badge = document.getElementById('music-badge')
    this.dom.favBtn = document.getElementById('music-fav-btn')
    this.dom.eq = document.getElementById('music-eq')
    this.dom.currentTime = document.getElementById('music-current-time')
    this.dom.duration = document.getElementById('music-duration')
    this.dom.seekBar = document.getElementById('music-seek-bar')
    this.dom.shuffleBtn = document.getElementById('music-shuffle-btn')
    this.dom.prevBtn = document.getElementById('music-prev-btn')
    this.dom.playBtn = document.getElementById('music-play-btn')
    this.dom.nextBtn = document.getElementById('music-next-btn')
    this.dom.repeatBtn = document.getElementById('music-repeat-btn')
    this.dom.favCtrlBtn = document.getElementById('music-fav-ctrl-btn')
    this.dom.downloadCtrlBtn = document.getElementById('music-download-ctrl-btn')
    this.dom.muteBtn = document.getElementById('music-mute-btn')
    this.dom.volSlider = document.getElementById('music-vol-slider')
    this.dom.volLabel = document.getElementById('music-vol-label')
    this.dom.searchInput = document.getElementById('music-search-input')
    this.dom.searchClear = document.getElementById('music-search-clear')
    this.dom.catBtns = document.querySelectorAll('.music-cat-btn')
    this.dom.tracklist = document.getElementById('music-tracklist')
    this.dom.addLocalBtn = document.getElementById('music-add-local-btn')
    this.dom.openFolderBtn = document.getElementById('music-open-folder-btn')

    // Online & YouTube Stream Drawer
    this.dom.addOnlineToggleBtn = document.getElementById('music-add-online-toggle-btn')
    this.dom.onlineDrawer = document.getElementById('music-online-drawer')
    this.dom.onlineDrawerClose = document.getElementById('music-online-drawer-close')
    this.dom.onlineUrlInput = document.getElementById('music-online-url-input')
    this.dom.onlineTitleInput = document.getElementById('music-online-title-input')
    this.dom.onlineArtistInput = document.getElementById('music-online-artist-input')
    this.dom.onlineSubmitBtn = document.getElementById('music-online-submit-btn')
    this.dom.onlineResearchBtn = document.getElementById('music-online-research-btn')
    this.dom.onlineStatus = document.getElementById('music-online-status')
    this.dom.onlineResults = document.getElementById('music-online-results')
  }

  ensureAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      this.audioCtx = new AudioContextClass()

      this.masterGain = this.audioCtx.createGain()
      this.masterGain.gain.setValueAtTime(this.volume, this.audioCtx.currentTime)

      this.duckGain = this.audioCtx.createGain()
      this.duckGain.gain.setValueAtTime(1.0, this.audioCtx.currentTime)

      this.masterGain.connect(this.duckGain)
      this.duckGain.connect(this.audioCtx.destination)

      this.lofiEngine = new ProceduralLofiEngine(this.audioCtx, this.masterGain)
      // Jangan hubungkan this.htmlAudio ke createMediaElementSource karena Chromium akan
      // membisukan output audio stream/lokal yang tidak mengirim header CORS WebAudio.
    }

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume()
    }
  }

  rebuildTracklist() {
    this.tracks = [
      ...BUILTIN_TRACKS,
      ...ONLINE_CURATED_STATIONS,
      ...this.onlineTracks,
      ...this.localTracks
    ]
  }

  async loadLibraryFromDisk() {
    try {
      if (window.hermesAvatar?.loadMusicLibrary) {
        const res = await window.hermesAvatar.loadMusicLibrary()
        if (res?.ok && res.data) {
          const { onlineTracks, localTracks, favorites, volume } = res.data
          if (Array.isArray(onlineTracks)) {
            this.onlineTracks = onlineTracks
          }
          if (Array.isArray(localTracks)) {
            this.localTracks = localTracks
          }
          if (Array.isArray(favorites)) {
            this.favorites = new Set(favorites)
          }
          if (typeof volume === 'number') {
            this.volume = Math.max(0, Math.min(1, volume))
          }
          this.rebuildTracklist()
          this.renderTracklist()
          this.updateCurrentTrackDisplay()
          this.refreshPendingMetadata()
          return
        }
      }
    } catch (err) {
      console.warn('[MusicPlayer] Gagal memuat pustaka musik dari disk:', err)
    }

    // Fallback ke localStorage jika file disk belum ada
    this.loadPersistedData()
    // Jika ada data di localStorage, migrasikan langsung ke file disk!
    if (this.onlineTracks.length > 0 || this.localTracks.length > 0 || this.favorites.size > 0) {
      this.savePersistedData()
    }
  }

  loadPersistedData() {
    try {
      const savedFavs = localStorage.getItem('hermes-music-favorites')
      if (savedFavs) {
        this.favorites = new Set(JSON.parse(savedFavs))
      }

      const savedLocal = localStorage.getItem('hermes-music-local-tracks')
      if (savedLocal) {
        this.localTracks = JSON.parse(savedLocal)
      }

      const savedOnline = localStorage.getItem('hermes-music-online-tracks')
      if (savedOnline) {
        this.onlineTracks = JSON.parse(savedOnline)
      }

      this.rebuildTracklist()

      const savedVol = localStorage.getItem('hermes-music-volume')
      if (savedVol !== null) {
        this.volume = Math.max(0, Math.min(1, parseFloat(savedVol)))
      }
    } catch (err) {
      console.warn('[MusicPlayer] Gagal memuat data tersimpan:', err)
    }
  }

  savePersistedData() {
    const payload = {
      favorites: [...this.favorites],
      localTracks: this.localTracks,
      onlineTracks: this.onlineTracks,
      volume: this.volume,
      updatedAt: new Date().toISOString()
    }

    // 1. Simpan ke berkas permanen di ~/.hermes-avatar/music_library.json
    if (window.hermesAvatar?.saveMusicLibrary) {
      window.hermesAvatar.saveMusicLibrary(payload).catch((err) => {
        console.warn('[MusicPlayer] Gagal simpan ke file disk:', err)
      })
    }

    // 2. Redundansi ke localStorage browser
    try {
      localStorage.setItem('hermes-music-favorites', JSON.stringify([...this.favorites]))
      localStorage.setItem('hermes-music-local-tracks', JSON.stringify(this.localTracks))
      localStorage.setItem('hermes-music-online-tracks', JSON.stringify(this.onlineTracks))
      localStorage.setItem('hermes-music-volume', String(this.volume))
    } catch (err) {
      console.warn('[MusicPlayer] Gagal menyimpan data:', err)
    }
  }

  listenToExternalUpdates() {
    window.addEventListener('storage', (e) => {
      if (e.key === 'hermes-music-online-tracks' || e.key === 'hermes-music-favorites') {
        this.loadLibraryFromDisk()
      }
    })
    window.addEventListener('hermes:music-library-updated', () => {
      this.loadLibraryFromDisk()
    })
  }

  removeCustomTrack(trackId) {
    this.onlineTracks = this.onlineTracks.filter((t) => t.id !== trackId)
    this.localTracks = this.localTracks.filter((t) => t.id !== trackId)
    this.favorites.delete(trackId)
    this.rebuildTracklist()
    this.savePersistedData()

    if (this.getCurrentTrack()?.id === trackId) {
      this.pause()
      this.currentTrackIndex = 0
    }

    this.updateCurrentTrackDisplay()
    this.renderTracklist()
  }

  bindEvents() {
    this.dom.toggleBtn?.addEventListener('click', () => this.toggleWindow())
    this.dom.closeBtn?.addEventListener('click', () => this.hideWindow())

    this.dom.playBtn?.addEventListener('click', () => this.togglePlay())
    this.dom.prevBtn?.addEventListener('click', () => this.prev())
    this.dom.nextBtn?.addEventListener('click', () => this.next())

    this.dom.shuffleBtn?.addEventListener('click', () => this.toggleShuffle())
    this.dom.repeatBtn?.addEventListener('click', () => this.toggleRepeat())

    this.dom.favBtn?.addEventListener('click', () => {
      const track = this.getCurrentTrack()
      if (track) {
        this.toggleFavorite(track.id)
      }
    })

    this.dom.favCtrlBtn?.addEventListener('click', () => {
      const track = this.getCurrentTrack()
      if (track) {
        this.toggleFavorite(track.id)
      }
    })

    this.dom.downloadCtrlBtn?.addEventListener('click', () => {
      this.downloadCurrentTrack()
    })

    this.dom.seekBar?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value)
      this.seekTo(val)
    })

    this.dom.volSlider?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) / 100
      this.setVolume(val)
    })

    this.dom.muteBtn?.addEventListener('click', () => this.toggleMute())

    this.dom.catBtns?.forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-category') || 'all'
        this.setCategory(cat)
      })
    })

    this.dom.searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.trim().toLowerCase()
      if (this.dom.searchClear) {
        this.dom.searchClear.hidden = !this.searchQuery
      }
      this.renderTracklist()
    })

    this.dom.searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.searchQuery && this.getFilteredTracks().length === 0) {
        e.preventDefault()
        this.searchAndPlayOnline({ query: this.searchQuery })
      }
    })

    this.dom.searchClear?.addEventListener('click', () => {
      if (this.dom.searchInput) {
        this.dom.searchInput.value = ''
      }
      this.searchQuery = ''
      this.dom.searchClear.hidden = true
      this.renderTracklist()
    })

    // Local & Online Actions
    this.dom.addLocalBtn?.addEventListener('click', () => this.importLocalTracks())
    this.dom.openFolderBtn?.addEventListener('click', () => {
      const track = this.getCurrentTrack()
      const ytId = track?.videoId || (track ? extractYouTubeVideoId(track.url) : null)
      if (window.hermesAvatar?.openMusicFolder) {
        window.hermesAvatar.openMusicFolder({ videoId: ytId, filePath: track?.filePath })
      }
    })
    this.dom.addOnlineToggleBtn?.addEventListener('click', () => this.toggleOnlineDrawer())
    this.dom.onlineDrawerClose?.addEventListener('click', () => this.closeOnlineDrawer())
    this.dom.onlineSubmitBtn?.addEventListener('click', () => this.submitOnlineStream())
    this.dom.onlineResearchBtn?.addEventListener('click', () => this.requestAiMusicResearch())

    const onEnterSearchDrawer = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        this.requestAiMusicResearch()
      }
    }
    this.dom.onlineTitleInput?.addEventListener('keydown', onEnterSearchDrawer)
    this.dom.onlineArtistInput?.addEventListener('keydown', onEnterSearchDrawer)
    this.dom.onlineUrlInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        this.submitOnlineStream()
      }
    })

    // Deteksi real-time input URL YouTube untuk auto-fill judul & channel
    this.dom.onlineUrlInput?.addEventListener('input', async (e) => {
      const val = e.target.value.trim()
      const ytId = extractYouTubeVideoId(val)
      if (ytId) {
        this.setOnlineDrawerStatus('Mengambil info lagu YouTube...', 'info')
        const info = await fetchYouTubeInfo(ytId)
        if (info) {
          if (this.dom.onlineTitleInput && !this.dom.onlineTitleInput.value) {
            this.dom.onlineTitleInput.value = info.title
          }
          if (this.dom.onlineArtistInput && !this.dom.onlineArtistInput.value) {
            this.dom.onlineArtistInput.value = info.artist
          }
          this.setOnlineDrawerStatus(`Terdeteksi: ${info.title} (${info.artist})`, 'success')
        }
      }
    })

    const updateDurationUi = () => {
      const track = this.getCurrentTrack()
      if (!track || track.type === 'procedural') return
      const dur = this.htmlAudio.duration
      if (dur && isFinite(dur) && dur > 0) {
        if (this.dom.duration) this.dom.duration.textContent = this.formatTime(dur)
        if (!track.duration || Math.abs(track.duration - Math.round(dur)) > 2) {
          track.duration = Math.round(dur)
        }
      }
    }

    this.htmlAudio.addEventListener('loadedmetadata', updateDurationUi)
    this.htmlAudio.addEventListener('durationchange', updateDurationUi)

    this.htmlAudio.addEventListener('timeupdate', () => {
      if (this.isPlaying && this.getCurrentTrack()?.type !== 'procedural') {
        const cur = this.htmlAudio.currentTime || 0
        const dur = this.htmlAudio.duration || this.getCurrentTrack()?.duration || 0
        if (this.dom.currentTime) this.dom.currentTime.textContent = this.formatTime(cur)
        if (this.dom.duration && !isNaN(dur) && dur > 0 && isFinite(dur)) {
          this.dom.duration.textContent = this.formatTime(dur)
          if (this.dom.seekBar) {
            this.dom.seekBar.value = String(Math.min(100, (cur / dur) * 100))
          }
        }
        if (cur > 0 && this.dom.badge && (this.dom.badge.textContent === 'Memuat…' || this.dom.badge.textContent === 'Memuat...')) {
          const track = this.getCurrentTrack()
          this.dom.badge.textContent = track?.badge || (track?.type === 'youtube' ? 'YouTube ▶' : 'Live')
        }
      }
    })

    this.htmlAudio.addEventListener('ended', () => {
      if (!this.isPlaying) return
      const cur = Number(this.htmlAudio.currentTime || 0)
      const dur = Number(this.htmlAudio.duration || this.getCurrentTrack()?.duration || 0)
      // Deteksi stream yang terputus di tengah jalan (misal di detik ke-30 dari lagu 3:50)
      if (dur > 15 && cur < dur - 5) {
        console.warn(`[MusicPlayer] Stream terputus di tengah jalan (${cur.toFixed(1)}s / ${dur.toFixed(1)}s). Melakukan resume otomatis...`)
        this.handlePrematureStreamEnd(cur)
        return
      }
      this._consecutivePrematureEnds = 0
      this.handleTrackEnded()
    })

    this.htmlAudio.addEventListener('playing', () => {
      this._consecutiveAudioErrors = 0
      this._consecutivePrematureEnds = 0
      const track = this.getCurrentTrack()
      if (track && this.dom.badge) {
        this.dom.badge.textContent = track.badge || (track.type === 'youtube' ? 'YouTube ▶' : 'Live')
      }
    })

    this.htmlAudio.addEventListener('error', async (e) => {
      if (!this.htmlAudio.getAttribute('src')) return
      console.warn('[MusicPlayer] Audio playback error:', e)
      const track = this.getCurrentTrack()
      if (!this.isPlaying || !track || track.type === 'procedural') return

      // Coba sekali lewat proxy Main Process bila stream langsung atau link YT kadaluarsa (pertahankan posisi waktu)
      const resumeTime = Number(this.htmlAudio.currentTime || 0)
      if (track.type === 'stream' && !this._usedStreamProxy && track.url && window.hermesAvatar?.resolveMusicStream) {
        this._usedStreamProxy = true
        const reqId = this._playReqId
        const res = await window.hermesAvatar.resolveMusicStream({ url: track.url, title: track.title, artist: track.artist }).catch(() => null)
        if (reqId === this._playReqId && this.isPlaying && res?.ok && res.proxyUrl) {
          this.htmlAudio.src = res.proxyUrl
          if (resumeTime > 2) {
            this.htmlAudio.addEventListener('loadedmetadata', () => {
              if (this.htmlAudio.duration && isFinite(this.htmlAudio.duration) && resumeTime < this.htmlAudio.duration - 2) {
                this.htmlAudio.currentTime = resumeTime
              }
            }, { once: true })
          }
          this.htmlAudio.load()
          this.htmlAudio.play().catch(() => {})
          return
        }
      }

      if (track.type === 'youtube' && !this._retriedYtRefresh && window.hermesAvatar?.resolveMusicStream) {
        this._retriedYtRefresh = true
        const reqId = this._playReqId
        const ytId = track.videoId || extractYouTubeVideoId(track.url)
        const res = await window.hermesAvatar.resolveMusicStream({ url: track.url, videoId: ytId, title: track.title, artist: track.artist, forceRefresh: true }).catch(() => null)
        if (reqId === this._playReqId && this.isPlaying) {
          if (res?.offline) {
            this.scheduleNetworkRecovery({ type: 'play-track', trackId: track.id }, res.error)
            return
          }
          if (res?.ok && res.proxyUrl) {
            this.htmlAudio.src = res.proxyUrl
            if (resumeTime > 2) {
              this.htmlAudio.addEventListener('loadedmetadata', () => {
                if (this.htmlAudio.duration && isFinite(this.htmlAudio.duration) && resumeTime < this.htmlAudio.duration - 2) {
                  this.htmlAudio.currentTime = resumeTime
                }
              }, { once: true })
            }
            this.htmlAudio.load()
            this.htmlAudio.play().catch(() => {})
            return
          }
        }
      }

      // Auto-failover ke versi audio alternatif jika stream YouTube utama bermasalah
      if (track.type === 'youtube' && navigator.onLine !== false) {
        const switched = await this.tryAlternativeTrackFailover(track)
        if (switched) return
      }

      if (navigator.onLine === false && track.type !== 'local') {
        this.scheduleNetworkRecovery(
          { type: 'play-track', trackId: track.id },
          `⏳ Koneksi internet terputus. "${track.title}" akan otomatis diputar begitu jaringan tersambung kembali.`
        )
        return
      }

      // Fallback ke pemutar latar belakang bawaan Electron (electron-bg)
      if (track.type === 'youtube' && typeof window.hermesAvatar?.controlBackgroundMusic === 'function') {
        const ytId = track.videoId || extractYouTubeVideoId(track.url)
        if (ytId) {
          const bgVol = this.isMuted ? 0 : (this.isDucked ? this.volume * 0.2 : this.volume)
          const bgRes = await window.hermesAvatar.controlBackgroundMusic('load', { videoId: ytId, volume: bgVol }).catch(() => null)
          if (bgRes?.ok) {
            this._activePlaybackEngine = 'electron-bg'
            this.isPlaying = true
            this.updatePlayStateUi(true)
            if (this.dom.badge) this.dom.badge.textContent = track.badge || 'YouTube ▶'
            this.setOnlineDrawerStatus(`Memutar via pemutar latar belakang: ${track.title}`, 'success')
            return
          }
        }
      }

      this.isPlaying = false
      this.updatePlayStateUi(false)
      if (this.dom.badge) this.dom.badge.textContent = 'Stream Gagal'
      this.setOnlineDrawerStatus(`Gagal memutar stream "${track.title}". Periksa koneksi atau coba lagu lain.`, 'error')
    })
  }

  showWindow() {
    if (!this.dom.panel) return
    this.dom.panel.hidden = false
    window.dispatchEvent(new CustomEvent('avatar:dock-panels-update'))
  }

  hideWindow() {
    if (!this.dom.panel) return
    this.dom.panel.hidden = true
    this.closeOnlineDrawer()
    window.dispatchEvent(new CustomEvent('avatar:dock-panels-update'))
  }

  toggleWindow() {
    if (!this.dom.panel) return
    if (this.dom.panel.hidden) {
      this.showWindow()
    } else {
      this.hideWindow()
    }
  }

  toggleOnlineDrawer() {
    if (!this.dom.onlineDrawer) return
    const isHidden = this.dom.onlineDrawer.hidden
    this.dom.onlineDrawer.hidden = !isHidden
    if (!this.dom.onlineDrawer.hidden) {
      this.dom.onlineUrlInput?.focus()
    }
  }

  closeOnlineDrawer() {
    if (this.dom.onlineDrawer) {
      this.dom.onlineDrawer.hidden = true
    }
  }

  openOnlineDrawer() {
    if (this.dom.onlineDrawer) {
      this.dom.onlineDrawer.hidden = false
    }
  }

  setOnlineDrawerStatus(msg = '', tone = 'info') {
    if (!this.dom.onlineStatus) return
    if (!msg) {
      this.dom.onlineStatus.textContent = ''
      this.dom.onlineStatus.hidden = true
      this.dom.onlineStatus.className = 'music-online-status'
      return
    }
    this.dom.onlineStatus.hidden = false
    this.dom.onlineStatus.className = `music-online-status ${tone === 'error' ? 'error' : tone === 'success' ? 'success' : ''}`.trim()
    this.dom.onlineStatus.textContent = msg
  }

  renderOnlineResults(results = []) {
    if (!this.dom.onlineResults) return
    if (!Array.isArray(results) || results.length === 0) {
      this.dom.onlineResults.replaceChildren()
      this.dom.onlineResults.hidden = true
      return
    }
    this.dom.onlineResults.replaceChildren()
    this.dom.onlineResults.hidden = false
    for (const item of results.slice(0, 6)) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'music-search-result-item'

      const info = document.createElement('div')
      info.className = 'music-search-result-info'
      const tEl = document.createElement('span')
      tEl.className = 'music-search-result-title'
      tEl.textContent = item.title || 'Lagu Online'
      const sEl = document.createElement('span')
      sEl.className = 'music-search-result-sub'
      sEl.textContent = `${item.artist || 'Artist'} • ${item.durationText || item.badge || 'Stream'}`
      info.appendChild(tEl)
      info.appendChild(sEl)

      const playBadge = document.createElement('span')
      playBadge.className = 'music-search-result-play'
      playBadge.textContent = 'Putar ▶'

      btn.appendChild(info)
      btn.appendChild(playBadge)
      btn.addEventListener('click', () => {
        if (this.dom.onlineTitleInput) this.dom.onlineTitleInput.value = item.title || ''
        if (this.dom.onlineArtistInput) this.dom.onlineArtistInput.value = item.artist || ''
        const added = this.addOnlineTrack(item)
        if (added) {
          this.setOnlineDrawerStatus(`Memutar: ${added.title} (${added.artist})`, 'success')
        }
      })
      this.dom.onlineResults.appendChild(btn)
    }
  }

  clearNetworkRecovery() {
    this.waitingForNetwork = false
    this._pendingNetworkJob = null
    if (this._networkRetryTimer) {
      clearInterval(this._networkRetryTimer)
      this._networkRetryTimer = null
    }
  }

  onNetworkLost() {
    const track = this.getCurrentTrack()
    if (!track || track.type === 'procedural' || track.type === 'local') return
    this.scheduleNetworkRecovery(
      { type: 'play-track', trackId: track.id },
      `⏳ Koneksi terputus. "${track.title}" tetap tersimpan & akan otomatis diputar begitu jaringan kembali.`
    )
  }

  scheduleNetworkRecovery(job, statusMsg = '') {
    this.waitingForNetwork = true
    this._pendingNetworkJob = job
    this._playReqId = (this._playReqId || 0) + 1
    this.isPlaying = false
    this.updatePlayStateUi(false)
    if (this.dom.badge) this.dom.badge.textContent = 'Menunggu Jaringan…'
    this.setOnlineDrawerStatus(
      statusMsg || '⏳ Koneksi internet terputus. Permintaan dicatat & akan otomatis diputar begitu jaringan kembali aktif.',
      'info'
    )
    if (!this._networkRetryTimer) {
      this._networkRetryTimer = setInterval(() => {
        if (navigator.onLine !== false) {
          this.tryResumeFromNetwork()
        }
      }, 5000)
    }
  }

  async tryResumeFromNetwork() {
    if (this._resumingNetwork || navigator.onLine === false) return
    const job = this._pendingNetworkJob
    if (!job) {
      this.clearNetworkRecovery()
      return
    }
    this._resumingNetwork = true
    try {
      if (job.type === 'search') {
        const res = await this.searchAndPlayOnline({
          query: job.query,
          title: job.title,
          artist: job.artist,
          showResultsInDrawer: job.showResultsInDrawer
        })
        if (res) {
          this.clearNetworkRecovery()
        }
      } else if (job.type === 'play-track') {
        const idx = this.tracks.findIndex((t) => t.id === job.trackId)
        if (idx !== -1) {
          await this.playTrack(idx)
        } else {
          this.clearNetworkRecovery()
        }
      }
    } finally {
      this._resumingNetwork = false
    }
  }

  async refreshPendingMetadata() {
    if (navigator.onLine === false || typeof window?.hermesAvatar?.resolveMusicStream !== 'function') return
    const pending = this.onlineTracks.filter(
      (t) => t.pendingMetadata && (t.videoId || extractYouTubeVideoId(t.url))
    )
    if (pending.length === 0) return

    let changed = false
    for (const tr of pending.slice(0, 5)) {
      const vid = tr.videoId || extractYouTubeVideoId(tr.url)
      if (!vid) continue
      try {
        const res = await window.hermesAvatar.resolveMusicStream({ videoId: vid, url: tr.url })
        if (res?.ok && !res.offline) {
          if (res.title && res.title !== 'YouTube Audio') tr.title = res.title
          if (res.artist && res.artist !== 'YouTube') tr.artist = res.artist
          if (res.duration > 0) tr.duration = Number(res.duration)
          if (res.thumbnail) tr.thumbnail = res.thumbnail
          tr.pendingMetadata = false
          changed = true
        }
      } catch {
        // Coba lagi saat koneksi stabil
      }
    }
    if (changed) {
      this.rebuildTracklist()
      this.savePersistedData()
      this.updateCurrentTrackDisplay()
      this.renderTracklist()
    }
  }

  stopBackgroundEngine() {
    if (this._bgStatusTimer) {
      clearInterval(this._bgStatusTimer)
      this._bgStatusTimer = null
    }
    if (this._activePlaybackEngine === 'electron-bg') {
      window.hermesAvatar?.controlBackgroundMusic?.('pause').catch(() => {})
    }
  }

  async searchAndPlayOnline({ query = '', title = '', artist = '', showResultsInDrawer = false } = {}) {
    if (typeof window?.hermesAvatar?.searchOnlineMusic !== 'function') {
      this.setOnlineDrawerStatus('Fitur pencarian online belum tersedia di preload.', 'error')
      return null
    }

    const ytDirectId = extractYouTubeVideoId(query)
    if (ytDirectId) {
      const canonicalUrl = `https://www.youtube.com/watch?v=${ytDirectId}`
      return this.addOnlineTrack({
        title: title || `YouTube (${ytDirectId})`,
        artist: artist || (navigator.onLine === false ? 'Menunggu Jaringan...' : 'YouTube'),
        url: canonicalUrl,
        videoId: ytDirectId,
        pendingMetadata: navigator.onLine === false || !title
      })
    }

    if (navigator.onLine === false) {
      const label = [artist, title, query].filter(Boolean).join(' - ')
      this.scheduleNetworkRecovery(
        { type: 'search', query, title, artist, showResultsInDrawer },
        `⏳ Internet sedang terputus. Pencarian "${label}" dicatat & otomatis diputar saat internet kembali.`
      )
      return null
    }

    if (showResultsInDrawer) {
      this.setOnlineDrawerStatus('Mencari lagu yang diminta di internet...', 'info')
    }
    if (this.dom.onlineResearchBtn) {
      this.dom.onlineResearchBtn.disabled = true
      this.dom.onlineResearchBtn.textContent = 'Mencari…'
    }
    try {
      const res = await window.hermesAvatar.searchOnlineMusic({ query, title, artist, limit: 6 })
      const list = Array.isArray(res?.results) ? res.results : []
      if (!res?.ok || list.length === 0) {
        if (res?.offline) {
          this.scheduleNetworkRecovery(
            { type: 'search', query, title, artist, showResultsInDrawer },
            res.error
          )
          return null
        }
        if (showResultsInDrawer) {
          this.renderOnlineResults([])
          this.setOnlineDrawerStatus(res?.error || 'Tidak ditemukan lagu yang cocok.', 'error')
        }
        return null
      }

      this.clearNetworkRecovery()
      if (showResultsInDrawer) {
        this.renderOnlineResults(list)
      }

      const best = list[0]
      if (showResultsInDrawer) {
        if (this.dom.onlineTitleInput && !this.dom.onlineTitleInput.value.trim()) {
          this.dom.onlineTitleInput.value = best.title || ''
        }
        if (this.dom.onlineArtistInput && !this.dom.onlineArtistInput.value.trim()) {
          this.dom.onlineArtistInput.value = best.artist || ''
        }
        this.setOnlineDrawerStatus(`Ditemukan & memutar: ${best.title} — ${best.artist}`, 'success')
      }

      const track = this.addOnlineTrack(best)
      window.dispatchEvent(new CustomEvent('hermes:request-music-research', { detail: { track: best } }))
      return track
    } catch (err) {
      if (showResultsInDrawer) {
        this.setOnlineDrawerStatus(err?.message || 'Gagal mencari lagu online.', 'error')
      }
      return null
    } finally {
      if (this.dom.onlineResearchBtn) {
        this.dom.onlineResearchBtn.disabled = false
        this.dom.onlineResearchBtn.textContent = 'Minta Hermes Carikan'
      }
    }
  }

  async submitOnlineStream() {
    const url = this.dom.onlineUrlInput?.value?.trim() || ''
    let title = this.dom.onlineTitleInput?.value?.trim() || ''
    let artist = this.dom.onlineArtistInput?.value?.trim() || ''

    const isHttpUrl = /^https?:\/\//i.test(url)
    if (!isHttpUrl) {
      if (title || artist || url) {
        await this.searchAndPlayOnline({
          title,
          artist,
          query: url,
          showResultsInDrawer: true
        })
        return
      }
      this.setOnlineDrawerStatus('Isi URL Audio/YouTube atau masukkan Nama Lagu & Artis terlebih dahulu.', 'error')
      this.dom.onlineTitleInput?.focus()
      return
    }

    const ytId = extractYouTubeVideoId(url)
    const canonicalUrl = ytId ? `https://www.youtube.com/watch?v=${ytId}` : url
    let thumbnail = ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : null
    let duration = 0
    const isOfflineNow = navigator.onLine === false

    if (ytId && (!title || !artist) && !isOfflineNow) {
      this.setOnlineDrawerStatus('Mengambil info video YouTube...', 'info')
      const ytInfo = await fetchYouTubeInfo(ytId)
      if (ytInfo && ytInfo.title !== 'YouTube Audio') {
        title = title || ytInfo.title
        artist = artist || ytInfo.artist
        thumbnail = ytInfo.thumbnail || thumbnail
        duration = Number(ytInfo.duration || 0)
      }
    }

    const pendingMetadata = Boolean(ytId && !title)
    title = title || (ytId ? `YouTube (${ytId})` : 'Online Audio Stream')
    artist = artist || (ytId ? (isOfflineNow ? 'Menunggu Jaringan...' : 'YouTube') : 'Internet Web Radio')

    // Catat URL secara permanen terlebih dahulu bahkan saat offline
    const added = this.addOnlineTrack({
      title,
      artist,
      url: canonicalUrl,
      videoId: ytId,
      duration,
      thumbnail,
      pendingMetadata
    })
    if (added) {
      this.setOnlineDrawerStatus(
        isOfflineNow
          ? `URL tersimpan permanen (${added.title}). Otomatis diputar saat ada internet.`
          : `URL tersimpan & memutar: ${added.title}`,
        isOfflineNow ? 'info' : 'success'
      )
    }

    if (this.dom.onlineUrlInput) this.dom.onlineUrlInput.value = ''
    if (this.dom.onlineTitleInput) this.dom.onlineTitleInput.value = ''
    if (this.dom.onlineArtistInput) this.dom.onlineArtistInput.value = ''
    this.renderOnlineResults([])
    if (!isOfflineNow) {
      this.closeOnlineDrawer()
    }
  }

  addOnlineTrack({ title, artist, url, videoId, duration = 0, thumbnail, type, badge, pendingMetadata = false }) {
    if (!url && !videoId) return null
    const resolvedVid = videoId || extractYouTubeVideoId(url)
    const isYt = Boolean(resolvedVid) || type === 'youtube'
    const normalizedUrl = resolvedVid
      ? `https://www.youtube.com/watch?v=${resolvedVid}`
      : String(url || '').trim()

    // Hindari duplikasi jika lagu/URL yang sama sudah tersimpan di pustaka online
    const existing = this.onlineTracks.find((t) =>
      (resolvedVid && t.videoId === resolvedVid) ||
      (normalizedUrl && String(t.url || '').trim() === normalizedUrl)
    )
    if (existing) {
      if (title && title !== 'YouTube Audio' && !/^YouTube \([a-zA-Z0-9_-]{11}\)$/.test(title)) {
        existing.title = title
        existing.pendingMetadata = false
      }
      if (artist && artist !== 'YouTube' && artist !== 'YouTube Creator' && artist !== 'Menunggu Jaringan...') {
        existing.artist = artist
      }
      if (duration > 0) existing.duration = Number(duration)
      if (thumbnail) existing.thumbnail = thumbnail
      existing.url = normalizedUrl
      existing.type = isYt ? 'youtube' : 'stream'
      existing.badge = badge || (isYt ? 'YouTube ▶' : 'Live')
      this.rebuildTracklist()
      this.savePersistedData()
      this.setCategory('online')
      const existingIdx = this.tracks.findIndex((t) => t.id === existing.id)
      if (existingIdx !== -1) this.playTrack(existingIdx)
      return existing
    }

    const trackId = `online-${Date.now()}`
    const newTrack = {
      id: trackId,
      title: title || (isYt ? `YouTube (${resolvedVid})` : 'Internet Stream'),
      artist: artist || (isYt ? 'YouTube' : 'Web Radio'),
      category: 'online',
      badge: badge || (isYt ? 'YouTube ▶' : 'Live'),
      duration: Number(duration || 0),
      type: isYt ? 'youtube' : 'stream',
      videoId: resolvedVid || null,
      pendingMetadata: Boolean(pendingMetadata),
      thumbnail: thumbnail || (resolvedVid ? `https://i.ytimg.com/vi/${resolvedVid}/hqdefault.jpg` : null),
      url: normalizedUrl
    }

    this.onlineTracks.push(newTrack)
    this.rebuildTracklist()
    this.savePersistedData()
    this.setCategory('online')

    const idx = this.tracks.findIndex((t) => t.id === trackId)
    if (idx !== -1) {
      this.playTrack(idx)
    }
    return newTrack
  }

  async requestAiMusicResearch() {
    const urlVal = this.dom.onlineUrlInput?.value?.trim() || ''
    const titleVal = this.dom.onlineTitleInput?.value?.trim() || ''
    const artistVal = this.dom.onlineArtistInput?.value?.trim() || ''
    const searchVal = this.dom.searchInput?.value?.trim() || ''

    if (/^https?:\/\//i.test(urlVal) && !titleVal && !artistVal) {
      await this.submitOnlineStream()
      return
    }

    const searchQuery = (titleVal || artistVal)
      ? ''
      : (!/^https?:\/\//i.test(urlVal) ? urlVal : searchVal)

    if (!titleVal && !artistVal && !searchQuery) {
      this.setOnlineDrawerStatus('Ketik Nama Lagu atau Artis/Channel yang ingin dicari terlebih dahulu.', 'error')
      this.dom.onlineTitleInput?.focus()
      return
    }

    await this.searchAndPlayOnline({
      title: titleVal,
      artist: artistVal,
      query: searchQuery,
      showResultsInDrawer: true
    })
  }

  getCurrentTrack() {
    return this.tracks[this.currentTrackIndex] || null
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0 || !isFinite(seconds)) return '0:00'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  updateCurrentTrackDisplay() {
    const track = this.getCurrentTrack()
    if (!track) return

    if (this.dom.title) {
      this.dom.title.textContent = track.title
      this.dom.title.title = track.title
    }
    if (this.dom.artist) {
      this.dom.artist.textContent = track.artist || 'Unknown Artist'
    }
    if (this.dom.badge) {
      this.dom.badge.textContent = track.badge || (track.category === 'online' ? 'Live' : track.category === 'local' ? 'Lokal' : 'Musik')
      this.dom.badge.classList.toggle('badge-youtube', track.type === 'youtube')
    }

    const isFav = this.favorites.has(track.id)
    if (this.dom.favBtn) {
      this.dom.favBtn.innerHTML = renderIcon('heart', { size: 14, strokeWidth: isFav ? 2.4 : 1.8 })
      this.dom.favBtn.classList.toggle('active', isFav)
      this.dom.favBtn.title = isFav ? 'Hapus dari Favorit' : 'Simpan ke Favorit'
    }
    if (this.dom.favCtrlBtn) {
      this.dom.favCtrlBtn.innerHTML = renderIcon('heart', { size: 15, strokeWidth: isFav ? 2.4 : 1.8 })
      this.dom.favCtrlBtn.classList.toggle('active', isFav)
      this.dom.favCtrlBtn.title = isFav ? 'Hapus dari Favorit' : 'Simpan ke Favorit'
    }
    this.updateCurrentTrackDownloadUi(track)

    if (this.dom.discIcon) {
      const iconName = track.type === 'youtube'
        ? 'play'
        : track.category === 'online'
          ? 'radio'
          : track.category === 'local'
            ? 'folder'
            : (track.category === 'focus' ? 'coffee' : 'music')
      this.dom.discIcon.innerHTML = renderIcon(iconName, { size: 10 })
    }

    if (track.type === 'procedural') {
      if (this.dom.duration) this.dom.duration.textContent = '∞'
      if (this.dom.currentTime) this.dom.currentTime.textContent = this.formatTime(this.proceduralElapsedSeconds)
    } else if (track.type === 'youtube') {
      const audioDur = (this.htmlAudio.duration && isFinite(this.htmlAudio.duration)) ? this.htmlAudio.duration : 0
      const dur = audioDur || Number(track.duration || 0)
      if (this.dom.duration) this.dom.duration.textContent = dur > 0 ? this.formatTime(dur) : 'YouTube'
      if (this.dom.currentTime) this.dom.currentTime.textContent = this.formatTime(this.htmlAudio.currentTime || 0)
    } else if (track.type === 'stream') {
      const dur = (this.htmlAudio.duration && isFinite(this.htmlAudio.duration)) ? this.htmlAudio.duration : Number(track.duration || 0)
      if (this.dom.duration) this.dom.duration.textContent = dur > 0 ? this.formatTime(dur) : 'LIVE'
      if (this.dom.currentTime) this.dom.currentTime.textContent = dur > 0 ? this.formatTime(this.htmlAudio.currentTime || 0) : '●'
    } else {
      if (this.dom.duration) {
        this.dom.duration.textContent = track.duration ? this.formatTime(track.duration) : '--:--'
      }
    }

    this.renderTracklist()
  }

  async playTrack(index) {
    this.ensureAudioContext()

    if (index >= 0 && index < this.tracks.length) {
      this.currentTrackIndex = index
    }

    const track = this.getCurrentTrack()
    if (!track) return

    this._playReqId = (this._playReqId || 0) + 1
    const reqId = this._playReqId
    this._usedStreamProxy = false
    this._retriedYtRefresh = false
    this.isPlaying = true

    if (this.proceduralInterval) {
      clearInterval(this.proceduralInterval)
      this.proceduralInterval = null
    }

    // Hentikan mesin audio sebelumnya secara bersih sebelum memulai track baru
    this.stopBackgroundEngine()
    this.ytPlayer?.pauseVideo?.()
    this.stopYouTubeProgressTracker()
    this.lofiEngine?.stop()
    this.htmlAudio.pause()
    this.htmlAudio.removeAttribute('src')
    this._consecutiveAudioErrors = 0
    this._activePlaybackEngine = 'none'

    this.updatePlayStateUi(true)
    this.updateCurrentTrackDisplay()

    const ytId = track.videoId || extractYouTubeVideoId(track.url)
    const isYouTube = track.type === 'youtube' || Boolean(ytId)

    if (isYouTube) {
      if (navigator.onLine === false) {
        this.scheduleNetworkRecovery(
          { type: 'play-track', trackId: track.id },
          `⏳ Koneksi terputus. "${track.title}" tetap tersimpan & otomatis diputar saat internet kembali.`
        )
        return
      }
      if (this.dom.badge) this.dom.badge.textContent = 'Memuat…'
      if (this.dom.duration && !track.duration) this.dom.duration.textContent = '...'
      try {
        const res = await window.hermesAvatar?.resolveMusicStream?.({
          url: track.url,
          videoId: ytId,
          title: track.title,
          artist: track.artist
        })
        if (reqId !== this._playReqId || !this.isPlaying) return

        if (res?.offline) {
          this.scheduleNetworkRecovery(
            { type: 'play-track', trackId: track.id },
            res.error || `⏳ Menunggu koneksi internet untuk memutar "${track.title}"...`
          )
          return
        }

        if (!res?.ok) {
          throw new Error(res?.error || 'Gagal memuat stream audio YouTube.')
        }

        let metaChanged = false
        if (res.title && (!track.title || track.title === 'YouTube Audio' || track.title === 'Online Audio Stream' || /^YouTube \([a-zA-Z0-9_-]{11}\)$/.test(track.title))) {
          track.title = res.title
          metaChanged = true
        }
        if (res.artist && (!track.artist || track.artist === 'YouTube' || track.artist === 'YouTube Creator' || track.artist === 'Menunggu Jaringan...')) {
          track.artist = res.artist
          metaChanged = true
        }
        if (res.duration && res.duration > 0 && track.duration !== res.duration) {
          track.duration = Number(res.duration)
          metaChanged = true
        }
        if (track.pendingMetadata && !res.offline) {
          track.pendingMetadata = false
          metaChanged = true
        }
        if (metaChanged) {
          this.savePersistedData()
        }
        this.updateCurrentTrackDisplay()

        // Mode fallback bawaan Electron (tanpa yt-dlp)
        if (res.mode === 'electron-bg' && typeof window.hermesAvatar?.controlBackgroundMusic === 'function') {
          this._activePlaybackEngine = 'electron-bg'
          const bgVol = this.isMuted ? 0 : (this.isDucked ? this.volume * 0.2 : this.volume)
          const bgRes = await window.hermesAvatar.controlBackgroundMusic('load', { videoId: ytId, volume: bgVol })
          if (reqId !== this._playReqId || !this.isPlaying) return
          if (bgRes?.offline) {
            this.scheduleNetworkRecovery(
              { type: 'play-track', trackId: track.id },
              `⏳ Koneksi terputus. "${track.title}" akan otomatis diputar begitu jaringan tersambung kembali.`
            )
            return
          }
          if (!bgRes?.ok) {
            throw new Error(bgRes?.error || 'Gagal memulai pemutar YouTube bawaan.')
          }
          if (bgRes.duration > 0 && track.duration !== bgRes.duration) {
            track.duration = Number(bgRes.duration)
            this.savePersistedData()
            this.updateCurrentTrackDisplay()
          }
          this.clearNetworkRecovery()
          if (this.dom.badge) this.dom.badge.textContent = track.badge || 'YouTube ▶'

          this._bgStatusTimer = setInterval(async () => {
            if (!this.isPlaying || this._activePlaybackEngine !== 'electron-bg') return
            const st = await window.hermesAvatar.controlBackgroundMusic('status').catch(() => null)
            if (!st?.ok) return
            if (this.dom.currentTime) this.dom.currentTime.textContent = this.formatTime(st.currentTime || 0)
            const d = st.duration || track.duration || 0
            if (d > 0) {
              if (this.dom.duration) this.dom.duration.textContent = this.formatTime(d)
              if (this.dom.seekBar) this.dom.seekBar.value = String(Math.min(100, ((st.currentTime || 0) / d) * 100))
              if (track.duration !== Math.round(d)) {
                track.duration = Math.round(d)
              }
            }
            if (st.ended) {
              this.handleTrackEnded()
            }
          }, 1000)
          return
        }

        if (!res.proxyUrl) {
          throw new Error(res?.error || 'Stream audio YouTube tidak tersedia.')
        }

        this.clearNetworkRecovery()
        this._activePlaybackEngine = 'html-audio'
        this.htmlAudio.volume = this.isMuted ? 0 : (this.isDucked ? this.volume * 0.2 : this.volume)
        this.htmlAudio.src = res.proxyUrl
        this.htmlAudio.load()
        await this.htmlAudio.play()
        if (reqId === this._playReqId && this.dom.badge) {
          this.dom.badge.textContent = track.badge || 'YouTube ▶'
        }
      } catch (err) {
        if (reqId !== this._playReqId) return
        if (navigator.onLine === false) {
          this.scheduleNetworkRecovery(
            { type: 'play-track', trackId: track.id },
            `⏳ Koneksi terputus. "${track.title}" menunggu internet tersambung kembali.`
          )
          return
        }
        console.warn('[MusicPlayer] Gagal memutar YouTube:', err)

        // Coba failover otomatis ke versi alternatif resmi YouTube
        if (track.type === 'youtube') {
          const switched = await this.tryAlternativeTrackFailover(track)
          if (switched) return
        }

        // Coba pemutar latar belakang bawaan Electron (electron-bg)
        if (track.type === 'youtube' && typeof window.hermesAvatar?.controlBackgroundMusic === 'function') {
          const ytId = track.videoId || extractYouTubeVideoId(track.url)
          if (ytId) {
            const bgVol = this.isMuted ? 0 : (this.isDucked ? this.volume * 0.2 : this.volume)
            const bgRes = await window.hermesAvatar.controlBackgroundMusic('load', { videoId: ytId, volume: bgVol }).catch(() => null)
            if (bgRes?.ok) {
              this._activePlaybackEngine = 'electron-bg'
              this.isPlaying = true
              this.updatePlayStateUi(true)
              if (this.dom.badge) this.dom.badge.textContent = track.badge || 'YouTube ▶'
              this.setOnlineDrawerStatus(`Memutar via pemutar latar belakang: ${track.title}`, 'success')
              return
            }
          }
        }

        this.isPlaying = false
        this.updatePlayStateUi(false)
        if (this.dom.badge) this.dom.badge.textContent = 'Stream Gagal'
        this.setOnlineDrawerStatus(err?.message || 'Gagal memuat audio YouTube.', 'error')
      }
      return
    }

    if (track.type === 'procedural') {
      this.clearNetworkRecovery()
      this._activePlaybackEngine = 'procedural'
      this.lofiEngine?.start(track.preset)

      this.proceduralElapsedSeconds = 0
      this.proceduralInterval = setInterval(() => {
        if (this.isPlaying) {
          this.proceduralElapsedSeconds++
          if (this.dom.currentTime) {
            this.dom.currentTime.textContent = this.formatTime(this.proceduralElapsedSeconds)
          }
          if (this.dom.seekBar) {
            this.dom.seekBar.value = String((this.proceduralElapsedSeconds % 180) / 1.8)
          }
        }
      }, 1000)
      return
    }

    if (track.type === 'stream' && navigator.onLine === false) {
      this.scheduleNetworkRecovery(
        { type: 'play-track', trackId: track.id },
        `⏳ Koneksi terputus. Radio "${track.title}" otomatis diputar begitu jaringan kembali.`
      )
      return
    }

    this.clearNetworkRecovery()
    this._activePlaybackEngine = 'html-audio'

    // Audio lokal atau internet stream langsung lewat HTMLAudioElement (dengan fallback proxy Main Process)
    let audioSrc = track.url || (track.filePath ? `model://${encodeURI(track.filePath.replace(/\\/g, '/'))}` : '')
    if (track.type === 'stream' && /^http:\/\//i.test(audioSrc) && window.hermesAvatar?.resolveMusicStream) {
      this._usedStreamProxy = true
      const proxyRes = await window.hermesAvatar.resolveMusicStream({
        url: audioSrc,
        title: track.title,
        artist: track.artist
      }).catch(() => null)
      if (reqId !== this._playReqId || !this.isPlaying) return
      if (proxyRes?.ok && proxyRes.proxyUrl) {
        audioSrc = proxyRes.proxyUrl
      }
    }

    if (audioSrc) {
      this.htmlAudio.volume = this.isMuted ? 0 : (this.isDucked ? this.volume * 0.2 : this.volume)
      this.htmlAudio.src = audioSrc
      this.htmlAudio.load()
      try {
        await this.htmlAudio.play()
      } catch (err) {
        if (reqId !== this._playReqId) return
        console.warn('[MusicPlayer] Gagal memutar link/file audio:', err)
      }
    }
  }

  pause() {
    this._playReqId = (this._playReqId || 0) + 1
    this.isPlaying = false
    this.stopBackgroundEngine()
    this.ytPlayer?.pauseVideo?.()
    this.stopYouTubeProgressTracker()
    this.lofiEngine?.stop()
    if (this.proceduralInterval) {
      clearInterval(this.proceduralInterval)
      this.proceduralInterval = null
    }
    this.htmlAudio.pause()
    this.updatePlayStateUi(false)
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause()
    } else {
      this.playTrack(this.currentTrackIndex)
    }
  }

  updatePlayStateUi(playing) {
    if (this.dom.playBtn) {
      this.dom.playBtn.innerHTML = renderIcon(playing ? 'pause' : 'play', { size: 17 })
      this.dom.playBtn.title = playing ? 'Jeda Musik' : 'Putar Musik'
    }
    if (this.dom.disc) {
      this.dom.disc.classList.toggle('playing', playing)
    }
    if (this.dom.eq) {
      this.dom.eq.classList.toggle('playing', playing)
    }
  }

  next() {
    if (this.tracks.length === 0) return

    if (this.isShuffle) {
      const nextIdx = Math.floor(Math.random() * this.tracks.length)
      this.playTrack(nextIdx)
      return
    }

    let nextIdx = this.currentTrackIndex + 1
    if (nextIdx >= this.tracks.length) {
      if (this.repeatMode === 'none') {
        this.pause()
        return
      }
      nextIdx = 0
    }

    this.playTrack(nextIdx)
  }

  prev() {
    if (this.tracks.length === 0) return

    const track = this.getCurrentTrack()
    if (track?.type === 'procedural') {
      if (this.proceduralElapsedSeconds > 3) {
        this.proceduralElapsedSeconds = 0
        return
      }
    } else if (this.htmlAudio.currentTime > 3) {
      this.htmlAudio.currentTime = 0
      return
    }

    let prevIdx = this.currentTrackIndex - 1
    if (prevIdx < 0) {
      prevIdx = this.tracks.length - 1
    }

    this.playTrack(prevIdx)
  }

  async handlePrematureStreamEnd(resumeTime) {
    const track = this.getCurrentTrack()
    if (!track || !this.isPlaying) return

    this._consecutivePrematureEnds = (this._consecutivePrematureEnds || 0) + 1
    if (this._consecutivePrematureEnds > 3) {
      this._consecutivePrematureEnds = 0
      console.warn('[MusicPlayer] Batas percobaan resume tercapai. Mencoba failover versi alternatif...')
      const switched = await this.tryAlternativeTrackFailover(track)
      if (!switched) {
        this.handleTrackEnded()
      }
      return
    }

    const ytId = track.videoId || extractYouTubeVideoId(track.url)
    if (ytId && window.hermesAvatar?.resolveMusicStream) {
      const res = await window.hermesAvatar.resolveMusicStream({
        url: track.url,
        videoId: ytId,
        title: track.title,
        artist: track.artist,
        forceRefresh: true
      }).catch(() => null)

      if (this.isPlaying && res?.ok && res.proxyUrl) {
        const targetUrl = res.proxyUrl
        const prevSrc = this.htmlAudio.src
        const onCanPlay = () => {
          if (resumeTime > 0 && this.htmlAudio.duration && isFinite(this.htmlAudio.duration) && resumeTime < this.htmlAudio.duration - 2) {
            this.htmlAudio.currentTime = resumeTime
          }
          this.htmlAudio.play().catch(() => {})
        }
        this.htmlAudio.addEventListener('canplay', onCanPlay, { once: true })
        if (prevSrc !== targetUrl) {
          this.htmlAudio.src = targetUrl
          this.htmlAudio.load()
        } else {
          this.htmlAudio.currentTime = resumeTime
          this.htmlAudio.play().catch(() => {})
        }
        return
      }
    }

    this.htmlAudio.currentTime = resumeTime
    this.htmlAudio.play().catch(() => this.handleTrackEnded())
  }

  async tryAlternativeTrackFailover(track) {
    if (!track || !track.title || this._tryingAlternative) return false
    this._tryingAlternative = true
    try {
      const currentVid = track.videoId || extractYouTubeVideoId(track.url)
      this.setOnlineDrawerStatus('Stream utama terkendala. Mencari versi audio alternatif resmi...', 'info')
      if (this.dom.badge) this.dom.badge.textContent = 'Mencari Alternatif…'

      const searchRes = await window.hermesAvatar?.searchOnlineMusic?.({
        title: track.title,
        artist: track.artist,
        query: `${track.artist || ''} ${track.title || ''}`.trim(),
        limit: 5
      }).catch(() => null)

      const candidates = Array.isArray(searchRes?.results) ? searchRes.results : []
      const alt = candidates.find((c) => c.videoId && c.videoId !== currentVid)

      if (alt && alt.videoId) {
        console.log(`[MusicPlayer] Beralih dari ${currentVid} ke alternatif audio resmi: ${alt.videoId} (${alt.title})`)
        track.videoId = alt.videoId
        track.url = `https://www.youtube.com/watch?v=${alt.videoId}`
        if (alt.title && alt.title !== 'YouTube Audio') track.title = alt.title
        if (alt.artist && alt.artist !== 'YouTube') track.artist = alt.artist
        if (alt.duration > 0) track.duration = alt.duration
        if (alt.thumbnail) track.thumbnail = alt.thumbnail
        track.badge = 'YouTube ▶'
        this.savePersistedData()
        this.updateCurrentTrackDisplay()
        this.setOnlineDrawerStatus(`Beralih ke versi audio alternatif: ${track.title}`, 'success')
        await this.playTrack(this.currentTrackIndex)
        return true
      }
    } catch (err) {
      console.warn('[MusicPlayer] Failover alternatif gagal:', err)
    } finally {
      this._tryingAlternative = false
    }
    return false
  }

  handleTrackEnded() {
    if (!this.isPlaying) return

    if (this.repeatMode === 'one') {
      const track = this.getCurrentTrack()
      if (track?.type === 'procedural' || this._activePlaybackEngine === 'electron-bg') {
        this.playTrack(this.currentTrackIndex)
      } else {
        this.htmlAudio.currentTime = 0
        this.htmlAudio.play().catch(() => {})
      }
    } else {
      this.next()
    }
  }

  seekTo(percent) {
    const track = this.getCurrentTrack()
    if (!track) return

    if (track.type === 'procedural') {
      this.proceduralElapsedSeconds = Math.floor((percent / 100) * 180)
      if (this.dom.currentTime) {
        this.dom.currentTime.textContent = this.formatTime(this.proceduralElapsedSeconds)
      }
    } else if (this._activePlaybackEngine === 'electron-bg' && track.duration > 0) {
      const sec = (percent / 100) * track.duration
      window.hermesAvatar?.controlBackgroundMusic?.('seek', { seconds: sec }).catch(() => {})
    } else if (this.htmlAudio.duration && isFinite(this.htmlAudio.duration)) {
      this.htmlAudio.currentTime = (percent / 100) * this.htmlAudio.duration
    }
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol))
    this.isMuted = this.volume === 0

    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.audioCtx.currentTime)
    }
    this.htmlAudio.volume = this.volume

    if (this._activePlaybackEngine === 'electron-bg') {
      window.hermesAvatar?.controlBackgroundMusic?.('volume', {
        volume: this.isDucked ? this.volume * 0.2 : this.volume
      }).catch(() => {})
    }

    // Kontrol volume YouTube player
    if (this.ytPlayer && this.ytReady) {
      try {
        this.ytPlayer.setVolume(this.volume * 100)
      } catch {}
    }

    const pct = Math.round(this.volume * 100)
    if (this.dom.volSlider) this.dom.volSlider.value = String(pct)
    if (this.dom.volLabel) this.dom.volLabel.textContent = `${pct}%`
    if (this.dom.muteBtn) {
      this.dom.muteBtn.innerHTML = renderIcon(this.isMuted ? 'volume-x' : 'volume-2', { size: 14 })
    }

    this.savePersistedData()
  }

  toggleMute() {
    if (this.isMuted) {
      this.setVolume(this.prevVolume || 0.7)
    } else {
      this.prevVolume = this.volume
      this.setVolume(0)
    }
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle
    if (this.dom.shuffleBtn) {
      this.dom.shuffleBtn.classList.toggle('active', this.isShuffle)
      this.dom.shuffleBtn.title = this.isShuffle ? 'Acak: Aktif' : 'Acak: Nonaktif'
    }
  }

  toggleRepeat() {
    const modes = ['all', 'one', 'none']
    const nextIdx = (modes.indexOf(this.repeatMode) + 1) % modes.length
    this.repeatMode = modes[nextIdx]

    if (this.dom.repeatBtn) {
      this.dom.repeatBtn.innerHTML = renderIcon('repeat', { size: 15 })
      if (this.repeatMode === 'all') {
        this.dom.repeatBtn.classList.add('active')
        this.dom.repeatBtn.title = 'Ulangi: Semua Lagu'
      } else if (this.repeatMode === 'one') {
        this.dom.repeatBtn.classList.add('active')
        this.dom.repeatBtn.title = 'Ulangi: Satu Lagu Saja (1x)'
      } else {
        this.dom.repeatBtn.classList.remove('active')
        this.dom.repeatBtn.title = 'Ulangi: Nonaktif'
      }
    }
  }

  toggleFavorite(trackId) {
    if (this.favorites.has(trackId)) {
      this.favorites.delete(trackId)
    } else {
      this.favorites.add(trackId)
    }

    this.savePersistedData()
    this.updateCurrentTrackDisplay()
    this.renderTracklist()
  }

  setCategory(category) {
    this.currentCategory = category
    this.dom.catBtns?.forEach((btn) => {
      const cat = btn.getAttribute('data-category')
      btn.classList.toggle('active', cat === category)
    })
    this.renderTracklist()
  }

  getFilteredTracks() {
    return this.tracks.filter((t) => {
      if (this.currentCategory === 'favorite' && !this.favorites.has(t.id)) {
        return false
      }
      if (this.currentCategory === 'focus' && t.category !== 'focus') {
        return false
      }
      if (this.currentCategory === 'chill' && t.category !== 'chill') {
        return false
      }
      if (this.currentCategory === 'online' && t.category !== 'online') {
        return false
      }
      if (this.currentCategory === 'local' && t.category !== 'local') {
        return false
      }

      if (this.searchQuery) {
        const titleMatch = t.title.toLowerCase().includes(this.searchQuery)
        const artistMatch = t.artist ? t.artist.toLowerCase().includes(this.searchQuery) : false
        const badgeMatch = t.badge ? t.badge.toLowerCase().includes(this.searchQuery) : false
        return titleMatch || artistMatch || badgeMatch
      }

      return true
    })
  }

  renderTracklist() {
    if (!this.dom.tracklist) return

    const filtered = this.getFilteredTracks()
    if (filtered.length === 0) {
      const onlineBtnHtml = this.searchQuery
        ? `<button type="button" id="music-empty-search-online-btn" class="music-empty-online-btn">Carikan &amp; Putar &ldquo;${escapeMusicHtml(this.searchQuery)}&rdquo; di Internet</button>`
        : '<small>Coba ubah kata kunci atau ganti filter kategori.</small>'
      this.dom.tracklist.innerHTML = `
        <div class="music-empty-state">
          <span>Tidak ada lagu yang cocok di daftar lokal</span>
          ${onlineBtnHtml}
        </div>
      `
      document.getElementById('music-empty-search-online-btn')?.addEventListener('click', () => {
        this.searchAndPlayOnline({ query: this.searchQuery, showResultsInDrawer: false })
      })
      return
    }

    this.dom.tracklist.innerHTML = filtered
      .map((track) => {
        const isCur = this.getCurrentTrack()?.id === track.id
        const isFav = this.favorites.has(track.id)
        const canDelete = track.id.startsWith('online-') || track.id.startsWith('local-')
        const durText =
          track.type === 'youtube'
            ? (track.duration ? this.formatTime(track.duration) : 'YouTube')
            : track.type === 'stream'
              ? 'LIVE'
              : track.duration
                ? this.formatTime(track.duration)
                : '∞'

        const ytId = track.videoId || extractYouTubeVideoId(track.url)
        const isLocal = track.category === 'local' || Boolean(track.filePath)
        const isDownloading = ytId ? this._downloadingTrackIds.has(ytId) : false
        const isCached = isLocal || (ytId ? this._cachedTrackIds.has(ytId) : false)

        let dlBtnHtml = ''
        if (track.type !== 'procedural') {
          if (isDownloading) {
            dlBtnHtml = `<button class="track-download-mini downloading" title="Sedang mengunduh lagu...">${renderIcon('loader-2', { size: 12 })}</button>`
          } else if (isCached) {
            dlBtnHtml = `<button class="track-download-mini downloaded" data-dl-id="${escapeMusicHtml(track.id)}" title="${isLocal ? 'File Musik Lokal (Klik untuk buka berkas)' : 'Tersimpan di Komputer (Klik untuk buka berkas)'}">${renderIcon('check', { size: 12, strokeWidth: 2.2 })}</button>`
          } else {
            dlBtnHtml = `<button class="track-download-mini" data-dl-id="${escapeMusicHtml(track.id)}" title="Unduh ke Penyimpanan Komputer">${renderIcon('download', { size: 12 })}</button>`
          }
        }

        const delBtn = canDelete
          ? `<button class="track-del-mini" data-del-id="${escapeMusicHtml(track.id)}" title="Hapus dari Penyimpanan Permanen">${renderIcon('trash-2', { size: 12 })}</button>`
          : ''

        return `
          <div class="music-track-item ${isCur ? 'active' : ''}" data-id="${escapeMusicHtml(track.id)}">
            <div class="track-left">
              <span class="track-play-indicator">${renderIcon(isCur && this.isPlaying ? 'volume-2' : 'play', { size: 12 })}</span>
              <div class="track-info">
                <span class="track-name" title="${escapeMusicHtml(track.title)}">${escapeMusicHtml(track.title)}</span>
                <span class="track-sub">${escapeMusicHtml(track.artist || 'Unknown')} • ${escapeMusicHtml(track.badge || 'Online')}</span>
              </div>
            </div>
            <div class="track-right">
              <span class="track-dur">${escapeMusicHtml(durText)}</span>
              ${dlBtnHtml}
              <button class="track-fav-mini ${isFav ? 'active' : ''}" data-fav-id="${escapeMusicHtml(track.id)}" title="${isFav ? 'Hapus dari Favorit' : 'Simpan ke Favorit'}">
                ${renderIcon('heart', { size: 12, strokeWidth: isFav ? 2.4 : 1.8 })}
              </button>
              ${delBtn}
            </div>
          </div>
        `
      })
      .join('')

    this.dom.tracklist.querySelectorAll('.music-track-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.track-fav-mini') || e.target.closest('.track-del-mini') || e.target.closest('.track-download-mini')) return
        const id = item.getAttribute('data-id')
        const fullIndex = this.tracks.findIndex((t) => t.id === id)
        if (fullIndex !== -1) {
          this.playTrack(fullIndex)
        }
      })
    })

    this.dom.tracklist.querySelectorAll('.track-fav-mini').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const id = btn.getAttribute('data-fav-id')
        if (id) {
          this.toggleFavorite(id)
        }
      })
    })

    this.dom.tracklist.querySelectorAll('.track-download-mini').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const id = btn.getAttribute('data-dl-id')
        const track = this.tracks.find((t) => t.id === id)
        if (track) {
          this.downloadTrack(track)
        }
      })
    })

    this.dom.tracklist.querySelectorAll('.track-del-mini').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const id = btn.getAttribute('data-del-id')
        if (id) {
          this.removeCustomTrack(id)
        }
      })
    })
  }

  async updateCurrentTrackDownloadUi(track) {
    if (!this.dom.downloadCtrlBtn) return
    if (!track) {
      this.dom.downloadCtrlBtn.hidden = true
      return
    }
    this.dom.downloadCtrlBtn.hidden = false

    const ytId = track.videoId || extractYouTubeVideoId(track.url)
    const isDownloading = ytId ? this._downloadingTrackIds.has(ytId) : false

    if (isDownloading) {
      this.dom.downloadCtrlBtn.innerHTML = renderIcon('loader-2', { size: 15 })
      this.dom.downloadCtrlBtn.className = 'music-ctrl-btn music-download-ctrl-btn downloading'
      this.dom.downloadCtrlBtn.title = 'Sedang mengunduh lagu...'
      return
    }

    if (track.category === 'local' || track.filePath) {
      this.dom.downloadCtrlBtn.innerHTML = renderIcon('check', { size: 15, strokeWidth: 2.2 })
      this.dom.downloadCtrlBtn.className = 'music-ctrl-btn music-download-ctrl-btn downloaded'
      this.dom.downloadCtrlBtn.title = 'File Lokal (Klik untuk buka file di folder)'
      return
    }

    if (track.type === 'procedural') {
      this.dom.downloadCtrlBtn.innerHTML = renderIcon('music', { size: 15 })
      this.dom.downloadCtrlBtn.className = 'music-ctrl-btn music-download-ctrl-btn'
      this.dom.downloadCtrlBtn.title = 'Synthesizer Lofi Browser Langsung'
      return
    }

    let isCached = ytId ? this._cachedTrackIds.has(ytId) : false
    if (!isCached && ytId && window.hermesAvatar?.checkMusicCached) {
      try {
        const res = await window.hermesAvatar.checkMusicCached({ videoId: ytId })
        if (res?.cached) {
          this._cachedTrackIds.add(ytId)
          isCached = true
        }
      } catch {}
    }

    if (isCached) {
      this.dom.downloadCtrlBtn.innerHTML = renderIcon('check', { size: 15, strokeWidth: 2.2 })
      this.dom.downloadCtrlBtn.className = 'music-ctrl-btn music-download-ctrl-btn downloaded'
      this.dom.downloadCtrlBtn.title = 'Tersimpan di Komputer (Klik untuk buka folder)'
    } else {
      this.dom.downloadCtrlBtn.innerHTML = renderIcon('download', { size: 15 })
      this.dom.downloadCtrlBtn.className = 'music-ctrl-btn music-download-ctrl-btn'
      this.dom.downloadCtrlBtn.title = 'Unduh / Simpan Lagu ke Komputer'
    }
  }

  async downloadCurrentTrack() {
    const track = this.getCurrentTrack()
    if (!track) return
    await this.downloadTrack(track)
  }

  async downloadTrack(track) {
    if (!track) return

    if (track.type === 'procedural') {
      this.setOnlineDrawerStatus('Lagu Lofi dihasilkan langsung oleh synthesizer audio browser (tidak perlu diunduh).', 'info')
      this.openOnlineDrawer()
      return
    }

    if (track.category === 'local' || track.filePath) {
      if (window.hermesAvatar?.openMusicFolder) {
        window.hermesAvatar.openMusicFolder({ filePath: track.filePath })
        this.setOnlineDrawerStatus(`Membuka berkas lokal: ${track.title}`, 'success')
      }
      return
    }

    const ytId = track.videoId || extractYouTubeVideoId(track.url)
    if (!ytId) {
      this.setOnlineDrawerStatus('Tautan audio stream online ini tidak mendukung unduhan otomatis.', 'error')
      this.openOnlineDrawer()
      return
    }

    if (this._cachedTrackIds.has(ytId)) {
      if (window.hermesAvatar?.openMusicFolder) {
        window.hermesAvatar.openMusicFolder({ videoId: ytId })
        this.setOnlineDrawerStatus(`Audio "${track.title}" sudah tersimpan di komputer. Membuka folder...`, 'success')
        this.openOnlineDrawer()
      }
      return
    }

    if (this._downloadingTrackIds.has(ytId)) {
      this.setOnlineDrawerStatus(`Sedang mengunduh "${track.title}" ke komputer...`, 'info')
      this.openOnlineDrawer()
      return
    }

    this._downloadingTrackIds.add(ytId)
    this.setOnlineDrawerStatus(`Mengunduh audio "${track.title}" ke komputer...`, 'info')
    this.openOnlineDrawer()
    this.renderTracklist()
    this.updateCurrentTrackDownloadUi(track)

    try {
      if (!window.hermesAvatar?.downloadMusicTrack) {
        throw new Error('Fitur unduh lagu belum terhubung di antarmuka.')
      }

      const res = await window.hermesAvatar.downloadMusicTrack({
        videoId: ytId,
        url: track.url || `https://www.youtube.com/watch?v=${ytId}`
      })

      if (res?.ok) {
        this._cachedTrackIds.add(ytId)
        track.cached = true
        if (res.filePath) {
          track.cachedPath = res.filePath
        }
        this.savePersistedData()
        this.setOnlineDrawerStatus(`Berhasil diunduh! "${track.title}" tersimpan di komputer (dapat diputar offline).`, 'success')
      } else {
        throw new Error(res?.error || 'Gagal mengunduh audio YouTube.')
      }
    } catch (err) {
      this.setOnlineDrawerStatus(`Unduhan gagal: ${err?.message || err}`, 'error')
    } finally {
      this._downloadingTrackIds.delete(ytId)
      this.renderTracklist()
      this.updateCurrentTrackDownloadUi(track)
    }
  }

  async checkAllCachedTracks() {
    if (!window.hermesAvatar?.checkMusicCached) return
    const candidateTracks = this.tracks.filter((t) => t.videoId || extractYouTubeVideoId(t.url))
    for (const tr of candidateTracks) {
      const vid = tr.videoId || extractYouTubeVideoId(tr.url)
      if (vid && !this._cachedTrackIds.has(vid)) {
        try {
          const res = await window.hermesAvatar.checkMusicCached({ videoId: vid })
          if (res?.cached) {
            this._cachedTrackIds.add(vid)
          }
        } catch {}
      }
    }
    this.renderTracklist()
    this.updateCurrentTrackDownloadUi(this.getCurrentTrack())
  }

  async importLocalTracks() {
    try {
      if (!window.hermesAvatar?.pickAudioFiles) {
        console.warn('[MusicPlayer] pickAudioFiles tidak tersedia di preload')
        return
      }

      const res = await window.hermesAvatar.pickAudioFiles()
      const pickedFiles = Array.isArray(res)
        ? res
        : (res?.ok && Array.isArray(res.files) ? res.files : [])
      if (pickedFiles.length === 0) {
        return
      }

      const newTracks = []
      for (const f of pickedFiles) {
        if (!f?.path && !f?.url) continue
        const fallbackTitle = (f.name || f.path || 'Lagu Lokal').split(/[\\/]/).pop().replace(/\.[^/.]+$/, '')
        const title = f.title || fallbackTitle
        const artist = f.artist || 'Lagu Lokal'
        const trackId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const audioUrl = f.url || `model://${encodeURI(f.path.replace(/\\/g, '/'))}`

        newTracks.push({
          id: trackId,
          title,
          artist,
          category: 'local',
          badge: 'Lokal',
          duration: 0,
          type: 'local',
          url: audioUrl,
          filePath: f.path
        })
      }

      this.localTracks.push(...newTracks)
      this.rebuildTracklist()
      this.savePersistedData()

      this.setCategory('local')

      const firstIdx = this.tracks.findIndex((t) => t.id === newTracks[0]?.id)
      if (firstIdx !== -1) {
        this.playTrack(firstIdx)
      }
    } catch (err) {
      console.error('[MusicPlayer] Gagal import file musik lokal:', err)
    }
  }

  getLibrarySnapshot() {
    const countCat = (cat) => this.tracks.filter((t) => t.category === cat).length
    return {
      categories: [
        { id: 'favorite', label: 'Favorit Saya', count: this.favorites.size },
        { id: 'online', label: 'Stream & YouTube', count: countCat('online') },
        { id: 'local', label: 'Musik Lokal', count: countCat('local') },
        { id: 'focus', label: 'Fokus Lofi', count: countCat('focus') },
        { id: 'chill', label: 'Santai Chill', count: countCat('chill') },
        { id: 'all', label: 'Semua Koleksi', count: this.tracks.length }
      ],
      tracks: [...this.tracks],
      favorites: [...this.favorites],
      onlineCustomCount: this.onlineTracks.length,
      localCustomCount: this.localTracks.length,
      currentTrack: this.getCurrentTrack(),
      isPlaying: this.isPlaying
    }
  }

  playTrackById(trackId) {
    const idx = this.tracks.findIndex((t) => t.id === trackId)
    if (idx === -1) return null
    this.playTrack(idx)
    return this.getCurrentTrack()
  }

  playCategory(category) {
    const targetCat = category || 'all'
    this.setCategory(targetCat)
    const filtered = this.getFilteredTracks()
    if (!filtered.length) return null
    return this.playTrackById(filtered[0].id)
  }

  findAndPlayTrack(query) {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return null

    const exact = this.tracks.find((t) =>
      t.title.toLowerCase() === q || (t.artist && t.artist.toLowerCase() === q)
    )
    if (exact) return this.playTrackById(exact.id)

    const partial = this.tracks.find((t) =>
      t.title.toLowerCase().includes(q) || (t.artist && t.artist.toLowerCase().includes(q))
    )
    if (partial) return this.playTrackById(partial.id)

    if (/\bfavorit|favorite|kesukaan\b/i.test(q)) return this.playCategory('favorite')
    if (/\blok?al|local\b/i.test(q)) return this.playCategory('local')
    if (/\bonline|youtube|radio|stream\b/i.test(q)) return this.playCategory('online')
    if (/\bfokus|focus|belajar|kerja\b/i.test(q)) return this.playCategory('focus')
    if (/\bsantai|chill|relax\b/i.test(q)) return this.playCategory('chill')

    return null
  }

  duck(isDucking) {
    this.isDucked = isDucking

    if (this._activePlaybackEngine === 'electron-bg') {
      window.hermesAvatar?.controlBackgroundMusic?.('volume', {
        volume: this.isMuted ? 0 : (isDucking ? this.volume * 0.2 : this.volume)
      }).catch(() => {})
    }

    // Ducking untuk YouTube Player
    if (this.ytPlayer && this.ytReady) {
      try {
        const targetYtVol = isDucking ? this.volume * 20 : this.volume * 100
        this.ytPlayer.setVolume(targetYtVol)
      } catch {}
    }

    if (!this.audioCtx || !this.duckGain) {
      if (this.htmlAudio) {
        this.htmlAudio.volume = isDucking ? this.volume * 0.2 : this.volume
      }
      return
    }

    const now = this.audioCtx.currentTime
    const targetGain = isDucking ? 0.2 : 1.0

    this.duckGain.gain.cancelScheduledValues(now)
    this.duckGain.gain.linearRampToValueAtTime(targetGain, now + (isDucking ? 0.25 : 0.45))

    if (this.htmlAudio) {
      this.htmlAudio.volume = isDucking ? this.volume * 0.2 : this.volume
    }
  }
}
