import { app, session, WebContentsView, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import { IPC, PlayerEvent, type PlayerBounds, type PlayerCommand } from '@engclaw/ipc-contract'
import { startPlayerServer, type PlayerServer } from './player-server'
import { isPlayerFrameUrlAllowed } from './security-policy'
import { secureWebPreferences } from './security'

// Mirrored in src/preload/player.ts.
const VIEW_EVENT = 'player:viewEvent'
const VIEW_COMMAND = 'player:viewCommand'
const PLAYER_PARTITION = 'engclaw-player'

/**
 * Hosts the YouTube player in a sandboxed WebContentsView layered over the app window. The view
 * has its own in-memory session (so the app CSP and microphone grant never apply to it), no access
 * to the app's IPC, and can only navigate to the loopback player page and YouTube's embed hosts.
 */
export class PlayerController {
  private view: WebContentsView | null = null
  private bounds: PlayerBounds = { x: 0, y: 0, width: 0, height: 0 }
  private server: PlayerServer | null = null
  private starting: Promise<PlayerServer> | null = null

  constructor(private readonly win: BrowserWindow) {
    win.once('closed', () => void this.dispose())
  }

  private ensureServer(): Promise<PlayerServer> {
    this.starting ??= startPlayerServer().then((s) => (this.server = s))
    return this.starting
  }

  async load(videoId: string): Promise<void> {
    this.close()
    const server = await this.ensureServer()
    if (this.win.isDestroyed()) return

    const ses = session.fromPartition(PLAYER_PARTITION)
    ses.setPermissionRequestHandler((_wc, _permission, cb) => cb(false))
    ses.setPermissionCheckHandler(() => false)

    const view = new WebContentsView({
      webPreferences: {
        ...secureWebPreferences,
        session: ses,
        preload: join(__dirname, '../preload/player.js'),
        autoplayPolicy: 'no-user-gesture-required',
      },
    })
    const wc = view.webContents
    wc.setUserAgent(
      wc
        .getUserAgent()
        .replace(/\sElectron\/\S+/, '')
        .replace(`${app.name}/`, 'App/'),
    )
    wc.setWindowOpenHandler(() => ({ action: 'deny' }))
    const guard = (e: Electron.Event, url: string): void => {
      if (!isPlayerFrameUrlAllowed(url, server.origin)) e.preventDefault()
    }
    wc.on('will-navigate', guard)
    wc.on('will-redirect', guard)
    wc.on('will-frame-navigate', (details) => guard(details, details.url))
    wc.on('will-attach-webview', (e) => e.preventDefault())

    const send = (event: PlayerEvent): void => {
      if (!this.win.isDestroyed()) this.win.webContents.send(IPC.playerEvent, event)
    }
    wc.ipc.on(VIEW_EVENT, (e, raw: unknown) => {
      if (e.senderFrame !== wc.mainFrame) return
      const parsed = PlayerEvent.safeParse(raw)
      if (parsed.success) send(parsed.data)
    })
    wc.on('did-fail-load', (_e, _code, _desc, _url, isMainFrame) => {
      if (isMainFrame) send({ type: 'error', code: 'UNAVAILABLE' })
    })
    wc.on('render-process-gone', () => send({ type: 'error', code: 'UNAVAILABLE' }))

    view.setBounds(this.bounds)
    this.win.contentView.addChildView(view)
    this.view = view
    void wc.loadURL(`${server.origin}/player.html?v=${encodeURIComponent(videoId)}`)
  }

  /** Remembered so bounds sent before the view finished loading still apply to it. */
  setBounds(bounds: PlayerBounds): void {
    this.bounds = bounds
    this.view?.setBounds(bounds)
  }

  command(command: PlayerCommand): void {
    this.view?.webContents.send(VIEW_COMMAND, command)
  }

  close(): void {
    this.bounds = { x: 0, y: 0, width: 0, height: 0 }
    const view = this.view
    if (!view) return
    this.view = null
    if (!this.win.isDestroyed()) this.win.contentView.removeChildView(view)
    if (!view.webContents.isDestroyed()) view.webContents.close()
  }

  async dispose(): Promise<void> {
    this.close()
    const server = this.server ?? (await this.starting?.catch(() => null)) ?? null
    this.server = null
    this.starting = null
    await server?.close()
  }
}
