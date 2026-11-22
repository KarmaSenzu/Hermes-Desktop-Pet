/**
 * Helper murni perhitungan posisi bubble di atas kepala avatar agar tetap
 * terpusat di atas kepala, mengikuti perpindahan/skala avatar, aman di tepi layar,
 * dan tidak saling menumpuk dengan #speech-bubble.
 */

export function getDefaultAvatarBounds(screenW, screenH) {
  const w = Math.max(320, Number(screenW) || 1280)
  const h = Math.max(240, Number(screenH) || 720)
  return {
    left: Math.round(w * 0.25),
    right: Math.round(w * 0.75),
    top: Math.max(48, Math.round(h * 0.14)),
    bottom: Math.round(h * 0.92),
    centerX: Math.round(w / 2),
    centerY: Math.round(h * 0.53),
    width: Math.round(w * 0.5),
    height: Math.round(h * 0.78)
  }
}

export function computeHeadBubblePosition({
  bounds,
  bubbleW,
  bubbleH,
  screenW,
  screenH,
  margin = 16,
  headGap = 14,
  avoidRect = null,
  stackGap = 8
}) {
  const w = Math.max(1, Number(bubbleW) || 200)
  const h = Math.max(1, Number(bubbleH) || 36)
  const sw = Math.max(w + margin * 2, Number(screenW) || 1280)
  const sh = Math.max(h + margin * 2, Number(screenH) || 720)
  const safeBounds = bounds || getDefaultAvatarBounds(sw, sh)

  let left = safeBounds.centerX - (w / 2)
  left = Math.max(margin, Math.min(sw - w - margin, left))

  let top
  if (avoidRect && Number.isFinite(avoidRect.top) && Number.isFinite(avoidRect.bottom)) {
    const above = avoidRect.top - h - stackGap
    if (above >= margin) {
      top = above
    } else {
      const below = avoidRect.bottom + stackGap
      top = (below + h <= sh - margin) ? below : margin
    }
  } else {
    top = safeBounds.top - h - headGap
    if (top < margin) {
      top = safeBounds.top + 28
    }
  }

  top = Math.max(margin, Math.min(sh - h - margin, top))

  return {
    left: Math.round(left),
    top: Math.round(top)
  }
}
