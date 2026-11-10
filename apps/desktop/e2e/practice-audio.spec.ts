import { expect, test, type Page } from '@playwright/test'
import { audioFixtures, type AudioFixture } from './support/audio'
import { breakMic, fixMic, launchApp } from './support/launch'
import {
  analyzed,
  callLog,
  fail,
  heard,
  SPEECH_RMS,
  stubSpeech,
  type SpeechScript,
} from './support/speech-stubs'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Practice (Read aloud and Speak freely) driven by sound fixtures played through Chromium's fake
 * microphone, with the speech engine scripted (support/speech-stubs.ts). Covers each result the
 * engine can return, bad and silent recordings, file import, microphone failures and the review step.
 */
const SENTENCE = 'Hello, I am a developer'

async function start(audio: AudioFixture = 'speech', script: SpeechScript = {}) {
  const { app, page } = await launchApp({ audio })
  await stubSpeech(app, script)
  await page.getByTestId('nav-practice').click()
  return { app, page }
}

async function readAloud(page: Page, text = SENTENCE) {
  await page.getByTestId('practice-mode-sentence').click()
  await page.getByTestId('practice-text').fill(text)
}
async function record(page: Page, ms = 2500) {
  await page.getByTestId('practice-record').click()
  await expect(page.getByTestId('practice-stop')).toBeVisible()
  await page.waitForTimeout(ms)
  await page.getByTestId('practice-stop').click()
}

test.describe('Read aloud', () => {
  test('a spoken take is analysed against the typed sentence and scored', async () => {
    const { app, page } = await start('speech', { analyze: [analyzed(88, { flagged: true })] })
    await readAloud(page)
    await record(page)

    await expect(page.getByTestId('result-card')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('result-score')).toHaveText('88')
    await expect(page.getByTestId('result-chips')).toBeVisible()
    await expect(page.getByTestId('word-detail')).toBeVisible()
    await expect(page.getByTestId('result-saved')).toBeVisible()
    await expect(page.getByTestId('practice-error')).toHaveCount(0)

    const [call] = (await callLog(app)).analyze
    expect(call!.text).toBe(SENTENCE)
    expect(call!.seconds).toBeGreaterThan(2)
    expect(call!.rms).toBeGreaterThan(SPEECH_RMS)
    // The take is saved to history.
    await page.getByTestId('nav-history').click()
    await expect(page.getByText(SENTENCE).first()).toBeVisible()
    await app.close()
  })

  test('Try again records a new take and replaces the result', async () => {
    const { app, page } = await start('speech', { analyze: [analyzed(60), analyzed(95)] })
    await readAloud(page)
    await record(page)
    await expect(page.getByTestId('result-score')).toHaveText('60', { timeout: 20_000 })
    await page.getByTestId('result-try-again').click()
    await expect(page.getByTestId('practice-stop')).toBeVisible()
    await page.waitForTimeout(1500)
    await page.getByTestId('practice-stop').click()
    await expect(page.getByTestId('result-score')).toHaveText('95', { timeout: 20_000 })
    expect((await callLog(app)).analyze).toHaveLength(2)
    await app.close()
  })

  test('without a sentence the recorder asks for one and nothing is recorded', async () => {
    const { app, page } = await start()
    await readAloud(page, '')
    await page.getByTestId('practice-record').click()
    await expect(page.getByTestId('practice-hint')).toBeVisible()
    await expect(page.getByTestId('practice-stop')).toHaveCount(0)
    expect((await callLog(app)).analyze).toHaveLength(0)
    await app.close()
  })

  test('a take of pure silence is still sent for analysis and its poor result is shown', async () => {
    const { app, page } = await start('silence', { analyze: [analyzed(12)] })
    await readAloud(page)
    await record(page, 1500)
    await expect(page.getByTestId('result-score')).toHaveText('12', { timeout: 20_000 })
    const [call] = (await callLog(app)).analyze
    expect(call!.rms).toBeLessThan(SPEECH_RMS / 10)
    await app.close()
  })

  test('background noise is delivered to the engine as loud, non-speech audio', async () => {
    const { app, page } = await start('tone', { analyze: [analyzed(5)] })
    await readAloud(page)
    await record(page, 1500)
    await expect(page.getByTestId('result-score')).toHaveText('5', { timeout: 20_000 })
    expect((await callLog(app)).analyze[0]!.rms).toBeGreaterThan(0.1)
    await app.close()
  })

  test('silence after the sentence ends the recording by itself', async () => {
    const { app, page } = await start('speechThenSilence')
    await readAloud(page)
    await page.getByTestId('practice-record').click()
    await expect(page.getByTestId('result-card')).toBeVisible({ timeout: 30_000 })
    const [call] = (await callLog(app)).analyze
    expect(call!.seconds).toBeLessThan(8)
    await app.close()
  })

  test('Cancel while analysing goes back to the review step and tells the engine to stop', async () => {
    const { app, page } = await start('speech', { analyze: [{ ...analyzed(90), delayMs: 5000 }] })
    await readAloud(page)
    await record(page, 1500)
    await expect(page.getByTestId('practice-loading')).toBeVisible()
    await page.getByTestId('practice-loading').getByRole('button').click()
    await expect(page.getByTestId('practice-loading')).toHaveCount(0)
    await expect(page.getByTestId('practice-card')).toHaveAttribute('data-stage', 'review')
    await expect(page.getByTestId('practice-analyze')).toBeEnabled()
    await expect(page.getByTestId('practice-error')).toHaveCount(0)
    expect((await callLog(app)).cancel).toHaveLength(1)
    await page.waitForTimeout(5500) // the late answer must not appear
    await expect(page.getByTestId('result-card')).toHaveCount(0)
    await app.close()
  })

  test('a whole recording can be replayed from the result', async () => {
    const { app, page } = await start()
    await readAloud(page)
    await record(page)
    await expect(page.getByTestId('result-card')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('result-replay').click()
    await expect(page.getByTestId('practice-error')).toHaveCount(0)
    await app.close()
  })
})

test.describe('analysis failures', () => {
  test('models missing: explains, offers the download, and does not claim a result', async () => {
    const { app, page } = await start('speech', {
      analyze: [{ reply: fail('MODEL_MISSING', 'phone model', 'phone') }],
    })
    await readAloud(page)
    await record(page, 1500)
    const error = page.getByTestId('practice-error')
    await expect(error).toContainText('models are not downloaded', { timeout: 20_000 })
    await expect(page.getByTestId('practice-download-models')).toBeVisible()
    await expect(page.getByTestId('practice-retry')).toHaveCount(0)
    await expect(page.getByTestId('result-card')).toHaveCount(0)
    await expect(page.getByRole('dialog')).toBeVisible()
    await app.close()
  })

  test('FAILED: says so, keeps the audio, and Retry analyses the same take', async () => {
    const { app, page } = await start('speech', {
      analyze: [{ reply: fail('FAILED') }, analyzed(77)],
    })
    await readAloud(page)
    await record(page, 1500)
    await expect(page.getByTestId('practice-error')).toContainText('The analysis failed')
    await expect(page.getByTestId('practice-error')).toContainText('kept')
    await page.getByTestId('practice-retry').click()
    await expect(page.getByTestId('result-score')).toHaveText('77', { timeout: 20_000 })
    const calls = (await callLog(app)).analyze
    expect(calls).toHaveLength(2)
    expect(calls[1]!.seconds).toBe(calls[0]!.seconds) // same take, not a new recording
    await expect(page.getByTestId('practice-error')).toHaveCount(0)
    await app.close()
  })

  test('a recording over the length limit gets its own message', async () => {
    const { app, page } = await start('speech', { analyze: [{ reply: fail('CLIP_TOO_LONG') }] })
    await readAloud(page)
    await record(page, 1500)
    await expect(page.getByTestId('practice-error')).toContainText('longer than 15 minutes', {
      timeout: 20_000,
    })
    await app.close()
  })

  test('the engine crashing shows its message and can be retried', async () => {
    const { app, page } = await start('speech', {
      analyze: [{ reply: fail('PROCESS_CRASHED', 'out of memory') }, analyzed(80)],
    })
    await readAloud(page)
    await record(page, 1500)
    await expect(page.getByTestId('practice-error')).toContainText('stopped unexpectedly', {
      timeout: 20_000,
    })
    await expect(page.getByTestId('practice-error-detail')).toHaveText('out of memory')
    await page.getByTestId('practice-retry').click()
    await expect(page.getByTestId('result-score')).toHaveText('80', { timeout: 20_000 })
    await app.close()
  })

  test('invalid input from the engine is a generic failure', async () => {
    const { app, page } = await start('speech', { analyze: [{ reply: fail('INVALID_INPUT') }] })
    await readAloud(page)
    await record(page, 1500)
    await expect(page.getByTestId('practice-error')).toContainText('The analysis failed', {
      timeout: 20_000,
    })
    await app.close()
  })
})

test.describe('Speak freely', () => {
  test('the take is transcribed into an editable text, then analysed with the edited text', async () => {
    const { app, page } = await start('speech', {
      transcribe: [heard('hello i am a developper')],
      analyze: [analyzed(81)],
    })
    await page.getByTestId('practice-mode-free').click()
    await record(page)
    await expect(page.getByTestId('practice-text')).toHaveValue('hello i am a developper', {
      timeout: 20_000,
    })
    await expect(page.getByTestId('practice-card')).toHaveAttribute('data-stage', 'review')
    await expect(page.getByTestId('result-card')).toHaveCount(0)

    await page.getByTestId('practice-text').fill('Hello, I am a developer')
    await page.getByTestId('practice-analyze').click()
    await expect(page.getByTestId('result-score')).toHaveText('81', { timeout: 20_000 })

    const log = await callLog(app)
    expect(log.transcribe[0]!.rms).toBeGreaterThan(SPEECH_RMS)
    expect(log.analyze[0]!.text).toBe('Hello, I am a developer')
    // Both calls were given the same recording.
    expect(log.analyze[0]!.seconds).toBe(log.transcribe[0]!.seconds)
    await app.close()
  })

  test('an empty transcript leaves the text blank and Check disabled until something is typed', async () => {
    const { app, page } = await start('silence', { transcribe: [heard('')] })
    await page.getByTestId('practice-mode-free').click()
    await record(page, 1500)
    await expect(page.getByTestId('practice-card')).toHaveAttribute('data-stage', 'review', {
      timeout: 20_000,
    })
    await expect(page.getByTestId('practice-text')).toHaveValue('')
    await expect(page.getByTestId('practice-analyze')).toBeDisabled()
    await page.getByTestId('practice-text').fill('I typed this myself')
    await expect(page.getByTestId('practice-analyze')).toBeEnabled()
    await app.close()
  })

  test('ASR failure shows the error; Retry transcribes the same take', async () => {
    const { app, page } = await start('speech', {
      transcribe: [{ reply: fail('FAILED') }, heard('second time lucky')],
    })
    await page.getByTestId('practice-mode-free').click()
    await record(page, 1500)
    await expect(page.getByTestId('practice-error')).toContainText('The analysis failed', {
      timeout: 20_000,
    })
    await page.getByTestId('practice-retry').click()
    await expect(page.getByTestId('practice-text')).toHaveValue('second time lucky', {
      timeout: 20_000,
    })
    const calls = (await callLog(app)).transcribe
    expect(calls).toHaveLength(2)
    expect(calls[1]!.seconds).toBe(calls[0]!.seconds)
    await app.close()
  })

  test('ASR model missing opens the download prompt', async () => {
    const { app, page } = await start('speech', {
      transcribe: [{ reply: fail('MODEL_MISSING', 'asr', 'asr-en') }],
    })
    await page.getByTestId('practice-mode-free').click()
    await record(page, 1500)
    await expect(page.getByTestId('practice-download-models')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('dialog')).toBeVisible()
    await app.close()
  })

  test('Cancel while transcribing', async () => {
    const { app, page } = await start('speech', {
      transcribe: [{ ...heard('too late'), delayMs: 4000 }],
    })
    await page.getByTestId('practice-mode-free').click()
    await record(page, 1500)
    await page.getByTestId('practice-loading').getByRole('button').click()
    await expect(page.getByTestId('practice-loading')).toHaveCount(0)
    await page.waitForTimeout(4500)
    await expect(page.getByTestId('practice-text')).not.toHaveValue('too late')
    await app.close()
  })

  test('Re-record after a transcript replaces the take and checks it against the kept text', async () => {
    const { app, page } = await start('speech', {
      transcribe: [heard('first take')],
      analyze: [analyzed(70)],
    })
    await page.getByTestId('practice-mode-free').click()
    await record(page, 1500)
    await expect(page.getByTestId('practice-text')).toHaveValue('first take', { timeout: 20_000 })
    await page.getByTestId('practice-rerecord').click()
    await expect(page.getByTestId('practice-stop')).toBeVisible()
    await expect(page.getByTestId('practice-card')).toHaveAttribute('data-stage', 'record')
    await page.waitForTimeout(1500)
    await page.getByTestId('practice-stop').click()
    // Same flow as "Try again": the new take is analysed against the transcript already on screen.
    await expect(page.getByTestId('result-score')).toHaveText('70', { timeout: 20_000 })
    const log = await callLog(app)
    expect(log.transcribe).toHaveLength(1)
    expect(log.analyze).toHaveLength(1)
    expect(log.analyze[0]!.text).toBe('first take')
    await app.close()
  })

  test('the review step can play the take back', async () => {
    const { app, page } = await start('speech', { transcribe: [heard(SENTENCE)] })
    await page.getByTestId('practice-mode-free').click()
    await record(page)
    await expect(page.getByTestId('practice-play')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('practice-play').click()
    await page.getByTestId('practice-play').click()
    await expect(page.getByTestId('practice-error')).toHaveCount(0)
    await app.close()
  })
})

test.describe('importing an audio file', () => {
  test('Read aloud: an imported take waits for Check, then is analysed', async () => {
    const { app, page } = await start('silence', { analyze: [analyzed(84)] })
    await readAloud(page)
    await page.getByTestId('practice-upload').setInputFiles(audioFixtures().speech)
    await expect(page.getByTestId('practice-card')).toHaveAttribute('data-stage', 'review')
    expect((await callLog(app)).analyze).toHaveLength(0)
    await page.getByTestId('practice-analyze').click()
    await expect(page.getByTestId('result-score')).toHaveText('84', { timeout: 20_000 })
    const [call] = (await callLog(app)).analyze
    expect(call!.rms).toBeGreaterThan(SPEECH_RMS) // the file's speech, not the (silent) microphone
    expect(call!.seconds).toBeGreaterThan(1.5)
    expect(call!.seconds).toBeLessThan(2.5)
    await app.close()
  })

  test('Speak freely: an imported file is transcribed straight away', async () => {
    const { app, page } = await start('silence', { transcribe: [heard('from the file')] })
    await page.getByTestId('practice-mode-free').click()
    await page.getByTestId('practice-upload').setInputFiles(audioFixtures().speech)
    await expect(page.getByTestId('practice-text')).toHaveValue('from the file', {
      timeout: 20_000,
    })
    expect((await callLog(app)).transcribe[0]!.rms).toBeGreaterThan(SPEECH_RMS)
    await app.close()
  })

  test('a file that is not audio is rejected with a message and nothing is sent', async () => {
    const { app, page } = await start()
    const bogus = join(mkdtempSync(join(tmpdir(), 'engclaw-e2e-')), 'notes.wav')
    writeFileSync(bogus, 'this is not audio')
    await page.getByTestId('practice-mode-free').click()
    await page.getByTestId('practice-upload').setInputFiles(bogus)
    await expect(page.getByText('This file could not be read as audio.')).toBeVisible()
    const log = await callLog(app)
    expect(log.transcribe).toHaveLength(0)
    expect(log.analyze).toHaveLength(0)
    await app.close()
  })

  test('a file with an unsupported extension is rejected', async () => {
    const { app, page } = await start()
    const txt = join(mkdtempSync(join(tmpdir(), 'engclaw-e2e-')), 'notes.txt')
    writeFileSync(txt, 'hello')
    await page.getByTestId('practice-mode-free').click()
    await page.getByTestId('practice-upload').setInputFiles(txt)
    await expect(page.getByText('This file could not be read as audio.')).toBeVisible()
    await app.close()
  })
})

test.describe('microphone problems', () => {
  for (const [name, text] of [
    ['NotAllowedError', /Microphone access|Settings|Allow microphone/],
    ['NotFoundError', /No microphone was found/],
    ['NotReadableError', /Could not start recording/],
  ] as const) {
    test(`${name}: explains the problem and recording works once it is fixed`, async () => {
      const { app, page } = await start()
      await readAloud(page)
      await breakMic(page, name)
      await page.getByTestId('practice-record').click()
      await expect(page.getByTestId('practice-mic-error')).toContainText(text)
      await expect(page.getByTestId('practice-stop')).toHaveCount(0)
      await expect(page.getByTestId('practice-record')).toBeEnabled()

      await fixMic(page)
      await record(page, 1500)
      await expect(page.getByTestId('result-card')).toBeVisible({ timeout: 20_000 })
      await expect(page.getByTestId('practice-mic-error')).toHaveCount(0)
      await app.close()
    })
  }
})
