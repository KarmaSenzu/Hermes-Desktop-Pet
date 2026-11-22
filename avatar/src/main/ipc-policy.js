/**
 * ipc-policy.js — Satu-satunya sumber kebenaran (single source of truth)
 * untuk kebijakan izin channel IPC per jendela (window) dan RPC methods.
 */

export const WINDOWS = ['avatar', 'settings']

/**
 * Daftar method JSON-RPC Hermes yang diizinkan dipanggil oleh renderer melalui avatar:rpc.
 */
export const RPC_ALLOWED_METHODS = [
  'config.get',
  'model.options',
  'skills.manage',
  'skills.reload'
]

/**
 * Peta kebijakan akses IPC per channel.
 * Setiap channel mendefinisikan array nama window yang diizinkan mengaksesnya.
 * Jika channel tidak dipakai oleh window mana pun, nilainya adalah array kosong [].
 */
export const IPC_POLICY = {
  // Shortcuts & UI
  'avatar:shortcuts': ['settings'],
  'avatar:set-shortcut': ['settings'],
  'avatar:start': ['settings'],
  'avatar:start-hermes-server': ['settings'],
  'avatar:close': ['avatar'],
  'avatar:focus-window': [],
  'avatar:chat-focus': ['avatar'],
  'avatar:dvd-bounce': [],
  'avatar:drag-move': ['avatar'],
  'avatar:set-ignore-mouse': ['avatar'],
  'avatar:open-settings': ['avatar'],
  'avatar:window-close': ['settings'],
  'avatar:window-minimize': ['settings'],
  'avatar:window-maximize': ['settings'],

  // Eksekusi terminal & peluncur aplikasi
  'avatar:run-in-terminal': ['settings'],
  // UTANG: avatar:launch-app dipakai di avatar/src/renderer/js/main.js untuk taskmgr & apps
  'avatar:launch-app': ['avatar', 'settings'],
  'avatar:scan-installed-apps': ['settings'],
  'avatar:get-installed-apps': ['avatar', 'settings'],
  'avatar:learn-app': [],
  'avatar:pick-app': ['settings'],
  'avatar:app-icon': ['settings'],

  // Model 3D/Live2D & Animasi
  'avatar:default-model': ['avatar', 'settings'],
  'avatar:pick-model': ['settings'],
  'avatar:read-model': ['avatar', 'settings'],
  'avatar:model-url': ['avatar'],
  'avatar:pick-animation': ['settings'],
  // Kanan push: Settings memicu, Avatar yang menampilkan → izinkan keduanya.
  'avatar:preview-animation': ['settings', 'avatar'],
  'avatar:set-model': [],
  'avatar:get-current-model': ['settings'],

  // Audio & Pemutar Musik
  // UTANG: avatar:pick-audio-files dipakai di avatar/src/renderer/js/music-player.js (index.html)
  'avatar:pick-audio-files': ['avatar', 'settings'],
  'avatar:music-load-library': ['avatar', 'settings'],
  'avatar:music-save-library': ['avatar', 'settings'],
  'avatar:music-library-info': ['settings'],
  'avatar:music-open-folder': ['avatar', 'settings'],
  'avatar:music-search': ['avatar', 'settings'],
  'avatar:music-resolve-stream': ['avatar', 'settings'],
  'avatar:music-bg-control': ['avatar'],
  'avatar:music-download-track': ['avatar', 'settings'],
  'avatar:music-check-cached': ['avatar', 'settings'],

  // Konfigurasi & Service Hermes/Kokoro
  'avatar:hermes-config': ['avatar'],
  'avatar:service-status': ['settings'],
  'avatar:get-detected-paths': ['settings'],
  'avatar:set-custom-path': ['settings'],
  'avatar:browse-custom-path': ['settings'],
  'avatar:rescan-paths': ['settings'],
  'avatar:start-router': ['settings'],
  'avatar:start-kokoro-server': ['settings'],
  'avatar:install-kokoro-deps': ['settings'],
  'avatar:uninstall-kokoro-deps': ['settings'],
  'avatar:install-package': ['settings'],
  'avatar:get-install-state': ['settings'],
  'avatar:open-package-folder': ['settings'],
  'avatar:clean-package': ['settings'],
  'avatar:trigger-idle-chatter': ['settings', 'avatar'],
  'avatar:restart-hermes': [],

  // Pembaruan Aplikasi (OTA Update)
  'avatar:check-update': ['settings'],
  'avatar:get-app-version': [],
  'avatar:open-external-url': ['settings'],
  'avatar:download-and-apply-update': ['settings'],
  'avatar:relaunch-app': ['settings'],

  // Hermes RPC & Skills
  'avatar:rpc': ['settings'],
  'avatar:add-skill': ['settings'],
  'avatar:delete-skill': ['settings'],
  'avatar:install-skill': ['settings'],
  'avatar:browse-skills': [],
  'avatar:skill-assistant': ['avatar', 'settings'],

  // Provider LLM, Kunci Rahasia & Suara
  'avatar:llm-load-providers': ['settings'],
  'avatar:llm-save-providers': ['settings'],
  'avatar:test-connection': ['settings'],
  'avatar:set-llm-provider': ['settings'],
  'avatar:fetch-endpoint-models': ['settings'],
  'avatar:fetch-all-provider-models': ['settings'],
  'avatar:start-oauth-login': ['settings'],
  'avatar:check-provider-quota': ['settings'],
  'avatar:set-tts-config': ['settings'],
  'avatar:set-stt-config': ['settings'],
  'avatar:encrypt-secret': ['settings'],

  // Hermes Brain & Otomasi (Sessions, Cron, Memory, MCP, Gateway, Fallback/MoA, Kanban)
  'avatar:hermes-search-sessions': ['avatar', 'settings'],
  'avatar:hermes-brain-get': ['settings'],
  'avatar:hermes-brain-set': ['settings'],
  'avatar:hermes-resume-in-avatar': ['settings'],

  // Manajemen Penyimpanan Lokal & Arsip Lampiran
  'avatar:storage-get': ['settings'],
  'avatar:storage-action': ['settings'],
  'avatar:archive-attachment': ['avatar'],

  // Fitur Info Langsung (Weather/News), Layar/Failover & TTS
  'avatar:get-live-weather': ['avatar'],
  'avatar:get-live-news': ['avatar'],
  'avatar:capture-screen': ['avatar'],
  'avatar:failover-llm-provider': ['avatar'],
  'avatar:tts': ['avatar', 'settings']
}
