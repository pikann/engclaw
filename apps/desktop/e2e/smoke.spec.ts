import { _electron as electron, expect, test } from '@playwright/test'
import { join } from 'node:path'

test('app launches and IPC round-trips', async () => {
  const app = await electron.launch({
    args: [join(__dirname, '..'), ...(process.env['CI'] ? ['--no-sandbox'] : [])],
  })
  const page = await app.firstWindow()
  await page.getByTestId('ping').click()
  await expect(page.getByTestId('reply')).toHaveText(`hello@${process.platform}`)
  await app.close()
})
