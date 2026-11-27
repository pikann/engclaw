import { expect, test, type Page } from '@playwright/test'
import { breakMic, fixMic } from './support/launch'
import { openCachedSession } from './support/shadowing'
import { analyzed, callLog, fail, scored, SPEECH_RMS } from './support/speech-stubs'

/**
 * Shadowing attempts on a cached video: the learner records a sentence through the fake microphone
 * (sound fixtures), the scripted engine scores it, and the result, errors, best score and history
 * behave across sentences. The video comes from the local cache, so no network is involved.
 */
const record = (page: Page) => page.getByTestId('shadowing-attempt-record')
const phase = (page: Page) => page.getByTestId('shadowing-attempt')

async function attempt(page: Page, ms = 2200) {
  await record(page).click()
  await expect(phase(page)).toHaveAttribute('data-phase', 'recording')
  await page.waitForTimeout(ms)
  await record(page).click()
}

test('a recorded attempt is checked against the shown sentence and scored', async () => {
  const { app, page } = await openCachedSession({
    script: { analyze: [analyzed(86, { flagged: true, transcript: 'hello i am a developer' })] },
  })
  await expect(phase(page)).toHaveAttribute('data-phase', 'idle')
  await attempt(page)
  await expect(phase(page)).toHaveAttribute('data-phase', 'result', { timeout: 20_000 })
  await expect(page.getByTestId('result-clarity')).toContainText(/5 of 5|5\/5/)
  await expect(page.getByTestId('result-score')).toBeHidden()
  await page.getByTestId('result-technical').locator('summary').click()
  await expect(page.getByTestId('shadowing-accuracy-score')).toBeVisible()
  await expect(page.getByTestId('shadowing-detected')).toHaveText('hello i am a developer')
  const phonemes = page.getByTestId('result-phonemes')
  await phonemes.getByTestId('phonemes-reference').click()
  await expect
    .poll(async () => (await callLog(app)).tts.at(-1)?.text)
    .toBe('Hello, I am a developer.')
  const replay = phonemes.getByTestId('phonemes-replay')
  await replay.click()
  await expect(replay).toHaveAttribute('aria-pressed', 'true')
  await expect(phonemes.getByTestId('phonemes-reference')).toBeDisabled()
  await replay.click()
  await expect(replay).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('shadowing-attempt-error')).toHaveCount(0)

  const [call] = (await callLog(app)).analyze
  expect(call!.text).toBe('Hello, I am a developer.')
  expect(call!.rms).toBeGreaterThan(SPEECH_RMS)
  expect(call!.seconds).toBeGreaterThan(2)
  await app.close()
})

test('clicking a scored word replays only that part of the learner recording', async () => {
  const result = scored(86, { flagged: true, transcript: 'Hello I am a designer' })
  result.value.differences.errors[0]!.phones = [{ expected: 'h', heard: '', confidence: 0.9 }]
  const { app, page } = await openCachedSession({
    script: {
      analyze: [
        {
          reply: {
            ...result,
            value: {
              ...result.value,
              word_audio_spans: [[1600, 9600], [10000, 14800], null, null, null],
            },
          },
        },
      ],
    },
  })
  try {
    await attempt(page)
    await expect(phase(page)).toHaveAttribute('data-phase', 'result')
    await page.evaluate(() => {
      const createBuffer = AudioContext.prototype.createBuffer
      AudioContext.prototype.createBuffer = function (channels, length, rate) {
        document.body.dataset.wordClipSamples = String(length)
        return createBuffer.call(this, channels, length, rate)
      }
    })
    const chips = page.getByTestId('result-chips').getByTestId('word-chip')
    const replay = page.getByTestId('word-replay-recording')
    await expect(chips.nth(0)).toHaveAttribute('data-flagged', 'false')
    await expect(chips.nth(4)).toHaveAttribute('data-flagged', 'true')
    await chips.nth(0).click()
    await expect(page.getByTestId('word-recognition')).toHaveText('Heard this word clearly')
    await expect(page.getByTestId('word-unclear-sound')).toBeVisible()
    await replay.click()
    await expect(page.locator('body')).toHaveAttribute('data-word-clip-samples', '8000')

    await expect(chips.nth(1)).toHaveAttribute('data-flagged', 'false')
    await chips.nth(1).click()
    await replay.click()
    await expect(page.locator('body')).toHaveAttribute('data-word-clip-samples', '4800')

    await chips.nth(2).click()
    await expect(replay).toHaveCount(0)
    await expect(page.getByTestId('word-detail')).toContainText('could not be isolated')
  } finally {
    await app.close()
  }
})

test('a selected word can be recorded and scored independently of the sentence', async () => {
  const { app, page } = await openCachedSession({
    script: {
      analyze: [analyzed(86, { flagged: true }), analyzed(92, { transcript: 'hello' })],
    },
  })
  try {
    await attempt(page)
    await expect(phase(page)).toHaveAttribute('data-phase', 'result')
    const sentenceScore = page.getByTestId('result-score')
    await expect(sentenceScore).toHaveText('86')
    await page.getByTestId('result-chips').getByTestId('word-chip').first().click()
    const wordRecord = page.getByTestId('shadowing-word-record')
    await wordRecord.click()
    await expect(wordRecord).toHaveText(/Stop and check|Dừng và chấm/)
    await page.waitForTimeout(800)
    await wordRecord.click()
    await expect(page.getByTestId('shadowing-word-recognition')).toHaveText(
      'Heard this word clearly',
    )
    await expect(page.getByTestId('shadowing-word-score')).toBeHidden()
    await page.getByTestId('shadowing-word-practice').locator('summary').click()
    await expect(page.getByTestId('shadowing-word-score')).toContainText('92 / 100')
    await expect(sentenceScore).toHaveText('86')
    await page.getByTestId('shadowing-word-replay').click()
    await expect(page.getByTestId('shadowing-word-replay')).toHaveText(
      /Stop word playback|Dừng phát đoạn thu/,
    )
    expect((await callLog(app)).analyze.map((call) => call.text)).toEqual([
      'Hello, I am a developer.',
      'hello',
    ])
  } finally {
    await app.close()
  }
})

test('each sentence keeps its own result when you move between sentences', async () => {
  const { app, page } = await openCachedSession({
    script: { analyze: [analyzed(72), analyzed(91)] },
  })
  await attempt(page)
  await expect(phase(page)).toHaveAttribute('data-phase', 'result', { timeout: 20_000 })

  await page.getByTestId('shadowing-next').click()
  await expect(phase(page)).toHaveAttribute('data-phase', 'idle')
  await attempt(page)
  await expect(phase(page)).toHaveAttribute('data-phase', 'result', { timeout: 20_000 })

  await page.getByTestId('shadowing-back').click()
  await expect(phase(page)).toHaveAttribute('data-phase', 'result')
  await expect((await callLog(app)).analyze).toHaveLength(2)
  expect((await callLog(app)).analyze.map((c) => c.text)).toEqual([
    'Hello, I am a developer.',
    'What did you build today?',
  ])
  await app.close()
})

test('attempts are saved to History with the video', async () => {
  const { app, page } = await openCachedSession({ script: { analyze: [analyzed(79)] } })
  await attempt(page)
  await expect(phase(page)).toHaveAttribute('data-phase', 'result', { timeout: 20_000 })
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const w = window as unknown as {
          engclaw: {
            history: {
              list(r: object): Promise<{ attempts: { videoId?: string; text: string }[] }>
            }
          }
        }
        return (await w.engclaw.history.list({ limit: 10 })).attempts.map((a) => [
          a.videoId,
          a.text,
        ])
      }),
    )
    .toEqual([['dQw4w9WgXcQ', 'Hello, I am a developer.']])
  await app.close()
})

test('Try again from the result records another take', async () => {
  const { app, page } = await openCachedSession({
    script: { analyze: [analyzed(60), analyzed(94)] },
  })
  await attempt(page)
  await expect(phase(page)).toHaveAttribute('data-phase', 'result', { timeout: 20_000 })
  await page.getByRole('button', { name: 'Try again' }).first().click()
  await expect(phase(page)).toHaveAttribute('data-phase', 'recording')
  await page.waitForTimeout(1500)
  await record(page).click()
  await expect(phase(page)).toHaveAttribute('data-phase', 'result', { timeout: 20_000 })
  expect((await callLog(app)).analyze).toHaveLength(2)
  await app.close()
})

test('a silent take is still analysed; the engine decides what it is worth', async () => {
  const { app, page } = await openCachedSession({
    audio: 'silence',
    script: { analyze: [analyzed(8)] },
  })
  await attempt(page, 1500)
  await expect(phase(page)).toHaveAttribute('data-phase', 'result', { timeout: 20_000 })
  expect((await callLog(app)).analyze[0]!.rms).toBeLessThan(SPEECH_RMS / 10)
  await app.close()
})

test('silence after the sentence ends the recording by itself', async () => {
  const { app, page } = await openCachedSession({
    audio: 'speechThenSilence',
    script: { analyze: [analyzed(88)] },
  })
  await record(page).click()
  await expect(phase(page)).toHaveAttribute('data-phase', 'result', { timeout: 30_000 })
  await app.close()
})

test.describe('errors', () => {
  test('models missing: asks for the download and keeps the take', async () => {
    const { app, page } = await openCachedSession({
      script: { analyze: [{ reply: fail('MODEL_MISSING', 'missing', 'phone') }] },
    })
    await attempt(page, 1500)
    await expect(phase(page)).toHaveAttribute('data-phase', 'error', { timeout: 20_000 })
    await expect(page.getByTestId('shadowing-attempt-error')).toContainText(
      'Download the speech models',
    )
    await expect(page.getByTestId('shadowing-download-models')).toBeVisible()
    await app.close()
  })

  test('analysis failure shows the engine message and Try again re-checks the same take', async () => {
    const { app, page } = await openCachedSession({
      script: { analyze: [{ reply: fail('FAILED', 'wav2vec crashed') }, analyzed(83)] },
    })
    await attempt(page, 1500)
    await expect(page.getByTestId('shadowing-attempt-error')).toContainText(
      'Couldn’t check this attempt.',
      {
        timeout: 20_000,
      },
    )
    await expect(page.getByTestId('shadowing-attempt-error-detail')).toHaveText('wav2vec crashed')
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(phase(page)).toHaveAttribute('data-phase', 'result', { timeout: 20_000 })
    const calls = (await callLog(app)).analyze
    expect(calls).toHaveLength(2)
    expect(calls[1]!.seconds).toBe(calls[0]!.seconds)
    await app.close()
  })

  test('the engine crashing is reported like any other failure', async () => {
    const { app, page } = await openCachedSession({
      script: { analyze: [{ reply: fail('PROCESS_CRASHED', 'gone') }] },
    })
    await attempt(page, 1500)
    await expect(page.getByTestId('shadowing-attempt-error')).toContainText(
      'Couldn’t check this attempt.',
      {
        timeout: 20_000,
      },
    )
    await app.close()
  })

  test('microphone errors: explained, and the next try works once it is fixed', async () => {
    const { app, page } = await openCachedSession({ script: { analyze: [analyzed(80)] } })
    await breakMic(page, 'NotAllowedError')
    await record(page).click()
    await expect(page.getByTestId('shadowing-attempt-error')).toContainText(
      'Couldn’t use the microphone.',
    )
    expect((await callLog(app)).analyze).toHaveLength(0)
    await fixMic(page)
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(phase(page)).toHaveAttribute('data-phase', 'recording')
    await page.waitForTimeout(1500)
    await record(page).click()
    await expect(phase(page)).toHaveAttribute('data-phase', 'result', { timeout: 20_000 })
    await app.close()
  })
})

test.describe('moving around', () => {
  test('going to another sentence while recording drops that take without analysing it', async () => {
    const { app, page } = await openCachedSession()
    await record(page).click()
    await expect(phase(page)).toHaveAttribute('data-phase', 'recording')
    await page.waitForTimeout(800)
    await page.getByTestId('shadowing-next').click()
    await expect(phase(page)).toHaveAttribute('data-phase', 'idle')
    await page.waitForTimeout(500)
    expect((await callLog(app)).analyze).toHaveLength(0)
    await page.getByTestId('shadowing-back').click()
    await expect(phase(page)).toHaveAttribute('data-phase', 'idle')
    await app.close()
  })

  test('a check that finishes after you moved on still lands on its own sentence', async () => {
    const { app, page } = await openCachedSession({
      script: { analyze: [{ ...analyzed(77), delayMs: 2500 }] },
    })
    await attempt(page, 1500)
    await expect(phase(page)).toHaveAttribute('data-phase', 'analyzing')
    await page.getByTestId('shadowing-next').click()
    await expect(phase(page)).toHaveAttribute('data-phase', 'idle')
    await page.waitForTimeout(3000)
    await expect(phase(page)).toHaveAttribute('data-phase', 'idle')
    await page.getByTestId('shadowing-back').click()
    await expect(phase(page)).toHaveAttribute('data-phase', 'result')
    await app.close()
  })

  test('the record button is disabled while a check is running', async () => {
    const { app, page } = await openCachedSession({
      script: { analyze: [{ ...analyzed(77), delayMs: 2500 }] },
    })
    await attempt(page, 1500)
    await expect(record(page)).toBeDisabled()
    await expect(phase(page)).toHaveAttribute('data-phase', 'result', { timeout: 20_000 })
    await app.close()
  })
})
