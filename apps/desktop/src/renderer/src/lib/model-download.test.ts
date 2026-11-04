import { describe, expect, it } from 'vitest'
import { aggregateProgress, spaceProblem } from './model-download'

const models = [
  { id: 'a', sizeBytes: 600 },
  { id: 'b', sizeBytes: 400 },
]

describe('aggregateProgress', () => {
  it('sums received bytes across models', () => {
    const r = aggregateProgress(models, {
      a: { id: 'a', phase: 'downloading', receivedBytes: 300, totalBytes: 600 },
      b: { id: 'b', phase: 'downloading', receivedBytes: 100, totalBytes: 400 },
    })
    expect(r).toEqual({ receivedBytes: 400, totalBytes: 1000, percent: 40 })
  })

  it('counts a ready model in full and an unstarted one as zero', () => {
    const r = aggregateProgress(models, {
      a: { id: 'a', phase: 'ready', receivedBytes: 0, totalBytes: 600 },
    })
    expect(r.percent).toBe(60)
  })

  it('is 0 with nothing to download', () => {
    expect(aggregateProgress([], {}).percent).toBe(0)
  })
})

describe('spaceProblem', () => {
  it('flags an unwritable folder first, then too little space', () => {
    expect(spaceProblem(100, { writable: false, freeBytes: 1e12 })).toBe('NOT_WRITABLE')
    expect(spaceProblem(100, { writable: true, freeBytes: 100 }, 50)).toBe('DISK_SPACE')
    expect(spaceProblem(100, { writable: true, freeBytes: 150 }, 50)).toBeNull()
    expect(spaceProblem(100, null)).toBeNull()
  })
})
