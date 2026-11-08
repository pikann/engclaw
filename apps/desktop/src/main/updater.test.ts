import { describe, expect, it, vi } from 'vitest'
import { checkForUpdatesOnLaunch, type UpdateDeps, type UpdaterLike } from './updater'

function fake() {
  const handlers: Record<string, (arg: never) => void> = {}
  const updater: UpdaterLike = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    allowPrerelease: false,
    on: vi.fn((event: string, cb: (arg: never) => void) => {
      handlers[event] = cb
    }) as UpdaterLike['on'],
    checkForUpdates: vi.fn(async () => null),
    quitAndInstall: vi.fn(),
  }
  return { updater, handlers }
}

const deps = (over: Partial<UpdateDeps> & { updater: UpdaterLike }): UpdateDeps => ({
  isPackaged: true,
  isEnabled: () => true,
  confirmRestart: async () => true,
  version: '1.0.0',
  ...over,
})

describe('checkForUpdatesOnLaunch', () => {
  it('checks and downloads in the background when enabled', async () => {
    const { updater } = fake()
    expect(await checkForUpdatesOnLaunch(deps({ updater }))).toBe(true)
    expect(updater.checkForUpdates).toHaveBeenCalledOnce()
    expect(updater.autoDownload).toBe(true)
    expect(updater.allowPrerelease).toBe(false)
  })

  it('does nothing when the user opted out', async () => {
    const { updater } = fake()
    expect(await checkForUpdatesOnLaunch(deps({ updater, isEnabled: () => false }))).toBe(false)
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('does nothing in an unpackaged (dev) build', async () => {
    const { updater } = fake()
    expect(await checkForUpdatesOnLaunch(deps({ updater, isPackaged: false }))).toBe(false)
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('follows the beta channel from a prerelease build', async () => {
    const { updater } = fake()
    await checkForUpdatesOnLaunch(deps({ updater, version: '1.1.0-beta.2' }))
    expect(updater.allowPrerelease).toBe(true)
  })

  it('restarts only when the user agrees', async () => {
    for (const agree of [true, false]) {
      const { updater, handlers } = fake()
      const confirmRestart = vi.fn(async () => agree)
      await checkForUpdatesOnLaunch(deps({ updater, confirmRestart }))
      handlers['update-downloaded']?.({ version: '1.2.0' } as never)
      await vi.waitFor(() => expect(confirmRestart).toHaveBeenCalledWith('1.2.0'))
      await Promise.resolve()
      expect(updater.quitAndInstall).toHaveBeenCalledTimes(agree ? 1 : 0)
    }
  })

  it('swallows update-check failures (offline)', async () => {
    const { updater } = fake()
    updater.checkForUpdates = vi.fn(async () => {
      throw new Error('net::ERR_INTERNET_DISCONNECTED')
    })
    const log = vi.fn()
    await expect(checkForUpdatesOnLaunch(deps({ updater, log }))).resolves.toBe(true)
    expect(log).toHaveBeenCalled()
  })
})
