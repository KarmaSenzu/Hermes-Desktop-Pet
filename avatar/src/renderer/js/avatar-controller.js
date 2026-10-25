import * as THREE from 'three'

/**
 * avatar-controller.js
 * Mengontrol animasi idle avatar: blink, napas, kepala lihat sekitar,
 * goyang badan. Semua digerakkan dari bone VRM + blendshape.
 *
 * API three-vrm (v3.x):
 *  - expressionManager.expressionMap -> { name: expression }
 *  - expressionManager.setValue(name, v)
 *  - vrm.humanoid.getNormalizedBoneNode('neck'|'spine'|'head'|...) -> Object3D
 */

const BLINK_INTERVAL_MIN = 2000 // ms
const BLINK_INTERVAL_MAX = 6000 // ms
const BLINK_DURATION = 150 // ms

export class AvatarController {
  constructor(vrm) {
    this.vrm = vrm
    this.nextBlinkAt = performance.now() + this._randomBlinkDelay()
    this.blinkUntil = 0
    this.clock = 0
    this.baseY = vrm ? vrm.scene.position.y : 0

    // Cache bone untuk animasi idle (fallback raw bila normalized null).
    this.neckBone = this._getBone('neck')
    this.spineBone = this._getBone('spine')
    this.headBone = this._getBone('head')
    this.leftArmBone = this._getBone('leftUpperArm')
    this.rightArmBone = this._getBone('rightUpperArm')

    // Simpan rotasi awal bone (untuk animasi relatif, tidak menimpa pose).
    this._neckBase = this.neckBone ? this.neckBone.rotation.clone() : null
    this._spineBase = this.spineBone ? this.spineBone.rotation.clone() : null
    this._headBase = this.headBone ? this.headBone.rotation.clone() : null
    this._leftArmBase = this.leftArmBone ? this.leftArmBone.rotation.clone() : null
    this._rightArmBase = this.rightArmBone ? this.rightArmBone.rotation.clone() : null

    // State emote (animasi sementara yang meng-override idle).
    this.emote = null // { name, startedAt, duration }

    // State "ikuti kursor" (look-at pointer).
    // Saat aktif, gerak idle kepala dilemahkan agar pandangan mengikuti mouse.
    this._lookAtTarget = null // { x, y } di ruang dunia (untuk VRM lookAt)
    this._pointerActive = false // true bila kursor di atas canvas
    this._pointerScreen = { x: 0, y: 0 } // posisi kursor terakhir (client px)

    // Debug: info bone yang ditemukan (untuk diagnosa T-pose).
    if (typeof console !== 'undefined') {
      console.log('[avatar bones]', JSON.stringify({
        neck: !!this.neckBone,
        spine: !!this.spineBone,
        head: !!this.headBone,
        hasHumanoid: !!(this.vrm && this.vrm.humanoid)
      }))
    }
  }

  _getBone(name) {
    if (!this.vrm?.humanoid) return null
    return (
      this.vrm.humanoid.getNormalizedBoneNode(name) ||
      this.vrm.humanoid.getRawBoneNode(name)
    )
  }

  _randomBlinkDelay() {
    return BLINK_INTERVAL_MIN + Math.random() * (BLINK_INTERVAL_MAX - BLINK_INTERVAL_MIN)
  }

  /**
   * Daftar nama expression yang tersedia di model (dari expressionMap).
   */
  availableExpressions() {
    if (!this.vrm?.expressionManager) return []
    return Object.keys(this.vrm.expressionManager.expressionMap || {})
  }

  /**
   * Set ekspresi wajah (VRM blendshape). "thinking"/"neutral"/emosi dasar.
   * Untuk model non-VRM (MMD/FBX), ini no-op.
   */
  setExpression(name) {
    if (!this.vrm) return
    const expression = this.vrm.expressionManager
    if (!expression) return

    const map = expression.expressionMap || {}
    const names = Object.keys(map)
    if (names.length === 0) return

    // Kandidat nama preset untuk tiap ekspresi (coba berurutan).
    const candidates = {
      neutral: ['neutral', 'Neutral'],
      happy: ['happy', 'Happy', 'joy', 'fun', 'smile'],
      sad: ['sad', 'Sad', 'sorrow'],
      angry: ['angry', 'Angry'],
      surprised: ['surprised', 'Surprised', 'shock'],
      thinking: ['relaxed', 'Relaxed', 'neutral'],
      composing: ['relaxed', 'Relaxed', 'neutral'],
      generating: ['relaxed', 'Relaxed', 'neutral']
    }
    const list = candidates[name] || candidates.neutral

    const target = list.find((n) => names.includes(n))

    // Reset semua lalu set target.
    for (const n of names) expression.setValue(n, 0)
    if (target) {
      expression.setValue(target, 1)
    }
    expression.update()
  }

  /**
   * Lip sync amplitude-based: buka mulut sesuai level audio (0..1).
   * Memakai blendshape "aa" (buka) dari mouthExpressionNames.
   */
  setMouthLevel(level) {
    if (!this.vrm) return
    const expression = this.vrm.expressionManager
    if (!expression) return

    const map = expression.expressionMap || {}
    const names = Object.keys(map)

    // Cari nama mulut yang tersedia (prioritas "aa").
    const mouthShape = ['aa', 'a', 'ee', 'ih', 'ou', 'oh'].find((n) => names.includes(n))
    if (!mouthShape) return

    expression.setValue(mouthShape, Math.max(0, Math.min(1, level)))
    expression.update()
  }

  /**
   * Set pose default jadi A-pose (tangan turun di samping, ~40° dari badan).
   * Gantikan T-pose default. Dipanggil sekali setelah model dimuat.
   */
  setAPose() {
    // Rotasi lengan atas turun ke samping (sumbu Z) — nilai umum untuk A-pose.
    if (this.leftArmBone) {
      this.leftArmBone.rotation.z = -0.7 // ~40° turun
      this._leftArmBase = this.leftArmBone.rotation.clone()
    }
    if (this.rightArmBone) {
      this.rightArmBone.rotation.z = 0.7
      this._rightArmBase = this.rightArmBone.rotation.clone()
    }
  }

  /**
   * Arahkan kepala + mata avatar ke posisi kursor (fitur "ikuti kursor").
   *
   * screenX/screenY  : koordinat client (px) di dalam canvas.
   * viewportW/viewportH : ukuran canvas (px).
   *
   * Untuk model VRM, pakai vrm.lookAt.target (bola mata + kepala ikut
   * secara natural, seperti Live2D). Untuk non-VRM (MMD/FBX/GLB),
   * fallback: gerakkan bone neck/head (yaw/pitch) relatif ke kursor.
   */
  lookAtPointer(screenX, screenY, viewportW, viewportH) {
    if (!viewportW || !viewportH) return

    // Normalisasi posisi kursor ke -1..1 (x: kiri→kanan, y: bawah→atas).
    const nx = (screenX / viewportW) * 2 - 1
    const ny = 1 - (screenY / viewportH) * 2

    this._pointerActive = true
    this._pointerScreen = { x: screenX, y: screenY }

    if (this.vrm?.lookAt) {
      // --- VRM: target lookAt di ruang dunia (mata ikut, kepala menoleh) ---
      this._applyVrmLookAt(nx, ny)
    } else {
      // --- Non-VRM: gerak bone neck/head ---
      this._applyBoneLookAt(nx, ny)
    }
  }

  /** Bersihkan target lookAt (kursor keluar canvas → kembali idle). */
  clearPointerLookAt() {
    this._pointerActive = false
    this._lookAtTarget = null
    if (this.vrm?.lookAt?.target) {
      // Kembalikan target ke titik lurus ke depan.
      this.vrm.lookAt.target.set(0, 0, 1)
    }
  }

  _applyVrmLookAt(nx, ny) {
    const vrm = this.vrm
    // Dapatkan kepala untuk referensi arah.
    const head = this.headBone || this.neckBone
    if (!head) return

    // Titik dunia yang "dilihat" oleh mata: proyeksikan kursor dari kamera.
    // Karena kita tidak pegang kamera di sini, kita arahkan ke titik di depan
    // kepala (offset horizontal/vertikal). Nilai ini diterjemahkan three-vrm
    // menjadi rotasi kepala + posisi bola mata secara natural.
    const look = new THREE.Vector3(nx * 1.5, ny * 1.2, 2)
    head.localToWorld(look)
    vrm.lookAt.target.copy(look)
    this._lookAtTarget = look
  }

  _applyBoneLookAt(nx, ny) {
    // Fallback non-VRM: yaw (kiri/kanan) & pitch (atas/bawah) pada bone.
    const yaw = nx * 0.5 // ± ~28°
    const pitch = -ny * 0.25 // ± ~14°

    if (this.neckBone && this._neckBase) {
      this.neckBone.rotation.set(
        this._neckBase.x + pitch,
        this._neckBase.y + yaw,
        this._neckBase.z
      )
    }
    if (this.headBone && this._headBase) {
      this.headBone.rotation.set(
        this._headBase.x + pitch * 0.6,
        this._headBase.y + yaw * 0.6,
        this._headBase.z
      )
    }
  }

  update(deltaMs) {
    const now = performance.now()
    this.clock += deltaMs

    // Jadwalkan blink.
    if (now >= this.nextBlinkAt) {
      this.blinkUntil = now + BLINK_DURATION
      this.nextBlinkAt = now + this._randomBlinkDelay()
    }

    if (this.vrm) {
      const isBlinking = now < this.blinkUntil
      const blink = isBlinking ? 1 : 0
      const expression = this.vrm.expressionManager
      if (expression) {
        expression.setValue('blink', blink)
        expression.update()
      }

      // Napas: naik-turun halus RELATIF ke baseY.
      const breathe = Math.sin(this.clock * 0.002) * 0.02
      this.vrm.scene.position.y = this.baseY + breathe
    }

    // --- Emote aktif (override idle sementara) ---
    if (this.emote) {
      this._updateEmote()
    } else {
      this._updateIdleMotion()
    }
  }

  /**
   * Mainkan emote procedural (animasi sementara).
   * name: 'bounce' | 'jump' | 'wave' | 'nod'
   */
  playEmote(name) {
    const durations = { bounce: 1200, jump: 900, wave: 1500, nod: 700 }
    this.emote = {
      name,
      startedAt: performance.now(),
      duration: durations[name] || 1000
    }
  }

  _updateEmote() {
    if (!this.emote) return
    const elapsed = performance.now() - this.emote.startedAt
    const t = elapsed / this.emote.duration // 0..1

    if (t >= 1) {
      this._resetEmoteBones()
      this.emote = null
      return
    }

    const name = this.emote.name

    if (name === 'bounce') {
      // Mantul naik-turun.
      const y = Math.abs(Math.sin(t * Math.PI)) * 0.25
      if (this.vrm) this.vrm.scene.position.y = this.baseY + y
    } else if (name === 'jump') {
      // Lompat (naik lalu turun).
      const y = Math.sin(t * Math.PI) * 0.4
      if (this.vrm) this.vrm.scene.position.y = this.baseY + Math.max(0, y)
    } else if (name === 'wave') {
      // Lambaikan tangan kanan (rotate upperArm).
      if (this.rightArmBone && this._rightArmBase) {
        const wave = Math.sin(t * Math.PI * 4) * 0.6
        this.rightArmBone.rotation.set(
          this._rightArmBase.x,
          this._rightArmBase.y,
          this._rightArmBase.z - 1.2 + wave * 0.4
        )
      }
    } else if (name === 'nod') {
      // Mengangguk (neck pitch).
      if (this.neckBone && this._neckBase) {
        const nod = Math.sin(t * Math.PI * 3) * 0.3
        this.neckBone.rotation.set(
          this._neckBase.x + nod,
          this._neckBase.y,
          this._neckBase.z
        )
      }
    }
  }

  _resetEmoteBones() {
    if (this.vrm) this.vrm.scene.position.y = this.baseY
    if (this.neckBone && this._neckBase) this.neckBone.rotation.copy(this._neckBase)
    if (this.headBone && this._headBase) this.headBone.rotation.copy(this._headBase)
    if (this.spineBone && this._spineBase) this.spineBone.rotation.copy(this._spineBase)
    if (this.leftArmBone && this._leftArmBase) this.leftArmBone.rotation.copy(this._leftArmBase)
    if (this.rightArmBone && this._rightArmBase) this.rightArmBone.rotation.copy(this._rightArmBase)
  }

  _updateIdleMotion() {
    const t = this.clock * 0.001 // detik

    // Saat kursor aktif (look-at pointer), jangan timpa rotasi kepala/leher
    // dengan gerak idle — biarkan pandangan mengikuti kursor. Badan tetap goyang.
    // Berlaku untuk VRM (lookAt internal) maupun non-VRM (bone neck/head).
    const followingPointer = this._pointerActive

    // Kepala/leher: lihat kiri-kanan pelan (yaw) + angguk halus (pitch).
    if (!followingPointer && this.neckBone && this._neckBase) {
      const yaw = Math.sin(t * 0.5) * 0.2 // ± ~11°
      const pitch = Math.sin(t * 0.9 + 1.3) * 0.06
      this.neckBone.rotation.set(
        this._neckBase.x + pitch,
        this._neckBase.y + yaw,
        this._neckBase.z
      )
    }

    // Kepala (head) ikut gerak halus bila ada bone terpisah.
    if (!followingPointer && this.headBone && this._headBase) {
      const yaw = Math.sin(t * 0.5 + 0.5) * 0.1
      this.headBone.rotation.set(
        this._headBase.x + Math.sin(t * 0.7) * 0.04,
        this._headBase.y + yaw,
        this._headBase.z
      )
    }

    // Badan/spine: goyang halus (tetap jalan saat ikuti kursor).
    if (this.spineBone && this._spineBase) {
      const sway = Math.sin(t * 0.4) * 0.06
      this.spineBone.rotation.set(
        this._spineBase.x + sway,
        this._spineBase.y + Math.sin(t * 0.35 + 0.7) * 0.08,
        this._spineBase.z
      )
    }
  }
}
