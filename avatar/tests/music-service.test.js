import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  extractYouTubeVideoId,
  buildMusicSearchQuery,
  searchOnlineMusic,
  resolveMusicStream,
  handleMusicStreamProtocolRequest,
  clearMusicStreamCacheForTest,
  setAudioCacheDirForTest,
  findCachedAudioFile,
  downloadAudioToCache
} from '../src/main/music-service.js'

let suiteTestCacheDir = null

beforeEach(() => {
  suiteTestCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-music-test-cache-'))
  setAudioCacheDirForTest(suiteTestCacheDir)
})

afterEach(() => {
  clearMusicStreamCacheForTest()
  if (suiteTestCacheDir) {
    try {
      fs.rmSync(suiteTestCacheDir, { recursive: true, force: true })
    } catch {}
    suiteTestCacheDir = null
  }
})

describe('music-service: pencarian musik online, ekstraksi YouTube & proxy HTTP Range', () => {
  it('extractYouTubeVideoId mendukung watch, youtu.be, shorts, live, dan music.youtube.com', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=SfPkl7lol7g')).toBe('SfPkl7lol7g')
    expect(extractYouTubeVideoId('https://youtu.be/goU1Ei8I8uk?si=sVgmRoclHwN3gKRz')).toBe('goU1Ei8I8uk')
    expect(extractYouTubeVideoId('https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=share')).toBe('dQw4w9WgXcQ')
    expect(extractYouTubeVideoId('https://www.youtube.com/shorts/abcdefghijk')).toBe('abcdefghijk')
    expect(extractYouTubeVideoId('https://www.youtube.com/live/1234567890a?feature=shared')).toBe('1234567890a')
    expect(extractYouTubeVideoId('https://radio.plaza.one/mp3')).toBeNull()
  })

  it('buildMusicSearchQuery menggabungkan artis dan judul lagu secara presisi tanpa duplikasi', () => {
    expect(buildMusicSearchQuery({ title: 'Hana', artist: 'Fujii Kaze' })).toBe('Fujii Kaze - Hana')
    expect(buildMusicSearchQuery({ title: 'Fujii Kaze - Hana', artist: 'Fujii Kaze' })).toBe('Fujii Kaze - Hana')
    expect(buildMusicSearchQuery({ query: 'lofi hip hop' })).toBe('lofi hip hop')
    expect(buildMusicSearchQuery({})).toBe('')
  })

  it('searchOnlineMusic menggabungkan judul/artis, mengurutkan kecocokan terbaik di posisi #1, dan mendukung fallback', async () => {
    let sentBody = null
    const innerTubeFetch = async (url, opts) => {
      if (String(url).includes('/youtubei/v1/search')) {
        sentBody = JSON.parse(opts.body)
        return {
          ok: true,
          json: async () => ({
            contents: {
              twoColumnSearchResultsRenderer: {
                primaryContents: {
                  sectionListRenderer: {
                    contents: [{
                      itemSectionRenderer: {
                        contents: [
                          {
                            videoRenderer: {
                              videoId: 'karaoke0001',
                              title: { runs: [{ text: 'Hana Karaoke Version' }] },
                              ownerText: { runs: [{ text: 'Karaoke Channel' }] },
                              lengthText: { simpleText: '4:15' }
                            }
                          },
                          {
                            videoRenderer: {
                              videoId: 'SfPkl7lol7g',
                              title: { runs: [{ text: 'Fujii Kaze - Hana (Official Video)' }] },
                              ownerText: { runs: [{ text: 'Fujii Kaze' }] },
                              lengthText: { simpleText: '4:22' }
                            }
                          }
                        ]
                      }
                    }]
                  }
                }
              }
            }
          })
        }
      }
      return { ok: false, status: 404 }
    }

    const res = await searchOnlineMusic({
      title: 'Hana',
      artist: 'Fujii Kaze',
      fetchImpl: innerTubeFetch
    })

    expect(res.ok).toBe(true)
    expect(sentBody?.query).toBe('Fujii Kaze - Hana')
    expect(res.results).toHaveLength(2)
    expect(res.results[0]).toMatchObject({
      videoId: 'SfPkl7lol7g',
      title: 'Fujii Kaze - Hana (Official Video)',
      artist: 'Fujii Kaze',
      duration: 262,
      type: 'youtube'
    })

    // Fallback ke iTunes saat YouTube tidak tersedia
    const itunesFallbackFetch = async (url) => {
      if (String(url).includes('itunes.apple.com/search')) {
        return {
          ok: true,
          json: async () => ({
            results: [{
              trackName: 'Hana',
              artistName: 'Fujii Kaze',
              previewUrl: 'https://audio-ssl.itunes.apple.com/preview/hana.m4a',
              artworkUrl100: 'https://is1-ssl.mzstatic.com/art.jpg'
            }]
          })
        }
      }
      return { ok: false, status: 503 }
    }

    const fbRes = await searchOnlineMusic({
      title: 'Hana',
      artist: 'Fujii Kaze',
      fetchImpl: itunesFallbackFetch,
      execFileImpl: async () => { throw new Error('yt-dlp unavailable') }
    })
    expect(fbRes.ok).toBe(true)
    expect(fbRes.results[0]).toMatchObject({
      title: 'Hana',
      artist: 'Fujii Kaze',
      type: 'stream',
      source: 'itunes'
    })
  })

  it('resolveMusicStream & handleMusicStreamProtocolRequest menyalurkan byte audio nyata dan membatasi Range open-ended (403 -> 206)', async () => {
    const fakeAudioBytes = Buffer.from('FAKE_MP4_AUDIO_STREAM_DATA_0123456789_ABCDEF', 'utf8')
    const seenRanges = []
    const srv = http.createServer((req, res) => {
      const range = req.headers.range
      seenRanges.push(range || '')
      if (range) {
        const m = String(range).match(/bytes=(\d+)-(\d*)/)
        // Simulasikan googlevideo.com menolak Range open-ended ("bytes=0-") dengan 403
        if (m && !m[2]) {
          res.writeHead(403)
          res.end('Forbidden open-ended range')
          return
        }
        const start = m ? Number(m[1]) : 0
        const end = (m && m[2]) ? Math.min(fakeAudioBytes.length - 1, Number(m[2])) : fakeAudioBytes.length - 1
        const slice = fakeAudioBytes.subarray(start, end + 1)
        res.writeHead(206, {
          'Content-Type': 'audio/mp4',
          'Content-Length': String(slice.length),
          'Content-Range': `bytes ${start}-${end}/${fakeAudioBytes.length}`,
          'Accept-Ranges': 'bytes'
        })
        res.end(slice)
        return
      }
      res.writeHead(200, {
        'Content-Type': 'audio/mp4',
        'Content-Length': String(fakeAudioBytes.length),
        'Accept-Ranges': 'bytes'
      })
      res.end(fakeAudioBytes)
    })
    await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve))
    const port = srv.address().port

    try {
      const mockExec = vi.fn(async (_cmd, args) => {
        if (args.includes('--version')) return { stdout: '2026.03.17' }
        return {
          stdout: JSON.stringify({
            id: 'SfPkl7lol7g',
            title: 'Fujii Kaze - Hana (Official Video)',
            uploader: 'Fujii Kaze',
            duration: 262,
            ext: 'm4a',
            url: `http://127.0.0.1:${port}/stream.m4a`,
            thumbnail: 'https://i.ytimg.com/vi/SfPkl7lol7g/hqdefault.jpg'
          })
        }
      })

      const resolved = await resolveMusicStream({
        url: 'https://youtu.be/SfPkl7lol7g',
        resolvePythonCmd: async () => ({ ok: true, cmd: 'python' }),
        execFileImpl: mockExec
      })

      expect(resolved.ok).toBe(true)
      expect(resolved.videoId).toBe('SfPkl7lol7g')
      expect(resolved.proxyUrl).toBe('model://music-stream/yt-SfPkl7lol7g?videoId=SfPkl7lol7g')
      expect(resolved.title).toBe('Fujii Kaze - Hana (Official Video)')
      expect(resolved.duration).toBe(262)

      // 1. Uji permintaan open-ended dari Chromium <audio> ("Range: bytes=0-") -> wajib dibatasi ke 512 KB chunk -> HTTP 206
      const openEndedReq = new Request(resolved.proxyUrl, {
        method: 'GET',
        headers: { Range: 'bytes=0-' }
      })
      const openEndedRes = await handleMusicStreamProtocolRequest(openEndedReq, { 'Access-Control-Allow-Origin': '*' })
      expect(openEndedRes.status).toBe(206)
      expect(seenRanges[0]).toBe('bytes=0-524287')
      await openEndedRes.arrayBuffer()

      // 2. Uji permintaan Range eksplisit -> tetap presisi bytes 5-18
      const fakeReq = new Request(resolved.proxyUrl, {
        method: 'GET',
        headers: { Range: 'bytes=5-18' }
      })
      const protoRes = await handleMusicStreamProtocolRequest(fakeReq, { 'Access-Control-Allow-Origin': '*' })
      expect(protoRes.status).toBe(206)
      expect(protoRes.headers.get('content-type')).toBe('audio/mp4')
      expect(protoRes.headers.get('content-range')).toBe(`bytes 5-18/${fakeAudioBytes.length}`)
      const bodyText = Buffer.from(await protoRes.arrayBuffer()).toString('utf8')
      expect(bodyText).toBe(fakeAudioBytes.subarray(5, 19).toString('utf8'))
    } finally {
      await new Promise((resolve) => srv.close(resolve))
    }
  })

  it('deteksi offline (offline: true) saat internet putus dan fallback electron-bg saat yt-dlp tidak ada namun online', async () => {
    const offlineFetch = async () => {
      const err = new TypeError('fetch failed')
      err.cause = { code: 'ENOTFOUND' }
      throw err
    }

    const sOffline = await searchOnlineMusic({
      title: 'Hana',
      artist: 'Fujii Kaze',
      fetchImpl: offlineFetch,
      execFileImpl: async () => { throw new Error('no yt-dlp') }
    })
    expect(sOffline.ok).toBe(false)
    expect(sOffline.offline).toBe(true)

    const rOffline = await resolveMusicStream({
      url: 'https://youtu.be/oLG6ZiF_3DA',
      fetchImpl: offlineFetch,
      execFileImpl: async () => { throw new Error('no yt-dlp') }
    })
    expect(rOffline.ok).toBe(false)
    expect(rOffline.offline).toBe(true)
    expect(rOffline.videoId).toBe('oLG6ZiF_3DA')

    // Saat yt-dlp tidak ada tetapi koneksi internet aktif (oEmbed berhasil) -> fallback electron-bg tanpa download paket
    const onlineNoYtDlpFetch = async (url) => {
      if (String(url).includes('/oembed')) {
        return {
          ok: true,
          json: async () => ({
            title: 'For Revenge - Bandung Hari Ini Lirik',
            author_name: 'Ghost Beat Lyrics',
            thumbnail_url: 'https://i.ytimg.com/vi/oLG6ZiF_3DA/hqdefault.jpg'
          })
        }
      }
      return { ok: false, status: 404 }
    }

    const rBg = await resolveMusicStream({
      url: 'https://youtu.be/oLG6ZiF_3DA',
      fetchImpl: onlineNoYtDlpFetch,
      execFileImpl: async () => { throw new Error('ENOENT') }
    })
    expect(rBg.ok).toBe(true)
    expect(rBg.mode).toBe('electron-bg')
    expect(rBg.videoId).toBe('oLG6ZiF_3DA')
    expect(rBg.title).toBe('For Revenge - Bandung Hari Ini Lirik')
  })

  it('multi-chunk stitching menyambungkan stream > 1 MB (3 chunk 512 KB) utuh tanpa putus di batas chunk pertama', async () => {
    const largeAudio = Buffer.alloc(1250000)
    for (let i = 0; i < largeAudio.length; i++) {
      largeAudio[i] = i % 251
    }

    const seenRanges = []
    const srv = http.createServer((req, res) => {
      const range = req.headers.range || ''
      seenRanges.push(range)
      const m = range.match(/bytes=(\d+)-(\d*)/)
      if (m && !m[2]) {
        res.writeHead(403)
        res.end('Forbidden open-ended')
        return
      }
      const start = m ? Number(m[1]) : 0
      const end = (m && m[2]) ? Math.min(largeAudio.length - 1, Number(m[2])) : largeAudio.length - 1
      const slice = largeAudio.subarray(start, end + 1)
      res.writeHead(206, {
        'Content-Type': 'audio/mp4',
        'Content-Length': String(slice.length),
        'Content-Range': `bytes ${start}-${end}/${largeAudio.length}`,
        'Accept-Ranges': 'bytes'
      })
      res.end(slice)
    })
    await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve))
    const port = srv.address().port

    try {
      const mockExec = vi.fn(async (_cmd, args) => {
        if (args.includes('--version')) return { stdout: '2026.03.17' }
        return {
          stdout: JSON.stringify({
            id: 'LargeTrack11',
            title: 'Full Song Test',
            uploader: 'Artist',
            duration: 230,
            ext: 'm4a',
            url: `http://127.0.0.1:${port}/full.m4a`
          })
        }
      })

      const resolved = await resolveMusicStream({
        videoId: 'LargeTrack11',
        resolvePythonCmd: async () => ({ ok: true, cmd: 'python' }),
        execFileImpl: mockExec
      })
      expect(resolved.ok).toBe(true)

      const fullReq = new Request(resolved.proxyUrl, {
        method: 'GET',
        headers: { Range: 'bytes=0-' }
      })
      const protoRes = await handleMusicStreamProtocolRequest(fullReq, { 'Access-Control-Allow-Origin': '*' })
      expect(protoRes.status).toBe(206)
      expect(protoRes.headers.get('content-range')).toBe('bytes 0-1249999/1250000')
      expect(protoRes.headers.get('content-length')).toBe('1250000')

      const stitchedBuf = Buffer.from(await protoRes.arrayBuffer())
      expect(stitchedBuf.length).toBe(1250000)
      expect(Buffer.compare(stitchedBuf, largeAudio)).toBe(0)
      expect(seenRanges).toEqual([
        'bytes=0-524287',
        'bytes=524288-1048575',
        'bytes=1048576-1249999'
      ])
    } finally {
      await new Promise((resolve) => srv.close(resolve))
    }
  })

  it('caching audio disk: downloadAudioToCache, findCachedAudioFile, dan handleMusicStreamProtocolRequest menyajikan byte audio langsung dari disk', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-music-cache-test-'))
    setAudioCacheDirForTest(tmpDir)

    try {
      const mockAudioContent = Buffer.alloc(128 * 1024, 0x7a) // 128 KB
      const mockExec = vi.fn(async (_cmd, args) => {
        if (args.includes('--version')) return { stdout: '2026.03.17' }
        const outIdx = args.indexOf('-o')
        if (outIdx !== -1 && args[outIdx + 1]) {
          fs.writeFileSync(args[outIdx + 1], mockAudioContent)
        }
        return { stdout: '' }
      })

      const cachedResult = await downloadAudioToCache('CacheSong123', 'https://www.youtube.com/watch?v=CacheSong123', {
        resolvePythonCmd: async () => ({ ok: true, cmd: 'python' }),
        execFileImpl: mockExec
      })

      expect(cachedResult).toBeTruthy()
      expect(cachedResult.path).toContain('CacheSong123.m4a')

      const found = findCachedAudioFile('CacheSong123')
      expect(found).toBeTruthy()
      expect(found.size).toBe(128 * 1024)
      expect(found.mimeType).toBe('audio/mp4')

      const resolved = await resolveMusicStream({ videoId: 'CacheSong123' })
      expect(resolved.ok).toBe(true)
      expect(resolved.cached).toBe(true)
      expect(resolved.offlineCapable).toBe(true)

      // Permintaan HTTP Range ke file cache di disk
      const req = new Request(resolved.proxyUrl, {
        method: 'GET',
        headers: { Range: 'bytes=100-199' }
      })
      const resp = await handleMusicStreamProtocolRequest(req, { 'Access-Control-Allow-Origin': '*' })
      expect(resp.status).toBe(206)
      expect(resp.headers.get('content-range')).toBe(`bytes 100-199/${mockAudioContent.length}`)
      expect(resp.headers.get('content-length')).toBe('100')
      expect(resp.headers.get('content-type')).toBe('audio/mp4')

      const readBuf = Buffer.from(await resp.arrayBuffer())
      expect(readBuf.length).toBe(100)
      expect(Buffer.compare(readBuf, mockAudioContent.subarray(100, 200))).toBe(0)
    } finally {
      setAudioCacheDirForTest(null)
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      } catch {}
    }
  })
})
