import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { InferenceError } from './errors'
import { loadModelAdapter, type Backend } from './model-adapter'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'adapter-'))
  mkdirSync(join(dir, 'tokenizer'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const write = (name: string, json: unknown) => writeFileSync(join(dir, name), JSON.stringify(json))

function fakeBackend(extra: Record<string, { data: Float32Array; dims: number[] }> = {}) {
  const inputs: Float32Array[] = []
  const backend: Backend = {
    async run(input) {
      inputs.push(input)
      return { logits: { data: new Float32Array(2 * 3), dims: [1, 2, 3] }, ...extra }
    },
    dispose: async () => undefined,
  }
  return { inputs, create: async () => backend }
}

describe('loadModelAdapter', () => {
  it('reads vocab, blank id and frame rate from the model folder', async () => {
    write('preprocessor_config.json', { do_normalize: true, sampling_rate: 16000 })
    write('config.json', { conv_stride: [5, 2, 2, 2, 2, 2, 2] })
    write('tokenizer/vocab.json', { '<pad>': 0, a: 1, b: 2 })
    const a = await loadModelAdapter(dir, fakeBackend().create)
    expect(a.vocab).toEqual({ tokens: ['<pad>', 'a', 'b'], blankId: 0 })
    expect(a.frameSeconds).toBeCloseTo(0.02)
    expect(a.sampleRate).toBe(16000)
  })

  it('normalizes to zero mean / unit variance before the session and returns logits', async () => {
    write('preprocessor_config.json', { do_normalize: true, sampling_rate: 16000 })
    write('vocab.json', { '<pad>': 0, a: 1, b: 2 })
    const f = fakeBackend()
    const out = await (await loadModelAdapter(dir, f.create)).run(Float32Array.from([1, 2, 3, 4]))
    const x = f.inputs[0]!
    expect(x.reduce((s, v) => s + v, 0) / 4).toBeCloseTo(0, 5)
    expect(x.reduce((s, v) => s + v * v, 0) / 4).toBeCloseTo(1, 4)
    expect(out).toMatchObject({ frames: 2, vocabSize: 3 })
    expect(out.hidden).toBeUndefined()
  })

  it('passes the waveform through unchanged when do_normalize is false, and exposes hidden_states', async () => {
    write('preprocessor_config.json', { do_normalize: false })
    write('vocab.json', { '<pad>': 0, a: 1, b: 2 })
    const f = fakeBackend({ hidden_states: { data: new Float32Array(2 * 4), dims: [1, 2, 4] } })
    const input = Float32Array.from([1, 2, 3])
    const out = await (await loadModelAdapter(dir, f.create)).run(input)
    expect(f.inputs[0]).toEqual(input)
    expect(out).toMatchObject({ hiddenSize: 4 })
  })

  it('rejects logits that do not match the vocab, and empty audio', async () => {
    write('preprocessor_config.json', {})
    write('vocab.json', { '<pad>': 0, a: 1 })
    const a = await loadModelAdapter(dir, fakeBackend().create)
    await expect(a.run(Float32Array.of(1))).rejects.toMatchObject({ code: 'FAILED' })
    await expect(a.run(new Float32Array(0))).rejects.toBeInstanceOf(InferenceError)
  })

  it('fails clearly when the folder has no vocab', async () => {
    write('preprocessor_config.json', {})
    await expect(loadModelAdapter(dir, fakeBackend().create)).rejects.toThrow(/vocab/)
  })

  describe('long audio', () => {
    const SR = 16000
    const ramp = (seconds: number) => Float32Array.from({ length: seconds * SR }, (_, i) => i)
    // One logit/hidden value per frame = the frame's global index, so a correct merge is 0..N-1.
    function framewise() {
      const calls: number[] = []
      const backend: Backend = {
        async run(input) {
          calls.push(input.length)
          const start = input[0]! / 320
          const n = Math.floor(input.length / 320)
          const logits = new Float32Array(n * 3)
          const hidden = new Float32Array(n * 2)
          for (let f = 0; f < n; f++) {
            logits[f * 3] = start + f
            hidden[f * 2] = start + f
          }
          return {
            logits: { data: logits, dims: [1, n, 3] },
            hidden_states: { data: hidden, dims: [1, n, 2] },
          }
        },
        dispose: async () => undefined,
      }
      return { calls, create: async () => backend }
    }
    const adapter = async (f: ReturnType<typeof framewise>) => {
      write('preprocessor_config.json', { do_normalize: false, sampling_rate: SR })
      write('vocab.json', { '<pad>': 0, a: 1, b: 2 })
      return loadModelAdapter(dir, f.create)
    }

    it('runs clips of up to 30 s in a single pass', async () => {
      const f = framewise()
      const out = await (await adapter(f)).run(ramp(30))
      expect(f.calls).toEqual([30 * SR])
      expect(out.frames).toBe(1500)
    })

    it('splits longer clips into 30 s windows with 2 s overlap and merges them without gaps or repeats', async () => {
      const f = framewise()
      const out = await (await adapter(f)).run(ramp(60))
      expect(f.calls).toEqual([30 * SR, 30 * SR, 4 * SR])
      expect(out.frames).toBe(Math.floor((60 * SR) / 320))
      expect(Array.from({ length: out.frames }, (_, i) => out.logits[i * 3])).toEqual(
        Array.from({ length: out.frames }, (_, i) => i),
      )
      expect(Array.from({ length: out.frames }, (_, i) => out.hidden![i * 2])).toEqual(
        Array.from({ length: out.frames }, (_, i) => i),
      )
      expect(out.hiddenSize).toBe(2)
    })
  })
})
