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
      window.location.hash = '#/screens/agent'
    })
    await expect(page.getByTestId('screens-agent')).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 15_000 })
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
    test(`agent screens at 960x600 in ${lang}/${theme}: no serious axe violations, no clipping`, async () => {
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

test('cards-only hides captions; transcript view shows them', async () => {
  const { app, page } = await open()
  await page.getByTestId('size-1600').click()
  await expect(
    page.getByTestId('frame-converse-listening').getByTestId('stage-caption'),
  ).toBeVisible()
  await expect(
    page.getByTestId('frame-converse-cards-listening').getByTestId('stage-caption'),
  ).toHaveCount(0)
  await expect(
    page.getByTestId('frame-converse-card-error').getByTestId('card-fallback'),
  ).toBeVisible()
  await app.close()
})

test('successful sign-in shows a confirmation instead of the form, and the closed screen shows a toast', async () => {
  const { app, page } = await open()
  const done = page.getByTestId('frame-setup-signed-in-idle')
  await expect(done.getByTestId('screen-provider-success')).toBeVisible()
  await expect(done.getByTestId('screen-provider')).toHaveCount(0)
  await expect(
    page.getByTestId('frame-converse-just-signed-in').getByTestId('signed-in-toast'),
  ).toBeVisible()
  await app.close()
})
