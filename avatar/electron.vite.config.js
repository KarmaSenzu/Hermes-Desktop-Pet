import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'
import { CSP_POLICY } from './csp-policy.js'

function cspPlugin() {
  return {
    name: 'vite-plugin-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        /(<meta\s+charset=[^>]*>)/i,
        `$1\n    <meta http-equiv="Content-Security-Policy" content="${CSP_POLICY}">`
      )
    }
  }
}

function wsOptionalPeerDepsPlugin() {
  const optionalPeers = new Set(['bufferutil', 'utf-8-validate'])
  return {
    name: 'vite-plugin-ws-optional-peers',
    enforce: 'pre',
    resolveId(id) {
      if (optionalPeers.has(id)) {
        return '\0ws-optional-noop'
      }
      return null
    },
    load(id) {
      if (id === '\0ws-optional-noop') {
        return 'export default null'
      }
      return null
    }
  }
}

export default defineConfig({
  main: {
    plugins: [wsOptionalPeerDepsPlugin(), externalizeDepsPlugin({ exclude: ['ws', 'yaml', 'msedge-tts'] })],
    define: {
      'process.env.WS_NO_BUFFER_UTIL': '"1"',
      'process.env.WS_NO_UTF_8_VALIDATE': '"1"'
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.js')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          avatar: resolve(__dirname, 'src/preload/avatar.js'),
          settings: resolve(__dirname, 'src/preload/settings.js')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [cspPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          launcher: resolve(__dirname, 'src/renderer/launcher.html'),
          settings: resolve(__dirname, 'src/renderer/settings.html')
        }
      }
    }
  }
})
