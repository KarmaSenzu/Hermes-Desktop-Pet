/**
 * tts-service.js — Layanan Text-to-Speech (Kokoro-TTS lokal, Hermes Dashboard /speak, Windows SAPI, msedge-tts)
 */

import { execFile } from 'node:child_process'

export function resolveTtsUrl(customWsUrl) {
  const wsUrl = customWsUrl || process.env['HERMES_WS_URL'] || 'ws://127.0.0.1:9119/api/ws'
  try {
    const u = new URL(wsUrl)
    u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:'
    u.pathname = '/api/audio/speak'
    u.search = ''
    u.hash = ''
    return u.toString()
  } catch {
    return 'http://127.0.0.1:9119/api/audio/speak'
  }
}

export async function synthesizeTts({
  text,
  voice,
  options = {},
  sessionToken,
  isPortOpen,
  startKokoro,
  kokoroPort = 8880
}) {
  const chosenVoice = voice || 'af_heart'
  const isKokoro = options.provider === 'kokoro' || /^[a-z]{2}_/i.test(chosenVoice)

  // 1) Jalur Kokoro-TTS (Lokal AI Anime — Apache 2.0 Komersial)
  if (isKokoro) {
    try {
      if (typeof isPortOpen === 'function' && !(await isPortOpen(kokoroPort))) {
        console.log('[tts-service] Kokoro server belum aktif di port 8880, mencoba auto-start...')
        if (typeof startKokoro === 'function') await startKokoro()
      }

      const endpoint = options.kokoroEndpoint || 'http://127.0.0.1:8880'
      const kokoroUrl = endpoint.endsWith('/speech')
        ? endpoint
        : `${endpoint.replace(/\/+$/, '')}/v1/audio/speech`

      const kokoroVoice = /^[a-z]{2}_/i.test(chosenVoice) ? chosenVoice : 'af_heart'
      const resp = await fetch(kokoroUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'kokoro',
          input: String(text),
          voice: kokoroVoice,
          speed: options.speed || 1.0,
          intonation: options.intonation || 'anime',
          lang: options.lang,
          response_format: 'wav'
        })
      })

      if (resp.ok) {
        const arrayBuf = await resp.arrayBuffer()
        const buf = Buffer.from(arrayBuf)
        const base64 = buf.toString('base64')
        return {
          ok: true,
          dataUrl: `data:audio/wav;base64,${base64}`,
          base64,
          mimeType: 'audio/wav',
          isKokoro: true,
          voice: kokoroVoice
        }
      } else {
        console.warn(`[tts-service] Kokoro server HTTP ${resp.status}:`, await resp.text().catch(() => ''))
      }
    } catch (err) {
      console.warn('[tts-service] Kokoro server offline / gagal diakses, mencoba jalur cadangan:', err?.message || err)
    }

    if (options.noFallback) {
      return {
        ok: false,
        error: `Server Kokoro-TTS (port 8880) belum aktif atau tidak merespons. Silakan buka tab Package Hub lalu klik 'Jalankan di Background App' atau 'Buka Terminal & Jalankan Server' terlebih dahulu.`
      }
    }
  }

  // 2) Jalur utama cadangan: endpoint TTS Hermes
  const token = sessionToken
  const ttsUrl = resolveTtsUrl()
  const fallbackVoice = /^[a-z]{2}_/i.test(chosenVoice) ? 'id-ID-GadisNeural' : chosenVoice
  const fallbackWarning = isKokoro
    ? `Server Kokoro offline di port 8880. Sistem beralih sementara ke suara cadangan (${fallbackVoice}).`
    : null

  try {
    const resp = await fetch(ttsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hermes-Session-Token': token
      },
      body: JSON.stringify({ text: String(text), voice: fallbackVoice })
    })
    if (resp.ok) {
      const data = await resp.json()
      if (data && data.ok && data.data_url) {
        return {
          ok: true,
          dataUrl: data.data_url,
          mimeType: data.mime_type || 'audio/mpeg',
          isFallback: isKokoro,
          warning: fallbackWarning
        }
      }
    }
  } catch {
    // Hermes tidak terjangkau → jatuh ke fallback Windows SAPI di bawah.
  }

  // 3) Fallback Offline Cepat & Pasti: Windows System.Speech SAPI
  if (process.platform === 'win32') {
    try {
      const cleanT = String(text).replace(/[\r\n\t]+/g, ' ').replace(/"/g, '""').trim()
      const b64Input = Buffer.from(cleanT, 'utf8').toString('base64')
      const psScript = `
        Add-Type -AssemblyName System.Speech
        $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
        $female = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Gender -eq 'Female' } | Select-Object -First 1
        if ($female) { $s.SelectVoice($female.VoiceInfo.Name) }
        $ms = New-Object System.IO.MemoryStream
        $s.SetOutputToWaveStream($ms)
        $bytes = [System.Convert]::FromBase64String("${b64Input}")
        $txt = [System.Text.Encoding]::UTF8.GetString($bytes)
        $s.Speak($txt)
        [System.Convert]::ToBase64String($ms.ToArray())
      `
      const base64Wav = await new Promise((res, rej) => {
        execFile('powershell', ['-NoProfile', '-Command', psScript], { timeout: 12000 }, (err, stdout) => {
          if (err) return rej(err)
          res(stdout.trim())
        })
      })

      if (base64Wav) {
        return {
          ok: true,
          dataUrl: `data:audio/wav;base64,${base64Wav}`,
          base64: base64Wav,
          mimeType: 'audio/wav',
          isFallback: isKokoro,
          warning: fallbackWarning
        }
      }
    } catch (err) {
      console.warn('[tts-service] Windows SAPI fallback gagal:', err?.message || err)
    }
  }

  // 4) Fallback darurat: msedge-tts
  try {
    const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts')
    const tts = new MsEdgeTTS()
    await tts.setMetadata(fallbackVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)

    const stream = tts.toStream(String(text))
    const chunks = []
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk))
    }
    const buffer = Buffer.concat(chunks)
    return {
      ok: true,
      base64: buffer.toString('base64'),
      mimeType: 'audio/mpeg',
      isFallback: isKokoro,
      warning: fallbackWarning
    }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}
