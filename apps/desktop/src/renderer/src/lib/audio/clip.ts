/** Clip cap and overlapping chunking for CTC inference on long audio. */

export const MAX_CLIP_SECONDS = 900

export function capClip(
  samples: Float32Array,
  sampleRate: number,
  maxSeconds = MAX_CLIP_SECONDS,
): { samples: Float32Array; truncated: boolean } {
  const max = Math.round(sampleRate * maxSeconds)
  return samples.length <= max
    ? { samples, truncated: false }
    : { samples: samples.subarray(0, max), truncated: true }
}

export function chunkWithOverlap(
  samples: Float32Array,
  sampleRate: number,
  chunkSeconds: number,
  overlapSeconds: number,
): { start: number; end: number }[] {
  if (overlapSeconds >= chunkSeconds) throw new Error('overlap must be shorter than the chunk')
  const size = Math.round(sampleRate * chunkSeconds)
  const step = size - Math.round(sampleRate * overlapSeconds)
  if (samples.length <= size) return [{ start: 0, end: samples.length }]
  const out: { start: number; end: number }[] = []
  for (let start = 0; ; start += step) {
    const end = Math.min(start + size, samples.length)
    out.push({ start, end })
    if (end === samples.length) return out
  }
}
