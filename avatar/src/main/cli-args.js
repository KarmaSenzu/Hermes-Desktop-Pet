/**
 * cli-args.js — Validator murni untuk argumen CLI Hermes
 */

export const SAFE_ARG = /^[A-Za-z0-9._:\/@+=-]{1,200}$/
export const SAFE_QUERY = /^[A-Za-z0-9 ._-]{1,64}$/

/**
 * Validasi apakah argumen CLI aman dari injection dan option injection
 * @param {string} val - Nilai argumen
 * @param {boolean} isQuery - True jika merupakan argumen pencarian (memperbolehkan spasi)
 * @returns {boolean}
 */
export function isSafeArg(val, isQuery = false) {
  const a = String(val ?? '').trim()
  if (!a) return false

  if (a.startsWith('-')) {
    return a === '--json'
  }

  return isQuery ? SAFE_QUERY.test(a) : SAFE_ARG.test(a)
}
