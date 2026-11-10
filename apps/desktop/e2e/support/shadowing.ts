import { expect, type ElectronApplication, type Page } from '@playwright/test'
import { launchApp, type LaunchOptions } from './launch'
import { stubSpeech, type SpeechScript } from './speech-stubs'

export const VIDEO = 'dQw4w9WgXcQ'
export const CUES = [
  { start: 10, dur: 3, text: 'Hello, I am a developer.' },
  { start: 20, dur: 3, text: 'What did you build today?' },
]

/**
 * Replaces the YouTube player with a stand-in that is "ready" at once, so a session works offline:
 * the real player needs youtube.com, and until it is ready every control (including recording) is
 * locked. Commands (play, seek) are accepted and ignored.
 */
export async function stubPlayer(app: ElectronApplication, duration = 60): Promise<void> {
  await app.evaluate(({ ipcMain, BrowserWindow }, seconds) => {
    ipcMain.removeHandler('player:load')
    ipcMain.handle('player:load', () => {
      setTimeout(() => {
        for (const w of BrowserWindow.getAllWindows())
          w.webContents.send('player:event', { type: 'ready', duration: seconds })
      }, 150)
      return null
    })
  }, duration)
}

/**
 * Opens a shadowing session on a video whose transcript is already in the local cache, so no
 * network is needed. The speech engine is scripted and the fake mic plays `audio`.
 */
export async function openCachedSession(
  opts: LaunchOptions & { script?: SpeechScript; cues?: typeof CUES } = {},
): Promise<{ app: ElectronApplication; page: Page; userData: string }> {
  const { script, cues = CUES, ...launch } = opts
  const run = await launchApp(launch)
  const { app, page } = run
  await stubSpeech(app, script)
  await stubPlayer(app)
  await app.evaluate(
    ({ app: electronApp }, seed) => {
      const { createRequire } = process.getBuiltinModule('node:module')
      const Database = createRequire(`${electronApp.getAppPath()}/package.json`)('better-sqlite3')
      const db = new Database(`${electronApp.getPath('userData')}/engclaw.db`)
      db.prepare(
        'INSERT INTO videos (video_id, title, duration_sec, caption_tracks, fetched_at, last_opened_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(seed.video, 'Cached video', 60, JSON.stringify([{ lang: 'en', auto: false }]), 1, 1)
      db.prepare(
        'INSERT INTO transcripts (video_id, lang, cues, fetched_at) VALUES (?, ?, ?, ?)',
      ).run(seed.video, 'en', JSON.stringify(seed.cues), 1)
      db.close()
    },
    { video: VIDEO, cues },
  )
  await page.reload()
  await page.getByTestId('nav-shadowing').click()
  await page.getByTestId('shadowing-recent').first().click()
  await expect(page.getByTestId('shadowing-session')).toBeVisible()
  return run
}
