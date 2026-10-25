/**
 * live2d-avatar.js
 * Modul Live2D untuk Hermes Avatar (memakai pixi-live2d-display + pixi.js).
 * Mendukung window overlay transparan 1 layar, zoom in/out, drag bebas di desktop,
 * one-shot motion tanpa loop menumpuk, dan sleep mode sejati ala Virtual Companion.
 */

import * as PIXI from 'pixi.js'
import { Live2DModel } from 'pixi-live2d-display/cubism4'
import { voiceManager } from './voice-manager.js'

Live2DModel.registerTicker(PIXI.Ticker)

const STORAGE_KEYS = {
  pos: 'hermes-avatar-pos',
  scale: 'hermes-avatar-scale'
}

export class Live2DAvatar {
  constructor(container) {
    this.container = container

    const width = container.clientWidth || window.innerWidth || 1920
    const height = container.clientHeight || window.innerHeight || 1080

    this.app = new PIXI.Application({
      width,
      height,
      backgroundAlpha: 0,
      antialias: true,
      autoStart: true,
      clearBeforeRender: true,
      resolution: window.devicePixelRatio || 1
    })

    this.view = this.app.view
    this.view.id = 'live2d-canvas'
    this.view.style.position = 'absolute'
    this.view.style.inset = '0'
    this.view.style.width = '100%'
    this.view.style.height = '100%'
    this.view.style.zIndex = '1'
    this.view.style.pointerEvents = 'auto'

    container.appendChild(this.view)

    this.model = null
    this.expressions = []
    this.baseScale = 0.5
    this.scaleMultiplier = parseFloat(localStorage.getItem(STORAGE_KEYS.scale) || '1.0')

    this.isDragging = false
    this.isSleeping = false
    this.currentOutfit = 'casual' // 'casual' | 'focus' | 'suit'
    this.isTimerFocusActive = false
    this.ignoringMouse = true // Mulai dengan click-through aktif agar tembus ke desktop
    this._dragStartMouse = { x: 0, y: 0 }
    this._dragStartModel = { x: 0, y: 0 }
    this._motionTimer = null

    this.app.ticker.add((delta) => this.update(delta * 16.6))

    this._bindEvents()
    window.addEventListener('resize', () => this.handleResize())
  }

  async load(url) {
    console.log('[Live2DAvatar] Loading model from:', url)

    // Bersihkan stage terlebih dahulu untuk mencegah penumpukan ganda (ghosting)
    if (this.model) {
      try {
        this.app.stage.removeChild(this.model)
        this.model.destroy()
      } catch (e) {
        console.warn('[Live2DAvatar] Gagal membersihkan model lama:', e)
      }
      this.model = null
    }

    this.app.stage.removeChildren()

    this.model = await Live2DModel.from(url, {
      autoInteract: false
    })

    this.app.stage.addChild(this.model)
    this.handleResize(true)

    if (this.model.internalModel?.settings?.expressions) {
      this.expressions = this.model.internalModel.settings.expressions.map((e) => e.name || e.Name)
    }

    // Reset parameter pose tangan alternatif (Param30) & kepalan like (Param98) ke 0 agar tangan selalu kembali ke posisi rileks (mencegah bug tangan ganda)
    if (this.model.internalModel?.coreModel) {
      try {
        this.model.internalModel.coreModel.setParameterValueById('Param30', 0)
        this.model.internalModel.coreModel.setParameterValueById('Param98', 0)
      } catch {
        // abaikan jika model tidak memiliki parameter ini
      }
    }

    // Mainkan motion idle awal secara lembut
    try {
      await this.model.motion('', 0)
    } catch {
      // lewati bila motion awal belum ter-load
    }

    console.log('[Live2DAvatar] Model siap, ekspresi:', this.expressions.length)
    return this
  }

  handleResize(initial = false) {
    if (!this.model) return
    const w = this.container.clientWidth || window.innerWidth || 1920
    const h = this.container.clientHeight || window.innerHeight || 1080
    this.app.renderer.resize(w, h)

    this.model.anchor.set(0.5, 0.5)

    const modelH = this.model.internalModel?.height || this.model.internalModel?.originalHeight || 1200

    // Target tinggi default avatar ~520px pada layar
    this.baseScale = 520 / modelH
    this._applyScale()

    if (initial) {
      const savedPos = localStorage.getItem(STORAGE_KEYS.pos)
      if (savedPos) {
        try {
          const parsed = JSON.parse(savedPos)
          this.model.x = Math.max(100, Math.min(w - 100, parsed.x))
          this.model.y = Math.max(100, Math.min(h - 100, parsed.y))
          return
        } catch {
          // fallback
        }
      }
      this.resetPosition()
    }
  }

  _applyScale() {
    if (!this.model) return
    const s = this.baseScale * this.scaleMultiplier
    this.model.scale.set(s, s)
    localStorage.setItem(STORAGE_KEYS.scale, this.scaleMultiplier.toFixed(2))

    const badge = document.getElementById('zoom-level-badge')
    if (badge) {
      badge.textContent = `${Math.round(this.scaleMultiplier * 100)}%`
    }
    if (this.onScaleChange) {
      this.onScaleChange(this.scaleMultiplier)
    }
  }

  zoomIn(step = 0.15) {
    this.scaleMultiplier = Math.min(2.5, this.scaleMultiplier + step)
    this._applyScale()
    this.spawnHeart(this.model.x, this.model.y - 120, '🔍+')
  }

  zoomOut(step = 0.15) {
    this.scaleMultiplier = Math.max(0.35, this.scaleMultiplier - step)
    this._applyScale()
    this.spawnHeart(this.model.x, this.model.y - 120, '🔍-')
  }

  resetZoom() {
    this.scaleMultiplier = 1.0
    this._applyScale()
    this.spawnHeart(this.model.x, this.model.y - 120, '100%')
  }

  resetPosition() {
    if (!this.model) return
    const w = this.container.clientWidth || window.innerWidth || 1920
    const h = this.container.clientHeight || window.innerHeight || 1080
    // Posisi ideal default di kanan bawah
    this.model.x = w - 240
    this.model.y = h - 280
    localStorage.setItem(STORAGE_KEYS.pos, JSON.stringify({ x: this.model.x, y: this.model.y }))
    this.spawnHeart(this.model.x, this.model.y - 120, '📍')
  }

  /**
   * Hitung batas fisik visual avatar pada layar secara matematis.
   * Jauh lebih akurat dan terpercaya daripada getBounds() PixiContainer.
   */
  _getAvatarBounds() {
    if (!this.model) return null

    // Hitung ukuran visual aktual model pada canvas Pixi
    const visualW = this.model.width || (1000 * this.baseScale * this.scaleMultiplier)
    const visualH = this.model.height || (1200 * this.baseScale * this.scaleMultiplier)

    // Karakter memiliki anchor (0.5, 0.5)
    // Area aktif sentuhan tubuh adalah ~75% lebar dan ~95% tinggi model
    const halfW = (visualW * 0.75) / 2
    const halfH = (visualH * 0.95) / 2

    return {
      left: this.model.x - halfW,
      right: this.model.x + halfW,
      top: this.model.y - halfH,
      bottom: this.model.y + halfH,
      centerX: this.model.x,
      centerY: this.model.y,
      width: visualW,
      height: visualH
    }
  }

  _hitTestModel(clientX, clientY) {
    const bounds = this._getAvatarBounds()
    if (!bounds) return false

    return (
      clientX >= bounds.left &&
      clientX <= bounds.right &&
      clientY >= bounds.top &&
      clientY <= bounds.bottom
    )
  }

  lookAtPointer(clientX, clientY) {
    if (!this.model || this.isDragging || this.isSleeping) return

    const focusCtrl = this.model.internalModel?.focusController
    if (!focusCtrl) return

    // Titik tengah wajah/kepala avatar
    const bounds = this._getAvatarBounds()
    const headX = bounds ? bounds.centerX : this.model.x
    // Area wajah/mata berada di sekitar 22% dari batas atas tubuh avatar
    const headY = bounds ? (bounds.top + bounds.height * 0.22) : (this.model.y - 140)

    // Hitung jarak offset relatif kursor terhadap wajah avatar
    const dx = clientX - headX
    const dy = clientY - headY

    // Rentang jangkauan pandangan proporsional dalam piksel layar
    const spanX = Math.max(350, (window.innerWidth || 1920) * 0.45)
    const spanY = Math.max(250, (window.innerHeight || 1080) * 0.40)

    // Normalisasikan secara proporsional dan halus antara -1.0 dan +1.0
    const normX = Math.max(-1, Math.min(1, dx / spanX))
    // Sumbu Y Live2D: nilai positif ke atas (+ mendongak), negatif ke bawah (- menunduk)
    const normY = Math.max(-1, Math.min(1, -dy / spanY))

    // Gunakan focusController langsung agar interpolasi fisika bawaan Cubism berjalan mulus
    focusCtrl.focus(normX, normY)
  }

  clearPointerLookAt() {
    if (!this.model || this.isSleeping) return
    if (this.model.internalModel?.focusController) {
      this.model.internalModel.focusController.focus(0, 0)
    }
  }

  setMouthLevel(level) {
    if (!this.model?.internalModel?.coreModel || this.isSleeping) return
    const val = Math.max(0, Math.min(1, level))
    this.model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', val)
  }

  /**
   * Mode Tidur Sejati ala YourMother:
   * Menutup mata, menundukkan kepala, menghentikan eye-tracking kursor.
   */
  setSleepMode(enable) {
    this.isSleeping = enable
    if (!this.model?.internalModel?.coreModel) return

    const core = this.model.internalModel.coreModel

    if (enable) {
      this.clearPointerLookAt()
      core.setParameterValueById('ParamEyeLOpen', 0)
      core.setParameterValueById('ParamEyeROpen', 0)
      core.setParameterValueById('ParamAngleX', 2)
      core.setParameterValueById('ParamAngleY', -12)
      core.setParameterValueById('ParamBodyAngleY', -8)
    } else {
      core.setParameterValueById('ParamEyeLOpen', 1)
      core.setParameterValueById('ParamEyeROpen', 1)
      core.setParameterValueById('ParamAngleX', 0)
      core.setParameterValueById('ParamAngleY', 0)
      core.setParameterValueById('ParamBodyAngleY', 0)
    }
  }

  /**
   * Terapkan ekspresi emosi ke model Live2D.
   * Saat berpikir/reasoning -> kacamata (glasses / Param99).
   * Saat menyusun jawaban -> roll rambut (Charterer / 包租婆 / Param32 & Param58).
   * Saat ramah/senang -> rona pipi / hati (heart / blush / Param74).
   * Saat santai/selesai berbicara -> netral (lepas kacamata, roll rambut & rona pipi).
   */
  async setExpression(emotion) {
    if (!this.model) return
    if (this.isSleeping) {
      this.setSleepMode(false)
    }

    const em = (emotion || 'neutral').toLowerCase()
    this.currentEmotion = em

    // Map emosi standar AI Hermes ke file ekspresi Live2D Mother
    const expMap = {
      happy: 'heart',
      joy: 'heart',
      smile: 'heart',
      love: 'heart',
      heart: 'heart',
      blush: 'heart',
      friendly: 'heart',
      like: 'like',
      sad: 'blue',
      sorrow: 'blue',
      thinking: 'glasses',
      reasoning: 'glasses',
      focus: 'glasses',
      ponder: 'glasses',
      curious: 'glasses',
      composing: 'Charterer',
      generating: 'Charterer',
      charterer: 'Charterer',
      roll: 'Charterer',
      curlers: 'Charterer',
      wave: 'wave',
      neutral: null
    }

    const targetExp = expMap[em] !== undefined ? expMap[em] : em
    const core = this.model.internalModel?.coreModel

    // Jika beralih ke emosi selain focus/watch dan timer tidak aktif, kembalikan outfit ke casual
    if (!this.isTimerFocusActive) {
      this.currentOutfit = 'casual'
    }

    // 1. Bersihkan ekspresi internal lama agar tidak ada blending parameter yang tertinggal
    if (this.model.internalModel?.motionManager?.expressionManager) {
      try {
        this.model.internalModel.motionManager.expressionManager.resetExpression()
      } catch {}
    }

    // 2. Terapkan parameter Cubism langsung secara instan sebelum Promise ekspresi berjalan
    if (core) {
      try {
        if (['thinking', 'reasoning', 'focus', 'ponder', 'curious'].includes(em)) {
          // Mode Kacamata (Glasses / Param99) aktif saat berpikir/reasoning
          core.setParameterValueById('Param99', 1)
          core.setParameterValueById('Param74', 0) // Lepas tangan sarangheo
          core.setParameterValueById('Param108', 0) // Lepas tangan melambai
          core.setParameterValueById('Param98', 0)
          core.setParameterValueById('Param32', 0) // Lepas roll rambut
          core.setParameterValueById('Param58', 0)
          if (!this.isTimerFocusActive) {
            core.setParameterValueById('Param35', 0) // Lepas jas
            core.setParameterValueById('Param80', 0) // Lepas jam tangan
          }
          core.setParameterValueById('ParamBrowLAngle', 0.35)
          core.setParameterValueById('ParamBrowRAngle', -0.35)
          core.setParameterValueById('ParamBrowLY', 0.2)
        } else if (['composing', 'generating', 'charterer', 'roll', 'curlers'].includes(em)) {
          // Mode Roll Rambut (Charterer / 包租婆 / Param32 & Param58) aktif saat menyusun jawaban
          core.setParameterValueById('Param32', 1) // Roll rambut depan (包租婆前发)
          core.setParameterValueById('Param58', 1) // Roll rambut belakang (包租婆后发1)
          core.setParameterValueById('Param99', 0) // Lepas kacamata berpikir
          core.setParameterValueById('Param74', 0) // Lepas tangan sarangheo
          core.setParameterValueById('Param108', 0) // Lepas tangan melambai
          core.setParameterValueById('Param98', 0)
          if (!this.isTimerFocusActive) {
            core.setParameterValueById('Param35', 0) // Lepas jas
            core.setParameterValueById('Param80', 0) // Lepas jam tangan
          }
          core.setParameterValueById('ParamEyeLSmile', 0.6)
          core.setParameterValueById('ParamEyeRSmile', 0.6)
          core.setParameterValueById('ParamMouthForm', 0.3)
          core.setParameterValueById('ParamBrowLY', 0.15)
          core.setParameterValueById('ParamBrowRY', 0.15)
          core.setParameterValueById('ParamBrowLAngle', 0)
          core.setParameterValueById('ParamBrowRAngle', 0)
        } else if (['happy', 'joy', 'smile', 'love', 'heart', 'blush', 'friendly'].includes(em)) {
          // Mode Rona Pipi & Tangan Sarangheo (Param74)
          core.setParameterValueById('Param99', 0) // Lepas kacamata
          core.setParameterValueById('Param32', 0) // Lepas roll rambut
          core.setParameterValueById('Param58', 0)
          core.setParameterValueById('Param74', 1) // Aktifkan tangan sarangheo
          core.setParameterValueById('Param108', 0) // Lepas tangan melambai
          core.setParameterValueById('Param98', 0)
          core.setParameterValueById('Param35', 0) // Lepas jas
          core.setParameterValueById('Param80', 0) // Lepas jam tangan (cegah tumpuk dengan sarangheo!)
          core.setParameterValueById('ParamEyeLSmile', 1)
          core.setParameterValueById('ParamEyeRSmile', 1)
          core.setParameterValueById('ParamMouthForm', 1)
          core.setParameterValueById('ParamBrowLY', 0.2)
          core.setParameterValueById('ParamBrowRY', 0.2)
        } else if (['wave'].includes(em)) {
          // Mode Melambaikan Tangan (Param108)
          core.setParameterValueById('Param108', 1)
          core.setParameterValueById('Param74', 0)
          core.setParameterValueById('Param99', 0)
          core.setParameterValueById('Param32', 0)
          core.setParameterValueById('Param58', 0)
          core.setParameterValueById('Param98', 0)
          core.setParameterValueById('Param35', 0)
          core.setParameterValueById('Param80', 0)
          core.setParameterValueById('ParamEyeLSmile', 0.8)
          core.setParameterValueById('ParamEyeRSmile', 0.8)
          core.setParameterValueById('ParamMouthForm', 0.8)
        } else if (['sad', 'sorrow'].includes(em)) {
          core.setParameterValueById('Param99', 0)
          core.setParameterValueById('Param32', 0)
          core.setParameterValueById('Param58', 0)
          core.setParameterValueById('Param74', 0)
          core.setParameterValueById('Param108', 0)
          core.setParameterValueById('Param35', 0)
          core.setParameterValueById('Param80', 0)
          core.setParameterValueById('ParamMouthForm', -0.8)
          core.setParameterValueById('ParamBrowLY', -0.6)
          core.setParameterValueById('ParamBrowRY', -0.6)
        } else if (['neutral'].includes(em)) {
          // Kembali ke ekspresi santai/netral: lepas semua aksesoris & tangan
          core.setParameterValueById('Param99', 0)
          core.setParameterValueById('Param32', 0)
          core.setParameterValueById('Param58', 0)
          core.setParameterValueById('Param74', 0)
          core.setParameterValueById('Param108', 0)
          core.setParameterValueById('Param98', 0)
          if (!this.isTimerFocusActive) {
            core.setParameterValueById('Param35', 0)
            core.setParameterValueById('Param80', 0)
          }
          core.setParameterValueById('ParamEyeLSmile', 0)
          core.setParameterValueById('ParamEyeRSmile', 0)
          core.setParameterValueById('ParamMouthForm', 0)
          core.setParameterValueById('ParamBrowLY', 0)
          core.setParameterValueById('ParamBrowRY', 0)
          core.setParameterValueById('ParamBrowLAngle', 0)
          core.setParameterValueById('ParamBrowRAngle', 0)
        }
      } catch {
        // Abaikan jika parameter tidak didukung model
      }
    }

    // 3. Terapkan ekspresi resmi model Live2D jika ada
    try {
      if (targetExp) {
        await this.model.expression(targetExp)
      }
    } catch {
      // Abaikan jika ekspresi model tidak ditemukan
    }
  }

  /**
   * Mode ganti pakaian / outfit (ala YourMother):
   * - 'focus' / 'suit': Pakaian belajar/kerja (Jas Param35=1, Jam tangan Param80=1, Kacamata Param99=1)
   * - 'casual' / 'default': Pakaian santai (Param35=0, Param80=0, Param99=0)
   */
  setOutfit(outfitName = 'casual') {
    this.currentOutfit = outfitName
    this._applyOutfitParameters()
  }

  setTimerFocusMode(active, customStyle = null) {
    const isActivating = !!active
    if (this.isTimerFocusActive === isActivating && (!customStyle || this.watchStyle === customStyle)) return
    this.isTimerFocusActive = isActivating
    if (customStyle) this.watchStyle = customStyle
    this.currentOutfit = isActivating ? 'focus' : 'casual'
    this.playOutfitChangeAnimation(isActivating ? '⌚' : '🌸')
    this._applyOutfitParameters()
  }

  setWatchStyle(style) {
    this.watchStyle = style
    this.currentOutfit = 'focus'
    this.currentEmotion = 'neutral'

    // Reset ekspresi internal agar tidak ada sisa ekspresi gestur yang bertabrakan
    if (this.model?.internalModel?.motionManager?.expressionManager) {
      try {
        this.model.internalModel.motionManager.expressionManager.resetExpression()
      } catch {}
    }

    if (this.model?.internalModel?.coreModel) {
      const core = this.model.internalModel.coreModel
      try {
        core.setParameterValueById('Param74', 0) // Lepas tangan sarangheo
        core.setParameterValueById('Param108', 0) // Lepas tangan melambai
        core.setParameterValueById('Param98', 0)
        core.setParameterValueById('Param32', 0)
        core.setParameterValueById('Param58', 0)
      } catch {}
    }

    this.playOutfitChangeAnimation('⌚')
    this._applyOutfitParameters()
  }

  playOutfitChangeAnimation(symbol = '✨') {
    if (!this.model) return
    const x = this.model.x
    const y = this.model.y
    const icons = [symbol, '✨', '⭐', '💫', symbol]
    icons.forEach((ic, idx) => {
      setTimeout(() => {
        const ox = (Math.random() - 0.5) * 160
        const oy = (Math.random() - 0.5) * 180 - 60
        this.spawnHeart(x + ox, y + oy, ic)
      }, idx * 110)
    })
    try {
      this.model.motion('Touch', 0, 2)
    } catch {}
  }

  /**
   * Reset seluruh aksesoris, pakaian kerja/jam, dan raut wajah kembali ke normal / casual
   */
  resetAllAccessories() {
    this.currentEmotion = 'neutral'
    this.currentOutfit = 'casual'
    this.isTimerFocusActive = false
    this.watchStyle = null

    if (this.model?.internalModel?.motionManager?.expressionManager) {
      try {
        this.model.internalModel.motionManager.expressionManager.resetExpression()
      } catch {}
    }

    if (this.model?.internalModel?.coreModel) {
      const core = this.model.internalModel.coreModel
      try {
        core.setParameterValueById('Param35', 0) // Suit / Jas
        core.setParameterValueById('Param80', 0) // Watch / Jam tangan
        core.setParameterValueById('Param99', 0) // Glasses / Kacamata
        core.setParameterValueById('Param74', 0) // Tangan sarangheo
        core.setParameterValueById('Param108', 0) // Tangan melambai (wave)
        core.setParameterValueById('Param98', 0) // Kepalan tangan
        core.setParameterValueById('Param32', 0) // Roll rambut depan
        core.setParameterValueById('Param58', 0) // Roll rambut belakang
        core.setParameterValueById('ParamEyeLSmile', 0)
        core.setParameterValueById('ParamEyeRSmile', 0)
        core.setParameterValueById('ParamMouthForm', 0)
        core.setParameterValueById('ParamBrowLY', 0)
        core.setParameterValueById('ParamBrowRY', 0)
        core.setParameterValueById('ParamBrowLAngle', 0)
        core.setParameterValueById('ParamBrowRAngle', 0)
      } catch {}
    }
  }

  _applyOutfitParameters() {
    if (!this.model?.internalModel?.coreModel) return
    const core = this.model.internalModel.coreModel
    try {
      const style = this.watchStyle || 'watch_suit'
      if (this.currentOutfit === 'focus' || this.isTimerFocusActive) {
        // Matikan sarangheo, lambaian tangan, & roll rambut saat mode jam aktif
        core.setParameterValueById('Param74', 0)
        core.setParameterValueById('Param108', 0)
        core.setParameterValueById('Param98', 0)
        core.setParameterValueById('Param32', 0)
        core.setParameterValueById('Param58', 0)

        if (style === 'watch_suit') {
          core.setParameterValueById('Param35', 1) // Suit / Jas
          core.setParameterValueById('Param80', 1) // Watch / Jam tangan
          core.setParameterValueById('Param99', 1) // Glasses / Kacamata
        } else if (style === 'watch_only') {
          core.setParameterValueById('Param35', 0) // Santai
          core.setParameterValueById('Param80', 1) // Jam tangan saja
          core.setParameterValueById('Param99', 0)
        } else if (style === 'glasses_only') {
          core.setParameterValueById('Param35', 0)
          core.setParameterValueById('Param80', 0)
          core.setParameterValueById('Param99', 1) // Kacamata saja
        } else if (style === 'casual') {
          core.setParameterValueById('Param35', 0)
          core.setParameterValueById('Param80', 0)
          core.setParameterValueById('Param99', 0)
        }
      } else {
        core.setParameterValueById('Param35', 0)
        core.setParameterValueById('Param80', 0)
        if (!['thinking', 'reasoning', 'focus', 'ponder', 'curious'].includes(this.currentEmotion)) {
          core.setParameterValueById('Param99', 0)
        }
      }
    } catch (e) {
      // Abaikan jika parameter tidak tersedia di model
    }
  }

  /**
   * Mainkan animasi motion satu kali (One-Shot),
   * otomatis kembali ke Idle tanpa tabrakan timer.
   */
  async playEmote(name) {
    if (!this.model) return

    // Jika sedang tidur, bangunkan saat disentuh/ditepuk
    if (this.isSleeping) {
      this.setSleepMode(false)
    }

    try {
      if (name === 'wave') {
        await this.setExpression('wave')
        return
      }
      if (name === 'sarangheo') {
        await this.setExpression('happy')
        return
      }
      if (name === 'touch' || name === 'bounce') {
        await this.model.motion('Touch', 0, 3)
      } else if (name === 'slap' || name === 'angry') {
        await this.model.motion('Slap', 0, 3)
      } else {
        await this.model.motion('Idle', 0, 2)
      }
    } catch (e) {
      console.warn(`[Live2DAvatar] Motion error for ${name}:`, e)
    }
  }

  setAPose() {}

  availableExpressions() {
    return this.expressions || []
  }

  update(deltaMs) {
    if (this.model?.internalModel?.coreModel) {
      const core = this.model.internalModel.coreModel

      // 1. Kunci mata tetap tertutup bila sedang mode tidur
      if (this.isSleeping) {
        core.setParameterValueById('ParamEyeLOpen', 0)
        core.setParameterValueById('ParamEyeROpen', 0)
      } else if (this.currentEmotion) {
        // 2. Terapkan parameter raut wajah dinamis setiap frame sesuai emosi aktif
        try {
          if (['thinking', 'reasoning', 'focus', 'ponder', 'curious'].includes(this.currentEmotion)) {
            // Mode Kacamata (Glasses / Param99) saat berpikir
            core.setParameterValueById('Param99', 1)
            core.setParameterValueById('Param74', 0)
            core.setParameterValueById('Param108', 0)
            core.setParameterValueById('Param32', 0)
            core.setParameterValueById('Param58', 0)
            core.setParameterValueById('ParamBrowLAngle', 0.35)
            core.setParameterValueById('ParamBrowRAngle', -0.35)
            core.setParameterValueById('ParamBrowLY', 0.2)
          } else if (['composing', 'generating', 'charterer', 'roll', 'curlers'].includes(this.currentEmotion)) {
            // Mode Roll Rambut (Charterer / 包租婆 / Param32 & Param58) saat menyusun jawaban
            core.setParameterValueById('Param32', 1)
            core.setParameterValueById('Param58', 1)
            core.setParameterValueById('Param99', 0)
            core.setParameterValueById('Param74', 0)
            core.setParameterValueById('Param108', 0)
            core.setParameterValueById('ParamEyeLSmile', 0.6)
            core.setParameterValueById('ParamEyeRSmile', 0.6)
          } else if (['happy', 'joy', 'smile', 'love', 'heart', 'blush', 'friendly'].includes(this.currentEmotion)) {
            // Mode Rona Pipi & Tangan Sarangheo (Param74)
            core.setParameterValueById('Param99', 0)
            core.setParameterValueById('Param32', 0)
            core.setParameterValueById('Param58', 0)
            core.setParameterValueById('Param74', 1)
            core.setParameterValueById('Param108', 0)
            core.setParameterValueById('Param98', 0)
            core.setParameterValueById('Param35', 0)
            core.setParameterValueById('Param80', 0)
            core.setParameterValueById('ParamEyeLSmile', 1)
            core.setParameterValueById('ParamEyeRSmile', 1)
            core.setParameterValueById('ParamMouthForm', 1)
            core.setParameterValueById('ParamBrowLY', 0.2)
            core.setParameterValueById('ParamBrowRY', 0.2)
          } else if (['wave'].includes(this.currentEmotion)) {
            // Mode Melambaikan Tangan (Param108)
            core.setParameterValueById('Param108', 1)
            core.setParameterValueById('Param74', 0)
            core.setParameterValueById('Param99', 0)
            core.setParameterValueById('Param32', 0)
            core.setParameterValueById('Param58', 0)
            core.setParameterValueById('Param98', 0)
            core.setParameterValueById('Param35', 0)
            core.setParameterValueById('Param80', 0)
            core.setParameterValueById('ParamEyeLSmile', 0.8)
            core.setParameterValueById('ParamEyeRSmile', 0.8)
          } else if (['sad', 'sorrow'].includes(this.currentEmotion)) {
            core.setParameterValueById('Param99', 0)
            core.setParameterValueById('Param32', 0)
            core.setParameterValueById('Param58', 0)
            core.setParameterValueById('Param74', 0)
            core.setParameterValueById('Param108', 0)
            core.setParameterValueById('ParamMouthForm', -0.8)
            core.setParameterValueById('ParamBrowLY', -0.6)
            core.setParameterValueById('ParamBrowRY', -0.6)
          } else if (['angry'].includes(this.currentEmotion)) {
            core.setParameterValueById('Param99', 0)
            core.setParameterValueById('Param32', 0)
            core.setParameterValueById('Param58', 0)
            core.setParameterValueById('Param74', 0)
            core.setParameterValueById('Param108', 0)
            core.setParameterValueById('ParamBrowLAngle', -0.6)
            core.setParameterValueById('ParamBrowRAngle', 0.6)
            core.setParameterValueById('ParamMouthForm', -1)
          } else if (['neutral'].includes(this.currentEmotion)) {
            core.setParameterValueById('Param99', 0)
            core.setParameterValueById('Param32', 0)
            core.setParameterValueById('Param58', 0)
            core.setParameterValueById('Param74', 0)
            core.setParameterValueById('Param108', 0)
            core.setParameterValueById('Param98', 0)
          }
        } catch {
          // Abaikan jika ada parameter yang tidak didukung model
        }
      }

      // 3. Terapkan parameter outfit aktif setiap frame agar tidak tertimpa motion internal
      try {
        const style = this.watchStyle || 'watch_suit'
        const isConflictEmotion = ['happy', 'joy', 'smile', 'love', 'heart', 'blush', 'friendly', 'composing', 'charterer', 'roll', 'curlers', 'wave'].includes(this.currentEmotion)
        const isFocus = (this.currentOutfit === 'focus' || this.isTimerFocusActive) && !isConflictEmotion

        if (isFocus) {
          if (style === 'watch_suit') {
            core.setParameterValueById('Param35', 1) // Suit / Jas Kerja
            core.setParameterValueById('Param80', 1) // Watch / Jam tangan
            core.setParameterValueById('Param99', 1) // Glasses / Kacamata
          } else if (style === 'watch_only') {
            core.setParameterValueById('Param35', 0)
            core.setParameterValueById('Param80', 1)
            core.setParameterValueById('Param99', 0)
          } else if (style === 'glasses_only') {
            core.setParameterValueById('Param35', 0)
            core.setParameterValueById('Param80', 0)
            core.setParameterValueById('Param99', 1)
          } else if (style === 'casual') {
            core.setParameterValueById('Param35', 0)
            core.setParameterValueById('Param80', 0)
            core.setParameterValueById('Param99', 0)
          }
          // Matikan gestur yang bertabrakan dengan pose jam
          core.setParameterValueById('Param74', 0)
          core.setParameterValueById('Param108', 0)
          core.setParameterValueById('Param32', 0)
          core.setParameterValueById('Param58', 0)
          core.setParameterValueById('Param98', 0)
        } else {
          // Jika bukan mode fokus, pastikan jas & jam tangan selalu nonaktif
          core.setParameterValueById('Param35', 0)
          core.setParameterValueById('Param80', 0)
        }
      } catch {
        // Abaikan jika parameter tidak didukung model
      }
    }

    if (this.onUpdate) {
      this.onUpdate(deltaMs)
    }
  }

  spawnHeart(x, y, content = '💖') {
    const heart = document.createElement('div')
    heart.className = 'live2d-heart'
    heart.textContent = content
    heart.style.position = 'absolute'
    heart.style.left = `${x - 16}px`
    heart.style.top = `${y - 16}px`
    heart.style.pointerEvents = 'none'
    heart.style.fontSize = content.length > 2 ? '15px' : '28px'
    heart.style.fontWeight = 'bold'
    heart.style.color = '#ff5c8a'
    heart.style.textShadow = '0 2px 10px rgba(255, 92, 138, 0.7)'
    heart.style.zIndex = '9999'
    heart.style.transition = 'all 1s cubic-bezier(0.2, 0.8, 0.2, 1)'
    heart.style.opacity = '1'
    heart.style.transform = 'translateY(0) scale(1)'

    this.container.appendChild(heart)

    requestAnimationFrame(() => {
      heart.style.transform = 'translateY(-75px) scale(1.35)'
      heart.style.opacity = '0'
    })

    setTimeout(() => {
      heart.remove()
    }, 1000)
  }

  _bindEvents() {
    let movedDistance = 0

    // 0. Global OS Cursor Tracking ala YourMother (Desktop-wide look-at)
    if (window.hermesAvatar?.onCursorMove) {
      window.hermesAvatar.onCursorMove((point) => {
        if (!point) return
        // Mata & kepala menoleh mengikuti kursor di mana saja di seluruh layar Windows!
        this.lookAtPointer(point.x, point.y)
      })
    }

    // 1. Mouse move: Hit test presisi + Click-Through OS + Smooth Dragging
    window.addEventListener('mousemove', (e) => {
      const hitChar = this._hitTestModel(e.clientX, e.clientY)
      const hitUI = !!e.target.closest('.interactive-ui')

      // Tangkap klik HANYA jika kursor tepat di atas avatar, elemen UI interaktif (chat/menu/timer), atau sedang drag.
      // Area kosong di luar elemen tersebut TETAP tembus (click-through) agar pengguna bebas berinteraksi dengan aplikasi lain di desktop!
      const shouldCapture = hitChar || hitUI || this.isDragging

      if (shouldCapture && this.ignoringMouse) {
        window.hermesAvatar?.setIgnoreMouse(false)
        this.ignoringMouse = false
      } else if (!shouldCapture && !this.ignoringMouse) {
        window.hermesAvatar?.setIgnoreMouse(true, true)
        this.ignoringMouse = true
      }

      // Feedback kursor interaktif
      if (this.isDragging) {
        document.body.style.cursor = 'grabbing'
      } else if (hitChar && !hitUI) {
        document.body.style.cursor = 'grab'
      } else {
        document.body.style.cursor = 'default'
      }

      // Look-at kursor
      this.lookAtPointer(e.clientX, e.clientY)

      // Proses drag model avatar
      if (this.isDragging && this.model) {
        const dx = e.clientX - this._dragStartMouse.x
        const dy = e.clientY - this._dragStartMouse.y
        movedDistance += Math.hypot(dx, dy)

        const w = this.container.clientWidth || window.innerWidth || 1920
        const h = this.container.clientHeight || window.innerHeight || 1080

        this.model.x = Math.max(80, Math.min(w - 80, this._dragStartModel.x + dx))
        this.model.y = Math.max(120, Math.min(h - 120, this._dragStartModel.y + dy))

        if (this.onDrag) {
          this.onDrag(this.model.x, this.model.y)
        }
      }
    })

    // 2. Mouse down: Mulai drag
    window.addEventListener('mousedown', (e) => {
      if (e.target.closest('.interactive-ui')) return

      const hit = this._hitTestModel(e.clientX, e.clientY)
      if (!hit) return

      if (this.ignoringMouse) {
        window.hermesAvatar?.setIgnoreMouse(false)
        this.ignoringMouse = false
      }

      this.isDragging = true
      movedDistance = 0
      this._dragStartMouse = { x: e.clientX, y: e.clientY }
      this._dragStartModel = { x: this.model.x, y: this.model.y }
      document.body.style.cursor = 'grabbing'
    })

    // 3. Mouse up: Selesai drag atau deteksi klik
    window.addEventListener('mouseup', (e) => {
      if (!this.isDragging) return
      this.isDragging = false

      const hitChar = this._hitTestModel(e.clientX, e.clientY)
      document.body.style.cursor = hitChar ? 'grab' : 'default'

      if (movedDistance > 6) {
        // Drag selesai: simpan posisi baru
        localStorage.setItem(STORAGE_KEYS.pos, JSON.stringify({ x: this.model.x, y: this.model.y }))
        if (this.onDragEnd) this.onDragEnd(this.model.x, this.model.y)
      } else {
        // Klik murni pada avatar: HANYA buka/toggle menu aksi vertikal ala YourMother (MotherSelectMenu)
        // DILARANG memicu animasi sentuh (touch), suara, atau partikel hati agar tidak terjadi bug lengan ganda / ghost arm
        if (this.onAvatarClick) {
          this.onAvatarClick(e.clientX, e.clientY)
        }
      }
    })

    // 4. Mouse leave: Reset kursor & aktifkan click-through ke desktop
    window.addEventListener('mouseleave', () => {
      if (!this.isDragging && !this.ignoringMouse) {
        window.hermesAvatar?.setIgnoreMouse(true, true)
        this.ignoringMouse = true
        this.clearPointerLookAt()
        document.body.style.cursor = 'default'
      }
    })

    // 5. Mouse Wheel: Zoom in / Zoom out karakter halus
    window.addEventListener('wheel', (e) => {
      const hit = this._hitTestModel(e.clientX, e.clientY)
      if (!hit) return

      e.preventDefault()
      const delta = e.deltaY < 0 ? 0.08 : -0.08
      this.scaleMultiplier = Math.max(0.35, Math.min(2.5, this.scaleMultiplier + delta))
      this._applyScale()
    }, { passive: false })
  }

  destroy() {
    if (this._motionTimer) {
      clearTimeout(this._motionTimer)
      this._motionTimer = null
    }
    if (this.app) {
      this.app.destroy(true, { children: true, texture: true, baseTexture: true })
      this.app = null
    }
  }
}
