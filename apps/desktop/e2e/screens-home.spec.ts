import { _electron as electron, expect, test, type Page } from '@playwright/test'
import axe from 'axe-core'
import { join } from 'node:path'

// Needs a build with VITE_DESIGN_SYSTEM=1 (the gallery routes are absent from release builds).
async function open() {
  const app = await electron.launch({
    args: [join(__dirname, '..'), ...(process.env['CI'] ? ['--no-sandbox'] : [])],
  })
  const page = await app.firstWindow()
  await expect(async () => {
    await page.evaluate(() => {
      window.location.hash = '#/screens/home'
    })
    await expect(page.getByTestId('screens-home')).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 15_000 })
  return { app, page }
}

async function serious(page: Page) {
  await page.waitForTimeout(400)
  // A hidden (headless) window produces no frames on Linux/Windows, which freezes theme colour
  // transitions half-way; drop them so axe reads the final colours.
  await page.evaluate(() => {
    const style = document.createElement('style')
    style.textContent = '*, *::before, *::after { transition: none !important }'
    document.head.append(style)
  })
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
    test(`home screens at 960x600 in ${lang}/${theme}: no serious axe violations, no clipping`, async () => {
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

test('every Home state renders; offline disables the video and conversation cards', async () => {
  const { app, page } = await open()
  await page.getByTestId('size-1280').click()
  const frame = (id: string) => page.getByTestId(`frame-home-${id}`)
  await expect(frame('first-run').getByTestId('home-models-missing')).toBeVisible()
  await expect(frame('first-run').getByTestId('home-recent-empty')).toBeVisible()
  await expect(frame('returning').getByTestId('home-recent')).toBeVisible()
  await expect(
    frame('partial').getByTestId('home-continue-cards').locator('[data-slot=card]'),
  ).toHaveCount(2)
  await expect(frame('downloading').getByTestId('home-models-downloading')).toBeVisible()
  await expect(
    frame('no-provider')
      .getByText(/AI provider|nhà cung cấp AI/)
      .first(),
  ).toBeVisible()
  await expect(frame('offline').getByTestId('home-offline')).toBeVisible()
  await expect(
    frame('offline')
      .getByTestId('home-continue-cards')
      .getByRole('button', { name: /Continue|Tiếp tục/ })
      .nth(1),
  ).toBeDisabled()
  await app.close()
})
