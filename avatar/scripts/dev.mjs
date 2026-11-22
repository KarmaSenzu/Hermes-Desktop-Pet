/**
 * scripts/dev.mjs — Menjalankan electron-vite dev dengan pembersihan environment variable
 * Mencegah kegagalan crash jika ELECTRON_RUN_AS_NODE terekspos di terminal lingkungan Windows/macOS.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const avatarDir = join(__dirname, '..')

const cleanEnv = { ...process.env }
delete cleanEnv.ELECTRON_RUN_AS_NODE
delete cleanEnv.ELECTRON_NO_ASAR

const electronViteJs = join(avatarDir, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')

const child = spawn(process.execPath, [electronViteJs, 'dev', '--watch', ...process.argv.slice(2)], {
  cwd: avatarDir,
  stdio: 'inherit',
  env: cleanEnv
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
