import {
  app,
  BrowserWindow,
  ipcMain,
  net,
  protocol,
  session,
  shell,
  utilityProcess,
} from 'electron'
import { join, normalize } from 'node:path'
import { pathToFileURL } from 'node:url'
import { IPC, PingRequest, type PingResponse } from '@engclaw/ipc-contract'

const APP_ORIGIN = 'app://engclaw'
const rendererDir = join(__dirname, '../renderer')

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

function registerAppProtocol(): void {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1))
    const file = normalize(join(rendererDir, rel))
    if (!file.startsWith(rendererDir)) return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(file).toString())
  })
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (
      !url.startsWith(APP_ORIGIN) &&
      url !== process.env['ELECTRON_RENDERER_URL'] &&
      !url.startsWith(process.env['ELECTRON_RENDERER_URL'] ?? '\0')
    )
      e.preventDefault()
  })
  if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void win.loadURL(`${APP_ORIGIN}/`)
  return win
}

function startUtility(): void {
  const child = utilityProcess.fork(join(__dirname, 'utility.js'))
  child.on('message', (m) => console.log('[utility]', m))
  child.postMessage({ type: 'hello' })
}

void app.whenReady().then(() => {
  registerAppProtocol()
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb, details) =>
    cb(permission === 'media' && details.requestingUrl.startsWith(APP_ORIGIN)),
  )
  ipcMain.handle(IPC.ping, (_e, raw): PingResponse => {
    const req = PingRequest.parse(raw)
    return { echo: req.message, platform: process.platform }
  })
  createWindow()
  startUtility()
})

app.on('window-all-closed', () => app.quit())
