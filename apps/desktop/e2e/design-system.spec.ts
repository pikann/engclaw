import { _electron as electron, expect, test, type Page } from '@playwright/test'
import axe from 'axe-core'
import { join } from 'node:path'

// Needs a build with VITE_DESIGN_SYSTEM=1 (the kitchen-sink route is absent from release builds).
async function open(reducedMotion?: boolean) {
  const app = await electron.launch({
    args: [join(__dirname, '..'), ...(process.env['CI'] ? ['--no-sandbox'] : [])],
  })
  const page = await app.firstWindow()
  if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => {
    window.location.hash = '#/design-system'
  })
  await expect(page.getByTestId('design-system')).toBeVisible()
  return { app, page }
}

// Playwright's Electron driver cannot open the extra page @axe-core/playwright needs, so run
// axe-core directly inside the renderer.
async function serious(page: Page) {
  await page.waitForTimeout(400) // let colour transitions from a theme switch finish
  await page.evaluate(axe.source)
  const violations = await page.evaluate(async () => {
    const r = await (window as unknown as { axe: typeof axe }).axe.run(document, {
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    })
    return r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target.join(' ')),
    }))
  })
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.targets.join(' | ')}`)
}

test('kitchen sink has no serious axe violations in light and dark', async () => {
  const { app, page } = await open()
  await page.getByTestId('ds-theme-light').click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  expect(await serious(page)).toEqual([])
  await page.getByTestId('ds-theme-dark').click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  expect(await serious(page)).toEqual([])
  await app.close()
})

test('Vietnamese diacritics render with the bundled font', async () => {
  const { app, page } = await open()
  const ok = await page.evaluate(async () => {
    await document.fonts.load("16px 'Inter Variable'", 'Ắ ữ ộ')
    return document.fonts.check("16px 'Inter Variable'", 'Ắ ữ ộ ʃ ə')
  })
  expect(ok).toBe(true)
  await app.close()
})

test('reduced motion: stars do not animate and burst rays are removed', async () => {
  const { app, page } = await open(true)
  await expect(page.getByTestId('star-burst-rays')).toHaveCount(0)
  const animated = await page.locator('[data-stars="3"] svg.animate-star-pop').count()
  expect(animated).toBe(0)
  await app.close()
})

test('dialog returns focus to the word that opened it', async () => {
  const { app, page } = await open()
  const word = page.getByRole('button', { name: 'serendipity' })
  await word.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('dictionary-dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('dictionary-dialog')).toHaveCount(0)
  await expect(word).toBeFocused()
  await app.close()
})

test('theme choice persists across restarts', async () => {
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
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
  await page.getByTestId('tab-settings').click()
  await page.getByTestId('theme-dark').click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await first.close()
  const second = await launch()
  page = await second.firstWindow()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await second.close()
})
