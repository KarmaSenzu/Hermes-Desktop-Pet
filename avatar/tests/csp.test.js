import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CSP_POLICY } from '../csp-policy.js'

describe('Content Security Policy (CSP)', () => {
  it('(a) memuat object-src none, base-uri none, frame-src none', () => {
    expect(CSP_POLICY).toContain("object-src 'none'")
    expect(CSP_POLICY).toContain("base-uri 'none'")
    expect(CSP_POLICY).toContain("frame-src 'none'")
  })

  it("(b) script-src TIDAK memuat 'unsafe-inline' dan tidak ada wildcard * di policy", () => {
    // Cari bagian script-src
    const scriptSrcMatch = CSP_POLICY.match(/script-src\s+([^;]+)/)
    expect(scriptSrcMatch).not.toBeNull()
    const scriptDirectives = scriptSrcMatch[1]
    expect(scriptDirectives).not.toContain("'unsafe-inline'")

    // Tidak boleh ada wildcard * di seluruh policy
    expect(CSP_POLICY).not.toContain('*')
  })

  it('(c) setiap out/renderer/*.html memuat meta CSP persis CSP_POLICY dan tanpa atribut on...=', () => {
    const outRendererDir = join(__dirname, '../out/renderer')
    if (!existsSync(outRendererDir)) {
      console.warn('Direktori out/renderer belum ada, tes (c) dilewati.')
      return
    }

    const htmlFiles = readdirSync(outRendererDir).filter((f) => f.endsWith('.html'))
    expect(htmlFiles.length).toBeGreaterThan(0)

    for (const file of htmlFiles) {
      const content = readFileSync(join(outRendererDir, file), 'utf8')

      // Memuat meta CSP persis CSP_POLICY
      expect(content).toContain(`content="${CSP_POLICY}"`)

      // Tidak ada atribut inline on...=
      expect(content).not.toMatch(/\son[a-z]+=/i)
    }
  })
})
