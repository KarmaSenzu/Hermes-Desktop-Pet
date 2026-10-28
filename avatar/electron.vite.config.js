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

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
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
