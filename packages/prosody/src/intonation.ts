import { ENERGY_MAX, extractEnergy, extractF0 } from './contour'

const HOP = 512
/** Wider than the pronunciation chart's 50-300 Hz: higher voices and noisy video audio need the headroom. */
const F0_MIN = 75
const F0_MAX = 500

export interface Contour {
  /** Hz per frame, 0 where unvoiced. */
  f0: ArrayLike<number>
  /** Frame energy scaled to 0..ENERGY_MAX. */
  energy: ArrayLike<number>
  frameSec: number
}

export interface IntonationChart {
  frameSec: number
  /** Pitch in semitones from the speaker's median, one point per reference frame; null = unvoiced. */
  reference: (number | null)[]
  /** The attempt's pitch warped onto the reference timeline. */
  user: (number | null)[]
}

export interface IntonationResult {
  /** Fluency 0-100. */
  score: number
  /** Pearson correlation of the aligned pitch contours, -1..1. */
  correlation: number
  /** Attempt pitch range / reference pitch range. */
  rangeRatio: number
  /** 0..1: speech-rate and timing agreement. */
  rhythm: number
  /** 0..1: pause count and length agreement. */
  pause: number
  chart: IntonationChart
}

const WEIGHTS = { correlation: 0.4, range: 0.2, rhythm: 0.25, pause: 0.15 }
const SMOOTH_RADIUS = 2
const MIN_VOICED = 3
const BAND = 0.25
const SILENCE = ENERGY_MAX * 0.1
const MIN_PAUSE_SEC = 0.15
const ENERGY_WEIGHT = 4 / ENERGY_MAX

export function extractContour(audio: Float32Array, sampleRate: number): Contour {
  return {
    f0: extractF0(audio, { sampleRate, fmin: F0_MIN, fmax: F0_MAX }),
    energy: extractEnergy(audio),
    frameSec: HOP / sampleRate,
  }
}

/** True when the contour has enough voiced frames to compare pitch. */
export const hasPitch = (c: Pick<Contour, 'f0'>): boolean =>
  Array.from(c.f0).filter((v) => v > 0).length >= MIN_VOICED

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** Pitch in semitones relative to the median voiced f0; NaN where unvoiced. */
export function toSemitones(f0: ArrayLike<number>): Float32Array {
  const voiced = Array.from(f0).filter((v) => v > 0)
  const out = new Float32Array(f0.length).fill(NaN)
  if (!voiced.length) return out
  voiced.sort((a, b) => a - b)
  const median = voiced[voiced.length >> 1]!
  for (let i = 0; i < f0.length; i++) if (f0[i]! > 0) out[i] = 12 * Math.log2(f0[i]! / median)
  return out
}

/** Moving average over voiced neighbours; unvoiced frames stay NaN. */
function smooth(st: Float32Array): Float32Array {
  const out = new Float32Array(st.length).fill(NaN)
  for (let i = 0; i < st.length; i++) {
    if (Number.isNaN(st[i]!)) continue
    let sum = 0
    let n = 0
    for (
      let j = Math.max(0, i - SMOOTH_RADIUS);
      j <= Math.min(st.length - 1, i + SMOOTH_RADIUS);
      j++
    ) {
      if (!Number.isNaN(st[j]!)) {
        sum += st[j]!
        n++
      }
    }
    out[i] = sum / n
  }
  return out
}

/** Linear fill across unvoiced gaps, holding the edge values (DTW needs a value in every frame). */
function fill(st: Float32Array): Float32Array {
  const out = Float32Array.from(st)
  let prev = -1
  for (let i = 0; i < out.length; i++) {
    if (Number.isNaN(st[i]!)) continue
    if (prev === -1) out.fill(st[i]!, 0, i)
    else
      for (let j = prev + 1; j < i; j++)
        out[j] = st[prev]! + ((st[i]! - st[prev]!) * (j - prev)) / (i - prev)
    prev = i
  }
  if (prev !== -1) out.fill(st[prev]!, prev + 1)
  return out
}

const voicedCount = (st: Float32Array) => st.reduce((n, v) => n + (Number.isNaN(v) ? 0 : 1), 0)

/** DTW over (pitch, energy) frames inside a Sakoe-Chiba band; returns the warping path as [i, j] pairs. */
function align(
  a: { st: Float32Array; e: ArrayLike<number> },
  b: { st: Float32Array; e: ArrayLike<number> },
): [number, number][] {
  const n = a.st.length
  const m = b.st.length
  const w = Math.max(Math.abs(n - m), Math.ceil(BAND * Math.max(n, m))) + 1
  const cost = new Float32Array((n + 1) * (m + 1)).fill(Infinity)
  const at = (i: number, j: number) => i * (m + 1) + j
  cost[at(0, 0)] = 0
  for (let i = 1; i <= n; i++) {
    const centre = (i * m) / n
    for (
      let j = Math.max(1, Math.floor(centre - w));
      j <= Math.min(m, Math.ceil(centre + w));
      j++
    ) {
      const d =
        Math.abs(a.st[i - 1]! - b.st[j - 1]!) + ENERGY_WEIGHT * Math.abs(a.e[i - 1]! - b.e[j - 1]!)
      cost[at(i, j)] =
        d + Math.min(cost[at(i - 1, j - 1)]!, cost[at(i - 1, j)]!, cost[at(i, j - 1)]!)
    }
  }
  const path: [number, number][] = []
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    path.push([i - 1, j - 1])
    const diag = cost[at(i - 1, j - 1)]!
    const up = cost[at(i - 1, j)]!
    const left = cost[at(i, j - 1)]!
    if (diag <= up && diag <= left) {
      i--
      j--
    } else if (up <= left) i--
    else j--
  }
  return path.reverse()
}

function pearson(x: number[], y: number[]): number {
  const n = x.length
  if (n < MIN_VOICED) return 0
  const mx = x.reduce((s, v) => s + v, 0) / n
  const my = y.reduce((s, v) => s + v, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (x[i]! - mx) * (y[i]! - my)
    sxx += (x[i]! - mx) ** 2
    syy += (y[i]! - my) ** 2
  }
  const r = sxy / Math.sqrt(sxx * syy)
  return Number.isFinite(r) ? r : 0
}

function pitchRange(st: Float32Array): number {
  const v = Array.from(st)
    .filter((x) => !Number.isNaN(x))
    .sort((p, q) => p - q)
  if (!v.length) return 0
  return v[Math.min(v.length - 1, Math.floor(v.length * 0.9))]! - v[Math.floor(v.length * 0.1)]!
}

function pauses(c: Contour): { count: number; seconds: number } {
  let first = -1
  let last = -1
  for (let i = 0; i < c.energy.length; i++) {
    if (c.energy[i]! > SILENCE) {
      if (first === -1) first = i
      last = i
    }
  }
  let count = 0
  let seconds = 0
  let run = 0
  const flush = () => {
    if (run * c.frameSec >= MIN_PAUSE_SEC) {
      count++
      seconds += run * c.frameSec
    }
    run = 0
  }
  for (let i = first; first !== -1 && i <= last; i++) {
    if (c.energy[i]! <= SILENCE) run++
    else flush()
  }
  return { count, seconds }
}

/** Drops the silent frames before the first and after the last speech frame. */
export function trimSilence(c: Contour): Contour {
  let first = -1
  let last = -1
  for (let i = 0; i < c.energy.length; i++) {
    if (c.energy[i]! > SILENCE) {
      if (first === -1) first = i
      last = i
    }
  }
  if (first === -1 || (first === 0 && last === c.energy.length - 1)) return c
  return {
    f0: Array.from(c.f0).slice(first, last + 1),
    energy: Array.from(c.energy).slice(first, last + 1),
    frameSec: c.frameSec,
  }
}

function pauseScore(ref: Contour, user: Contour): number {
  const r = pauses(ref)
  const u = pauses(user)
  if (!r.count && !u.count) return 1
  const time = 1 - Math.abs(u.seconds - r.seconds) / Math.max(u.seconds, r.seconds, 0.5)
  const count = 1 - Math.abs(u.count - r.count) / Math.max(u.count, r.count, 1)
  return clamp01(0.7 * time + 0.3 * count)
}

/**
 * Compares the learner's pitch/energy contour with the reference one. Pitch is taken in semitones
 * from each speaker's own median (so voices of different registers compare), smoothed and
 * DTW-aligned; the score blends contour correlation, pitch-range ratio, rhythm and pauses.
 */
export function compareIntonation(rawReference: Contour, rawUser: Contour): IntonationResult {
  const reference = trimSilence(rawReference)
  const user = trimSilence(rawUser)
  const refSt = smooth(toSemitones(reference.f0))
  const userSt = smooth(toSemitones(user.f0))
  const n = refSt.length
  const empty: IntonationResult = {
    score: 0,
    correlation: 0,
    rangeRatio: 0,
    rhythm: 0,
    pause: 0,
    chart: {
      frameSec: reference.frameSec,
      reference: Array.from(refSt, (v) => (Number.isNaN(v) ? null : v)),
      user: new Array<number | null>(n).fill(null),
    },
  }
  if (voicedCount(refSt) < MIN_VOICED || voicedCount(userSt) < MIN_VOICED) return empty

  const path = align({ st: fill(refSt), e: reference.energy }, { st: fill(userSt), e: user.energy })

  const px: number[] = []
  const py: number[] = []
  const sums = new Float64Array(n)
  const counts = new Uint32Array(n)
  let warp = 0
  for (const [i, j] of path) {
    const u = userSt[j]!
    if (!Number.isNaN(u)) {
      sums[i] = (sums[i] ?? 0) + u
      counts[i] = (counts[i] ?? 0) + 1
      if (!Number.isNaN(refSt[i]!)) {
        px.push(refSt[i]!)
        py.push(u)
      }
    }
    warp += Math.abs(i / n - j / userSt.length)
  }

  const correlation = pearson(px, py)
  const refRange = pitchRange(refSt)
  const userRange = pitchRange(userSt)
  const rangeRatio = refRange > 0.5 ? userRange / refRange : userRange <= 0.5 ? 1 : 0
  const rangeScore = rangeRatio > 0 ? Math.min(rangeRatio, 1 / rangeRatio) : 0
  const durationScore = Math.min(n, userSt.length) / Math.max(n, userSt.length)
  const warpScore = clamp01(1 - (4 * warp) / path.length)
  const rhythm = 0.5 * durationScore + 0.5 * warpScore
  const pause = pauseScore(reference, user)

  const score =
    100 *
    (WEIGHTS.correlation * clamp01(correlation) +
      WEIGHTS.range * rangeScore +
      WEIGHTS.rhythm * rhythm +
      WEIGHTS.pause * pause)

  return {
    score: Math.round(score * 10) / 10,
    correlation,
    rangeRatio,
    rhythm,
    pause,
    chart: {
      frameSec: reference.frameSec,
      reference: Array.from(refSt, (v) => (Number.isNaN(v) ? null : v)),
      user: Array.from(counts, (c, i) => (c ? sums[i]! / c : null)),
    },
  }
}
