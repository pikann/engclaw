import { describe, expect, it } from 'vitest'
import type { SegmentProsody } from '@engclaw/ipc-contract'
import { alignProsody } from './prosody-guide'

const word = (text: string, start: number, end: number, contour: number[] = [0, 0, 0, 0, 0]) => ({
  text,
  start,
  end,
  stressed: false,
  pitch: { direction: 'flat' as const, contour },
})

const prosody: SegmentProsody = {
  words: [word('Hello,', 0, 0.4), word('big', 0.9, 1.2), word('world.', 1.2, 1.8)],
  pauses: [{ afterWordIndex: 0, duration: 0.45 }],
}

describe('alignProsody', () => {
  it('attaches each analysed word and the pause after it', () => {
    const tokens = alignProsody('Hello, big world.', prosody)
    expect(tokens.map((t) => t.word?.text)).toEqual(['Hello,', 'big', 'world.'])
    expect(tokens.map((t) => t.pauseAfter)).toEqual([0.45, null, null])
  })

  it('leaves pieces the analysis dropped without a word and keeps later ones aligned', () => {
    const tokens = alignProsody('Hello, - big world.', prosody)
    expect(tokens.map((t) => t.word?.text ?? null)).toEqual(['Hello,', null, 'big', 'world.'])
  })

  it('never shows a pause after the last piece', () => {
    const tokens = alignProsody('Hello,', {
      words: [word('Hello,', 0, 0.4)],
      pauses: [{ afterWordIndex: 0, duration: 0.5 }],
    })
    expect(tokens[0]?.pauseAfter).toBeNull()
  })
})
