/**
 * desktop-pet.js
 * Logika desktop pet: membuat canvas three.js, kamera, lampu, dan render loop.
 * File ini mengatur POSISI & UKURAN karakter (via kamera 3D + posisi model).
 */

import * as THREE from 'three'

export class DesktopPet {
  constructor(container) {
    this.container = container

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x000000, 0) // transparan
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 1000)
    this.camera.position.set(0, 1.5, 5)
    this.camera.lookAt(0, 1.2, 0)

    // Cahaya: ambient + 1 directional (hemat GPU).
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.2))
    const dir = new THREE.DirectionalLight(0xffffff, 1.5)
    dir.position.set(0, 3, 2)
    this.scene.add(dir)

    // Konfigurasi komposisi karakter.
    this.sideOffsetRatio = -0.56 // 0 = tengah; positif = kanan, negatif = kiri (fraksi lebar model)
    this.verticalOffsetRatio = 0.76 // 0 = tengah; positif = naik ke atas (fraksi tinggi model), agar di atas chat
    this.marginRatio = 0.12 // margin aman 12% di sekeliling model
    this.zoomFactor = 2.0 // 1 = model memenuhi frame; 2 = model tampak setengah ukuran

    this._onResize = this._onResize.bind(this)
    window.addEventListener('resize', this._onResize)
    this._onResize()

    // Batasi FPS saat idle (hemat resource).
    this.targetFps = 30
    this.frameInterval = 1000 / this.targetFps
    this.lastFrame = performance.now()

    // Raycaster untuk deteksi klik pada avatar.
    this.raycaster = new THREE.Raycaster()
    this.pointerNdc = new THREE.Vector2()

    // Kumpulan icon hati melayang (efek saat klik avatar).
    this.hearts = []

    // Callback yang dipanggil saat avatar di-klik (di-set dari main.js).
    this.onAvatarClick = null

    this._bindPointerEvents()
  }

  /**
   * Bind event pointer (mousemove untuk look-at, click untuk efek hati).
   * Mousemove dilaporkan via callback this.onPointerMove (dari main.js),
   * klik diraycast untuk tahu apakah mengenai model.
   */
  _bindPointerEvents() {
    const canvas = this.renderer.domElement

    canvas.addEventListener('mousemove', (e) => {
      // Laporkan posisi kursor relatif ke canvas (untuk controller.lookAtPointer).
      if (this.onPointerMove) {
        const rect = canvas.getBoundingClientRect()
        const localX = e.clientX - rect.left
        const localY = e.clientY - rect.top
        this.onPointerMove(localX, localY, rect.width, rect.height)
      }
    })

    canvas.addEventListener('mouseleave', () => {
      if (this.onPointerLeave) this.onPointerLeave()
    })

    canvas.addEventListener('click', (e) => {
      this._handleClick(e)
    })

    // --- Drag manual window (gantikan app-region: drag) ---
    // Saat user menekan mouse di area KOSONG (bukan karakter) lalu menggeser,
    // pindahkan window. Klik pada karakter tetap mainkan emote + hati.
    let dragging = false
    let lastPos = { x: 0, y: 0 }

    canvas.addEventListener('mousedown', (e) => {
      // Deteksi apakah mousedown mengenai karakter.
      const hitCharacter = this._raycastModel(e.clientX, e.clientY)
      if (hitCharacter) return // klik karakter → bukan drag window

      dragging = true
      lastPos = { x: e.screenX, y: e.screenY }
    })

    const onMouseMove = (e) => {
      if (!dragging) return
      // Delta per-frame (perbedaan dari posisi terakhir), bukan kumulatif.
      const dx = e.screenX - lastPos.x
      const dy = e.screenY - lastPos.y
      lastPos = { x: e.screenX, y: e.screenY }
      if (dx === 0 && dy === 0) return
      if (this.onDragMove) this.onDragMove(dx, dy)
    }

    const onMouseUp = () => {
      dragging = false
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  /** Raycast dari koordinat client → apakah mengenai model avatar. */
  _raycastModel(clientX, clientY) {
    if (!this.currentModel) return false
    this.pointerNdc.copy(this._clientToNdc(clientX, clientY))
    this.raycaster.setFromCamera(this.pointerNdc, this.camera)
    const hits = this.raycaster.intersectObject(this.currentModel, true)
    return hits.length > 0
  }

  /** Konversi koordinat client (px) → NDC (-1..1) untuk raycast. */
  _clientToNdc(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    )
  }

  /**
   * Deteksi apakah klik mengenai model avatar. Bila ya, spawn icon hati
   * melayang di titik klik + panggil this.onAvatarClick (untuk emote reaksi).
   */
  _handleClick(e) {
    if (!this.currentModel) return

    this.pointerNdc.copy(this._clientToNdc(e.clientX, e.clientY))
    this.raycaster.setFromCamera(this.pointerNdc, this.camera)

    const hits = this.raycaster.intersectObject(this.currentModel, true)
    if (hits.length === 0) return

    // Titik klik di ruang dunia (untuk posisi icon hati).
    const point = hits[0].point.clone()

    // Spawn beberapa icon hati melayang dari titik klik.
    this.spawnHearts(point)

    // Laporkan ke main.js (mainkan emote reaksi).
    if (this.onAvatarClick) this.onAvatarClick(point)
  }

  /**
   * Buat icon hati (THREE.Sprite billboard) yang melayang ke atas + memudar.
   * Texture hati dibuat programmatically (SVG → canvas), tanpa file eksternal.
   */
  _makeHeartTexture() {
    // Gambar hati sederhana (bentuk hati via path SVG) ke canvas.
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')

    // Hati merah muda dengan gradien.
    const g = ctx.createLinearGradient(0, 0, size, size)
    g.addColorStop(0, '#ff5c8a')
    g.addColorStop(1, '#ff2d55')
    ctx.fillStyle = g

    // Path hati.
    ctx.beginPath()
    ctx.moveTo(size / 2, size * 0.85)
    ctx.bezierCurveTo(size * 0.05, size * 0.5, size * 0.1, size * 0.1, size * 0.5, size * 0.25)
    ctx.bezierCurveTo(size * 0.9, size * 0.1, size * 0.95, size * 0.5, size * 0.5, size * 0.85)
    ctx.fill()

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  /**
   * Spawn 1 icon hati melayang di posisi klik.
   * Hati bergerak naik + memudar selama ~1 detik, lalu dihapus dari scene.
   */
  spawnHearts(point) {
    if (!this._heartTexture) {
      this._heartTexture = this._makeHeartTexture()
    }

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._heartTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    }))

    // Ukuran hati relatif terhadap ukuran model (skala ~10% tinggi model).
    const scale = (this._modelHeight || 1) * 0.1
    sprite.scale.set(scale, scale, 1)

    // Posisi mulai sedikit di atas titik klik.
    sprite.position.copy(point)
    sprite.position.y += scale * 0.5

    this.scene.add(sprite)

    // Daftarkan animasi hati.
    this.hearts.push({
      sprite,
      bornAt: performance.now(),
      duration: 1000, // ms
      startY: sprite.position.y,
      rise: scale * 2.5
    })
  }

  /** Update animasi icon hati (dipanggil tiap frame dari render loop). */
  _updateHearts() {
    if (this.hearts.length === 0) return
    const now = performance.now()

    for (let i = this.hearts.length - 1; i >= 0; i--) {
      const h = this.hearts[i]
      const t = (now - h.bornAt) / h.duration // 0..1

      if (t >= 1) {
        // Hapus hati yang sudah selesai.
        this.scene.remove(h.sprite)
        h.sprite.material.map.dispose()
        h.sprite.material.dispose()
        this.hearts.splice(i, 1)
        continue
      }

      // Naik + memudar.
      const eased = t * t // percepatan naik
      h.sprite.position.y = h.startY + h.rise * eased
      h.sprite.material.opacity = 1 - t
    }
  }

  setModel(object) {
    if (this.currentModel) this.scene.remove(this.currentModel)
    this.currentModel = object
    this.scene.add(object)
    this._onResize() // pastikan aspect benar
    this._frameModel()
  }

  /**
   * Atur framing kamera agar SELURUH model (kepala→kaki, tangan terentang)
   * masuk frame, dengan komposisi yang bisa digeser ke kanan.
   *
   * Pendekatan yang BENAR:
   *  1. Pastikan matrix world ter-update dulu (updateMatrixWorld).
   *  2. Hitung bounding box yang valid (model pada posisi dasar, offset 0).
   *  3. Hitung jarak kamera dari tinggi + lebar model (fov + aspect).
   *  4. Kamera lurus menghadap +Z ke titik tengah model.
   *  5. Geser MODEL (bukan kamera) ke kanan untuk komposisi kanan.
   *     Karena kamera diam & lurus, pergeseran model menghasilkan pergeseran
   *     komposisi NYATA di layar tanpa mengubah sudut pandang.
   */
  _frameModel() {
    if (!this.currentModel) return

    // 0. Kembalikan model ke posisi dasar (tanpa offset), agar box diukur benar.
    this.currentModel.position.x = 0
    this.currentModel.position.y = 0

    // 1. Perbarui seluruh transformasi (termasuk bone VRM) sebelum hitung box.
    this.currentModel.updateMatrixWorld(true)

    const box = new THREE.Box3().setFromObject(this.currentModel)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())

    // 2. Validasi bounding box.
    if (!isFinite(size.x) || !isFinite(size.y) || !isFinite(size.z)) return
    if (size.x <= 0 || size.y <= 0 || size.z <= 0) return

    const modelHeight = size.y
    const modelWidth = Math.max(size.x, size.z)

    // Simpan tinggi model (dipakai untuk skala icon hati).
    this._modelHeight = modelHeight

    // 3. Jarak kamera agar tinggi & lebar model sama-sama masuk frame.
    const fov = (this.camera.fov * Math.PI) / 180
    const aspect = this.camera.aspect || 1
    const horizontalFov = 2 * Math.atan(Math.tan(fov / 2) * aspect)

    const distByHeight = modelHeight / (2 * Math.tan(fov / 2))
    const distByWidth = modelWidth / (2 * Math.tan(horizontalFov / 2))
    const dist = Math.max(distByHeight, distByWidth) * (1 + this.marginRatio) * this.zoomFactor

    // 4. Kamera lurus di depan model, sejajar titik tengahnya.
    this.camera.position.set(center.x, center.y, center.z + dist)
    this.camera.lookAt(center)

    this.camera.near = Math.max(0.01, dist / 100)
    this.camera.far = dist * 100
    this.camera.updateProjectionMatrix()

    // 5. Geser MODEL untuk komposisi: horizontal (kiri/kanan) + vertikal (atas).
    //    Kamera tetap diam & lurus, sehingga pergeseran model menghasilkan
    //    pergeseran komposisi NYATA di layar tanpa mengubah sudut pandang.
    const offsetX = modelWidth * this.sideOffsetRatio
    const offsetY = modelHeight * this.verticalOffsetRatio
    this.currentModel.position.x = offsetX
    this.currentModel.position.y = offsetY
  }

  _onResize() {
    const w = this.container.clientWidth || window.innerWidth
    const h = this.container.clientHeight || window.innerHeight
    if (w === 0 || h === 0) return

    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()

    // Re-frame agar tetap full body saat ukuran berubah (responsive).
    if (this.currentModel) this._frameModel()
  }

  startRenderLoop() {
    this.stopRenderLoop()
    const loop = (now) => {
      this._animFrameId = requestAnimationFrame(loop)
      if (now - this.lastFrame < this.frameInterval) return
      this.lastFrame = now

      if (this.onBeforeRender) this.onBeforeRender(this.frameInterval)
      this._updateHearts()
      this.renderer.render(this.scene, this.camera)
    }
    this._animFrameId = requestAnimationFrame(loop)
  }

  stopRenderLoop() {
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId)
      this._animFrameId = null
    }
  }
}
