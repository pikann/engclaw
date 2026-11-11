import { expect, test, type Page } from '@playwright/test'
import { FakeLlm } from '../e2e/support/fake-llm'
import { configureProvider } from '../e2e/support/converse'
import { launchApp } from '../e2e/support/launch'
import { stubPlayer } from '../e2e/support/shadowing'
import { analyzed, heard, stubSpeech } from '../e2e/support/speech-stubs'
import { DEMO_URL, installFakeVideo, stubYouTube } from './support/fake-video'
import { installCursor, pause, Recorder } from './support/recorder'
import { collapseSidebar, goto, seedGame } from './support/ui'

/**
 * Produces the GIFs in docs/media (run `bun run media`). Every take is scripted: the fake
 * microphone plays a fixed clip and the speech engine returns fixed results, so the GIFs are the
 * same on every run and need no downloaded models, microphone or network. The UI is real. The
 * navigation sidebar is collapsed in every GIF, so each scene opens its page by route first.
 */
const SENTENCE = 'Hello, I am a developer'
// The reference voice is a scripted tone this long; the mouth and tongue animate for as long.
const HEAR_SECONDS = 1.2

async function type(page: Page, testId: string, text: string) {
  const box = page.getByTestId(testId)
  await box.click()
  await box.pressSequentially(text, { delay: 55 })
}

async function recordTake(page: Page, rec: string, stop: string, ms = 2300) {
  await page.getByTestId(rec).click()
  await expect(page.getByTestId(stop)).toBeVisible()
  await pause(page, ms)
  await page.getByTestId(stop).click()
}

/** Hear a word, then step through two of its sounds to show the mouth and tongue for each. */
async function showArticulation(page: Page, root: ReturnType<Page['getByTestId']>) {
  await root.getByTestId('word-hear').click()
  await pause(page, HEAR_SECONDS * 1000 + 900)
  const sounds = root.getByTestId('word-phone')
  for (const i of [0, 3]) {
    await sounds.nth(i).click()
    await pause(page, 1500)
  }
}

test('practice', async () => {
  const { app, page } = await launchApp({ audio: 'speech' })
  await stubSpeech(app, {
    analyze: [{ ...analyzed(72, { flagged: true }), delayMs: 900 }],
    tts: [{ reply: { ok: true, seconds: HEAR_SECONDS } }],
  })
  await goto(page, '#/practice')
  await collapseSidebar(page)
  await installCursor(page)
  const rec = new Recorder(page)
  rec.start()
  await pause(page, 700)
  await page.getByTestId('practice-mode-sentence').click()
  await type(page, 'practice-text', SENTENCE)
  await pause(page, 500)
  await recordTake(page, 'practice-record', 'practice-stop')
  await expect(page.getByTestId('result-card')).toBeVisible({ timeout: 20_000 })
  await pause(page, 1500)
  // Click the flagged word: its sounds, "Hear it", and the mouth and tongue open below.
  await page.getByTestId('result-chips').getByRole('button').first().click()
  const detail = page.getByTestId('word-detail')
  await expect(detail).toBeVisible()
  await detail.scrollIntoViewIfNeeded()
  await pause(page, 900)
  await showArticulation(page, detail)
  await pause(page, 1000)
  await rec.save('practice')
  await app.close()
})

test('shadowing', async () => {
  const { app, page } = await launchApp({ audio: 'speech' })
  await stubSpeech(app, {
    analyze: [analyzed(86, { flagged: true, transcript: 'hello i am a developer' })],
  })
  await stubYouTube(app)
  await stubPlayer(app)
  await goto(page, '#/shadowing')
  await expect(page.getByTestId('shadowing-entry')).toBeVisible()
  await collapseSidebar(page)
  await installCursor(page)
  const rec = new Recorder(page)
  rec.start()
  await pause(page, 900)
  // 1. Paste a YouTube link and load it.
  await type(page, 'shadowing-url', DEMO_URL)
  await pause(page, 900)
  await page.getByTestId('shadowing-load').click()
  await expect(page.getByTestId('shadowing-session')).toBeVisible({ timeout: 20_000 })
  await installFakeVideo(page)
  await pause(page, 1800)
  // 2. Record yourself saying the sentence, then read the score.
  await page.getByTestId('shadowing-attempt-record').click()
  await pause(page, 2300)
  await page.getByTestId('shadowing-attempt-record').click()
  await expect(page.getByTestId('shadowing-attempt')).toHaveAttribute('data-phase', 'result', {
    timeout: 20_000,
  })
  await pause(page, 2600)
  await rec.save('shadowing')
  await app.close()
})

test('game', async () => {
  const { app, page } = await launchApp({ audio: 'speech' })
  await stubSpeech(app, { analyze: [analyzed(38), analyzed(93)] })
  await seedGame(page, 3)
  await goto(page, '#/game')
  await expect(page.getByTestId('road-map')).toBeVisible()
  await collapseSidebar(page)
  await installCursor(page)
  const rec = new Recorder(page)
  rec.start()
  await pause(page, 1800)
  // The map first: pick the next chapter, read its preview, press Play.
  await page.getByTestId('game-node-4').click()
  await expect(page.getByTestId('chapter-preview')).toBeVisible()
  await pause(page, 1800)
  await page.getByTestId('preview-play').click()
  await expect(page.getByTestId('game-target')).toBeVisible()
  await pause(page, 1000)
  await recordTake(page, 'game-record', 'game-stop')
  await expect(page.getByTestId('game-feedback')).toBeVisible({ timeout: 15_000 })
  await pause(page, 2000)
  await recordTake(page, 'game-record', 'game-stop')
  await expect(page.getByTestId('game-count')).toHaveText('1/5', { timeout: 15_000 })
  await pause(page, 2500)
  await rec.save('game')
  await app.close()
})

test('dictionary', async () => {
  const { app, page } = await launchApp()
  await stubSpeech(app, { tts: [{ reply: { ok: true, seconds: HEAR_SECONDS } }] })
  await goto(page, '#/dictionary')
  await expect(page.getByTestId('dictionary-page')).toBeVisible()
  await collapseSidebar(page)
  await installCursor(page)
  const rec = new Recorder(page)
  rec.start()
  await pause(page, 800)
  await type(page, 'dictionary-search', 'accel')
  const results = page.getByTestId('dictionary-results')
  await expect(results.getByRole('option', { name: 'accelerate', exact: true })).toBeVisible()
  await pause(page, 900)
  await page.getByTestId('dictionary-search').press('Enter')
  await expect(page.getByTestId('word-page')).toBeVisible()
  await pause(page, 1500)
  // The word page: hear it, and watch the mouth and tongue for each sound.
  const articulation = page.getByTestId('word-articulation')
  await articulation.scrollIntoViewIfNeeded()
  await pause(page, 700)
  await showArticulation(page, articulation)
  await pause(page, 1000)
  await rec.save('dictionary')
  await app.close()
})

test('converse', async () => {
  const llm = await FakeLlm.start()
  try {
    llm.enqueue({
      kind: 'reply',
      text: 'That sounds great. What did you build today?',
      chunkDelayMs: 60,
    })
    const { app, page } = await launchApp({ audio: 'speech' })
    await stubSpeech(app, { transcribe: [heard(SENTENCE)] })
    await configureProvider(page, llm.baseUrl)
    await goto(page, '#/converse')
    await expect(page.getByTestId('converse')).toBeVisible()
    await collapseSidebar(page)
    await installCursor(page)
    const rec = new Recorder(page)
    rec.start()
    await pause(page, 1000)
    await recordTake(page, 'converse-mic', 'converse-stop', 2200)
    await expect(page.getByTestId('converse-transcript')).toContainText('What did you build', {
      timeout: 20_000,
    })
    await pause(page, 2800)
    await rec.save('converse')
    await app.close()
  } finally {
    await llm.stop()
  }
})
