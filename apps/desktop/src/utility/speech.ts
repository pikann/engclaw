import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { TARGET_SAMPLE_RATE } from '@engclaw/pronounce'

export interface SpeechResult {
  /** Mono float32 PCM at 16 kHz. */
  samples: Float32Array
  sampleRate: number
  cached: boolean
}

/** Produces 16 kHz mono reference audio for a sentence (Kokoro in production). */
export interface Synthesizer {
  /** Part of the cache key: changes when the voice or model revision changes. */
  readonly id: string
  synthesize(text: string): Promise<Float32Array>
}

/**
 * `speak(text)`: synthesize once, then serve the sentence from a disk cache keyed by a hash of
 * (synthesizer id, normalized text). Concurrent identical requests share one synthesis.
 */
export class SpeechService {
  private readonly inflight = new Map<string, Promise<SpeechResult>>()

  constructor(
    private readonly synth: Synthesizer,
    private readonly cacheDir: string,
  ) {}

  speak(text: string): Promise<SpeechResult> {
    const normalized = text.trim().replace(/\s+/g, ' ')
    if (!normalized) return Promise.reject(new Error('speak: empty text'))
    const key = createHash('sha256').update(`${this.synth.id}\n${normalized}`).digest('hex')
    const path = join(this.cacheDir, `${key}.f32`)

    const hit = this.read(path)
    if (hit) return Promise.resolve({ samples: hit, sampleRate: TARGET_SAMPLE_RATE, cached: true })

    let pending = this.inflight.get(key)
    if (!pending) {
      pending = this.synth
        .synthesize(normalized)
        .then((samples) => {
          this.write(path, samples)
          return { samples, sampleRate: TARGET_SAMPLE_RATE, cached: false }
        })
        .finally(() => this.inflight.delete(key))
      this.inflight.set(key, pending)
    }
    return pending.then((r) => ({ ...r, samples: r.samples.slice() }))
  }

  private read(path: string): Float32Array | null {
    try {
      const bytes = readFileSync(path)
      if (bytes.length === 0 || bytes.length % 4 !== 0) return null
      return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length))
    } catch {
      return null
    }
  }

  /** Atomic (tmp + rename) so a crash never leaves a half-written entry; cache failures are non-fatal. */
  private write(path: string, samples: Float32Array): void {
    try {
      mkdirSync(this.cacheDir, { recursive: true })
      const tmp = `${path}.${process.pid}.tmp`
      writeFileSync(tmp, new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength))
      renameSync(tmp, path)
    } catch (e) {
      console.error('[tts] cache write failed', e)
    }
  }
}
