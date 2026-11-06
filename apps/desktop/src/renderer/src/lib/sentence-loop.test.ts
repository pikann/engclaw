import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  clampSettings,
  idleLoop,
  nudgeSettings,
  shortcutFor,
  stepLoop,
  waitMs,
  type LoopState,
} from './sentence-loop'
import type { Segment } from './shadowing'

const segs: Segment[] = [
  { index: 0, start: 0, end: 4, text: 'One.' },
  { index: 1, start: 4, end: 6, text: 'Two.' },
  { index: 2, start: 6, end: 10, text: 'Three.' },
]
const cfg = (over = {}) => ({ ...DEFAULT_SETTINGS, ...over })
const run = (state: LoopState, input: Parameters<typeof stepLoop>[1], settings = cfg()) =>
  stepLoop(state, input, segs, settings)

describe('starting a sentence', () => {
  it('seeks to the segment start and plays it', () => {
    const r = run(idleLoop, { type: 'start', index: 1 })
    expect(r.state).toMatchObject({ mode: 'playing', index: 1, plays: 1 })
    expect(r.actions).toEqual([{ type: 'seek', seconds: 4 }, { type: 'play' }])
  })
  it('clamps the index into range', () => {
    expect(run(idleLoop, { type: 'start', index: 9 }).state.index).toBe(2)
    expect(run(idleLoop, { type: 'start', index: -3 }).state.index).toBe(0)
  })
  it('does nothing without segments', () => {
    const r = stepLoop(idleLoop, { type: 'start', index: 0 }, [], cfg())
    expect(r.actions).toEqual([])
  })
})

describe('reaching the end of a sentence', () => {
  const playing = (over = {}): LoopState => ({
    ...run(idleLoop, { type: 'start', index: 0 }).state,
    armed: true,
    ...over,
  })
  it('ignores ticks before the end', () => {
    const r = run(playing(), { type: 'time', seconds: 3.5 })
    expect(r.actions).toEqual([])
  })
  it('ignores stale ticks from before the seek landed', () => {
    const s = run(idleLoop, { type: 'start', index: 0 }).state
    expect(s.armed).toBe(false)
    expect(run(s, { type: 'time', seconds: 4.2 }).actions).toEqual([])
    expect(run(s, { type: 'time', seconds: 0.1 }).state.armed).toBe(true)
  })
  it('replays until the repeat count is reached, then pauses', () => {
    const settings = cfg({ repeat: 3, autoContinuePct: 0 })
    let s = playing()
    let r = run(s, { type: 'time', seconds: 4 }, settings)
    expect(r.actions).toEqual([{ type: 'seek', seconds: 0 }])
    expect(r.state).toMatchObject({ plays: 2, armed: false })
    s = { ...r.state, armed: true }
    r = run(s, { type: 'time', seconds: 4 }, settings)
    expect(r.state).toMatchObject({ plays: 3 })
    r = run({ ...r.state, armed: true }, { type: 'time', seconds: 4 }, settings)
    expect(r.state.mode).toBe('done')
    expect(r.actions).toEqual([{ type: 'pause' }])
  })
  it('after the last play waits X% of the sentence duration, then advances', () => {
    const settings = cfg({ repeat: 1, autoContinuePct: 150 })
    const r = run(playing(), { type: 'time', seconds: 3.97 }, settings)
    expect(r.state.mode).toBe('waiting')
    expect(r.actions).toEqual([{ type: 'pause' }, { type: 'wait', ms: 6000 }])
    const next = run(r.state, { type: 'waitElapsed' }, settings)
    expect(next.state).toMatchObject({ mode: 'playing', index: 1, plays: 1 })
    expect(next.actions).toEqual([{ type: 'seek', seconds: 4 }, { type: 'play' }])
  })
  it('measures the wait in real time at the chosen speed', () => {
    expect(waitMs(segs[0]!, cfg({ speed: 0.5, autoContinuePct: 100 }))).toBe(8000)
    expect(waitMs(segs[0]!, cfg({ speed: 1.5, autoContinuePct: 50 }))).toBeCloseTo(1333.33, 1)
  })
  it('stops at the end of the last sentence instead of advancing', () => {
    const last = { ...playing(), index: 2 }
    const r = run(last, { type: 'time', seconds: 10 }, cfg({ autoContinuePct: 100 }))
    expect(r.state.mode).toBe('done')
    expect(r.actions).toEqual([{ type: 'pause' }])
  })
  it('does not advance when auto-continue is off', () => {
    const r = run(playing(), { type: 'time', seconds: 4 }, cfg({ autoContinuePct: 0 }))
    expect(r.state.mode).toBe('done')
  })
  it('ignores ticks while not playing', () => {
    for (const mode of ['idle', 'paused', 'waiting', 'done'] as const) {
      const r = run({ ...playing(), mode }, { type: 'time', seconds: 99 })
      expect(r.actions).toEqual([])
    }
  })
})

describe('user controls', () => {
  const at = (index: number) => run(idleLoop, { type: 'start', index }).state
  it('back and next move one sentence, clamped, restarting the plays', () => {
    expect(run({ ...at(1), plays: 2 }, { type: 'back' }).state).toMatchObject({
      index: 0,
      plays: 1,
    })
    expect(run(at(0), { type: 'back' }).state.index).toBe(0)
    expect(run(at(1), { type: 'next' }).state.index).toBe(2)
    expect(run(at(2), { type: 'next' }).state.index).toBe(2)
  })
  it('back from idle starts the first sentence, next from idle the second', () => {
    expect(run(idleLoop, { type: 'back' }).state.index).toBe(0)
    expect(run(idleLoop, { type: 'next' }).state.index).toBe(1)
  })
  it('replay restarts the current sentence from play 1', () => {
    const r = run({ ...at(1), plays: 3, mode: 'done' }, { type: 'replay' })
    expect(r.state).toMatchObject({ mode: 'playing', index: 1, plays: 1 })
    expect(r.actions).toEqual([{ type: 'seek', seconds: 4 }, { type: 'play' }])
  })
  it('toggle pauses a playing sentence and resumes it without restarting', () => {
    const paused = run(at(1), { type: 'toggle' })
    expect(paused.state.mode).toBe('paused')
    expect(paused.actions).toEqual([{ type: 'pause' }])
    const resumed = run({ ...paused.state, plays: 2 }, { type: 'toggle' })
    expect(resumed.state).toMatchObject({ mode: 'playing', index: 1, plays: 2 })
    expect(resumed.actions).toEqual([{ type: 'play' }])
  })
  it('toggle during the wait cancels auto-continue', () => {
    const waiting: LoopState = { ...at(0), mode: 'waiting' }
    const r = run(waiting, { type: 'toggle' })
    expect(r.state.mode).toBe('done')
    expect(r.actions).toEqual([{ type: 'cancelWait' }])
  })
  it('toggle after the sentence finished plays it again; from idle plays the first', () => {
    expect(run({ ...at(1), mode: 'done' }, { type: 'toggle' }).state).toMatchObject({
      mode: 'playing',
      index: 1,
      plays: 1,
    })
    expect(run(idleLoop, { type: 'toggle' }).state).toMatchObject({ mode: 'playing', index: 0 })
  })
  it('starting a sentence while waiting cancels the pending advance', () => {
    const r = run({ ...at(0), mode: 'waiting' }, { type: 'next' })
    expect(r.actions[0]).toEqual({ type: 'cancelWait' })
    expect(r.state).toMatchObject({ mode: 'playing', index: 1 })
  })
  it('a wait that fires after the user left the waiting state does nothing', () => {
    const r = run(at(0), { type: 'waitElapsed' })
    expect(r.actions).toEqual([])
  })
})

describe('settings', () => {
  it('clamps and rounds out-of-range values', () => {
    expect(clampSettings({ speed: 3, repeat: 0, autoContinuePct: 999 })).toEqual({
      speed: 1.5,
      repeat: 1,
      autoContinuePct: 200,
    })
    expect(clampSettings({ speed: 0.1, repeat: 2.6, autoContinuePct: -5 })).toEqual({
      speed: 0.5,
      repeat: 3,
      autoContinuePct: 0,
    })
  })
  it('exposes the defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({ speed: 1, repeat: 1, autoContinuePct: 100 })
  })
})

describe('keyboard shortcuts', () => {
  it('maps the transport keys to loop inputs', () => {
    expect(shortcutFor(' ')).toEqual({ type: 'loop', input: { type: 'toggle' } })
    expect(shortcutFor('ArrowLeft')).toEqual({ type: 'loop', input: { type: 'back' } })
    expect(shortcutFor('ArrowRight')).toEqual({ type: 'loop', input: { type: 'next' } })
    expect(shortcutFor('r')).toEqual({ type: 'loop', input: { type: 'replay' } })
    expect(shortcutFor('x')).toBeNull()
  })
  it('steps speed along the offered speeds and stops at the ends', () => {
    expect(nudgeSettings(cfg({ speed: 1 }), 'speedUp').speed).toBe(1.25)
    expect(nudgeSettings(cfg({ speed: 1.5 }), 'speedUp').speed).toBe(1.5)
    expect(nudgeSettings(cfg({ speed: 0.5 }), 'speedDown').speed).toBe(0.5)
    expect(nudgeSettings(cfg({ speed: 1 }), 'speedDown').speed).toBe(0.75)
  })
  it('steps repeat by 1 and auto-continue by 25 within range', () => {
    expect(nudgeSettings(cfg({ repeat: 1 }), 'repeatDown').repeat).toBe(1)
    expect(nudgeSettings(cfg({ repeat: 1 }), 'repeatUp').repeat).toBe(2)
    expect(nudgeSettings(cfg({ autoContinuePct: 0 }), 'autoDown').autoContinuePct).toBe(0)
    expect(nudgeSettings(cfg({ autoContinuePct: 100 }), 'autoUp').autoContinuePct).toBe(125)
    expect(nudgeSettings(cfg({ autoContinuePct: 200 }), 'autoUp').autoContinuePct).toBe(200)
  })
})

describe('playing from the video itself', () => {
  const segs = [
    { index: 0, start: 0, end: 2, text: 'a' },
    { index: 1, start: 2, end: 4, text: 'b' },
    { index: 2, start: 4, end: 6, text: 'c' },
  ]
  const s = { speed: 1, repeat: 1, autoContinuePct: 100 }

  it('adopts the sentence under the playhead from idle without seeking', () => {
    const step = stepLoop(idleLoop, { type: 'adopt', seconds: 4.5 }, segs, s)
    expect(step.state).toMatchObject({ mode: 'playing', index: 2 })
    expect(step.actions).toEqual([])
  })

  it('resumes a paused sentence in place', () => {
    const paused = { mode: 'paused', index: 1, plays: 1, armed: true } as const
    const step = stepLoop(paused, { type: 'adopt', seconds: 3 }, segs, s)
    expect(step.state).toMatchObject({ mode: 'playing', index: 1 })
  })

  it('pauses the loop when the video is paused after it started ticking', () => {
    const playing = { mode: 'playing', index: 1, plays: 1, armed: true } as const
    expect(stepLoop(playing, { type: 'externalPause' }, segs, s).state.mode).toBe('paused')
    expect(
      stepLoop({ ...playing, armed: false }, { type: 'externalPause' }, segs, s).state.mode,
    ).toBe('playing')
  })
})
