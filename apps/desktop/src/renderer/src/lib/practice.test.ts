import { describe, expect, it } from 'vitest'
import type { PronunciationResult } from '@engclaw/ipc-contract'
import {
  formatTimer,
  initialPractice,
  loadingMessageKey,
  practiceReducer,
  shouldAutoAnalyze,
  shouldAutoTranscribe,
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

describe('free speech flow (Mode 1)', () => {
  const free = (events: PracticeEvent[] = []) => run([{ type: 'mode', mode: 'free' }, ...events])

  it('records without a typed sentence and asks for transcription instead of analysis', () => {
    let s = free([{ type: 'record-requested' }])
    expect(s.phase).toBe('recording')
    s = practiceReducer(s, { type: 'recorded', audio })
    expect(shouldAutoTranscribe(s)).toBe(true)
    expect(shouldAutoAnalyze(s)).toBe(false)
    s = practiceReducer(s, { type: 'transcribe-requested' })
    expect(s.phase).toBe('transcribing')
  })

  it('shows the transcript as editable text once ASR finishes', () => {
    const s = free([
      { type: 'loaded', audio },
      { type: 'transcribe-requested' },
      { type: 'transcribed', text: 'helo world' },
    ])
    expect(s.phase).toBe('ready')
    expect(s.text).toBe('helo world')
    expect(s.transcribed).toBe(true)
  })

  it('analyzes the edited text, not the raw transcript', () => {
    const s = free([
      { type: 'loaded', audio },
      { type: 'transcribe-requested' },
      { type: 'transcribed', text: 'helo world' },
      { type: 'text', text: 'hello world' },
      { type: 'analyze-requested' },
    ])
    expect(s.phase).toBe('analyzing')
    expect(s.text).toBe('hello world')
  })

  it('hints instead of analyzing when the transcript was cleared', () => {
    const s = free([
      { type: 'loaded', audio },
      { type: 'transcribed', text: 'hi' },
      { type: 'text', text: '' },
      { type: 'analyze-requested' },
    ])
    expect(s.phase).toBe('ready')
    expect(s.hint).toBe(true)
  })

  it('keeps audio on a transcription failure and retries the same step', () => {
    const base = free([{ type: 'loaded', audio }, { type: 'transcribe-requested' }])
    const failed = practiceReducer(base, {
      type: 'failed',
      error: { code: 'FAILED', message: 'boom' },
    })
    expect(failed.phase).toBe('error')
    expect(failed.step).toBe('transcribe')
    expect(failed.audio).toBe(audio)
    expect(practiceReducer(failed, { type: 'transcribe-requested' }).phase).toBe('transcribing')
  })

  it('returns to review when transcription is cancelled', () => {
    const s = free([
      { type: 'loaded', audio },
      { type: 'transcribe-requested' },
      { type: 'failed', error: { code: 'CANCELLED', message: '' } },
    ])
    expect(s.phase).toBe('ready')
    expect(s.transcribed).toBe(false)
  })

  it('a new take clears the old transcript flag so it is transcribed again', () => {
    const s = free([
      { type: 'loaded', audio },
      { type: 'transcribed', text: 'one' },
      { type: 'recorded', audio },
    ])
    expect(s.transcribed).toBe(false)
    expect(shouldAutoTranscribe(s)).toBe(true)
  })

  it('switching mode keeps the audio and text', () => {
    const s = run([
      { type: 'text', text: 'hello' },
      { type: 'loaded', audio },
      { type: 'mode', mode: 'free' },
      { type: 'mode', mode: 'sentence' },
    ])
    expect(s.audio).toBe(audio)
    expect(s.text).toBe('hello')
    expect(s.phase).toBe('ready')
  })

  it('ignores a mode switch while busy', () => {
    const s = run([
      { type: 'text', text: 'hi' },
      { type: 'record-requested' },
      { type: 'mode', mode: 'free' },
    ])
    expect(s.mode).toBe('sentence')
    expect(s.phase).toBe('recording')
  })

  it('discard allows a re-record and keeps the text', () => {
    const s = free([
      { type: 'loaded', audio },
      { type: 'transcribed', text: 'hi' },
      { type: 'discard' },
    ])
    expect(s.audio).toBeNull()
    expect(s.transcribed).toBe(false)
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
