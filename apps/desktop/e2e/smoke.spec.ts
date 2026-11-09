import { _electron as electron, expect, test } from '@playwright/test'
import { join } from 'node:path'
import type { EngclawApi } from '@engclaw/ipc-contract'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

test('app launches and IPC round-trips', async () => {
  const app = await electron.launch({
    args: [join(__dirname, '..'), ...(process.env['CI'] ? ['--no-sandbox'] : [])],
  })
  const page = await app.firstWindow()
  await page.evaluate(() => (window.location.hash = '#/dev/ping'))
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
  await page.getByTestId('nav-settings').click()
  await expect(page.getByTestId('page-title')).toHaveText('Settings')
  await page.getByTestId('language-switcher').click()
  await page.getByTestId('language-vi').click()
  await expect(page.getByTestId('page-title')).toHaveText('Cài đặt')
  await first.close()

  const second = await launch()
  page = await second.firstWindow()
  await expect(page.getByTestId('nav-home')).toContainText('Trang chủ')
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
  expect(probe.keys).toEqual([
    'agent',
    'app',
    'contours',
    'deck',
    'dictionary',
    'game',
    'history',
    'inference',
    'llm',
    'models',
    'ping',
    'player',
    'settings',
    'tts',
    'youtube',
  ])

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

test('practice card: empty text shows an inline hint instead of recording', async () => {
  const app = await electron.launch({
    args: [join(__dirname, '..'), ...(process.env['CI'] ? ['--no-sandbox'] : [])],
  })
  const page = await app.firstWindow()
  await page.getByTestId('nav-practice').click()
  await expect(page.getByTestId('practice-hint')).toHaveCount(0)
  await page.getByTestId('practice-record').click()
  await expect(page.getByTestId('practice-hint')).toBeVisible()
  await expect(page.getByTestId('practice-stop')).toHaveCount(0)
  await page.getByTestId('practice-example').first().click()
  await expect(page.getByTestId('practice-hint')).toHaveCount(0)
  await expect(page.getByTestId('practice-text')).not.toHaveValue('')
  await app.close()
})

test('history and settings persist across restarts (SQLite in userData)', async () => {
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
  await page.evaluate(async () => {
    const api = () => (window as unknown as { engclaw: EngclawApi }).engclaw
    await api().history.save({
      mode: 'sentence',
      text: 'Persist me.',
      language: 'en',
      score: 77,
      errors: [],
      audio: new Float32Array(1600),
    })
    await api().app.updateSettings({ silenceAutoStop: false })
  })
  await first.close()

  const second = await launch()
  page = await second.firstWindow()
  const { list, settings, audio } = await page.evaluate(async () => {
    const api = () => (window as unknown as { engclaw: EngclawApi }).engclaw
    const list = await api().history.list()
    const id = list.attempts[0]?.id ?? ''
    return {
      list,
      settings: await api().app.getSettings(),
      audio: (await api().history.audio({ id }))?.length ?? 0,
    }
  })
  expect(list.total).toBe(1)
  expect(list.attempts[0]).toMatchObject({ text: 'Persist me.', score: 77, hasAudio: true })
  expect(settings.silenceAutoStop).toBe(false)
  expect(audio).toBe(1600)

  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('history-item')).toHaveCount(1)
  await second.close()
})
