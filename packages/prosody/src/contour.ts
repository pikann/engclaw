import { rms } from './energy'
import { pyin, type PyinOptions } from './pyin'

/** Upper bound of the scaled energy contour (OpenPronounce charts energy on 0-250). */
export const ENERGY_MAX = 250

export interface ContourOptions extends Partial<Omit<PyinOptions, 'sampleRate'>> {
  sampleRate: number
}

/** pYIN F0 in Hz per frame, 0 where unvoiced (OpenPronounce: `nan_to_num(f0)`), fmin 50 / fmax 300. */
export function extractF0(y: Float32Array, opts: ContourOptions): Float32Array {
  const { f0 } = pyin(y, opts)
  for (let i = 0; i < f0.length; i++) if (Number.isNaN(f0[i]!)) f0[i] = 0
  return f0
}

/**
 * Linearly interpolate over unvoiced (<= 0 or NaN) frames, like `np.interp` over the voiced frames:
 * leading and trailing gaps hold the nearest voiced value. An all-unvoiced contour stays at 0.
 */
export function interpolateF0(f0: ArrayLike<number>): Float32Array {
  const n = f0.length
  const out = new Float32Array(n)
  const voiced = (i: number) => f0[i]! > 0
  let prev = -1
  for (let i = 0; i < n; i++) {
    if (!voiced(i)) continue
    if (prev === -1) out.fill(f0[i]!, 0, i)
    else {
      const a = f0[prev]!
      const b = f0[i]!
      for (let j = prev + 1; j < i; j++) out[j] = a + ((b - a) * (j - prev)) / (i - prev)
    }
    out[i] = f0[i]!
    prev = i
  }
  if (prev !== -1) out.fill(f0[prev]!, prev + 1)
  return out
}

/** Frame RMS energy (librosa framing, 2048/512) min-max scaled to 0-250; a flat signal gives all 0. */
export function extractEnergy(y: Float32Array, frameLength = 2048, hopLength = 512): Float32Array {
  const e = rms(y, frameLength, hopLength)
  let lo = Infinity
  let hi = -Infinity
  for (const v of e) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  const span = hi - lo
  const out = new Float32Array(e.length)
  if (!(span > 0)) return out
  for (let i = 0; i < e.length; i++) out[i] = ((e[i]! - lo) / span) * ENERGY_MAX
  return out
}
