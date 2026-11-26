import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { VAD_FRAME } from '@engclaw/pronounce'
import { loadSileroVad } from './vad'

const require = createRequire(new URL('../../package.json', import.meta.url))
const ort = require('onnxruntime-node') as typeof import('onnxruntime-node')
const model = fileURLToPath(
  new URL('../../resources/vad/silero_vad_16k_op15.onnx', import.meta.url),
)
const load = () =>
  loadSileroVad(model, async (path, providers) => ({
    ort,
    session: await ort.InferenceSession.create(path, { executionProviders: providers }),
  }))
/** 16 kHz mono 16-bit PCM from the golden test audio. */
function wav(name: string): Float32Array {
  const bytes = readFileSync(new URL(`../../../../tests/golden/audio/${name}.wav`, import.meta.url))
  const data = bytes.indexOf('data') + 8
  const pcm = new Int16Array(
    bytes.buffer.slice(bytes.byteOffset + data, bytes.byteOffset + bytes.length),
  )
  return Float32Array.from(pcm, (v) => v / 32768)
}

describe('Silero VAD with the bundled model', () => {
  it('hears speech in a recording and none in silence', async () => {
    const vad = await load()
    const speech = await vad.probabilities(wav('bundled-developer'))
    const silence = await vad.probabilities(new Float32Array(32000))
    expect(Math.max(...speech)).toBeGreaterThan(0.9)
    expect(Math.max(...silence)).toBeLessThan(0.15)
    await vad.dispose()
  })

  it('gives one probability per frame, counting a final partial frame', async () => {
    const vad = await load()
    expect(await vad.probabilities(new Float32Array(VAD_FRAME * 3 + 1))).toHaveLength(4)
    expect(await vad.probabilities(new Float32Array(0))).toHaveLength(0)
    await vad.dispose()
  })

  it('gives the same values in pieces when the state is carried over', async () => {
    const vad = await load()
    const audio = wav('bundled-developer')
    const whole = await vad.probabilities(audio)
    let state: Float32Array | undefined
    let other: Float32Array | undefined
    const pieces: number[] = []
    for (let at = 0; at + 4 * VAD_FRAME <= audio.length; at += 4 * VAD_FRAME) {
      const out = await vad.process(audio.subarray(at, at + 4 * VAD_FRAME), state)
      state = out.state
      pieces.push(...out.probs)
      // Another recording in between must not disturb this one.
      other = (await vad.process(new Float32Array(VAD_FRAME), other)).state
    }
    expect(pieces.length).toBeGreaterThan(20)
    pieces.forEach((p, i) => expect(p).toBeCloseTo(whole[i]!, 6))
    await vad.dispose()
  })

  it('rejects audio that is not whole frames, and a state it did not make', async () => {
    const vad = await load()
    await expect(vad.process(new Float32Array(100))).rejects.toThrow('512')
    await expect(vad.process(new Float32Array(VAD_FRAME), new Float32Array(3))).rejects.toThrow(
      'state',
    )
    await vad.dispose()
  })
})
