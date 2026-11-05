import { defineConfig } from '@playwright/test'

// Electron has no native headless mode: in headless runs the main process creates its window
// without ever showing it. Child processes launched by the specs inherit this env var.
// Set E2E_HEADED=1 to watch the tests run in a visible window.
process.env['ENGCLAW_E2E_HEADLESS'] = process.env['E2E_HEADED'] ? '' : '1'

export default defineConfig({ testDir: './e2e', timeout: 60_000, reporter: 'list' })
