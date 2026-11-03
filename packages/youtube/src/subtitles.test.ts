import { describe, expect, it } from 'vitest'
import { parseSubtitles } from './subtitles'
import { parseVideoId } from './videoId'

describe('parseSubtitles', () => {
  it('parses SRT', () => {
    const cues = parseSubtitles('1\n00:00:01,000 --> 00:00:03,500\nHello <i>there</i>\n\n2\n00:01:00,000 --> 00:01:02,000\nBye\n')
    expect(cues).toEqual([
      { start: 1, dur: 2.5, text: 'Hello there' },
      { start: 60, dur: 2, text: 'Bye' },
    ])
  })
  it('parses VTT with short timestamps and settings', () => {
    const cues = parseSubtitles('WEBVTT\n\n00:01.000 --> 00:02.000 align:start\nOne\ntwo\n')
    expect(cues).toEqual([{ start: 1, dur: 1, text: 'One two' }])
  })
  it('throws NO_CAPTIONS when empty', () => {
    expect(() => parseSubtitles('WEBVTT\n')).toThrow(/No cues/)
  })
})

describe('parseVideoId', () => {
  it.each([
    ['jNQXAC9IVRw', 'jNQXAC9IVRw'],
    ['https://www.youtube.com/watch?v=jNQXAC9IVRw&t=3', 'jNQXAC9IVRw'],
    ['https://youtu.be/jNQXAC9IVRw', 'jNQXAC9IVRw'],
    ['https://youtube.com/shorts/jNQXAC9IVRw', 'jNQXAC9IVRw'],
  ])('%s', (input, id) => expect(parseVideoId(input)).toBe(id))
  it('rejects other hosts', () => {
    expect(() => parseVideoId('https://evil.com/watch?v=jNQXAC9IVRw')).toThrow()
    expect(() => parseVideoId('http://169.254.169.254/')).toThrow()
  })
})
