/**
 * app-launcher.js — Fast-path & Self-learning App Launcher
 */

export async function initFastAppLauncher() {
  try {
    const res = await window.hermesAvatar?.getInstalledApps?.()
    if (res?.ok && Array.isArray(res.apps)) {
      return res.apps
    }
  } catch (err) {
    console.warn('[FastApp] Inisialisasi daftar aplikasi gagal:', err)
  }
  return []
}

export const KNOWN_APP_ALIASES = {
  vscode: ['visual studio code', 'code'],
  'vs code': ['visual studio code', 'code'],
  vsc: ['visual studio code'],
  code: ['visual studio code'],
  word: ['word', 'microsoft word'],
  excel: ['excel', 'microsoft excel'],
  powerpoint: ['powerpoint', 'ppt', 'microsoft powerpoint'],
  ppt: ['powerpoint', 'microsoft powerpoint'],
  taskmgr: ['task manager'],
  'task manager': ['task manager'],
  taskman: ['task manager'],
  'pengelola tugas': ['task manager'],
  chrome: ['google chrome'],
  edge: ['microsoft edge'],
  calc: ['kalkulator', 'calculator'],
  kalkulator: ['kalkulator', 'calculator', 'calc'],
  calculator: ['kalkulator', 'calculator', 'calc'],
  explorer: ['file explorer'],
  cmd: ['command prompt'],
  terminal: ['windows terminal', 'terminal'],
  paint: ['paint', 'mspaint']
}

export const BUILTIN_DIRECT_APPS = [
  { name: 'Task Manager', command: 'taskmgr.exe', keys: ['task manager', 'taskmgr', 'taskman', 'pengelola tugas'] },
  { name: 'Visual Studio Code', command: 'code', keys: ['vscode', 'vs code', 'code', 'vsc', 'visual studio code'] },
  { name: 'Microsoft Word', command: 'winword.exe', keys: ['word', 'ms word', 'microsoft word', 'winword'] },
  { name: 'Microsoft Excel', command: 'excel.exe', keys: ['excel', 'ms excel', 'microsoft excel'] },
  { name: 'Microsoft PowerPoint', command: 'powerpnt.exe', keys: ['powerpoint', 'ppt', 'ms powerpoint', 'powerpnt'] },
  { name: 'Google Chrome', command: 'chrome.exe', keys: ['chrome', 'google chrome'] },
  { name: 'Microsoft Edge', command: 'msedge.exe', keys: ['edge', 'msedge', 'microsoft edge'] },
  { name: 'Notepad', command: 'notepad.exe', keys: ['notepad', 'catatan'] },
  { name: 'Kalkulator', command: 'calc.exe', keys: ['calc', 'kalkulator', 'calculator'] },
  { name: 'File Explorer', command: 'explorer.exe', keys: ['explorer', 'file explorer'] },
  { name: 'Command Prompt', command: 'cmd.exe', keys: ['cmd', 'command prompt'] },
  { name: 'PowerShell', command: 'powershell.exe', keys: ['powershell', 'pwsh'] },
  { name: 'Terminal', command: 'wt.exe', keys: ['terminal', 'windows terminal', 'wt'] },
  { name: 'Paint', command: 'mspaint.exe', keys: ['paint', 'mspaint', 'gambar'] }
]

export function extractAppQueries(text) {
  if (!text) return []
  const cleaned = text.trim()
  const match = cleaned.match(
    /^(?:tolong\s+)?(?:buka|bukakan|jalankan|putar|open|launch|start|run)\s+(?:aplikasi\s+|app\s+)?(.+?)(?:\s+(?:dong|ya|sekarang|cepet|please))?[.!?]*$/i
  )
  if (!match || !match[1]) return []

  const raw = match[1].trim()
  const parts = raw.split(/[,;&]|\s+(?:dan|and|serta|lalu|kemudian|plus)\s+/i)

  const queries = []
  for (const part of parts) {
    const cleanedPart = part
      .replace(/^(?:aplikasi\s+|app\s+|buka\s+|bukakan\s+|jalankan\s+|open\s+|launch\s+|start\s+|run\s+)/i, '')
      .trim()
    if (cleanedPart) {
      queries.push(cleanedPart)
    }
  }

  return queries
}

export function findMatchingApp(query, cachedInstalledApps = []) {
  if (!query) return null
  const q = query.toLowerCase().replace(/^(aplikasi|app)\s+/, '').trim()
  if (!q) return null
  const qCompact = q.replace(/[\s\-_]+/g, '')

  // 1. Cek aplikasi bawaan langsung
  for (const b of BUILTIN_DIRECT_APPS) {
    if (b.keys.includes(q) || b.keys.some((k) => k.replace(/[\s\-_]+/g, '') === qCompact)) {
      return b
    }
  }

  // 2. Cek di pengaturan pengguna (localStorage hermes-avatar-settings)
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('hermes-avatar-settings') : null
    if (raw) {
      const s = JSON.parse(raw)
      const actionApps = s.actionApps || []
      const found = actionApps.find((a) => {
        if (!a.name) return false
        const n = a.name.toLowerCase()
        return n === q || n.includes(q) || q.includes(n)
      })
      if (found) return found
    }
  } catch {}

  // 3. Cek di daftar aplikasi Windows terpasang (cachedInstalledApps)
  if (cachedInstalledApps && cachedInstalledApps.length > 0) {
    // A. Exact match
    const exact = cachedInstalledApps.find((a) => {
      const n = a.name.toLowerCase()
      if (n === q) return true
      if (a.aliases && a.aliases.some((alias) => alias.toLowerCase() === q)) return true
      return false
    })
    if (exact) return exact

    // B. Match lewat KNOWN_APP_ALIASES
    const targetNames = KNOWN_APP_ALIASES[q] || []
    for (const tgt of targetNames) {
      const foundTarget = cachedInstalledApps.find((a) => {
        const n = a.name.toLowerCase()
        return n === tgt || n.includes(tgt)
      })
      if (foundTarget) return foundTarget
    }

    // C. Compact match
    const compactMatch = cachedInstalledApps.find((a) => {
      const nCompact = a.name.toLowerCase().replace(/[\s\-_]+/g, '')
      if (nCompact === qCompact) return true
      if (a.aliases && a.aliases.some((alias) => alias.toLowerCase().replace(/[\s\-_]+/g, '') === qCompact)) {
        return true
      }
      return false
    })
    if (compactMatch) return compactMatch

    // D. Substring match (q.length >= 3)
    if (q.length >= 3) {
      const partial = cachedInstalledApps.find((a) => {
        const n = a.name.toLowerCase()
        if (n.includes(q) || (n.length >= 4 && q.includes(n))) return true
        if (
          a.aliases &&
          a.aliases.some(
            (alias) => alias.toLowerCase().includes(q) || (alias.length >= 4 && q.includes(alias.toLowerCase()))
          )
        ) {
          return true
        }
        return false
      })
      if (partial) return partial
    }
  }

  return null
}

export function getRegisteredApps(cachedInstalledApps = []) {
  const list = []
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('hermes-avatar-settings') : null
    if (raw) {
      const s = JSON.parse(raw)
      for (const a of s.actionApps || []) {
        if (a.name) list.push(a.command ? `${a.name} (path: "${a.command}")` : a.name)
      }
    }
  } catch {}
  if (cachedInstalledApps && cachedInstalledApps.length > 0) {
    for (const a of cachedInstalledApps.slice(0, 25)) {
      if (a.name && !list.some((x) => x.startsWith(a.name))) {
        list.push(a.name)
      }
    }
  }
  return list
}

export async function tryFastLaunchApp(text, options = {}) {
  const {
    cachedInstalledApps = [],
    setCachedInstalledApps,
    musicPlayer,
    controller,
    showSpeechBubble = () => {},
    speak = () => {},
    setStatus = () => {},
    log = () => {}
  } = options

  const queries = extractAppQueries(text)
  if (!queries || queries.length === 0) return false

  // Cek apakah perintah mengarah ke Pemutar Musik bawaan avatar
  const isMusicQuery = queries.some((q) => /^(?:musik|music|lofi|lagu|player|pemutar musik)$/i.test(q))
  if (isMusicQuery && musicPlayer) {
    musicPlayer.showWindow()
    if (!musicPlayer.isPlaying) {
      musicPlayer.playTrack(musicPlayer.currentTrackIndex)
    }
    showSpeechBubble('Memutar musik lofi companion untukmu 🎵', 3500)
    speak('Memutar musik companion untukmu sekarang!', 'happy')
    return true
  }

  let apps = cachedInstalledApps
  if (!apps || apps.length === 0) {
    try {
      const res = await window.hermesAvatar?.getInstalledApps?.()
      if (res?.ok && Array.isArray(res.apps)) {
        apps = res.apps
        if (setCachedInstalledApps) setCachedInstalledApps(apps)
      }
    } catch {}
  }

  const matchedApps = []
  const missingApps = []

  for (const q of queries) {
    const matched = findMatchingApp(q, apps)
    if (matched) {
      const id = (matched.command || matched.path || matched.name).toLowerCase()
      if (!matchedApps.some((m) => (m.command || m.path || m.name).toLowerCase() === id)) {
        matchedApps.push(matched)
      }
    } else {
      missingApps.push(q)
    }
  }

  if (matchedApps.length === 0) {
    if (missingApps.length > 0) {
      const missingList = missingApps.map((q) => `"${q}"`).join(', ')
      log('avatar', `Aplikasi ${missingList} belum ditemukan di sistem.`)
      showSpeechBubble(`Aplikasi ${missingList} belum terdaftar 🤔`, 3500)
      speak(`Aku belum tahu lokasi aplikasi ${missingList}. Kamu bisa menambahkannya di Pengaturan.`, 'neutral')
      return true
    }
    return false
  }

  controller?.setExpression('happy')

  if (matchedApps.length === 1) {
    const app = matchedApps[0]
    setStatus(`Membuka ${app.name}… 🚀`)
    showSpeechBubble(`Membuka ${app.name}... 🚀`, 3500)
    log('avatar', `🚀 Membuka ${app.name}...`)
    speak(`Membuka ${app.name} sekarang!`, 'happy')
  } else {
    const names = matchedApps.map((a) => a.name).join(', ')
    setStatus(`Membuka ${matchedApps.length} aplikasi… 🚀`)
    showSpeechBubble(`Membuka ${names}... 🚀`, 4500)
    log('avatar', `🚀 Membuka ${matchedApps.length} aplikasi sekaligus: ${names}`)
    speak(`Membuka ${matchedApps.length} aplikasi sekaligus: ${names}!`, 'happy')
  }

  for (const app of matchedApps) {
    try {
      const res = await window.hermesAvatar?.launchApp(app.id || app.command || app.path)
      if (!res?.ok) {
        log('avatar', `⚠️ Gagal membuka ${app.name}: ${res?.error || 'Unknown error'}`)
      }
    } catch (err) {
      log('avatar', `⚠️ Error membuka ${app.name}: ${err.message}`)
    }
    if (matchedApps.length > 1) {
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  if (missingApps.length > 0) {
    const missingList = missingApps.map((q) => `"${q}"`).join(', ')
    log('avatar', `ℹ️ Catatan: aplikasi ${missingList} tidak ditemukan di sistem.`)
  }

  return true
}
