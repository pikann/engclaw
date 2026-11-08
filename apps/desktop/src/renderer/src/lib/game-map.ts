/** Pure geometry and state for the level map; one world is laid out at a time, bottom to top. */
import type { GameProgressEntry } from '@engclaw/ipc-contract'
import type { NodeState } from './game'

export const NODE = 56
export const ROW_H = 132
export const PAD_X = 72
export const TOP_PAD = 64
export const BOTTOM_PAD = 96
const WAVE = 12

export interface MapLayout {
  count: number
  perRow: number
  width: number
  height: number
  pitch: number
  minX: number
  maxX: number
}

export function layoutWorld(count: number, perRow: number, width: number): MapLayout {
  const cols = Math.max(2, perRow)
  const pitch = Math.max(80, Math.min(160, (width - PAD_X * 2) / (cols - 1)))
  const span = (cols - 1) * pitch
  const minX = (width - span) / 2
  const rows = Math.max(1, Math.ceil(count / cols))
  return {
    count,
    perRow: cols,
    width,
    height: TOP_PAD + rows * ROW_H + BOTTOM_PAD,
    pitch,
    minX,
    maxX: minX + span,
  }
}

export const rowOf = (l: MapLayout, index: number): number => Math.floor(index / l.perRow)

export function nodePos(l: MapLayout, index: number): { x: number; y: number } {
  const row = rowOf(l, index)
  const k = index % l.perRow
  const col = row % 2 === 0 ? k : l.perRow - 1 - k
  const baseY = l.height - BOTTOM_PAD - row * ROW_H - ROW_H / 2
  return { x: l.minX + col * l.pitch, y: baseY + (k % 2 === 0 ? WAVE : -WAVE) }
}

/** The road piece that arrives at node `index` from the node before it. */
export function segmentTo(l: MapLayout, index: number): string {
  const a = nodePos(l, index - 1)
  const b = nodePos(l, index)
  if (rowOf(l, index) === rowOf(l, index - 1)) {
    const mx = (a.x + b.x) / 2
    return `C ${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`
  }
  const edge = rowOf(l, index - 1) % 2 === 0 ? l.maxX + PAD_X * 0.7 : l.minX - PAD_X * 0.7
  return `C ${edge} ${a.y} ${edge} ${b.y} ${b.x} ${b.y}`
}

/** Road through nodes `from..to` (inclusive, zero-based); empty when the range is empty. */
export function roadPath(l: MapLayout, from: number, to: number): string {
  if (to < from || from < 0 || to >= l.count) return ''
  const start = nodePos(l, from)
  let d = `M ${start.x} ${start.y}`
  for (let i = from + 1; i <= to; i++) d += ` ${segmentTo(l, i)}`
  return d
}

/** Zero-based node indices that intersect the viewport, widened by `overscanRows` on each side. */
export function visibleRange(
  l: MapLayout,
  scrollTop: number,
  viewport: number,
  overscanRows = 1,
): { from: number; to: number } {
  if (l.count === 0) return { from: 0, to: -1 }
  const rows = Math.ceil(l.count / l.perRow)
  const lastRowAtTop = Math.floor((l.height - BOTTOM_PAD - scrollTop) / ROW_H)
  const firstRowAtBottom = Math.floor((l.height - BOTTOM_PAD - (scrollTop + viewport)) / ROW_H)
  const lo = Math.max(0, firstRowAtBottom - overscanRows)
  const hi = Math.min(rows - 1, lastRowAtTop + overscanRows)
  return {
    from: Math.min(l.count - 1, lo * l.perRow),
    to: Math.min(l.count - 1, (hi + 1) * l.perRow - 1),
  }
}

/** Scroll offset that puts node `index` at `anchor` (0 top .. 1 bottom) of the viewport. */
export function scrollTopFor(l: MapLayout, index: number, viewport: number, anchor = 0.5): number {
  const y = nodePos(l, index).y
  return Math.max(0, Math.min(l.height - viewport, y - viewport * anchor))
}

/** Road position (in rows from the bottom) at the centre of the viewport; stable across relayouts. */
export const centerRowAt = (l: MapLayout, scrollTop: number, viewport: number): number =>
  (l.height - BOTTOM_PAD - (scrollTop + viewport / 2)) / ROW_H

export function scrollTopForCenterRow(l: MapLayout, row: number, viewport: number): number {
  const top = l.height - BOTTOM_PAD - row * ROW_H - viewport / 2
  return Math.max(0, Math.min(Math.max(0, l.height - viewport), top))
}

export function nodeStateOf(order: number, passed: ReadonlyMap<number, unknown>): NodeState {
  if (passed.has(order)) return 'passed'
  return order === 1 || passed.has(order - 1) ? 'current' : 'locked'
}

/** First chapter that is not passed yet, or null when every chapter is. */
export function nextUnplayed(passed: ReadonlyMap<number, unknown>, total: number): number | null {
  for (let order = 1; order <= total; order++) if (!passed.has(order)) return order
  return null
}

export const progressMap = (
  entries: readonly GameProgressEntry[],
): Map<number, GameProgressEntry> => new Map(entries.map((e) => [e.order, e]))

export function worldOfOrder(
  order: number,
  worlds: readonly { world: number; first: number; count: number }[],
): number | null {
  return worlds.find((w) => order >= w.first && order < w.first + w.count)?.world ?? null
}

export function worldTally(
  w: { first: number; count: number },
  passed: ReadonlyMap<number, GameProgressEntry>,
): { passed: number; stars: number } {
  let n = 0
  let stars = 0
  for (let o = w.first; o < w.first + w.count; o++) {
    const e = passed.get(o)
    if (e) {
      n++
      stars += e.stars
    }
  }
  return { passed: n, stars }
}

export const MAP_MEMORY_KEY = 'engclaw.game.map'

export interface MapMemory {
  world: number
  /** Per world: the road position (rows from the bottom) at the centre of the viewport. */
  rows: Record<string, number>
}

export function readMemory(raw: string | null): MapMemory | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<MapMemory>
    if (!v || typeof v.world !== 'number' || !Number.isInteger(v.world) || v.world < 1) return null
    const rows: Record<string, number> = {}
    for (const [k, n] of Object.entries(v.rows ?? {}))
      if (typeof n === 'number' && Number.isFinite(n) && n >= 0) rows[k] = n
    return { world: v.world, rows }
  } catch {
    return null
  }
}
