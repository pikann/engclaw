import { describe, expect, it } from 'vitest'
import {
  fitStage,
  formatClock,
  mapYouTubeError,
  parseVideoUrl,
  pickCaptionTrack,
  segmentCues,
  segmentIndexAt,
  type Segment,
} from './shadowing'

const cue = (start: number, dur: number, text: string) => ({ start, dur, text })

describe('parseVideoUrl', () => {
  const id = 'dQw4w9WgXcQ'
  it.each([
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=42s&list=PL123`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `  https://www.youtube.com/watch?v=${id}  `,
    id,
  ])('accepts %s', (input) => {
    expect(parseVideoUrl(input)).toBe(id)
  })

  it.each([
    '',
    'hello world',
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/',
    'javascript:alert(1)',
  ])('rejects %j', (input) => {
    expect(parseVideoUrl(input)).toBeNull()
  })
})

describe('segmentCues', () => {
  it('splits caption cues into sentences with start/end', () => {
    const segs = segmentCues([
      cue(0, 2, 'Hello and welcome.'),
      cue(2, 3, 'Today we talk about roots. It is fun!'),
    ])
    expect(segs.map((s) => s.text)).toEqual([
      'Hello and welcome.',
      'Today we talk about roots.',
      'It is fun!',
    ])
    expect(segs[0]).toMatchObject({ index: 0, start: 0 })
    expect(segs[1]!.start).toBeCloseTo(2, 5)
    expect(segs[2]!.end).toBeCloseTo(5, 5)
  })

  it('joins a sentence that spans several cues and starts at the first cue', () => {
    const segs = segmentCues([
      cue(1, 1.5, 'Today we talk about'),
      cue(2.5, 1.5, 'the roots of learning.'),
      cue(4, 1, 'Next one.'),
    ])
    expect(segs).toHaveLength(2)
    expect(segs[0]!.text).toBe('Today we talk about the roots of learning.')
    expect(segs[0]!.start).toBe(1)
    expect(segs[1]!.start).toBeCloseTo(4, 5)
    expect(segs[1]!.end).toBe(5)
  })

  it('does not split on abbreviations or decimals', () => {
    const segs = segmentCues([cue(0, 4, 'Mr. Smith paid 3.5 dollars. Then he left.')])
    expect(segs.map((s) => s.text)).toEqual(['Mr. Smith paid 3.5 dollars.', 'Then he left.'])
  })

  it('has no gaps or overlaps: each segment ends where the next starts', () => {
    const segs = segmentCues([
      cue(0, 1, 'One.'),
      cue(5, 1, 'Two.'),
      cue(6.5, 1, 'Three.'),
      cue(20, 2, 'Four.'),
    ])
    for (let i = 0; i < segs.length - 1; i++) expect(segs[i]!.end).toBe(segs[i + 1]!.start)
    for (const s of segs) expect(s.end).toBeGreaterThan(s.start)
    expect(segs.at(-1)!.end).toBe(22)
  })

  it('skips empty cues and non-speech tags', () => {
    const segs = segmentCues([
      cue(0, 1, '   '),
      cue(1, 1, '[Music]'),
      cue(2, 2, '♪ ♪'),
      cue(4, 2, 'Real words here.'),
    ])
    expect(segs.map((s) => s.text)).toEqual(['Real words here.'])
    expect(segs[0]!.start).toBe(4)
  })

  it('splits unpunctuated captions at long pauses and at length limits', () => {
    const paused = segmentCues([cue(0, 1, 'first part'), cue(5, 1, 'second part')])
    expect(paused.map((s) => s.text)).toEqual(['first part', 'second part'])

    const words = 'word '.repeat(60).trim()
    const cues = Array.from({ length: 6 }, (_, i) => cue(i * 2, 2, words.slice(0, 50)))
    const long = segmentCues(cues)
    expect(long.length).toBeGreaterThan(1)
    for (const s of long) expect(s.text.length).toBeLessThanOrEqual(260)
  })

  it('returns an empty list when there is no speech', () => {
    expect(segmentCues([])).toEqual([])
    expect(segmentCues([cue(0, 1, '[Applause]')])).toEqual([])
  })

  it('numbers segments from 0 in order', () => {
    const segs = segmentCues([cue(0, 3, 'A b. C d. E f.')])
    expect(segs.map((s) => s.index)).toEqual([0, 1, 2])
    for (let i = 1; i < segs.length; i++) expect(segs[i]!.start).toBeGreaterThan(segs[i - 1]!.start)
  })
})

describe('segmentIndexAt', () => {
  const segs: Segment[] = [
    { index: 0, start: 1, end: 3, text: 'a' },
    { index: 1, start: 3, end: 6, text: 'b' },
    { index: 2, start: 6, end: 8, text: 'c' },
  ]
  it('finds the playing segment', () => {
    expect(segmentIndexAt(segs, 1)).toBe(0)
    expect(segmentIndexAt(segs, 2.99)).toBe(0)
    expect(segmentIndexAt(segs, 3)).toBe(1)
    expect(segmentIndexAt(segs, 7.9)).toBe(2)
  })
  it('is -1 before the first segment and after the last one ends', () => {
    expect(segmentIndexAt(segs, 0.5)).toBe(-1)
    expect(segmentIndexAt(segs, 8)).toBe(-1)
    expect(segmentIndexAt([], 3)).toBe(-1)
  })
  it('is exact at every boundary, within the 100 ms budget', () => {
    for (const s of segs) {
      expect(segmentIndexAt(segs, s.start + 0.001)).toBe(s.index)
      expect(segmentIndexAt(segs, s.end - 0.001)).toBe(s.index)
    }
  })
})

describe('pickCaptionTrack', () => {
  it('prefers a manual English track over auto-generated', () => {
    expect(
      pickCaptionTrack([
        { lang: 'en', auto: true },
        { lang: 'en-US', auto: false },
        { lang: 'vi', auto: false },
      ]),
    ).toBe('en-US')
  })
  it('falls back to auto English, and to null without English', () => {
    expect(pickCaptionTrack([{ lang: 'en', auto: true }])).toBe('en')
    expect(pickCaptionTrack([{ lang: 'vi', auto: false }])).toBeNull()
    expect(pickCaptionTrack([])).toBeNull()
  })
})

describe('mapYouTubeError', () => {
  it('maps meta failures', () => {
    expect(mapYouTubeError('NOT_FOUND', 'meta')).toBe('unavailable')
    expect(mapYouTubeError('NETWORK', 'meta')).toBe('network')
    expect(mapYouTubeError('RATE_LIMITED', 'meta')).toBe('network')
  })
  it('treats a broken extractor at the meta stage as YouTube being unreachable (blocked network)', () => {
    expect(mapYouTubeError('EXTRACTOR_BROKEN', 'meta')).toBe('network')
  })
  it('treats every non-network transcript failure as "no transcript"', () => {
    expect(mapYouTubeError('NO_CAPTIONS', 'transcript')).toBe('noTranscript')
    expect(mapYouTubeError('NOT_FOUND', 'transcript')).toBe('noTranscript')
    expect(mapYouTubeError('EXTRACTOR_BROKEN', 'transcript')).toBe('noTranscript')
    expect(mapYouTubeError('NETWORK', 'transcript')).toBe('network')
    expect(mapYouTubeError('RATE_LIMITED', 'transcript')).toBe('network')
  })
})

describe('fitStage', () => {
  const base = { stageWidth: 1000, stageHeight: 700, chromeHeight: 150, sentenceChars: 40 }
  it('gives the video the largest 16:9 that fits', () => {
    const f = fitStage(base)
    expect(f.videoWidth / f.videoHeight).toBeCloseTo(16 / 9, 2)
    expect(f.videoWidth).toBeLessThanOrEqual(base.stageWidth)
    expect(f.videoHeight + f.sentenceHeight + base.chromeHeight).toBeLessThanOrEqual(
      base.stageHeight + 1,
    )
  })
  it('is width-bound on tall stages', () => {
    const f = fitStage({ ...base, stageWidth: 400, stageHeight: 900 })
    expect(f.videoWidth).toBe(400)
  })
  it('scales the sentence font between 20 and 56 px, shrinking for long sentences', () => {
    const short = fitStage({ ...base, sentenceChars: 12 })
    const long = fitStage({ ...base, sentenceChars: 180 })
    expect(short.fontSize).toBeLessThanOrEqual(56)
    expect(long.fontSize).toBeGreaterThanOrEqual(20)
    expect(long.fontSize).toBeLessThan(short.fontSize)
  })
  it('never lets the video drop below 45% of the stage height', () => {
    const f = fitStage({ ...base, sentenceChars: 400, stageHeight: 600 })
    expect(f.videoHeight).toBeGreaterThanOrEqual(600 * 0.45 - 1)
  })
  it('lets a wider stage (rail collapsed) enlarge the video', () => {
    const narrow = fitStage({ ...base, stageWidth: 680, stageHeight: 900 })
    const wide = fitStage({ ...base, stageWidth: 1000, stageHeight: 900 })
    expect(wide.videoWidth).toBeGreaterThan(narrow.videoWidth)
  })
})

describe('formatClock', () => {
  it.each([
    [0, '0:00'],
    [5.9, '0:05'],
    [75, '1:15'],
    [600, '10:00'],
    [3725, '1:02:05'],
    [-3, '0:00'],
    [Number.NaN, '0:00'],
  ])('%s -> %s', (sec, out) => expect(formatClock(sec)).toBe(out))
})
