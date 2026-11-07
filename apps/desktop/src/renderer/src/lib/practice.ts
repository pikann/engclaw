import type { InferenceErrorCode, PronunciationResult } from '@engclaw/ipc-contract'

/**
 * Pure state for the practice card.
 * Mode 2 ('sentence'): type the sentence -> record/upload audio -> analyze.
 * Mode 1 ('free'): record/upload audio -> ASR transcript -> user edits -> analyze the edited text.
 */

export type PracticeMode = 'sentence' | 'free'

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

export type PracticePhase =
  'idle' | 'recording' | 'ready' | 'transcribing' | 'analyzing' | 'result' | 'error'

/** Which request is (or was last) in flight, so Retry repeats the right one. */
export type PracticeStep = 'transcribe' | 'analyze'

export interface PracticeState {
  phase: PracticePhase
  mode: PracticeMode
  text: string
  /** `text` came from ASR for the current audio (the user may have edited it since). */
  transcribed: boolean
  step: PracticeStep | null
  /** Inline "enter a sentence" hint after an attempt with empty text. */
  hint: boolean
  audio: PracticeAudio | null
  result: PronunciationResult | null
  error: PracticeError | null
}

export type PracticeEvent =
  | { type: 'mode'; mode: PracticeMode }
  | { type: 'text'; text: string }
  | { type: 'record-requested' }
  | { type: 'recorded'; audio: PracticeAudio }
  | { type: 'record-failed' }
  | { type: 'loaded'; audio: PracticeAudio }
  | { type: 'transcribe-requested' }
  | { type: 'transcribed'; text: string }
  | { type: 'analyze-requested' }
  | { type: 'analyzed'; result: PronunciationResult }
  | { type: 'failed'; error: PracticeError }
  | { type: 'discard' }
  | { type: 'edit' }
  /** Record again: drops the take and result but keeps the text (and that it was transcribed). */
  | { type: 'rerecord' }
  /** Start over: forget text, take and result. */
  | { type: 'reset' }

export const initialPractice: PracticeState = {
  phase: 'idle',
  mode: 'sentence',
  text: '',
  transcribed: false,
  step: null,
  hint: false,
  audio: null,
  result: null,
  error: null,
}

export const hasText = (text: string): boolean => text.trim().length > 0

export function practiceReducer(s: PracticeState, e: PracticeEvent): PracticeState {
  switch (e.type) {
    case 'mode':
      // Switching keeps the audio and text; not while a take or request is running.
      return busyPhase(s.phase) ? s : { ...s, mode: e.mode, hint: false }
    case 'text':
      return { ...s, text: e.text, hint: s.hint && !hasText(e.text) }
    case 'record-requested':
      // Sentence mode needs the text first so the take can be analyzed straight away.
      return s.mode === 'free' || hasText(s.text)
        ? { ...s, phase: 'recording', hint: false }
        : { ...s, hint: true }
    case 'record-failed':
      return { ...s, phase: s.audio ? 'ready' : 'idle' }
    case 'recorded':
    case 'loaded':
      return {
        ...s,
        phase: 'ready',
        audio: e.audio,
        // A new mic take keeps the text the user already has; an imported file is transcribed afresh.
        transcribed: e.type === 'recorded' && s.transcribed && hasText(s.text),
        step: null,
        result: null,
        error: null,
      }
    case 'transcribe-requested':
      return s.audio
        ? { ...s, phase: 'transcribing', step: 'transcribe', hint: false, error: null }
        : s
    case 'transcribed':
      return { ...s, phase: 'ready', text: e.text, transcribed: true, hint: false, step: null }
    case 'analyze-requested':
      if (!s.audio) return s
      return hasText(s.text)
        ? { ...s, phase: 'analyzing', step: 'analyze', hint: false, error: null }
        : { ...s, hint: true }
    case 'analyzed':
      return { ...s, phase: 'result', result: e.result, error: null }
    case 'failed':
      // A cancelled run just returns to the review step.
      return e.error.code === 'CANCELLED'
        ? { ...s, phase: 'ready' }
        : { ...s, phase: 'error', error: e.error }
    case 'edit':
      // Back to the review step with the same audio and text, so the text can be corrected.
      return s.audio ? { ...s, phase: 'ready', result: null, error: null } : s
    case 'rerecord':
      return {
        ...s,
        phase: 'idle',
        audio: null,
        step: null,
        result: null,
        error: null,
        hint: false,
      }
    case 'reset':
      return { ...initialPractice, mode: s.mode }
    case 'discard':
      return {
        ...s,
        phase: 'idle',
        audio: null,
        transcribed: false,
        step: null,
        result: null,
        error: null,
      }
  }
}

const busyPhase = (p: PracticePhase): boolean =>
  p === 'recording' || p === 'transcribing' || p === 'analyzing'

/** Whether the recording that just stopped should be analyzed without another click. */
export const shouldAutoAnalyze = (s: PracticeState): boolean =>
  s.mode === 'sentence' && hasText(s.text)

/** Free speech: new audio is transcribed straight away so the user can correct the text. */
export const shouldAutoTranscribe = (s: PracticeState): boolean => s.mode === 'free'

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

/** Each tab keeps its own text, audio and result; switching never discards them. */
export interface PracticeTabs {
  active: PracticeMode
  tabs: Record<PracticeMode, PracticeState>
}

export type TabsEvent =
  | { type: 'switch'; mode: PracticeMode }
  | { type: 'tab'; mode: PracticeMode; event: PracticeEvent }
  /** Another screen (the dictionary) sends a word to Read aloud. */
  | { type: 'handoff'; text: string }

export const initialTabs: PracticeTabs = {
  active: 'sentence',
  tabs: {
    sentence: { ...initialPractice, mode: 'sentence' },
    free: { ...initialPractice, mode: 'free' },
  },
}

export function tabsReducer(s: PracticeTabs, e: TabsEvent): PracticeTabs {
  if (e.type === 'switch') return { ...s, active: e.mode }
  if (e.type === 'handoff') {
    const running = (m: PracticeMode) => busyPhase(s.tabs[m].phase)
    if (running(s.active) || running('sentence')) return s
    return {
      active: 'sentence',
      tabs: {
        ...s.tabs,
        sentence: { ...initialPractice, mode: 'sentence', text: e.text },
      },
    }
  }
  return { ...s, tabs: { ...s.tabs, [e.mode]: practiceReducer(s.tabs[e.mode], e.event) } }
}

/** Work a tab would lose if it were thrown away: text, a take or a result. */
export const hasDraft = (s: PracticeState): boolean =>
  hasText(s.text) || s.audio !== null || s.result !== null
