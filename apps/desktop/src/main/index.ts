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
import { registerModelHandlers } from './models'
import { registerStoreHandlers } from './history'
import { registerInferenceHandlers } from './inference'
import { registerTtsHandlers } from './tts'
import { registerDeckHandlers } from './deck'
import { registerDictionaryHandlers } from './dictionary'
import { registerGameHandlers } from './game'
import { registerLlmHandlers } from './llm/register'
import { UtilityClient } from './utility-client'
import { loadLanguage, saveLanguage } from './settings'
import { InnertubeAdapter, YouTubeError, parseVideoId } from '@engclaw/youtube'
import { PlayerController } from './player'
import { AudioRangeCache } from './audio-range-cache'
import { CachedYouTube } from './youtube-cache'
import { startAutoUpdate } from './updater'

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
  // E2E headless mode: the window is still created and rendered, just never shown. A hidden window
  // is otherwise throttled, which stalls CSS transitions and makes axe read mid-transition colours.
  const headless = !app.isPackaged && process.env['ENGCLAW_E2E_HEADLESS'] === '1'
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 960,
    minHeight: 600,
    useContentSize: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      ...secureWebPreferences,
      ...(headless && { backgroundThrottling: false }),
    },
  })
  if (!headless) win.once('ready-to-show', () => win.show())
  hardenWindow(win)
  if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void win.loadURL(`${APP_ORIGIN}/`)
  return win
}

function startUtility(): Electron.UtilityProcess {
  const child = utilityProcess.fork(join(__dirname, 'utility.js'))
  child.on('message', (m) => console.log('[utility]', m))
  child.postMessage({ type: 'hello' })
  return child
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
    const r = m.report as { sqlite: { ok: boolean }; ort: { ok: boolean }; espeak: { ok: boolean } }
    child.removeAllListeners('exit')
    app.exit(r.sqlite.ok && r.ort.ok && r.espeak.ok ? 0 : 1)
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

const players = new WeakMap<BrowserWindow, PlayerController>()

function registerPlayerHandlers(): void {
  const playerFor = (e: Electron.IpcMainInvokeEvent): PlayerController | null => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return null
    let player = players.get(win)
    if (!player) players.set(win, (player = new PlayerController(win)))
    return player
  }
  handle(IPC.playerLoad, async ({ videoId }, e) => {
    await playerFor(e)?.load(parseVideoId(videoId))
    return null
  })
  handle(IPC.playerBounds, (bounds, e) => {
    playerFor(e)?.setBounds(bounds)
    return null
  })
  handle(IPC.playerCommand, (command, e) => {
    playerFor(e)?.command(command)
    return null
  })
  handle(IPC.playerClose, (_req, e) => {
    playerFor(e)?.close()
    return null
  })
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
  const llmConfig = registerLlmHandlers()
  const store = registerStoreHandlers(() => llmConfig.clear())
  const models = registerModelHandlers()
  const cachedYoutube = new CachedYouTube(
    youtube,
    store.videos,
    new AudioRangeCache(join(app.getPath('temp'), 'engclaw-audio'), 200 * 1024 * 1024),
  )
  handle(IPC.youtubeMeta, ({ videoId }) => yt(() => cachedYoutube.meta(parseVideoId(videoId))))
  handle(IPC.youtubeTranscript, ({ videoId, lang }) =>
    yt(() => cachedYoutube.transcript(parseVideoId(videoId), lang)),
  )
  handle(IPC.youtubeAudioRange, ({ videoId, start, end }) =>
    yt(() => cachedYoutube.audioRange(parseVideoId(videoId), start, end)),
  )
  handle(IPC.youtubeRecent, () => cachedYoutube.recent())
  handle(IPC.youtubeGetSettings, ({ videoId }) => store.videos.getSettings(parseVideoId(videoId)))
  handle(IPC.youtubeSaveSettings, ({ videoId, settings }) => {
    store.videos.saveSettings(parseVideoId(videoId), settings)
    return null
  })
  registerPlayerHandlers()
  registerGameHandlers(store.game)
  registerDeckHandlers(store, registerDictionaryHandlers(store))
  createWindow()
  if (process.env['ENGCLAW_SMOKE']) runSmoke(startUtility())
  const inference = new UtilityClient(startUtility)
  registerTtsHandlers(inference, models)
  registerInferenceHandlers(inference, models, store.videos)
  if (!process.env['ENGCLAW_SMOKE']) startAutoUpdate(() => store.settings.get().checkForUpdates)
})

app.on('window-all-closed', () => app.quit())
