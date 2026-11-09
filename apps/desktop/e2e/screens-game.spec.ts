import { expect, test, type Page } from '@playwright/test'
import { electron } from './electron'
import axe from 'axe-core'
import { join } from 'node:path'

// Needs a build with VITE_DESIGN_SYSTEM=1 (the gallery routes are absent from release builds).
async function open(reducedMotion = false) {
  const app = await electron.launch({
    args: [join(__dirname, '..'), ...(process.env['CI'] ? ['--no-sandbox'] : [])],
  })
  const page = await app.firstWindow()
  if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(async () => {
    await page.evaluate(() => {
      window.location.hash = '#/screens/game'
    })
    await expect(page.getByTestId('screens-game')).toBeVisible({ timeout: 1500 })
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
    test(`game screens at 960x600 in ${lang}/${theme}: no serious axe violations, no clipping`, async () => {
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

test('map: zig-zag keeps chapter order in the DOM, current chapter is marked, preview is docked', async () => {
  const { app, page } = await open()
  await page.getByTestId('size-1600').click()
  const map = page.getByTestId('frame-map-mid')
  await expect(map.getByTestId('you-are-here')).toHaveCount(1)
  await expect(map.getByTestId('chapter-preview')).toBeVisible()
  await expect(map.getByTestId('road-svg')).toBeVisible()
  await expect(map.getByTestId('road-walked')).toHaveCount(1)
  const order = await map
    .locator('[data-testid="road-map"] button[data-state]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')?.match(/Chapter (\d+)/)?.[1]))
  expect(order).toEqual([...order].sort((a, b) => Number(a) - Number(b)))
  await expect(page.getByTestId('frame-map-first').getByTestId('coach-mark')).toBeVisible()
  await expect(page.getByTestId('frame-map-none').getByTestId('preview-empty')).toBeVisible()
  await app.close()
})

test('locked chapters are disabled and passed ones show 1-3 stars', async () => {
  const { app, page } = await open()
  const map = page.getByTestId('frame-map-mid')
  await expect(map.locator('button[data-state="locked"]').first()).toBeDisabled()
  const stars = await map
    .locator('[data-testid="road-map"] button[data-state="passed"]')
    .evaluateAll((els) =>
      els.map((e) =>
        Number(e.parentElement?.querySelector('[data-stars]')?.getAttribute('data-stars')),
      ),
    )
  expect(stars.length).toBeGreaterThan(0)
  for (const n of stars) expect([1, 2, 3]).toContain(n)
  await app.close()
})

test('chapter: Ask the agent keeps the run, switches the mic off, and no provider disables the button', async () => {
  const { app, page } = await open()
  await page.getByTestId('size-1600').click()
  const open_ = page.getByTestId('frame-chapter-ask-idiom')
  await expect(open_.getByTestId('ask-panel')).toBeVisible()
  await expect(open_.getByTestId('mic-exclusive')).toBeVisible()
  await expect(open_.getByRole('listitem').filter({ hasText: 'Attempt 3: correct' })).toHaveCount(1)
  await expect(
    page.getByTestId('frame-chapter-ask-no-provider').getByTestId('ask-button'),
  ).toBeDisabled()
  await app.close()
})

test('chapter error and empty states are announced with a recovery action', async () => {
  const { app, page } = await open()
  await expect(page.getByTestId('frame-chapter-err-mic').getByTestId('chapter-error')).toBeVisible()
  await expect(
    page.getByTestId('frame-chapter-err-analysis').getByTestId('chapter-error'),
  ).toBeVisible()
  await expect(
    page.getByTestId('frame-chapter-err-offline-audio').getByTestId('offline-audio'),
  ).toBeVisible()
  await expect(
    page.getByTestId('frame-chapter-err-model').getByTestId('screen-download'),
  ).toBeVisible()
  await app.close()
})

test('result: last chapter replaces Next with Back to map; compare shows this run vs best', async () => {
  const { app, page } = await open()
  const last = page.getByTestId('frame-result-last-chapter')
  await expect(last.getByTestId('last-banner')).toBeVisible()
  await expect(last.getByRole('button', { name: 'Next chapter' })).toHaveCount(0)
  await expect(page.getByTestId('frame-result-compare').getByTestId('compare')).toBeVisible()
  await expect(page.getByTestId('frame-result-new-best').getByText('New best')).toBeVisible()
  await app.close()
})

test('reduced motion: no star pop, no burst rays, no pulsing slot', async () => {
  const { app, page } = await open(true)
  await expect(page.getByTestId('star-burst-rays')).toHaveCount(0)
  expect(await page.locator('svg.animate-star-pop').count()).toBe(0)
  const pulsing = await page.evaluate(
    () =>
      [...document.querySelectorAll('[data-state="filled-pulse"]')].filter(
        (e) => getComputedStyle(e).animationName !== 'none',
      ).length,
  )
  expect(pulsing).toBe(0)
  await app.close()
})
