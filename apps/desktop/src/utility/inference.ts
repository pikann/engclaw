import type { InferenceProgress, PhonemizeResult } from '@engclaw/ipc-contract'
import { getLanguage, type Phonemizer } from '@engclaw/pronounce'
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
}

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
      const lang = this.language(languageCode)
      const [phone, asr] = [
        await this.adapter('phone', dirs.phone, lang.phoneModelId, ctl),
        await this.adapter('asr', dirs.asr, lang.asrModelId, ctl),
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
      const lang = this.language(languageCode)
      const asr = await this.adapter('asr', dirs.asr, lang.asrModelId, ctl)
      ctl.stage('transcribing')
      return { text: (await transcribeAudio(asr, audio)).text, language: lang.code }
    })
  }

  async phonemize(text: string, languageCode: string | undefined): Promise<PhonemizeResult> {
    const lang = this.language(languageCode)
    return {
      words: await this.deps.phonemizer.getPhonemesWithWordMapping(text),
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
  ): Promise<ModelAdapter> {
    if (!dir) throw new InferenceError('MODEL_MISSING', `model not installed: ${modelId}`, modelId)
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
