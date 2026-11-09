import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeWaveform, parseVocab, type Vocab } from '@engclaw/pronounce'
import { InferenceError } from './errors'
import { createSession } from './sessions'

export interface NamedTensor {
  data: Float32Array
  dims: readonly number[]
}

/** A loaded graph: `input_values [1, samples]` in, named float32 tensors out. */
export interface Backend {
  run(input: Float32Array): Promise<Record<string, NamedTensor>>
  dispose(): Promise<void>
}

export interface ModelOutput {
  /** Flat `(frames, vocabSize)`. */
  logits: Float32Array
  frames: number
  vocabSize: number
  /** Last-layer hidden states, flat `(frames, hiddenSize)`; only for exports that have them (asr-en). */
  hidden?: Float32Array
  hiddenSize?: number
}

/**
 * Inference glue for the fixed wav2vec2 models (what transformers.js used to do): waveform
 * normalization, tensor creation, output handling, and the vocab / blank id / frame rate read from
 * the model folder. Never hard-codes a vocabulary.
 */
export interface ModelAdapter {
  readonly vocab: Vocab
  readonly sampleRate: number
  /** Seconds per output frame (20 ms for wav2vec2). */
  readonly frameSeconds: number
  run(samples: Float32Array): Promise<ModelOutput>
  dispose(): Promise<void>
}

/** Clips longer than this are run in overlapping windows so one pass never holds a huge activation. */
export const CHUNK_SECONDS = 30
export const CHUNK_OVERLAP_SECONDS = 2

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

/** Product of the feature-encoder conv strides = samples per frame (320 for wav2vec2). */
function samplesPerFrame(dir: string): number {
  const cfgPath = join(dir, 'config.json')
  if (!existsSync(cfgPath)) return 320
  const stride = readJson<{ conv_stride?: number[] }>(cfgPath).conv_stride
  return stride?.length ? stride.reduce((a, b) => a * b, 1) : 320
}

export async function loadModelAdapter(
  dir: string,
  createBackend: (onnxPath: string) => Promise<Backend> = ortBackend,
): Promise<ModelAdapter> {
  const pre = readJson<{ do_normalize?: boolean; sampling_rate?: number }>(
    join(dir, 'preprocessor_config.json'),
  )
  const sampleRate = pre.sampling_rate ?? 16000
  const doNormalize = pre.do_normalize ?? true
  const vocabPath = [join(dir, 'tokenizer', 'vocab.json'), join(dir, 'vocab.json')].find(existsSync)
  if (!vocabPath) throw new InferenceError('FAILED', `model folder has no vocab.json: ${dir}`)
  const vocab = parseVocab(readJson<Record<string, number>>(vocabPath))
  const frameSeconds = samplesPerFrame(dir) / sampleRate
  const backend = await createBackend(join(dir, 'onnx', 'model.onnx'))

  const runWindow = async (samples: Float32Array): Promise<ModelOutput> => {
    const out = await backend.run(doNormalize ? normalizeWaveform(samples) : samples)
    const logits = out['logits']
    if (!logits || logits.dims.length !== 3 || logits.dims[2] !== vocab.tokens.length)
      throw new InferenceError('FAILED', 'model logits do not match its vocab.json')
    const hidden = out['hidden_states']
    return {
      logits: logits.data,
      frames: logits.dims[1]!,
      vocabSize: logits.dims[2]!,
      ...(hidden ? { hidden: hidden.data, hiddenSize: hidden.dims[2]! } : {}),
    }
  }

  const windowSamples = Math.round(CHUNK_SECONDS * sampleRate)
  const strideSamples = Math.round((CHUNK_SECONDS - CHUNK_OVERLAP_SECONDS) * sampleRate)
  // Each side of a seam keeps its own half of the overlap, where it has the most context.
  const dropFrames = Math.round(CHUNK_OVERLAP_SECONDS / 2 / frameSeconds)

  const runChunked = async (samples: Float32Array): Promise<ModelOutput> => {
    const parts: ModelOutput[] = []
    for (let start = 0; ; start += strideSamples) {
      const last = start + windowSamples >= samples.length
      const out = await runWindow(samples.subarray(start, start + windowSamples))
      const from = start === 0 ? 0 : dropFrames
      const to = last ? out.frames : out.frames - dropFrames
      parts.push({
        ...out,
        logits: out.logits.subarray(from * out.vocabSize, to * out.vocabSize),
        frames: to - from,
        ...(out.hidden
          ? { hidden: out.hidden.subarray(from * out.hiddenSize!, to * out.hiddenSize!) }
          : {}),
      })
      if (last) break
    }
    const frames = parts.reduce((n, p) => n + p.frames, 0)
    const first = parts[0]!
    const logits = new Float32Array(frames * first.vocabSize)
    const hidden = first.hidden ? new Float32Array(frames * first.hiddenSize!) : undefined
    let lo = 0
    let ho = 0
    for (const p of parts) {
      logits.set(p.logits, lo)
      lo += p.logits.length
      if (hidden && p.hidden) {
        hidden.set(p.hidden, ho)
        ho += p.hidden.length
      }
    }
    return {
      logits,
      frames,
      vocabSize: first.vocabSize,
      ...(hidden ? { hidden, hiddenSize: first.hiddenSize! } : {}),
    }
  }

  return {
    vocab,
    sampleRate,
    frameSeconds,
    async run(samples) {
      if (samples.length === 0) throw new InferenceError('INVALID_INPUT', 'empty audio')
      return samples.length <= windowSamples ? runWindow(samples) : runChunked(samples)
    },
    dispose: () => backend.dispose(),
  }
}

/** onnxruntime-node backend built from the shared session factory. */
export async function ortBackend(onnxPath: string): Promise<Backend> {
  const { ort, session } = await createSession(onnxPath)
  return {
    async run(input) {
      const out = await session.run({
        input_values: new ort.Tensor('float32', input, [1, input.length]),
      })
      const named: Record<string, NamedTensor> = {}
      for (const [name, t] of Object.entries(out))
        named[name] = { data: t.data as Float32Array, dims: t.dims }
      return named
    },
    dispose: () => session.release(),
  }
}
