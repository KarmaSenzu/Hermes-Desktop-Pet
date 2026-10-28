import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { IPC_POLICY, WINDOWS, RPC_ALLOWED_METHODS } from '../src/main/ipc-policy.js'

describe('ipc-policy: verifikasi konsistensi statis', () => {
  const avatarPreloadCode = fs.readFileSync(path.resolve(__dirname, '../src/preload/avatar.js'), 'utf8')
  const settingsPreloadCode = fs.readFileSync(path.resolve(__dirname, '../src/preload/settings.js'), 'utf8')
  const mainIndexCode = fs.readFileSync(path.resolve(__dirname, '../src/main/index.js'), 'utf8')

  function extractChannels(code) {
    const matches = code.matchAll(/ipcRenderer\.(invoke|send)\(\s*['"](avatar:[a-zA-Z0-9_\-]+)['"]/g)
    const list = []
    for (const m of matches) {
      list.push(m[2])
    }
    return Array.from(new Set(list))
  }

  it('(a) Tiap string channel di preload/avatar.js dan settings.js ada di IPC_POLICY dan memuat nama window terkait', () => {
    const avatarChannels = extractChannels(avatarPreloadCode)
    const settingsChannels = extractChannels(settingsPreloadCode)

    expect(avatarChannels.length).toBeGreaterThan(0)
    for (const ch of avatarChannels) {
      expect(IPC_POLICY, `Channel ${ch} di preload/avatar.js harus terdaftar di IPC_POLICY`).toHaveProperty(ch)
      expect(IPC_POLICY[ch], `IPC_POLICY untuk ${ch} harus mengizinkan 'avatar'`).toContain('avatar')
    }

    expect(settingsChannels.length).toBeGreaterThan(0)
    for (const ch of settingsChannels) {
      expect(IPC_POLICY, `Channel ${ch} di preload/settings.js harus terdaftar di IPC_POLICY`).toHaveProperty(ch)
      expect(IPC_POLICY[ch], `IPC_POLICY untuk ${ch} harus mengizinkan 'settings'`).toContain('settings')
    }
  })

  it('(b) Tiap channel di IPC_POLICY memiliki TEPAT satu registrasi secureHandle/secureOn di src/main (tanpa duplikat, tanpa yatim)', () => {
    const regMatches = mainIndexCode.matchAll(/secure(Handle|On)\(\s*['"](avatar:[a-zA-Z0-9_\-]+)['"]/g)
    const registeredCounts = {}

    for (const m of regMatches) {
      const ch = m[2]
      registeredCounts[ch] = (registeredCounts[ch] || 0) + 1
    }

    // 1. Tidak ada registrasi ganda
    for (const [ch, count] of Object.entries(registeredCounts)) {
      expect(count, `Channel ${ch} tidak boleh didaftarkan lebih dari 1 kali`).toBe(1)
    }

    // 2. Tiap channel di IPC_POLICY harus terdaftar tepat satu kali di index.js
    const policyChannels = Object.keys(IPC_POLICY)
    for (const ch of policyChannels) {
      expect(registeredCounts[ch], `Channel ${ch} di IPC_POLICY harus terdaftar tepat 1 kali di src/main`).toBe(1)
    }

    // 3. Tiap channel yang didaftarkan di index.js harus ada di IPC_POLICY
    for (const ch of Object.keys(registeredCounts)) {
      expect(IPC_POLICY, `Channel ${ch} yang didaftarkan di index.js harus ada di IPC_POLICY`).toHaveProperty(ch)
    }
  })

  it('(c) preload/avatar.js TIDAK memuat channel dari daftar prinsip terlarang kecuali yang berstatus UTANG', () => {
    const avatarChannels = extractChannels(avatarPreloadCode)

    const SENSITIVE_FORBIDDEN = [
      'avatar:run-in-terminal',
      'avatar:rpc',
      'avatar:set-llm-provider',
      'avatar:set-model',
      'avatar:set-tts-config',
      'avatar:set-stt-config',
      'avatar:add-skill',
      'avatar:delete-skill',
      'avatar:install-skill',
      'avatar:download-and-apply-update',
      'avatar:relaunch-app',
      'avatar:install-kokoro-deps',
      'avatar:uninstall-kokoro-deps',
      'avatar:set-custom-path',
      'avatar:encrypt-secret',
      'avatar:test-connection',
      'avatar:fetch-endpoint-models',
      'avatar:restart-hermes',
      'avatar:start-router',
      'avatar:pick-app',
      'avatar:pick-model',
      'avatar:pick-animation'
    ]

    // UTANG yang dilaporkan sebagai AVATAR-MEMAKAI-CHANNEL-SENSITIF:
    // 1. avatar:launch-app (// UTANG: dipakai main.js avatar untuk buka taskmgr/app, refaktor di T9)
    // 2. avatar:pick-audio-files (// UTANG: dipakai music-player.js di index.html)
    const REPORTED_DEBTS = new Set([
      'avatar:launch-app',
      'avatar:pick-audio-files'
    ])

    for (const ch of avatarChannels) {
      if (REPORTED_DEBTS.has(ch)) {
        continue // Diizinkan sementara sebagai utang teknis yang didokumentasikan
      }

      // Pastikan tidak ada channel sensitif terlarang lainnya
      expect(SENSITIVE_FORBIDDEN, `Channel ${ch} di preload/avatar.js melanggar prinsip keamanan avatar`).not.toContain(ch)
    }
  })

  it('(d) RPC_ALLOWED_METHODS berisi tepat 4 method yang terbukti dipanggil di renderer', () => {
    expect(RPC_ALLOWED_METHODS).toEqual([
      'config.get',
      'model.options',
      'skills.manage',
      'skills.reload'
    ])
  })
})
