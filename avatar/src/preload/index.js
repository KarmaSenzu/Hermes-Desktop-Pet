import { contextBridge, ipcRenderer } from 'electron'

/**
 * Preload — jembatan aman antara renderer (three.js) dan main process.
 * Renderer hanya boleh akses API yang diekspos di sini (context isolation).
 */

const api = {
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

  // Akses path model default (baca dari argumen/env, bukan hardcode mesin lain).
  getDefaultModelPath: () => ipcRenderer.invoke('avatar:default-model'),

  // Buka dialog pilih file model (native Finder/Explorer) → path | null.
  pickModelFile: () => ipcRenderer.invoke('avatar:pick-model'),

  // Konfigurasi Hermes gateway (WS URL + token dari env).
  getHermesConfig: () => ipcRenderer.invoke('avatar:hermes-config'),

  // Status service (9Router & hermes) untuk settings panel.
  getServiceStatus: () => ipcRenderer.invoke('avatar:service-status'),

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

  // Enkripsi/dekripsi secret (API key) via safeStorage.
  encryptSecret: (text) => ipcRenderer.invoke('avatar:encrypt-secret', text),
  decryptSecret: (encrypted) => ipcRenderer.invoke('avatar:decrypt-secret', encrypted),

  // Pilih file aplikasi (native dialog) + ambil icon.
  pickApp: () => ipcRenderer.invoke('avatar:pick-app'),
  getAppIcon: (filePath) => ipcRenderer.invoke('avatar:app-icon', filePath),

  // Daftar global shortcut (untuk settings).
  getShortcuts: () => ipcRenderer.invoke('avatar:shortcuts'),

  // Ubah kombinasi shortcut.
  setShortcut: (id, accel) => ipcRenderer.invoke('avatar:set-shortcut', id, accel),

  // Terima event shortcut global (dikirim main → avatar renderer).
  onShortcut: (callback) => {
    ipcRenderer.on('avatar:shortcut', (_event, payload) => callback(payload))
  },

  // TTS: kirim teks → dapatkan audio base64 (diproses di main process).
  synthesizeSpeech: (text, voice) => ipcRenderer.invoke('avatar:tts', text, voice)
}

contextBridge.exposeInMainWorld('hermesAvatar', api)
