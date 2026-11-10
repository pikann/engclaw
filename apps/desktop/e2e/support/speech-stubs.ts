import type { ElectronApplication } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Replaces the on-device speech engine (ASR, pronunciation analysis, intonation, TTS) in the main
 * process with scripted answers, so a run is deterministic and needs no downloaded models. The
 * recorder, IPC, renderer logic and UI stay real, and every call is logged with measurements of the
 * audio it received (length, RMS, peak): that is how a spec proves the fake-mic fixture really
 * reached the app.
 */
export const GOLDEN = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../tests/golden/cases/bundled-developer.json'), 'utf8'),
).result as Record<string, unknown> & { differences: Record<string, unknown> }

export interface Failure {
  ok: false
  code:
    'MODEL_MISSING' | 'INVALID_INPUT' | 'CLIP_TOO_LONG' | 'CANCELLED' | 'PROCESS_CRASHED' | 'FAILED'
  message?: string
  modelId?: string
}

export interface Step<T> {
  /** What the handler returns; `ok:true` steps carry the success value. */
  reply: { ok: true; value: T } | Failure
  /** Wait this long before answering (to hold a UI state open). */
  delayMs?: number
}

export interface TtsStep {
  reply:
    | { ok: true; seconds: number }
    | { ok: false; code: 'MODEL_MISSING' | 'FAILED'; message?: string }
  delayMs?: number
}

export interface SpeechScript {
  transcribe?: Step<{ text: string; language: string }>[]
  analyze?: Step<unknown>[]
  intonation?: Step<unknown>[]
  tts?: TtsStep[]
}

export interface AudioCall {
  requestId?: string
  seconds: number
  rms: number
  peak: number
  /** Analyze only: the sentence the learner was asked to say. */
  text?: string
}
export interface SpeakCall {
  text: string
}
export interface CallLog {
  transcribe: AudioCall[]
  analyze: AudioCall[]
  intonation: AudioCall[]
  tts: SpeakCall[]
  cancel: string[]
}

export const heard = (text: string): Step<{ text: string; language: string }> => ({
  reply: { ok: true, value: { text, language: 'en' } },
})

export const fail = (
  code: Failure['code'],
  message = code.toLowerCase(),
  modelId?: string,
): Failure => ({
  ok: false,
  code,
  message,
  ...(modelId ? { modelId } : {}),
})

/** A pronunciation result built from the golden "developer" analysis with a chosen score. */
export function scored(score: number, opts: { flagged?: boolean; transcript?: string } = {}) {
  const errors = opts.flagged
    ? [
        {
          position: 0,
          word: 'hello',
          expected: 'həloʊ',
          actual: 'eloʊ',
          actual_word: 'ello',
          phone_distance: 1,
          confidence: 0.9,
          phones: [],
        },
      ]
    : []
  return {
    ok: true as const,
    value: {
      ...GOLDEN,
      score,
      feedback: { code: score >= 80 ? 'EXCELLENT' : 'NEEDS_WORK', words: [] },
      differences: {
        ...GOLDEN.differences,
        errors,
        ...(opts.transcript !== undefined ? { transcribe: opts.transcript } : {}),
        feedback: { code: score >= 80 ? 'EXCELLENT' : 'NEEDS_WORK', words: [] },
      },
    },
  }
}

export const analyzed = (score: number, opts?: Parameters<typeof scored>[1]): Step<unknown> => ({
  reply: scored(score, opts),
})

const DEFAULTS: Required<SpeechScript> = {
  transcribe: [heard('Hello, I am a developer')],
  analyze: [analyzed(90)],
  intonation: [{ reply: fail('FAILED', 'no intonation in e2e') }],
  tts: [{ reply: { ok: true, seconds: 0.3 } }],
}

/** Installs the scripted handlers. The last step of each list repeats once the list runs out. */
export async function stubSpeech(
  app: ElectronApplication,
  script: SpeechScript = {},
): Promise<void> {
  const merged = { ...DEFAULTS, ...script }
  await app.evaluate(({ ipcMain }, scripts) => {
    type G = { __e2e?: unknown }
    const log = { transcribe: [], analyze: [], intonation: [], tts: [], cancel: [] } as Record<
      string,
      unknown[]
    >
    ;(globalThis as G).__e2e = log
    const measure = (audio: Float32Array) => {
      let sum = 0
      let peak = 0
      for (const x of audio) {
        sum += x * x
        peak = Math.max(peak, Math.abs(x))
      }
      return {
        seconds: audio.length / 16000,
        rms: audio.length ? Math.sqrt(sum / audio.length) : 0,
        peak,
      }
    }
    const next = <T>(steps: T[], n: number): T => steps[Math.min(n, steps.length - 1)]!
    const sleep = (ms?: number) => (ms ? new Promise((r) => setTimeout(r, ms)) : undefined)
    const audioChannel = (channel: string, key: 'transcribe' | 'analyze' | 'intonation'): void => {
      ipcMain.removeHandler(channel)
      ipcMain.handle(
        channel,
        async (_e, req: { requestId?: string; audio: Float32Array; text?: string }) => {
          const n = log[key]!.length
          log[key]!.push({
            requestId: req.requestId,
            ...measure(req.audio),
            ...(req.text !== undefined ? { text: req.text } : {}),
          })
          const step = next(scripts[key] as { reply: unknown; delayMs?: number }[], n)
          await sleep(step.delayMs)
          return step.reply
        },
      )
    }
    audioChannel('inference:transcribe', 'transcribe')
    audioChannel('inference:analyze', 'analyze')
    audioChannel('inference:intonation', 'intonation')

    ipcMain.removeHandler('inference:cancel')
    ipcMain.handle('inference:cancel', (_e, req: { requestId: string }) => {
      log['cancel']!.push(req.requestId)
      return null
    })

    ipcMain.removeHandler('tts:speak')
    ipcMain.handle('tts:speak', async (_e, req: { text: string }) => {
      const n = log['tts']!.length
      log['tts']!.push({ text: req.text })
      const step = next(scripts.tts, n)
      await sleep(step.delayMs)
      if (!step.reply.ok) return step.reply
      const rate = 16000
      const samples = new Float32Array(Math.round(rate * step.reply.seconds))
      for (let i = 0; i < samples.length; i++)
        samples[i] = 0.02 * Math.sin((2 * Math.PI * 220 * i) / rate)
      return { ok: true, samples, sampleRate: rate, cached: false, ms: 1 }
    })
  }, merged)
}

export const callLog = (app: ElectronApplication): Promise<CallLog> =>
  app.evaluate(() => (globalThis as unknown as { __e2e: never }).__e2e)

/** Resolves once `kind` has been called `count` times (default once). */
export async function waitForCalls(
  app: ElectronApplication,
  kind: keyof CallLog,
  count = 1,
  timeout = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeout
  for (;;) {
    if ((await callLog(app))[kind].length >= count) return
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${count} ${kind} call(s)`)
    await new Promise((r) => setTimeout(r, 100))
  }
}

/** Voice activity threshold used by the recorder (lib/audio/vad.ts). */
export const SPEECH_RMS = 0.01
