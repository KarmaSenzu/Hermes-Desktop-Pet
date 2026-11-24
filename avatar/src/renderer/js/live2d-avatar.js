/**
 * live2d-avatar.js
 * Modul Live2D untuk Hermes Avatar (memakai pixi-live2d-display + pixi.js).
 * Mendukung window overlay transparan 1 layar, zoom in/out, drag bebas di desktop,
 * one-shot motion tanpa loop menumpuk, dan sleep mode sejati ala Virtual Companion.
 */

import * as PIXI from 'pixi.js'
import { Live2DModel } from 'pixi-live2d-display/cubism4'
import { voiceManager } from './voice-manager.js'
import { PERF } from './perf-config.js'

Live2DModel.registerTicker(PIXI.Ticker)
// Matikan auto-mipmap pada tekstur Live2D (2048/1024 POT) untuk menghemat ~33% VRAM
PIXI.settings.MIPMAP_TEXTURES = PIXI.MIPMAP_MODES.OFF

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
      antialias: false,
      autoStart: true,
      clearBeforeRender: true,
      resolution: Math.min(window.devicePixelRatio || 1, PERF.MAX_DPR),
      autoDensity: true,
      powerPreference: 'low-power'
    })

    this.app.ticker.maxFPS = PERF.ACTIVE_FPS

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
    this.isMotherModel = false
    this.isEllenModel = false
    this.isFernModel = false
    this.isChangliModel = false
    this.isAsukaModel = false
    this.isFrierenModel = false
    this._dragStartMouse = { x: 0, y: 0 }
    this._dragStartModel = { x: 0, y: 0 }
    this._motionTimer = null

    this._tickerFn = (delta) => this.update(delta * 16.6)
    this.app.ticker.add(this._tickerFn)

    this._bindEvents()
    this._onResize = () => this.handleResize()
    window.addEventListener('resize', this._onResize)

    this._onVisibilityChange = () => {
      if (!this.app || !this.app.ticker) return
      if (document.hidden) {
        this.app.ticker.stop()
      } else {
        this.app.ticker.start()
      }
    }
    document.addEventListener('visibilitychange', this._onVisibilityChange)
  }

  setPerfMode(mode) {
    if (!this.app || !this.app.ticker) return
    // Mode: 'active' | 'idle' | 'unfocused'
    // Hemat utama via FPS (murah & tanpa efek samping visual). Mengubah resolusi render
    // (DPR) saat runtime di Pixi v6 berisiko menggeser posisi/ukuran model pada layar
    // HiDPI, jadi TIDAK dilakukan di sini — stabilitas visual diprioritaskan.
    let targetFps = PERF.ACTIVE_FPS
    if (mode === 'idle') {
      targetFps = PERF.IDLE_FPS
    } else if (mode === 'unfocused') {
      targetFps = PERF.UNFOCUSED_FPS
    }
    this.app.ticker.maxFPS = targetFps
  }

  _setMotherParam(core, id, value) {
    if (!this.isMotherModel || !core || typeof core.setParameterValueById !== 'function') return
    core.setParameterValueById(id, value)
  }

  async load(url) {
    console.log('[Live2DAvatar] Loading model from:', url)

    const urlNorm = decodeURIComponent(String(url || '')).toLowerCase()
    this.isMotherModel = /(?:^|[/\\])mother[/\\]|20250106/.test(urlNorm)
    this.isEllenModel = /(?:^|[/\\])ellen[/\\]|免费模型艾莲/.test(urlNorm)
    this.isFernModel = /(?:^|[/\\])fern[/\\]|fern\.model3\.json/.test(urlNorm)
    this.isChangliModel = /(?:^|[/\\])changli[/\\]|长离/.test(urlNorm)
    this.isAsukaModel = /(?:^|[/\\])asuka[/\\]|asuka\.model3\.json/.test(urlNorm)
    this.isFrierenModel = /(?:^|[/\\])frieren[/\\]|frieren\.model3\.json/.test(urlNorm)

    // Bersihkan stage terlebih dahulu untuk mencegah penumpukan ganda (ghosting) & kebocoran tekstur GPU
    if (this.model) {
      try {
        this.app.stage.removeChild(this.model)
        this.model.destroy({ texture: true, baseTexture: true })
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

    if (this.model.internalModel?.coreModel) {
      const core = this.model.internalModel.coreModel

      // Reset parameter pose tangan alternatif khusus Mother (Param30 & Param98)
      if (this.isMotherModel) {
        try {
          this._setMotherParam(core, 'Param30', 0)
          this._setMotherParam(core, 'Param98', 0)
        } catch {
          // abaikan
        }
      }

      // Konfigurasi part, parameter watermark, dan anti-ghosting tangan spesifik per-model secara presisi.
      // PENTING: Jangan pernah mematikan Part17 secara global karena pada Frieren Part17 = seluruh tubuh!
      try {
        const rawDrawables = core._model?.drawables
        const drawableIds = Array.isArray(rawDrawables?.ids) || ArrayBuffer.isView(rawDrawables?.ids)
          ? Array.from(rawDrawables.ids)
          : []
        const hiddenDrawableIndices = new Set()

        if (this.isEllenModel) {
          if (typeof core.setPartOpacityById === 'function') {
            core.setPartOpacityById('Part17', 0)
          }
          if (typeof core.setParameterValueById === 'function') {
            core.setParameterValueById('Paramheadxy', 0)
          }
        }

        if (this.isFernModel) {
          if (typeof core.setParameterValueById === 'function') {
            core.setParameterValueById('Param33', 1)
          }
          for (const wmId of ['ArtMesh130', 'ArtMesh129', 'ArtMesh143', 'ArtMesh133', 'ArtMesh146']) {
            const idx = drawableIds.indexOf(wmId)
            if (idx >= 0) hiddenDrawableIndices.add(idx)
          }
        }

        if (this.isChangliModel) {
          if (typeof core.setPartOpacityById === 'function') {
            core.setPartOpacityById('Part53', 0)
          }
          const wmIdx = drawableIds.indexOf('ArtMesh414')
          if (wmIdx >= 0) hiddenDrawableIndices.add(wmIdx)
        }

        let asukaWaveArmIndices = null
        let asukaLowerArmIndices = null
        if (this.isAsukaModel) {
          if (typeof core.setParameterValueById === 'function') {
            core.setParameterValueById('Param55', 0)
            core.setParameterValueById('Param54', 0)
          }
          asukaWaveArmIndices = new Set(
            ['ArtMesh0', 'ArtMesh1'].map((id) => drawableIds.indexOf(id)).filter((idx) => idx >= 0)
          )
          asukaLowerArmIndices = new Set(
            ['ArtMesh114', 'ArtMesh116'].map((id) => drawableIds.indexOf(id)).filter((idx) => idx >= 0)
          )
        }

        if (hiddenDrawableIndices.size > 0 && rawDrawables?.opacities) {
          for (const idx of hiddenDrawableIndices) {
            rawDrawables.opacities[idx] = 0
          }
        }

        if (
          typeof core.getDrawableOpacity === 'function' &&
          (hiddenDrawableIndices.size > 0 || (asukaWaveArmIndices && asukaWaveArmIndices.size > 0))
        ) {
          const origGetDrawableOpacity = core.getDrawableOpacity.bind(core)
          core.getDrawableOpacity = (idx) => {
            if (hiddenDrawableIndices.has(idx)) return 0
            if (asukaWaveArmIndices && (asukaWaveArmIndices.has(idx) || asukaLowerArmIndices.has(idx))) {
              const toggleVal = typeof core.getParameterValueById === 'function'
                ? Number(core.getParameterValueById('Param55'))
                : 0
              const isWaving = Number.isFinite(toggleVal) && toggleVal >= 0.5
              if (asukaWaveArmIndices.has(idx)) return isWaving ? 1 : 0
              if (asukaLowerArmIndices.has(idx)) return isWaving ? 0 : 1
            }
            return origGetDrawableOpacity(idx)
          }
        }
      } catch {
        // abaikan jika model tidak memiliki part/param spesifik ini
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
          if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
            this.model.x = Math.max(100, Math.min(w - 100, parsed.x))
            this.model.y = Math.max(100, Math.min(h - 100, parsed.y))
            return
          }
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
    if (this.model) {
      this.spawnHeart(this.model.x, this.model.y - 120, '🔍+')
    }
  }

  zoomOut(step = 0.15) {
    this.scaleMultiplier = Math.max(0.35, this.scaleMultiplier - step)
    this._applyScale()
    if (this.model) {
      this.spawnHeart(this.model.x, this.model.y - 120, '🔍-')
    }
  }

  resetZoom() {
    this.scaleMultiplier = 1.0
    this._applyScale()
    if (this.model) {
      this.spawnHeart(this.model.x, this.model.y - 120, '100%')
    }
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

    // Khusus Asuka: lambaian tangan dijalankan lewat motion one-shot 'Wave', bukan menahan state wave
    if (this.isAsukaModel && em === 'wave') {
      this.currentEmotion = 'neutral'
      try {
        await this.model.motion('Wave', 0, 3)
      } catch {}
      return
    }

    this.currentEmotion = em

    // Map emosi standar AI Hermes ke file ekspresi sesuai model aktif
    let expMap
    if (this.isMotherModel) {
      expMap = {
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
    } else if (this.isFernModel) {
      expMap = {
        happy: 'blush',
        joy: 'blush',
        smile: 'blush',
        love: 'blush',
        heart: 'blush',
        blush: 'blush',
        friendly: 'blush',
        angry: 'angry',
        sad: null,
        sorrow: null,
        neutral: null
      }
    } else if (this.isAsukaModel) {
      expMap = {
        happy: 'happy',
        joy: 'happy',
        smile: 'happy',
        love: 'star_eyes',
        heart: 'star_eyes',
        blush: 'happy',
        friendly: 'happy',
        sad: 'gloom',
        sorrow: 'gloom',
        neutral: null
      }
    } else if (this.isChangliModel) {
      expMap = {
        happy: 'blush',
        joy: 'blush',
        smile: 'blush',
        love: 'heart_eyes',
        heart: 'heart_eyes',
        blush: 'blush',
        friendly: 'blush',
        angry: 'angry',
        sad: 'gloom',
        sorrow: 'gloom',
        neutral: null
      }
    } else if (this.isFrierenModel) {
      expMap = {
        happy: 'mmy',
        joy: 'mmy',
        smile: 'mmy',
        love: 'W',
        heart: 'W',
        blush: 'W',
        friendly: 'mmy',
        thinking: 'wh',
        reasoning: 'wh',
        ponder: 'wh',
        curious: 'wh',
        sad: 'ku',
        sorrow: 'ku',
        neutral: null
      }
    } else {
      expMap = { neutral: null }
    }

    const targetExp = expMap[em] !== undefined ? expMap[em] : (this.expressions.includes(em) ? em : null)
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
          // Mode Kacamata (Glasses / Param99) khusus Mother saat berpikir/reasoning
          this._setMotherParam(core, 'Param99', 1)
          this._setMotherParam(core, 'Param74', 0)
          this._setMotherParam(core, 'Param108', 0)
          this._setMotherParam(core, 'Param98', 0)
          this._setMotherParam(core, 'Param32', 0)
          this._setMotherParam(core, 'Param58', 0)
          if (!this.isTimerFocusActive) {
            this._setMotherParam(core, 'Param35', 0)
            this._setMotherParam(core, 'Param80', 0)
          }
          core.setParameterValueById('ParamBrowLAngle', 0.35)
          core.setParameterValueById('ParamBrowRAngle', -0.35)
          core.setParameterValueById('ParamBrowLY', 0.2)
        } else if (['composing', 'generating', 'charterer', 'roll', 'curlers'].includes(em)) {
          // Mode Roll Rambut (Charterer / Param32 & Param58) khusus Mother saat menyusun jawaban
          this._setMotherParam(core, 'Param32', 1)
          this._setMotherParam(core, 'Param58', 1)
          this._setMotherParam(core, 'Param99', 0)
          this._setMotherParam(core, 'Param74', 0)
          this._setMotherParam(core, 'Param108', 0)
          this._setMotherParam(core, 'Param98', 0)
          if (!this.isTimerFocusActive) {
            this._setMotherParam(core, 'Param35', 0)
            this._setMotherParam(core, 'Param80', 0)
          }
          core.setParameterValueById('ParamEyeLSmile', 0.6)
          core.setParameterValueById('ParamEyeRSmile', 0.6)
          core.setParameterValueById('ParamMouthForm', 0.3)
          core.setParameterValueById('ParamBrowLY', 0.15)
          core.setParameterValueById('ParamBrowRY', 0.15)
          core.setParameterValueById('ParamBrowLAngle', 0)
          core.setParameterValueById('ParamBrowRAngle', 0)
        } else if (['happy', 'joy', 'smile', 'love', 'heart', 'blush', 'friendly'].includes(em)) {
          this._setMotherParam(core, 'Param99', 0)
          this._setMotherParam(core, 'Param32', 0)
          this._setMotherParam(core, 'Param58', 0)
          this._setMotherParam(core, 'Param74', 1)
          this._setMotherParam(core, 'Param108', 0)
          this._setMotherParam(core, 'Param98', 0)
          this._setMotherParam(core, 'Param35', 0)
          this._setMotherParam(core, 'Param80', 0)
          core.setParameterValueById('ParamEyeLSmile', 1)
          core.setParameterValueById('ParamEyeRSmile', 1)
          core.setParameterValueById('ParamMouthForm', 1)
          core.setParameterValueById('ParamBrowLY', 0.2)
          core.setParameterValueById('ParamBrowRY', 0.2)
        } else if (['wave'].includes(em)) {
          this._setMotherParam(core, 'Param108', 1)
          this._setMotherParam(core, 'Param74', 0)
          this._setMotherParam(core, 'Param99', 0)
          this._setMotherParam(core, 'Param32', 0)
          this._setMotherParam(core, 'Param58', 0)
          this._setMotherParam(core, 'Param98', 0)
          this._setMotherParam(core, 'Param35', 0)
          this._setMotherParam(core, 'Param80', 0)
          core.setParameterValueById('ParamEyeLSmile', 0.8)
          core.setParameterValueById('ParamEyeRSmile', 0.8)
          core.setParameterValueById('ParamMouthForm', 0.8)
        } else if (['sad', 'sorrow'].includes(em)) {
          this._setMotherParam(core, 'Param99', 0)
          this._setMotherParam(core, 'Param32', 0)
          this._setMotherParam(core, 'Param58', 0)
          this._setMotherParam(core, 'Param74', 0)
          this._setMotherParam(core, 'Param108', 0)
          this._setMotherParam(core, 'Param35', 0)
          this._setMotherParam(core, 'Param80', 0)
          core.setParameterValueById('ParamMouthForm', -0.8)
          core.setParameterValueById('ParamBrowLY', -0.6)
          core.setParameterValueById('ParamBrowRY', -0.6)
        } else if (['neutral'].includes(em)) {
          this._setMotherParam(core, 'Param99', 0)
          this._setMotherParam(core, 'Param32', 0)
          this._setMotherParam(core, 'Param58', 0)
          this._setMotherParam(core, 'Param74', 0)
          this._setMotherParam(core, 'Param108', 0)
          this._setMotherParam(core, 'Param98', 0)
          if (!this.isTimerFocusActive) {
            this._setMotherParam(core, 'Param35', 0)
            this._setMotherParam(core, 'Param80', 0)
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

    if (this.isMotherModel && this.model?.internalModel?.coreModel) {
      const core = this.model.internalModel.coreModel
      try {
        this._setMotherParam(core, 'Param74', 0) // Lepas tangan sarangheo
        this._setMotherParam(core, 'Param108', 0) // Lepas tangan melambai
        this._setMotherParam(core, 'Param98', 0)
        this._setMotherParam(core, 'Param32', 0)
        this._setMotherParam(core, 'Param58', 0)
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
        this._setMotherParam(core, 'Param35', 0) // Suit / Jas
        this._setMotherParam(core, 'Param80', 0) // Watch / Jam tangan
        this._setMotherParam(core, 'Param99', 0) // Glasses / Kacamata
        this._setMotherParam(core, 'Param74', 0) // Tangan sarangheo
        this._setMotherParam(core, 'Param108', 0) // Tangan melambai (wave)
        this._setMotherParam(core, 'Param98', 0) // Kepalan tangan
        this._setMotherParam(core, 'Param32', 0) // Roll rambut depan
        this._setMotherParam(core, 'Param58', 0) // Roll rambut belakang
        if (this.isAsukaModel) {
          core.setParameterValueById('Param55', 0)
          core.setParameterValueById('Param54', 0)
        }
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
    if (!this.isMotherModel || !this.model?.internalModel?.coreModel) return
    const core = this.model.internalModel.coreModel
    try {
      const style = this.watchStyle || 'watch_suit'
      if (this.currentOutfit === 'focus' || this.isTimerFocusActive) {
        // Matikan sarangheo, lambaian tangan, & roll rambut saat mode jam aktif
        this._setMotherParam(core, 'Param74', 0)
        this._setMotherParam(core, 'Param108', 0)
        this._setMotherParam(core, 'Param98', 0)
        this._setMotherParam(core, 'Param32', 0)
        this._setMotherParam(core, 'Param58', 0)

        if (style === 'watch_suit') {
          this._setMotherParam(core, 'Param35', 1) // Suit / Jas
          this._setMotherParam(core, 'Param80', 1) // Watch / Jam tangan
          this._setMotherParam(core, 'Param99', 1) // Glasses / Kacamata
        } else if (style === 'watch_only') {
          this._setMotherParam(core, 'Param35', 0) // Santai
          this._setMotherParam(core, 'Param80', 1) // Jam tangan saja
          this._setMotherParam(core, 'Param99', 0)
        } else if (style === 'glasses_only') {
          this._setMotherParam(core, 'Param35', 0)
          this._setMotherParam(core, 'Param80', 0)
          this._setMotherParam(core, 'Param99', 1) // Kacamata saja
        } else if (style === 'casual') {
          this._setMotherParam(core, 'Param35', 0)
          this._setMotherParam(core, 'Param80', 0)
          this._setMotherParam(core, 'Param99', 0)
        }
      } else {
        this._setMotherParam(core, 'Param35', 0)
        this._setMotherParam(core, 'Param80', 0)
        if (!['thinking', 'reasoning', 'focus', 'ponder', 'curious'].includes(this.currentEmotion)) {
          this._setMotherParam(core, 'Param99', 0)
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
        // Parameter bernomor khusus Mother (Param32/35/58/74/80/98/99/108) di-gate via _setMotherParam
        try {
          if (['thinking', 'reasoning', 'focus', 'ponder', 'curious'].includes(this.currentEmotion)) {
            this._setMotherParam(core, 'Param99', 1)
            this._setMotherParam(core, 'Param74', 0)
            this._setMotherParam(core, 'Param108', 0)
            this._setMotherParam(core, 'Param32', 0)
            this._setMotherParam(core, 'Param58', 0)
            core.setParameterValueById('ParamBrowLAngle', 0.35)
            core.setParameterValueById('ParamBrowRAngle', -0.35)
            core.setParameterValueById('ParamBrowLY', 0.2)
          } else if (['composing', 'generating', 'charterer', 'roll', 'curlers'].includes(this.currentEmotion)) {
            this._setMotherParam(core, 'Param32', 1)
            this._setMotherParam(core, 'Param58', 1)
            this._setMotherParam(core, 'Param99', 0)
            this._setMotherParam(core, 'Param74', 0)
            this._setMotherParam(core, 'Param108', 0)
            core.setParameterValueById('ParamEyeLSmile', 0.6)
            core.setParameterValueById('ParamEyeRSmile', 0.6)
          } else if (['happy', 'joy', 'smile', 'love', 'heart', 'blush', 'friendly'].includes(this.currentEmotion)) {
            this._setMotherParam(core, 'Param99', 0)
            this._setMotherParam(core, 'Param32', 0)
            this._setMotherParam(core, 'Param58', 0)
            this._setMotherParam(core, 'Param74', 1)
            this._setMotherParam(core, 'Param108', 0)
            this._setMotherParam(core, 'Param98', 0)
            this._setMotherParam(core, 'Param35', 0)
            this._setMotherParam(core, 'Param80', 0)
            core.setParameterValueById('ParamEyeLSmile', 1)
            core.setParameterValueById('ParamEyeRSmile', 1)
            core.setParameterValueById('ParamMouthForm', 1)
            core.setParameterValueById('ParamBrowLY', 0.2)
            core.setParameterValueById('ParamBrowRY', 0.2)
          } else if (['wave'].includes(this.currentEmotion)) {
            this._setMotherParam(core, 'Param108', 1)
            this._setMotherParam(core, 'Param74', 0)
            this._setMotherParam(core, 'Param99', 0)
            this._setMotherParam(core, 'Param32', 0)
            this._setMotherParam(core, 'Param58', 0)
            this._setMotherParam(core, 'Param98', 0)
            this._setMotherParam(core, 'Param35', 0)
            this._setMotherParam(core, 'Param80', 0)
            core.setParameterValueById('ParamEyeLSmile', 0.8)
            core.setParameterValueById('ParamEyeRSmile', 0.8)
          } else if (['sad', 'sorrow'].includes(this.currentEmotion)) {
            this._setMotherParam(core, 'Param99', 0)
            this._setMotherParam(core, 'Param32', 0)
            this._setMotherParam(core, 'Param58', 0)
            this._setMotherParam(core, 'Param74', 0)
            this._setMotherParam(core, 'Param108', 0)
            core.setParameterValueById('ParamMouthForm', -0.8)
            core.setParameterValueById('ParamBrowLY', -0.6)
            core.setParameterValueById('ParamBrowRY', -0.6)
          } else if (['angry'].includes(this.currentEmotion)) {
            this._setMotherParam(core, 'Param99', 0)
            this._setMotherParam(core, 'Param32', 0)
            this._setMotherParam(core, 'Param58', 0)
            this._setMotherParam(core, 'Param74', 0)
            this._setMotherParam(core, 'Param108', 0)
            core.setParameterValueById('ParamBrowLAngle', -0.6)
            core.setParameterValueById('ParamBrowRAngle', 0.6)
            core.setParameterValueById('ParamMouthForm', -1)
          } else if (['neutral'].includes(this.currentEmotion)) {
            this._setMotherParam(core, 'Param99', 0)
            this._setMotherParam(core, 'Param32', 0)
            this._setMotherParam(core, 'Param58', 0)
            this._setMotherParam(core, 'Param74', 0)
            this._setMotherParam(core, 'Param108', 0)
            this._setMotherParam(core, 'Param98', 0)
          }
        } catch {
          // Abaikan jika ada parameter yang tidak didukung model
        }
      }

      // 3. Terapkan parameter outfit khusus Mother & guard watermark spesifik per-model setiap frame
      try {
        if (this.isMotherModel) {
          const style = this.watchStyle || 'watch_suit'
          const isConflictEmotion = ['happy', 'joy', 'smile', 'love', 'heart', 'blush', 'friendly', 'composing', 'charterer', 'roll', 'curlers', 'wave'].includes(this.currentEmotion)
          const isFocus = (this.currentOutfit === 'focus' || this.isTimerFocusActive) && !isConflictEmotion

          if (isFocus) {
            if (style === 'watch_suit') {
              this._setMotherParam(core, 'Param35', 1)
              this._setMotherParam(core, 'Param80', 1)
              this._setMotherParam(core, 'Param99', 1)
            } else if (style === 'watch_only') {
              this._setMotherParam(core, 'Param35', 0)
              this._setMotherParam(core, 'Param80', 1)
              this._setMotherParam(core, 'Param99', 0)
            } else if (style === 'glasses_only') {
              this._setMotherParam(core, 'Param35', 0)
              this._setMotherParam(core, 'Param80', 0)
              this._setMotherParam(core, 'Param99', 1)
            } else if (style === 'casual') {
              this._setMotherParam(core, 'Param35', 0)
              this._setMotherParam(core, 'Param80', 0)
              this._setMotherParam(core, 'Param99', 0)
            }
            this._setMotherParam(core, 'Param74', 0)
            this._setMotherParam(core, 'Param108', 0)
            this._setMotherParam(core, 'Param32', 0)
            this._setMotherParam(core, 'Param58', 0)
            this._setMotherParam(core, 'Param98', 0)
          } else {
            this._setMotherParam(core, 'Param35', 0)
            this._setMotherParam(core, 'Param80', 0)
          }
        }

        // Guard watermark HANYA pada model terkait (jangan matikan Part17 di Frieren/model lain!)
        if (this.isEllenModel) {
          if (typeof core.setPartOpacityById === 'function') {
            core.setPartOpacityById('Part17', 0)
          }
          if (typeof core.setParameterValueById === 'function') {
            core.setParameterValueById('Paramheadxy', 0)
          }
        } else if (this.isFernModel) {
          if (typeof core.setParameterValueById === 'function') {
            core.setParameterValueById('Param33', 1)
          }
        } else if (this.isChangliModel) {
          if (typeof core.setPartOpacityById === 'function') {
            core.setPartOpacityById('Part53', 0)
          }
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

  _isSnipOverlayActive() {
    const el = document.getElementById('snip-overlay')
    return Boolean(el && !el.hasAttribute('hidden'))
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
    this._onMouseMove = (e) => {
      // Selama overlay potong layar (Screen Snip) aktif, pertahankan tangkapan mouse penuh (jangan click-through)
      if (this._isSnipOverlayActive()) {
        if (this.ignoringMouse) {
          window.hermesAvatar?.setIgnoreMouse(false)
          this.ignoringMouse = false
        }
        return
      }

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
    }
    window.addEventListener('mousemove', this._onMouseMove)

    // 2. Mouse down: Mulai drag
    this._onMouseDown = (e) => {
      if (this._isSnipOverlayActive()) return
      if (e.target.closest('.interactive-ui')) return

      const hit = this._hitTestModel(e.clientX, e.clientY)
      if (!hit || !this.model) return

      if (this.ignoringMouse) {
        window.hermesAvatar?.setIgnoreMouse(false)
        this.ignoringMouse = false
      }

      this.isDragging = true
      movedDistance = 0
      this._dragStartMouse = { x: e.clientX, y: e.clientY }
      this._dragStartModel = { x: this.model.x, y: this.model.y }
      document.body.style.cursor = 'grabbing'
    }
    window.addEventListener('mousedown', this._onMouseDown)

    // 3. Mouse up: Selesai drag atau deteksi klik
    this._onMouseUp = (e) => {
      if (!this.isDragging) return
      this.isDragging = false

      const hitChar = this._hitTestModel(e.clientX, e.clientY)
      document.body.style.cursor = hitChar ? 'grab' : 'default'

      if (movedDistance > 6 && this.model) {
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
    }
    window.addEventListener('mouseup', this._onMouseUp)

    // 4. Mouse leave: Reset kursor & aktifkan click-through ke desktop
    this._onMouseLeave = () => {
      if (this._isSnipOverlayActive()) return
      if (!this.isDragging && !this.ignoringMouse) {
        window.hermesAvatar?.setIgnoreMouse(true, true)
        this.ignoringMouse = true
        this.clearPointerLookAt()
        document.body.style.cursor = 'default'
      }
    }
    window.addEventListener('mouseleave', this._onMouseLeave)

    // 5. Mouse Wheel: Zoom in / Zoom out karakter halus
    this._onWheel = (e) => {
      if (this._isSnipOverlayActive()) return
      const hit = this._hitTestModel(e.clientX, e.clientY)
      if (!hit || !this.model) return

      e.preventDefault()
      const delta = e.deltaY < 0 ? 0.08 : -0.08
      this.scaleMultiplier = Math.max(0.35, Math.min(2.5, this.scaleMultiplier + delta))
      this._applyScale()
    }
    window.addEventListener('wheel', this._onWheel, { passive: false })
  }

  destroy() {
    if (this._motionTimer) {
      clearTimeout(this._motionTimer)
      this._motionTimer = null
    }

    if (this._onResize) {
      window.removeEventListener('resize', this._onResize)
      this._onResize = null
    }
    if (this._onVisibilityChange) {
      document.removeEventListener('visibilitychange', this._onVisibilityChange)
      this._onVisibilityChange = null
    }
    if (this._onMouseMove) {
      window.removeEventListener('mousemove', this._onMouseMove)
      this._onMouseMove = null
    }
    if (this._onMouseDown) {
      window.removeEventListener('mousedown', this._onMouseDown)
      this._onMouseDown = null
    }
    if (this._onMouseUp) {
      window.removeEventListener('mouseup', this._onMouseUp)
      this._onMouseUp = null
    }
    if (this._onMouseLeave) {
      window.removeEventListener('mouseleave', this._onMouseLeave)
      this._onMouseLeave = null
    }
    if (this._onWheel) {
      window.removeEventListener('wheel', this._onWheel)
      this._onWheel = null
    }

    if (this.model) {
      try {
        if (this.app?.stage) {
          this.app.stage.removeChild(this.model)
        }
        this.model.destroy({ texture: true, baseTexture: true })
      } catch (e) {
        console.warn('[Live2DAvatar] Gagal destroy model:', e)
      }
      this.model = null
    }

    if (this.view?.parentNode) {
      this.view.parentNode.removeChild(this.view)
    }

    if (this.app) {
      try {
        if (this._tickerFn && this.app.ticker) {
          this.app.ticker.remove(this._tickerFn)
        }
        this.app.destroy(true, { children: true, texture: true, baseTexture: true })
      } catch (e) {
        console.warn('[Live2DAvatar] Gagal destroy app:', e)
      }
      this.app = null
    }
  }
}
