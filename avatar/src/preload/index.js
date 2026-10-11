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

  // TTS: kirim teks → dapatkan audio base64 (diproses di main process).
  synthesizeSpeech: (text, voice) => ipcRenderer.invoke('avatar:tts', text, voice)
}

contextBridge.exposeInMainWorld('hermesAvatar', api)
