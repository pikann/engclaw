/** Pure resampling (no DOM), shared by the renderer and the utility process. */

export const TARGET_SAMPLE_RATE = 16000

/** Windowed-sinc low-pass FIR, normalised to unity DC gain. */
function lowpassKernel(cutoff: number, taps: number): Float32Array {
  const k = new Float32Array(taps)
  const mid = (taps - 1) / 2
  let sum = 0
  for (let i = 0; i < taps; i++) {
    const x = i - mid
    const sinc = x === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x)
    const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (taps - 1)) // Hamming
    k[i] = sinc * w
    sum += k[i]!
  }
  for (let i = 0; i < taps; i++) k[i]! /= sum
  return k
}

/**
 * Resample mono audio. When downsampling, low-passes at the new Nyquist first (anti-alias),
 * then linearly interpolates. Used for live-recorded PCM; files go through OfflineAudioContext.
 */
export function resampleLinear(input: Float32Array, from: number, to: number): Float32Array {
  if (!(from > 0) || !(to > 0)) throw new Error('sample rates must be positive')
  if (from === to) return input
  let src = input
  if (to < from) {
    const kernel = lowpassKernel(0.45 * (to / from), 63)
    const half = (kernel.length - 1) / 2
    const filtered = new Float32Array(input.length)
    for (let i = 0; i < input.length; i++) {
      let acc = 0
      for (let j = 0; j < kernel.length; j++) {
        const idx = i + j - half
        if (idx >= 0 && idx < input.length) acc += input[idx]! * kernel[j]!
      }
      filtered[i] = acc
    }
    src = filtered
  }
  const n = Math.floor((input.length * to) / from)
  const out = new Float32Array(n)
  const ratio = from / to
  for (let i = 0; i < n; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const frac = pos - i0
    const a = src[i0] ?? 0
    const b = src[Math.min(i0 + 1, src.length - 1)] ?? a
    out[i] = a + (b - a) * frac
  }
  return out
}
