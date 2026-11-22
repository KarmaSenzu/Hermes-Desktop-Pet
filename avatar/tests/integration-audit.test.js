import { describe, it, expect, afterEach, vi } from 'vitest'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { WebSocketServer } from 'ws'

import { startBridgeServer, stopBridgeServer } from '../src/main/bridge-server.js'
import { connectGateway, disconnectGateway, request as gwRequest, isGatewayConnected } from '../src/main/hermes-gateway.js'
import { checkProviderQuota } from '../src/main/oauth-service.js'
import { loadSavedLlmProviders } from '../src/main/provider-service.js'
import { createAppRegistry, computeAppId } from '../src/main/app-registry.js'

const tempDirs = []
function makeTempDir(prefix = 'hermes-audit-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  stopBridgeServer()
  try { disconnectGateway() } catch { /* ignore */ }
  delete process.env.HERMES_WS_URL
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
})

describe('integration-audit: real loopback sockets, disk persistence & cross-platform app launch', () => {
  it('Bridge Server (:9124): /api/ping izinkan loopback/CORS tanpa bocor /api/ask tanpa token/origin sah', async () => {
    const token = 'a'.repeat(40)
    const received = []
    const srv = startBridgeServer((payload) => received.push(payload), token, 0)

    await new Promise((resolve) => {
      if (srv.listening) resolve()
      else srv.once('listening', resolve)
    })
    const port = srv.address().port
    expect(port).toBeGreaterThan(0)

    // 1. OPTIONS preflight harus ditolak 403
    const optRes = await fetch(`http://127.0.0.1:${port}/api/ping`, { method: 'OPTIONS' })
    expect(optRes.status).toBe(403)

    // 2. GET /api/ping dari origin Renderer Settings UI tanpa token -> 200 + info lengkap + CORS
    const pingRes = await fetch(`http://127.0.0.1:${port}/api/ping`, {
      headers: { Origin: 'http://localhost:5173' }
    })
    expect(pingRes.status).toBe(200)
    expect(pingRes.headers.get('access-control-allow-origin')).toBe('*')
    const pingBody = await pingRes.json()
    expect(pingBody).toEqual({
      ok: true,
      app: 'Hermes Companion Bridge',
      version: '1.1.2',
      port
    })

    // 3. GET /api/ping jika menyertakan token salah -> 401
    const badPing = await fetch(`http://127.0.0.1:${port}/api/ping`, {
      headers: { 'x-hermes-bridge-token': 'b'.repeat(40) }
    })
    expect(badPing.status).toBe(401)

    // 4. POST /api/ask tanpa token -> 401
    const unauthAsk = await fetch(`http://127.0.0.1:${port}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'halo' })
    })
    expect(unauthAsk.status).toBe(401)

    // 5. POST /api/ask dengan token sah tapi origin berbahaya -> 403
    const evilOriginAsk = await fetch(`http://127.0.0.1:${port}/api/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil.example',
        'x-hermes-bridge-token': token
      },
      body: JSON.stringify({ prompt: 'halo' })
    })
    expect(evilOriginAsk.status).toBe(403)

    // 6. POST /api/ask dengan token sah -> 200 & callback menerima payload tersanitasi
    const validAsk = await fetch(`http://127.0.0.1:${port}/api/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'chrome-extension://abcdefghijklmnop',
        'x-hermes-bridge-token': token
      },
      body: JSON.stringify({
        title: 'Paper Uji',
        url: 'https://scholar.google.com/paper',
        text: 'Abstrak uji nyata',
        prompt: 'Rangkum'
      })
    })
    expect(validAsk.status).toBe(200)
    expect(received).toHaveLength(1)
    expect(received[0]).toEqual({
      title: 'Paper Uji',
      url: 'https://scholar.google.com/paper',
      text: 'Abstrak uji nyata',
      prompt: 'Rangkum'
    })
  })

  it('Hermes Gateway WS: request nyata berhasil, putus soket segera reject pending tanpa menggantung', async () => {
    const serverSockets = new Set()
    let seenUrl = ''
    const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await new Promise((resolve) => wss.once('listening', resolve))
    const wsPort = wss.address().port

    wss.on('connection', (ws, req) => {
      seenUrl = req.url || ''
      serverSockets.add(ws)
      ws.on('message', (raw) => {
        const frame = JSON.parse(raw.toString())
        if (frame.method === 'config.get') {
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            id: frame.id,
            result: { model: 'deepseek-chat', provider: 'custom' }
          }))
        }
        // Method lain sengaja tidak dibalas untuk menguji reject saat socket putus
      })
    })

    try {
      process.env.HERMES_WS_URL = `ws://127.0.0.1:${wsPort}/api/ws`
      await connectGateway('ws-token-123')
      expect(seenUrl).toBe('/api/ws?token=ws-token-123')
      expect(isGatewayConnected()).toBe(true)

      const cfgRes = await gwRequest('config.get', { key: 'provider' })
      expect(cfgRes).toEqual({ model: 'deepseek-chat', provider: 'custom' })

      const pendingReq = gwRequest('skills.manage', { action: 'list' })
      for (const s of serverSockets) {
        s.terminate()
      }
      await expect(pendingReq).rejects.toThrow(/terputus|bermasalah|diputus|ditutup/i)
      expect(isGatewayConnected()).toBe(false)

      await expect(gwRequest('config.get', {})).rejects.toThrow(/belum terhubung/i)
    } finally {
      for (const s of serverSockets) {
        try { s.terminate() } catch { /* ignore */ }
      }
      await new Promise((resolve) => wss.close(resolve))
    }
  })

  it('checkProviderQuota: hit HTTP loopback nyata, laporkan rate-limit/error akurat, dan fallback native Gemini :listModels', async () => {
    const httpSrv = http.createServer((req, res) => {
      if (req.url === '/v1/models') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'x-ratelimit-limit-requests': '60',
          'x-ratelimit-remaining-requests': '45'
        })
        res.end(JSON.stringify({ data: [{ id: 'm1' }, { id: 'm2' }] }))
        return
      }
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'boom' }))
    })
    await new Promise((resolve) => httpSrv.listen(0, '127.0.0.1', resolve))
    const port = httpSrv.address().port

    try {
      const okRes = await checkProviderQuota({
        baseUrl: `http://127.0.0.1:${port}/v1`,
        apiKey: 'plain-key',
        resolveApiKeyFor: async (k) => k,
        getConfiguredProvider: () => null,
        getRouterQuota: async () => ({ accounts: [], modelGroups: [] })
      })
      expect(okRes.ok).toBe(true)
      expect(okRes.modelsCount).toBe(2)
      expect(okRes.rateLimits.reqLimit).toBe(60)
      expect(okRes.rateLimits.reqRemaining).toBe(45)

      const errRes = await checkProviderQuota({
        baseUrl: `http://127.0.0.1:${port}/broken`,
        apiKey: 'plain-key',
        resolveApiKeyFor: async (k) => k,
        getConfiguredProvider: () => null,
        getRouterQuota: async () => ({ accounts: [], modelGroups: [] })
      })
      expect(errRes.ok).toBe(false)
      expect(errRes.error).toContain('HTTP 500')
    } finally {
      await new Promise((resolve) => httpSrv.close(resolve))
    }

    // Uji fallback native Gemini (:listModels)
    const calls = []
    const geminiMockFetch = async (url) => {
      calls.push(String(url))
      if (String(url).includes('/openai/models')) {
        return { ok: false, status: 404, statusText: 'Not Found', headers: new Headers() }
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          models: [{ name: 'models/gemini-2.5-flash' }, { name: 'models/gemini-2.5-pro' }]
        })
      }
    }
    const gemRes = await checkProviderQuota({
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: 'gem-secret',
      fetchImpl: geminiMockFetch,
      resolveApiKeyFor: async (k) => k,
      getConfiguredProvider: () => null,
      getRouterQuota: async () => ({ accounts: [], modelGroups: [] })
    })
    expect(gemRes.ok).toBe(true)
    expect(gemRes.modelsCount).toBe(2)
    expect(calls[1]).toBe('https://generativelanguage.googleapis.com/v1beta/models?key=gem-secret')
  })

  it('loadSavedLlmProviders: impor ulang dari config.yaml saat llm_providers.json kosong dan membaca js.model', async () => {
    const dir = makeTempDir('hermes-prov-')
    const providersFile = path.join(dir, 'llm_providers.json')
    const cfgPath = path.join(dir, 'config.yaml')

    fs.writeFileSync(providersFile, JSON.stringify({ activeId: '', providers: [] }), 'utf8')
    fs.writeFileSync(cfgPath, [
      'model:',
      '  provider: custom',
      '  base_url: http://127.0.0.1:20128/v1',
      '  default: cbcn/deepseek-v4-pro'
    ].join('\n'), 'utf8')

    const res = await loadSavedLlmProviders({ providersFile, cfgPath })
    expect(res.ok).toBe(true)
    expect(res.providers).toHaveLength(1)
    expect(res.providers[0]).toMatchObject({
      name: '9Router Lokal',
      baseUrl: 'http://127.0.0.1:20128/v1',
      model: 'cbcn/deepseek-v4-pro'
    })
    expect(res.activeId).toBe(res.providers[0].id)

    const persisted = JSON.parse(fs.readFileSync(providersFile, 'utf8'))
    expect(persisted.providers).toHaveLength(1)
    expect(persisted.activeId).toBe(res.providers[0].id)
  })

  it('app-registry: peluncuran .desktop Linux (gtk-launch + fallback Exec=) dan .app macOS nyata', async () => {
    const dir = makeTempDir('hermes-apps-')
    const desktopPath = path.join(dir, 'firefox.desktop')
    fs.writeFileSync(desktopPath, '[Desktop Entry]\nType=Application\nName=Firefox\nExec="/usr/bin/firefox" --new-window %u\n', 'utf8')

    // Case A: gtk-launch berhasil
    const linuxExecSuccess = vi.fn((cmd, args, cb) => { if (typeof cb === 'function') cb(null) })
    const regA = createAppRegistry({
      cacheFile: path.join(dir, 'apps-a.json'),
      fs,
      shell: { openPath: vi.fn(async () => '') },
      dialog: { showMessageBox: vi.fn() },
      execFile: linuxExecSuccess,
      platform: 'linux'
    })
    regA.setScannedApps([{ name: 'Firefox', command: desktopPath }])
    const resA = await regA.launchById(computeAppId(desktopPath))
    expect(resA.ok).toBe(true)
    expect(linuxExecSuccess).toHaveBeenCalledWith('gtk-launch', ['firefox'], expect.any(Function))

    // Case B: gtk-launch gagal -> fallback parse Exec=
    const linuxExecFallback = vi.fn((cmd, args, cbOrOpts) => {
      if (cmd === 'gtk-launch' && typeof cbOrOpts === 'function') {
        cbOrOpts(new Error('ENOENT'))
        return
      }
      return { unref: vi.fn() }
    })
    const regB = createAppRegistry({
      cacheFile: path.join(dir, 'apps-b.json'),
      fs,
      shell: { openPath: vi.fn(async () => '') },
      dialog: { showMessageBox: vi.fn() },
      execFile: linuxExecFallback,
      platform: 'linux'
    })
    regB.setScannedApps([{ name: 'Firefox', command: desktopPath }])
    const resB = await regB.launchById(computeAppId(desktopPath))
    expect(resB.ok).toBe(true)
    expect(linuxExecFallback).toHaveBeenCalledWith('/usr/bin/firefox', ['--new-window'], { detached: true, stdio: 'ignore' })

    // Case C: macOS .app bundle
    const appDir = path.join(dir, 'Safari.app')
    fs.mkdirSync(appDir)
    const macExec = vi.fn((cmd, args, cb) => { if (typeof cb === 'function') cb(null) })
    const regMac = createAppRegistry({
      cacheFile: path.join(dir, 'apps-mac.json'),
      fs,
      shell: { openPath: vi.fn(async () => '') },
      dialog: { showMessageBox: vi.fn() },
      execFile: macExec,
      platform: 'darwin'
    })
    regMac.setScannedApps([{ name: 'Safari', command: appDir }])
    const resMac = await regMac.launchById(computeAppId(appDir))
    expect(resMac.ok).toBe(true)
    expect(macExec).toHaveBeenCalledWith('open', ['-a', appDir], expect.any(Function))
  })
})
