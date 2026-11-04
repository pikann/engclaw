/** CTC output handling: log-softmax, vocab and greedy decode. */

import type { PhoneHit, Vocab } from './types'

const SPECIAL = /^<.*>$/
const BLANK = '<pad>'

/** Build a Vocab from a HF `vocab.json` (token -> id); `<pad>` is the CTC blank. */
export function parseVocab(json: Record<string, number>): Vocab {
  const tokens: string[] = []
  for (const [tok, id] of Object.entries(json)) tokens[id] = tok
  const blankId = json[BLANK]
  if (blankId === undefined) throw new Error(`vocab has no ${BLANK} token`)
  return { tokens, blankId }
}

/** Row-wise log-softmax over `(frames, vocab)` logits laid out flat. */
export function logSoftmax(logits: Float32Array, frames: number, vocab: number): Float32Array {
  const out = new Float32Array(frames * vocab)
  for (let f = 0; f < frames; f++) {
    const o = f * vocab
    let max = -Infinity
    for (let v = 0; v < vocab; v++) max = Math.max(max, logits[o + v]!)
    let sum = 0
    for (let v = 0; v < vocab; v++) sum += Math.exp(logits[o + v]! - max)
    const lse = max + Math.log(sum)
    for (let v = 0; v < vocab; v++) out[o + v] = logits[o + v]! - lse
  }
  return out
}

/** Greedy CTC: argmax per frame, collapse repeats, drop blank and `<special>` tokens. */
export function decodeCtc(logProbs: Float32Array, frames: number, vocab: Vocab): PhoneHit[] {
  const size = vocab.tokens.length
  const hits: PhoneHit[] = []
  let runId = -1
  let run: PhoneHit | null = null
  for (let f = 0; f < frames; f++) {
    let best = 0
    for (let v = 1; v < size; v++)
      if (logProbs[f * size + v]! > logProbs[f * size + best]!) best = v
    if (best !== runId) {
      runId = best
      run = null
      const tok = vocab.tokens[best]
      if (best !== vocab.blankId && tok !== undefined && !SPECIAL.test(tok))
        hits.push((run = { phone: tok, confidence: 0, start: f, end: f }))
    }
    if (run) {
      run.confidence = Math.max(run.confidence, Math.exp(logProbs[f * size + best]!))
      run.end = f + 1
    }
  }
  return hits
}

/**
 * Greedy CTC text decode for character vocabularies (wav2vec2-base/large-960h): argmax per frame,
 * collapse repeats, drop blank and `<special>` tokens, `|` becomes a space. Output keeps the model's case (upper).
 */
export function decodeCtcText(
  logProbs: Float32Array,
  frames: number,
  vocab: Vocab,
  wordDelimiter = '|',
): string {
  const size = vocab.tokens.length
  let out = ''
  let previous = -1
  for (let f = 0; f < frames; f++) {
    let best = 0
    for (let v = 1; v < size; v++)
      if (logProbs[f * size + v]! > logProbs[f * size + best]!) best = v
    if (best === previous) continue
    previous = best
    const tok = vocab.tokens[best]
    if (best === vocab.blankId || tok === undefined || SPECIAL.test(tok)) continue
    out += tok === wordDelimiter ? ' ' : tok
  }
  return out.replace(/\s+/g, ' ').trim()
}
