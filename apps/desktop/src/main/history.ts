import { app, BrowserWindow, dialog } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { IPC, type HistoryFileResult } from '@engclaw/ipc-contract'
import { t } from './i18n'
import { handle } from './ipc'
import { openStore, type Store } from './store'

const filters = (): Electron.FileFilter[] => [{ name: 'JSON', extensions: ['json'] }]

/** Opens the SQLite store in `userData` and registers history + app-settings channels. */
export function registerStoreHandlers(): Store {
  const store = openStore(join(app.getPath('userData'), 'engclaw.db'))
  const parent = (e: Electron.IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender)

  handle(IPC.historySave, (req) => store.history.save(req))
  handle(IPC.historyList, (req) => ({
    attempts: store.history.list(req?.limit, req?.offset),
    total: store.history.count(),
  }))
  handle(IPC.historyAudio, ({ id }) => store.history.audio(id))
  handle(IPC.historyDelete, ({ id }) => store.history.remove(id))

  handle(IPC.historyExport, async (_req, event): Promise<HistoryFileResult> => {
    const win = parent(event)
    const options: Electron.SaveDialogOptions = {
      title: t('dialog.exportHistory'),
      defaultPath: join(app.getPath('documents'), 'engclaw-history.json'),
      filters: filters(),
    }
    const res = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (res.canceled || !res.filePath) return { status: 'cancelled' }
    try {
      const file = store.history.export()
      await writeFile(res.filePath, JSON.stringify(file))
      return { status: 'exported', count: file.attempts.length, path: res.filePath }
    } catch (e) {
      return { status: 'error', message: e instanceof Error ? e.message : String(e) }
    }
  })

  handle(IPC.historyImport, async (_req, event): Promise<HistoryFileResult> => {
    const win = parent(event)
    const options: Electron.OpenDialogOptions = {
      title: t('dialog.importHistory'),
      properties: ['openFile'],
      filters: filters(),
    }
    const res = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    const picked = res.filePaths[0]
    if (res.canceled || !picked) return { status: 'cancelled' }
    try {
      const raw: unknown = JSON.parse(await readFile(picked, 'utf8'))
      return { status: 'imported', ...store.history.import(raw) }
    } catch (e) {
      return { status: 'error', message: e instanceof Error ? e.message : String(e) }
    }
  })

  handle(IPC.appGetSettings, () => store.settings.get())
  handle(IPC.appUpdateSettings, (patch) => store.settings.update(patch))
  handle(IPC.appDeleteAllData, () => {
    store.deleteAll()
    return null
  })
  return store
}
