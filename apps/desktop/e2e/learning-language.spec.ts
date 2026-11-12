import { audioFixtures } from './support/audio'
import type { EngclawApi } from '@engclaw/ipc-contract'
import { expect, test } from '@playwright/test'
import { launchApp } from './support/launch'
import { stubPlayer, VIDEO } from './support/shadowing'

// Real persisted settings and bundled dictionary; no speech-model downloads or YouTube access.
test('learning language changes dictionary and practice, and survives a relaunch', async () => {
  const first = await launchApp()
  const { page, app, userData } = first
  try {
    const uiLanguage = await page.evaluate(() =>
      (window as unknown as { engclaw: EngclawApi }).engclaw.settings.getLanguage(),
    )
    await page.getByTestId('learning-language').selectOption('zh')
    await expect(page.getByTestId('learning-language')).toHaveValue('zh')
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            (await (window as unknown as { engclaw: EngclawApi }).engclaw.app.getSettings())
              .learningLanguage,
        ),
      )
      .toBe('zh')
    expect(
      await page.evaluate(() =>
        (window as unknown as { engclaw: EngclawApi }).engclaw.settings.getLanguage(),
      ),
    ).toBe(uiLanguage)
    await page.getByTestId('nav-dictionary').click()
    await page.getByTestId('dictionary-search').fill('ni hao')
    await page.getByTestId('dictionary-search').press('ArrowDown')
    const option = page
      .getByTestId('dictionary-results')
      .getByRole('option', { name: '你好', exact: true })
    await expect(option.first()).toBeVisible()
    await option.first().click()
    await expect(page.getByTestId('word-pinyin')).toHaveText('nǐ hǎo')
    await expect(page.getByTestId('word-page')).toContainText('hello')
    await expect(page.getByTestId('dictionary-tab-roots')).toHaveCount(0)
    await page.getByTestId('send-practice').click()
    await expect(page.getByTestId('practice-card')).toBeVisible()
    await expect(page.locator('textarea').first()).toHaveValue('你好')
    const models = await page.evaluate(() =>
      (window as unknown as { engclaw: EngclawApi }).engclaw.inference.analyze({
        requestId: 'zh-no-models',
        text: '你好',
        audio: new Float32Array(16000),
        language: 'zh',
      }),
    )
    expect(models).toMatchObject({ ok: false, code: 'MODEL_MISSING', modelId: 'asr-zh' })
    const readings = await page.evaluate(() =>
      (window as unknown as { engclaw: EngclawApi }).engclaw.inference.phonemize({
        text: '你好',
        language: 'zh',
      }),
    )
    expect(readings).toMatchObject({
      ok: true,
      value: {
        language: 'zh',
        words: [
          { word: '你', phones: ['nǐ'] },
          { word: '好', phones: ['hǎo'] },
        ],
      },
    })
  } finally {
    await app.close()
  }

  const second = await launchApp({ userData })
  try {
    await expect(second.page.getByTestId('learning-language')).toHaveValue('zh')
    await second.page.getByTestId('learning-language').selectOption('en')
    await second.page.getByTestId('nav-dictionary').click()
    await second.page.getByTestId('dictionary-search').fill('accel')
    const result = second.page
      .getByTestId('dictionary-results')
      .getByRole('option', { name: 'accelerate', exact: true })
    await expect(result).toBeVisible()
    await result.click()
    await expect(second.page.getByTestId('word-ipa').first()).toBeVisible()
  } finally {
    await second.app.close()
  }
})

for (const captionLanguage of ['zh-CN', 'zh-Hant', 'zh-TW']) {
  test(`Mandarin shadowing supports ${captionLanguage} lookup and pinyin, then clears on language change`, async () => {
    const { app, page } = await launchApp()
    try {
      await stubPlayer(app)
      await app.evaluate(
        ({ ipcMain }, { videoId, captionLanguage }) => {
          ipcMain.removeHandler('youtube:meta')
          ipcMain.handle('youtube:meta', () => ({
            ok: true,
            value: {
              videoId,
              title: '中文练习',
              durationSec: 60,
              captionTracks: [
                { lang: 'en', auto: false },
                { lang: captionLanguage, auto: false },
              ],
            },
          }))
          ipcMain.removeHandler('youtube:transcript')
          ipcMain.handle('youtube:transcript', (_event, { lang }) => ({
            ok: true,
            value: [
              {
                start: 0,
                dur: 6,
                text: lang === captionLanguage ? '學習中文。你好！' : 'Hello. Welcome!',
              },
            ],
          }))
        },
        { videoId: VIDEO, captionLanguage },
      )
      await page.getByTestId('learning-language').selectOption('zh')
      await page.getByTestId('nav-shadowing').click()
      await page.getByTestId('shadowing-url').fill(VIDEO)
      await page.getByTestId('shadowing-load').click()
      await expect(page.getByTestId('shadowing-session')).toBeVisible()
      await expect(page.getByTestId('shadowing-sentence')).toContainText('學習中文。')
      await page.getByTestId('shadowing-sentence').locator('[data-word="學習"]').click()
      const dialog = page.getByTestId('dictionary-dialog')
      await expect(dialog.getByTestId('word-pinyin')).toHaveText('xué xí')
      await expect(
        dialog.getByTestId('word-page').getByRole('heading', { name: '学习', exact: true }),
      ).toBeVisible()
      await dialog.getByRole('button', { name: 'Close', exact: true }).click()
      await page.getByTestId('shadowing-ipa-toggle').click()
      await expect(page.getByTestId('shadowing-sentence')).toContainText('xué')
      const readings = page.getByTestId('shadowing-word-ipa')
      await expect(readings.first()).toHaveAttribute('lang', 'zh-Latn-pinyin')
      await expect(readings.first()).toHaveText('xué')
      const railReadings = page.locator('[data-testid="shadowing-session"] [lang="zh-Latn-pinyin"]')
      for (const reading of await railReadings.allTextContents()) expect(reading).not.toContain('/')
      await page.getByTestId('learning-language').selectOption('en')
      await expect(page.getByTestId('shadowing-entry')).toBeVisible()
      await page.getByTestId('shadowing-url').fill(VIDEO)
      await page.getByTestId('shadowing-load').click()
      await expect(page.getByTestId('shadowing-sentence')).toContainText('Hello.')
    } finally {
      await app.close()
    }
  })
}

test('Mandarin practice asks for only the Mandarin model before downloading', async () => {
  const { app, page } = await launchApp()
  try {
    await page.getByTestId('learning-language').selectOption('zh')
    await page.getByTestId('nav-practice').click()
    await page.getByTestId('practice-text').fill('你好')
    await expect(page.getByTestId('practice-example').first()).toContainText('你好')
    await page.getByTestId('practice-upload').setInputFiles(audioFixtures().speech)
    await page.getByTestId('practice-analyze').click()
    await expect(page.getByTestId('model-download-dialog')).toBeVisible()
    await expect(page.getByTestId('model-download-row-asr-zh')).toBeVisible()
    await expect(page.getByTestId('model-download-row-asr-en')).toHaveCount(0)
    await expect(page.getByTestId('model-download-row-phone')).toHaveCount(0)
    await expect(page.getByTestId('model-download-row-tts-ref')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('a failed preference save keeps the current language and shows an error', async () => {
  const { app, page } = await launchApp()
  try {
    await expect(page.getByTestId('learning-language')).toHaveValue('en')
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('app:updateSettings')
      ipcMain.handle('app:updateSettings', () => {
        throw new Error('test: settings unavailable')
      })
    })
    await page.getByTestId('learning-language').selectOption('zh')
    await expect(page.getByRole('alert')).toContainText('Could not save')
    await expect(page.getByTestId('learning-language')).toHaveValue('en')
    await expect(page.getByTestId('learning-language')).toBeEnabled()
  } finally {
    await app.close()
  }
})

test('a video without CC can generate and reopen a cached Mandarin transcript', async () => {
  const { app, page } = await launchApp()
  try {
    await stubPlayer(app)
    await app.evaluate(
      ({ app: electronApp, ipcMain }, seed) => {
        const { createRequire } = process.getBuiltinModule('node:module')
        const Database = createRequire(`${electronApp.getAppPath()}/package.json`)('better-sqlite3')
        const db = new Database(`${electronApp.getPath('userData')}/engclaw.db`)
        db.prepare(
          'INSERT INTO videos (video_id, title, duration_sec, caption_tracks, fetched_at, last_opened_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(seed.video, 'Chinese video without CC', 45, '[]', 1, 1)
        db.close()
        const bytes = new Uint8Array(process.getBuiltinModule('node:fs').readFileSync(seed.audio))
        ipcMain.removeHandler('youtube:audioRange')
        ipcMain.handle('youtube:audioRange', (_event, { start }) => ({
          ok: true,
          value: { bytes, mime: 'audio/wav', offsetSec: start },
        }))
        ipcMain.removeHandler('models:list')
        ipcMain.handle('models:list', () => [
          {
            id: 'asr-zh',
            name: 'Mandarin',
            license: 'Apache-2.0',
            revision: 'test',
            sizeBytes: 1,
            state: 'ready',
            installedRevision: 'test',
            updateAvailable: false,
            path: '/test',
          },
        ])
        ipcMain.removeHandler('inference:transcribe')
        ipcMain.handle('inference:transcribe', (_event, { language }) => ({
          ok: true,
          value: { text: '你好，欢迎学习中文。', language },
        }))
      },
      { video: VIDEO, audio: audioFixtures().speech },
    )
    await page.getByTestId('learning-language').selectOption('zh')
    await page.getByTestId('nav-shadowing').click()
    await page.getByTestId('shadowing-url').fill(VIDEO)
    await page.getByTestId('shadowing-load').click()
    await expect(page.getByTestId('shadowing-generate')).toBeVisible()
    await page.getByTestId('shadowing-generate').click()
    await expect(page.getByTestId('generated-transcript-note')).toBeVisible()
    await expect(page.getByTestId('shadowing-sentence')).toContainText('你好')
    const saved = await page.evaluate(
      (videoId) =>
        (window as unknown as { engclaw: EngclawApi }).engclaw.youtube.transcript({
          videoId,
          lang: 'zh-x-engclaw-asr',
        }),
      VIDEO,
    )
    expect(saved.ok && saved.value.length).toBe(3)
    await page.reload()
    await page.getByTestId('shadowing-url').fill(VIDEO)
    await page.getByTestId('shadowing-load').click()
    await expect(page.getByTestId('generated-transcript-note')).toBeVisible()
    await expect(page.getByTestId('shadowing-sentence')).toContainText('你好')
    await expect(page.getByTestId('shadowing-generate')).toHaveCount(0)
  } finally {
    await app.close()
  }
})
