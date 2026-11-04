import { describe, expect, it } from 'vitest'
import { alignByPath, dtw, fastDtw } from './dtw'

const frames = (rows: number[][]) => ({
  data: Float32Array.from(rows.flat()),
  dim: rows[0]!.length,
})
const seq = (values: number[]) => frames(values.map((v) => [v]))

describe('fastDtw', () => {
  it('identical sequences: zero distance along the diagonal', () => {
    const a = seq([1, 2, 3, 4, 5])
    const r = fastDtw(a.data, a.data, 1)
    expect(r.distance).toBe(0)
    expect(r.path).toEqual([0, 1, 2, 3, 4].map((i) => [i, i]))
  })

  it('matches exact DTW on a stretched sequence (euclidean over vectors)', () => {
    const a = frames([
      [0, 0],
      [1, 1],
      [2, 2],
    ])
    const b = frames([
      [0, 0],
      [0, 0],
      [1, 1],
      [2, 2],
      [2, 2],
    ])
    const r = fastDtw(a.data, b.data, 2)
    expect(r.distance).toBe(0)
    expect(r.path[0]).toEqual([0, 0])
    expect(r.path.at(-1)).toEqual([2, 4])
  })

  it('path is monotone and spans both sequences', () => {
    const a = seq(Array.from({ length: 200 }, (_, i) => Math.sin(i / 7)))
    const b = seq(Array.from({ length: 170 }, (_, i) => Math.sin(i / 6)))
    const { path } = fastDtw(a.data, b.data, 1)
    expect(path[0]).toEqual([0, 0])
    expect(path.at(-1)).toEqual([199, 169])
    for (let k = 1; k < path.length; k++) {
      const di = path[k]![0]! - path[k - 1]![0]!
      const dj = path[k]![1]! - path[k - 1]![1]!
      expect(di).toBeGreaterThanOrEqual(0)
      expect(dj).toBeGreaterThanOrEqual(0)
      expect(di + dj).toBeGreaterThan(0)
      expect(di).toBeLessThanOrEqual(1)
      expect(dj).toBeLessThanOrEqual(1)
    }
  })

  it('approximates the exact distance within a small factor', () => {
    const mk = (n: number, f: number) =>
      seq(Array.from({ length: n }, (_, i) => Math.sin(i / f) + (i % 5) / 10))
    const a = mk(300, 9)
    const b = mk(260, 8)
    const exact = dtw(a.data, b.data, 1).distance
    const approx = fastDtw(a.data, b.data, 1, 1).distance
    expect(approx).toBeGreaterThanOrEqual(exact - 1e-6)
    expect(approx).toBeLessThanOrEqual(exact * 1.15 + 1e-6)
  })

  it('rejects empty or mismatched-dimension input', () => {
    expect(() => fastDtw(new Float32Array(0), new Float32Array(2), 2)).toThrow()
    expect(() => fastDtw(new Float32Array(3), new Float32Array(2), 2)).toThrow()
  })

  it('30 s clips (1500 frames x 768) stay within the performance budget', () => {
    const n = 1500
    const dim = 768
    const make = (seed: number) => {
      const d = new Float32Array(n * dim)
      for (let i = 0; i < n; i++)
        for (let k = 0; k < dim; k++) d[i * dim + k] = Math.sin(i / 20 + k * 0.01 + seed)
      return d
    }
    const start = performance.now()
    const r = fastDtw(make(0), make(0.3), dim, 1)
    const ms = performance.now() - start
    expect(r.path.length).toBeGreaterThanOrEqual(n)
    expect(ms).toBeLessThan(2000)
  })
})

describe('alignByPath', () => {
  it('returns both series expanded along the path', () => {
    expect(
      alignByPath(
        [1, 2, 3],
        [10, 20],
        [
          [0, 0],
          [1, 0],
          [2, 1],
        ],
      ),
    ).toEqual({ a: [1, 2, 3], b: [10, 10, 20] })
  })
})
