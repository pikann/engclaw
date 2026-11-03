import { app, BrowserWindow, net, protocol, systemPreferences, utilityProcess } from 'electron'
import { join, normalize } from 'node:path'
import { pathToFileURL } from 'node:url'
import { IPC, type YouTubeResult } from '@engclaw/ipc-contract'
import { isLocale, type Locale } from '@engclaw/i18n'
import { changeMainLanguage, initMainI18n } from './i18n'
import { handle } from './ipc'
import { buildMenu } from './menu'
import { APP_ORIGIN } from './security-policy'
import { hardenWindow, installSessionSecurity, secureWebPreferences } from './security'
import { loadLanguage, saveLanguage } from './settings'
import { InnertubeAdapter, YouTubeError, parseVideoId } from '@engclaw/youtube'

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
      ...secureWebPreferences,
    },
  })
  win.once('ready-to-show', () => win.show())
  hardenWindow(win)
  if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void win.loadURL(`${APP_ORIGIN}/`)
  return win
}

function startUtility(): void {
  const child = utilityProcess.fork(join(__dirname, 'utility.js'))
  child.on('message', (m) => console.log('[utility]', m))
  child.postMessage({ type: 'hello' })
  if (process.env['ENGCLAW_SMOKE']) runSmoke(child)
}

/** Packaging smoke test (ENGC-54): run the native-module checks in the utility process, print, exit. */
function runSmoke(child: Electron.UtilityProcess): void {
  const modelPath = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  child.on('message', (m: { type?: string; report?: unknown }) => {
    if (m.type !== 'smoke') return
    const mic =
      process.platform === 'darwin' || process.platform === 'win32'
        ? systemPreferences.getMediaAccessStatus('microphone')
        : 'n/a'
    const report = { ...(m.report as object), microphoneStatus: mic, packaged: app.isPackaged }
    console.log('SMOKE_RESULT ' + JSON.stringify(report))
    const r = m.report as { sqlite: { ok: boolean }; ort: { ok: boolean } }
    child.removeAllListeners('exit')
    app.exit(r.sqlite.ok && r.ort.ok ? 0 : 1)
  })
  child.on('exit', (code) => {
    console.log('SMOKE_RESULT utility exited early code=' + code)
    app.exit(2)
  })
  child.postMessage({ type: 'smoke', modelPath: join(modelPath, 'add.onnx') })
  setTimeout(() => app.exit(3), 90_000)
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

let language: Locale = 'en'

async function setLanguage(next: Locale): Promise<void> {
  language = next
  saveLanguage(next)
  await changeMainLanguage(next)
  buildMenu(next, (l) => void setLanguage(l))
  for (const w of BrowserWindow.getAllWindows())
    w.webContents.send(IPC.settingsLanguageChanged, next)
}

void app.whenReady().then(async () => {
  language = loadLanguage()
  await initMainI18n(language)
  buildMenu(language, (l) => void setLanguage(l))
  registerAppProtocol()
  installSessionSecurity()
  handle(IPC.ping, (req) => ({ echo: req.message, platform: process.platform }))
  handle(IPC.settingsGetLanguage, () => language)
  handle(IPC.settingsSetLanguage, async ({ language: next }) => {
    if (isLocale(next)) await setLanguage(next)
    return language
  })
  handle(IPC.youtubeMeta, ({ videoId }) => yt(() => youtube.meta(parseVideoId(videoId))))
  handle(IPC.youtubeTranscript, ({ videoId, lang }) =>
    yt(() => youtube.transcript(parseVideoId(videoId), lang)),
  )
  handle(IPC.youtubeAudioRange, ({ videoId, start, end }) =>
    yt(() => youtube.audioRange(parseVideoId(videoId), start, end)),
  )
  createWindow()
  startUtility()
})

app.on('window-all-closed', () => app.quit())
