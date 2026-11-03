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
import {
  AudioRangeRequest,
  IPC,
  PingRequest,
  TranscriptRequest,
  VideoRef,
  type PingResponse,
  type YouTubeResult,
} from '@engclaw/ipc-contract'
import { InnertubeAdapter, YouTubeError, parseVideoId } from '@engclaw/youtube'

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

const youtube = new InnertubeAdapter()

async function yt<T>(fn: () => Promise<T>): Promise<YouTubeResult<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (e) {
    if (e instanceof YouTubeError) return { ok: false, code: e.code, message: e.message }
    return { ok: false, code: 'EXTRACTOR_BROKEN', message: String(e) }
  }
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
  ipcMain.handle(IPC.youtubeMeta, (_e, raw) => {
    const { videoId } = VideoRef.parse(raw)
    return yt(() => youtube.meta(parseVideoId(videoId)))
  })
  ipcMain.handle(IPC.youtubeTranscript, (_e, raw) => {
    const { videoId, lang } = TranscriptRequest.parse(raw)
    return yt(() => youtube.transcript(parseVideoId(videoId), lang))
  })
  ipcMain.handle(IPC.youtubeAudioRange, (_e, raw) => {
    const { videoId, start, end } = AudioRangeRequest.parse(raw)
    return yt(() => youtube.audioRange(parseVideoId(videoId), start, end))
  })
  createWindow()
  startUtility()
})

app.on('window-all-closed', () => app.quit())
