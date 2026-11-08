import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import axe from 'axe-core'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Plays chapter 1 to completion on the real app with Chromium's fake microphone. The analysis
 * channel is replaced in the main process with scripted scores so the run is deterministic and
 * needs no downloaded models; everything else (recorder, IPC, game rules, UI) is real.
 */
const wav = resolve(__dirname, '../../../tests/golden/audio/bundled-developer.wav')
const golden = JSON.parse(
  readFileSync(resolve(__dirname, '../../../tests/golden/cases/bundled-developer.json'), 'utf8'),
).result

type Script = { score: number; flagged?: boolean }[]

async function launch(script: Script): Promise<ElectronApplication> {
  const app = await electron.launch({
    args: [
      join(__dirname, '..'),
      `--user-data-dir=${mkdtempSync(join(tmpdir(), 'engclaw-e2e-'))}`,
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-audio-capture=${wav}`,
      ...(process.env['CI'] ? ['--no-sandbox'] : []),
    ],
  })
  await (await app.firstWindow()).waitForLoadState('load')
  await app.evaluate(
    ({ ipcMain }, { script, golden }) => {
      let i = 0
      ipcMain.removeHandler('inference:analyze')
      ipcMain.handle('inference:analyze', () => {
        const s = script[Math.min(i++, script.length - 1)]!
        const errors = s.flagged
          ? [
              {
                position: 0,
                word: 'you',
                expected: 'ju',
                actual: 'ʃu',
                actual_word: 'shoe',
                phone_distance: 1,
                confidence: 0.9,
                phones: [],
              },
            ]
          : []
        return {
          ok: true,
          value: {
            ...golden,
            score: s.score,
            feedback: { code: 'EXCELLENT', words: [] },
            differences: {
              ...golden.differences,
              errors,
              feedback: { code: 'EXCELLENT', words: [] },
            },
          },
        }
      })
    },
    { script, golden },
  )
  return app
}

async function attempt(page: Page): Promise<void> {
  await page.getByTestId('game-record').click()
  await expect(page.getByTestId('game-stop')).toBeVisible()
  await page.waitForTimeout(800)
  await page.getByTestId('game-stop').click()
  await expect(page.getByTestId('game-feedback')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('game-record')).toBeEnabled()
}

async function finalAttempt(page: Page): Promise<void> {
  await page.getByTestId('game-record').click()
  await expect(page.getByTestId('game-stop')).toBeVisible()
  await page.waitForTimeout(800)
  await page.getByTestId('game-stop').click()
}

test('plays a chapter to completion: only correct attempts advance the tracker', async () => {
  const app = await launch([
    { score: 90 },
    { score: 40 },
    { score: 95, flagged: true },
    { score: 85 },
    { score: 92 },
    { score: 88 },
    { score: 91 },
  ])
  const page = await app.firstWindow()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => (location.hash = '#/game/chapter/1'))
  await expect(page.getByTestId('game-target')).toBeVisible()
  await expect(page.getByTestId('game-count')).toHaveText('0/5')

  await attempt(page)
  await expect(page.getByTestId('game-count')).toHaveText('1/5')
  await attempt(page)
  await expect(page.getByTestId('game-count')).toHaveText('1/5')
  await expect(page.getByTestId('game-last-score')).toContainText('40')
  await attempt(page)
  await expect(page.getByTestId('game-count')).toHaveText('1/5')

  const pulsing = await page
    .locator('[data-state="filled-pulse"]')
    .evaluate((el) => getComputedStyle(el).animationName)
  expect(pulsing).toBe('none')

  // Keyboard: Space on the focused record button starts and stops the take.
  await page.getByTestId('game-record').focus()
  await page.keyboard.press('Space')
  await expect(page.getByTestId('game-stop')).toBeVisible()
  await page.waitForTimeout(800)
  await page.keyboard.press('Space')
  await expect(page.getByTestId('game-count')).toHaveText('2/5')

  await attempt(page)
  await attempt(page)
  await page.getByTestId('game-record').click()
  await page.waitForTimeout(800)
  await page.getByTestId('game-stop').click()
  await expect(page.getByTestId('game-passed')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('game-count')).toHaveText('5/5')
  await expect(page.getByTestId('game-passed')).toContainText('7')
  await app.close()
})

test('pass -> result -> replay -> better result upgrades the stored best', async () => {
  const app = await launch([
    ...Array.from({ length: 5 }, () => ({ score: 70 })),
    ...Array.from({ length: 5 }, () => ({ score: 95 })),
  ])
  const page = await app.firstWindow()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => (location.hash = '#/game/chapter/1'))
  await expect(page.getByTestId('game-target')).toBeVisible()
  await expect(page.getByTestId('game-best')).toHaveCount(0)

  for (let i = 0; i < 4; i++) await attempt(page)
  await finalAttempt(page)
  const first = page.getByTestId('game-passed')
  await expect(first).toBeVisible({ timeout: 15_000 })
  await expect(first.getByTestId('game-new-best')).toBeVisible()
  await expect(first.getByRole('img', { name: '2 of 3 stars' })).toBeVisible()
  await expect(first.getByTestId('game-compare')).toHaveCount(0)
  await expect(first.getByTestId('game-back-map')).toBeVisible()

  await first.getByTestId('game-replay').click()
  await expect(page.getByTestId('game-count')).toHaveText('0/5')
  await expect(
    page.getByTestId('game-best').getByRole('img', { name: '2 of 3 stars' }),
  ).toBeVisible()

  for (let i = 0; i < 4; i++) await attempt(page)
  await finalAttempt(page)
  const second = page.getByTestId('game-passed')
  await expect(second).toBeVisible({ timeout: 15_000 })
  await expect(second.getByTestId('game-new-best')).toBeVisible()
  await expect(second.getByTestId('game-compare-this')).toHaveText('95')
  await expect(second.getByTestId('game-compare-prev')).toHaveText('70')
  await expect(second.getByRole('img', { name: '3 of 3 stars' }).first()).toBeVisible()
  await expect(
    page.getByTestId('game-best').getByRole('img', { name: '3 of 3 stars' }),
  ).toBeVisible()

  const stored = await page.evaluate(() =>
    (
      window as unknown as { engclaw: { game: { map(): Promise<{ progress: unknown[] }> } } }
    ).engclaw.game.map(),
  )
  expect(stored.progress).toHaveLength(1)
  expect(stored.progress[0]).toMatchObject({ order: 1, stars: 3, avgScore: 95, attempts: 10 })
  await app.close()
})

test('leaving mid-chapter asks first and resets the run', async () => {
  const app = await launch([{ score: 90 }])
  const page = await app.firstWindow()
  await page.evaluate(() => (location.hash = '#/game/chapter/1'))
  await attempt(page)
  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('game-leave-dialog')).toBeVisible()
  await page.getByTestId('game-leave-stay').click()
  await expect(page.getByTestId('game-count')).toHaveText('1/5')
  await page.getByTestId('nav-history').click()
  await page.getByTestId('game-leave-confirm').click()
  await expect(page.getByTestId('game-chapter')).toHaveCount(0)
  await page.evaluate(() => (location.hash = '#/game/chapter/1'))
  await expect(page.getByTestId('game-count')).toHaveText('0/5')
  await app.close()
})

test('shows the model download prompt when the speech model is missing', async () => {
  const app = await launch([])
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('inference:analyze')
    ipcMain.handle('inference:analyze', () => ({
      ok: false,
      code: 'MODEL_MISSING',
      message: 'missing',
      modelId: 'phone',
    }))
  })
  const page = await app.firstWindow()
  await page.evaluate(() => (location.hash = '#/game/chapter/1'))
  await page.getByTestId('game-record').click()
  await page.waitForTimeout(800)
  await page.getByTestId('game-stop').click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('game-count')).toHaveText('0/5')
  await app.close()
})

test('chapter screen passes axe in en and vi', async () => {
  const app = await launch([{ score: 60 }])
  const page = await app.firstWindow()
  for (const lang of ['en', 'vi']) {
    await page.getByTestId('nav-settings').click()
    await page.getByTestId('language-switcher').click()
    await page.getByTestId(`language-${lang}`).click()
    await page.evaluate(() => (location.hash = '#/game/chapter/1'))
    await expect(page.getByTestId('game-target')).toBeVisible()
    await attempt(page)
    await page.waitForTimeout(500) // let the button's colour transition settle
    await page.evaluate(axe.source)
    const serious = await page.evaluate(async () => {
      const r = await (window as unknown as { axe: typeof axe }).axe.run(document, {
        runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
      })
      return r.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map(
          (v) =>
            `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 200) + ' ' + (n.any[0]?.message ?? '')).join(' | ')}`,
        )
    })
    expect(serious).toEqual([])
    await page.getByTestId('nav-settings').click()
    await page.getByTestId('game-leave-confirm').click()
  }
  await app.close()
})

test('learning aids: word lookup keeps the run, example audio plays, ask slot reserves space', async () => {
  const app = await launch([{ score: 90 }])
  await app.evaluate(({ ipcMain }) => {
    const seen: { text: string; speed?: string }[] = []
    ;(globalThis as unknown as { __speak: typeof seen }).__speak = seen
    ipcMain.removeHandler('tts:speak')
    ipcMain.handle('tts:speak', (_e, req: { text: string; speed?: string }) => {
      seen.push(req)
      return {
        ok: true,
        samples: new Float32Array(1600),
        sampleRate: 16000,
        cached: seen.length > 1,
        ms: 5,
      }
    })
  })
  const page = await app.firstWindow()
  await page.evaluate(() => (location.hash = '#/game/chapter/1'))
  await attempt(page)
  await expect(page.getByTestId('game-count')).toHaveText('1/5')

  const slot = page.getByTestId('ask-slot')
  const before = await slot.boundingBox()
  await page.getByTestId('game-target').locator('[data-word]').first().click()
  await expect(page.getByTestId('dictionary-dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('dictionary-dialog')).toHaveCount(0)
  await expect(page.getByTestId('game-count')).toHaveText('1/5')

  await page.getByTestId('example-play').first().click()
  await expect
    .poll(() =>
      app.evaluate(() => (globalThis as unknown as { __speak: unknown[] }).__speak.length),
    )
    .toBeGreaterThanOrEqual(1)

  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="ask-slot"]')!
    el.innerHTML = '<button style="height:32px;width:140px">Ask the agent</button>'
  })
  const after = await slot.boundingBox()
  expect(after).toEqual(before)
  await app.close()
})
