import type { SentenceSettings } from '@engclaw/ipc-contract'
import type { Segment } from './shadowing'

export type { SentenceSettings }

/** Speeds offered in the UI, within the 0.5–1.5× the spec asks for. */
export const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5] as const
export const MAX_REPEAT = 10
export const MAX_AUTO_CONTINUE = 200
export const DEFAULT_SETTINGS: SentenceSettings = { speed: 1, repeat: 1, autoContinuePct: 100 }

/** Time ticks arrive every ~50 ms, so a sentence is treated as finished slightly before its end. */
const END_EPSILON = 0.05

export function clampSettings(s: SentenceSettings): SentenceSettings {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  return {
    speed: clamp(s.speed, 0.5, 1.5),
    repeat: clamp(Math.round(s.repeat), 1, MAX_REPEAT),
    autoContinuePct: clamp(Math.round(s.autoContinuePct), 0, MAX_AUTO_CONTINUE),
  }
}

export type LoopMode = 'idle' | 'playing' | 'paused' | 'waiting' | 'done'

export interface LoopState {
  mode: LoopMode
  index: number
  /** Plays of the current sentence started so far (1 = first play). */
  plays: number
  /** False until a tick from the new position arrives, so stale pre-seek ticks cannot end it. */
  armed: boolean
}

export const idleLoop: LoopState = { mode: 'idle', index: 0, plays: 1, armed: false }

export type LoopInput =
  | { type: 'start'; index: number }
  | { type: 'back' }
  | { type: 'next' }
  | { type: 'replay' }
  | { type: 'toggle' }
  | { type: 'time'; seconds: number }
  | { type: 'waitElapsed' }
  /** The learner pressed play in the video itself; `seconds` is the first position after that. */
  | { type: 'adopt'; seconds: number }
  /** The learner paused in the video itself. */
  | { type: 'externalPause' }

export type LoopAction =
  | { type: 'seek'; seconds: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'wait'; ms: number }
  | { type: 'cancelWait' }

export interface LoopStep {
  state: LoopState
  actions: LoopAction[]
}

/** How long to wait for the user's attempt: X% of the time the sentence took to hear. */
export function waitMs(segment: Segment, settings: SentenceSettings): number {
  return ((segment.end - segment.start) / settings.speed) * settings.autoContinuePct * 10
}

/**
 * The practice loop for one video: play a sentence `repeat` times, then (when auto-continue is
 * above 0) wait `autoContinuePct`% of its duration for the learner's attempt and move on to the
 * next sentence. Pure: the caller performs the returned actions and feeds events back in.
 */
export function stepLoop(
  state: LoopState,
  input: LoopInput,
  segments: readonly Segment[],
  settings: SentenceSettings,
): LoopStep {
  if (!segments.length) return { state, actions: [] }
  const last = segments.length - 1
  const clampIndex = (i: number) => Math.min(last, Math.max(0, i))

  const start = (index: number, cancelPending = state.mode === 'waiting'): LoopStep => {
    const i = clampIndex(index)
    return {
      state: { mode: 'playing', index: i, plays: 1, armed: false },
      actions: [
        ...(cancelPending ? [{ type: 'cancelWait' } as const] : []),
        { type: 'seek', seconds: segments[i]!.start },
        { type: 'play' },
      ],
    }
  }

  switch (input.type) {
    case 'start':
      return start(input.index)
    case 'back':
      return start(state.mode === 'idle' ? 0 : state.index - 1)
    case 'next':
      return start(state.mode === 'idle' ? 1 : state.index + 1)
    case 'replay':
      return start(state.index)
    case 'toggle':
      switch (state.mode) {
        case 'playing':
          return { state: { ...state, mode: 'paused' }, actions: [{ type: 'pause' }] }
        case 'paused':
          return { state: { ...state, mode: 'playing' }, actions: [{ type: 'play' }] }
        case 'waiting':
          return { state: { ...state, mode: 'done' }, actions: [{ type: 'cancelWait' }] }
        default:
          return start(state.index)
      }
    case 'waitElapsed':
      return state.mode === 'waiting' ? start(state.index + 1, false) : { state, actions: [] }
    case 'adopt': {
      if (state.mode === 'playing') return { state, actions: [] }
      if (state.mode === 'waiting') return start(state.index + 1)
      if (state.mode === 'done') return start(state.index)
      let at = 0
      segments.forEach((seg, i) => {
        if (seg.start <= input.seconds + END_EPSILON) at = i
      })
      if (state.mode === 'paused' && at === state.index) {
        return { state: { ...state, mode: 'playing' }, actions: [] }
      }
      return { state: { mode: 'playing', index: at, plays: 1, armed: false }, actions: [] }
    }
    case 'externalPause':
      return state.mode === 'playing' && state.armed
        ? { state: { ...state, mode: 'paused' }, actions: [] }
        : { state, actions: [] }
    case 'time': {
      if (state.mode !== 'playing') return { state, actions: [] }
      const seg = segments[state.index]!
      const atEnd = input.seconds >= seg.end - END_EPSILON
      if (!state.armed) {
        return atEnd ? { state, actions: [] } : { state: { ...state, armed: true }, actions: [] }
      }
      if (!atEnd) return { state, actions: [] }
      if (state.plays < settings.repeat) {
        return {
          state: { ...state, plays: state.plays + 1, armed: false },
          actions: [{ type: 'seek', seconds: seg.start }],
        }
      }
      if (settings.autoContinuePct > 0 && state.index < last) {
        return {
          state: { ...state, mode: 'waiting' },
          actions: [{ type: 'pause' }, { type: 'wait', ms: waitMs(seg, settings) }],
        }
      }
      return { state: { ...state, mode: 'done' }, actions: [{ type: 'pause' }] }
    }
  }
}

export type ShortcutCommand =
  | { type: 'loop'; input: LoopInput }
  | {
      type: 'settings'
      patch: 'speedDown' | 'speedUp' | 'repeatDown' | 'repeatUp' | 'autoDown' | 'autoUp'
    }

const AUTO_STEP = 25

/** Keyboard shortcuts of the practice loop; `null` for keys that are not ours. */
export function shortcutFor(key: string): ShortcutCommand | null {
  switch (key) {
    case ' ':
      return { type: 'loop', input: { type: 'toggle' } }
    case 'ArrowLeft':
      return { type: 'loop', input: { type: 'back' } }
    case 'ArrowRight':
      return { type: 'loop', input: { type: 'next' } }
    case 'r':
    case 'R':
      return { type: 'loop', input: { type: 'replay' } }
    case '[':
      return { type: 'settings', patch: 'speedDown' }
    case ']':
      return { type: 'settings', patch: 'speedUp' }
    case '-':
      return { type: 'settings', patch: 'repeatDown' }
    case '=':
    case '+':
      return { type: 'settings', patch: 'repeatUp' }
    case ',':
      return { type: 'settings', patch: 'autoDown' }
    case '.':
      return { type: 'settings', patch: 'autoUp' }
    default:
      return null
  }
}

/** Applies a settings shortcut: speed moves along `SPEED_OPTIONS`, the others in whole steps. */
export function nudgeSettings(
  s: SentenceSettings,
  patch: Extract<ShortcutCommand, { type: 'settings' }>['patch'],
): SentenceSettings {
  const speedAt = SPEED_OPTIONS.indexOf(s.speed as (typeof SPEED_OPTIONS)[number])
  const speeds = SPEED_OPTIONS
  switch (patch) {
    case 'speedDown':
      return clampSettings({ ...s, speed: speeds[Math.max(0, (speedAt < 0 ? 2 : speedAt) - 1)]! })
    case 'speedUp':
      return clampSettings({
        ...s,
        speed: speeds[Math.min(speeds.length - 1, (speedAt < 0 ? 2 : speedAt) + 1)]!,
      })
    case 'repeatDown':
      return clampSettings({ ...s, repeat: s.repeat - 1 })
    case 'repeatUp':
      return clampSettings({ ...s, repeat: s.repeat + 1 })
    case 'autoDown':
      return clampSettings({ ...s, autoContinuePct: s.autoContinuePct - AUTO_STEP })
    case 'autoUp':
      return clampSettings({ ...s, autoContinuePct: s.autoContinuePct + AUTO_STEP })
  }
}
