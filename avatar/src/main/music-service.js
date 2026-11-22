/**
 * music-service.js — Layanan pencarian musik online & streaming audio proxy via Main Process.
 * Mendukung ekstraksi stream audio YouTube nyata via yt-dlp, pencarian InnerTube / yt-dlp / iTunes / Radio-Browser,
 * dan proxy HTTP Range (206 Partial Content) untuk custom protocol `model://music-stream/`.
 */

import {
  existsSync,
  readdirSync,
  createReadStream,
  statSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  openSync,
  readSync,
  closeSync,
  createWriteStream
} from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { parseHttpUrl } from './url-guard.js'
import { fixSystemPath } from './service-manager.js'

const execFileAsync = promisify(execFile)

const STREAM_CACHE_TTL_MS = 25 * 60 * 1000
const streamCache = new Map()
const activeCacheDownloads = new Set()
let testCacheDir = null
let cachedYtDlp = null
let cachedNodeBin = undefined

const YOUTUBE_ID_RE =
  /(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/|live\/)|youtu\.be\/|music\.youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/i

const MIME_BY_EXT = {
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  webm: 'audio/webm',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  aac: 'audio/aac',
  flac: 'audio/flac',
  wav: 'audio/wav'
}

export function setAudioCacheDirForTest(dir = null) {
  testCacheDir = dir
}

export function getAudioCacheDir() {
  if (testCacheDir) {
    try {
      if (!existsSync(testCacheDir)) mkdirSync(testCacheDir, { recursive: true })
    } catch {}
    return testCacheDir
  }
  const dir = join(homedir(), '.hermes-avatar', 'cache', 'audio')
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  } catch {}
  return dir
}

/**
 * Deteksi format audio nyata berdasarkan magic bytes di header berkas.
 * Mencegah kesalahan CoreAudio (macOS) & Chromium Demuxer (Windows) akibat
 * file WebM Opus yang salah diberi ekstensi .m4a / audio/mp4.
 */
export function detectAudioFileType(filePath) {
  try {
    if (!filePath || !existsSync(filePath)) return null
    const fd = openSync(filePath, 'r')
    const buffer = Buffer.alloc(16)
    const bytesRead = readSync(fd, buffer, 0, 16, 0)
    closeSync(fd)
    if (bytesRead < 4) return null

    // WebM / Matroska: 0x1A 0x45 0xDF 0xA3
    if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
      return { ext: 'webm', mimeType: 'audio/webm' }
    }
    // Ogg / Opus: 0x4F 0x67 0x67 0x53 ('OggS')
    if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
      return { ext: 'ogg', mimeType: 'audio/ogg' }
    }
    // MP3: ID3 tag ('ID3') atau sync header (0xFF 0xFB/0xFA/0xF3/0xF2)
    if ((buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) ||
        (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) {
      return { ext: 'mp3', mimeType: 'audio/mpeg' }
    }
    // MP4 / M4A: 'ftyp' at offset 4
    if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
      return { ext: 'm4a', mimeType: 'audio/mp4' }
    }
    // WAV: 'RIFF'
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
      return { ext: 'wav', mimeType: 'audio/wav' }
    }
    // FLAC: 'fLaC'
    if (buffer[0] === 0x66 && buffer[1] === 0x4c && buffer[2] === 0x61 && buffer[3] === 0x43) {
      return { ext: 'flac', mimeType: 'audio/flac' }
    }
  } catch {}
  return null
}

export function findCachedAudioFile(videoId) {
  if (!videoId || typeof videoId !== 'string') return null
  const cleanId = videoId.replace(/[^a-zA-Z0-9_-]/g, '')
  if (!cleanId) return null
  const dir = getAudioCacheDir()
  const extensions = ['m4a', 'mp4', 'webm', 'mp3', 'opus', 'ogg', 'wav', 'flac']
  for (const ext of extensions) {
    const candidate = join(dir, `${cleanId}.${ext}`)
    try {
      if (existsSync(candidate)) {
        const stat = statSync(candidate)
        if (stat.isFile() && stat.size > 32 * 1024) {
          const detected = detectAudioFileType(candidate)
          return {
            path: candidate,
            size: stat.size,
            ext: detected?.ext || ext,
            mimeType: detected?.mimeType || MIME_BY_EXT[ext] || 'audio/mp4'
          }
        }
      }
    } catch {}
  }
  return null
}

export async function downloadAudioToCache(videoId, watchUrl, { resolvePythonCmd, execFileImpl, fetchImpl = globalThis.fetch } = {}) {
  if (!videoId || activeCacheDownloads.has(videoId)) return null
  const alreadyCached = findCachedAudioFile(videoId)
  if (alreadyCached) return alreadyCached

  activeCacheDownloads.add(videoId)
  try {
    const dir = getAudioCacheDir()
    const tempPath = join(dir, `${videoId}.part`)
    const execImpl = execFileImpl || execFileAsync

    try {
      if (existsSync(tempPath)) unlinkSync(tempPath)
    } catch {}

    const ytdlp = await resolveYtDlpCommand({ resolvePythonCmd, execFileImpl })
    if (ytdlp) {
      const nodeBin = execFileImpl ? null : await resolveNodeBinary(execImpl)
      const runtimeArgs = nodeBin ? ['--js-runtimes', nodeBin === 'node' ? 'node' : `node:${nodeBin}`] : []

      const args = [
        ...ytdlp.baseArgs,
        '--no-update',
        ...runtimeArgs,
        '--no-playlist',
        '-f', 'bestaudio[ext=m4a]/bestaudio/ba/18/b',
        '-o', tempPath,
        watchUrl || `https://www.youtube.com/watch?v=${videoId}`
      ]

      await execImpl(ytdlp.cmd, args, { timeout: 45000, maxBuffer: 10 * 1024 * 1024, windowsHide: true })
    } else {
      // Fallback zero-install (lintas platform, terutama di macOS tanpa yt-dlp):
      // Ambil stream langsung dari resolveMusicStream lalu unduh lewat fetch
      const streamInfo = await resolveMusicStream({ videoId, url: watchUrl, resolvePythonCmd, execFileImpl, fetchImpl })
      const directStreamUrl = streamInfo?.streamUrl || streamCache.get(`yt-${videoId}`)?.streamUrl
      if (directStreamUrl && parseHttpUrl(directStreamUrl)) {
        const resp = await fetchImpl(directStreamUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36' }
        })
        if (resp.ok && resp.body) {
          const fileStream = createWriteStream(tempPath)
          const nodeStream = Readable.fromWeb(resp.body)
          await pipeline(nodeStream, fileStream)
        }
      }
    }

    if (existsSync(tempPath)) {
      const st = statSync(tempPath)
      if (st.size > 32 * 1024) {
        const detected = detectAudioFileType(tempPath) || { ext: 'm4a', mimeType: 'audio/mp4' }
        const realTargetPath = join(dir, `${videoId}.${detected.ext}`)
        renameSync(tempPath, realTargetPath)
        return { path: realTargetPath, size: st.size, ext: detected.ext, mimeType: detected.mimeType }
      } else {
        try { unlinkSync(tempPath) } catch {}
      }
    }
  } catch (err) {
    console.warn(`[MusicCache] Unduh audio ${videoId} gagal:`, err?.message || err)
  } finally {
    activeCacheDownloads.delete(videoId)
  }
  return null
}

export function extractYouTubeVideoId(url) {
  if (!url || typeof url !== 'string') return null
  const m = url.match(YOUTUBE_ID_RE)
  return m ? m[1] : null
}

export function buildMusicSearchQuery({ query = '', title = '', artist = '' } = {}) {
  const cleanTitle = String(title || '').trim()
  const cleanArtist = String(artist || '').trim()
  const cleanQuery = String(query || '').trim()

  if (cleanTitle || cleanArtist) {
    let base = ''
    if (cleanArtist && cleanTitle) {
      base = cleanTitle.toLowerCase().includes(cleanArtist.toLowerCase())
        ? cleanTitle
        : `${cleanArtist} - ${cleanTitle}`
    } else {
      base = cleanTitle || cleanArtist
    }
    if (cleanQuery && !base.toLowerCase().includes(cleanQuery.toLowerCase())) {
      return `${base} ${cleanQuery}`.trim()
    }
    return base
  }
  return cleanQuery
}

function parseDurationSeconds(text) {
  if (typeof text === 'number' && Number.isFinite(text)) return Math.max(0, Math.round(text))
  const parts = String(text || '').trim().split(':').map((n) => Number(n))
  if (parts.some((n) => Number.isNaN(n))) return 0
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}

function scoreMusicCandidate(item, { title = '', artist = '', query = '' } = {}) {
  const itemTitle = String(item?.title || '').toLowerCase()
  const itemArtist = String(item?.artist || '').toLowerCase()
  const combinedText = `${itemTitle} ${itemArtist}`

  let score = 0
  const reqTitle = String(title || '').trim().toLowerCase()
  const reqArtist = String(artist || '').trim().toLowerCase()
  const reqQuery = String(query || '').trim().toLowerCase()

  if (reqTitle) {
    if (itemTitle.includes(reqTitle)) score += 30
    for (const w of reqTitle.split(/\s+/).filter((t) => t.length >= 2)) {
      if (itemTitle.includes(w)) score += 8
    }
  }

  if (reqArtist) {
    if (itemArtist.includes(reqArtist)) score += 30
    else if (itemTitle.includes(reqArtist)) score += 20
    for (const w of reqArtist.split(/\s+/).filter((t) => t.length >= 2)) {
      if (combinedText.includes(w)) score += 7
    }
  }

  if (reqQuery && !reqTitle && !reqArtist) {
    for (const w of reqQuery.split(/\s+/).filter((t) => t.length >= 2)) {
      if (itemTitle.includes(w)) score += 10
      if (itemArtist.includes(w)) score += 8
    }
  }

  if (/\bofficial\b/.test(itemTitle)) score += 4
  if (/\b(?:karaoke|instrumental|cover|nightcore|8d audio)\b/.test(combinedText)) {
    const wantsSpecial = /\b(?:karaoke|instrumental|cover|nightcore)\b/i.test(`${reqTitle} ${reqQuery}`)
    if (!wantsSpecial) score -= 8
  }

  if (item?.source === 'youtube') score += 3
  return score
}

async function resolveNodeBinary(execImpl = execFileAsync) {
  if (cachedNodeBin !== undefined) return cachedNodeBin
  fixSystemPath()
  const candidates = process.platform === 'win32'
    ? [
        'node',
        'C:\\Program Files\\nodejs\\node.exe',
        process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs', 'nodejs', 'node.exe') : '',
        join(homedir(), 'scoop', 'apps', 'nodejs', 'current', 'node.exe')
      ]
    : [
        'node',
        '/opt/homebrew/bin/node',
        '/usr/local/bin/node',
        '/usr/bin/node',
        join(homedir(), '.local', 'bin', 'node')
      ]

  for (const c of candidates.filter(Boolean)) {
    if (c !== 'node' && !existsSync(c)) continue
    try {
      await execImpl(c, ['--version'], { timeout: 2500, windowsHide: true })
      cachedNodeBin = c
      return cachedNodeBin
    } catch {
      // Coba kandidat berikutnya
    }
  }
  cachedNodeBin = null
  return null
}

function collectPythonScriptYtDlpCandidates(pyCmd) {
  const out = []
  const home = homedir()
  if (pyCmd && pyCmd !== 'py' && pyCmd !== 'python' && pyCmd !== 'python3') {
    const pyDir = dirname(pyCmd)
    out.push(
      join(pyDir, 'Scripts', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'),
      join(pyDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
    )
  }

  if (process.platform === 'win32') {
    const bases = [
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs', 'Python') : '',
      process.env.APPDATA ? join(process.env.APPDATA, 'Python') : '',
      join(home, 'AppData', 'Local', 'Programs', 'Python')
    ].filter((d) => d && existsSync(d))
    for (const base of bases) {
      try {
        for (const sub of readdirSync(base)) {
          out.push(join(base, sub, 'Scripts', 'yt-dlp.exe'))
        }
      } catch {
        // Abaikan folder tidak terbaca
      }
    }
    out.push('yt-dlp.exe', 'yt-dlp')
  } else {
    out.push(
      '/opt/homebrew/bin/yt-dlp',
      '/usr/local/bin/yt-dlp',
      '/usr/bin/yt-dlp',
      join(home, '.local', 'bin', 'yt-dlp'),
      'yt-dlp'
    )
  }
  return Array.from(new Set(out))
}

export async function resolveYtDlpCommand({ resolvePythonCmd, execFileImpl } = {}) {
  const execImpl = execFileImpl || execFileAsync
  if (!resolvePythonCmd && !execFileImpl && cachedYtDlp) {
    return cachedYtDlp
  }

  fixSystemPath()

  let pyCmd = null
  if (typeof resolvePythonCmd === 'function') {
    try {
      const py = await resolvePythonCmd()
      if (py?.ok && py?.cmd) pyCmd = py.cmd
    } catch {
      pyCmd = null
    }
  }

  const binCandidates = collectPythonScriptYtDlpCandidates(pyCmd)
  for (const bin of binCandidates) {
    if (!bin.startsWith('yt-dlp') && !existsSync(bin)) continue
    try {
      await execImpl(bin, ['--version'], { timeout: 3500, windowsHide: true })
      const resolved = { cmd: bin, baseArgs: [] }
      if (!resolvePythonCmd && !execFileImpl) cachedYtDlp = resolved
      return resolved
    } catch {
      // Coba kandidat berikutnya
    }
  }

  const pyFallbackCmds = [pyCmd, process.platform === 'win32' ? 'py' : 'python3', 'python'].filter(Boolean)
  for (const pyBin of Array.from(new Set(pyFallbackCmds))) {
    try {
      await execImpl(pyBin, ['-m', 'yt_dlp', '--version'], { timeout: 3500, windowsHide: true })
      const resolved = { cmd: pyBin, baseArgs: ['-m', 'yt_dlp'] }
      if (!resolvePythonCmd && !execFileImpl) cachedYtDlp = resolved
      return resolved
    } catch {
      // Lanjutkan
    }
  }

  return null
}

export function isNetworkDisconnectError(err) {
  const code = String(err?.code || err?.cause?.code || '').toUpperCase()
  if ([
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENETUNREACH',
    'EHOSTUNREACH',
    'ERR_NAME_NOT_RESOLVED',
    'ERR_INTERNET_DISCONNECTED',
    'UND_ERR_CONNECT_TIMEOUT'
  ].includes(code)) {
    return true
  }
  const msg = String(err?.message || err || '').toLowerCase()
  return (
    err?.name === 'AbortError' ||
    msg.includes('fetch failed') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('socket hang up') ||
    msg.includes('enotfound') ||
    msg.includes('eai_again') ||
    msg.includes('err_internet_disconnected')
  )
}

async function fetchYouTubeOEmbedWithStatus(videoId, fetchImpl = globalThis.fetch) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    try {
      const targetUrl = encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)
      const res = await fetchImpl(`https://www.youtube.com/oembed?url=${targetUrl}&format=json`, {
        signal: controller.signal
      })
      if (res.ok) {
        const data = await res.json()
        return {
          data: {
            title: data.title || 'YouTube Audio',
            artist: data.author_name || 'YouTube Creator',
            thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
          },
          networkError: false
        }
      }
      return { data: null, networkError: false, status: res.status }
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    return { data: null, networkError: isNetworkDisconnectError(err) }
  }
}

async function fetchYouTubeOEmbed(videoId, fetchImpl = globalThis.fetch) {
  const res = await fetchYouTubeOEmbedWithStatus(videoId, fetchImpl)
  return res.data
}

async function searchYouTubeInnerTube(query, limit, fetchImpl = globalThis.fetch, netState = null) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetchImpl('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240726.00.00',
            hl: 'en',
            gl: 'ID'
          }
        },
        query
      }),
      signal: controller.signal
    })
    if (!res.ok) return []

    const data = await res.json().catch(() => null)
    const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || []
    const items = []
    for (const sec of sections) {
      const renderers = sec?.itemSectionRenderer?.contents || []
      for (const entry of renderers) {
        const v = entry?.videoRenderer
        if (!v?.videoId) continue
        const title = v.title?.runs?.map((r) => r.text).join('') || v.title?.simpleText || ''
        const artist = v.ownerText?.runs?.map((r) => r.text).join('') ||
          v.longBylineText?.runs?.map((r) => r.text).join('') ||
          'YouTube'
        const durationText = v.lengthText?.simpleText || ''
        const duration = parseDurationSeconds(durationText)
        items.push({
          videoId: v.videoId,
          title: title || 'YouTube Audio',
          artist,
          duration,
          durationText: durationText || (duration > 0 ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}` : 'YouTube'),
          thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${v.videoId}`,
          type: 'youtube',
          badge: 'YouTube ▶',
          source: 'youtube'
        })
        if (items.length >= limit * 2) break
      }
      if (items.length >= limit * 2) break
    }
    return items
  } catch (err) {
    if (netState && isNetworkDisconnectError(err)) netState.networkError = true
    return []
  } finally {
    clearTimeout(timer)
  }
}

async function searchWithYtDlp(query, limit, { resolvePythonCmd, execFileImpl } = {}) {
  const ytdlp = await resolveYtDlpCommand({ resolvePythonCmd, execFileImpl })
  if (!ytdlp) return []
  const execImpl = execFileImpl || execFileAsync
  const nodeBin = execFileImpl ? null : await resolveNodeBinary(execImpl)
  const runtimeArgs = nodeBin ? ['--js-runtimes', nodeBin === 'node' ? 'node' : `node:${nodeBin}`] : []

  try {
    const { stdout } = await execImpl(
      ytdlp.cmd,
      [
        ...ytdlp.baseArgs,
        '--no-update',
        ...runtimeArgs,
        '--flat-playlist',
        '--dump-json',
        `ytsearch${Math.max(1, limit)}:${query}`
      ],
      { timeout: 14000, maxBuffer: 6 * 1024 * 1024, windowsHide: true }
    )
    const items = []
    for (const line of String(stdout || '').split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('{')) continue
      try {
        const info = JSON.parse(trimmed)
        if (!info?.id) continue
        const duration = Math.round(Number(info.duration || 0))
        items.push({
          videoId: info.id,
          title: info.title || 'YouTube Audio',
          artist: info.channel || info.uploader || 'YouTube',
          duration,
          durationText: duration > 0 ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}` : 'YouTube',
          thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${info.id}`,
          type: 'youtube',
          badge: 'YouTube ▶',
          source: 'youtube'
        })
      } catch {
        // Lewati baris JSON rusak
      }
    }
    return items
  } catch {
    return []
  }
}

async function searchItunesAndRadioFallback(query, limit, fetchImpl = globalThis.fetch, netState = null) {
  const results = []
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    try {
      const res = await fetchImpl(
        `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=${limit}`,
        { signal: controller.signal }
      )
      if (res.ok) {
        const data = await res.json().catch(() => null)
        for (const r of (data?.results || [])) {
          if (!r?.previewUrl || !parseHttpUrl(r.previewUrl)) continue
          results.push({
            videoId: null,
            title: r.trackName || query,
            artist: r.artistName || 'Artist',
            duration: 30,
            durationText: '0:30',
            thumbnail: r.artworkUrl100 || null,
            url: r.previewUrl,
            type: 'stream',
            badge: 'Preview 30s',
            source: 'itunes'
          })
        }
      }
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    if (netState && isNetworkDisconnectError(err)) netState.networkError = true
    // Lanjutkan ke Radio-Browser
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    try {
      const res = await fetchImpl(
        `https://de1.api.radio-browser.info/json/stations/search?name=${encodeURIComponent(query)}&limit=${limit}&hidebroken=true`,
        {
          headers: { 'User-Agent': 'HermesAvatar/1.1.1' },
          signal: controller.signal
        }
      )
      if (res.ok) {
        const stations = await res.json().catch(() => [])
        for (const st of (Array.isArray(stations) ? stations : [])) {
          const streamUrl = String(st?.url_resolved || st?.url || '').trim()
          if (!parseHttpUrl(streamUrl)) continue
          results.push({
            videoId: null,
            title: st.name || query,
            artist: st.country || st.tags || 'Radio Online',
            duration: 0,
            durationText: 'LIVE',
            thumbnail: st.favicon || null,
            url: streamUrl,
            type: 'stream',
            badge: 'Radio Live',
            source: 'radio-browser'
          })
        }
      }
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    if (netState && isNetworkDisconnectError(err)) netState.networkError = true
    // Abaikan kegagalan Radio-Browser
  }

  return results
}

export async function searchOnlineMusic({
  query = '',
  title = '',
  artist = '',
  limit = 6,
  fetchImpl = globalThis.fetch,
  resolvePythonCmd,
  execFileImpl
} = {}) {
  const maxItems = Math.max(1, Math.min(12, Number(limit) || 6))
  const combinedQuery = buildMusicSearchQuery({ query, title, artist })
  if (!combinedQuery) {
    return { ok: false, results: [], error: 'Kata kunci pencarian lagu/artis kosong.' }
  }

  // Jika pengguna menempelkan tautan YouTube ke kolom pencarian, langsung resolusi
  const directYtId = extractYouTubeVideoId(combinedQuery)
  if (directYtId) {
    const oembedStatus = await fetchYouTubeOEmbedWithStatus(directYtId, fetchImpl)
    if (oembedStatus.networkError && !oembedStatus.data) {
      return {
        ok: false,
        offline: true,
        query: combinedQuery,
        results: [{
          videoId: directYtId,
          title: title || `YouTube (${directYtId})`,
          artist: artist || 'Menunggu Jaringan...',
          duration: 0,
          durationText: 'YouTube',
          thumbnail: `https://i.ytimg.com/vi/${directYtId}/hqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${directYtId}`,
          type: 'youtube',
          badge: 'YouTube ▶',
          pendingMetadata: true,
          source: 'youtube'
        }],
        error: 'Koneksi internet terputus. Link YouTube sudah dicatat dan akan otomatis diputar begitu jaringan tersambung.'
      }
    }
    const oembed = oembedStatus.data
    return {
      ok: true,
      query: combinedQuery,
      results: [{
        videoId: directYtId,
        title: oembed?.title || title || 'YouTube Audio',
        artist: oembed?.artist || artist || 'YouTube',
        duration: 0,
        durationText: 'YouTube',
        thumbnail: oembed?.thumbnail || `https://i.ytimg.com/vi/${directYtId}/hqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${directYtId}`,
        type: 'youtube',
        badge: 'YouTube ▶',
        source: 'youtube'
      }]
    }
  }

  const netState = { networkError: false }
  let rawResults = await searchYouTubeInnerTube(combinedQuery, maxItems, fetchImpl, netState)
  if (rawResults.length === 0) {
    rawResults = await searchWithYtDlp(combinedQuery, maxItems, { resolvePythonCmd, execFileImpl })
  }
  if (rawResults.length === 0) {
    rawResults = await searchItunesAndRadioFallback(combinedQuery, maxItems, fetchImpl, netState)
  }

  if (rawResults.length === 0) {
    return {
      ok: false,
      offline: netState.networkError,
      query: combinedQuery,
      results: [],
      error: netState.networkError
        ? `Koneksi internet terputus. Pencarian "${combinedQuery}" menunggu jaringan tersambung kembali.`
        : `Tidak ditemukan lagu yang cocok untuk "${combinedQuery}".`
    }
  }

  const scored = rawResults
    .map((item, idx) => ({
      item,
      idx,
      score: scoreMusicCandidate(item, { title, artist, query })
    }))
    .sort((a, b) => (b.score - a.score) || (a.idx - b.idx))
    .slice(0, maxItems)
    .map((x) => x.item)

  return { ok: true, query: combinedQuery, results: scored }
}

function getValidCachedStream(streamId) {
  const entry = streamCache.get(streamId)
  if (!entry) return null
  if (Date.now() - entry.createdAt >= STREAM_CACHE_TTL_MS) {
    streamCache.delete(streamId)
    return null
  }
  return entry
}

export async function resolveMusicStream({
  url = '',
  videoId = '',
  title = '',
  artist = '',
  fetchImpl = globalThis.fetch,
  resolvePythonCmd,
  execFileImpl,
  forceRefresh = false
} = {}) {
  const cleanUrl = String(url || '').trim()
  const vid = String(videoId || extractYouTubeVideoId(cleanUrl) || '').trim()

  if (vid) {
    const streamId = `yt-${vid}`
    const proxyUrl = `model://music-stream/${encodeURIComponent(streamId)}?videoId=${encodeURIComponent(vid)}`

    // 1. Cek disk cache lokal (~/.hermes-avatar/cache/audio/)
    const localCached = findCachedAudioFile(vid)
    if (localCached) {
      const existing = getValidCachedStream(streamId)
      let resolvedTitle = existing?.title || title || ''
      let resolvedArtist = existing?.artist || artist || ''
      if (!resolvedTitle || resolvedTitle === 'YouTube Audio' || !resolvedArtist || resolvedArtist === 'YouTube') {
        const oembed = await fetchYouTubeOEmbed(vid, fetchImpl).catch(() => null)
        if (oembed?.title) resolvedTitle = resolvedTitle || oembed.title
        if (oembed?.artist) resolvedArtist = resolvedArtist || oembed.artist
      }
      return {
        ok: true,
        streamId,
        videoId: vid,
        proxyUrl,
        filePath: localCached.path,
        title: resolvedTitle || title || 'YouTube Audio',
        artist: resolvedArtist || artist || 'YouTube',
        duration: existing?.duration || 0,
        thumbnail: existing?.thumbnail || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
        mimeType: localCached.mimeType,
        cached: true,
        offlineCapable: true
      }
    }

    if (!forceRefresh) {
      const existing = getValidCachedStream(streamId)
      if (existing) {
        // Picu caching ke disk jika belum tersimpan
        downloadAudioToCache(vid, `https://www.youtube.com/watch?v=${vid}`, { resolvePythonCmd, execFileImpl }).catch(() => {})
        return {
          ok: true,
          streamId,
          videoId: vid,
          proxyUrl,
          title: existing.title,
          artist: existing.artist,
          duration: existing.duration,
          thumbnail: existing.thumbnail,
          mimeType: existing.mimeType,
          cached: true
        }
      }
    }

    const ytdlp = await resolveYtDlpCommand({ resolvePythonCmd, execFileImpl })
    const execImpl = execFileImpl || execFileAsync
    const watchUrl = `https://www.youtube.com/watch?v=${vid}`
    let extracted = null

    if (ytdlp) {
      const nodeBin = execFileImpl ? null : await resolveNodeBinary(execImpl)
      const runtimeArgs = nodeBin ? ['--js-runtimes', nodeBin === 'node' ? 'node' : `node:${nodeBin}`] : []
      for (const fmt of [
        'bestaudio[ext=m4a]/bestaudio/ba/18/b',
        'ba/b',
        'bestaudio/best'
      ]) {
        try {
          const { stdout } = await execImpl(
            ytdlp.cmd,
            [...ytdlp.baseArgs, '--no-update', ...runtimeArgs, '--no-playlist', '-f', fmt, '--dump-json', watchUrl],
            { timeout: 20000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }
          )
          const parsed = JSON.parse(String(stdout || '').trim().split(/\r?\n/).pop() || '{}')
          if (parsed?.url && parseHttpUrl(parsed.url)) {
            extracted = parsed
            break
          }
        } catch {
          // Coba format berikutnya
        }
      }
    }

    if (extracted) {
      const ext = String(extracted.ext || 'm4a').toLowerCase()
      const mimeType = MIME_BY_EXT[ext] || 'audio/mp4'
      const resolvedTitle = String(extracted.title || title || 'YouTube Audio').trim()
      const resolvedArtist = String(extracted.uploader || extracted.channel || artist || 'YouTube').trim()
      const duration = Math.round(Number(extracted.duration || 0))
      const thumbnail = extracted.thumbnail || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`

      streamCache.set(streamId, {
        streamUrl: extracted.url,
        httpHeaders: {},
        isYouTube: true,
        totalSize: Number(extracted.filesize || extracted.filesize_approx || 0),
        mimeType,
        title: resolvedTitle,
        artist: resolvedArtist,
        duration,
        thumbnail,
        createdAt: Date.now()
      })

      // Download audio ke cache disk di background untuk stabilitas permanen & offline
      downloadAudioToCache(vid, watchUrl, { resolvePythonCmd, execFileImpl }).catch(() => {})

      return {
        ok: true,
        streamId,
        videoId: vid,
        proxyUrl,
        title: resolvedTitle,
        artist: resolvedArtist,
        duration,
        thumbnail,
        mimeType
      }
    }

    // Fallback metadata via oEmbed: jika online -> mode electron-bg tanpa wajib yt-dlp; jika jaringan putus -> offline: true
    const oembedStatus = await fetchYouTubeOEmbedWithStatus(vid, fetchImpl)
    if (oembedStatus.data) {
      return {
        ok: true,
        mode: 'electron-bg',
        streamId,
        videoId: vid,
        watchUrl: `https://www.youtube.com/watch?v=${vid}`,
        title: oembedStatus.data.title || title || 'YouTube Audio',
        artist: oembedStatus.data.artist || artist || 'YouTube',
        duration: 0,
        thumbnail: oembedStatus.data.thumbnail || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`
      }
    }
    if (oembedStatus.networkError) {
      return {
        ok: false,
        offline: true,
        videoId: vid,
        title: title || `YouTube (${vid})`,
        artist: artist || 'Menunggu Jaringan...',
        thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
        error: 'Koneksi internet terputus. Link YouTube sudah dicatat dan akan otomatis diputar begitu ada internet.'
      }
    }
    return {
      ok: false,
      offline: false,
      videoId: vid,
      title: title || 'YouTube Audio',
      artist: artist || 'YouTube',
      thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
      error: ytdlp
        ? 'Gagal mengekstrak stream audio YouTube untuk video ini.'
        : 'Video YouTube tidak tersedia atau gagal diakses.'
    }
  }

  if (!parseHttpUrl(cleanUrl)) {
    return { ok: false, error: 'URL stream tidak valid (harus http:// atau https://).' }
  }

  const streamId = `web-${createHash('sha1').update(cleanUrl).digest('hex').slice(0, 12)}`
  const proxyUrl = `model://music-stream/${encodeURIComponent(streamId)}?url=${encodeURIComponent(cleanUrl)}`
  streamCache.set(streamId, {
    streamUrl: cleanUrl,
    httpHeaders: { 'User-Agent': 'HermesAvatar/1.1.1' },
    mimeType: '',
    title: title || 'Online Stream',
    artist: artist || 'Web Radio',
    duration: 0,
    thumbnail: null,
    createdAt: Date.now()
  })

  return {
    ok: true,
    streamId,
    proxyUrl,
    directUrl: cleanUrl,
    title: title || 'Online Stream',
    artist: artist || 'Web Radio',
    duration: 0
  }
}

const YOUTUBE_CHUNK_BYTES = 512 * 1024

export function buildBoundedRangeHeader(rawRangeHeader, totalSize = 0, chunkSize = YOUTUBE_CHUNK_BYTES) {
  const match = String(rawRangeHeader || '').match(/bytes=(\d+)-(\d*)/i)
  const start = match ? Math.max(0, Number(match[1])) : 0
  const rawEnd = (match && match[2]) ? Number(match[2]) : null
  let end = rawEnd !== null ? Math.min(rawEnd, start + chunkSize - 1) : (start + chunkSize - 1)
  if (totalSize > 0) {
    if (start >= totalSize) return `bytes=${Math.max(0, totalSize - 1)}-${totalSize - 1}`
    end = Math.min(totalSize - 1, end)
  }
  return `bytes=${start}-${Math.max(start, end)}`
}

export async function handleMusicStreamProtocolRequest(request, corsHeaders = {}, deps = {}) {
  const fetchImpl = deps.fetchImpl || globalThis.fetch
  const parsedUrl = new URL(request.url)
  const streamId = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ''))
  const videoId = parsedUrl.searchParams.get('videoId') || ''
  const directUrl = parsedUrl.searchParams.get('url') || ''

  // 1. Cek disk cache terlebih dahulu (~/.hermes-avatar/cache/audio/)
  const effectiveVid = videoId || (streamId.startsWith('yt-') ? streamId.slice(3) : '')
  if (effectiveVid) {
    const cachedFile = findCachedAudioFile(effectiveVid)
    if (cachedFile) {
      const totalSize = cachedFile.size
      const rawReqRange = request.headers?.get?.('range') || ''
      const reqRangeMatch = rawReqRange.match(/bytes=(\d+)-(\d*)/i)
      const reqStart = reqRangeMatch ? Math.max(0, Number(reqRangeMatch[1])) : 0
      const reqEnd = (reqRangeMatch && reqRangeMatch[2]) ? Math.min(totalSize - 1, Number(reqRangeMatch[2])) : (totalSize - 1)
      const contentLength = Math.max(0, reqEnd - reqStart + 1)

      if (request.method === 'HEAD') {
        return new Response(null, {
          status: reqRangeMatch ? 206 : 200,
          headers: {
            'Content-Type': cachedFile.mimeType || 'audio/mp4',
            'Accept-Ranges': 'bytes',
            'Content-Length': String(contentLength),
            ...(reqRangeMatch ? { 'Content-Range': `bytes ${reqStart}-${reqEnd}/${totalSize}` } : {}),
            ...corsHeaders
          }
        })
      }

      const nodeStream = createReadStream(cachedFile.path, { start: reqStart, end: reqEnd })
      const webStream = Readable.toWeb(nodeStream)
      return new Response(webStream, {
        status: reqRangeMatch ? 206 : 200,
        headers: {
          'Content-Type': cachedFile.mimeType || 'audio/mp4',
          'Accept-Ranges': 'bytes',
          'Content-Length': String(contentLength),
          ...(reqRangeMatch ? { 'Content-Range': `bytes ${reqStart}-${reqEnd}/${totalSize}` } : {}),
          ...corsHeaders
        }
      })
    }
  }

  let entry = getValidCachedStream(streamId)
  if (!entry) {
    const res = await resolveMusicStream({
      url: directUrl,
      videoId,
      fetchImpl,
      resolvePythonCmd: deps.resolvePythonCmd,
      execFileImpl: deps.execFileImpl
    })
    if (!res?.ok) {
      return new Response(res?.error || 'Stream unavailable', { status: 502, headers: corsHeaders })
    }
    entry = getValidCachedStream(res.streamId)
  }

  if (!entry || !parseHttpUrl(entry.streamUrl)) {
    return new Response('Stream not found', { status: 404, headers: corsHeaders })
  }

  const fetchUpstreamChunk = async (targetEntry, overrideRange = null) => {
    const reqHeaders = { ...(targetEntry.httpHeaders || {}) }
    const rangeHeader = overrideRange !== null ? overrideRange : request.headers?.get?.('range')
    const isYtStream = Boolean(
      targetEntry.isYouTube ||
      videoId ||
      String(targetEntry.streamUrl || '').includes('googlevideo.com')
    )
    if (isYtStream) {
      reqHeaders.Range = buildBoundedRangeHeader(rangeHeader, targetEntry.totalSize || 0)
    } else if (rangeHeader) {
      reqHeaders.Range = rangeHeader
    }
    return {
      isYtStream,
      resp: await fetchImpl(targetEntry.streamUrl, {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: reqHeaders,
        redirect: 'follow'
      })
    }
  }

  try {
    let { isYtStream, resp: upstream } = await fetchUpstreamChunk(entry)
    if ((upstream.status === 403 || upstream.status === 410) && videoId) {
      streamCache.delete(streamId)
      const refreshed = await resolveMusicStream({
        videoId,
        fetchImpl,
        resolvePythonCmd: deps.resolvePythonCmd,
        execFileImpl: deps.execFileImpl,
        forceRefresh: true
      })
      if (refreshed?.ok) {
        const updatedEntry = getValidCachedStream(refreshed.streamId)
        if (updatedEntry && parseHttpUrl(updatedEntry.streamUrl)) {
          entry = updatedEntry
          ;({ isYtStream, resp: upstream } = await fetchUpstreamChunk(updatedEntry))
        }
      }
    }

    const rawReqRange = request.headers?.get?.('range') || ''
    const reqRangeMatch = rawReqRange.match(/bytes=(\d+)-(\d*)/i)
    const reqStart = reqRangeMatch ? Math.max(0, Number(reqRangeMatch[1])) : 0
    const reqEnd = (reqRangeMatch && reqRangeMatch[2]) ? Number(reqRangeMatch[2]) : null

    const contentType = upstream.headers.get('content-type') || entry.mimeType || 'audio/mp4'
    const acceptRanges = upstream.headers.get('accept-ranges') || 'bytes'
    const firstContentRange = upstream.headers.get('content-range') || ''
    const crMatch = firstContentRange.match(/bytes\s+(\d+)-(\d+)\/(\d+)/i)

    if (crMatch) {
      const totalSize = Number(crMatch[3])
      if (entry) entry.totalSize = totalSize
      const firstActualEnd = Number(crMatch[2])
      const finalEnd = reqEnd !== null ? Math.min(reqEnd, totalSize - 1) : (totalSize - 1)

      if (request.method !== 'HEAD' && isYtStream && upstream.status === 206 && upstream.body && firstActualEnd < finalEnd) {
        let cursor = firstActualEnd + 1
        let currentReader = upstream.body.getReader()
        let cancelled = false
        let activeEntry = entry

        const stitchedStream = new ReadableStream({
          async pull(controller) {
            while (!cancelled) {
              if (currentReader) {
                const { done, value } = await currentReader.read()
                if (!done) {
                  controller.enqueue(value)
                  return
                }
                currentReader = null
              }
              if (cursor > finalEnd) {
                controller.close()
                return
              }

              const nextEnd = Math.min(finalEnd, cursor + YOUTUBE_CHUNK_BYTES - 1)
              const nextRange = `bytes=${cursor}-${nextEnd}`
              let { resp: nextResp } = await fetchUpstreamChunk(activeEntry, nextRange).catch(() => ({ resp: { status: 502 } }))

              if ((nextResp.status === 403 || nextResp.status === 410) && videoId) {
                streamCache.delete(streamId)
                const refreshed = await resolveMusicStream({
                  videoId,
                  fetchImpl,
                  resolvePythonCmd: deps.resolvePythonCmd,
                  execFileImpl: deps.execFileImpl,
                  forceRefresh: true
                }).catch(() => null)
                if (refreshed?.ok) {
                  const updatedEntry = getValidCachedStream(refreshed.streamId)
                  if (updatedEntry && parseHttpUrl(updatedEntry.streamUrl)) {
                    activeEntry = updatedEntry
                    ;({ resp: nextResp } = await fetchUpstreamChunk(updatedEntry, nextRange).catch(() => ({ resp: { status: 502 } })))
                  }
                }
              }

              if ((nextResp.status !== 206 && nextResp.status !== 200) || !nextResp.body) {
                console.warn(`[MusicStream] Chunk range ${nextRange} selesai atau tidak tersedia (HTTP ${nextResp?.status}). Menutup stream secara halus.`)
                controller.close()
                return
              }
              const nextCr = nextResp.headers?.get?.('content-range') || ''
              const nextM = nextCr.match(/bytes\s+(\d+)-(\d+)\/(\d+)/i)
              cursor = nextM ? (Number(nextM[2]) + 1) : (nextEnd + 1)
              currentReader = nextResp.body.getReader()
            }
          },
          async cancel() {
            cancelled = true
            try {
              await currentReader?.cancel()
            } catch {
              // Abaikan error saat pembatalan reader
            }
            currentReader = null
          }
        })

        return new Response(stitchedStream, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Accept-Ranges': acceptRanges,
            'Content-Range': `bytes ${reqStart}-${finalEnd}/${totalSize}`,
            'Content-Length': String(finalEnd - reqStart + 1),
            ...corsHeaders
          }
        })
      }
    }

    const outHeaders = {
      'Content-Type': contentType,
      'Accept-Ranges': acceptRanges,
      ...corsHeaders
    }
    const contentLength = upstream.headers.get('content-length')
    if (contentLength) outHeaders['Content-Length'] = contentLength
    if (firstContentRange && upstream.status === 206) {
      outHeaders['Content-Range'] = firstContentRange
    }

    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      headers: outHeaders
    })
  } catch (err) {
    return new Response(err?.message || 'Upstream stream error', { status: 502, headers: corsHeaders })
  }
}

let bgMusicWindow = null
let bgMusicVideoId = ''

export function isBackgroundMusicWebContents(wcId) {
  return Boolean(bgMusicWindow && !bgMusicWindow.isDestroyed() && bgMusicWindow.webContents.id === wcId)
}

export function stopBackgroundMusicPlayer() {
  bgMusicVideoId = ''
  if (bgMusicWindow && !bgMusicWindow.isDestroyed()) {
    try {
      bgMusicWindow.destroy()
    } catch {
      // Abaikan
    }
  }
  bgMusicWindow = null
}

export async function controlBackgroundMusicPlayer(action, payload = {}, { BrowserWindow } = {}) {
  const act = String(action || '').trim().toLowerCase()
  if (act === 'stop') {
    stopBackgroundMusicPlayer()
    return { ok: true }
  }

  if (act === 'load') {
    if (typeof BrowserWindow !== 'function') {
      return { ok: false, error: 'BrowserWindow tidak tersedia.' }
    }
    const rawId = String(payload?.videoId || '').trim()
    const vid = /^[a-zA-Z0-9_-]{11}$/.test(rawId) ? rawId : extractYouTubeVideoId(payload?.url || rawId)
    if (!vid) {
      return { ok: false, error: 'Video ID YouTube tidak valid.' }
    }

    if (!bgMusicWindow || bgMusicWindow.isDestroyed()) {
      bgMusicWindow = new BrowserWindow({
        show: false,
        width: 420,
        height: 280,
        webPreferences: {
          contextIsolation: true,
          sandbox: true,
          autoplayPolicy: 'no-user-gesture-required'
        }
      })
      bgMusicWindow.on('closed', () => {
        bgMusicWindow = null
        bgMusicVideoId = ''
      })
    }

    const vol = Math.max(0, Math.min(1, Number(payload?.volume ?? 0.7)))
    bgMusicWindow.webContents.setAudioMuted(vol === 0)
    bgMusicVideoId = vid

    try {
      await bgMusicWindow.loadURL(`https://www.youtube.com/watch?v=${encodeURIComponent(vid)}`, {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
      })
    } catch (err) {
      const offline = isNetworkDisconnectError(err)
      return { ok: false, offline, error: err?.message || 'Gagal memuat halaman YouTube.' }
    }

    if (!bgMusicWindow || bgMusicWindow.isDestroyed()) {
      return { ok: false, error: 'Pemutar latar belakang ditutup.' }
    }

    const state = await bgMusicWindow.webContents.executeJavaScript(`(async () => {
      for (let i = 0; i < 20; i++) {
        const v = document.querySelector('video');
        if (v) {
          v.volume = ${JSON.stringify(vol)};
          v.muted = ${JSON.stringify(vol === 0)};
          try { await v.play(); } catch {}
          if (v.readyState >= 2 || v.duration > 0) {
            return {
              ok: true,
              duration: isFinite(v.duration) ? Math.round(v.duration) : 0,
              currentTime: Number(v.currentTime || 0),
              paused: Boolean(v.paused),
              title: document.title.replace(/\\s*-\\s*YouTube$/i, '').trim()
            };
          }
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      const v = document.querySelector('video');
      return {
        ok: Boolean(v),
        duration: (v && isFinite(v.duration)) ? Math.round(v.duration) : 0,
        currentTime: v ? Number(v.currentTime || 0) : 0,
        paused: v ? Boolean(v.paused) : true,
        title: document.title.replace(/\\s*-\\s*YouTube$/i, '').trim()
      };
    })()`).catch((err) => ({ ok: false, error: err?.message || String(err) }))

    return { ...state, mode: 'electron-bg', videoId: vid }
  }

  if (!bgMusicWindow || bgMusicWindow.isDestroyed()) {
    return { ok: false, inactive: true }
  }

  try {
    if (act === 'play') {
      const res = await bgMusicWindow.webContents.executeJavaScript(
        `(async () => { const v = document.querySelector('video'); if (!v) return { ok: false }; v.muted = false; try { await v.play(); } catch {} return { ok: true, paused: v.paused }; })()`
      )
      return res
    }
    if (act === 'pause') {
      await bgMusicWindow.webContents.executeJavaScript(
        `(() => { const v = document.querySelector('video'); if (v) v.pause(); return true; })()`
      )
      return { ok: true }
    }
    if (act === 'volume') {
      const vol = Math.max(0, Math.min(1, Number(payload?.volume ?? 0.7)))
      bgMusicWindow.webContents.setAudioMuted(vol === 0)
      await bgMusicWindow.webContents.executeJavaScript(
        `(() => { const v = document.querySelector('video'); if (v) { v.volume = ${JSON.stringify(vol)}; v.muted = ${JSON.stringify(vol === 0)}; } return true; })()`
      )
      return { ok: true, volume: vol }
    }
    if (act === 'seek') {
      const sec = Math.max(0, Number(payload?.seconds || 0))
      await bgMusicWindow.webContents.executeJavaScript(
        `(() => { const v = document.querySelector('video'); if (v && isFinite(v.duration)) v.currentTime = Math.min(v.duration, ${JSON.stringify(sec)}); return true; })()`
      )
      return { ok: true }
    }
    if (act === 'status') {
      const st = await bgMusicWindow.webContents.executeJavaScript(
        `(() => { const v = document.querySelector('video'); if (!v) return { ok: false }; return { ok: true, currentTime: Number(v.currentTime || 0), duration: (v.duration && isFinite(v.duration)) ? Number(v.duration) : 0, paused: Boolean(v.paused), ended: Boolean(v.ended) }; })()`
      )
      return { ...st, videoId: bgMusicVideoId }
    }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }

  return { ok: false, error: 'Aksi kontrol musik tidak dikenal.' }
}

export function clearMusicStreamCacheForTest() {
  streamCache.clear()
  activeCacheDownloads.clear()
  testCacheDir = null
  cachedYtDlp = null
  cachedNodeBin = undefined
  stopBackgroundMusicPlayer()
}
