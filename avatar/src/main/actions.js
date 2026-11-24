/**
 * actions.js — Definisi statis perintah terminal bernama (named terminal actions).
 *
 * Mencegah eksekusi perintah bebas (arbitrary command execution) dari renderer
 * dengan hanya mengizinkan aksi-aksi yang terdaftar secara statis.
 */

export const TERMINAL_ACTIONS = {
  'install-hermes': process.platform === 'win32'
    ? {
        label: 'Install Hermes Agent (Resmi)',
        cmd: 'powershell.exe',
        args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'Invoke-Expression (Invoke-RestMethod https://hermes-agent.nousresearch.com/install.ps1)']
      }
    : {
        label: 'Install Hermes Agent (Resmi)',
        cmd: 'bash',
        args: ['-c', 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash']
      },
  'start-hermes': {
    label: 'Jalankan Hermes Serve',
    cmd: 'hermes',
    args: ['serve']
  },
  'install-router': {
    label: 'Install 9Router via NPM',
    cmd: 'npm',
    args: ['install', '-g', '9router']
  },
  'start-router': {
    label: 'Jalankan 9Router (Debugging)',
    cmd: '9router',
    args: ['-n', '-p', '20128']
  },
  'install-kokoro': {
    label: 'Install Dependensi Kokoro TTS',
    cmd: process.platform === 'win32' ? 'py' : 'python3',
    args: ['-m', 'pip', 'install', 'kokoro-onnx', 'soundfile', '--break-system-packages']
  },
  'start-kokoro': {
    label: 'Jalankan Server Kokoro (Debugging)',
    cmd: process.platform === 'win32' ? 'py' : 'python3',
    args: ['scripts/kokoro_server.py']
  },
  'test-python': {
    label: 'Tes Versi Python',
    cmd: process.platform === 'win32' ? 'py' : 'python3',
    args: ['--version']
  },
  'memory-status': {
    label: 'Cek Status Memori Hermes',
    cmd: 'hermes',
    args: ['memory', 'status']
  },
  'ping-bridge': {
    label: 'Cek Status Bridge Companion via Curl',
    cmd: 'curl',
    args: ['http://127.0.0.1:9124/api/ping']
  }
}

/**
 * Menyelesaikan actionId ke konfigurasi perintah statis.
 *
 * @param {string} id
 * @returns {{ label: string, cmd: string, args: string[] } | null}
 */
export function resolveTerminalAction(id) {
  if (typeof id !== 'string' || !Object.hasOwn(TERMINAL_ACTIONS, id)) {
    return null
  }
  const action = TERMINAL_ACTIONS[id]
  return {
    label: action.label,
    cmd: action.cmd,
    args: [...action.args]
  }
}
