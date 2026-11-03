import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const alias = { '@': resolve(__dirname, 'src/renderer/src') }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@engclaw/ipc-contract', '@engclaw/pronounce', '@engclaw/youtube'] })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          utility: resolve(__dirname, 'src/utility/index.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@engclaw/ipc-contract'] })],
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].js' } } },
  },
  renderer: {
    resolve: { alias },
    plugins: [react(), tailwindcss()],
  },
})
