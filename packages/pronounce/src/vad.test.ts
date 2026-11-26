import { describe, expect, it } from 'vitest'
import { SpeechEndpoint, VAD_FRAME } from './vad'

const framesIn = (seconds: number) => Math.round((seconds * 16000) / VAD_FRAME)
/** Feeds `seconds` of one probability; returns the time into the stretch at which it fired. */
function feed(e: SpeechEndpoint, seconds: number, p: number): number | null {
  for (let i = 0; i < framesIn(seconds); i++) if (e.push(p)) return ((i + 1) * VAD_FRAME) / 16000
  return null
}

describe('SpeechEndpoint', () => {
  it('never ends a recording in which nobody has spoken', () => {
    expect(feed(new SpeechEndpoint(), 60, 0.02)).toBeNull()
  })

  it('ends 2 s after the speech does', () => {
    const e = new SpeechEndpoint()
    expect(feed(e, 1, 0.9)).toBeNull()
    expect(feed(e, 5, 0.02)).toBeCloseTo(2, 1)
  })

  it('starts the 2 s again when the speaker carries on', () => {
    const e = new SpeechEndpoint()
    feed(e, 1, 0.9)
    expect(feed(e, 1.8, 0.02)).toBeNull()
    feed(e, 0.2, 0.9)
    expect(feed(e, 1.8, 0.02)).toBeNull()
    expect(feed(e, 0.5, 0.02)).not.toBeNull()
  })

  it('ignores a click', () => {
    const e = new SpeechEndpoint()
    e.push(0.9)
    expect(feed(e, 10, 0.02)).toBeNull()
  })

  it('counts neither speech nor silence between the two thresholds', () => {
    const e = new SpeechEndpoint()
    expect(feed(e, 3, 0.2)).toBeNull() // not yet speech
    feed(e, 1, 0.4)
    expect(feed(e, 10, 0.2)).toBeNull() // still not silence
    expect(feed(e, 3, 0.1)).toBeCloseTo(2, 1)
  })
})
