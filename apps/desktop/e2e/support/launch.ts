import type { ElectronApplication, Page } from '@playwright/test'
import { cpSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { electron } from '../electron'
import { audioFixtures, type AudioFixture } from './audio'

export interface LaunchOptions {
  /** Which sound the fake microphone plays (looped). Default: the spoken sentence. */
  audio?: AudioFixture
  /** Reuse a userData folder (a relaunch); default is a fresh one. */
  userData?: string
  /** Seed the folder with an installed-models profile (ENGCLAW_E2E_USER_DATA). */
  withModels?: boolean
}

export const modelsUserData = process.env['ENGCLAW_E2E_USER_DATA']

export function freshUserData(withModels = false): string {
  const dir = mkdtempSync(join(tmpdir(), 'engclaw-e2e-'))
  if (withModels && modelsUserData) cpSync(modelsUserData, dir, { recursive: true })
  return dir
}

/** Starts the built app with Chromium's fake microphone playing one of the sound fixtures. */
export async function launchApp(
  opts: LaunchOptions = {},
): Promise<{ app: ElectronApplication; page: Page; userData: string }> {
  const userData = opts.userData ?? freshUserData(opts.withModels)
  const app = await electron.launch({
    args: [
      join(__dirname, '../..'),
      `--user-data-dir=${userData}`,
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-audio-capture=${audioFixtures()[opts.audio ?? 'speech']}`,
      // Chromium's sandboxed audio service cannot open the fake-mic WAV on macOS and then records
      // pure silence (RMS 0), so the fixtures only reach the app without the sandbox.
      '--no-sandbox',
    ],
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('load')
  return { app, page, userData }
}

/** Makes the next `getUserMedia` calls fail the way the OS would (denied, no device, busy). */
export async function breakMic(
  page: Page,
  name: 'NotAllowedError' | 'NotFoundError' | 'NotReadableError',
): Promise<void> {
  await page.evaluate((errName) => {
    const w = window as unknown as { __gum?: MediaDevices['getUserMedia'] }
    w.__gum ??= navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('e2e: microphone unavailable', errName))
  }, name)
}

/** Undoes `breakMic`, so a retry reaches the fake microphone again. */
export async function fixMic(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __gum?: MediaDevices['getUserMedia'] }
    if (w.__gum) navigator.mediaDevices.getUserMedia = w.__gum
  })
}
