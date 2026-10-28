import { describe, it, expect } from 'vitest'
import { isSafeArg } from '../src/main/cli-args.js'

describe('cli-args validation tests', () => {
  it('1) hanya mengizinkan persis --json untuk argumen berawalan dash, menolak opsi lain seperti --help', () => {
    expect(isSafeArg('--json')).toBe(true)
    expect(isSafeArg('--help')).toBe(false)
    expect(isSafeArg('-v')).toBe(false)
    expect(isSafeArg('--json-flag')).toBe(false)
  })

  it('2) memvalidasi argumen standar non-query (pdf true, a & calc false)', () => {
    expect(isSafeArg('pdf')).toBe(true)
    expect(isSafeArg('oc-prod/rap/deepseek-v4-pro')).toBe(true)
    expect(isSafeArg('a & calc')).toBe(false)
    expect(isSafeArg('foo;rm -rf')).toBe(false)
    expect(isSafeArg('foo|bar')).toBe(false)
  })

  it('3) memvalidasi argumen query pencarian jika isQuery=true', () => {
    expect(isSafeArg('pdf tool', true)).toBe(true)
    expect(isSafeArg('a & calc', true)).toBe(false)
    expect(isSafeArg('--help', true)).toBe(false)
    expect(isSafeArg('--json', true)).toBe(true)
  })
})
