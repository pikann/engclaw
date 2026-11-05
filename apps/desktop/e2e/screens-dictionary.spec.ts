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
      window.location.hash = '#/screens/dictionary'
    })
    await expect(page.getByTestId('screens-dictionary')).toBeVisible({ timeout: 1500 })
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
    test(`dictionary screens at 960x600 in ${lang}/${theme}: no serious axe violations, no clipping`, async () => {
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

test('dialog opens from a word, shows the entry and returns focus on Escape', async () => {
  const { app, page } = await open()
  const word = page.getByTestId('live-dictionary').getByRole('button', { name: 'inspect' })
  await word.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('dictionary-dialog')).toBeVisible()
  await expect(page.getByTestId('dictionary-dialog').getByText('/ɪnˈspekt/')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('dictionary-dialog')).toHaveCount(0)
  await expect(word).toBeFocused()
  await app.close()
})

test('image states keep the same slot and no provider disables Ask the agent', async () => {
  const { app, page } = await open()
  const box = async (id: string) =>
    page
      .getByTestId(`frame-dialog-chat-${id}`)
      .locator('[data-testid^="image-slot"] > div')
      .boundingBox()
  const base = await box('image-ready')
  for (const id of ['loading-ready', 'none-ready', 'offline-ready']) {
    const b = await box(id)
    expect([b?.width, b?.height]).toEqual([base?.width, base?.height])
  }
  const np = page.getByTestId('frame-dialog-chat-image-noProvider')
  await expect(np.getByRole('button', { name: 'Ask the agent' })).toBeDisabled()
  await app.close()
})
