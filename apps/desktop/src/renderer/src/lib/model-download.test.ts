import { describe, expect, it } from 'vitest'
import { aggregateProgress, modelCard, spaceProblem } from './model-download'

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

describe('modelCard', () => {
  const m = (a: string, b: string) => [
    { id: 'a', sizeBytes: 600, state: a as 'ready' },
    { id: 'b', sizeBytes: 400, state: b as 'ready' },
  ]

  it('is ready when every model is installed', () => {
    expect(modelCard(m('ready', 'ready'), {}).status).toBe('ready')
  })

  it('is missing when a model is not installed, with the size still to fetch', () => {
    const c = modelCard(m('ready', 'not-installed'), {})
    expect(c.status).toBe('missing')
    expect(c.aggregate.totalBytes).toBe(400)
  })

  it('is downloading with live percent over the downloading models', () => {
    const c = modelCard(m('downloading', 'not-installed'), {
      a: { id: 'a', phase: 'downloading', receivedBytes: 300, totalBytes: 600 },
    })
    expect(c.status).toBe('downloading')
    expect(c.aggregate.percent).toBe(50)
  })
})
