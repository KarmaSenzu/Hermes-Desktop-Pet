import { describe, it, expect, vi } from 'vitest'
import { HermesClient } from '../src/renderer/js/hermes-client.js'

describe('HermesClient: empty message abort, interrupt & direct approval', () => {
  it('menolak lebih awal (early abort) bila pesan kosong / whitespace / zero-width tanpa mengirim ke server', async () => {
    const client = new HermesClient('ws://127.0.0.1:9119/api/ws', 'tok')
    client.sessionId = 'sess-1'
    client.request = vi.fn()

    await expect(client.submitPrompt('')).rejects.toThrow(/kosong/i)
    await expect(client.submitPrompt('   \n\t  ')).rejects.toThrow(/kosong/i)
    await expect(client.submitPrompt('\u200B\uFEFF')).rejects.toThrow(/kosong/i)
    expect(client.request).not.toHaveBeenCalled()
  })

  it('menjaga spasi, indentasi, dan baris baru multi-line (Shift+Enter) saat mengirim pesan valid', async () => {
    const client = new HermesClient('ws://127.0.0.1:9119/api/ws', 'tok')
    client.sessionId = 'sess-1'
    client.request = vi.fn(async () => ({ accepted: true }))

    const multiLine = 'Baris 1\n  Indentasi 2 spasi\n\nParagraf ke-2'
    await client.submitPrompt(multiLine)
    expect(client.request).toHaveBeenCalledWith('prompt.submit', {
      session_id: 'sess-1',
      text: multiLine
    })
  })

  it('mengirim RPC approval.respond dan session.interrupt dengan session_id yang benar', async () => {
    const client = new HermesClient('ws://127.0.0.1:9119/api/ws', 'tok')
    client.sessionId = 'sess-live'
    client.request = vi.fn(async () => ({ resolved: true }))

    await client.respondApproval('once')
    expect(client.request).toHaveBeenCalledWith('approval.respond', {
      choice: 'once',
      session_id: 'sess-live'
    }, 8000)

    await client.interruptSession()
    expect(client.request).toHaveBeenCalledWith('session.interrupt', {
      session_id: 'sess-live'
    }, 5000)
  })
})
