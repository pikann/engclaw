import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const launch = () =>
  electron.launch({
    args: [
      join(__dirname, '..'),
      `--user-data-dir=${mkdtempSync(join(tmpdir(), 'engclaw-e2e-'))}`,
      ...(process.env['CI'] ? ['--no-sandbox'] : []),
    ],
  })

test('an invalid link shows the inline error, keeps the text and clears on edit', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await page.getByTestId('nav-shadowing').click()
  await expect(page.getByTestId('shadowing-entry')).toBeVisible()
  await expect(page.getByTestId('shadowing-error')).toHaveCount(0)

  const field = page.getByTestId('shadowing-url')
  await field.fill('https://example.com/not-youtube')
  await page.getByTestId('shadowing-load').click()

  const banner = page.getByTestId('shadowing-error')
  await expect(banner).toBeVisible()
  await expect(banner).toHaveAttribute('data-error', 'invalid')
  await expect(banner).toContainText("That doesn't look like a YouTube link.")
  await expect(banner.getByRole('button')).toHaveCount(0)
  await expect(field).toHaveValue('https://example.com/not-youtube')
  await expect(field).toHaveAttribute('aria-invalid', 'true')

  await field.press('End')
  await field.pressSequentially('x')
  await expect(banner).toHaveCount(0)
  await app.close()
})

test('an empty submit is also reported as an invalid link, and Enter submits', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await page.getByTestId('nav-shadowing').click()
  await page.getByTestId('shadowing-url').press('Enter')
  await expect(page.getByTestId('shadowing-error')).toHaveAttribute('data-error', 'invalid')
  await app.close()
})

test('the invalid-link message is localized (vi)', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await page.getByTestId('nav-settings').click()
  await page.getByTestId('language-switcher').click()
  await page.getByTestId('language-vi').click()
  await page.getByTestId('nav-shadowing').click()
  await page.getByTestId('shadowing-url').fill('nope')
  await page.getByTestId('shadowing-load').click()
  await expect(page.getByTestId('shadowing-error')).toContainText(
    'Đây không giống một liên kết YouTube.',
  )
  await app.close()
})

test('with no videos opened yet the recent list is empty', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await page.getByTestId('nav-shadowing').click()
  await expect(page.getByTestId('shadowing-recent')).toHaveCount(0)
  await expect(page.getByText('Videos you practise with will appear here.')).toBeVisible()
  await app.close()
})
