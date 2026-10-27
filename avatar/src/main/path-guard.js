import { realpathSync } from 'node:fs'
import { relative, isAbsolute, sep } from 'node:path'

export const ENFORCE = false

const approvedRoots = new Set()

export function approveRoot(p) {
  try {
    approvedRoots.add(realpathSync(p))
  } catch {}
}

function inside(root, target) {
  try {
    const rel = relative(realpathSync(root), realpathSync(target))
    return rel === '' || (rel.split(sep)[0] !== '..' && !isAbsolute(rel))
  } catch {
    return false
  }
}

export function isPathAllowed(target, fixedRoots = []) {
  const ok = [...fixedRoots, ...approvedRoots].some((r) => inside(r, target))
  if (!ok) {
    console.warn('[path-guard]', ENFORCE ? 'BLOCK' : 'WOULD-BLOCK', '(path disembunyikan, hanya ekstensi):', String(target).split('.').pop())
  }
  return ok || !ENFORCE
}
