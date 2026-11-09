import { _electron, type ElectronApplication } from '@playwright/test'
import { copyFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

type LaunchOptions = Parameters<typeof _electron.launch>[0]

/**
 * `_electron` with a retrying `launch`: on CI the Electron binary is occasionally still locked by
 * the previous test's process (ETXTBSY on Linux, "used by another process" on Windows).
 */
const FAKE_AUDIO = '--use-file-for-fake-audio-capture='

/**
 * Chromium opens the fake-mic file exclusively on Windows, so parallel workers sharing one wav
 * fail with "used by another process". Give every launch its own copy.
 */
function withPrivateAudio(options: LaunchOptions): LaunchOptions {
  if (!options?.args?.some((a) => a.startsWith(FAKE_AUDIO))) return options
  const dir = mkdtempSync(join(tmpdir(), 'engclaw-e2e-audio-'))
  return {
    ...options,
    args: options.args.map((a) => {
      if (!a.startsWith(FAKE_AUDIO)) return a
      const src = a.slice(FAKE_AUDIO.length)
      const dest = join(dir, basename(src))
      copyFileSync(src, dest)
      return FAKE_AUDIO + dest
    }),
  }
}

export const electron = {
  async launch(options?: LaunchOptions): Promise<ElectronApplication> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await _electron.launch(withPrivateAudio(options))
      } catch (e) {
        if (attempt >= 5 || !/ETXTBSY|used by another process|failed to launch/i.test(String(e)))
          throw e
        await new Promise((r) => setTimeout(r, 1000 * attempt))
      }
    }
  },
}
