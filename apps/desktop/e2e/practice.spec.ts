import { expect, test, type ElectronApplication } from '@playwright/test'
import { electron } from './electron'
import { cpSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Both practice modes on the real app with Chromium's fake audio capture playing a golden WAV
 * (tests/golden/audio). Without installed models the flow must stop at the model gate; with
 * ENGCLAW_E2E_USER_DATA pointing at a userData folder holding the installed models (phone, asr-en,
 * kokoro) the full analysis runs.
 */
const wav = resolve(__dirname, '../../../tests/golden/audio/bundled-developer.wav')
const sentence = 'Hello, I am a developer'
const modelsUserData = process.env['ENGCLAW_E2E_USER_DATA']

async function launch(userData: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [
      join(__dirname, '..'),
      `--user-data-dir=${userData}`,
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-audio-capture=${wav}`,
      ...(process.env['CI'] ? ['--no-sandbox'] : []),
    ],
  })
}

function freshUserData(): string {
  const dir = mkdtempSync(join(tmpdir(), 'engclaw-e2e-'))
  if (modelsUserData) cpSync(modelsUserData, dir, { recursive: true })
  return dir
}

test.describe('Mode 2: practice a sentence', () => {
  test('records from the fake mic, then analyzes (or hits the model gate)', async () => {
    const app = await launch(freshUserData())
    const page = await app.firstWindow()
    await page.getByTestId('nav-practice').click()
    await page.getByTestId('practice-text').fill(sentence)
    await page.getByTestId('practice-record').click()
    await expect(page.getByTestId('practice-stop')).toBeVisible()
    await page.waitForTimeout(2500)
    await page.getByTestId('practice-stop').click()
    await expect(page.getByTestId('practice-mic-error')).toHaveCount(0)

    if (modelsUserData) {
      await expect(page.getByTestId('result-card')).toBeVisible({ timeout: 120_000 })
      const score = Number(await page.getByTestId('result-score').innerText())
      expect(score).toBeGreaterThan(50)
      await expect(page.getByTestId('result-chips')).toBeVisible()
    } else {
      await expect(page.getByTestId('practice-error')).toBeVisible({ timeout: 30_000 })
      await expect(page.getByTestId('result-card')).toHaveCount(0)
    }
    await app.close()
  })
})

test.describe('Mode 1: free speech', () => {
  test('records from the fake mic, then transcribes (or hits the model gate)', async () => {
    const app = await launch(freshUserData())
    const page = await app.firstWindow()
    await page.getByTestId('nav-practice').click()
    await page.getByTestId('practice-mode-free').click()
    await page.getByTestId('practice-record').click()
    await expect(page.getByTestId('practice-stop')).toBeVisible()
    await page.waitForTimeout(2500)
    await page.getByTestId('practice-stop').click()
    await expect(page.getByTestId('practice-mic-error')).toHaveCount(0)

    if (modelsUserData) {
      await expect(page.getByTestId('practice-text')).toHaveValue(/developer/i, {
        timeout: 120_000,
      })
      await page.getByTestId('practice-analyze').click()
      await expect(page.getByTestId('result-card')).toBeVisible({ timeout: 120_000 })
    } else {
      await expect(page.getByTestId('practice-error')).toBeVisible({ timeout: 30_000 })
    }
    await app.close()
  })
})
