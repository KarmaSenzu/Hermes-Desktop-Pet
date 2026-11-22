/**
 * TilingWindowManager (TWM) - Auto-Layout / Window Tiling Manager
 *
 * Mengatur peletakan seluruh jendela interaktif (Timer, Musik, Chat) di sekitar avatar
 * secara proporsional dan dinamis (Auto-Arrange / Auto-Adjust).
 *
 * Fitur Utama:
 * 1. Tiling Bebas Tabrakan: Tidak ada jendela yang saling menumpuk.
 * 2. Auto-Adjust / Auto-Fill: Saat salah satu jendela ditutup, jendela yang tersisa
 *    langsung bergeser dan mengisi ruang kosong secara mulus (animasi CSS transition).
 * 3. Alokasi Flank Seimbang (Bilateral): Jika ada 2 atau 3 jendela terbuka,
 *    manajer membagi jendela secara cerdas ke sisi kiri (alat bantu seperti Timer & Musik)
 *    dan sisi kanan avatar (Chat AI), atau menata sejajar jika layar sangat lebar.
 * 4. Responsive Clamping: Memastikan tidak ada jendela yang keluar dari batas layar.
 */

export class TilingWindowManager {
  constructor() {
    this.windows = new Map()
    this.avatarGetter = null
    this.hudElement = null
  }

  init({ avatarGetter, hudElement }) {
    this.avatarGetter = avatarGetter
    this.hudElement = hudElement

    window.addEventListener('resize', () => this.tile())
    window.addEventListener('avatar:dock-panels-update', () => this.tile())
  }

  register(id, element, options = {}) {
    if (!element) return
    this.windows.set(id, {
      id,
      element,
      baseWidth: options.baseWidth || 320,
      baseHeight: options.baseHeight || 300,
      minWidth: options.minWidth || 280,
      type: options.type || 'tool', // 'tool' | 'chat'
      getDimensions: options.getDimensions || null
    })
  }

  isOpen(item) {
    if (!item?.element) return false
    return !item.element.hidden && !item.element.classList.contains('hidden')
  }

  tile() {
    const screenW = window.innerWidth
    const screenH = window.innerHeight
    const MARGIN = 16
    const PAD = 14

    const avatarBounds = this.avatarGetter?.()
    const avatarCenterX = avatarBounds ? avatarBounds.centerX : screenW / 2
    const avatarTop = avatarBounds ? avatarBounds.top : 100
    const avatarCenterY = avatarBounds ? avatarBounds.centerY : screenH / 2

    // 1. Posisikan HUD Menu Pendamping jika aktif
    let hudLeft = null
    let hudTop = null
    let hudW = 0
    let hudH = 0
    const hudVisible = this.hudElement?.classList.contains('visible')

    if (hudVisible && avatarBounds) {
      hudW = this.hudElement.offsetWidth || 64
      hudH = this.hudElement.offsetHeight || 320

      // Posisi ideal di sisi kiri tubuh avatar
      hudLeft = avatarBounds.left - hudW - 16
      if (hudLeft < MARGIN) {
        hudLeft = avatarBounds.right + 16
      }
      hudTop = avatarCenterY - hudH / 2
      hudTop = Math.max(MARGIN, Math.min(screenH - hudH - MARGIN, hudTop))
      hudLeft = Math.max(MARGIN, Math.min(screenW - hudW - MARGIN, hudLeft))

      this.hudElement.style.left = `${hudLeft}px`
      this.hudElement.style.top = `${hudTop}px`
      this.hudElement.style.bottom = 'auto'
      this.hudElement.style.transform = 'none'
    }

    const isHudOnLeft = hudVisible && hudLeft !== null && hudLeft < avatarCenterX
    const isHudOnRight = hudVisible && hudLeft !== null && hudLeft + hudW > avatarCenterX

    // Batas Flank Kiri & Kanan Avatar
    const leftFlankRightEdge = isHudOnLeft
      ? hudLeft - PAD
      : avatarBounds
        ? avatarBounds.left - PAD
        : avatarCenterX - 100
    const leftFlankWidth = Math.max(0, leftFlankRightEdge - MARGIN)

    const rightFlankLeftEdge = isHudOnRight
      ? hudLeft + hudW + PAD
      : avatarBounds
        ? avatarBounds.right + PAD
        : avatarCenterX + 100
    const rightFlankWidth = Math.max(0, screenW - MARGIN - rightFlankLeftEdge)

    // 2. Kumpulkan jendela yang sedang aktif terbuka
    const openItems = []
    for (const item of this.windows.values()) {
      if (this.isOpen(item)) {
        const dims = item.getDimensions ? item.getDimensions() : { width: item.baseWidth, height: item.baseHeight }
        openItems.push({
          ...item,
          currentWidth: dims.width,
          currentHeight: dims.height
        })
      }
    }

    if (openItems.length === 0) return

    const chatItem = openItems.find((i) => i.id === 'chat')
    const tools = openItems.filter((i) => i.type === 'tool')

    // Skenario A: Tepat 1 jendela terbuka
    if (openItems.length === 1) {
      const single = openItems[0]
      const preferLeft = rightFlankWidth < single.minWidth || (leftFlankWidth >= single.minWidth && leftFlankWidth >= rightFlankWidth)

      let left
      if (preferLeft) {
        left = Math.max(MARGIN, leftFlankRightEdge - single.currentWidth)
      } else {
        left = Math.min(screenW - single.currentWidth - MARGIN, rightFlankLeftEdge)
      }

      let top = avatarTop + (single.type === 'chat' ? 20 : 10)
      top = Math.max(MARGIN, Math.min(screenH - single.currentHeight - MARGIN, top))

      this.applyWindowPosition(single.element, left, top)
      return
    }

    // Hitung total lebar jika seluruh jendela dijajarkan secara horizontal
    const totalAllW = openItems.reduce((acc, i) => acc + i.currentWidth, 0) + (openItems.length - 1) * PAD

    // Deteksi apakah ruang di sisi kanan atau kiri avatar terlalu sempit (< 300px)
    const isRightCramped = rightFlankWidth < 300
    const isLeftCramped = leftFlankWidth < 300

    // KASUS 1: AVATAR BERADA DI UJUNG KANAN MONITOR
    // -> Seluruh jendela dialihkan & ditata rapi ke sisi KIRI avatar secara horizontal atau bertingkat
    if (isRightCramped || (leftFlankWidth >= totalAllW && rightFlankWidth < 380)) {
      this.tileAllToLeft(openItems, {
        leftFlankRightEdge,
        leftFlankWidth,
        screenH,
        hudTop,
        hudH,
        avatarBounds,
        avatarTop,
        chatItem,
        MARGIN,
        PAD
      })
      return
    }

    // KASUS 2: AVATAR BERADA DI UJUNG KIRI MONITOR
    // -> Seluruh jendela dialihkan & ditata rapi ke sisi KANAN avatar
    if (isLeftCramped || (rightFlankWidth >= totalAllW && leftFlankWidth < 380)) {
      this.tileAllToRight(openItems, {
        rightFlankLeftEdge,
        rightFlankWidth,
        screenW,
        screenH,
        hudTop,
        hudH,
        avatarBounds,
        avatarTop,
        chatItem,
        MARGIN,
        PAD
      })
      return
    }

    // KASUS 3: AVATAR DI TENGAH MONITOR (Kedua sisi memiliki ruang leluasa)
    // -> Tata letak seimbang bilateral: Tools di Kiri Flank, Chat AI di Kanan Flank
    if (chatItem && tools.length > 0) {
      // Chat di sisi kanan avatar
      const chatLeft = Math.min(screenW - chatItem.currentWidth - MARGIN, rightFlankLeftEdge)
      this.positionItem(chatItem, chatLeft, screenH, hudTop, hudH, avatarBounds, avatarTop)

      // Tools di sisi kiri avatar
      const orderedTools = this.orderItems(tools, false)
      const toolsW = orderedTools.reduce((acc, t) => acc + t.currentWidth, 0) + (orderedTools.length - 1) * PAD
      if (leftFlankWidth >= toolsW) {
        let curRight = leftFlankRightEdge
        for (const tool of orderedTools) {
          const toolLeft = Math.max(MARGIN, curRight - tool.currentWidth)
          this.positionItem(tool, toolLeft, screenH, hudTop, hudH, avatarBounds, avatarTop)
          curRight = toolLeft - PAD
        }
      } else {
        this.stackToolsVertically(orderedTools, leftFlankRightEdge, screenH, hudTop, hudH, avatarBounds, avatarTop, MARGIN, PAD)
      }
      return
    }

    // Jika hanya tools (Timer / Vision / Musik) tanpa Chat
    if (openItems.length >= 2 && !chatItem) {
      const ordered = this.orderItems(openItems, false)
      const totalW = ordered.reduce((acc, i) => acc + i.currentWidth, 0) + (ordered.length - 1) * PAD
      if (leftFlankWidth >= totalW) {
        let curRight = leftFlankRightEdge
        for (const item of ordered) {
          const left = Math.max(MARGIN, curRight - item.currentWidth)
          this.positionItem(item, left, screenH, hudTop, hudH, avatarBounds, avatarTop)
          curRight = left - PAD
        }
      } else if (ordered.length === 2) {
        const left0 = Math.max(MARGIN, leftFlankRightEdge - ordered[0].currentWidth)
        const left1 = Math.min(screenW - ordered[1].currentWidth - MARGIN, rightFlankLeftEdge)
        this.positionItem(ordered[0], left0, screenH, hudTop, hudH, avatarBounds, avatarTop)
        this.positionItem(ordered[1], left1, screenH, hudTop, hudH, avatarBounds, avatarTop)
      } else {
        const rightTool = ordered[ordered.length - 1]
        const leftTools = ordered.slice(0, -1)
        const leftW = leftTools.reduce((acc, t) => acc + t.currentWidth, 0) + (leftTools.length - 1) * PAD
        if (rightFlankWidth >= rightTool.currentWidth) {
          this.positionItem(rightTool, Math.min(screenW - rightTool.currentWidth - MARGIN, rightFlankLeftEdge), screenH, hudTop, hudH, avatarBounds, avatarTop)
          if (leftFlankWidth >= leftW) {
            let curRight = leftFlankRightEdge
            for (const t of leftTools) {
              const tLeft = Math.max(MARGIN, curRight - t.currentWidth)
              this.positionItem(t, tLeft, screenH, hudTop, hudH, avatarBounds, avatarTop)
              curRight = tLeft - PAD
            }
          } else {
            this.stackToolsVertically(leftTools, leftFlankRightEdge, screenH, hudTop, hudH, avatarBounds, avatarTop, MARGIN, PAD)
          }
        } else {
          this.stackToolsVertically(ordered, leftFlankRightEdge, screenH, hudTop, hudH, avatarBounds, avatarTop, MARGIN, PAD)
        }
      }
      return
    }
  }

  orderItems(openItems, includeChat = true) {
    const priority = ['timer', 'vision', 'music', ...(includeChat ? ['chat'] : [])]
    const ordered = []
    for (const id of priority) {
      const found = openItems.find((i) => i.id === id)
      if (found) ordered.push(found)
    }
    for (const item of openItems) {
      if (!ordered.includes(item)) ordered.push(item)
    }
    return ordered
  }

  tileAllToLeft(openItems, ctx) {
    const { leftFlankRightEdge, leftFlankWidth, screenH, hudTop, hudH, avatarBounds, avatarTop, chatItem, MARGIN, PAD } = ctx

    // Urutan prioritas dari dekat tubuh avatar menuju tepi kiri layar:
    // Dekat Avatar/HUD -> Timer -> Tangkap Layar -> Musik -> Chat AI (paling kiri)
    const ordered = this.orderItems(openItems, true)
    const totalW = ordered.reduce((acc, i) => acc + i.currentWidth, 0) + (ordered.length - 1) * PAD

    // Kasus A: Muat bersanding horizontal di sisi kiri
    if (leftFlankWidth >= totalW) {
      let curRight = leftFlankRightEdge
      for (const item of ordered) {
        const left = Math.max(MARGIN, curRight - item.currentWidth)
        this.positionItem(item, left, screenH, hudTop, hudH, avatarBounds, avatarTop)
        curRight = left - PAD
      }
      return
    }

    // Kasus B: Ruang kiri sempit -> Tumpuk panel tool secara vertikal lalu Chat di kolom sebelahnya
    const nonChat = ordered.filter((i) => i.id !== 'chat')
    if (nonChat.length >= 2 && chatItem) {
      const usedLeftEdge = this.stackToolsVertically(nonChat, leftFlankRightEdge, screenH, hudTop, hudH, avatarBounds, avatarTop, MARGIN, PAD)
      const chatLeft = Math.max(MARGIN, usedLeftEdge - PAD - chatItem.currentWidth)
      const chatTop = Math.max(MARGIN, Math.min(screenH - chatItem.currentHeight - MARGIN, avatarTop))
      this.applyWindowPosition(chatItem.element, chatLeft, chatTop)
      return
    }

    // Kasus C: Susun horizontal dengan clamping batas layar
    let curRight = leftFlankRightEdge
    for (const item of ordered) {
      const left = Math.max(MARGIN, curRight - item.currentWidth)
      this.positionItem(item, left, screenH, hudTop, hudH, avatarBounds, avatarTop)
      curRight = left - PAD
    }
  }

  tileAllToRight(openItems, ctx) {
    const { rightFlankLeftEdge, rightFlankWidth, screenW, screenH, hudTop, hudH, avatarBounds, avatarTop, chatItem, MARGIN, PAD } = ctx

    // Urutan prioritas dari dekat tubuh avatar menuju tepi kanan layar:
    // Dekat Avatar -> Timer -> Tangkap Layar -> Musik -> Chat AI (paling kanan)
    const ordered = this.orderItems(openItems, true)
    const totalW = ordered.reduce((acc, i) => acc + i.currentWidth, 0) + (ordered.length - 1) * PAD

    // Kasus A: Muat bersanding horizontal di sisi kanan
    if (rightFlankWidth >= totalW) {
      let curLeft = rightFlankLeftEdge
      for (const item of ordered) {
        this.positionItem(item, Math.min(screenW - item.currentWidth - MARGIN, curLeft), screenH, hudTop, hudH, avatarBounds, avatarTop)
        curLeft += item.currentWidth + PAD
      }
      return
    }

    // Kasus B: Ruang kanan sempit -> Tumpuk 2 tool pertama vertikal di kolom 1, sisanya + Chat di kolom sebelah
    const nonChat = ordered.filter((i) => i.id !== 'chat')
    if (nonChat.length >= 2 && chatItem) {
      const primary = nonChat.slice(0, 2)
      const overflow = nonChat.slice(2)
      const toolW = primary.reduce((max, t) => Math.max(max, t.currentWidth), 0)
      const col1Left = rightFlankLeftEdge

      let curTop = Math.max(MARGIN, avatarTop)
      for (const tool of primary) {
        const clampedTop = Math.max(MARGIN, Math.min(screenH - tool.currentHeight - MARGIN, curTop))
        this.applyWindowPosition(tool.element, col1Left, clampedTop)
        curTop = clampedTop + tool.currentHeight + 10
      }

      let nextLeft = col1Left + toolW + PAD
      for (const extra of overflow) {
        this.positionItem(extra, Math.min(screenW - extra.currentWidth - MARGIN, nextLeft), screenH, hudTop, hudH, avatarBounds, avatarTop)
        nextLeft += extra.currentWidth + PAD
      }

      const chatLeft = Math.min(screenW - chatItem.currentWidth - MARGIN, nextLeft)
      const chatTop = Math.max(MARGIN, Math.min(screenH - chatItem.currentHeight - MARGIN, avatarTop))
      this.applyWindowPosition(chatItem.element, chatLeft, chatTop)
      return
    }

    // Kasus C: Susun horizontal dengan clamping batas layar
    let curLeft = rightFlankLeftEdge
    for (const item of ordered) {
      this.positionItem(item, Math.min(screenW - item.currentWidth - MARGIN, curLeft), screenH, hudTop, hudH, avatarBounds, avatarTop)
      curLeft += item.currentWidth + PAD
    }
  }

  stackToolsVertically(tools, leftFlankRightEdge, screenH, hudTop, hudH, avatarBounds, avatarTop, MARGIN, PAD = 14) {
    if (!tools || tools.length === 0) return leftFlankRightEdge
    const primary = tools.slice(0, 2)
    const overflow = tools.slice(2)

    const maxW = primary.reduce((max, t) => Math.max(max, t.currentWidth), 0)
    const col1Left = Math.max(MARGIN, leftFlankRightEdge - maxW)
    let curTop = Math.max(MARGIN, avatarTop)

    for (const t of primary) {
      const clampedTop = Math.max(MARGIN, Math.min(screenH - t.currentHeight - MARGIN, curTop))
      this.applyWindowPosition(t.element, col1Left, clampedTop)
      curTop = clampedTop + t.currentHeight + 10
    }

    let leftmostEdge = col1Left
    for (const extra of overflow) {
      const extraLeft = Math.max(MARGIN, leftmostEdge - PAD - extra.currentWidth)
      this.positionItem(extra, extraLeft, screenH, hudTop, hudH, avatarBounds, avatarTop)
      leftmostEdge = extraLeft
    }

    return leftmostEdge
  }

  positionItem(item, left, screenH, hudTop, hudH, avatarBounds, avatarTop) {
    if (!item?.element) return
    const MARGIN = 16
    let top
    if (item.id === 'timer') {
      top =
        hudTop !== null
          ? hudTop + hudH / 2 - item.currentHeight / 2
          : avatarBounds
            ? avatarBounds.centerY - item.currentHeight / 2
            : 120
    } else if (item.id === 'vision') {
      top = avatarTop ? avatarTop + 15 : 110
    } else if (item.id === 'music') {
      top = avatarTop ? avatarTop + 10 : 100
    } else {
      top = avatarTop ? avatarTop + 20 : 100
    }

    top = Math.max(MARGIN, Math.min(screenH - item.currentHeight - MARGIN, top))
    this.applyWindowPosition(item.element, left, top)
  }

  applyWindowPosition(el, left, top) {
    if (!el) return
    el.style.left = `${Math.round(left)}px`
    el.style.top = `${Math.round(top)}px`
    el.style.bottom = 'auto'
    el.style.right = 'auto'
    el.style.transform = 'none'
  }
}

export const tilingManager = new TilingWindowManager()
