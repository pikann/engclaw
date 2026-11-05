import { describe, expect, it } from 'vitest'
import { initialPlayerState, reducePlayer } from './player-state'

describe('reducePlayer', () => {
  it('starts loading and not playing', () => {
    expect(initialPlayerState).toEqual({
      phase: 'loading',
      playing: false,
      duration: 0,
      error: null,
    })
  })

  it('becomes ready with the video duration', () => {
    expect(reducePlayer(initialPlayerState, { type: 'ready', duration: 93 })).toMatchObject({
      phase: 'ready',
      duration: 93,
    })
  })

  it('follows play, pause and end', () => {
    let s = reducePlayer(initialPlayerState, { type: 'ready', duration: 10 })
    s = reducePlayer(s, { type: 'state', state: 'playing' })
    expect(s.playing).toBe(true)
    s = reducePlayer(s, { type: 'state', state: 'buffering' })
    expect(s.playing).toBe(true)
    s = reducePlayer(s, { type: 'state', state: 'paused' })
    expect(s.playing).toBe(false)
    s = reducePlayer(s, { type: 'state', state: 'playing' })
    s = reducePlayer(s, { type: 'state', state: 'ended' })
    expect(s.playing).toBe(false)
  })

  it('an error stops playback and keeps the error code', () => {
    let s = reducePlayer(initialPlayerState, { type: 'state', state: 'playing' })
    s = reducePlayer(s, { type: 'error', code: 'UNAVAILABLE', detail: 153 })
    expect(s).toMatchObject({ phase: 'error', playing: false, error: 'UNAVAILABLE' })
    expect(reducePlayer(s, { type: 'ready', duration: 5 }).phase).toBe('error')
  })

  it('ignores time ticks (they are handled outside React state)', () => {
    const s = reducePlayer(initialPlayerState, { type: 'time', seconds: 3, duration: 10 })
    expect(s).toBe(initialPlayerState)
  })
})
