import { app, BrowserWindow, dialog, net, shell } from 'electron'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { IPC, type ModelOpResult } from '@engclaw/ipc-contract'
import { Catalog, ModelError, ModelManager } from '@engclaw/models'
import { t } from './i18n'
import { handle } from './ipc'
import { loadModelsDir, saveModelsDir } from './settings'

/** The `models.json` shipped with the app; an unreadable catalog means no downloadable models. */
function loadCatalog(): Catalog {
  const dir = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  try {
    return Catalog.parse(JSON.parse(readFileSync(join(dir, 'models.json'), 'utf8')))
  } catch (e) {
    console.error('[models] cannot load models.json', e)
    return { models: [] }
  }
}

async function op(fn: () => Promise<void>): Promise<ModelOpResult> {
  try {
    await fn()
    return { ok: true }
  } catch (e) {
    if (e instanceof ModelError) return { ok: false, code: e.code, message: e.message }
    return { ok: false, code: 'NETWORK', message: String(e) }
  }
}

export function registerModelHandlers(): ModelManager {
  let modelsDir = loadModelsDir()
  const manager = new ModelManager({
    catalog: loadCatalog(),
    modelsDir: () => modelsDir,
    fetch: (url, init) => net.fetch(url, init),
    onProgress: (e) => {
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.modelsProgress, e)
    },
  })
  handle(IPC.modelsList, () => manager.list())
  handle(IPC.modelsDownload, ({ id }) => op(() => manager.download(id)))
  handle(IPC.modelsCancel, ({ id }) => {
    manager.cancel(id)
    return null
  })
  handle(IPC.modelsRemove, ({ id }) => op(() => manager.remove(id)))
  handle(IPC.modelsGetDir, () => modelsDir)
  handle(IPC.modelsChooseDir, async (_req, event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: t('dialog.chooseModelsDir'),
      defaultPath: modelsDir,
      properties: ['openDirectory', 'createDirectory'],
    }
    const res = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    const picked = res.filePaths[0]
    if (res.canceled || !picked) return null
    modelsDir = picked
    saveModelsDir(picked)
    return picked
  })
  handle(IPC.modelsOpenFolder, async () => {
    mkdirSync(modelsDir, { recursive: true })
    await shell.openPath(modelsDir)
    return null
  })
  return manager
}
