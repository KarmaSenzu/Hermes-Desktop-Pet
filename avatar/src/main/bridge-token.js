import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DIR = join(homedir(), '.hermes-avatar')
export const BRIDGE_TOKEN_FILE = join(DIR, 'bridge-token')

export function loadOrCreateBridgeToken() {
  try {
    if (existsSync(BRIDGE_TOKEN_FILE)) {
      const t = readFileSync(BRIDGE_TOKEN_FILE, 'utf8').trim()
      if (/^[a-f0-9]{64}$/.test(t)) return t
    }
  } catch {}
  const token = randomBytes(32).toString('hex')
  mkdirSync(DIR, { recursive: true })
  writeFileSync(BRIDGE_TOKEN_FILE, token, { encoding: 'utf8', mode: 0o600 })
  return token
}
