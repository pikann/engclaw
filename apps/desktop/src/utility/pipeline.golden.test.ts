import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CachedPhonemizer } from '@engclaw/pronounce'
import { analyzeRecording, type Control } from './analyze'
import { EspeakProcess } from './espeak'
import { DEFAULT_KOKORO_FILES, loadKokoro } from './kokoro'
import { loadModelAdapter, ortBackend } from './model-adapter'

/**
 * Whole TS pipeline vs the Python OpenPronounce reference on every golden case (tests/golden).
 * Needs the real models and espeak-ng, so it only runs when they are present:
 *   ENGCLAW_MODEL_PHONE=<phone folder> ENGCLAW_MODEL_ASR=<asr-en folder> \
 *   ENGCLAW_MODEL_KOKORO=<kokoro folder> [ESPEAK_NG=<binary>] vitest run pipeline.golden
 *
 * Strict: transcript, expected phones, word error flags. Tolerant: PER, score (the reference voice
 * differs, Kokoro here vs gTTS upstream, see tests/golden/README.md), prosody length.
 */
const dirs = {
  phone: process.env['ENGCLAW_MODEL_PHONE'],
  asr: process.env['ENGCLAW_MODEL_ASR'],
  kokoro: process.env['ENGCLAW_MODEL_KOKORO'],
}
const ready = Boolean(dirs.phone && dirs.asr && dirs.kokoro)
const golden = new URL('../../../../tests/golden/', import.meta.url)
const ctl: Control = { stage: () => undefined, check: () => undefined }

function wavSamples(path: URL): Float32Array {
  const b = readFileSync(path)
  const pcm = new Int16Array(
    b.buffer.slice(b.byteOffset + 44, b.byteOffset + b.length - ((b.length - 44) % 2)),
  )
  return Float32Array.from(pcm, (v) => v / 32768)
}

interface Case {
  id: string
  text: string
  result: {
    score: number
    transcribe: string
    differences: {
      expected_phones: string[]
      heard_phones: string[]
      phoneme_error_rate: number
      words_with_errors: string[]
    }
    prosody: { f0: number[]; energy: number[] }
  }
}

describe.skipIf(!ready || !existsSync(new URL('cases/', golden)))(
  'pipeline vs Python reference (golden cases)',
  () => {
    it('matches transcript, phones and flagged words on every case', async () => {
      const espeak = new EspeakProcess({
        binary: process.env['ESPEAK_NG'] ?? 'espeak-ng',
        dataPath: process.env['ESPEAK_DATA_PATH'],
      })
      const phonemizer = new CachedPhonemizer(espeak)
      const phone = await loadModelAdapter(dirs.phone!, ortBackend)
      const asr = await loadModelAdapter(dirs.asr!, ortBackend)
      const kokoro = await loadKokoro({ dir: dirs.kokoro!, ...DEFAULT_KOKORO_FILES }, (l) =>
        espeak.phonemize(l),
      )
      try {
        const files = readdirSync(new URL('cases/', golden)).filter((f) => f.endsWith('.json'))
        expect(files.length).toBeGreaterThan(0)
        const phoneErrorDeltas: number[] = []
        const scoreDeltas: number[] = []
        const latencies: number[] = []
        for (const file of files) {
          const c = JSON.parse(readFileSync(new URL(`cases/${file}`, golden), 'utf8')) as Case
          const audio = wavSamples(new URL(`audio/${c.id}.wav`, golden))
          const t0 = performance.now()
          const r = await analyzeRecording(
            { phone, asr, phonemizer, reference: (t) => kokoro.synthesize(t) },
            audio,
            c.text,
            'en',
            ctl,
          )
          latencies.push(performance.now() - t0)
          const d = c.result.differences
          expect(r.transcribe, `${c.id} transcript`).toBe(c.result.transcribe)
          expect(r.differences.expected_phones, `${c.id} expected phones`).toEqual(
            d.expected_phones,
          )
          expect(r.differences.heard_phones, `${c.id} heard phones`).toEqual(d.heard_phones)
          expect(new Set(r.differences.words_with_errors), `${c.id} flagged words`).toEqual(
            new Set(d.words_with_errors),
          )
          expect(r.prosody.f0.length, `${c.id} f0 frames`).toBe(c.result.prosody.f0.length)
          expect(r.prosody.energy.length, `${c.id} energy frames`).toBe(
            c.result.prosody.energy.length,
          )
          phoneErrorDeltas.push(Math.abs(r.differences.phoneme_error_rate - d.phoneme_error_rate))
          scoreDeltas.push(Math.abs(r.score - c.result.score))
        }
        // Same phone model and phonemizer, so PER must agree closely; scores differ by reference voice.
        expect(Math.max(...phoneErrorDeltas)).toBeLessThan(0.02)
        const meanScoreDelta = scoreDeltas.reduce((a, b) => a + b, 0) / scoreDeltas.length
        const sorted = [...latencies].sort((a, b) => a - b)
        console.log(
          `[golden] latency ms median=${Math.round(sorted[sorted.length >> 1]!)} max=${Math.round(sorted.at(-1)!)} rssMB=${Math.round(process.memoryUsage().rss / 1e6)}`,
        )
        console.log(`[golden] mean |score delta| vs Python: ${meanScoreDelta.toFixed(2)}`)
        expect(meanScoreDelta).toBeLessThan(15)
      } finally {
        await phone.dispose()
        await asr.dispose()
        espeak.dispose()
      }
    }, 900_000)
  },
)
