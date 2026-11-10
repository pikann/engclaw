import { expect, test, type Page } from '@playwright/test'
import { breakMic, fixMic } from './support/launch'
import { openCachedSession } from './support/shadowing'
import { analyzed, callLog, fail, SPEECH_RMS } from './support/speech-stubs'

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
  await expect(page.getByTestId('shadowing-accuracy-score')).toBeVisible()
  await expect(page.getByTestId('shadowing-detected')).toHaveText('hello i am a developer')
  await expect(page.getByTestId('shadowing-attempt-error')).toHaveCount(0)

  const [call] = (await callLog(app)).analyze
  expect(call!.text).toBe('Hello, I am a developer.')
  expect(call!.rms).toBeGreaterThan(SPEECH_RMS)
  expect(call!.seconds).toBeGreaterThan(2)
  await app.close()
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
