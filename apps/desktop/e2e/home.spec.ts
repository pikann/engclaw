import { _electron as electron, expect, test } from '@playwright/test'
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

test('a clean profile shows the first-run Home with a model download prompt', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await expect(page.getByTestId('home')).toBeVisible()
  await expect(page.getByTestId('home-recent-empty')).toBeVisible()
  await expect(page.getByTestId('home-continue-cards')).toHaveCount(0)
  await expect(page.getByTestId('home-models-missing')).toBeVisible()
  await expect(page.getByTestId('home-quick-practice')).toBeVisible()
  await page.getByTestId('home-models-download').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await app.close()
})

test('a saved attempt appears in recent attempts and links back to it in History', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  const saved = await page.evaluate(() =>
    (
      window as unknown as {
        engclaw: { history: { save(r: unknown): Promise<{ id: string }> } }
      }
    ).engclaw.history.save({
      mode: 'sentence',
      text: 'The thorough thought went through.',
      language: 'en',
      score: 84,
      errors: [],
    }),
  )
  await page.getByTestId('nav-history').click()
  await page.getByTestId('nav-home').click()
  const row = page.getByTestId('home-recent-item')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('The thorough thought went through.')
  await expect(row).toContainText('84')
  await row.click()
  await expect(page.getByTestId('nav-history')).toHaveAttribute('aria-current', 'page')
  const item = page.getByTestId('history-item')
  await expect(item).toHaveAttribute('aria-current', 'true')
  expect(saved.id).toBeTruthy()
  await app.close()
})

test('Home fits at 960x600 in vi without horizontal clipping', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(960, 600),
  )
  await page.getByTestId('nav-settings').click()
  await page.getByTestId('language-switcher').click()
  await page.getByTestId('language-vi').click()
  await page.getByTestId('nav-home').click()
  await expect(page.getByTestId('home-models-missing')).toBeVisible()
  const clipped = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(clipped).toBe(false)
  await app.close()
})
