import { realpathSync } from 'node:fs'
import { relative, isAbsolute, sep } from 'node:path'

export const ENFORCE = false

const approvedRoots = new Set()

const DENY_BASENAMES = new Set([
  '.env',
  'config.yaml',
  'session-token',
  'bridge-token',
  'apps_cache.json',
  'music_library.json',
  'shortcuts.json',
  'state.db',
  'data.sqlite'
])

const DENY_SEGMENTS = new Set([
  '.ssh',
  '.aws',
  '.gnupg',
  '.kube',
  '.hermes'
])

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
  const norm = String(target || '').trim().toLowerCase()
  const segments = norm.split(/[/\\]+/).filter(Boolean)
  const base = segments[segments.length - 1] || ''
  const ext = base.includes('.') ? base.split('.').pop() : ''

  if (DENY_BASENAMES.has(base) || segments.some((s) => DENY_SEGMENTS.has(s))) {
    console.warn('[path-guard] DENY (selalu)', ext)
    return false
  }

  // Juga periksa realpath bila target ada di disk (anti symlink traversal ke deny targets)
  try {
    const real = realpathSync(target).toLowerCase()
    const realSegments = real.split(/[/\\]+/).filter(Boolean)
    const realBase = realSegments[realSegments.length - 1] || ''
    if (DENY_BASENAMES.has(realBase) || realSegments.some((s) => DENY_SEGMENTS.has(s))) {
      console.warn('[path-guard] DENY (selalu)', ext)
      return false
    }
  } catch {}

  const ok = [...fixedRoots, ...approvedRoots].some((r) => inside(r, target))
  if (!ok) {
    console.warn('[path-guard]', ENFORCE ? 'BLOCK' : 'WOULD-BLOCK', '(path disembunyikan, hanya ekstensi):', ext)
  }
  return ok || !ENFORCE
}
