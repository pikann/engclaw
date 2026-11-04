/** Kokoro reference-voice helpers (pure): text -> token ids, style row, silence trim. */

export const KOKORO_SAMPLE_RATE = 24000
/** Kokoro's context limit: at most 510 phoneme tokens per call (plus a pad at each end). */
export const KOKORO_MAX_TOKENS = 510
const STYLE_DIM = 256

/** Maps espeak IPA (stress marks kept, `_` phone separators removed) to model token ids; unknown symbols are dropped. */
export function ipaToTokenIds(ipa: string, vocab: Readonly<Record<string, number>>): number[] {
  const ids: number[] = []
  for (const ch of ipa.replace(/_/g, '')) {
    const id = vocab[ch]
    if (id !== undefined) ids.push(id)
  }
  return ids
}

/** Splits text into sentences so each fits Kokoro's token limit more easily; keeps non-empty trimmed parts. */
export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?;:\n]+[.!?;:]*/g) ?? []).map((s) => s.trim()).filter((s) => /\w/.test(s))
}

/** Cuts an id list into pieces of at most `max` tokens. */
export function chunkTokenIds(ids: readonly number[], max = KOKORO_MAX_TOKENS): number[][] {
  const chunks: number[][] = []
  for (let i = 0; i < ids.length; i += max) chunks.push(ids.slice(i, i + max))
  return chunks
}

/** Model input ids: the chunk wrapped in pad token 0. */
export const withPad = (ids: readonly number[]): number[] => [0, ...ids, 0]

/**
 * Style vector for a chunk: a voice pack is `[510, 1, 256]` flattened; the row is picked by the
 * number of tokens (without padding).
 */
export function styleRow(voice: Float32Array, tokenCount: number): Float32Array {
  const rows = Math.floor(voice.length / STYLE_DIM)
  const row = Math.min(Math.max(tokenCount, 0), rows - 1)
  return voice.slice(row * STYLE_DIM, (row + 1) * STYLE_DIM)
}

/** Drops leading/trailing samples quieter than `threshold`, keeping `padSamples` of margin. */
export function trimSilence(
  samples: Float32Array,
  threshold = 0.005,
  padSamples = 0,
): Float32Array {
  let start = 0
  let end = samples.length
  while (start < end && Math.abs(samples[start]!) < threshold) start++
  while (end > start && Math.abs(samples[end - 1]!) < threshold) end--
  if (start === end) return new Float32Array(0)
  return samples.slice(Math.max(0, start - padSamples), Math.min(samples.length, end + padSamples))
}

export function concatAudio(parts: readonly Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
