import { app, BrowserWindow, dialog, net, shell } from 'electron'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { IPC, type ModelOpResult } from '@engclaw/ipc-contract'
import {
  Catalog,
  checkModelsDir,
  ModelError,
  ModelManager,
  SPACE_MARGIN_BYTES,
} from '@engclaw/models'
import { t } from './i18n'
import { handle } from './ipc'
import { loadModelsDir, saveModelsDir } from './settings'

/** The `models.json` shipped with the app; an unreadable catalog means no downloadable models. */
function loadCatalog(): Catalog {
  const dir = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  // Unpackaged builds only: E2E tests point the app at a stub catalog and server.
  const file = (!app.isPackaged && process.env['ENGCLAW_E2E_CATALOG']) || join(dir, 'models.json')
  try {
    return Catalog.parse(JSON.parse(readFileSync(file, 'utf8')))
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

const HF = 'https://huggingface.co/'

/** Download requests; unpackaged E2E runs can redirect Hugging Face to a local stub server. */
function modelFetch(url: string, init: RequestInit): Promise<Response> {
  const stub = app.isPackaged ? undefined : process.env['ENGCLAW_E2E_MODELS_URL']
  return net.fetch(
    stub && url.startsWith(HF) ? stub.replace(/\/?$/, '/') + url.slice(HF.length) : url,
    init,
  )
}

export function registerModelHandlers(): ModelManager {
  let modelsDir = loadModelsDir()
  const manager = new ModelManager({
    catalog: loadCatalog(),
    modelsDir: () => modelsDir,
    fetch: modelFetch,
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
    if (res.canceled || !picked) return { status: 'cancelled' }
    const info = await checkModelsDir(picked)
    if (!info.writable) return { status: 'rejected', reason: 'NOT_WRITABLE', info, neededBytes: 0 }
    // Models already installed in the picked folder need no room; the rest must fit.
    const previous = modelsDir
    modelsDir = picked
    const neededBytes = (await manager.list())
      .filter((m) => m.state !== 'ready')
      .reduce((n, m) => n + m.sizeBytes, 0)
    if (neededBytes > 0 && info.freeBytes < neededBytes + SPACE_MARGIN_BYTES) {
      modelsDir = previous
      return { status: 'rejected', reason: 'DISK_SPACE', info, neededBytes }
    }
    saveModelsDir(picked)
    return { status: 'chosen', info }
  })
  handle(IPC.modelsDiskInfo, () => checkModelsDir(modelsDir))
  handle(IPC.modelsOpenFolder, async () => {
    mkdirSync(modelsDir, { recursive: true })
    await shell.openPath(modelsDir)
    return null
  })
  return manager
}
