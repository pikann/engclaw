import { parseVideoId } from '@engclaw/youtube/src/videoId'

export interface Cue {
  start: number
  dur: number
  text: string
}

export interface Segment {
  index: number
  start: number
  end: number
  text: string
}

/** The 11-char id of a YouTube link (or bare id), or null when it is not one. */
export function parseVideoUrl(input: string): string | null {
  try {
    return parseVideoId(input)
  } catch {
    return null
  }
}

const NON_SPEECH = /\[[^\]]*\]|\([^)]*\)|[♪♫]/g
const ABBREVIATIONS = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'sr',
  'jr',
  'st',
  'vs',
  'etc',
  'inc',
  'ltd',
  'co',
  'mt',
  'no',
  'e.g',
  'i.e',
])
const PAUSE_SPLIT_SEC = 1.5
const MAX_SEGMENT_CHARS = 220

/** Offsets just after a sentence-ending mark (`. ! ?`) that is followed by whitespace or the end. */
function sentenceEnds(text: string): number[] {
  const ends: number[] = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '…') continue
    let end = i + 1
    while (end < text.length && /[.!?…"'”’)\]]/.test(text[end]!)) end++
    if (end < text.length && !/\s/.test(text[end]!)) {
      i = end - 1
      continue
    }
    if (ch === '.') {
      const word = /([A-Za-z.]+)$/.exec(text.slice(0, i))?.[1] ?? ''
      if (ABBREVIATIONS.has(word.toLowerCase()) || /^[A-Z]$/.test(word)) {
        i = end - 1
        continue
      }
    }
    ends.push(end)
    i = end - 1
  }
  return ends
}

/**
 * Splits timed captions into sentence segments. Segments are contiguous: each one ends where the
 * next starts, so the playing segment is always well defined. Unpunctuated captions are split at
 * long pauses and at a length cap so segments stay practice-sized.
 */
export function segmentCues(cues: readonly Cue[]): Segment[] {
  const clean = cues
    .map((c) => ({ ...c, text: c.text.replace(NON_SPEECH, ' ').replace(/\s+/g, ' ').trim() }))
    .filter((c) => c.text)
    .sort((a, b) => a.start - b.start)
  if (!clean.length) return []

  const ranges: { cs: number; ce: number; start: number; dur: number }[] = []
  let joined = ''
  for (const c of clean) {
    if (joined) joined += ' '
    ranges.push({
      cs: joined.length,
      ce: joined.length + c.text.length,
      start: c.start,
      dur: c.dur,
    })
    joined += c.text
  }

  const cuts = new Set(sentenceEnds(joined))
  let last = 0
  clean.forEach((c, i) => {
    const r = ranges[i]!
    for (const e of cuts) if (e <= r.cs && e > last) last = e
    if (i === 0) return
    const prev = ranges[i - 1]!
    const gap = c.start - (prev.start + prev.dur)
    const pending = joined.slice(last, r.cs).trim().length
    if (pending > 0 && (gap > PAUSE_SPLIT_SEC || pending + c.text.length > MAX_SEGMENT_CHARS)) {
      cuts.add(r.cs)
      last = r.cs
    }
  })
  cuts.add(joined.length)

  const timeAt = (offset: number, edge: 'start' | 'end'): number => {
    const probe = edge === 'start' ? offset : offset - 1
    const r = ranges.find((x) => probe >= x.cs && probe < x.ce) ?? ranges.at(-1)!
    const frac = r.ce === r.cs ? 0 : (offset - r.cs) / (r.ce - r.cs)
    return r.start + r.dur * Math.min(1, Math.max(0, frac))
  }

  const raw: { start: number; text: string }[] = []
  let from = 0
  for (const to of [...cuts].sort((a, b) => a - b)) {
    const slice = joined.slice(from, to)
    const text = slice.trim()
    if (text) {
      const first = from + (slice.length - slice.trimStart().length)
      raw.push({ start: timeAt(first, 'start'), text })
    }
    from = to
  }

  const lastCue = ranges.at(-1)!
  const segments: Segment[] = []
  raw.forEach((s, i) => {
    const prev = segments[i - 1]
    const start = prev && s.start <= prev.start ? prev.start + 0.01 : s.start
    if (prev) prev.end = start
    segments.push({ index: i, start, end: start, text: s.text })
  })
  const tail = segments.at(-1)!
  tail.end = Math.max(lastCue.start + lastCue.dur, tail.start + 0.01)
  return segments
}

/** Index of the segment playing at `time`, or -1 before the first segment / after the last one. */
export function segmentIndexAt(segments: readonly Segment[], time: number): number {
  let lo = 0
  let hi = segments.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (segments[mid]!.start <= time) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  if (found === -1 || time >= segments[found]!.end) return -1
  return found
}

/** The caption language to load: manual English first, then auto-generated English, else null. */
export function pickCaptionTrack(
  tracks: readonly { lang: string; auto: boolean }[],
): string | null {
  const english = tracks.filter((t) => t.lang === 'en' || t.lang.startsWith('en-'))
  return (english.find((t) => !t.auto) ?? english[0])?.lang ?? null
}

export type EntryError = 'invalid' | 'noTranscript' | 'unavailable' | 'network'

/**
 * Which entry-screen banner a main-process YouTube failure maps to (IA doc §4.1). A broken
 * extractor while loading video info is what a blocked network looks like (YouTube answers the
 * bot check with HTTP 400), so it is reported as unreachable with Retry. After the info loaded,
 * any non-network transcript failure means this video cannot be used.
 */
export function mapYouTubeError(
  code: 'NOT_FOUND' | 'NO_CAPTIONS' | 'RATE_LIMITED' | 'EXTRACTOR_BROKEN' | 'NETWORK',
  stage: 'meta' | 'transcript',
): Exclude<EntryError, 'invalid'> {
  if (code === 'NETWORK' || code === 'RATE_LIMITED') return 'network'
  if (code === 'EXTRACTOR_BROKEN' && stage === 'meta') return 'network'
  return stage === 'transcript' ? 'noTranscript' : 'unavailable'
}

export interface StageFit {
  videoWidth: number
  videoHeight: number
  sentenceHeight: number
  fontSize: number
  sentenceScrolls: boolean
}

const MIN_FONT = 16
const MAX_FONT = 56
const LINE_HEIGHT = 1.4
const CHAR_EM = 0.55
const SIDE_PADDING = 32

/**
 * IA doc §4.2 fit rules. Fixed chrome comes first, the sentence takes the largest font (16-56 px, capped by width,
 * up to 3 lines at the top end, at most 30% of the stage) and the video gets the biggest 16:9 in
 * what is left, never below 45% of the stage height.
 */
export function fitStage(input: {
  stageWidth: number
  stageHeight: number
  chromeHeight: number
  sentenceChars: number
}): StageFit {
  const { stageWidth, stageHeight, chromeHeight, sentenceChars } = input
  const available = Math.max(0, stageHeight - chromeHeight)
  const textWidth = Math.max(1, stageWidth - SIDE_PADDING)
  const maxSentence = stageHeight * 0.3
  const needed = (font: number) =>
    Math.max(2, Math.ceil((sentenceChars * font * CHAR_EM) / textWidth)) * font * LINE_HEIGHT

  // The ceiling scales with stage width so narrow windows get smaller text; wide stages keep 56.
  const maxFont = Math.max(MIN_FONT, Math.min(MAX_FONT, Math.floor(stageWidth / 28 / 2) * 2))
  let fontSize = MIN_FONT
  for (let f = maxFont; f >= MIN_FONT; f -= 2) {
    const lines = Math.ceil((sentenceChars * f * CHAR_EM) / textWidth)
    if (lines <= 3 && needed(f) <= maxSentence) {
      fontSize = f
      break
    }
  }

  let sentenceHeight = Math.min(needed(fontSize), maxSentence)
  let sentenceScrolls = needed(fontSize) > sentenceHeight
  let videoHeight = available - sentenceHeight
  const floor = stageHeight * 0.45
  if (videoHeight < floor) {
    videoHeight = Math.min(floor, available)
    sentenceHeight = available - videoHeight
    sentenceScrolls = needed(fontSize) > sentenceHeight
  }
  const videoWidth = Math.max(0, Math.min(stageWidth, (videoHeight * 16) / 9))
  return {
    videoWidth,
    videoHeight: (videoWidth * 9) / 16,
    sentenceHeight,
    fontSize,
    sentenceScrolls,
  }
}

const DICTATION_MIN_FONT = 14
const DICTATION_MAX_FONT = 28
const DICTATION_MIN_VIDEO_HEIGHT = 170
const DICTATION_LINE_HEIGHT = 2.4
const DICTATION_CHAR_EM = 0.6

/**
 * Dictation fit: the whole sentence (inputs included) must show without scrolling, so the font is the
 * largest in 14-28 px whose wrapped height still leaves a usable video, and the video takes everything left.
 */
export function fitDictation(input: {
  stageWidth: number
  stageHeight: number
  chromeHeight: number
  sentenceChars: number
  extraHeight: number
}): StageFit {
  const { stageWidth, stageHeight, chromeHeight, sentenceChars, extraHeight } = input
  const available = Math.max(0, stageHeight - chromeHeight)
  const textWidth = Math.max(1, stageWidth - SIDE_PADDING)
  const needed = (font: number) =>
    Math.max(1, Math.ceil((sentenceChars * font * DICTATION_CHAR_EM) / textWidth)) *
      font *
      DICTATION_LINE_HEIGHT +
    extraHeight
  const minVideo = Math.min(DICTATION_MIN_VIDEO_HEIGHT, available * 0.45)
  let fontSize = DICTATION_MIN_FONT
  for (let f = DICTATION_MAX_FONT; f >= DICTATION_MIN_FONT; f -= 1) {
    if (available - needed(f) >= minVideo) {
      fontSize = f
      break
    }
  }
  const sentenceHeight = Math.min(needed(fontSize), Math.max(0, available - minVideo))
  const videoCap = available - needed(fontSize)
  const videoWidth = Math.max(0, Math.min(stageWidth, (Math.max(videoCap, minVideo) * 16) / 9))
  return {
    videoWidth,
    videoHeight: (videoWidth * 9) / 16,
    sentenceHeight: Math.max(sentenceHeight, available - (videoWidth * 9) / 16),
    fontSize,
    sentenceScrolls: needed(fontSize) > available - minVideo,
  }
}

/** `m:ss` (or `h:mm:ss`) for a position in seconds. */
export function formatClock(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** The transcript as plain text for printing: one sentence per line, optionally led by `[clock]`. */
export function formatTranscriptText(segments: readonly Segment[], timestamps: boolean): string {
  return segments
    .map((s) => (timestamps ? `[${formatClock(s.start)}] ${s.text}` : s.text) + '\n')
    .join('')
}

/** A safe `.txt` file name from a video title. */
export function transcriptFileName(title: string): string {
  const base = title
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .trim()
  return `${base || 'transcript'}.txt`
}
