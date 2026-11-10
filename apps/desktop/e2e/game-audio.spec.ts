import { expect, test, type Page } from '@playwright/test'
import { breakMic, fixMic, launchApp } from './support/launch'
import {
  analyzed,
  callLog,
  fail,
  SPEECH_RMS,
  stubSpeech,
  type SpeechScript,
} from './support/speech-stubs'
import type { AudioFixture } from './support/audio'

/**
 * The pronunciation game with sound fixtures through the fake microphone and a scripted engine:
 * what is sent for analysis, how a good, poor or failed attempt is shown, and microphone problems.
 * Complements game-chapter.spec.ts, which plays a whole chapter.
 */
async function start(audio: AudioFixture = 'speech', script: SpeechScript = {}) {
  const { app, page } = await launchApp({ audio })
  await stubSpeech(app, script)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => (location.hash = '#/game/chapter/1'))
  await expect(page.getByTestId('game-target')).toBeVisible()
  return { app, page }
}

async function take(page: Page, ms = 1500) {
  await page.getByTestId('game-record').click()
  await expect(page.getByTestId('game-stop')).toBeVisible()
  await page.waitForTimeout(ms)
  await page.getByTestId('game-stop').click()
}

test('the recorded take is sent with the chapter text and counts when it scores well', async () => {
  const { app, page } = await start('speech', { analyze: [analyzed(93)] })
  const target = (await page.getByTestId('game-target').innerText()).toLowerCase()
  await take(page, 2200)
  await expect(page.getByTestId('game-feedback')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('game-count')).toHaveText('1/5')
  await expect(page.getByTestId('game-last-score')).toContainText('93')

  const [call] = (await callLog(app)).analyze
  expect(call!.text).toBeTruthy()
  expect(target).toContain(call!.text!.toLowerCase())
  expect(call!.rms).toBeGreaterThan(SPEECH_RMS)
  expect(call!.seconds).toBeGreaterThan(2)
  await app.close()
})

test('a poor take is shown but does not advance the chapter', async () => {
  const { app, page } = await start('speech', { analyze: [analyzed(35)] })
  await take(page)
  await expect(page.getByTestId('game-feedback')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('game-count')).toHaveText('0/5')
  await expect(page.getByTestId('game-last-score')).toContainText('35')
  await expect(page.getByTestId('game-record')).toBeEnabled()
  await app.close()
})

test('a silent take reaches the engine as silence and cannot pass', async () => {
  const { app, page } = await start('silence', { analyze: [analyzed(0)] })
  await take(page)
  await expect(page.getByTestId('game-feedback')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('game-count')).toHaveText('0/5')
  expect((await callLog(app)).analyze[0]!.rms).toBeLessThan(SPEECH_RMS / 10)
  await app.close()
})

test('noise that is not speech is sent as loud audio and scored by the engine', async () => {
  const { app, page } = await start('tone', { analyze: [analyzed(3)] })
  await take(page)
  await expect(page.getByTestId('game-feedback')).toBeVisible({ timeout: 15_000 })
  expect((await callLog(app)).analyze[0]!.rms).toBeGreaterThan(0.1)
  await expect(page.getByTestId('game-count')).toHaveText('0/5')
  await app.close()
})

test('silence after the words ends the take by itself', async () => {
  const { app, page } = await start('speechThenSilence', { analyze: [analyzed(90)] })
  await page.getByTestId('game-record').click()
  await expect(page.getByTestId('game-feedback')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('game-count')).toHaveText('1/5')
  expect((await callLog(app)).analyze).toHaveLength(1)
  await app.close()
})

test('an analysis failure shows a warning, keeps the run, and Retry re-checks the same take', async () => {
  const { app, page } = await start('speech', {
    analyze: [{ reply: fail('FAILED') }, analyzed(88)],
  })
  await take(page)
  const error = page.getByTestId('game-error')
  await expect(error).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('game-count')).toHaveText('0/5')
  await error.getByRole('button').click()
  await expect(page.getByTestId('game-feedback')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('game-count')).toHaveText('1/5')
  await expect(page.getByTestId('game-error')).toHaveCount(0)
  const calls = (await callLog(app)).analyze
  expect(calls).toHaveLength(2)
  expect(calls[1]!.seconds).toBe(calls[0]!.seconds)
  await app.close()
})

for (const code of ['PROCESS_CRASHED', 'INVALID_INPUT', 'CLIP_TOO_LONG'] as const) {
  test(`${code} from the engine is reported as a failed analysis and can be retried`, async () => {
    const { app, page } = await start('speech', { analyze: [{ reply: fail(code) }, analyzed(90)] })
    await take(page)
    await expect(page.getByTestId('game-error')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('game-error').getByRole('button').click()
    await expect(page.getByTestId('game-count')).toHaveText('1/5', { timeout: 15_000 })
    await app.close()
  })
}

test('a cancelled analysis is not an error', async () => {
  const { app, page } = await start('speech', {
    analyze: [{ reply: fail('CANCELLED') }, analyzed(90)],
  })
  await take(page)
  await expect(page.getByTestId('game-record')).toBeEnabled({ timeout: 15_000 })
  await expect(page.getByTestId('game-error')).toHaveCount(0)
  await expect(page.getByTestId('game-count')).toHaveText('0/5')
  await app.close()
})

test('while the engine is working the record button is locked', async () => {
  const { app, page } = await start('speech', { analyze: [{ ...analyzed(90), delayMs: 2500 }] })
  await take(page)
  await expect(page.getByTestId('game-analyzing')).toBeVisible()
  await expect(page.getByTestId('game-record')).toBeDisabled()
  await expect(page.getByTestId('game-feedback')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('game-record')).toBeEnabled()
  await app.close()
})

for (const [name, text] of [
  ['NotAllowedError', /Microphone access|Settings|Allow microphone/],
  ['NotFoundError', /No microphone was found/],
  ['NotReadableError', /Could not start recording/],
] as const) {
  test(`microphone ${name}: explained, nothing analysed, and Retry works once fixed`, async () => {
    const { app, page } = await start('speech', { analyze: [analyzed(91)] })
    await breakMic(page, name)
    await page.getByTestId('game-record').click()
    const error = page.getByTestId('game-error')
    await expect(error).toContainText(text)
    await expect(page.getByTestId('game-stop')).toHaveCount(0)
    expect((await callLog(app)).analyze).toHaveLength(0)

    await fixMic(page)
    await error.getByRole('button').click()
    await expect(page.getByTestId('game-stop')).toBeVisible()
    await page.waitForTimeout(1500)
    await page.getByTestId('game-stop').click()
    await expect(page.getByTestId('game-count')).toHaveText('1/5', { timeout: 15_000 })
    await expect(page.getByTestId('game-error')).toHaveCount(0)
    await app.close()
  })
}
