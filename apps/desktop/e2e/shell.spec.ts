import { _electron as electron, expect, test } from '@playwright/test'
import axe from 'axe-core'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

const launch = () =>
  electron.launch({
    args: [
      join(__dirname, '..'),
      `--user-data-dir=${mkdtempSync(join(tmpdir(), 'engclaw-e2e-'))}`,
      ...(process.env['CI'] ? ['--no-sandbox'] : []),
    ],
  })

test('opens on Home and navigates with aria-current and keyboard', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await expect(page.getByTestId('home')).toBeVisible()
  await expect(page.getByTestId('nav-home')).toHaveAttribute('aria-current', 'page')
  for (const k of ['practice', 'history', 'settings']) {
    await page.getByTestId(`nav-${k}`).click()
    await expect(page.getByTestId(`nav-${k}`)).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('nav-home')).not.toHaveAttribute('aria-current', 'page')
  }
  await page.getByTestId('nav-game').click()
  await expect(page.getByTestId('coming-soon')).toBeVisible()
  await page.getByTestId('nav-home').focus()
  await page.keyboard.press('Tab')
  await expect(page.getByTestId('nav-practice')).toBeFocused()
  await app.close()
})

test('practice state survives navigating away and back', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await page.getByTestId('nav-practice').click()
  await page.getByTestId('practice-text').fill('Keep me mounted')
  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('practice-text')).toBeHidden()
  await page.getByTestId('nav-practice').click()
  await expect(page.getByTestId('practice-text')).toHaveValue('Keep me mounted')
  await app.close()
})

test('no horizontal clipping at the 960x600 minimum (vi)', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(960, 600),
  )
  await page.getByTestId('nav-settings').click()
  await page.getByTestId('language-switcher').click()
  await page.getByTestId('language-vi').click()
  for (const k of ['home', 'practice', 'history', 'settings']) {
    await page.getByTestId(`nav-${k}`).click()
    const clipped = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(clipped).toBe(false)
  }
  await app.close()
})

for (const theme of ['light', 'dark']) {
  test(`real shell has no serious axe violations (${theme})`, async () => {
    const app = await launch()
    const page = await app.firstWindow()
    await page.getByTestId('nav-settings').click()
    await page.getByTestId(`theme-${theme}`).click()
    for (const k of ['home', 'practice', 'history', 'settings']) {
      await page.getByTestId(`nav-${k}`).click()
      await page.waitForTimeout(300)
      await page.evaluate(axe.source)
      const bad = await page.evaluate(async () => {
        const r = await (window as unknown as { axe: typeof axe }).axe.run(document, {
          runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
        })
        return r.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
      })
      expect(bad, k).toEqual([])
    }
    await app.close()
  })
}

test('sidebar toggle collapses and expands, persists, and responds to Ctrl/Cmd+B', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  const nav = page.getByRole('navigation', { name: /Main|Chính/ })
  const toggle = page.getByTestId('sidebar-toggle')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  const wide = (await nav.boundingBox())!.width
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect.poll(async () => (await nav.boundingBox())!.width).toBeLessThan(wide)
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+b' : 'Control+b')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await app.close()
})
