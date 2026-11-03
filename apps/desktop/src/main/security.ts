import { session, shell, type BrowserWindow, type WebPreferences } from 'electron'
import {
  buildCsp,
  isAllowedExternalUrl,
  isPermissionAllowed,
  isTrustedUrl,
} from './security-policy'

const devUrl = (): string | undefined => process.env['ELECTRON_RENDERER_URL']

export const secureWebPreferences: WebPreferences = {
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
}

/** Session-wide: mic-only permissions for our origin, CSP header on every response. */
export function installSessionSecurity(): void {
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((_wc, permission, cb, details) =>
    cb(isPermissionAllowed(permission, details.requestingUrl, devUrl())),
  )
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
    isPermissionAllowed(permission, requestingOrigin, devUrl()),
  )
  const csp = buildCsp(Boolean(devUrl()))
  ses.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] },
    })
  })
}

/** Per-window: deny new windows, block navigation away from the app, forbid webviews. */
export function hardenWindow(win: BrowserWindow): void {
  const wc = win.webContents
  wc.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  wc.on('will-navigate', (e, url) => {
    if (!isTrustedUrl(url, devUrl())) e.preventDefault()
  })
  wc.on('will-redirect', (e, url) => {
    if (!isTrustedUrl(url, devUrl())) e.preventDefault()
  })
  wc.on('will-attach-webview', (e) => e.preventDefault())
}
