import { _electron as electron, expect, test } from '@playwright/test'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

test('app launches and IPC round-trips', async () => {
  const app = await electron.launch({
    args: [join(__dirname, '..'), ...(process.env['CI'] ? ['--no-sandbox'] : [])],
  })
  const page = await app.firstWindow()
  await page.getByTestId('ping').click()
  await expect(page.getByTestId('reply')).toHaveText(`hello@${process.platform}`)
  await app.close()
})

test('language switches live and persists across restarts', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'engclaw-e2e-'))
  const launch = () =>
    electron.launch({
      args: [
        join(__dirname, '..'),
        `--user-data-dir=${userData}`,
        ...(process.env['CI'] ? ['--no-sandbox'] : []),
      ],
    })

  const first = await launch()
  let page = await first.firstWindow()
  await expect(page.getByTestId('title')).toHaveText('Hello from Engclaw')
  await page.getByTestId('language-switcher').click()
  await page.getByTestId('language-vi').click()
  await expect(page.getByTestId('title')).toHaveText('Xin chào từ Engclaw')
  await first.close()

  const second = await launch()
  page = await second.firstWindow()
  await expect(page.getByTestId('title')).toHaveText('Xin chào từ Engclaw')
  await second.close()
})

test('renderer is isolated: no node, no raw ipc, only the typed bridge', async () => {
  const app = await electron.launch({
    args: [join(__dirname, '..'), ...(process.env['CI'] ? ['--no-sandbox'] : [])],
  })
  const page = await app.firstWindow()
  const probe = await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>
    const api = w['engclaw'] as Record<string, unknown>
    return {
      require: typeof w['require'],
      process: typeof w['process'],
      ipcRenderer: typeof w['ipcRenderer'],
      keys: Object.keys(api).sort(),
    }
  })
  expect(probe.require).toBe('undefined')
  expect(probe.process).toBe('undefined')
  expect(probe.ipcRenderer).toBe('undefined')
  expect(probe.keys).toEqual(['models', 'ping', 'settings', 'youtube'])

  // Unknown payload shapes are rejected on the renderer side of the bridge.
  const err = await page.evaluate(async () => {
    try {
      await (window as unknown as { engclaw: { ping(r: unknown): Promise<unknown> } }).engclaw.ping(
        {
          message: 1,
        },
      )
      return null
    } catch (e) {
      return String(e)
    }
  })
  expect(err).not.toBeNull()

  // Navigation away from the app origin is blocked.
  await page.evaluate(() => {
    window.location.href = 'https://example.com/'
  })
  await page.waitForTimeout(500)
  expect(page.url().startsWith('app://engclaw')).toBe(true)
  await app.close()
})
