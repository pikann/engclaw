import { beforeEach, describe, expect, it, vi } from 'vitest'

type Fn = (event: unknown, ...args: unknown[]) => unknown
const registered = new Map<string, Fn>()
vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: Fn) => registered.set(ch, fn) },
}))

import { IPC, invokeChannels } from '@engclaw/ipc-contract'
import { handle } from './ipc'

const good = { senderFrame: { url: 'app://engclaw/' } }
const call = (ch: string, event: unknown, ...args: unknown[]) => registered.get(ch)!(event, ...args)

describe('main IPC handle()', () => {
  beforeEach(() => registered.clear())

  it('runs the handler with a validated payload', async () => {
    handle(IPC.ping, (req) => ({ echo: req.message, platform: 'test' }))
    await expect(call(IPC.ping, good, { message: 'hi' })).resolves.toEqual({
      echo: 'hi',
      platform: 'test',
    })
  })

  it('rejects invalid payloads without running the handler', async () => {
    const spy = vi.fn()
    handle(IPC.ping, spy)
    for (const bad of [undefined, null, 'x', 1, {}, { message: 1 }, { message: 'a'.repeat(201) }])
      await expect(call(IPC.ping, good, bad)).rejects.toThrow()
    expect(spy).not.toHaveBeenCalled()
  })

  it('rejects unknown extra properties (strict schemas)', async () => {
    handle(IPC.ping, vi.fn())
    await expect(call(IPC.ping, good, { message: 'x', extra: 1 })).rejects.toThrow()
  })

  it('rejects extra positional arguments', async () => {
    handle(IPC.ping, vi.fn())
    await expect(call(IPC.ping, good, { message: 'x' }, 'more')).rejects.toThrow(/extra/)
  })

  it('rejects untrusted senders', async () => {
    const spy = vi.fn()
    handle(IPC.ping, spy)
    for (const url of ['https://evil.com/', 'file:///x', 'app://engclaw.evil.com/', ''])
      await expect(call(IPC.ping, { senderFrame: { url } }, { message: 'x' })).rejects.toThrow(
        /untrusted/,
      )
    await expect(call(IPC.ping, {}, { message: 'x' })).rejects.toThrow(/untrusted/)
    expect(spy).not.toHaveBeenCalled()
  })

  it('has no handler for channels that were never registered', () => {
    handle(IPC.ping, vi.fn())
    expect([...registered.keys()]).toEqual([IPC.ping])
    expect(registered.has('fs:readFile')).toBe(false)
  })

  it('only registers channels declared in the contract', () => {
    for (const ch of Object.values(IPC).filter((c) => c in invokeChannels))
      expect(invokeChannels).toHaveProperty([ch])
  })
})
