import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
const on = vi.fn()
const removeListener = vi.fn()
const exposeInMainWorld = vi.fn()
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, on, removeListener },
}))

import { IPC, invokeChannels } from '@engclaw/ipc-contract'

type Api = Record<string, unknown> & {
  ping(r: unknown): Promise<unknown>
  settings: {
    getLanguage(): Promise<string>
    onLanguageChanged(cb: (l: string) => void): () => void
  }
  youtube: { meta(r: unknown): Promise<unknown> }
  player: { setBounds(r: unknown): Promise<unknown>; command(r: unknown): Promise<unknown> }
}

async function load(): Promise<Api> {
  vi.resetModules()
  await import('./index')
  expect(exposeInMainWorld).toHaveBeenCalledTimes(1)
  expect(exposeInMainWorld.mock.calls[0]![0]).toBe('engclaw')
  return exposeInMainWorld.mock.calls[0]![1] as Api
}

describe('preload bridge', () => {
  beforeEach(() => vi.clearAllMocks())

  it('exposes exactly the typed api and no raw ipc primitives', async () => {
    const api = await load()
    expect(Object.keys(api).sort()).toEqual([
      'app',
      'contours',
      'deck',
      'dictionary',
      'game',
      'history',
      'inference',
      'models',
      'ping',
      'player',
      'settings',
      'tts',
      'youtube',
    ])
    const json = JSON.stringify(Object.keys(api.settings).concat(Object.keys(api.youtube)))
    for (const forbidden of ['ipcRenderer', 'invoke', 'send', 'on', 'require', 'fs', 'shell'])
      expect(json).not.toContain(`"${forbidden}"`)
    expect(exposeInMainWorld.mock.calls.map((c) => c[0])).toEqual(['engclaw'])
  })

  it('refuses invalid requests before they reach ipcRenderer', async () => {
    const api = await load()
    await expect(api.ping({ message: 123 })).rejects.toThrow()
    await expect(api.ping({ message: 'x', admin: true })).rejects.toThrow()
    await expect(api.youtube.meta({})).rejects.toThrow()
    await expect(api.player.setBounds({ x: -1, y: 0, width: 10, height: 10 })).rejects.toThrow()
    await expect(api.player.command({ type: 'seek', seconds: -5 })).rejects.toThrow()
    await expect(api.player.command({ type: 'eval', code: '1' })).rejects.toThrow()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('invokes only contract channels and validates responses', async () => {
    const api = await load()
    invoke.mockResolvedValueOnce({ echo: 'hi', platform: 'x' })
    await expect(api.ping({ message: 'hi' })).resolves.toEqual({ echo: 'hi', platform: 'x' })
    invoke.mockResolvedValueOnce({ echo: 1 })
    await expect(api.ping({ message: 'hi' })).rejects.toThrow()
    for (const [ch] of invoke.mock.calls) expect(invokeChannels).toHaveProperty([ch as string])
  })

  it('subscribes only to contract events and unsubscribes', async () => {
    const api = await load()
    const cb = vi.fn()
    const off = api.settings.onLanguageChanged(cb)
    expect(on.mock.calls[0]![0]).toBe(IPC.settingsLanguageChanged)
    const listener = on.mock.calls[0]![1] as (e: unknown, p: unknown) => void
    listener({}, 'vi')
    expect(cb).toHaveBeenCalledWith('vi')
    expect(() => listener({}, { evil: true })).toThrow()
    off()
    expect(removeListener).toHaveBeenCalledWith(IPC.settingsLanguageChanged, listener)
  })
})
