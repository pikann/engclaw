/**
 * Automated version of the Electron security checklist (System Architecture §6, ENGC-53).
 * Static checks over the source/config so a regression fails CI before anything is packaged.
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..')
const desktop = join(root, 'apps/desktop')
const read = (...p: string[]) => readFileSync(join(...p), 'utf8')
const require_ = createRequire(import.meta.url)

const security = read(desktop, 'src/main/security.ts')
const mainIndex = read(desktop, 'src/main/index.ts')
const preload = read(desktop, 'src/preload/index.ts')
const html = read(desktop, 'src/renderer/index.html')

describe('window web preferences', () => {
  it.each([
    ['contextIsolation', 'true'],
    ['sandbox', 'true'],
    ['nodeIntegration', 'false'],
    ['nodeIntegrationInWorker', 'false'],
    ['nodeIntegrationInSubFrames', 'false'],
    ['webSecurity', 'true'],
    ['allowRunningInsecureContent', 'false'],
    ['webviewTag', 'false'],
  ])('%s: %s', (key, value) => {
    expect(security).toMatch(new RegExp(`\\b${key}: ${value}\\b`))
  })

  it('every BrowserWindow spreads the secure preferences and sets nothing weaker', () => {
    expect(mainIndex).toContain('...secureWebPreferences')
    expect(mainIndex).not.toMatch(
      /nodeIntegration:\s*true|contextIsolation:\s*false|sandbox:\s*false/,
    )
    expect(mainIndex).not.toMatch(
      /webSecurity:\s*false|enableRemoteModule|allowRunningInsecureContent:\s*true/,
    )
  })

  it('hardens each window (open handler, navigation, webview)', () => {
    expect(mainIndex).toContain('hardenWindow(win)')
    for (const needle of [
      'setWindowOpenHandler',
      "action: 'deny'",
      'will-navigate',
      'will-redirect',
      'will-attach-webview',
      'isAllowedExternalUrl',
    ])
      expect(security).toContain(needle)
  })

  it('shell.openExternal is only reached through the https allow-list', () => {
    const all = [mainIndex, security, read(desktop, 'src/main/menu.ts')]
    for (const src of all)
      for (const m of src.matchAll(/shell\.openExternal\(/g)) {
        const before = src.slice(Math.max(0, m.index! - 120), m.index)
        expect(before).toContain('isAllowedExternalUrl')
      }
  })
})

describe('renderer origin and CSP', () => {
  it('serves the renderer from app://, never file://', () => {
    expect(mainIndex).toContain('${APP_ORIGIN}/')
    expect(mainIndex).not.toMatch(/loadFile\(/)
  })
  it('installs the CSP header and permission handlers on the session', () => {
    for (const needle of [
      'onHeadersReceived',
      'Content-Security-Policy',
      'setPermissionRequestHandler',
      'setPermissionCheckHandler',
    ])
      expect(security).toContain(needle)
  })
  it('index.html has no inline script and no weaker meta CSP', () => {
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/)
    expect(html).not.toMatch(/http-equiv="Content-Security-Policy"/i)
  })
})

describe('IPC surface', () => {
  it('preload never exposes ipcRenderer or other generic primitives', () => {
    const exposed = preload.slice(preload.indexOf('exposeInMainWorld'))
    expect(exposed).toMatch(/exposeInMainWorld\('engclaw', api\)/)
    expect(preload).not.toMatch(/exposeInMainWorld\([^)]*ipcRenderer/)
    expect(preload).not.toMatch(/\b(ipcRenderer\.send|sendSync|ipcRenderer\.on\(\s*(?!channel))/)
    expect(preload).not.toMatch(/require\(|child_process|from 'node:fs'|webFrame/)
  })

  it('main uses the validated handle() wrapper, never raw ipcMain', () => {
    expect(mainIndex).not.toMatch(/ipcMain/)
    expect(mainIndex).not.toMatch(/ipcMain\.(on|once|handleOnce)/)
    const ipc = read(desktop, 'src/main/ipc.ts')
    expect(ipc.match(/ipcMain\.handle\(/g)).toHaveLength(1)
    expect(ipc).not.toMatch(/ipcMain\.(on|once)\(/)
  })

  it('the renderer only uses window.engclaw, not electron', () => {
    const files = [
      'src/renderer/src/main.tsx',
      'src/renderer/src/routes/home.tsx',
      'src/renderer/src/lib/i18n.ts',
    ]
    for (const f of files)
      expect(read(desktop, f)).not.toMatch(/from 'electron'|require\(|ipcRenderer/)
  })
})

describe('Electron fuses and packaging', () => {
  const { fuses } = require_(join(desktop, 'build/after-pack.cjs')) as {
    fuses: Record<string | number, unknown>
  }
  const { FuseV1Options } = createRequire(join(desktop, 'package.json'))('@electron/fuses') as {
    FuseV1Options: Record<string, number>
  }

  it('disables runAsNode, NODE_OPTIONS and inspect args; enables asar integrity', () => {
    expect(fuses[FuseV1Options.RunAsNode!]).toBe(false)
    expect(fuses[FuseV1Options.EnableNodeOptionsEnvironmentVariable!]).toBe(false)
    expect(fuses[FuseV1Options.EnableNodeCliInspectArguments!]).toBe(false)
    expect(fuses[FuseV1Options.EnableEmbeddedAsarIntegrityValidation!]).toBe(true)
    expect(fuses[FuseV1Options.OnlyLoadAppFromAsar!]).toBe(true)
    expect(fuses[FuseV1Options.GrantFileProtocolExtraPrivileges!]).toBe(false)
  })

  it('electron-builder runs the fuse hook and packs into asar', () => {
    const yml = read(desktop, 'electron-builder.yml')
    expect(yml).toMatch(/^afterPack: build\/after-pack\.cjs$/m)
    expect(yml).toMatch(/^asar: true$/m)
  })
})
