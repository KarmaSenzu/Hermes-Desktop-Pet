import { describe, it, expect } from 'vitest'
import { formatKeyName, renderKeycapsHtml, keyEventToAccelerator } from '../src/renderer/js/settings-shortcuts.js'

describe('settings-shortcuts', () => {
  it('formatKeyName memetakan nama modifier dan tombol arah', () => {
    expect(formatKeyName('Shift')).toBe('Shift')
    expect(formatKeyName('Space')).toBe('Spasi')
    expect(formatKeyName('Up')).toBe('↑ Up')
    expect(formatKeyName('Down')).toBe('↓ Down')
  })

  it('renderKeycapsHtml membungkus tombol dalam tag kbd aman', () => {
    const html = renderKeycapsHtml('Ctrl+Shift+A')
    expect(html).toContain('<kbd class="mac-kbd">Ctrl</kbd>')
    expect(html).toContain('<kbd class="mac-kbd">Shift</kbd>')
    expect(html).toContain('<kbd class="mac-kbd">A</kbd>')
  })

  it('keyEventToAccelerator mendeteksi kombinasi tombol dengan benar', () => {
    const dummyEvent = {
      key: 'k',
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
      metaKey: false
    }
    const accel = keyEventToAccelerator(dummyEvent)
    expect(accel).toBe('CommandOrControl+K')
  })

  it('keyEventToAccelerator mengabaikan modifier murni tanpa tombol aksi', () => {
    const modifierOnly = {
      key: 'Control',
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
      metaKey: false
    }
    expect(keyEventToAccelerator(modifierOnly)).toBeNull()
  })
})
