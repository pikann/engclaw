/** CTC forced alignment: where in the audio each word of a known transcript is spoken. */

import type { Vocab } from './types'

export interface WordSpan {
  /** Frame span of the word's characters, start inclusive, end exclusive. */
  start: number
  end: number
}

/** Token ids of one word for a character vocabulary (wav2vec2-960h); characters the vocab lacks are dropped. */
export function wordTokens(word: string, vocab: Vocab): number[] {
  const ids: number[] = []
  for (const ch of word.toUpperCase()) {
    const id = vocab.tokens.indexOf(ch)
    if (id >= 0 && id !== vocab.blankId) ids.push(id)
  }
  return ids
}

/**
 * Viterbi alignment of `words` to CTC log-posteriors (flat `(frames, vocab)`), the same trellis as
 * torchaudio's `forced_align`. Words are joined by the `|` delimiter token when the vocab has one.
 * Returns one span per input word, or null for a word with no token in the vocab (digits, symbols).
 * Throws when the audio has too few frames for the transcript.
 */
export function forcedAlignWords(
  logProbs: Float32Array,
  frames: number,
  vocab: Vocab,
  words: readonly string[],
  wordDelimiter = '|',
): (WordSpan | null)[] {
  const size = vocab.tokens.length
  const delimiter = vocab.tokens.indexOf(wordDelimiter)

  const tokens: number[] = []
  /** Index into `tokens` of every word's first and last character. */
  const bounds: ({ first: number; last: number } | null)[] = []
  for (const word of words) {
    const ids = wordTokens(word, vocab)
    if (!ids.length) {
      bounds.push(null)
      continue
    }
    if (tokens.length && delimiter >= 0) tokens.push(delimiter)
    bounds.push({ first: tokens.length, last: tokens.length + ids.length - 1 })
    tokens.push(...ids)
  }
  if (!tokens.length) return words.map(() => null)

  // Extended CTC states: blank, t0, blank, t1, ..., blank. State 2i+1 emits tokens[i].
  const states = 2 * tokens.length + 1
  let repeats = 0
  for (let i = 1; i < tokens.length; i++) if (tokens[i] === tokens[i - 1]) repeats++
  if (frames < tokens.length + repeats)
    throw new Error('forced alignment: audio is too short for the transcript')

  const emit = (t: number, s: number) =>
    logProbs[t * size + (s % 2 === 0 ? vocab.blankId : tokens[(s - 1) >> 1]!)]!

  // back[t * states + s]: how many states s was entered from (0 stay, 1 step, 2 skip a blank).
  const back = new Uint8Array(frames * states)
  let prev = new Float64Array(states).fill(-Infinity)
  let cur = new Float64Array(states)
  prev[0] = emit(0, 0)
  if (states > 1) prev[1] = emit(0, 1)

  for (let t = 1; t < frames; t++) {
    for (let s = 0; s < states; s++) {
      let best = prev[s]!
      let from = 0
      if (s >= 1 && prev[s - 1]! > best) {
        best = prev[s - 1]!
        from = 1
      }
      const canSkip = s >= 2 && s % 2 === 1 && tokens[(s - 1) >> 1] !== tokens[((s - 1) >> 1) - 1]
      if (canSkip && prev[s - 2]! > best) {
        best = prev[s - 2]!
        from = 2
      }
      cur[s] = best + emit(t, s)
      back[t * states + s] = from
    }
    ;[prev, cur] = [cur, prev]
  }

  let s = states - 1
  if (states > 1 && prev[states - 2]! > prev[states - 1]!) s = states - 2
  if (prev[s] === -Infinity) throw new Error('forced alignment: no valid path')

  const first = new Int32Array(tokens.length).fill(-1)
  const last = new Int32Array(tokens.length).fill(-1)
  for (let t = frames - 1; t >= 0; t--) {
    if (s % 2 === 1) {
      const i = (s - 1) >> 1
      if (last[i]! < 0) last[i] = t
      first[i] = t
    }
    s -= back[t * states + s]!
  }

  return bounds.map((b) => (b ? { start: first[b.first]!, end: last[b.last]! + 1 } : null))
}
