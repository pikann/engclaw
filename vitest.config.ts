import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, 'apps/desktop/src/renderer/src') } },
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
  },
})
