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
})
