import { contextBridge, ipcRenderer } from 'electron'

/**
 * Preload — jembatan aman antara renderer (three.js) dan main process.
 * Renderer hanya boleh akses API yang diekspos di sini (context isolation).
 */

const api = {
  // Platform OS aktif (darwin, win32, linux)
  platform: process.platform,

  // Launcher: mulai avatar dengan model terpilih.
  startAvatar: (modelPath) => ipcRenderer.invoke('avatar:start', modelPath),

  // Avatar: menerima event load model dari main.
  onLoadModel: (callback) => {
    ipcRenderer.on('avatar:load-model', (_event, modelPath) => callback(modelPath))
  },

  // Avatar/launcher: baca file model dari disk → { ok, name, base64, ext }.
  readModel: (modelPath) => ipcRenderer.invoke('avatar:read-model', modelPath),

  // Avatar: ubah path filesystem → URL model:// (untuk MMD .pmx/.pmd + texture).
  getModelUrl: (modelPath) => ipcRenderer.invoke('avatar:model-url', modelPath),

  // Avatar: tutup / kembali ke launcher.
  closeAvatar: () => ipcRenderer.invoke('avatar:close'),

  // Trigger animasi DVD bounce (emote/skill).
  dvdBounce: () => ipcRenderer.invoke('avatar:dvd-bounce'),

  // Drag manual window (delta px → main pindahkan window).
  dragMove: (dx, dy) => ipcRenderer.send('avatar:drag-move', dx, dy),

  // Klik tembus ke OS saat kursor di luar karakter (overlay full-screen).
  setIgnoreMouse: (ignore, forward = true) => ipcRenderer.send('avatar:set-ignore-mouse', ignore, forward),

  // Berikan fokus keyboard ke window avatar (untuk mengetik chat)
  focusWindow: () => ipcRenderer.send('avatar:focus-window'),

  // Kontrol fokus khusus saat chat dibuka/ditutup (agar bisa mengetik tanpa merusak z-order)
  setChatFocus: (enable) => ipcRenderer.send('avatar:chat-focus', enable),

  // Menerima koordinat kursor global OS (desktop-wide mouse tracking ala YourMother)
  onCursorMove: (callback) => {
    const handler = (_event, point) => callback(point)
    ipcRenderer.on('avatar:cursor-screen-point', handler)
    return () => ipcRenderer.removeListener('avatar:cursor-screen-point', handler)
  },

  // Buka jendela pengaturan / launcher dari avatar.
  openSettings: () => ipcRenderer.invoke('avatar:open-settings'),

  // Akses path model default (baca dari argumen/env, bukan hardcode mesin lain).
  getDefaultModelPath: () => ipcRenderer.invoke('avatar:default-model'),

  // Buka dialog pilih file model (native Finder/Explorer) → path | null.
  pickModelFile: () => ipcRenderer.invoke('avatar:pick-model'),

  // Buka dialog pilih file audio musik lokal (mp3, wav, ogg, flac, m4a, aac).
  pickAudioFiles: () => ipcRenderer.invoke('avatar:pick-audio-files'),

  // Konfigurasi Hermes gateway (WS URL + token dari env).
  getHermesConfig: () => ipcRenderer.invoke('avatar:hermes-config'),

  // Status service (9Router, hermes, kokoro, python) untuk settings panel & Package Hub.
  getServiceStatus: () => ipcRenderer.invoke('avatar:service-status'),
  startHermesServer: () => ipcRenderer.invoke('avatar:start-hermes-server'),
  startKokoroServer: () => ipcRenderer.invoke('avatar:start-kokoro-server'),
  installKokoroDeps: () => ipcRenderer.invoke('avatar:install-kokoro-deps'),
  uninstallKokoroDeps: () => ipcRenderer.invoke('avatar:uninstall-kokoro-deps'),
  openPackageFolder: (pkgName) => ipcRenderer.invoke('avatar:open-package-folder', pkgName),
  cleanPackage: (pkgName) => ipcRenderer.invoke('avatar:clean-package', pkgName),

  // RPC ke Hermes (shared gateway) — untuk config/model di LLM section.
  rpc: (method, params) => ipcRenderer.invoke('avatar:rpc', method, params),

  // Tambah skill custom (tulis SKILL.md ke ~/.hermes/skills/).
  addSkill: (payload) => ipcRenderer.invoke('avatar:add-skill', payload),

  // Hapus skill custom (hapus folder di ~/.hermes/skills/).
  deleteSkill: (payload) => ipcRenderer.invoke('avatar:delete-skill', payload),

  // Tes koneksi model (chat completion sungguhan ke provider).
  testConnection: (url, model, apiKey) => ipcRenderer.invoke('avatar:test-connection', url, model, apiKey),

  // Set model aktif (via hermes config set — mekanisme resmi).
  setModel: (model) => ipcRenderer.invoke('avatar:set-model', model),

  // Set TTS config (voice + speed) ke Hermes.
  setTtsConfig: (cfg) => ipcRenderer.invoke('avatar:set-tts-config', cfg),

  // Set STT config (model + bahasa) ke Hermes.
  setSttConfig: (cfg) => ipcRenderer.invoke('avatar:set-stt-config', cfg),

  // Install skill dari hub + browse/search skill.
  installSkill: (skillId) => ipcRenderer.invoke('avatar:install-skill', skillId),
  browseSkills: (query) => ipcRenderer.invoke('avatar:browse-skills', query),

  // Enkripsi/dekripsi secret (API key) via safeStorage.
  encryptSecret: (text) => ipcRenderer.invoke('avatar:encrypt-secret', text),
  decryptSecret: (encrypted) => ipcRenderer.invoke('avatar:decrypt-secret', encrypted),

  // Pilih file aplikasi (native dialog) + ambil icon.
  pickApp: () => ipcRenderer.invoke('avatar:pick-app'),
  getAppIcon: (filePath) => ipcRenderer.invoke('avatar:app-icon', filePath),
  launchApp: (targetPath) => ipcRenderer.invoke('avatar:launch-app', targetPath),
  scanInstalledApps: () => ipcRenderer.invoke('avatar:scan-installed-apps'),
  getInstalledApps: () => ipcRenderer.invoke('avatar:get-installed-apps'),
  learnApp: (appData) => ipcRenderer.invoke('avatar:learn-app', appData),
  getLiveWeather: (city) => ipcRenderer.invoke('avatar:get-live-weather', city),
  getLiveNews: () => ipcRenderer.invoke('avatar:get-live-news'),

  // Kontrol jendela (macOS traffic lights: close, minimize, maximize)
  windowClose: () => ipcRenderer.invoke('avatar:window-close'),
  windowMinimize: () => ipcRenderer.invoke('avatar:window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('avatar:window-maximize'),

  // Eksekusi terminal transparan (PowerShell)
  runInTerminal: (cmd, cwd) => ipcRenderer.invoke('avatar:run-in-terminal', cmd, cwd),

  // Pilih file animasi (GLB/VMD/Live2D/BVH).
  pickAnimation: () => ipcRenderer.invoke('avatar:pick-animation'),
  previewAnimation: (data) => ipcRenderer.invoke('avatar:preview-animation', data),
  onPreviewAnimation: (callback) => {
    ipcRenderer.on('avatar:preview-animation', (_event, data) => callback(data))
  },

  // Daftar global shortcut (untuk settings).
  getShortcuts: () => ipcRenderer.invoke('avatar:shortcuts'),

  // Ubah kombinasi shortcut.
  setShortcut: (id, accel) => ipcRenderer.invoke('avatar:set-shortcut', id, accel),

  // Terima event shortcut global (dikirim main → avatar renderer).
  onShortcut: (callback) => {
    ipcRenderer.on('avatar:shortcut', (_event, payload) => callback(payload))
  },

  // TTS: kirim teks → dapatkan audio base64 (diproses di main process).
  synthesizeSpeech: (text, voice, options) => ipcRenderer.invoke('avatar:tts', text, voice, options),

  // Web Companion (Chrome & Edge Extension) ask-ai prompt receiver
  onWebPrompt: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('avatar:web-prompt', handler)
    return () => ipcRenderer.removeListener('avatar:web-prompt', handler)
  }
}

contextBridge.exposeInMainWorld('hermesAvatar', api)
