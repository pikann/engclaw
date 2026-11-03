import { _electron as electron, expect, test } from '@playwright/test'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

test('app launches and IPC round-trips', async () => {
  const app = await electron.launch({
    args: [join(__dirname, '..'), ...(process.env['CI'] ? ['--no-sandbox'] : [])],
  })
  const page = await app.firstWindow()
  await page.getByTestId('ping').click()
  await expect(page.getByTestId('reply')).toHaveText(`hello@${process.platform}`)
  await app.close()
})

test('language switches live and persists across restarts', async () => {
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
  await expect(page.getByTestId('title')).toHaveText('Hello from Engclaw')
  await page.getByTestId('language-switcher').click()
  await page.getByTestId('language-vi').click()
  await expect(page.getByTestId('title')).toHaveText('Xin chào từ Engclaw')
  await first.close()

  const second = await launch()
  page = await second.firstWindow()
  await expect(page.getByTestId('title')).toHaveText('Xin chào từ Engclaw')
  await second.close()
})
