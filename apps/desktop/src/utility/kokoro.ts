import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import {
  KOKORO_MAX_TOKENS,
  KOKORO_SAMPLE_RATE,
  TARGET_SAMPLE_RATE,
  chunkTokenIds,
  concatAudio,
  ipaToTokenIds,
  resampleLinear,
  splitSentences,
  styleRow,
  trimSilence,
  withPad,
} from '@engclaw/pronounce'
import { createSession, DEFAULT_PROVIDERS } from './sessions'
import type { Synthesizer } from './speech'

/** One model call: padded token ids + style row -> 24 kHz audio. */
export type KokoroRun = (
  tokens: number[],
  style: Float32Array,
  speed: number,
) => Promise<Float32Array>

export interface KokoroOptions {
  /** Revision/voice tag that keys the audio cache. */
  id: string
  /** Text -> espeak IPA (stress kept, `_` between phones allowed); one line per input line. */
  ipa: (lines: string[]) => Promise<string[]>
  run: KokoroRun
  vocab: Readonly<Record<string, number>>
  /** Style pack for the chosen voice: `[510, 1, 256]` flattened. */
  voice: Float32Array
  speed?: number
}

/** Text -> Kokoro tokens -> audio, trimmed and resampled to 16 kHz for scoring and playback. */
export class KokoroSynthesizer implements Synthesizer {
  readonly id: string
  constructor(private readonly o: KokoroOptions) {
    this.id = o.id
  }

  async synthesize(text: string): Promise<Float32Array> {
    const sentences = splitSentences(text)
    if (sentences.length === 0) throw new Error('speak: nothing to say')
    // espeak is line-for-line and the shared backend strips punctuation, so feed plain word lines.
    const lines = await this.o.ipa(sentences.map((s) => (s.match(/[\w']+/g) ?? []).join(' ')))
    const parts: Float32Array[] = []
    for (const line of lines) {
      const ids = ipaToTokenIds(line, this.o.vocab)
      for (const chunk of chunkTokenIds(ids, KOKORO_MAX_TOKENS)) {
        const audio = await this.o.run(
          withPad(chunk),
          styleRow(this.o.voice, chunk.length),
          this.o.speed ?? 1,
        )
        parts.push(trimSilence(audio, 0.005, Math.round(KOKORO_SAMPLE_RATE * 0.05)))
      }
    }
    const joined = concatAudio(parts)
    if (joined.length === 0) throw new Error('speak: synthesis produced no audio')
    return resampleLinear(joined, KOKORO_SAMPLE_RATE, TARGET_SAMPLE_RATE)
  }
}

export interface KokoroFiles {
  /** Folder holding the installed Kokoro model (see the models catalog). */
  dir: string
  model: string
  /** HF `tokenizer.json`; the token vocabulary is `model.vocab` (`{char: id}`). */
  tokenizer: string
  /** Folder of raw float32 voice packs, one `<voice>.bin` each (`[510, 1, 256]`). */
  voices: string
  voice: string
}

/** Layout of `onnx-community/Kokoro-82M-v1.0-ONNX` (the pinned upstream repo, ENGC-50). */
export const DEFAULT_KOKORO_FILES = {
  model: 'onnx/model.onnx',
  tokenizer: 'tokenizer.json',
  voices: 'voices',
  voice: 'af_heart',
} as const

export interface KokoroAssets {
  modelPath: string
  vocab: Record<string, number>
  voice: Float32Array
}

export function readKokoroAssets(files: KokoroFiles): KokoroAssets {
  const tok = JSON.parse(readFileSync(join(files.dir, files.tokenizer), 'utf8')) as {
    model?: { vocab?: Record<string, number> }
  }
  const vocab = tok.model?.vocab
  if (!vocab) throw new Error(`kokoro: no vocab in ${files.tokenizer}`)
  const voicePath = join(files.dir, files.voices, `${files.voice}.bin`)
  if (!existsSync(voicePath))
    throw new Error(`kokoro: voice ${files.voice} not found in ${files.voices}`)
  const b = readFileSync(voicePath)
  const voice = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length))
  return { modelPath: join(files.dir, files.model), vocab, voice }
}

/** Loads vocab + voice pack and an onnxruntime-node session (WebGPU first, CPU fallback). */
export async function loadKokoro(
  files: KokoroFiles,
  ipa: KokoroOptions['ipa'],
  providers: string[] = DEFAULT_PROVIDERS,
): Promise<KokoroSynthesizer> {
  const { modelPath, vocab, voice } = readKokoroAssets(files)
  const { ort, session } = await createSession(modelPath, providers)
  const run: KokoroRun = async (tokens, style, speed) => {
    const out = await session.run({
      input_ids: new ort.Tensor('int64', BigInt64Array.from(tokens.map(BigInt)), [
        1,
        tokens.length,
      ]),
      style: new ort.Tensor('float32', style, [1, style.length]),
      speed: new ort.Tensor('float32', Float32Array.of(speed), [1]),
    })
    return new Float32Array(
      (out['waveform'] as import('onnxruntime-node').Tensor).data as Float32Array,
    )
  }
  return new KokoroSynthesizer({
    id: `${basename(dirname(files.dir))}-${basename(files.dir)}-${files.voice}`,
    ipa,
    run,
    vocab,
    voice,
  })
}
