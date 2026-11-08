import { app, dialog } from 'electron'
import electronUpdater from 'electron-updater'
import { t } from './i18n'

/** The slice of electron-updater's `AppUpdater` we use, so tests can substitute a fake. */
export interface UpdaterLike {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  on(event: 'update-downloaded', cb: (info: { version: string }) => void): unknown
  on(event: 'error', cb: (err: Error) => void): unknown
  checkForUpdates(): Promise<unknown>
  quitAndInstall(): void
}

export interface UpdateDeps {
  updater: UpdaterLike
  /** Only packaged builds have an update feed (`app-update.yml`). */
  isPackaged: boolean
  isEnabled: () => boolean
  /** Resolves true when the user chose to restart now. */
  confirmRestart: (version: string) => Promise<boolean>
  version: string
  log?: (msg: string) => void
}

/**
 * Checks GitHub Releases once on launch (when the user hasn't opted out), downloads in the
 * background, and offers a restart. Updates replace the app only; models live in userData.
 */
export async function checkForUpdatesOnLaunch(deps: UpdateDeps): Promise<boolean> {
  if (!deps.isPackaged || !deps.isEnabled()) return false
  const { updater } = deps
  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true
  // Stable installs stay on `latest`; a prerelease build (1.2.0-beta.1) follows the beta channel.
  updater.allowPrerelease = deps.version.includes('-')
  updater.on('update-downloaded', (info) => {
    void deps.confirmRestart(info.version).then((restart) => {
      if (restart) updater.quitAndInstall()
    })
  })
  updater.on('error', (err) => deps.log?.(`[updater] ${err.message}`))
  try {
    await updater.checkForUpdates()
  } catch (e) {
    deps.log?.(`[updater] ${String(e)}`)
  }
  return true
}

export function startAutoUpdate(isEnabled: () => boolean): void {
  void checkForUpdatesOnLaunch({
    updater: electronUpdater.autoUpdater,
    isPackaged: app.isPackaged,
    isEnabled,
    version: app.getVersion(),
    log: console.log,
    confirmRestart: async (version) => {
      const { response } = await dialog.showMessageBox({
        type: 'info',
        title: t('dialog.updateReadyTitle'),
        message: t('dialog.updateReadyMessage', { version }),
        buttons: [t('dialog.restart'), t('dialog.later')],
        defaultId: 0,
        cancelId: 1,
      })
      return response === 0
    },
  })
}
