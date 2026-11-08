import { describe, expect, it } from 'vitest'
import {
  centerRowAt,
  layoutWorld,
  scrollTopForCenterRow,
  nextUnplayed,
  nodePos,
  nodeStateOf,
  progressMap,
  readMemory,
  roadPath,
  scrollTopFor,
  visibleRange,
  worldOfOrder,
  worldTally,
} from './game-map'

const entry = (order: number, stars: 1 | 2 | 3 = 1) => ({
  order,
  stars,
  avgScore: 80,
  bestScore: 90,
  attempts: 5,
  firstPassedAt: 1,
  lastPassedAt: 1,
})

describe('layout', () => {
  const l = layoutWorld(75, 5, 900)

  it('puts chapter 1 at the bottom and zig-zags the rows', () => {
    const first = nodePos(l, 0)
    const sixth = nodePos(l, 5)
    expect(first.y).toBeGreaterThan(sixth.y)
    expect(nodePos(l, 4).x).toBeGreaterThan(nodePos(l, 0).x)
    expect(sixth.x).toBeCloseTo(nodePos(l, 4).x)
  })

  it('keeps every node inside the canvas', () => {
    for (let i = 0; i < l.count; i++) {
      const p = nodePos(l, i)
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(l.width)
      expect(p.y).toBeGreaterThan(0)
      expect(p.y).toBeLessThan(l.height)
    }
  })

  it('draws a road through a range and nothing for an empty one', () => {
    expect(roadPath(l, 0, 0)).toMatch(/^M /)
    expect(roadPath(l, 0, 3).match(/C /g)).toHaveLength(3)
    expect(roadPath(l, 3, 2)).toBe('')
  })
})

describe('visibleRange', () => {
  const l = layoutWorld(75, 5, 900)

  it('shows only the bottom rows when scrolled to the start of the road', () => {
    const r = visibleRange(l, l.height - 600, 600, 0)
    expect(r.from).toBe(0)
    expect(r.to).toBeLessThan(30)
  })

  it('shows only the top rows at scroll 0', () => {
    const r = visibleRange(l, 0, 600)
    expect(r.to).toBe(74)
    expect(r.from).toBeGreaterThan(40)
  })

  it('renders a small, bounded window for the whole catalog scale', () => {
    const big = layoutWorld(75, 5, 900)
    const r = visibleRange(big, 1000, 700)
    expect(r.to - r.from + 1).toBeLessThanOrEqual(40)
  })

  it('is empty for an empty world', () => {
    expect(visibleRange(layoutWorld(0, 5, 900), 0, 600)).toEqual({ from: 0, to: -1 })
  })

  it('scrolls a node into the middle, clamped to the canvas', () => {
    expect(scrollTopFor(l, 0, 600)).toBe(l.height - 600)
    expect(scrollTopFor(l, 74, 600)).toBeGreaterThanOrEqual(0)
  })
})

describe('relayout', () => {
  it('keeps the same road position at the centre when the width changes', () => {
    const narrow = layoutWorld(75, 3, 480)
    const wide = layoutWorld(75, 5, 900)
    const top = scrollTopFor(narrow, 20, 500, 0.5)
    const row = centerRowAt(narrow, top, 500)
    const moved = scrollTopForCenterRow(wide, row, 500)
    expect(centerRowAt(wide, moved, 500)).toBeCloseTo(row)
  })
})

describe('node state', () => {
  const passed = progressMap([entry(1), entry(2)])
  it('derives passed / current / locked from the passed set', () => {
    expect(nodeStateOf(1, passed)).toBe('passed')
    expect(nodeStateOf(3, passed)).toBe('current')
    expect(nodeStateOf(4, passed)).toBe('locked')
    expect(nodeStateOf(1, new Map())).toBe('current')
  })

  it('finds the next unplayed chapter, or none when finished', () => {
    expect(nextUnplayed(passed, 10)).toBe(3)
    expect(nextUnplayed(new Map(), 10)).toBe(1)
    expect(nextUnplayed(progressMap([entry(1), entry(2)]), 2)).toBeNull()
  })
})

describe('worlds', () => {
  const worlds = [
    { world: 1, first: 1, count: 75 },
    { world: 2, first: 76, count: 75 },
  ]
  it('maps an order to its world', () => {
    expect(worldOfOrder(75, worlds)).toBe(1)
    expect(worldOfOrder(76, worlds)).toBe(2)
    expect(worldOfOrder(999, worlds)).toBeNull()
  })
  it('tallies passed chapters and stars per world', () => {
    const p = progressMap([entry(1, 3), entry(2, 2), entry(76, 1)])
    expect(worldTally(worlds[0]!, p)).toEqual({ passed: 2, stars: 5 })
    expect(worldTally(worlds[1]!, p)).toEqual({ passed: 1, stars: 1 })
  })
})

describe('readMemory', () => {
  it('restores a valid record and drops junk', () => {
    expect(readMemory('{"world":3,"rows":{"3":4.5,"x":-1}}')).toEqual({
      world: 3,
      rows: { '3': 4.5 },
    })
    expect(readMemory(null)).toBeNull()
    expect(readMemory('not json')).toBeNull()
    expect(readMemory('{"world":0}')).toBeNull()
  })
})
