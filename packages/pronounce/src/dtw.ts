/** FastDTW (Salvador & Chan) over frame-major `Float32Array`s with euclidean frame distance, radius-bounded. */

export type PathPoint = readonly [number, number]

export interface DtwResult {
  /** Sum of frame distances along the path. */
  distance: number
  path: PathPoint[]
}

/** Per-row inclusive column range `[lo[i], hi[i]]` of the cells the DTW may visit. */
interface Window {
  lo: Int32Array
  hi: Int32Array
}

function frameCount(x: Float32Array, dim: number, name: string): number {
  if (!Number.isInteger(dim) || dim < 1) throw new Error('dtw: dim must be a positive integer')
  if (x.length === 0 || x.length % dim !== 0)
    throw new Error(`dtw: ${name} must be a non-empty multiple of dim`)
  return x.length / dim
}

function euclid(x: Float32Array, i: number, y: Float32Array, j: number, dim: number): number {
  let s = 0
  const xo = i * dim
  const yo = j * dim
  for (let k = 0; k < dim; k++) {
    const d = x[xo + k]! - y[yo + k]!
    s += d * d
  }
  return Math.sqrt(s)
}

/** Halve the resolution by averaging adjacent frames (an odd trailing frame is dropped, as in `fastdtw`). */
function coarsen(x: Float32Array, dim: number): Float32Array {
  const n = Math.floor(x.length / dim / 2)
  const out = new Float32Array(n * dim)
  for (let i = 0; i < n; i++)
    for (let k = 0; k < dim; k++)
      out[i * dim + k] = (x[2 * i * dim + k]! + x[(2 * i + 1) * dim + k]!) / 2
  return out
}

function windowedDtw(
  x: Float32Array,
  y: Float32Array,
  dim: number,
  n: number,
  m: number,
  w: Window,
): DtwResult {
  const offsets = new Int32Array(n + 1)
  for (let i = 0; i < n; i++) offsets[i + 1] = offsets[i]! + (w.hi[i]! - w.lo[i]! + 1)
  const cost = new Float64Array(offsets[n]!).fill(Infinity)
  // 0 = diagonal, 1 = from previous row, 2 = from previous column
  const back = new Uint8Array(offsets[n]!)
  const at = (i: number, j: number) => offsets[i]! + (j - w.lo[i]!)
  const get = (i: number, j: number) =>
    i < 0 || j < 0 || j < w.lo[i]! || j > w.hi[i]! ? Infinity : cost[at(i, j)]!

  for (let i = 0; i < n; i++) {
    for (let j = w.lo[i]!; j <= w.hi[i]!; j++) {
      const d = euclid(x, i, y, j, dim)
      let best: number
      let from = 0
      if (i === 0 && j === 0) {
        best = 0
      } else {
        const diag = get(i - 1, j - 1)
        const up = get(i - 1, j)
        const left = get(i, j - 1)
        best = diag
        if (up < best) {
          best = up
          from = 1
        }
        if (left < best) {
          best = left
          from = 2
        }
      }
      cost[at(i, j)] = best + d
      back[at(i, j)] = from
    }
  }

  const path: [number, number][] = []
  let i = n - 1
  let j = m - 1
  while (i > 0 || j > 0) {
    path.push([i, j])
    const from = back[at(i, j)]!
    if (from === 0) {
      i--
      j--
    } else if (from === 1) i--
    else j--
  }
  path.push([0, 0])
  path.reverse()
  return { distance: cost[at(n - 1, m - 1)]!, path }
}

const fullWindow = (n: number, m: number): Window => ({
  lo: new Int32Array(n),
  hi: new Int32Array(n).fill(m - 1),
})

/** Exact DTW over the full cost matrix (reference implementation and FastDTW base case). */
export function dtw(x: Float32Array, y: Float32Array, dim: number): DtwResult {
  const n = frameCount(x, dim, 'x')
  const m = frameCount(y, dim, 'y')
  return windowedDtw(x, y, dim, n, m, fullWindow(n, m))
}

/** Widen a coarse path by `radius` coarse cells, then project it onto the finer resolution (as `fastdtw` does). */
function projectWindow(path: readonly PathPoint[], n: number, m: number, radius: number): Window {
  const lo = new Int32Array(n).fill(m)
  const hi = new Int32Array(n).fill(-1)
  const mark = (i: number, jlo: number, jhi: number) => {
    if (i < 0 || i >= n) return
    lo[i] = Math.min(lo[i]!, Math.max(0, jlo))
    hi[i] = Math.max(hi[i]!, Math.min(m - 1, jhi))
  }
  for (const [pi, pj] of path)
    for (let di = -radius; di <= radius; di++) {
      mark(2 * (pi + di), 2 * (pj - radius), 2 * (pj + radius) + 1)
      mark(2 * (pi + di) + 1, 2 * (pj - radius), 2 * (pj + radius) + 1)
    }

  // An odd trailing frame has no coarse parent; keep the window connected through to the corner.
  lo[0] = 0
  hi[n - 1] = m - 1
  for (let i = 0; i < n; i++) {
    if (hi[i]! < 0) {
      lo[i] = i > 0 ? lo[i - 1]! : 0
      hi[i] = i > 0 ? hi[i - 1]! : 0
    }
    if (i > 0) {
      lo[i] = Math.min(lo[i]!, hi[i - 1]! + 1)
      hi[i] = Math.max(hi[i]!, hi[i - 1]!)
    }
  }
  return { lo, hi }
}

/**
 * Approximate DTW in O(n) time and memory. `x` / `y` hold `dim`-wide frames back to back.
 * Same algorithm as the Python `fastdtw` package used by OpenPronounce.
 */
export function fastDtw(x: Float32Array, y: Float32Array, dim: number, radius = 1): DtwResult {
  const n = frameCount(x, dim, 'x')
  const m = frameCount(y, dim, 'y')
  if (n <= radius + 2 || m <= radius + 2) return windowedDtw(x, y, dim, n, m, fullWindow(n, m))
  const coarse = fastDtw(coarsen(x, dim), coarsen(y, dim), dim, radius)
  return windowedDtw(x, y, dim, n, m, projectWindow(coarse.path, n, m, radius))
}

/** Expand two per-frame series along a DTW path, e.g. for aligned chart vectors. */
export function alignByPath(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  path: readonly PathPoint[],
): { a: number[]; b: number[] } {
  return { a: path.map(([i]) => a[i]!), b: path.map(([, j]) => b[j]!) }
}
