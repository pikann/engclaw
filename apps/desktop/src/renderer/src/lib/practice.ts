import type { InferenceErrorCode, PronunciationResult } from '@engclaw/ipc-contract'

/** Pure state for the Mode 2 practice card (text -> record/upload audio -> analyze). */

export const EXAMPLES = [
  'The quick brown fox jumps over the lazy dog.',
  'She sells seashells by the seashore.',
  'Would you like a cup of coffee or tea?',
  'I think this thoroughly thought-out plan works.',
] as const

export interface PracticeAudio {
  samples: Float32Array
  seconds: number
  source: 'mic' | 'file'
  truncated: boolean
}

export interface PracticeError {
  code: InferenceErrorCode
  message: string
  modelId?: string
}

export type PracticePhase = 'idle' | 'recording' | 'ready' | 'analyzing' | 'result' | 'error'

export interface PracticeState {
  phase: PracticePhase
  text: string
  /** Inline "enter a sentence" hint after an attempt with empty text. */
  hint: boolean
  audio: PracticeAudio | null
  result: PronunciationResult | null
  error: PracticeError | null
}

export type PracticeEvent =
  | { type: 'text'; text: string }
  | { type: 'record-requested' }
  | { type: 'recorded'; audio: PracticeAudio }
  | { type: 'record-failed' }
  | { type: 'loaded'; audio: PracticeAudio }
  | { type: 'analyze-requested' }
  | { type: 'analyzed'; result: PronunciationResult }
  | { type: 'failed'; error: PracticeError }
  | { type: 'discard' }

export const initialPractice: PracticeState = {
  phase: 'idle',
  text: '',
  hint: false,
  audio: null,
  result: null,
  error: null,
}

export const hasText = (text: string): boolean => text.trim().length > 0

export function practiceReducer(s: PracticeState, e: PracticeEvent): PracticeState {
  switch (e.type) {
    case 'text':
      return { ...s, text: e.text, hint: s.hint && !hasText(e.text) }
    case 'record-requested':
      // Recording needs the sentence first so the take can be analyzed straight away.
      return hasText(s.text) ? { ...s, phase: 'recording', hint: false } : { ...s, hint: true }
    case 'record-failed':
      return { ...s, phase: s.audio ? 'ready' : 'idle' }
    case 'recorded':
      return { ...s, phase: 'ready', audio: e.audio, result: null, error: null }
    case 'loaded':
      return { ...s, phase: 'ready', audio: e.audio, result: null, error: null }
    case 'analyze-requested':
      if (!s.audio) return s
      return hasText(s.text)
        ? { ...s, phase: 'analyzing', hint: false, error: null }
        : { ...s, hint: true }
    case 'analyzed':
      return { ...s, phase: 'result', result: e.result, error: null }
    case 'failed':
      // A cancelled run just returns to the review step.
      return e.error.code === 'CANCELLED'
        ? { ...s, phase: 'ready' }
        : { ...s, phase: 'error', error: e.error }
    case 'discard':
      return { ...s, phase: 'idle', audio: null, result: null, error: null }
  }
}

/** Whether the recording that just stopped should be analyzed without another click. */
export const shouldAutoAnalyze = (s: PracticeState): boolean => hasText(s.text)

/** Loading-card message key by elapsed time: stages at 0 s, 4 s and 12 s. */
export function loadingMessageKey(elapsedMs: number): string {
  if (elapsedMs >= 12_000) return 'pronounce.loading.stage3'
  if (elapsedMs >= 4_000) return 'pronounce.loading.stage2'
  return 'pronounce.loading.stage1'
}

export function formatTimer(seconds: number): string {
  const s = Math.floor(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
