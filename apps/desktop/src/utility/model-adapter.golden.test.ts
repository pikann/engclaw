import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadModelAdapter } from './model-adapter'
import { ortBackend } from './model-adapter'

/**
 * Adapter vs the Python reference on the golden audio. Needs the real ONNX models and the
 * reference dump (tests/golden/logits.py), so it only runs when both are present:
 *   ENGCLAW_MODEL_PHONE=<phone model folder> ENGCLAW_MODEL_ASR=<asr-en model folder> vitest run model-adapter.golden
 */
const golden = new URL('../../../../tests/golden/', import.meta.url)
const CASE = 'bundled-developer'

function wavSamples(path: URL): Float32Array {
  const b = readFileSync(path)
  const pcm = new Int16Array(
    b.buffer.slice(b.byteOffset + 44, b.byteOffset + b.length - ((b.length - 44) % 2)),
  )
  return Float32Array.from(pcm, (v) => v / 32768)
}

for (const [name, env] of [
  ['phone', 'ENGCLAW_MODEL_PHONE'],
  ['asr-en', 'ENGCLAW_MODEL_ASR'],
] as const) {
  const dir = process.env[env]
  const ref = new URL(`logits/${name}-${CASE}.json`, golden)
  describe.skipIf(!dir || !existsSync(ref))(`model adapter vs Python reference (${name})`, () => {
    it('matches vocab, blank id, frame count and logits', async () => {
      const py = JSON.parse(readFileSync(ref, 'utf8')) as {
        vocab: Record<string, number>
        blank_id: number
        frames: number
        logits: number[][]
      }
      const adapter = await loadModelAdapter(dir!, ortBackend)
      try {
        const out = await adapter.run(wavSamples(new URL(`audio/${CASE}.wav`, golden)))
        expect(adapter.vocab.blankId).toBe(py.blank_id)
        for (const [tok, id] of Object.entries(py.vocab)) expect(adapter.vocab.tokens[id]).toBe(tok)
        expect(out.frames).toBe(py.frames)
        let maxDiff = 0
        py.logits.forEach((row, f) =>
          row.forEach((v, k) => {
            maxDiff = Math.max(maxDiff, Math.abs(out.logits[f * out.vocabSize + k]! - v))
          }),
        )
        expect(maxDiff).toBeLessThan(5e-3) // fp32 noise (ENGC-9 measured 1.8e-3 on real speech)
      } finally {
        await adapter.dispose()
      }
    }, 120_000)
  })
}
