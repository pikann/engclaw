import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const alias = { '@': resolve(__dirname, 'src/renderer/src') }

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        exclude: [
          '@engclaw/dictionary',
          '@engclaw/game',
          '@engclaw/i18n',
          '@engclaw/ipc-contract',
          '@engclaw/models',
          '@engclaw/pronounce',
          '@engclaw/prosody',
          '@engclaw/youtube',
        ],
      },
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          utility: resolve(__dirname, 'src/utility/index.ts'),
        },
      },
    },
  },
  preload: {
    build: {
      // The preload is sandboxed and can only require('electron'), so zod must be bundled into it.
      externalizeDeps: { exclude: ['@engclaw/ipc-contract', 'zod'] },
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          player: resolve(__dirname, 'src/preload/player.ts'),
        },
        output: { format: 'cjs', entryFileNames: '[name].js' },
      },
    },
  },
  renderer: {
    resolve: { alias },
    plugins: [react(), tailwindcss()],
  },
})
