import { audioFixtures } from './support/audio'
import type { EngclawApi } from '@engclaw/ipc-contract'
import { expect, test } from '@playwright/test'
import { launchApp } from './support/launch'
import { chooseLearningLanguage, expectLearningLanguage } from './support/learning-language'
import { callLog, scored, stubSpeech } from './support/speech-stubs'
import { stubPlayer, VIDEO } from './support/shadowing'

// Real persisted settings and bundled dictionary; no speech-model downloads or YouTube access.
test('learning language changes dictionary and practice, and survives a relaunch', async () => {
  const first = await launchApp()
  const { page, app, userData } = first
  try {
    const uiLanguage = await page.evaluate(() =>
      (window as unknown as { engclaw: EngclawApi }).engclaw.settings.getLanguage(),
    )
    await chooseLearningLanguage(page, 'zh')
    await expectLearningLanguage(page, 'zh')
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
    await expectLearningLanguage(second.page, 'zh')
    await chooseLearningLanguage(second.page, 'en')
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

test('Mandarin pinyin practice plays samples and scores microphone audio', async () => {
  const { page, app } = await launchApp({ audio: 'speech' })
  try {
    await chooseLearningLanguage(page, 'zh')
    await page.getByTestId('nav-practice').click()
    await page.getByTestId('practice-mode-sentence').click()
    await page.getByTestId('practice-text').fill('miàntiáo')
    const guide = page.getByTestId('mandarin-guide')
    await page.getByTestId('practice-text').fill('yong')
    await expect(guide).toContainText('“i-ung”')
    await page.getByTestId('practice-text').fill('miàntiáo')
    await expect(guide).toContainText('miàn')
    await expect(guide).toContainText('tiáo')
    const vietnamesePhrase = guide.getByTestId('mandarin-vietnamese-phrase')
    await expect(vietnamesePhrase).toHaveText('“miền” → “thi-ao”')
    await expect(guide.getByTestId('mandarin-reference-text')).toContainText('miàn tiáo')
    await expect(guide.getByRole('button', { name: /1×/ })).toHaveAttribute('aria-pressed', 'true')
    await page.evaluate(() => {
      const play = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function () {
        this.addEventListener(
          'playing',
          () => {
            document.body.dataset.referencePlayback = `${this.playbackRate}:${this.preservesPitch}`
          },
          { once: true },
        )
        return play.call(this)
      }
    })
    const sample = guide.getByTestId('hear-reference')
    await sample.click()
    await expect(sample).toHaveAttribute('data-playback', 'playing')
    await expect(sample).toHaveAttribute('data-playback', 'idle')
    await guide.getByRole('button', { name: /0[.,]75×/ }).click()
    await sample.click()
    await expect(page.locator('body')).toHaveAttribute('data-reference-playback', '0.75:true')
    await expect(guide.getByTestId('hear-reference-error')).toHaveCount(0)
    await guide.getByRole('button', { name: 'tiáo' }).click()
    await expect(vietnamesePhrase).toHaveText('“miền” → “thi-ao”')
    await expect(guide).toContainText('Đầu lưỡi chạm lợi trên rồi bật hơi rõ')
    const syllable = guide.getByTestId('hear-reference-alternate')
    await syllable.click()
    await expect(syllable).toHaveAttribute('data-playback', 'playing')
    await expect(guide.getByTestId('hear-reference-error')).toHaveCount(0)

    await page.getByTestId('practice-text').fill('yu3yan1, yong')
    await expect(vietnamesePhrase).toHaveText('“i tròn môi” → “iên” | “i-ung”')
    await page.getByTestId('practice-text').fill('yu3yan1')
    await expect(guide.getByTestId('mandarin-reference-text')).toContainText('yǔ yān')
    await sample.click()
    await expect(guide).toContainText(/uses synthesized pinyin|dùng giọng pinyin tổng hợp/)
    await page.getByTestId('practice-text').fill('yu3yan2')
    await expect(guide.getByTestId('mandarin-reference-text')).toContainText('yǔ yán')
    const separated = guide.getByTestId('hear-reference-segmented')
    await separated.click()
    await expect(separated).toHaveAttribute('data-playback', 'playing')
    await expect(guide.getByTestId('hear-reference-error')).toHaveCount(0)
    await page.getByTestId('practice-text').fill('yi2ding4')
    await expect(vietnamesePhrase).toHaveText('“í” → “tìng”')
    await page.getByTestId('practice-text').fill('miàntiáo')

    const result = scored(100)
    await stubSpeech(app, {
      analyze: [
        {
          reply: {
            ...result,
            value: {
              ...result.value,
              language: 'zh',
              assessment: 'syllable-accuracy',
              transcribe: '面条',
            },
          },
        },
      ],
    })
    await page.getByTestId('practice-record').click()
    await expect(page.getByTestId('practice-stop')).toBeVisible()
    await expect(sample).toBeDisabled()
    await expect(page.getByTestId('recorder-timer')).not.toHaveText('0:00')
    await page.getByTestId('practice-stop').click()
    const assessment = page.getByTestId('mandarin-result')
    await expect(assessment.getByTestId('result-score')).toHaveText('100')
    await expect(assessment).toContainText('面条')
    await expect(guide).toBeVisible()
    await assessment.getByRole('button', { name: /Edit text|Sửa nội dung/ }).click()
    await expect(page.getByTestId('practice-text')).toHaveValue('miàntiáo')
  } finally {
    await app.close()
  }
})

test('Mandarin standalone j animates the tongue and records the example syllable', async () => {
  const { app, page } = await launchApp({ audio: 'speech' })
  try {
    await chooseLearningLanguage(page, 'zh')
    await page.getByTestId('nav-practice').click()
    await page.getByTestId('practice-mode-sentence').click()
    await page.getByTestId('practice-text').fill('j')
    const guide = page.getByTestId('mandarin-initial-guide')
    await expect(guide).toContainText('jī (鸡)')
    await expect(guide).toContainText('Đặt đầu lưỡi sát mặt trong răng dưới')
    await expect(guide.getByTestId('articulation-profile')).toBeVisible()
    await guide.getByRole('button', { name: /Replay mouth movement|Xem lại chuyển động/ }).click()
    await expect(guide.getByTestId('tongue')).toHaveAttribute('data-phone', 'tɕ')
    await expect(guide.getByTestId('articulation-airflow')).toBeVisible()
    await guide.getByTestId('hear-reference').click()
    await expect(guide.getByTestId('hear-reference')).toHaveAttribute('data-playback', 'playing')

    const result = scored(100)
    await stubSpeech(app, {
      analyze: [
        {
          reply: {
            ...result,
            value: {
              ...result.value,
              language: 'zh',
              assessment: 'syllable-accuracy',
              transcribe: '鸡',
            },
          },
        },
      ],
    })
    await page.getByTestId('practice-record').click()
    await expect(page.getByTestId('recorder-timer')).not.toHaveText('0:00')
    await page.getByTestId('practice-stop').click()
    await expect(page.getByTestId('mandarin-result')).toContainText('jī')
    expect((await callLog(app)).analyze[0]?.text).toBe('jī')
  } finally {
    await app.close()
  }
})

test('Mandarin standalone iang gives guidance and plays its sample', async () => {
  const { app, page } = await launchApp()
  try {
    await chooseLearningLanguage(page, 'zh')
    await page.getByTestId('nav-practice').click()
    await page.getByTestId('practice-mode-sentence').click()
    await page.getByTestId('practice-text').fill('iang')
    const guide = page.getByTestId('mandarin-final-guide')
    await expect(guide).toContainText('“i-ang”')
    await expect(guide).toContainText('yāng (央)')
    await expect(guide.getByTestId('articulation-profile')).toBeVisible()
    const hear = guide.getByTestId('hear-reference')
    await hear.click()
    await expect(hear).toHaveAttribute('data-playback', 'playing')
    await expect(guide.getByTestId('hear-reference-error')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('English read-aloud shows IPA, Vietnamese sound tips and a linking example', async () => {
  const { page, app } = await launchApp()
  try {
    await page.getByTestId('nav-practice').click()
    await page.getByTestId('practice-mode-sentence').click()
    await page.getByTestId('practice-text').fill('Hold on')
    const guide = page.getByTestId('english-guide')
    await expect(guide).toContainText('Nghe gần giống tiếng Việt')
    await expect(guide).toContainText('Đọc liền hold → on')
    await expect(guide.getByTestId('hear-reference')).toBeEnabled()
    await guide.getByRole('button', { name: 'on', exact: true }).click()
    await expect(guide.getByTestId('hear-reference-alternate')).toHaveText(/on/)
    await guide.getByRole('button', { name: /1×/ }).click()
    await expect(guide.getByRole('button', { name: /1×/ })).toHaveAttribute('aria-pressed', 'true')
  } finally {
    await app.close()
  }
})

test('English phrase playback continues when per-word samples become available', async () => {
  const { app, page } = await launchApp()
  try {
    await stubSpeech(app, { tts: [{ reply: { ok: true, seconds: 4 } }] })
    await app.evaluate(({ ipcMain }) => {
      type TestMain = typeof globalThis & { releasePronunciation?: () => void }
      const pronunciationReady = new Promise<void>((resolve) => {
        ;(globalThis as TestMain).releasePronunciation = resolve
      })
      ipcMain.removeHandler('inference:phonemize')
      ipcMain.handle('inference:phonemize', async () => {
        await pronunciationReady
        return {
          ok: true,
          value: { language: 'en', words: [{ word: 'hold', phones: ['h', 'oʊ', 'l', 'd'] }] },
        }
      })
    })
    await page.getByTestId('nav-practice').click()
    await page.getByTestId('practice-mode-sentence').click()
    await page.getByTestId('practice-text').fill('Hold on')
    const guide = page.getByTestId('english-guide')
    const phrase = guide.getByTestId('hear-reference')
    const word = guide.getByTestId('hear-reference-alternate')
    await phrase.click()
    await expect(phrase).toHaveAttribute('data-playback', 'playing')
    await expect(word).toHaveCount(0)
    await app.evaluate(() => {
      const main = globalThis as typeof globalThis & { releasePronunciation?: () => void }
      main.releasePronunciation?.()
    })
    await expect(word).toBeVisible()
    await expect(phrase).toHaveAttribute('data-playback', 'playing')
  } finally {
    await app.close()
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
      await chooseLearningLanguage(page, 'zh')
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
      await chooseLearningLanguage(page, 'en')
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
    await chooseLearningLanguage(page, 'zh')
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
    await expectLearningLanguage(page, 'en')
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('app:updateSettings')
      ipcMain.handle('app:updateSettings', () => {
        throw new Error('test: settings unavailable')
      })
    })
    await chooseLearningLanguage(page, 'zh')
    await expect(page.getByRole('alert')).toContainText('Could not save')
    await expectLearningLanguage(page, 'en')
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
    await chooseLearningLanguage(page, 'zh')
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
