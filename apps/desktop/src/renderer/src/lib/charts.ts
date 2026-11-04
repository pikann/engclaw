import type { PronunciationResult } from '@engclaw/ipc-contract'

/** Pure geometry for the lightweight SVG detail charts (no charting dependency). */

export type Domain = [number, number]

/** [min, max] over every finite value; a flat or empty series gets a drawable range. */
export function domainOf(...series: readonly (readonly number[])[]): Domain {
  const all = series.flat().filter(Number.isFinite)
  if (!all.length) return [0, 1]
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  return hi > lo ? [lo, hi] : [lo - 0.5, hi + 0.5]
}

const r = (n: number): number => Math.round(n * 100) / 100

/** SVG path for `values` spread across `width`, scaled into `domain`, y pointing up. */
export function linePath(
  values: readonly number[],
  width: number,
  height: number,
  [lo, hi]: Domain,
): string {
  if (!values.length) return ''
  const span = hi - lo || 1
  const last = Math.max(1, values.length - 1)
  return values
    .map((v, i) => {
      const x = (i / last) * width
      const y = height - ((v - lo) / span) * height
      return `${i ? 'L' : 'M'}${r(x)},${r(y)}`
    })
    .join(' ')
}

export interface DetailSeries {
  phoneme: { reference: number[]; you: number[] }
  f0: number[]
  energy: number[]
}

export const detailSeries = (result: PronunciationResult): DetailSeries => ({
  phoneme: {
    reference: result.differences.expected_vector,
    you: result.differences.transcribed_vector,
  },
  f0: result.prosody.f0,
  energy: result.prosody.energy,
})
