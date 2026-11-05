import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Flag, List, Lock, Map as MapIcon, Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AppShell, Pane, layoutOf, type Layout } from '@/components/screens/shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProgressSummary, StarRating } from '@/components/ui/game'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { MAX_STARS, clampStars, nodeStates, progressOf, type NodeState } from '@/lib/game'
import { cn } from '@/lib/utils'

export type TargetType = 'word' | 'phrase' | 'idiom'

export interface Chapter {
  index: number
  target: string
  type: TargetType
  ipa: string
  stars: number | null
  state: NodeState
  world: number
  attempts: number
}

const TARGETS: [string, TargetType, string][] = [
  ['hello', 'word', 'həˈloʊ'],
  ['thanks', 'word', 'θæŋks'],
  ['water', 'word', 'ˈwɔːtər'],
  ['coffee', 'word', 'ˈkɔːfi'],
  ['look forward to', 'phrase', 'lʊk ˈfɔːrwərd tuː'],
  ['school', 'word', 'skuːl'],
  ['break a leg', 'idiom', 'breɪk ə lɛɡ'],
  ['family', 'word', 'ˈfæməli'],
  ['weather', 'word', 'ˈwɛðər'],
  ['in a hurry', 'phrase', 'ɪn ə ˈhɜːri'],
  ['thoroughly', 'word', 'ˈθʌrəli'],
  ['rhythm', 'word', 'ˈrɪðəm'],
  ['piece of cake', 'idiom', 'piːs əv keɪk'],
  ['comfortable', 'word', 'ˈkʌmftərbəl'],
  ['get used to', 'phrase', 'ɡɛt juːst tuː'],
  ['once in a blue moon', 'idiom', 'wʌns ɪn ə bluː muːn'],
]

/** World boundaries: chapters per world (the last world is the one in progress or locked). */
const WORLD_NAMES = ['First words', 'Everyday words', 'Fluent phrases']

export type MapVariant = 'first' | 'mid' | 'many' | 'jump' | 'list' | 'finished' | 'none'

/** Builds `count` chapters from the stars earned so far; later chapters are locked. */
export function buildChapters(
  count: number,
  stars: (number | null)[],
  perWorld: number,
): Chapter[] {
  const all = Array.from({ length: count }, (_, i) => (stars[i] ?? null) as number | null)
  const states = nodeStates(all)
  return all.map((s, i) => {
    const [target, type, ipa] = TARGETS[i % TARGETS.length]!
    return {
      index: i + 1,
      target,
      type,
      ipa,
      stars: s,
      state: states[i]!,
      world: Math.floor(i / perWorld),
      attempts: s ? 5 + (i % 4) : 0,
    }
  })
}

const MID_STARS = [3, 2, 3, 3, 2, 1, 3, 2, 3, 3, 2]
const MANY_STARS = [3, 2, 3, 3, 2, 1, 3, 2, 3, 3, 2, 3, 3, 1]

export function chaptersFor(variant: MapVariant): Chapter[] {
  if (variant === 'first') return buildChapters(10, [], 10)
  if (variant === 'finished')
    return buildChapters(
      12,
      Array(12)
        .fill(3)
        .map((n, i) => (i % 3 === 1 ? 2 : n)),
      12,
    )
  if (variant === 'many') return buildChapters(30, MANY_STARS, 10)
  return buildChapters(18, MID_STARS, 10)
}

const PER_ROW: Record<Layout, number> = { wide: 6, standard: 5, compact: 3 }

/** Road geometry, in px. Nodes sit on the road; labels hang under them. */
const NODE = 64
const ROW_H = 168
const BAND_H = 72
const PAD_X = 84
const TOP_PAD = 56
const ROAD_W = 30

interface Pos {
  c: Chapter
  x: number
  y: number
}

/** Places chapters on the zig-zag: rows alternate direction, every world starts a new row. */
function placeNodes(chapters: Chapter[], perRow: number, width: number) {
  const pitch = Math.max(88, Math.min(176, (width - PAD_X * 2) / Math.max(1, perRow - 1)))
  const worlds = [...new Set(chapters.map((c) => c.world))]
  const bands: { world: number; y: number }[] = []
  const rowsOut: { y: number; ltr: boolean; items: Chapter[] }[] = []
  let cursor = 0
  let rowNo = 0
  for (const w of worlds) {
    bands.push({ world: w, y: cursor + BAND_H / 2 })
    cursor += BAND_H
    const inWorld = chapters.filter((c) => c.world === w)
    for (let i = 0; i < inWorld.length; i += perRow) {
      rowsOut.push({
        y: cursor + ROW_H / 2,
        ltr: rowNo % 2 === 0,
        items: inWorld.slice(i, i + perRow),
      })
      cursor += ROW_H
      rowNo += 1
    }
  }
  const height = cursor + TOP_PAD
  const span = (perRow - 1) * pitch
  const minX = (width - span) / 2
  const maxX = minX + span
  const top = (yUp: number) => height - yUp
  const pos: Pos[] = []
  const rowOf = new Map<number, { ltr: boolean; last: boolean }>()
  rowsOut.forEach((r, ri) => {
    r.items.forEach((c, i) => {
      const col = r.ltr ? i : perRow - 1 - i
      // A gentle wave keeps the road from running dead straight.
      const wave = (i % 2 === 0 ? 1 : -1) * 14
      pos.push({ c, x: minX + col * pitch, y: top(r.y) + wave })
      rowOf.set(c.index, { ltr: r.ltr, last: i === r.items.length - 1 && ri < rowsOut.length })
    })
  })
  return { pos, rowOf, height, bands: bands.map((b) => ({ ...b, y: top(b.y) })), pitch, minX, maxX }
}

/** Smooth path through the given nodes: S-curves along a row, rounded U-turns where a row ends. */
function roadPath(
  points: Pos[],
  rowOf: Map<number, { ltr: boolean }>,
  minX: number,
  maxX: number,
): string {
  if (!points.length) return ''
  let d = `M ${points[0]!.x} ${points[0]!.y}`
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    if (Math.abs(a.y - b.y) < ROW_H / 2) {
      const mx = (a.x + b.x) / 2
      d += ` C ${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`
    } else {
      // Loop out to the side the lower row was heading to, even when that row is only part full.
      const edge = rowOf.get(a.c.index)?.ltr ? maxX + PAD_X * 0.8 : minX - PAD_X * 0.8
      d += ` C ${edge} ${a.y} ${edge} ${b.y} ${b.x} ${b.y}`
    }
  }
  return d
}

function RoadNode({
  p,
  selected,
  labelW,
  currentRef,
}: {
  p: Pos
  selected: boolean
  labelW: number
  currentRef: React.RefObject<HTMLDivElement | null>
}) {
  const { t } = useTranslation()
  const { c } = p
  const Icon = c.state === 'locked' ? Lock : c.state === 'current' ? Play : Check
  return (
    <div
      ref={c.state === 'current' ? currentRef : undefined}
      className="absolute flex flex-col items-center"
      style={{ left: p.x - labelW / 2, top: p.y - NODE / 2, width: labelW }}
    >
      {c.state === 'current' && (
        <Badge className="absolute -top-8 z-10 whitespace-nowrap" data-testid="you-are-here">
          {t('screens.game.youAreHere')}
        </Badge>
      )}
      <button
        type="button"
        disabled={c.state === 'locked'}
        data-state={c.state}
        aria-label={t(`ds.game.node.${c.state}`, {
          index: c.index,
          title: c.target,
          count: clampStars(c.stars ?? 0),
          max: MAX_STARS,
        })}
        className={cn(
          'relative flex shrink-0 items-center justify-center rounded-full border-4 transition-colors',
          c.state === 'passed' && 'border-success bg-success-soft text-success-soft-foreground',
          c.state === 'current' &&
            'border-primary bg-card text-primary shadow-md motion-safe:animate-pulse-soft',
          c.state === 'locked' && 'border-node-locked bg-muted text-muted-foreground border-dashed',
          selected && 'ring-ring ring-2 ring-offset-2',
        )}
        style={{ width: NODE, height: NODE }}
      >
        <Icon aria-hidden="true" className="size-6" />
        <span
          aria-hidden="true"
          className="bg-background text-foreground absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full border text-xs font-semibold tabular-nums"
        >
          {c.index}
        </span>
      </button>
      <span
        aria-hidden="true"
        className={cn(
          'mt-2 line-clamp-2 text-center text-xs leading-tight font-medium',
          c.state === 'locked' && 'text-muted-foreground',
        )}
      >
        {c.target}
      </span>
      {c.state !== 'locked' && <StarRating stars={c.stars ?? 0} size="sm" className="mt-1" />}
    </div>
  )
}

/** The winding road, drawn bottom to top; the DOM stays in chapter order (1 → N). */
function RoadMap({
  chapters,
  layout,
  selected,
  finished,
  coach,
  bottomInset,
}: {
  chapters: Chapter[]
  layout: Layout
  selected: number | null
  finished: boolean
  coach: boolean
  /** Room under the road for the Compact bottom sheet. */
  bottomInset: boolean
}) {
  const { t } = useTranslation()
  const box = useRef<HTMLDivElement>(null)
  const current = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(layout === 'compact' ? 640 : 900)
  useEffect(() => {
    const b = box.current
    if (!b) return
    const ro = new ResizeObserver(() => setWidth(Math.max(320, b.clientWidth - 48)))
    ro.observe(b)
    setWidth(Math.max(320, b.clientWidth - 48))
    return () => ro.disconnect()
  }, [])
  const perRow = PER_ROW[layout]
  const geo = useMemo(() => placeNodes(chapters, perRow, width), [chapters, perRow, width])
  const curIdx = Math.max(
    0,
    chapters.findIndex((c) => c.state === 'current'),
  )
  const hasCurrent = chapters.some((c) => c.state === 'current')
  const walkedUpTo = hasCurrent ? curIdx : chapters.length - 1
  const full = roadPath(geo.pos, geo.rowOf, geo.minX, geo.maxX)
  const walked = roadPath(geo.pos.slice(0, walkedUpTo + 1), geo.rowOf, geo.minX, geo.maxX)
  const last = geo.pos[geo.pos.length - 1]

  // Open with the current chapter about one third from the bottom (IA doc §9.2).
  useEffect(() => {
    const b = box.current
    if (!b) return
    const node = current.current
    if (!node) {
      b.scrollTop = b.scrollHeight
      return
    }
    const top = node.getBoundingClientRect().top - b.getBoundingClientRect().top + b.scrollTop
    b.scrollTop = Math.max(0, top - b.clientHeight * (bottomInset ? 0.5 : 2 / 3))
  }, [chapters, layout, geo.height, bottomInset])

  const labelW = Math.min(132, geo.pitch - 8)
  return (
    <div
      ref={box}
      className={cn('relative h-full overflow-auto p-6', bottomInset && 'pb-28')}
      data-testid="road-map"
    >
      {coach && (
        <p
          role="note"
          className="bg-info-soft text-info-soft-foreground mb-4 flex items-center justify-between gap-3 rounded-lg px-4 py-2 text-sm"
          data-testid="coach-mark"
        >
          {t('screens.game.coach')}
          <Button size="xs" variant="outline">
            {t('screens.game.gotIt')}
          </Button>
        </p>
      )}
      {finished && (
        <p
          className="text-success-soft-foreground bg-success-soft mb-4 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
          data-testid="finish-banner"
        >
          <Flag aria-hidden="true" className="size-4" />
          {t('screens.game.finishedBanner')}
        </p>
      )}
      <div className="relative mx-auto" style={{ width, height: geo.height }}>
        <svg
          aria-hidden="true"
          width={width}
          height={geo.height}
          className="absolute inset-0"
          data-testid="road-svg"
        >
          {/* Road ahead: pale surface and dashed centre line. */}
          <path
            d={full}
            fill="none"
            className="stroke-muted"
            strokeWidth={ROAD_W}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={full}
            fill="none"
            className="stroke-node-locked"
            strokeWidth={2}
            strokeDasharray="2 10"
            strokeLinecap="round"
          />
          {/* Road already walked: solid green surface with a solid centre line. */}
          {walkedUpTo > 0 && (
            <>
              <path
                d={walked}
                fill="none"
                className="stroke-success-soft"
                strokeWidth={ROAD_W}
                strokeLinecap="round"
                strokeLinejoin="round"
                data-testid="road-walked"
              />
              <path
                d={walked}
                fill="none"
                className="stroke-success"
                strokeWidth={2}
                strokeDasharray="2 10"
                strokeLinecap="round"
              />
            </>
          )}
        </svg>
        {geo.bands.map((b) => (
          <div
            key={b.world}
            className="absolute inset-x-0 flex -translate-y-1/2 justify-center"
            style={{ top: b.y }}
          >
            <div className="bg-card max-w-[60%] rounded-full border px-4 py-1.5 text-center shadow-sm">
              <p className="text-sm font-semibold">
                {t('screens.game.world', {
                  n: b.world + 1,
                  name: WORLD_NAMES[b.world] ?? WORLD_NAMES[0],
                })}
              </p>
              <p className="text-muted-foreground text-xs">
                {t('screens.game.worldPassed', {
                  passed: chapters.filter((c) => c.world === b.world && c.state === 'passed')
                    .length,
                  total: chapters.filter((c) => c.world === b.world).length,
                })}
              </p>
            </div>
          </div>
        ))}
        {geo.pos.map((p) => (
          <RoadNode
            key={p.c.index}
            p={p}
            selected={selected === p.c.index}
            labelW={labelW}
            currentRef={current}
          />
        ))}
        {finished && last && (
          <span
            className="bg-success text-success-foreground absolute flex size-10 items-center justify-center rounded-full shadow-md"
            style={{ left: last.x - 20, top: last.y - NODE - 28 }}
            data-testid="finish-marker"
          >
            <Flag aria-hidden="true" className="size-5" />
            <span className="sr-only">{t('screens.game.finishedBanner')}</span>
          </span>
        )}
      </div>
    </div>
  )
}

/** The preview docked next to the map (or anchored over it when Compact). */
export function ChapterPreview({
  chapter,
  inline = false,
}: {
  chapter: Chapter | null
  /** One slim row, for the Compact bottom sheet that sits over the map. */
  inline?: boolean
}) {
  const { t } = useTranslation()
  if (!chapter)
    return (
      <p
        className="text-muted-foreground flex h-full min-h-32 items-center justify-center text-center text-sm"
        data-testid="preview-empty"
      >
        {t('screens.game.selectChapter')}
      </p>
    )
  const passed = chapter.state === 'passed'
  if (inline)
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="chapter-preview">
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t('screens.game.chapterTitle', {
              n: chapter.index,
              type: t(`screens.game.type.${chapter.type}`),
            })}
          </p>
          <p className="truncate text-lg font-semibold">
            {chapter.target}{' '}
            <span className="text-muted-foreground text-sm font-normal" lang="en-fonipa">
              /{chapter.ipa}/
            </span>
          </p>
        </div>
        {chapter.stars ? <StarRating stars={chapter.stars} size="sm" /> : null}
        {chapter.state === 'locked' ? (
          <p className="text-muted-foreground text-sm">
            {t('screens.game.passFirst', { n: chapter.index - 1 })}
          </p>
        ) : (
          <Button size="sm">
            <Play />
            {t(passed ? 'screens.game.replay' : 'screens.game.play')}
          </Button>
        )}
      </div>
    )
  return (
    <div className="space-y-4" data-testid="chapter-preview">
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {t('screens.game.chapterTitle', {
            n: chapter.index,
            type: t(`screens.game.type.${chapter.type}`),
          })}
        </p>
        <p className="text-2xl font-semibold wrap-break-word">{chapter.target}</p>
        <p className="text-muted-foreground" lang="en-fonipa">
          /{chapter.ipa}/
        </p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t('screens.game.best')}</dt>
        <dd>{chapter.stars ? <StarRating stars={chapter.stars} size="sm" /> : '—'}</dd>
        <dt className="text-muted-foreground">{t('screens.game.attempts')}</dt>
        <dd className="tabular-nums">{chapter.attempts}</dd>
      </dl>
      <p className="text-muted-foreground text-sm">
        {t('screens.game.examplesCount', { count: 2 })}
      </p>
      {chapter.state === 'locked' ? (
        <p className="text-muted-foreground text-sm">
          {t('screens.game.passFirst', { n: chapter.index - 1 })}
        </p>
      ) : (
        <div className="space-y-2">
          <Button>
            <Play />
            {t(passed ? 'screens.game.replay' : 'screens.game.play')}
          </Button>
          {passed && <p className="text-muted-foreground text-xs">{t('screens.game.bestKept')}</p>}
        </div>
      )}
    </div>
  )
}

function ListView({ chapters, selected }: { chapters: Chapter[]; selected: number | null }) {
  const { t } = useTranslation()
  return (
    <div
      className="h-full overflow-auto p-4"
      tabIndex={0}
      role="region"
      aria-label={t('screens.game.listCaption')}
    >
      <table className="w-full text-sm" data-testid="chapter-list">
        <caption className="sr-only">{t('screens.game.listCaption')}</caption>
        <thead>
          <tr className="text-muted-foreground text-left text-xs">
            {(['num', 'target', 'kind', 'world', 'stars', 'status'] as const).map((k) => (
              <th key={k} scope="col" className="pb-2 font-medium">
                {t(`screens.game.col.${k}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chapters.map((c) => (
            <tr
              key={c.index}
              aria-selected={selected === c.index}
              className={cn('border-t', selected === c.index && 'bg-primary-soft')}
            >
              <td className="py-1.5 tabular-nums">{c.index}</td>
              <td>{c.target}</td>
              <td>{t(`screens.game.type.${c.type}`)}</td>
              <td>{c.world + 1}</td>
              <td>{c.stars ? <StarRating stars={c.stars} size="sm" /> : '—'}</td>
              <td>{t(`screens.game.status.${c.state}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function JumpMenu({ chapters }: { chapters: Chapter[] }) {
  const { t } = useTranslation()
  const worlds = [...new Set(chapters.map((c) => c.world))]
  return (
    <div
      role="menu"
      aria-label={t('screens.game.jump')}
      className="bg-popover absolute top-14 right-4 z-20 w-64 rounded-lg border p-1 shadow-lg"
      data-testid="jump-menu"
    >
      {worlds.map((w) => {
        const inWorld = chapters.filter((c) => c.world === w)
        return (
          <div
            key={w}
            role="menuitem"
            className="flex items-center justify-between rounded-md px-3 py-2 text-sm"
          >
            <span>
              {t('screens.game.world', { n: w + 1, name: WORLD_NAMES[w] ?? WORLD_NAMES[0] })}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {inWorld.filter((c) => c.state === 'passed').length}/{inWorld.length}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Level map (IA doc §9.2): the road and the docked preview, or the list alternative. */
export function LevelMapScreen({ width, variant }: { width: number; variant: MapVariant }) {
  const { t } = useTranslation()
  const layout = layoutOf(width)
  const chapters = chaptersFor(variant)
  const prog = progressOf(chapters.map((c) => c.stars))
  const passed = chapters.filter((c) => c.state === 'passed').length
  const current = chapters.find((c) => c.state === 'current') ?? chapters[chapters.length - 1]!
  const selected = variant === 'none' ? null : current.index
  const picked = selected ? (chapters.find((c) => c.index === selected) ?? null) : null
  const list = variant === 'list'
  const compact = layout === 'compact'
  return (
    <div className="relative h-full">
      <AppShell
        layout={layout}
        active="game"
        title={t('screens.shell.game')}
        actions={
          <>
            <span className="text-muted-foreground text-sm tabular-nums" data-testid="game-stats">
              {t('screens.game.stats', { stars: prog.earned, passed })}
            </span>
            <Button size="sm" variant="outline" disabled={variant === 'finished'}>
              <Play />
              {t('screens.game.continue', { n: current.index })}
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-haspopup="menu"
              aria-expanded={variant === 'jump'}
            >
              {t('screens.game.jump')}
              <ChevronDown />
            </Button>
            <ToggleGroup
              type="single"
              value={list ? 'list' : 'map'}
              variant="outline"
              size="sm"
              aria-label={t('screens.game.view')}
            >
              <ToggleGroupItem value="map" aria-label={t('screens.game.viewMap')}>
                <MapIcon />
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label={t('screens.game.viewList')}>
                <List />
              </ToggleGroupItem>
            </ToggleGroup>
          </>
        }
      >
        <div
          className={cn(
            'grid h-full divide-x',
            compact
              ? 'grid-cols-1'
              : layout === 'wide'
                ? 'grid-cols-[1fr_340px]'
                : 'grid-cols-[1fr_300px]',
          )}
        >
          <div className="flex min-h-0 flex-col">
            <div className="shrink-0 px-6 pt-4">
              <ProgressSummary
                earned={prog.earned}
                total={prog.total}
                passed={passed}
                chapters={chapters.length}
              />
            </div>
            <div className="min-h-0 flex-1">
              {list ? (
                <ListView chapters={chapters} selected={selected} />
              ) : (
                <RoadMap
                  chapters={chapters}
                  layout={layout}
                  selected={selected}
                  finished={variant === 'finished'}
                  coach={variant === 'first'}
                  bottomInset={compact && !!picked}
                />
              )}
            </div>
          </div>
          {!compact && (
            <Pane title={t('screens.game.preview')}>
              <ChapterPreview chapter={picked} />
            </Pane>
          )}
        </div>
      </AppShell>
      {compact && picked && (
        <div
          className="bg-card absolute inset-x-4 bottom-10 z-10 rounded-xl border px-4 py-3 shadow-lg"
          data-testid="preview-sheet"
        >
          <ChapterPreview chapter={picked} inline />
        </div>
      )}
      {variant === 'jump' && <JumpMenu chapters={chapters} />}
    </div>
  )
}
