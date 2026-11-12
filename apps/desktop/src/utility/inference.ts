import { mandarinReadings, mandarinResult } from './mandarin'
import { freemem } from 'node:os'
import type { InferenceProgress, PhonemizeResult } from '@engclaw/ipc-contract'
import { forcedAlignWords, getLanguage, logSoftmax, type Phonemizer } from '@engclaw/pronounce'
import { analyzeSegmentProsody, type SegmentProsody } from '@engclaw/prosody'
import { analyzeRecording, transcribeAudio, type Control } from './analyze'
import { InferenceError } from './errors'
import type { ModelAdapter } from './model-adapter'

export type Kind = 'phone' | 'asr'

export interface ServiceDeps {
  /** Loads the model folder as an adapter (onnxruntime-backed in production). */
  loadAdapter(dir: string): Promise<ModelAdapter>
  phonemizer: Phonemizer
  /** Reference-voice audio (16 kHz mono) for a sentence, from the Kokoro speech service. */
  speak(text: string): Promise<Float32Array>
  /** Models stay warm this long after the last request, then are released (default 5 min). */
  idleMs?: number
  /** Free system memory in bytes (defaults to `os.freemem`); injectable for tests. */
  freeMemoryBytes?: () => number
}

/** Below this much free memory, models the current request does not need are unloaded first. */
const LOW_MEMORY_BYTES = 2 ** 30

export interface ModelDirs {
  phone?: string
  asr?: string
}

export interface CallOptions {
  signal: AbortSignal
  onStage(stage: InferenceProgress['stage']): void
}

interface Slot {
  dir: string
  adapter: Promise<ModelAdapter>
}

/** Longest recording `analyze` / `transcribe` accept (seconds of 16 kHz audio). */
export const MAX_CLIP_SECONDS = 900

const assertClipLength = (audio: Float32Array) => {
  if (audio.length > MAX_CLIP_SECONDS * 16000)
    throw new InferenceError('CLIP_TOO_LONG', `recordings are limited to ${MAX_CLIP_SECONDS} s`)
}

const STAGE_FOR: Record<Kind, InferenceProgress['stage']> = {
  phone: 'loading-phone-model',
  asr: 'loading-asr-model',
}

/**
 * Orchestrates the fixed models behind `analyze / transcribe / phonemize`. Models load lazily on
 * first use, are shared between requests, and are released after an idle period. Requests run one
 * at a time so two fp32 wav2vec2 models are never executing (or loading) concurrently.
 */
export class InferenceService {
  private readonly slots = new Map<Kind, Slot>()
  private queue: Promise<unknown> = Promise.resolve()
  private idleTimer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly deps: ServiceDeps) {}

  analyze(
    audio: Float32Array,
    text: string,
    languageCode: string | undefined,
    dirs: ModelDirs,
    opts: CallOptions,
  ) {
    return this.exclusive(opts, async (ctl) => {
      assertClipLength(audio)
      const lang = this.language(languageCode)
      if (lang.code === 'zh') {
        const asr = await this.adapter('asr', dirs.asr, lang.asrModelId, ctl, ['asr'])
        ctl.stage('transcribing')
        const transcript = await transcribeAudio(asr, audio)
        ctl.check()
        ctl.stage('scoring')
        return mandarinResult(text, transcript.text)
      }
      const [phone, asr] = [
        await this.adapter('phone', dirs.phone, lang.phoneModelId, ctl, ['phone', 'asr']),
        await this.adapter('asr', dirs.asr, lang.asrModelId, ctl, ['phone', 'asr']),
      ]
      return analyzeRecording(
        { phone, asr, phonemizer: this.deps.phonemizer, reference: this.deps.speak },
        audio,
        text,
        lang.code,
        ctl,
      )
    })
  }

  transcribe(
    audio: Float32Array,
    languageCode: string | undefined,
    dirs: ModelDirs,
    opts: CallOptions,
  ) {
    return this.exclusive(opts, async (ctl) => {
      assertClipLength(audio)
      const lang = this.language(languageCode)
      const asr = await this.adapter('asr', dirs.asr, lang.asrModelId, ctl, ['asr'])
      ctl.stage('transcribing')
      return { text: (await transcribeAudio(asr, audio)).text, language: lang.code }
    })
  }

  /** Word timings from forced CTC alignment of `text` to `audio`, then pause/stress/pitch analysis. */
  prosody(
    audio: Float32Array,
    text: string,
    languageCode: string | undefined,
    dirs: ModelDirs,
    opts: CallOptions,
  ): Promise<SegmentProsody> {
    return this.exclusive(opts, async (ctl) => {
      const lang = this.language(languageCode)
      const asr = await this.adapter('asr', dirs.asr, lang.asrModelId, ctl, ['asr'])
      ctl.stage('transcribing')
      const out = await asr.run(audio)
      const logProbs = logSoftmax(out.logits, out.frames, out.vocabSize)
      const words = text.split(/\s+/).filter(Boolean)
      let spans
      try {
        spans = forcedAlignWords(logProbs, out.frames, asr.vocab, words)
      } catch (e) {
        throw new InferenceError('INVALID_INPUT', e instanceof Error ? e.message : String(e))
      }
      const frameSec = audio.length / 16000 / out.frames
      const timed = words.flatMap((w, i) =>
        spans[i]
          ? [{ text: w, start: spans[i]!.start * frameSec, end: spans[i]!.end * frameSec }]
          : [],
      )
      return analyzeSegmentProsody(audio, 16000, timed)
    })
  }

  async phonemize(text: string, languageCode: string | undefined): Promise<PhonemizeResult> {
    const lang = this.language(languageCode)
    return {
      words:
        lang.code === 'zh'
          ? mandarinReadings(text)
          : await this.deps.phonemizer.getPhonemesWithWordMapping(text),
      language: lang.code,
    }
  }

  /** Releases every loaded model (idle timeout, model update, shutdown). */
  async unloadAll(): Promise<void> {
    clearTimeout(this.idleTimer)
    const slots = [...this.slots.values()]
    this.slots.clear()
    await Promise.allSettled(slots.map((s) => s.adapter.then((a) => a.dispose())))
  }

  private language(code: string | undefined) {
    const lang = getLanguage(code)
    if (!lang) throw new InferenceError('UNSUPPORTED_LANGUAGE', `unsupported language: ${code}`)
    return lang
  }

  private async adapter(
    kind: Kind,
    dir: string | undefined,
    modelId: string,
    ctl: Control,
    needed: readonly Kind[],
  ): Promise<ModelAdapter> {
    if (!dir) throw new InferenceError('MODEL_MISSING', `model not installed: ${modelId}`, modelId)
    await this.relieveMemoryPressure(needed)
    let slot = this.slots.get(kind)
    if (slot && slot.dir !== dir) {
      // A new revision was installed: drop the old one before loading the next.
      this.slots.delete(kind)
      await slot.adapter.then(
        (a) => a.dispose(),
        () => undefined,
      )
      slot = undefined
    }
    if (!slot) {
      ctl.stage(STAGE_FOR[kind])
      const created: Slot = { dir, adapter: this.deps.loadAdapter(dir) }
      // A failed load must not poison the slot: the next request retries.
      created.adapter.catch(() => this.slots.get(kind) === created && this.slots.delete(kind))
      this.slots.set(kind, created)
      slot = created
    }
    const adapter = await slot.adapter
    ctl.check()
    return adapter
  }

  private async relieveMemoryPressure(needed: readonly Kind[]): Promise<void> {
    if ((this.deps.freeMemoryBytes ?? freemem)() >= LOW_MEMORY_BYTES) return
    for (const [kind, slot] of [...this.slots]) {
      if (needed.includes(kind)) continue
      this.slots.delete(kind)
      await slot.adapter.then(
        (a) => a.dispose(),
        () => undefined,
      )
    }
  }

  private exclusive<T>(opts: CallOptions, fn: (ctl: Control) => Promise<T>): Promise<T> {
    const ctl: Control = {
      stage: opts.onStage,
      check: () => {
        if (opts.signal.aborted) throw new InferenceError('CANCELLED', 'cancelled')
      },
    }
    const run = async () => {
      clearTimeout(this.idleTimer)
      try {
        ctl.check()
        return await fn(ctl)
      } finally {
        this.idleTimer = setTimeout(() => void this.unloadAll(), this.deps.idleMs ?? 300_000)
        this.idleTimer.unref?.()
      }
    }
    const result = this.queue.then(run, run)
    this.queue = result.catch(() => undefined)
    return result
  }
}
