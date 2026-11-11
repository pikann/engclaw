import { expect, test, type Page } from '@playwright/test'
import { launchApp } from './support/launch'
import { analyzed, callLog, stubSpeech, type SpeechScript } from './support/speech-stubs'

/**
 * Mouth + tongue animation: the word box in a practice result (wrong and correct words) and the
 * dictionary word page. The speech engine is scripted (support/speech-stubs.ts), so the voice's
 * length and its generation delay are exact, and a MutationObserver records every frame the
 * mouth photo and the tongue diagram show, to prove they move together and with the audio.
 */
const SENTENCE = 'Hello, I am a developer'
/** The mouth picture each tongue pose goes with (lib/viseme.ts + lib/articulation.ts). */
const VISEME_OF: Record<string, string> = { h: 'H', ə: 'AH', l: 'L', o: 'OW', ʊ: 'OW', '': 'rest' }

interface Frame {
  at: number
  viseme: string
  phone: string
}

async function openResult(script: SpeechScript = {}) {
  const { app, page } = await launchApp({ audio: 'speech' })
  await stubSpeech(app, { analyze: [analyzed(88, { flagged: true })], ...script })
  await page.getByTestId('nav-practice').click()
  await page.getByTestId('practice-mode-sentence').click()
  await page.getByTestId('practice-text').fill(SENTENCE)
  await page.getByTestId('practice-record').click()
  await expect(page.getByTestId('practice-stop')).toBeVisible()
  await page.waitForTimeout(2500)
  await page.getByTestId('practice-stop').click()
  await expect(page.getByTestId('word-detail')).toBeVisible({ timeout: 20_000 })
  return { app, page }
}

/** Starts recording every change of the mouth picture and the tongue pose in the open word box. */
async function watch(page: Page): Promise<void> {
  await page.evaluate(() => {
    const root = document.querySelector('[data-testid="articulation"]')!
    const w = window as unknown as { __art: Frame[] }
    w.__art = []
    new MutationObserver(() => {
      w.__art.push({
        at: performance.now(),
        viseme: root.querySelector('[data-testid="mouth"]')!.getAttribute('data-viseme')!,
        phone: root.querySelector('[data-testid="tongue"]')!.getAttribute('data-phone')!,
      })
    }).observe(root, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-viseme', 'data-phone'],
    })
  })
}
const frames = (page: Page): Promise<Frame[]> =>
  page.evaluate(() => (window as unknown as { __art: Frame[] }).__art)

/** Waits until the animation has returned to rest after having moved. */
const finished = (page: Page) =>
  expect
    .poll(
      async () => {
        const f = await frames(page)
        return f.length > 1 && f.at(-1)!.phone === ''
      },
      { timeout: 15_000 },
    )
    .toBe(true)

test.describe('practice result word box', () => {
  test('a flagged word shows its sounds, heard sounds, mouth and tongue — and no Show mouth button', async () => {
    const { app, page } = await openResult()
    const box = page.getByTestId('word-detail')
    await expect(box.getByTestId('word-phone')).toHaveText(['h', 'ə', 'l', 'oʊ'])
    await expect(box.getByTestId('word-heard')).toBeVisible()
    await expect(box.getByTestId('mouth')).toBeVisible()
    await expect(box.getByTestId('tongue')).toBeVisible()
    await expect(box.getByTestId('word-hear')).toBeEnabled()
    await expect(page.getByTestId('mouth-play')).toHaveCount(0)
    await app.close()
  })

  test('a word said correctly opens the same box, without a heard row', async () => {
    const { app, page } = await openResult()
    await expect(page.getByTestId('word-chip').nth(1)).toHaveAttribute('data-flagged', 'false')
    await page.getByTestId('word-chip').nth(1).click()
    const box = page.getByTestId('word-detail')
    await expect(box).toContainText('i')
    await expect(box.getByTestId('word-phone')).toHaveText(['aɪ'])
    await expect(box.getByTestId('word-heard')).toHaveCount(0)
    await expect(box.getByTestId('mouth')).toBeVisible()
    await expect(box.getByTestId('tongue')).toBeVisible()
    await expect(box.getByTestId('word-hear')).toBeEnabled()

    // Its sound plays too: a diphthong glides through two tongue poses on one mouth picture.
    await watch(page)
    await box.getByTestId('word-phone').click()
    await finished(page)
    const f = await frames(page)
    expect(f.map((x) => x.phone)).toEqual(['a', 'ɪ', ''])
    expect(f.map((x) => x.viseme)).toEqual(['AY', 'AY', 'rest'])
    await app.close()
  })

  test('picking one sound animates just that sound, mouth and tongue together', async () => {
    const { app, page } = await openResult()
    await watch(page)
    const box = page.getByTestId('word-detail')
    await box.getByTestId('word-phone').nth(2).click()
    await expect(box.getByTestId('word-phone').nth(2)).toHaveAttribute('aria-pressed', 'true')
    await finished(page)
    const f = await frames(page)
    expect(f.map((x) => x.phone)).toEqual(['l', ''])
    expect(f.map((x) => x.viseme)).toEqual(['L', 'rest'])
    await app.close()
  })

  test('Hear it generates the voice first, then plays and animates the whole word for its length', async () => {
    const GENERATE_MS = 1200
    const VOICE_S = 1.2
    const { app, page } = await openResult({
      tts: [{ reply: { ok: true, seconds: VOICE_S }, delayMs: GENERATE_MS }],
    })
    await watch(page)
    const box = page.getByTestId('word-detail')
    const t0 = await page.evaluate(() => performance.now())
    await box.getByTestId('word-hear').click()

    // While the voice is being generated the button says so, and nothing animates yet.
    await expect(box.getByTestId('word-hear')).toBeDisabled()
    await page.waitForTimeout(GENERATE_MS / 2)
    expect(await frames(page)).toEqual([])

    await finished(page)
    const f = await frames(page)
    // Every frame pairs a tongue pose with its own mouth picture (they never drift apart).
    for (const x of f) expect(x.viseme).toBe(VISEME_OF[x.phone])
    expect(f.map((x) => x.phone)).toEqual(['h', 'ə', 'l', 'o', 'ʊ', ''])
    // It started after the voice was ready, and lasts about as long as the voice.
    expect(f[0]!.at - t0).toBeGreaterThan(GENERATE_MS * 0.8)
    const spoken = f.at(-1)!.at - f[0]!.at
    expect(spoken).toBeGreaterThan(VOICE_S * 1000 * 0.75)
    expect(spoken).toBeLessThan(VOICE_S * 1000 * 1.35)

    await expect(box.getByTestId('word-hear')).toBeEnabled()
    expect((await callLog(app)).tts.map((c) => c.text)).toContain('hello')
    await app.close()
  })

  test('Hear it plays the whole word even after a single sound was picked', async () => {
    const { app, page } = await openResult({ tts: [{ reply: { ok: true, seconds: 0.8 } }] })
    const box = page.getByTestId('word-detail')
    await box.getByTestId('word-phone').nth(1).click()
    await expect(box.getByTestId('word-phone').nth(1)).toHaveAttribute('aria-pressed', 'true')
    await page.waitForTimeout(600)
    await watch(page)
    await box.getByTestId('word-hear').click()
    await finished(page)
    expect((await frames(page)).map((x) => x.phone)).toEqual(['h', 'ə', 'l', 'o', 'ʊ', ''])
    await expect(box.getByTestId('word-phone').nth(1)).toHaveAttribute('aria-pressed', 'false')
    await app.close()
  })

  test('with the local voice missing, Hear it recovers instead of hanging', async () => {
    const { app, page } = await openResult({
      tts: [{ reply: { ok: false, code: 'MODEL_MISSING' } }],
    })
    const box = page.getByTestId('word-detail')
    await box.getByTestId('word-hear').click()
    await expect(box.getByTestId('word-hear')).toBeEnabled({ timeout: 10_000 })
    await expect(page.getByTestId('practice-error')).toHaveCount(0)
    await app.close()
  })
})

test.describe('dictionary word page', () => {
  async function openWord(script: SpeechScript = {}) {
    const { app, page } = await launchApp()
    await stubSpeech(app, script)
    await page.getByTestId('nav-dictionary').click()
    await page.getByTestId('dictionary-search').fill('accelerate')
    await expect(
      page
        .getByTestId('dictionary-results')
        .getByRole('option', { name: 'accelerate', exact: true }),
    ).toBeVisible()
    await page.getByTestId('dictionary-search').press('Enter')
    await expect(page.getByTestId('word-articulation')).toBeVisible()
    return { app, page }
  }

  test('shows the sounds with the mouth and tongue, and exactly one Hear it button', async () => {
    const { app, page } = await openWord()
    const word = page.getByTestId('word-page')
    const section = word.getByTestId('word-articulation')
    expect(await section.getByTestId('word-phone').count()).toBeGreaterThan(3)
    await expect(section.getByTestId('mouth')).toBeVisible()
    await expect(section.getByTestId('tongue')).toBeVisible()
    await expect(word.getByTestId('word-hear')).toHaveCount(1)
    await expect(word.getByTestId('hear-reference')).toHaveCount(0)
    await app.close()
  })

  test('picking a sound moves the mouth and tongue together', async () => {
    const { app, page } = await openWord()
    await watch(page)
    await page.getByTestId('word-articulation').getByTestId('word-phone').first().click()
    await finished(page)
    const f = await frames(page)
    expect(f.length).toBeGreaterThanOrEqual(2)
    expect(f[0]!.phone).not.toBe('')
    expect(f[0]!.viseme).not.toBe('rest')
    expect(f.at(-1)).toMatchObject({ phone: '', viseme: 'rest' })
    await app.close()
  })

  test('Hear it speaks the word and animates every sound for the length of the voice', async () => {
    const VOICE_S = 1.5
    const { app, page } = await openWord({
      tts: [{ reply: { ok: true, seconds: VOICE_S }, delayMs: 600 }],
    })
    await watch(page)
    const section = page.getByTestId('word-articulation')
    const sounds = await section.getByTestId('word-phone').count()
    await section.getByTestId('word-hear').click()
    await expect(section.getByTestId('word-hear')).toBeDisabled()
    await finished(page)
    const f = await frames(page)
    expect(f.length).toBeGreaterThanOrEqual(sounds + 1)
    const spoken = f.at(-1)!.at - f[0]!.at
    expect(spoken).toBeGreaterThan(VOICE_S * 1000 * 0.75)
    expect(spoken).toBeLessThan(VOICE_S * 1000 * 1.35)
    expect((await callLog(app)).tts.map((c) => c.text)).toContain('accelerate')
    await expect(section.getByTestId('word-hear')).toBeEnabled()
    await app.close()
  })
})
