import { describe, it, expect, beforeEach } from 'vitest'
import { t, tList, setLocale, getLocale, SUPPORTED_LOCALES, DEFAULT_LOCALE } from '../src/renderer/js/i18n.js'

describe('i18n', () => {
  beforeEach(() => {
    setLocale('id', { persist: false })
  })

  it('mendukung id & en', () => {
    expect(SUPPORTED_LOCALES).toEqual(['id', 'en'])
    expect(DEFAULT_LOCALE).toBe('id')
  })

  it('mengembalikan string sesuai locale aktif', () => {
    setLocale('id', { persist: false })
    expect(t('avatar.voice.on')).toContain('Suara')
    setLocale('en', { persist: false })
    expect(t('avatar.voice.on')).toMatch(/Sound on/i)
    expect(getLocale()).toBe('en')
  })

  it('interpolasi variabel {name}', () => {
    setLocale('en', { persist: false })
    expect(t('avatar.app.notFound', { name: 'Safari' })).toContain('Safari')
  })

  it('tList mengembalikan array idle lines berbahasa sesuai locale', () => {
    setLocale('id', { persist: false })
    const id = tList('avatar.idle.lines')
    expect(Array.isArray(id)).toBe(true)
    expect(id.length).toBeGreaterThan(0)
    setLocale('en', { persist: false })
    const en = tList('avatar.idle.lines')
    expect(en.length).toBe(id.length)
    expect(en[0]).not.toBe(id[0])
  })

  it('fallback ke key bila tidak ada', () => {
    expect(t('nonexistent.key.xyz')).toBe('nonexistent.key.xyz')
  })

  it('normalisasi locale tak dikenal ke default', () => {
    expect(setLocale('fr', { persist: false })).toBe('id')
    expect(setLocale('en-US', { persist: false })).toBe('en')
  })

  it('label navigasi berubah sesuai bahasa', () => {
    setLocale('id', { persist: false })
    expect(t('nav.character')).toBe('Karakter & Model')
    expect(t('nav.brain')).toContain('Otomasi')
    setLocale('en', { persist: false })
    expect(t('nav.character')).toBe('Characters & Models')
    expect(t('nav.storage')).toBe('Storage')
  })
})
