/**
 * settings-music.js — Panel konfigurasi pustaka musik dan stream audio
 */

import { showToast } from './toast.js'

export async function updateMusicLibraryStats(musicStatsDesc) {
  if (!musicStatsDesc) return
  try {
    const [libRes, infoRes] = await Promise.all([
      window.hermesAvatar?.loadMusicLibrary ? window.hermesAvatar.loadMusicLibrary() : null,
      window.hermesAvatar?.getMusicLibraryInfo ? window.hermesAvatar.getMusicLibraryInfo() : null
    ])

    const data = libRes?.ok && libRes.data ? libRes.data : null
    const onlineCount = data?.onlineTracks?.length || 0
    const localCount = data?.localTracks?.length || 0
    const favCount = data?.favorites?.length || 0
    const fileSizeKb = infoRes?.size ? (infoRes.size / 1024).toFixed(1) : '0'

    musicStatsDesc.innerHTML = `
      <strong style="color:#38bdf8;">${onlineCount}</strong> Lagu Stream Web · 
      <strong style="color:#a855f7;">${localCount}</strong> File Lokal · 
      <strong style="color:#f43f5e;">${favCount}</strong> Favorit ❤️ · 
      Ukuran Berkas: <code>${fileSizeKb} KB</code>
    `
  } catch (err) {
    musicStatsDesc.textContent = 'Gagal memuat statistik pustaka musik.'
  }
}

export function initMusicPanel({
  btnOpenMusicFolder,
  btnRefreshMusicStats,
  musicStatsDesc,
  settingsMusicUrl,
  btnSettingsAddStream,
  settingsMusicFeedback
}) {
  btnOpenMusicFolder?.addEventListener('click', () => {
    window.hermesAvatar?.openMusicFolder?.()
  })

  btnRefreshMusicStats?.addEventListener('click', () => {
    updateMusicLibraryStats(musicStatsDesc)
    showToast('Pustaka Disegarkan 🔄', 'Status penyimpanan musik berhasil diperbarui', 'success', '🔄', 2500)
  })

  btnSettingsAddStream?.addEventListener('click', async () => {
    const url = (settingsMusicUrl?.value || '').trim()
    if (!url) {
      showToast('URL Kosong', 'Silakan masukkan tautan YouTube atau link stream audio.', 'warning', '⚠️')
      return
    }

    try {
      let lib = { onlineTracks: [], localTracks: [], favorites: [], volume: 0.7 }
      if (window.hermesAvatar?.loadMusicLibrary) {
        const res = await window.hermesAvatar.loadMusicLibrary()
        if (res?.ok && res.data) {
          lib = res.data
        }
      }

      const isYt = /(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/)|youtu\.be\/|music\.youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/i.test(url)
      const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/)|youtu\.be\/|music\.youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/i)
      const videoId = ytMatch ? ytMatch[1] : null

      const newTrack = {
        id: `online-${Date.now()}`,
        title: isYt ? 'YouTube Audio' : 'Web Stream Radio',
        artist: isYt ? 'YouTube Creator' : 'Online Stream',
        category: 'online',
        badge: isYt ? 'YouTube ▶' : 'Live 🌐',
        duration: 0,
        type: isYt ? 'youtube' : 'stream',
        videoId,
        url
      }

      if (!Array.isArray(lib.onlineTracks)) lib.onlineTracks = []
      lib.onlineTracks.push(newTrack)

      if (window.hermesAvatar?.saveMusicLibrary) {
        await window.hermesAvatar.saveMusicLibrary(lib)
      }

      window.dispatchEvent(new CustomEvent('hermes:music-library-updated'))

      if (settingsMusicUrl) settingsMusicUrl.value = ''
      if (settingsMusicFeedback) {
        settingsMusicFeedback.style.display = 'block'
        settingsMusicFeedback.textContent = `✓ Berhasil disimpan: "${newTrack.title}" (${newTrack.badge})`
        setTimeout(() => { settingsMusicFeedback.style.display = 'none' }, 4000)
      }

      updateMusicLibraryStats(musicStatsDesc)
      showToast('Tersimpan Permanen 💾', `Lagu ditambahkan ke ruang penyimpanan lokal: ${url}`, 'success', '🎵', 3500)
    } catch (err) {
      showToast('Gagal Menyimpan', err?.message || String(err), 'error', '❌')
    }
  })

  updateMusicLibraryStats(musicStatsDesc)
}
