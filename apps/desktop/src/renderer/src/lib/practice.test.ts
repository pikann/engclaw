import { describe, expect, it } from 'vitest'
import type { PronunciationResult } from '@engclaw/ipc-contract'
import {
  formatTimer,
  initialPractice,
  loadingMessageKey,
  practiceReducer,
  shouldAutoAnalyze,
  type PracticeAudio,
  type PracticeEvent,
  type PracticeState,
} from './practice'

const audio: PracticeAudio = {
  samples: new Float32Array(16000),
  seconds: 1,
  source: 'mic',
  truncated: false,
}
const result = { score: 90 } as PronunciationResult
const run = (events: PracticeEvent[], from: PracticeState = initialPractice) =>
  events.reduce(practiceReducer, from)

describe('practice flow', () => {
  it('shows the inline hint instead of recording when the text is empty', () => {
    const s = run([{ type: 'text', text: '   ' }, { type: 'record-requested' }])
    expect(s.phase).toBe('idle')
    expect(s.hint).toBe(true)
  })

  it('clears the hint once the user types', () => {
    const s = run([{ type: 'record-requested' }, { type: 'text', text: 'hello' }])
    expect(s.hint).toBe(false)
  })

  it('goes from text + recording to a result', () => {
    let s = run([{ type: 'text', text: 'hello world' }, { type: 'record-requested' }])
    expect(s.phase).toBe('recording')
    s = practiceReducer(s, { type: 'recorded', audio })
    expect(s.phase).toBe('ready')
    expect(shouldAutoAnalyze(s)).toBe(true)
    s = run([{ type: 'analyze-requested' }, { type: 'analyzed', result }], s)
    expect(s.phase).toBe('result')
    expect(s.result).toBe(result)
  })

  it('does not analyze an uploaded file without text, and hints instead', () => {
    const s = run([
      { type: 'loaded', audio: { ...audio, source: 'file' } },
      { type: 'analyze-requested' },
    ])
    expect(s.phase).toBe('ready')
    expect(s.hint).toBe(true)
    expect(shouldAutoAnalyze(s)).toBe(false)
  })

  it('keeps the audio on failure so retry works, and returns to review on cancel', () => {
    const base = run([
      { type: 'text', text: 'hi' },
      { type: 'loaded', audio },
      { type: 'analyze-requested' },
    ])
    const failed = practiceReducer(base, {
      type: 'failed',
      error: { code: 'FAILED', message: 'boom' },
    })
    expect(failed.phase).toBe('error')
    expect(failed.audio).toBe(audio)
    expect(practiceReducer(failed, { type: 'analyze-requested' }).phase).toBe('analyzing')
    const cancelled = practiceReducer(base, {
      type: 'failed',
      error: { code: 'CANCELLED', message: '' },
    })
    expect(cancelled.phase).toBe('ready')
  })

  it('falls back when recording cannot start', () => {
    const s = run([
      { type: 'text', text: 'hi' },
      { type: 'record-requested' },
      { type: 'record-failed' },
    ])
    expect(s.phase).toBe('idle')
  })
})

describe('loading messages', () => {
  it('switches stage at 4 s and 12 s', () => {
    expect(loadingMessageKey(0)).toBe('pronounce.loading.stage1')
    expect(loadingMessageKey(3999)).toBe('pronounce.loading.stage1')
    expect(loadingMessageKey(4000)).toBe('pronounce.loading.stage2')
    expect(loadingMessageKey(12000)).toBe('pronounce.loading.stage3')
  })
})

describe('formatTimer', () => {
  it('formats m:ss', () => {
    expect(formatTimer(0)).toBe('0:00')
    expect(formatTimer(65.9)).toBe('1:05')
  })
})
