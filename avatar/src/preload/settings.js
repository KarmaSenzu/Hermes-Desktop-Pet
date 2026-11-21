import { contextBridge, ipcRenderer } from 'electron'

/**
 * Preload untuk jendela SETTINGS / PENGATURAN (dashboard).
 * Mengekspos API konfigurasi LLM, provider, model, skill, service status, dan update.
 */

const settingsApi = {
  // Platform OS aktif
  platform: process.platform,

  // Launcher: mulai avatar dengan model terpilih
  startAvatar: (modelPath) => ipcRenderer.invoke('avatar:start', modelPath),
  readModel: (modelPath) => ipcRenderer.invoke('avatar:read-model', modelPath),
  getDefaultModelPath: () => ipcRenderer.invoke('avatar:default-model'),
  pickModelFile: () => ipcRenderer.invoke('avatar:pick-model'),

  // Pustaka Musik
  loadMusicLibrary: () => ipcRenderer.invoke('avatar:music-load-library'),
  saveMusicLibrary: (data) => ipcRenderer.invoke('avatar:music-save-library', data),
  getMusicLibraryInfo: () => ipcRenderer.invoke('avatar:music-library-info'),
  openMusicFolder: () => ipcRenderer.invoke('avatar:music-open-folder'),

  // Status Service & Hub Manajemen Paket
  getServiceStatus: () => ipcRenderer.invoke('avatar:service-status'),
  startHermesServer: () => ipcRenderer.invoke('avatar:start-hermes-server'),
  startKokoroServer: () => ipcRenderer.invoke('avatar:start-kokoro-server'),
  installKokoroDeps: () => ipcRenderer.invoke('avatar:install-kokoro-deps'),
  uninstallKokoroDeps: () => ipcRenderer.invoke('avatar:uninstall-kokoro-deps'),
  installPackage: (pkgId) => ipcRenderer.invoke('avatar:install-package', pkgId),
  getInstallState: () => ipcRenderer.invoke('avatar:get-install-state'),
  onPackageInstallProgress: (callback) => {
    const handler = (_event, info) => callback(info)
    ipcRenderer.on('avatar:package-install-progress', handler)
    return () => ipcRenderer.removeListener('avatar:package-install-progress', handler)
  },
  openPackageFolder: (pkgName) => ipcRenderer.invoke('avatar:open-package-folder', pkgName),
  cleanPackage: (pkgName) => ipcRenderer.invoke('avatar:clean-package', pkgName),

  // Multi-tier Path Discovery & Router
  getDetectedPaths: () => ipcRenderer.invoke('avatar:get-detected-paths'),
  setCustomPath: (key, val) => ipcRenderer.invoke('avatar:set-custom-path', key, val),
  browseCustomPath: (key, type) => ipcRenderer.invoke('avatar:browse-custom-path', key, type),
  rescanPaths: () => ipcRenderer.invoke('avatar:rescan-paths'),
  startRouter: () => ipcRenderer.invoke('avatar:start-router'),

  // Hermes Gateway JSON-RPC (terbatas pada method yang diizinkan)
  rpc: (method, params) => ipcRenderer.invoke('avatar:rpc', method, params),

  // Hermes Brain & Otomasi (Sessions, Cron, Memory, MCP, Gateway, Fallback/MoA, Kanban)
  searchHermesSessions: (queryOrOpts, limit, sessionId) =>
    ipcRenderer.invoke('avatar:hermes-search-sessions', queryOrOpts, limit, sessionId),
  hermesBrainGet: (section, params) => ipcRenderer.invoke('avatar:hermes-brain-get', section, params),
  hermesBrainSet: (action, payload) => ipcRenderer.invoke('avatar:hermes-brain-set', action, payload),
  resumeSessionInAvatar: (sessionId) => ipcRenderer.invoke('avatar:hermes-resume-in-avatar', sessionId),

  // Manajemen Penyimpanan Lokal
  getStorageSummary: (params) => ipcRenderer.invoke('avatar:storage-get', params),
  storageAction: (action, payload) => ipcRenderer.invoke('avatar:storage-action', action, payload),

  // Skill Management
  addSkill: (payload) => ipcRenderer.invoke('avatar:add-skill', payload),
  deleteSkill: (payload) => ipcRenderer.invoke('avatar:delete-skill', payload),
  installSkill: (skillId) => ipcRenderer.invoke('avatar:install-skill', skillId),

  // LLM Provider & Model Management
  loadLlmProviders: () => ipcRenderer.invoke('avatar:llm-load-providers'),
  saveLlmProviders: (data) => ipcRenderer.invoke('avatar:llm-save-providers', data),
  testConnection: (url, model, apiKey) => ipcRenderer.invoke('avatar:test-connection', url, model, apiKey),
  setLlmProvider: (payload) => ipcRenderer.invoke('avatar:set-llm-provider', payload),
  fetchEndpointModels: (baseUrl, apiKey) => ipcRenderer.invoke('avatar:fetch-endpoint-models', baseUrl, apiKey),
  fetchAllProviderModels: (providers) => ipcRenderer.invoke('avatar:fetch-all-provider-models', providers),
  startOAuthLogin: (providerId) => ipcRenderer.invoke('avatar:start-oauth-login', providerId),
  checkProviderQuota: (baseUrl, apiKey) => ipcRenderer.invoke('avatar:check-provider-quota', baseUrl, apiKey),
  getCurrentModel: () => ipcRenderer.invoke('avatar:get-current-model'),
  setTtsConfig: (cfg) => ipcRenderer.invoke('avatar:set-tts-config', cfg),
  setSttConfig: (cfg) => ipcRenderer.invoke('avatar:set-stt-config', cfg),
  encryptSecret: (plaintext, baseUrl) => ipcRenderer.invoke('avatar:encrypt-secret', plaintext, baseUrl),

  // Aplikasi & Shortcut
  pickApp: () => ipcRenderer.invoke('avatar:pick-app'),
  getAppIcon: (appId) => ipcRenderer.invoke('avatar:app-icon', appId),
  scanInstalledApps: () => ipcRenderer.invoke('avatar:scan-installed-apps'),
  getInstalledApps: () => ipcRenderer.invoke('avatar:get-installed-apps'),
  launchApp: (appId, appName) => ipcRenderer.invoke('avatar:launch-app', appId, appName),
  getShortcuts: () => ipcRenderer.invoke('avatar:shortcuts'),
  setShortcut: (id, accel) => ipcRenderer.invoke('avatar:set-shortcut', id, accel),

  // Animasi
  pickAnimation: () => ipcRenderer.invoke('avatar:pick-animation'),
  previewAnimation: (data) => ipcRenderer.invoke('avatar:preview-animation', data),

  // TTS Test
  synthesizeSpeech: (text, voice, options) => ipcRenderer.invoke('avatar:tts', text, voice, options),

  // Kontrol Jendela Settings (traffic lights)
  windowClose: () => ipcRenderer.invoke('avatar:window-close'),
  windowMinimize: () => ipcRenderer.invoke('avatar:window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('avatar:window-maximize'),

  // Terminal Execution
  runInTerminal: (actionId) => ipcRenderer.invoke('avatar:run-in-terminal', actionId),

  // Update Rilis (OTA Auto-Update)
  checkAppUpdate: () => ipcRenderer.invoke('avatar:check-update'),
  openExternalUrl: (url) => ipcRenderer.invoke('avatar:open-external-url', url),
  downloadAndApplyUpdate: (downloadUrl, assetName) => ipcRenderer.invoke('avatar:download-and-apply-update', downloadUrl, assetName),
  onUpdateProgress: (callback) => {
    const handler = (_event, info) => callback(info)
    ipcRenderer.on('avatar:update-download-progress', handler)
    return () => ipcRenderer.removeListener('avatar:update-download-progress', handler)
  },
  relaunchApp: () => ipcRenderer.invoke('avatar:relaunch-app'),

  // Idle chatter test trigger
  triggerIdleChatter: (line) => ipcRenderer.invoke('avatar:trigger-idle-chatter', line)
}

contextBridge.exposeInMainWorld('hermesAvatar', settingsApi)
