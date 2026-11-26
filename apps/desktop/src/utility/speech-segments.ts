/** Turns per-frame speech probabilities (Silero VAD) into the stretches of audio worth transcribing. */
import { MIN_SPEECH_FRAMES, SPEECH_OFF, SPEECH_ON, VAD_FRAME } from '@engclaw/pronounce'

const SAMPLE_RATE = 16000
/** Quiet shorter than this (about 0.13 s) is part of the speech around it. */
const MIN_SILENCE_FRAMES = 4
/** Silence kept on each side of a segment (about 0.2 s). */
const PAD_FRAMES = 6
/** Longer silences than this (about 1.5 s) always separate two segments. */
const MAX_JOIN_FRAMES = 47
/** Moonshine reads segments of this length best (ENGC-119). */
const DEFAULT_MAX_SECONDS = 15

export interface SpeechSegment {
  /** Sample offsets into the audio, end exclusive. */
  start: number
  end: number
}

interface Region {
  /** Frame offsets, end exclusive. */
  start: number
  end: number
}

function speechRegions(probs: ArrayLike<number>): Region[] {
  const regions: Region[] = []
  let start = -1
  let end = 0
  let voiced = 0
  let quiet = 0
  const close = () => {
    if (start >= 0 && voiced >= MIN_SPEECH_FRAMES) regions.push({ start, end })
    start = -1
    voiced = 0
    quiet = 0
  }
  for (let i = 0; i < probs.length; i++) {
    const p = probs[i]!
    if (p >= SPEECH_ON) {
      if (start < 0) start = i
      voiced++
    }
    if (start < 0) continue
    if (p >= SPEECH_OFF) {
      end = i + 1
      quiet = 0
    } else if (++quiet >= MIN_SILENCE_FRAMES) close()
  }
  close()
  return regions
}

/** Cuts speech longer than `limit` frames at its least speech-like frame in the second half. */
function cutLong(region: Region, probs: ArrayLike<number>, limit: number): Region[] {
  const parts: Region[] = []
  let { start } = region
  while (region.end - start > limit) {
    let cut = start + limit
    for (let i = start + limit; i > start + Math.floor(limit / 2); i--)
      if (probs[i]! < probs[cut]!) cut = i
    parts.push({ start, end: cut })
    start = cut
  }
  parts.push({ start, end: region.end })
  return parts
}

/** Joins neighbours while they fit in one segment, but never across a long silence. */
function pack(regions: Region[], limit: number): Region[] {
  const packed: Region[] = []
  for (const r of regions) {
    const last = packed.at(-1)
    if (last && r.end - last.start <= limit && r.start - last.end <= MAX_JOIN_FRAMES)
      last.end = r.end
    else packed.push({ ...r })
  }
  return packed
}

/**
 * Splits audio into segments of at most `maxSeconds`, cutting at pauses where it can. Returns
 * nothing when nobody speaks, so silence is never sent to a recognizer.
 */
export function splitSpeech(
  probs: ArrayLike<number>,
  totalSamples: number,
  options: { maxSeconds?: number } = {},
): SpeechSegment[] {
  const maxFrames = Math.floor(
    ((options.maxSeconds ?? DEFAULT_MAX_SECONDS) * SAMPLE_RATE) / VAD_FRAME,
  )
  // Room for the silence kept on both sides.
  const limit = Math.max(1, maxFrames - 2 * PAD_FRAMES)
  const segments = pack(
    speechRegions(probs).flatMap((r) => cutLong(r, probs, limit)),
    limit,
  )
  // Padding stops halfway to a neighbour, so segments never overlap.
  const middle = (a: Region, b: Region) => Math.floor((a.end + b.start) / 2)
  return segments.map((r, i) => {
    const before = segments[i - 1]
    const after = segments[i + 1]
    const from = Math.max(0, r.start - PAD_FRAMES, before ? middle(before, r) : 0)
    const to = Math.min(r.end + PAD_FRAMES, after ? middle(r, after) : Infinity)
    return { start: from * VAD_FRAME, end: Math.min(totalSamples, to * VAD_FRAME) }
  })
}
