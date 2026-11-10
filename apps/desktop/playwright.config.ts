import { defineConfig } from '@playwright/test'

// Electron has no native headless mode: in headless runs the main process creates its window
// without ever showing it. Child processes launched by the specs inherit this env var.
// Set E2E_HEADED=1 to watch the tests run in a visible window.
process.env['ENGCLAW_E2E_HEADLESS'] = process.env['E2E_HEADED'] ? '' : '1'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  // Several Electron apps start at once, so timing-sensitive specs (scroll restore, window size)
  // occasionally fail under load. A retry tells those apart from real regressions.
  retries: process.env['CI'] ? 3 : 1,
  reporter: 'list',
})
