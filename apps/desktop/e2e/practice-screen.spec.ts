import { _electron as electron, expect, test, type Page } from '@playwright/test'
import axe from 'axe-core'
import { join, resolve } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

const wav = resolve(__dirname, '../../../tests/golden/audio/bundled-developer.wav')

const launch = () =>
  electron.launch({
    args: [
      join(__dirname, '..'),
      `--user-data-dir=${mkdtempSync(join(tmpdir(), 'engclaw-e2e-'))}`,
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-audio-capture=${wav}`,
      ...(process.env['CI'] ? ['--no-sandbox'] : []),
    ],
  })

const SIZES = [
  [960, 600],
  [1280, 800],
  [1600, 900],
] as const

async function seriousViolations(page: Page): Promise<string[]> {
  await page.evaluate(axe.source)
  return page.evaluate(async () => {
    const r = await (window as unknown as { axe: typeof axe }).axe.run(document, {
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    })
    return r.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
  })
}

test('both tabs fit and pass axe at every window size, theme and language', async () => {
  test.setTimeout(180_000)
  const app = await launch()
  const page = await app.firstWindow()
  await page.getByTestId('nav-practice').click()
  for (const lang of ['en', 'vi']) {
    for (const theme of ['light', 'dark']) {
      await page.getByTestId('nav-settings').click()
      await page.getByTestId('language-switcher').click()
      await page.getByTestId(`language-${lang}`).click()
      await page.getByTestId(`theme-${theme}`).click()
      await page.getByTestId('nav-practice').click()
      for (const [w, h] of SIZES) {
        await app.evaluate(
          ({ BrowserWindow }, [cw, ch]) =>
            BrowserWindow.getAllWindows()[0]?.setContentSize(cw!, ch!),
          [w, h],
        )
        for (const mode of ['free', 'sentence']) {
          await page.getByTestId(`practice-mode-${mode}`).click()
          const label = `${lang} ${theme} ${w}x${h} ${mode}`
          await expect(page.getByTestId('practice-record'), label).toBeInViewport()
          const clipped = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
          )
          expect(clipped, label).toBe(false)
          expect(await seriousViolations(page), label).toEqual([])
        }
      }
    }
  }
  await app.close()
})

test('each tab keeps its own draft and shows it on the other tab', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await page.getByTestId('nav-practice').click()
  await page.getByTestId('practice-text').fill('Keep this sentence')
  await expect(page.getByTestId('practice-draft-kept')).toHaveCount(0)
  await page.getByTestId('practice-mode-free').click()
  await expect(page.getByTestId('practice-text')).toHaveCount(0)
  await expect(page.getByTestId('practice-draft-kept')).toBeVisible()
  await page.getByTestId('practice-mode-sentence').click()
  await expect(page.getByTestId('practice-text')).toHaveValue('Keep this sentence')
  await app.close()
})

test('Space on the focused recorder starts and stops recording', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await page.getByTestId('nav-practice').click()
  await page.getByTestId('practice-text').fill('Hello, I am a developer')
  await page.getByTestId('practice-record').focus()
  await page.keyboard.press('Space')
  await expect(page.getByTestId('practice-stop')).toBeVisible()
  await expect(page.getByTestId('practice-stop')).toBeFocused()
  await page.keyboard.press('Space')
  await expect(page.getByTestId('practice-stop')).toHaveCount(0)
  await app.close()
})

test('switching tabs while recording asks first; Keep recording is the default', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await page.getByTestId('nav-practice').click()
  await page.getByTestId('practice-text').fill('Hello, I am a developer')
  await page.getByTestId('practice-record').click()
  await expect(page.getByTestId('practice-stop')).toBeVisible()
  await page.getByTestId('practice-mode-free').click()
  const dialog = page.getByTestId('practice-switch-confirm')
  await expect(dialog).toBeVisible()
  await expect(page.getByTestId('practice-switch-stay')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('practice-stop')).toBeVisible()
  await page.getByTestId('practice-mode-free').click()
  await page.getByTestId('practice-switch-discard').click()
  await expect(page.getByTestId('practice-mode-free')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('practice-stop')).toHaveCount(0)
  await app.close()
})

test('focus order follows the pane order: input, then result', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await page.getByTestId('nav-practice').click()
  await page.getByTestId('practice-text').focus()
  const order: string[] = []
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    order.push(
      await page.evaluate(
        () =>
          document.activeElement?.getAttribute('data-testid') ??
          document.activeElement?.tagName ??
          '',
      ),
    )
  }
  expect(order).toContain('practice-record')
  expect(order.indexOf('practice-example')).toBeLessThan(order.indexOf('practice-record'))
  await app.close()
})

test('record → review (hear, play, check) keeps one step on screen', async () => {
  test.setTimeout(120_000)
  const app = await launch()
  const page = await app.firstWindow()
  await page.getByTestId('nav-practice').click()
  await page.getByTestId('practice-mode-free').click()
  await expect(page.getByTestId('practice-card')).toHaveAttribute('data-stage', 'record')
  await page.getByTestId('practice-record').click()
  await page.getByTestId('practice-stop').click()
  // Once the take is processed the review step offers hear / play / record again, and no result yet.
  await expect(page.getByTestId('practice-card')).toHaveAttribute('data-stage', 'review', {
    timeout: 60_000,
  })
  await expect(page.getByTestId('hear-reference')).toBeVisible()
  await expect(page.getByTestId('practice-play')).toBeVisible()
  await expect(page.getByTestId('practice-rerecord')).toBeVisible()
  await expect(page.getByTestId('result-card')).toHaveCount(0)
  await app.close()
})
