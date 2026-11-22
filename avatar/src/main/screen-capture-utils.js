/**
 * screen-capture-utils.js — Utilitas pemetaan koordinat crop dan pemilihan sumber layar Screen Vision.
 */

function isThumbnailNonEmpty(source) {
  if (!source || !source.thumbnail) return false
  if (typeof source.thumbnail.isEmpty === 'function') {
    return !source.thumbnail.isEmpty()
  }
  return true
}

/**
 * Memetakan `cropRect` (koordinat CSS viewport atau piksel langsung) ke persegi
 * yang aman dan proporsional terhadap dimensi gambar tangkapan aktual.
 *
 * @param {object} cropRect
 * @param {{ width: number, height: number }} imageSize
 * @returns {{ x: number, y: number, width: number, height: number } | null}
 */
export function resolveSafeCropRect(cropRect, imageSize) {
  const imgW = Math.round(Number(imageSize?.width || 0))
  const imgH = Math.round(Number(imageSize?.height || 0))
  if (!cropRect || typeof cropRect !== 'object') return null
  if (!Number.isFinite(imgW) || !Number.isFinite(imgH) || imgW < 1 || imgH < 1) {
    return null
  }

  let rawX
  let rawY
  let rawW
  let rawH

  const hasViewport =
    Number.isFinite(cropRect.viewportWidth) &&
    cropRect.viewportWidth > 0 &&
    Number.isFinite(cropRect.viewportHeight) &&
    cropRect.viewportHeight > 0 &&
    Number.isFinite(cropRect.cssX) &&
    Number.isFinite(cropRect.cssY) &&
    Number.isFinite(cropRect.cssWidth) &&
    Number.isFinite(cropRect.cssHeight)

  if (hasViewport) {
    const scaleX = imgW / cropRect.viewportWidth
    const scaleY = imgH / cropRect.viewportHeight
    rawX = cropRect.cssX * scaleX
    rawY = cropRect.cssY * scaleY
    rawW = cropRect.cssWidth * scaleX
    rawH = cropRect.cssHeight * scaleY
  } else {
    rawX = Number.isFinite(cropRect.x) ? cropRect.x : 0
    rawY = Number.isFinite(cropRect.y) ? cropRect.y : 0
    rawW = Number.isFinite(cropRect.width) && cropRect.width > 0 ? cropRect.width : imgW
    rawH = Number.isFinite(cropRect.height) && cropRect.height > 0 ? cropRect.height : imgH
  }

  const rx = Math.max(0, Math.min(Math.round(rawX), imgW - 1))
  const ry = Math.max(0, Math.min(Math.round(rawY), imgH - 1))
  const rw = Math.max(1, Math.min(Math.round(rawW), imgW - rx))
  const rh = Math.max(1, Math.min(Math.round(rawH), imgH - ry))

  return { x: rx, y: ry, width: rw, height: rh }
}

/**
 * Memilih sumber layar (`screen:*`) yang sesuai `targetDisplayId` dengan
 * memastikan thumbnail tidak kosong sebelum fallback ke sumber layar lain.
 *
 * @param {Array} sources
 * @param {string|number} [targetDisplayId]
 * @returns {object|null}
 */
export function pickMatchingScreenSource(sources, targetDisplayId) {
  if (!Array.isArray(sources) || sources.length === 0) return null

  const screens = sources.filter((s) => String(s?.id || '').startsWith('screen:'))
  const hasTargetId =
    targetDisplayId !== undefined &&
    targetDisplayId !== null &&
    String(targetDisplayId).trim() !== ''

  if (hasTargetId) {
    const targetStr = String(targetDisplayId)
    const exactMatch = screens.find(
      (s) => String(s?.display_id || '') === targetStr && isThumbnailNonEmpty(s)
    )
    if (exactMatch) return exactMatch
  }

  const firstValidScreen = screens.find((s) => isThumbnailNonEmpty(s))
  if (firstValidScreen) return firstValidScreen

  return screens[0] || sources.find((s) => isThumbnailNonEmpty(s)) || sources[0] || null
}
