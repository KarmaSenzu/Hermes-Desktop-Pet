import { contextBridge, ipcRenderer } from 'electron'

/**
 * Preload untuk jendela AVATAR (overlay desktop pet).
 * Hanya mengekspos fungsi yang dibutuhkan oleh runtime avatar dan interaksi pet.
 * Menghalangi fungsi sensitif seperti terminal execution, rpc, secret encryption, dan update.
 */

const avatarApi = {
  // Platform OS aktif
  platform: process.platform,

  // Avatar model loading & lifecycle
  onLoadModel: (callback) => {
    ipcRenderer.on('avatar:load-model', (_event, modelPath) => callback(modelPath))
  },
  readModel: (modelPath) => ipcRenderer.invoke('avatar:read-model', modelPath),
  getModelUrl: (modelPath) => ipcRenderer.invoke('avatar:model-url', modelPath),
  closeAvatar: () => ipcRenderer.invoke('avatar:close'),
  getDefaultModelPath: () => ipcRenderer.invoke('avatar:default-model'),

  // Interaksi desktop pet & window management
  dragMove: (dx, dy) => ipcRenderer.send('avatar:drag-move', dx, dy),
  setIgnoreMouse: (ignore, forward = true) => ipcRenderer.send('avatar:set-ignore-mouse', ignore, forward),
  setChatFocus: (enable) => ipcRenderer.send('avatar:chat-focus', enable),
  openSettings: () => ipcRenderer.invoke('avatar:open-settings'),

  // Mouse tracking global OS
  onCursorMove: (callback) => {
    const handler = (_event, point) => callback(point)
    ipcRenderer.on('avatar:cursor-screen-point', handler)
    return () => ipcRenderer.removeListener('avatar:cursor-screen-point', handler)
  },

  // Audio musik pet
  // UTANG: pickAudioFiles dipakai music-player.js di index.html
  pickAudioFiles: () => ipcRenderer.invoke('avatar:pick-audio-files'),
  loadMusicLibrary: () => ipcRenderer.invoke('avatar:music-load-library'),
  saveMusicLibrary: (data) => ipcRenderer.invoke('avatar:music-save-library', data),

  // Konfigurasi koneksi Hermes WebSocket
  getHermesConfig: () => ipcRenderer.invoke('avatar:hermes-config'),

  // Peluncur aplikasi & info terinstall
  // UTANG: launchApp dipakai main.js avatar untuk membuka taskmgr/app
  launchApp: (targetPath) => ipcRenderer.invoke('avatar:launch-app', targetPath),
  getInstalledApps: () => ipcRenderer.invoke('avatar:get-installed-apps'),

  // Info cuaca & berita real-time untuk avatar dialog
  getLiveWeather: (city) => ipcRenderer.invoke('avatar:get-live-weather', city),
  getLiveNews: () => ipcRenderer.invoke('avatar:get-live-news'),

  // Animasi preview listener
  onPreviewAnimation: (callback) => {
    ipcRenderer.on('avatar:preview-animation', (_event, data) => callback(data))
  },

  // Global shortcut receiver
  onShortcut: (callback) => {
    ipcRenderer.on('avatar:shortcut', (_event, payload) => callback(payload))
  },

  // TTS audio synthesis
  synthesizeSpeech: (text, voice, options) => ipcRenderer.invoke('avatar:tts', text, voice, options),

  // Companion Web Prompt (Chrome/Edge extension) receiver
  onWebPrompt: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('avatar:web-prompt', handler)
    return () => ipcRenderer.removeListener('avatar:web-prompt', handler)
  },

  // Idle chatter trigger listener
  onTriggerIdleChatter: (callback) => {
    const handler = (_event, line) => callback(line)
    ipcRenderer.on('avatar:trigger-idle-chatter', handler)
    return () => ipcRenderer.removeListener('avatar:trigger-idle-chatter', handler)
  }
}

contextBridge.exposeInMainWorld('hermesAvatar', avatarApi)
