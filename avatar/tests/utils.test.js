import { describe, it, expect } from 'vitest'
import { escapeHtml } from '../src/renderer/js/utils.js'

describe('utils: escapeHtml', () => {
  it('menyaring karakter rawan XSS menjadi entity HTML aman', () => {
    const raw = '<script>alert("xss & \'attack\'")</script>'
    const escaped = escapeHtml(raw)
    expect(escaped).toBe('&lt;script&gt;alert(&quot;xss &amp; &#039;attack&#039;&quot;)&lt;/script&gt;')
    expect(escaped).not.toContain('<')
    expect(escaped).not.toContain('>')
  })

  it('menangani string kosong, null, atau undefined dengan aman', () => {
    expect(escapeHtml('')).toBe('')
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })
})
