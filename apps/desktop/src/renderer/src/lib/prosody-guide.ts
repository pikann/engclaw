import type { SegmentProsody } from '@engclaw/ipc-contract'

type WordProsody = SegmentProsody['words'][number]

export interface ProsodyToken {
  text: string
  /** Null for pieces the aligner skipped (punctuation, words it could not place). */
  word: WordProsody | null
  /** Seconds of silence after this piece, or null when the speaker keeps going. */
  pauseAfter: number | null
}

/**
 * Pairs the whitespace-separated pieces of a sentence with the analysed words, in order. The
 * analysis keeps the piece text as is, so pieces it dropped simply stay without a word.
 */
export function alignProsody(text: string, prosody: SegmentProsody): ProsodyToken[] {
  const pauseAfter = new Map(prosody.pauses.map((p) => [p.afterWordIndex, p.duration]))
  const pieces = text.split(/\s+/).filter(Boolean)
  let next = 0
  return pieces.map((piece, i) => {
    const word = prosody.words[next]?.text === piece ? prosody.words[next]! : null
    const pause = word && i < pieces.length - 1 ? (pauseAfter.get(next) ?? null) : null
    if (word) next++
    return { text: piece, word, pauseAfter: pause }
  })
}
