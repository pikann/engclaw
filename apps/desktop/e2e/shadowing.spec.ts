import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const launch = () =>
  electron.launch({
    args: [
      join(__dirname, '..'),
      `--user-data-dir=${mkdtempSync(join(tmpdir(), 'engclaw-e2e-'))}`,
      ...(process.env['CI'] ? ['--no-sandbox'] : []),
    ],
  })

test('an invalid link shows the inline error, keeps the text and clears on edit', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await page.getByTestId('nav-shadowing').click()
  await expect(page.getByTestId('shadowing-entry')).toBeVisible()
  await expect(page.getByTestId('shadowing-error')).toHaveCount(0)

  const field = page.getByTestId('shadowing-url')
  await field.fill('https://example.com/not-youtube')
  await page.getByTestId('shadowing-load').click()

  const banner = page.getByTestId('shadowing-error')
  await expect(banner).toBeVisible()
  await expect(banner).toHaveAttribute('data-error', 'invalid')
  await expect(banner).toContainText("That doesn't look like a YouTube link.")
  await expect(banner.getByRole('button')).toHaveCount(0)
  await expect(field).toHaveValue('https://example.com/not-youtube')
  await expect(field).toHaveAttribute('aria-invalid', 'true')

  await field.press('End')
  await field.pressSequentially('x')
  await expect(banner).toHaveCount(0)
  await app.close()
})

test('an empty submit is also reported as an invalid link, and Enter submits', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await page.getByTestId('nav-shadowing').click()
  await page.getByTestId('shadowing-url').press('Enter')
  await expect(page.getByTestId('shadowing-error')).toHaveAttribute('data-error', 'invalid')
  await app.close()
})

test('the invalid-link message is localized (vi)', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await page.getByTestId('nav-settings').click()
  await page.getByTestId('language-switcher').click()
  await page.getByTestId('language-vi').click()
  await page.getByTestId('nav-shadowing').click()
  await page.getByTestId('shadowing-url').fill('nope')
  await page.getByTestId('shadowing-load').click()
  await expect(page.getByTestId('shadowing-error')).toContainText(
    'Đây không giống một liên kết YouTube.',
  )
  await app.close()
})

test('with no videos opened yet the recent list is empty', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await page.getByTestId('nav-shadowing').click()
  await expect(page.getByTestId('shadowing-recent')).toHaveCount(0)
  await expect(page.getByText('Videos you practise with will appear here.')).toBeVisible()
  await app.close()
})

const VIDEO = 'dQw4w9WgXcQ'
const SENTENCE = 'Hello, big world?'

const prosody = {
  words: [
    {
      text: 'Hello,',
      start: 0,
      end: 0.5,
      stressed: false,
      pitch: { direction: 'falling', contour: [2, 1, 0, -1, -2] },
    },
    {
      text: 'big',
      start: 1,
      end: 1.3,
      stressed: true,
      pitch: { direction: 'flat', contour: [0, 0, 0, 0, 0] },
    },
    {
      text: 'world?',
      start: 1.3,
      end: 2,
      stressed: false,
      pitch: { direction: 'rising', contour: [-2, -1, 0, 1, 2] },
    },
  ],
  pauses: [{ afterWordIndex: 0, duration: 0.45 }],
}

/** Opens a session on a video whose transcript and prosody are already cached, so no network is needed. */
async function openCachedSession() {
  const dir = mkdtempSync(join(tmpdir(), 'engclaw-e2e-'))
  const app = await electron.launch({
    args: [
      join(__dirname, '..'),
      `--user-data-dir=${dir}`,
      ...(process.env['CI'] ? ['--no-sandbox'] : []),
    ],
  })
  const page = await app.firstWindow()
  await app.evaluate(
    ({ app: electronApp }, seed) => {
      const { createRequire } = process.getBuiltinModule('node:module')
      const Database = createRequire(`${electronApp.getAppPath()}/package.json`)('better-sqlite3')
      const db = new Database(`${electronApp.getPath('userData')}/engclaw.db`)
      db.prepare(
        'INSERT INTO videos (video_id, title, duration_sec, caption_tracks, fetched_at, last_opened_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(seed.video, 'Cached video', 30, JSON.stringify([{ lang: 'en', auto: false }]), 1, 1)
      db.prepare(
        'INSERT INTO transcripts (video_id, lang, cues, fetched_at) VALUES (?, ?, ?, ?)',
      ).run(seed.video, 'en', JSON.stringify([{ start: 10, dur: 3, text: seed.text }]), 1)
      db.prepare(
        'INSERT INTO segment_prosody (video_id, start_ms, end_ms, text, version, result) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(seed.video, 10000, 13000, seed.text, 1, JSON.stringify(seed.prosody))
      db.close()
    },
    { video: VIDEO, text: SENTENCE, prosody },
  )
  await page.reload()
  await page.getByTestId('nav-shadowing').click()
  await page.getByTestId('shadowing-recent').first().click()
  await expect(page.getByTestId('shadowing-session')).toBeVisible()
  return { app, page }
}

test('the prosody guide marks pauses, stress and pitch from the cache without moving the sentence', async () => {
  const { app, page } = await openCachedSession()
  const sentence = page.getByTestId('shadowing-sentence')
  await expect(sentence).toContainText(SENTENCE)
  await expect(page.getByTestId('shadowing-pause')).toHaveCount(0)

  await page.getByTestId('shadowing-prosody-toggle').click()
  await expect(page.getByTestId('shadowing-pause')).toHaveCount(1)
  await expect(page.getByTestId('shadowing-pause')).toHaveAttribute('title', 'Pause 0.45 s')
  await expect(page.getByTestId('shadowing-word-pitch')).toHaveCount(3)
  await expect(page.locator('[data-testid="shadowing-word"][data-stressed="true"]')).toHaveText(
    /big/,
  )
  await expect(page.getByTestId('shadowing-prosody-loading')).toHaveCount(0)

  const before = await sentence.boundingBox()
  await page.getByTestId('shadowing-ipa-toggle').click()
  await expect(page.getByTestId('shadowing-word-ipa')).toHaveCount(3)
  await expect(page.getByTestId('shadowing-pause')).toHaveCount(1)
  const withIpa = await sentence.boundingBox()
  expect(withIpa!.height).toBeGreaterThan(before!.height)

  await page.getByTestId('shadowing-prosody-toggle').click()
  await expect(page.getByTestId('shadowing-pause')).toHaveCount(0)
  await expect(page.getByTestId('shadowing-word-pitch')).toHaveCount(0)
  await app.close()
})

test('the prosody guide setting is remembered across reloads', async () => {
  const { app, page } = await openCachedSession()
  await expect(page.getByTestId('shadowing-prosody-toggle')).not.toBeChecked()
  await page.getByTestId('shadowing-prosody-toggle').click()
  await expect(page.getByTestId('shadowing-pause')).toHaveCount(1)
  await page.reload()
  await page.getByTestId('nav-shadowing').click()
  await page.getByTestId('shadowing-recent').first().click()
  await expect(page.getByTestId('shadowing-prosody-toggle')).toBeChecked()
  await expect(page.getByTestId('shadowing-pause')).toHaveCount(1)
  await app.close()
})
