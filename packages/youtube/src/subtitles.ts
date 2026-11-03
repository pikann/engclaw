import { YouTubeError, type TranscriptCue } from './types'

const TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/

function toSec(t: string): number {
  const m = TIME.exec(t)
  if (!m) return NaN
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]!.padEnd(3, '0')) / 1000
}

/** Parses SRT or WebVTT into cues (fallback when captions can't be fetched). */
export function parseSubtitles(src: string): TranscriptCue[] {
  const cues: TranscriptCue[] = []
  for (const block of src.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = block.split('\n')
    const i = lines.findIndex((l) => l.includes('-->'))
    if (i < 0) continue
    const [a, b] = lines[i]!.split('-->')
    const start = toSec(a ?? '')
    const end = toSec((b ?? '').trim().split(/\s+/)[0] ?? '')
    if (Number.isNaN(start) || Number.isNaN(end)) continue
    const text = lines
      .slice(i + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (text) cues.push({ start, dur: Math.max(0, end - start), text })
  }
  if (cues.length === 0) throw new YouTubeError('NO_CAPTIONS', 'No cues found in subtitle file')
  return cues
}
