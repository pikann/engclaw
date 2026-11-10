import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Sound fixtures for the features that listen to the microphone (practice, shadowing, game,
 * converse). Chromium's fake capture device loops one WAV file, so each fixture is a clip the
 * recorder will hear over and over:
 *
 * - `speech`: a real recording of "Hello, I am a developer" (tests/golden/audio), ~1.9 s.
 * - `speechThenSilence`: the same sentence followed by 3 s of silence, so the 2 s silence
 *   auto-stop fires on its own.
 * - `silence`: 4 s of digital silence (nothing to hear).
 * - `tone`: 3 s of a steady 220 Hz tone, loud but not speech.
 * - `quiet`: the speech scaled to ~0.1 % of its level, below the voice-activity threshold.
 *
 * Everything but `speech` is generated, so no extra binaries are committed.
 */
export const SAMPLE_RATE = 16_000

const GOLDEN = resolve(__dirname, '../../../../tests/golden/audio/bundled-developer.wav')

/** Reads a 16-bit PCM mono WAV (the golden clips are 16 kHz) into floats in [-1, 1]. */
export function readWav(path: string): Float32Array {
  const b = readFileSync(path)
  let off = 12
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4)
    const size = b.readUInt32LE(off + 4)
    if (id === 'data') {
      const n = Math.floor(Math.min(size, b.length - off - 8) / 2)
      const out = new Float32Array(n)
      for (let i = 0; i < n; i++) out[i] = b.readInt16LE(off + 8 + i * 2) / 32768
      return out
    }
    off += 8 + size + (size % 2)
  }
  throw new Error(`no data chunk in ${path}`)
}

/** Writes 16-bit PCM mono at 16 kHz. */
export function writeWav(path: string, samples: Float32Array): void {
  const data = Buffer.alloc(samples.length * 2)
  samples.forEach((s, i) =>
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2),
  )
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + data.length, 4)
  h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20) // PCM
  h.writeUInt16LE(1, 22) // mono
  h.writeUInt32LE(SAMPLE_RATE, 24)
  h.writeUInt32LE(SAMPLE_RATE * 2, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(data.length, 40)
  writeFileSync(path, Buffer.concat([h, data]))
}

export const silenceSamples = (seconds: number): Float32Array =>
  new Float32Array(Math.round(seconds * SAMPLE_RATE))

export function toneSamples(hz: number, seconds: number, amplitude = 0.3): Float32Array {
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE))
  for (let i = 0; i < out.length; i++)
    out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE)
  return out
}

const concat = (...parts: Float32Array[]): Float32Array => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

export type AudioFixture = 'speech' | 'speechThenSilence' | 'silence' | 'tone' | 'quiet'

let cache: Record<AudioFixture, string> | null = null

/** Absolute paths of every fixture, written once per worker into a temp folder. */
export function audioFixtures(): Record<AudioFixture, string> {
  if (cache) return cache
  const dir = mkdtempSync(join(tmpdir(), 'engclaw-e2e-fixtures-'))
  const speech = readWav(GOLDEN)
  const make = (name: string, samples: Float32Array): string => {
    const p = join(dir, `${name}.wav`)
    writeWav(p, samples)
    return p
  }
  cache = {
    speech: GOLDEN,
    speechThenSilence: make('speech-then-silence', concat(speech, silenceSamples(3))),
    silence: make('silence', silenceSamples(4)),
    tone: make('tone', toneSamples(220, 3)),
    quiet: make(
      'quiet',
      speech.map((s) => s * 0.001),
    ),
  }
  return cache
}

/** Duration of the golden speech clip, in seconds. */
export const SPEECH_SECONDS = readWav(GOLDEN).length / SAMPLE_RATE
