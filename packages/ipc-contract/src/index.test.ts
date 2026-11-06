import { describe, expect, it } from 'vitest'
import {
  eventChannels,
  invokeChannels,
  IPC,
  isEventChannel,
  isInvokeChannel,
  AudioRangeRequest,
  PingRequest,
} from './index'

describe('ipc contract', () => {
  it('rejects inverted, empty, oversized and unknown-key audio ranges', () => {
    const ok = { videoId: 'dQw4w9WgXcQ', start: 1, end: 5 }
    expect(AudioRangeRequest.safeParse(ok).success).toBe(true)
    for (const bad of [
      { ...ok, start: 5, end: 1 },
      { ...ok, start: 3, end: 3 },
      { ...ok, start: 0, end: 121 },
      { ...ok, url: 'https://evil.example' },
    ])
      expect(AudioRangeRequest.safeParse(bad).success).toBe(false)
  })

  it('every IPC channel has a schema (invoke or event)', () => {
    for (const ch of Object.values(IPC))
      expect(isInvokeChannel(ch) || isEventChannel(ch)).toBe(true)
  })

  it('every schema has a registered IPC name', () => {
    const names = new Set<string>(Object.values(IPC))
    for (const ch of [...Object.keys(invokeChannels), ...Object.keys(eventChannels)])
      expect(names.has(ch)).toBe(true)
  })

  it('channel names are namespaced', () => {
    for (const ch of Object.values(IPC)) expect(ch).toMatch(/^[a-z]+:[A-Za-z]+$/)
  })

  it('rejects unknown channels, including prototype keys', () => {
    for (const ch of ['fs:readFile', 'shell:exec', '__proto__', 'constructor', 'toString', ''])
      expect(isInvokeChannel(ch) || isEventChannel(ch)).toBe(false)
  })

  it('object request schemas are strict', () => {
    expect(PingRequest.safeParse({ message: 'a', x: 1 }).success).toBe(false)
    for (const [ch, { request }] of Object.entries(invokeChannels)) {
      const probe = request.safeParse({ __unexpected: 1 })
      expect(probe.success, ch).toBe(false)
    }
  })

  it('no-argument channels accept only undefined', () => {
    const { request } = invokeChannels[IPC.settingsGetLanguage]
    expect(request.safeParse(undefined).success).toBe(true)
    expect(request.safeParse({}).success).toBe(false)
  })
})
