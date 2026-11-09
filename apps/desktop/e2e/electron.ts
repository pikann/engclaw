import { _electron, type ElectronApplication } from '@playwright/test'

type LaunchOptions = Parameters<typeof _electron.launch>[0]

/**
 * `_electron` with a retrying `launch`: on CI the Electron binary is occasionally still locked by
 * the previous test's process (ETXTBSY on Linux, "used by another process" on Windows).
 */
export const electron = {
  async launch(options?: LaunchOptions): Promise<ElectronApplication> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await _electron.launch(options)
      } catch (e) {
        if (attempt >= 5 || !/ETXTBSY|used by another process|failed to launch/i.test(String(e)))
          throw e
        await new Promise((r) => setTimeout(r, 1000 * attempt))
      }
    }
  },
}
