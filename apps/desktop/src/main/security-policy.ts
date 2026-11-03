/** Pure security policy (no Electron imports) so it is unit-testable in Node. See System Architecture §6. */

export const APP_ORIGIN = 'app://engclaw'

/** Only HTTPS URLs may be handed to the OS browser. */
export function isAllowedExternalUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && u.username === '' && u.password === ''
  } catch {
    return false
  }
}

/** True for the packaged app origin, or the dev-server origin when one is configured. */
export function isTrustedUrl(raw: string, devUrl?: string): boolean {
  try {
    const u = new URL(raw)
    if (u.origin === APP_ORIGIN || (u.protocol === 'app:' && u.host === 'engclaw')) return true
    return devUrl !== undefined && devUrl !== '' && u.origin === new URL(devUrl).origin
  } catch {
    return false
  }
}

/** Only the microphone, and only for our own origin. */
export function isPermissionAllowed(
  permission: string,
  requestingUrl: string,
  devUrl?: string,
): boolean {
  return (
    (permission === 'media' || permission === 'audioCapture') && isTrustedUrl(requestingUrl, devUrl)
  )
}

/** Content-Security-Policy; dev additionally allows the Vite dev server (HMR websocket, react-refresh). */
export function buildCsp(dev: boolean): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': dev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'media-src': ["'self'", 'blob:'],
    'connect-src': dev ? ["'self'", 'ws://localhost:*', 'http://localhost:*'] : ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
    'frame-ancestors': ["'none'"],
  }
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(' ')}`)
    .join('; ')
}
