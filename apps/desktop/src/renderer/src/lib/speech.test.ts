import { describe, expect, it } from 'vitest'
import { prefetchSpeech } from './speech'

describe('prefetchSpeech', () => {
  it('speaks each text in order, one at a time', async () => {
    const calls: string[] = []
    let busy = false
    const api = {
      async speak({ text }: { text: string }) {
        expect(busy).toBe(false)
        busy = true
        await Promise.resolve()
        calls.push(text)
        busy = false
        return { ok: true }
      },
    }
    expect(await prefetchSpeech(['a', 'b', 'c'], api, () => true)).toBe(3)
    expect(calls).toEqual(['a', 'b', 'c'])
  })

  it('stops quietly at the first failure', async () => {
    const calls: string[] = []
    const api = {
      async speak({ text }: { text: string }) {
        calls.push(text)
        return { ok: text !== 'b' }
      },
    }
    expect(await prefetchSpeech(['a', 'b', 'c'], api, () => true)).toBe(1)
    expect(calls).toEqual(['a', 'b'])
  })

  it('stops when rejected or no longer live', async () => {
    const boom = { speak: () => Promise.reject(new Error('x')) }
    expect(await prefetchSpeech(['a'], boom, () => true)).toBe(0)
    let n = 0
    const ok = { speak: async () => ({ ok: true }) }
    expect(await prefetchSpeech(['a', 'b', 'c'], ok, () => n++ < 1)).toBe(1)
  })
})
