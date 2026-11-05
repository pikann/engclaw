import { _electron as electron, expect, test, type Page } from '@playwright/test'
import axe from 'axe-core'
import { join } from 'node:path'

// Needs a build with VITE_DESIGN_SYSTEM=1 (the gallery routes are absent from release builds).
async function open() {
  const app = await electron.launch({
    args: [join(__dirname, '..'), ...(process.env['CI'] ? ['--no-sandbox'] : [])],
  })
  const page = await app.firstWindow()
  await page.evaluate(() => {
    window.location.hash = '#/screens/core'
  })
  await expect(page.getByTestId('screens-core')).toBeVisible()
  return { app, page }
}

async function serious(page: Page) {
  await page.waitForTimeout(400)
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

/** Frames whose content is wider than the frame (clipped text, e.g. long Vietnamese strings). */
async function clipped(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-testid^="frame-"] [role="group"]')]
      .filter((f) => f.scrollWidth > f.clientWidth + 1)
      .map((f) => f.parentElement?.getAttribute('data-testid') ?? '?'),
  )
}

for (const lang of ['en', 'vi'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`core screens at 960x600 in ${lang}/${theme}: no serious axe violations, no clipping`, async () => {
      const { app, page } = await open()
      await page.getByTestId(`lang-${lang}`).click()
      await page.getByTestId(`ds-theme-${theme}`).click()
      await page.getByTestId('size-960').click()
      expect(await serious(page)).toEqual([])
      expect(await clipped(page)).toEqual([])
      await app.close()
    })
  }
}

test('wide window uses three panes for practice and the Models badge shows progress', async () => {
  const { app, page } = await open()
  await page.getByTestId('size-1600').click()
  const frame = page.getByTestId('frame-practice-read-result')
  await expect(frame.getByText('Detail', { exact: true })).toBeVisible()
  await expect(page.getByTestId('frame-dl-downloading').getByText('62%').first()).toBeVisible()
  await app.close()
})
