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

// Preset Lagu Bawaan (Procedural Ambient Lofi - Langsung Putar Offline)
const BUILTIN_TRACKS = [
  {
    id: 'builtin-1',
    title: 'Cozy Rain & Warm Rhodes',
    artist: 'Hermes Chill Beats',
    category: 'focus',
    badge: 'Fokus ☕',
    duration: 180,
    type: 'procedural',
    preset: 'cozy_rhodes'
  },
  {
    id: 'builtin-2',
    title: 'Midnight Study in Shibuya',
    artist: 'Tokyo Lofi Sessions',
    category: 'chill',
    badge: 'Santai 🌸',
    duration: 210,
    type: 'procedural',
    preset: 'shibuya_night'
  },
  {
    id: 'builtin-3',
    title: 'Cafe Latte Afternoon',
    artist: 'Hermes Companion',
    category: 'focus',
    badge: 'Fokus ☕',
    duration: 195,
    type: 'procedural',
    preset: 'cafe_latte'
  },
  {
    id: 'builtin-4',
    title: 'Deep Focus Space Ambient',
    artist: 'Zenith Ambient Labs',
    category: 'focus',
    badge: 'Fokus ☕',
    duration: 240,
    type: 'procedural',
    preset: 'space_ambient'
  },
  {
    id: 'builtin-5',
    title: 'Sakura Breeze Chillhop',
    artist: 'Akihiro & Hermes',
    category: 'chill',
    badge: 'Santai 🌸',
    duration: 175,
    type: 'procedural',
    preset: 'sakura_breeze'
  }
]

// Stasiun Radio & Lofi Live YouTube / Web Stream
const ONLINE_CURATED_STATIONS = [
  {
    id: 'online-yt-1',
    title: 'Lofi Hip Hop Radio - beats to relax/study to',
    artist: 'Lofi Girl',
    category: 'online',
    badge: 'YouTube ▶',
    duration: 0,
    type: 'youtube',
    videoId: 'jfKfPfyJRdk',
    url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk'
  },
  {
    id: 'online-yt-2',
    title: 'Synthwave Radio - chill synth / retro beats',
    artist: 'Lofi Girl Synthwave',
    category: 'online',
    badge: 'YouTube ▶',
    duration: 0,
    type: 'youtube',
    videoId: '4xDzrJKXOOY',
    url: 'https://www.youtube.com/watch?v=4xDzrJKXOOY'
  },
  {
    id: 'online-stream-1',
    title: 'Nightwave Plaza',
    artist: 'Vaporwave & City Pop Radio',
    category: 'online',
    badge: 'Live 24/7 🌐',
    duration: 0,
    type: 'stream',
    url: 'https://radio.plaza.one/mp3'
  },
  {
    id: 'online-stream-2',
    title: 'SomaFM Groove Salad',
    artist: 'Downtempo Ambient Chill',
    category: 'online',
    badge: 'Live 24/7 🌐',
    duration: 0,
    type: 'stream',
    url: 'https://ice2.somafm.com/groovesalad-128-mp3'
  },
  {
    id: 'online-stream-3',
    title: 'Deep Focus Space Drone',
    artist: 'SomaFM Drone Zone',
    category: 'online',
    badge: 'Live 24/7 🌐',
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
  const regExp = /(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/)|youtu\.be\/|music\.youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/i
  const match = url.match(regExp)
  return match ? match[1] : null
}

/**
 * Mengambil metadata resmi judul dan artis YouTube via oEmbed gratis (tanpa butuh API key)
 */
export async function fetchYouTubeInfo(videoId) {
  try {
    const targetUrl = encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)
    const res = await fetch(`https://www.youtube.com/oembed?url=${targetUrl}&format=json`)
    if (res.ok) {
      const data = await res.json()
      return {
        title: data.title || 'YouTube Audio',
        artist: data.author_name || 'YouTube Creator',
        thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      }
    }
  } catch (err) {
    console.warn('[YouTube oEmbed] Gagal fetch info:', err)
  }
  return null
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

    this.loadPersistedData()
    this.dom = {}
  }

  init() {
    this.cacheDom()
    this.initYouTubeApi()
    this.bindEvents()
    this.renderTracklist()
    this.updateCurrentTrackDisplay()
  }

  initYouTubeApi() {
    // Muat YouTube IFrame Player API secara dinamis
    if (!window.YT) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      const firstScriptTag = document.getElementsByTagName('script')[0]
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag)
    }

    const setupPlayer = () => {
      if (window.YT && window.YT.Player) {
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
            },
            onStateChange: (event) => {
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
                this.handleTrackEnded()
              }
            },
            onError: (err) => {
              console.warn('[YouTube Player] Error:', err)
              this.next()
            }
          }
        })
      } else {
        setTimeout(setupPlayer, 300)
      }
    }

    if (window.onYouTubeIframeAPIReady) {
      const oldReady = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        oldReady()
        setupPlayer()
      }
    } else {
      window.onYouTubeIframeAPIReady = setupPlayer
    }
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
    this.dom.muteBtn = document.getElementById('music-mute-btn')
    this.dom.volSlider = document.getElementById('music-vol-slider')
    this.dom.volLabel = document.getElementById('music-vol-label')
    this.dom.searchInput = document.getElementById('music-search-input')
    this.dom.searchClear = document.getElementById('music-search-clear')
    this.dom.catBtns = document.querySelectorAll('.music-cat-btn')
    this.dom.tracklist = document.getElementById('music-tracklist')
    this.dom.addLocalBtn = document.getElementById('music-add-local-btn')

    // Online & YouTube Stream Drawer
    this.dom.addOnlineToggleBtn = document.getElementById('music-add-online-toggle-btn')
    this.dom.onlineDrawer = document.getElementById('music-online-drawer')
    this.dom.onlineDrawerClose = document.getElementById('music-online-drawer-close')
    this.dom.onlineUrlInput = document.getElementById('music-online-url-input')
    this.dom.onlineTitleInput = document.getElementById('music-online-title-input')
    this.dom.onlineArtistInput = document.getElementById('music-online-artist-input')
    this.dom.onlineSubmitBtn = document.getElementById('music-online-submit-btn')
    this.dom.onlineResearchBtn = document.getElementById('music-online-research-btn')
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

      try {
        const source = this.audioCtx.createMediaElementSource(this.htmlAudio)
        source.connect(this.masterGain)
      } catch (err) {
        console.warn('[MusicPlayer] Direct media element source fallback:', err)
      }
    }

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume()
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

      this.tracks = [
        ...BUILTIN_TRACKS,
        ...ONLINE_CURATED_STATIONS,
        ...this.onlineTracks,
        ...this.localTracks
      ]

      const savedVol = localStorage.getItem('hermes-music-volume')
      if (savedVol !== null) {
        this.volume = Math.max(0, Math.min(1, parseFloat(savedVol)))
      }
    } catch (err) {
      console.warn('[MusicPlayer] Gagal memuat data tersimpan:', err)
    }
  }

  savePersistedData() {
    try {
      localStorage.setItem('hermes-music-favorites', JSON.stringify([...this.favorites]))
      localStorage.setItem('hermes-music-local-tracks', JSON.stringify(this.localTracks))
      localStorage.setItem('hermes-music-online-tracks', JSON.stringify(this.onlineTracks))
      localStorage.setItem('hermes-music-volume', String(this.volume))
    } catch (err) {
      console.warn('[MusicPlayer] Gagal menyimpan data:', err)
    }
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
    this.dom.addOnlineToggleBtn?.addEventListener('click', () => this.toggleOnlineDrawer())
    this.dom.onlineDrawerClose?.addEventListener('click', () => this.closeOnlineDrawer())
    this.dom.onlineSubmitBtn?.addEventListener('click', () => this.submitOnlineStream())
    this.dom.onlineResearchBtn?.addEventListener('click', () => this.requestAiMusicResearch())

    // Deteksi real-time input URL YouTube untuk auto-fill judul & channel
    this.dom.onlineUrlInput?.addEventListener('input', async (e) => {
      const val = e.target.value.trim()
      const ytId = extractYouTubeVideoId(val)
      if (ytId) {
        const info = await fetchYouTubeInfo(ytId)
        if (info) {
          if (this.dom.onlineTitleInput && !this.dom.onlineTitleInput.value) {
            this.dom.onlineTitleInput.value = info.title
          }
          if (this.dom.onlineArtistInput && !this.dom.onlineArtistInput.value) {
            this.dom.onlineArtistInput.value = info.artist
          }
        }
      }
    })

    this.htmlAudio.addEventListener('timeupdate', () => {
      if (this.isPlaying && this.getCurrentTrack()?.type !== 'procedural' && this.getCurrentTrack()?.type !== 'youtube') {
        const cur = this.htmlAudio.currentTime || 0
        const dur = this.htmlAudio.duration || 1
        if (this.dom.currentTime) this.dom.currentTime.textContent = this.formatTime(cur)
        if (this.dom.duration && !isNaN(dur) && dur > 0 && isFinite(dur)) {
          this.dom.duration.textContent = this.formatTime(dur)
          if (this.dom.seekBar) {
            this.dom.seekBar.value = String((cur / dur) * 100)
          }
        }
      }
    })

    this.htmlAudio.addEventListener('ended', () => {
      this.handleTrackEnded()
    })

    this.htmlAudio.addEventListener('error', (e) => {
      console.warn('[MusicPlayer] Audio playback error:', e)
      this.next()
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

  async submitOnlineStream() {
    const url = this.dom.onlineUrlInput?.value?.trim()
    if (!url) {
      alert('Silakan masukkan link/URL audio atau link YouTube terlebih dahulu.')
      return
    }

    const ytId = extractYouTubeVideoId(url)
    let title = this.dom.onlineTitleInput?.value?.trim()
    let artist = this.dom.onlineArtistInput?.value?.trim()
    let thumbnail = null

    if (ytId) {
      const ytInfo = await fetchYouTubeInfo(ytId)
      if (ytInfo) {
        title = title || ytInfo.title
        artist = artist || ytInfo.artist
        thumbnail = ytInfo.thumbnail
      }
    }

    title = title || (ytId ? 'YouTube Audio' : 'Online Audio Stream')
    artist = artist || (ytId ? 'YouTube' : 'Internet Web Radio')

    this.addOnlineTrack({ title, artist, url, videoId: ytId, thumbnail })

    if (this.dom.onlineUrlInput) this.dom.onlineUrlInput.value = ''
    if (this.dom.onlineTitleInput) this.dom.onlineTitleInput.value = ''
    if (this.dom.onlineArtistInput) this.dom.onlineArtistInput.value = ''
    this.closeOnlineDrawer()
  }

  addOnlineTrack({ title, artist, url, videoId, thumbnail }) {
    if (!url) return
    const isYt = !!videoId
    const trackId = `online-${Date.now()}`
    const newTrack = {
      id: trackId,
      title: title || (isYt ? 'YouTube Audio' : 'Internet Stream'),
      artist: artist || (isYt ? 'YouTube' : 'Web Radio'),
      category: 'online',
      badge: isYt ? 'YouTube ▶' : 'Live 🌐',
      duration: 0,
      type: isYt ? 'youtube' : 'stream',
      videoId: videoId || null,
      thumbnail: thumbnail || null,
      url
    }

    this.onlineTracks.push(newTrack)
    this.tracks.push(newTrack)
    this.savePersistedData()
    this.setCategory('online')

    const idx = this.tracks.findIndex((t) => t.id === trackId)
    if (idx !== -1) {
      this.playTrack(idx)
    }
  }

  requestAiMusicResearch() {
    this.closeOnlineDrawer()
    window.dispatchEvent(
      new CustomEvent('hermes:request-music-research', {
        detail: {
          prompt: 'Tolong carikan rekomendasi link stasiun lofi radio atau link musik santai YouTube gratis di internet untuk menemaniku fokus bekerja.'
        }
      })
    )
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
      this.dom.badge.textContent = track.badge || (track.category === 'online' ? 'Live 🌐' : track.category === 'local' ? 'Lokal 📁' : 'Musik 🎵')
      this.dom.badge.classList.toggle('badge-youtube', track.type === 'youtube')
    }

    const isFav = this.favorites.has(track.id)
    if (this.dom.favBtn) {
      this.dom.favBtn.textContent = isFav ? '❤️' : '🤍'
      this.dom.favBtn.classList.toggle('active', isFav)
    }

    if (this.dom.discIcon) {
      if (track.type === 'youtube') {
        this.dom.discIcon.textContent = '▶'
      } else if (track.category === 'online') {
        this.dom.discIcon.textContent = '🌐'
      } else if (track.category === 'local') {
        this.dom.discIcon.textContent = '📁'
      } else {
        this.dom.discIcon.textContent = track.category === 'focus' ? '☕' : '🌸'
      }
    }

    if (track.type === 'procedural') {
      if (this.dom.duration) this.dom.duration.textContent = '∞'
      if (this.dom.currentTime) this.dom.currentTime.textContent = this.formatTime(this.proceduralElapsedSeconds)
    } else if (track.type === 'youtube') {
      const dur = this.ytPlayer?.getDuration?.() || 0
      if (this.dom.duration) this.dom.duration.textContent = dur > 0 ? this.formatTime(dur) : 'LIVE'
    } else if (track.type === 'stream') {
      if (this.dom.duration) this.dom.duration.textContent = 'LIVE'
      if (this.dom.currentTime) this.dom.currentTime.textContent = '●'
    } else {
      if (this.dom.duration) {
        this.dom.duration.textContent = track.duration ? this.formatTime(track.duration) : '--:--'
      }
    }

    this.renderTracklist()
  }

  playTrack(index) {
    this.ensureAudioContext()

    if (index >= 0 && index < this.tracks.length) {
      this.currentTrackIndex = index
    }

    const track = this.getCurrentTrack()
    if (!track) return

    this.isPlaying = true

    if (this.proceduralInterval) {
      clearInterval(this.proceduralInterval)
      this.proceduralInterval = null
    }

    if (track.type === 'youtube') {
      // Hentikan procedural synth & audio html
      this.lofiEngine?.stop()
      this.htmlAudio.pause()
      this.htmlAudio.currentTime = 0

      if (this.ytPlayer && this.ytReady) {
        this.ytPlayer.loadVideoById(track.videoId)
        this.ytPlayer.playVideo()
        this.ytPlayer.setVolume(this.volume * 100)
        this.startYouTubeProgressTracker()
      } else {
        console.warn('[YouTube Player] YouTube API belum siap, mencoba lagi...')
        setTimeout(() => this.playTrack(index), 500)
      }
    } else if (track.type === 'procedural') {
      // Hentikan YouTube & HTML audio
      this.ytPlayer?.pauseVideo?.()
      this.stopYouTubeProgressTracker()
      this.htmlAudio.pause()
      this.htmlAudio.currentTime = 0

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
    } else {
      // Audio lokal atau internet stream
      this.ytPlayer?.pauseVideo?.()
      this.stopYouTubeProgressTracker()
      this.lofiEngine?.stop()

      if (track.url) {
        this.htmlAudio.src = track.url
        this.htmlAudio.play().catch((err) => {
          console.warn('[MusicPlayer] Gagal memutar link/file audio:', err)
        })
      }
    }

    this.updatePlayStateUi(true)
    this.updateCurrentTrackDisplay()
  }

  pause() {
    this.isPlaying = false
    const track = this.getCurrentTrack()

    if (track?.type === 'youtube') {
      this.ytPlayer?.pauseVideo?.()
      this.stopYouTubeProgressTracker()
    } else if (track?.type === 'procedural') {
      this.lofiEngine?.stop()
      if (this.proceduralInterval) {
        clearInterval(this.proceduralInterval)
        this.proceduralInterval = null
      }
    } else {
      this.htmlAudio.pause()
    }

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
      this.dom.playBtn.textContent = playing ? '⏸' : '▶'
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
    if (track?.type === 'youtube') {
      const cur = this.ytPlayer?.getCurrentTime?.() || 0
      if (cur > 3) {
        this.ytPlayer?.seekTo?.(0, true)
        return
      }
    } else if (this.htmlAudio.currentTime > 3 || this.proceduralElapsedSeconds > 3) {
      if (track?.type === 'procedural') {
        this.proceduralElapsedSeconds = 0
      } else {
        this.htmlAudio.currentTime = 0
      }
      return
    }

    let prevIdx = this.currentTrackIndex - 1
    if (prevIdx < 0) {
      prevIdx = this.tracks.length - 1
    }

    this.playTrack(prevIdx)
  }

  handleTrackEnded() {
    if (this.repeatMode === 'one') {
      const track = this.getCurrentTrack()
      if (track?.type === 'youtube') {
        this.ytPlayer?.seekTo?.(0, true)
        this.ytPlayer?.playVideo?.()
      } else if (track?.type === 'procedural') {
        this.playTrack(this.currentTrackIndex)
      } else {
        this.htmlAudio.currentTime = 0
        this.htmlAudio.play()
      }
    } else {
      this.next()
    }
  }

  seekTo(percent) {
    const track = this.getCurrentTrack()
    if (!track) return

    if (track.type === 'youtube') {
      const dur = this.ytPlayer?.getDuration?.() || 0
      if (dur > 0) {
        const sec = (percent / 100) * dur
        this.ytPlayer?.seekTo?.(sec, true)
      }
    } else if (track.type === 'procedural') {
      this.proceduralElapsedSeconds = Math.floor((percent / 100) * 180)
      if (this.dom.currentTime) {
        this.dom.currentTime.textContent = this.formatTime(this.proceduralElapsedSeconds)
      }
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
      this.dom.muteBtn.textContent = this.isMuted ? '🔇' : pct > 50 ? '🔊' : '🔉'
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
      if (this.repeatMode === 'all') {
        this.dom.repeatBtn.textContent = '🔁'
        this.dom.repeatBtn.classList.add('active')
        this.dom.repeatBtn.title = 'Ulangi: Semua Lagu'
      } else if (this.repeatMode === 'one') {
        this.dom.repeatBtn.textContent = '🔂'
        this.dom.repeatBtn.classList.add('active')
        this.dom.repeatBtn.title = 'Ulangi: Satu Lagu Saja'
      } else {
        this.dom.repeatBtn.textContent = '🔁'
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
      this.dom.tracklist.innerHTML = `
        <div class="music-empty-state">
          <span>🎵 Tidak ada lagu yang cocok</span>
          <small>Coba ubah kata kunci atau ganti filter kategori.</small>
        </div>
      `
      return
    }

    this.dom.tracklist.innerHTML = filtered
      .map((track) => {
        const isCur = this.getCurrentTrack()?.id === track.id
        const isFav = this.favorites.has(track.id)
        const durText =
          track.type === 'youtube'
            ? 'YouTube'
            : track.type === 'stream'
              ? 'LIVE'
              : track.duration
                ? this.formatTime(track.duration)
                : '∞'

        return `
          <div class="music-track-item ${isCur ? 'active' : ''}" data-id="${track.id}">
            <div class="track-left">
              <span class="track-play-indicator">${isCur && this.isPlaying ? '🔊' : (track.type === 'youtube' ? '▶' : '▶')}</span>
              <div class="track-info">
                <span class="track-name" title="${track.title}">${track.title}</span>
                <span class="track-sub">${track.artist || 'Unknown'} • ${track.badge || 'Online'}</span>
              </div>
            </div>
            <div class="track-right">
              <span class="track-dur">${durText}</span>
              <button class="track-fav-mini ${isFav ? 'active' : ''}" data-fav-id="${track.id}" title="Favorit">
                ${isFav ? '❤️' : '🤍'}
              </button>
            </div>
          </div>
        `
      })
      .join('')

    this.dom.tracklist.querySelectorAll('.music-track-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.track-fav-mini')) return
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
  }

  async importLocalTracks() {
    try {
      if (!window.hermesAvatar?.pickAudioFiles) {
        console.warn('[MusicPlayer] pickAudioFiles tidak tersedia di preload')
        return
      }

      const res = await window.hermesAvatar.pickAudioFiles()
      if (!res?.ok || !Array.isArray(res.files) || res.files.length === 0) {
        return
      }

      const newTracks = []
      for (const f of res.files) {
        const title = f.name.replace(/\.[^/.]+$/, '')
        const trackId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const audioUrl = `model://${encodeURI(f.path.replace(/\\/g, '/'))}`

        newTracks.push({
          id: trackId,
          title,
          artist: 'Lagu Lokal',
          category: 'local',
          badge: 'Lokal 📁',
          duration: 0,
          type: 'local',
          url: audioUrl,
          filePath: f.path
        })
      }

      this.localTracks.push(...newTracks)
      this.tracks.push(...newTracks)
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

  duck(isDucking) {
    this.isDucked = isDucking

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
