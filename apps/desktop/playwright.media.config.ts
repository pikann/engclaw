import { defineConfig } from '@playwright/test'

// README GIFs (see media/README.md). Hidden window, scripted speech engine, one scene at a time.
process.env['ENGCLAW_E2E_HEADLESS'] = '1'

export default defineConfig({
  testDir: './media',
  timeout: 180_000,
  workers: 1,
  retries: 0,
  reporter: 'list',
})
