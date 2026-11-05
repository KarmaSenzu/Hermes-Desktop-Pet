import { describe, it, expect } from 'vitest'
import { isNewerVersion, checkAppUpdate } from '../src/main/updater-service.js'

describe('updater-service', () => {
  it('isNewerVersion membandingkan semver dengan akurat', () => {
    expect(isNewerVersion('v1.0.1', '1.0.0')).toBe(true)
    expect(isNewerVersion('1.0.0', '1.0.1')).toBe(false)
    expect(isNewerVersion('0.1.4', '0.1.4')).toBe(false)
    expect(isNewerVersion('v2.0.0', '1.9.9')).toBe(true)
    expect(isNewerVersion('v0.2.0', 'v0.1.9')).toBe(true)
    expect(isNewerVersion('', '0.1.4')).toBe(false)
    expect(isNewerVersion(null, '0.1.4')).toBe(false)
  })

  it('checkAppUpdate terdefinisi sebagai fungsi async', () => {
    expect(typeof checkAppUpdate).toBe('function')
  })
})
