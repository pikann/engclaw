import { mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SpeechService, type Synthesizer } from './speech'

let dir: string
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'tts-'))))
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function fake(id = 'v1') {
  const calls: string[] = []
  const synth: Synthesizer = {
    id,
    async synthesize(text) {
      calls.push(text)
      return Float32Array.from([text.length, 0.5, -0.25])
    },
  }
  return { synth, calls }
}

describe('SpeechService', () => {
  it('synthesizes once, then serves repeats from disk (even across restarts)', async () => {
    const { synth, calls } = fake()
    const first = await new SpeechService(synth, dir).speak('Hello world')
    expect(first.cached).toBe(false)
    expect(first.sampleRate).toBe(16000)

    const again = await new SpeechService(synth, dir).speak('Hello world')
    expect(again.cached).toBe(true)
    expect(again.samples).toEqual(first.samples)
    expect(calls).toEqual(['Hello world'])
  })

  it('treats whitespace differences as the same sentence but case as different', async () => {
    const { synth, calls } = fake()
    const s = new SpeechService(synth, dir)
    await s.speak('hello   world ')
    expect((await s.speak(' hello world')).cached).toBe(true)
    expect((await s.speak('Hello world')).cached).toBe(false)
    expect(calls).toHaveLength(2)
  })

  it('invalidates when the voice/model id changes', async () => {
    await new SpeechService(fake('a').synth, dir).speak('hi')
    expect((await new SpeechService(fake('b').synth, dir).speak('hi')).cached).toBe(false)
  })

  it('shares one synthesis between concurrent identical requests', async () => {
    const { synth, calls } = fake()
    const s = new SpeechService(synth, dir)
    const [a, b] = await Promise.all([s.speak('same'), s.speak('same')])
    expect(calls).toHaveLength(1)
    expect(a.samples).toEqual(b.samples)
  })

  it('rejects empty text and leaves no temp files behind', async () => {
    const { synth } = fake()
    const s = new SpeechService(synth, dir)
    await expect(s.speak('  ')).rejects.toThrow('empty')
    await s.speak('ok')
    expect(readdirSync(dir).every((f) => f.endsWith('.f32'))).toBe(true)
  })

  it('falls back to synthesis when a cache entry is corrupt', async () => {
    const { synth, calls } = fake()
    const s = new SpeechService(synth, dir)
    await s.speak('x1')
    const { writeFileSync } = await import('node:fs')
    for (const f of readdirSync(dir)) writeFileSync(join(dir, f), Buffer.from([1, 2, 3]))
    expect((await s.speak('x1')).cached).toBe(false)
    expect(calls).toHaveLength(2)
  })
})
