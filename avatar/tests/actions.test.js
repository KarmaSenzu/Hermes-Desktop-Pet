import { describe, it, expect } from 'vitest'
import { TERMINAL_ACTIONS, resolveTerminalAction } from '../src/main/actions.js'

describe('actions: resolveTerminalAction', () => {
  it('id tidak dikenal -> mengembalikan null', () => {
    expect(resolveTerminalAction('unknown-action')).toBeNull()
    expect(resolveTerminalAction('calc')).toBeNull()
    expect(resolveTerminalAction('')).toBeNull()
    expect(resolveTerminalAction(null)).toBeNull()
    expect(resolveTerminalAction(undefined)).toBeNull()
    expect(resolveTerminalAction(123)).toBeNull()
  })

  it("id '__proto__' dan 'constructor' -> mengembalikan null", () => {
    expect(resolveTerminalAction('__proto__')).toBeNull()
    expect(resolveTerminalAction('constructor')).toBeNull()
    expect(resolveTerminalAction('toString')).toBeNull()
  })

  it('semua cmd tabel adalah string tanpa karakter & | ; ^ " % < >, args array of string', () => {
    const dangerousPattern = /[&|;^"%<>]/

    for (const [id, action] of Object.entries(TERMINAL_ACTIONS)) {
      expect(typeof action.label, `Action ${id} harus punya label string`).toBe('string')
      expect(typeof action.cmd, `Action ${id} cmd harus string`).toBe('string')
      expect(dangerousPattern.test(action.cmd), `Action ${id} cmd tidak boleh memuat karakter berbahaya`).toBe(false)
      expect(Array.isArray(action.args), `Action ${id} args harus array`).toBe(true)

      for (const arg of action.args) {
        expect(typeof arg, `Argumen untuk ${id} harus bertipe string`).toBe('string')
      }
    }
  })

  it('id yang valid berhasil diselesaikan ke cmd dan args statis', () => {
    const res = resolveTerminalAction('install-hermes')
    expect(res).not.toBeNull()
    expect(res.cmd).toBe('npm')
    expect(res.args).toEqual(['install', '-g', '@nousresearch/hermes'])
  })
})
