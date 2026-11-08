import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ChevronDown, ChevronUp, List, Map as MapIcon, Play } from 'lucide-react'
import type { GameChapter, GameMap, GameProgressEntry, GameWorld } from '@engclaw/ipc-contract'
import { ExamplesPanel, TargetAudioActions } from '@/components/game-learning-aids'
import { Button } from '@/components/ui/button'
import { ClickableText } from '@/components/ui/clickable-text'
import { ProgressSummary, StarRating } from '@/components/ui/game'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { MAX_STARS, clampStars, type NodeState } from '@/lib/game'
import {
  MAP_MEMORY_KEY,
  NODE,
  layoutWorld,
  nextUnplayed,
  nodePos,
  nodeStateOf,
  progressMap,
  readMemory,
  roadPath,
  scrollTopFor,
  scrollTopForCenterRow,
  centerRowAt,
  visibleRange,
  worldOfOrder,
  worldTally,
  type MapLayout,
} from '@/lib/game-map'
import { cn } from '@/lib/utils'

type WorldChapter = GameWorld['chapters'][number]
type View = 'map' | 'list'

const perRowFor = (width: number): number =>
  Math.max(3, Math.min(7, Math.floor((width - 144) / 110) + 1))

const STATE_CLASS: Record<NodeState, string> = {
  passed: 'border-success bg-success-soft text-success-soft-foreground',
  current: 'border-primary bg-card text-primary shadow-md',
  locked: 'border-node-locked bg-muted text-muted-foreground border-dashed',
}

/** One plain button per chapter: the whole map stays cheap because nodes carry no nested components. */
const MapNode = memo(function MapNode({
  chapter,
  x,
  y,
  labelW,
  state,
  stars,
  selected,
  focusable,
  label,
  onSelect,
  onKey,
}: {
  chapter: WorldChapter
  x: number
  y: number
  labelW: number
  state: NodeState
  stars: number
  selected: boolean
  focusable: boolean
  label: string
  onSelect: (order: number) => void
  onKey: (e: React.KeyboardEvent, order: number) => void
}) {
  return (
    <div
      className="absolute flex flex-col items-center"
      style={{ left: x - labelW / 2, top: y - NODE / 2, width: labelW }}
    >
      <button
        type="button"
        id={`game-node-${chapter.order}`}
        data-testid={`game-node-${chapter.order}`}
        data-state={state}
        aria-label={label}
        aria-disabled={state === 'locked' || undefined}
        aria-current={selected || undefined}
        tabIndex={focusable ? 0 : -1}
        onClick={() => onSelect(chapter.order)}
        onKeyDown={(e) => onKey(e, chapter.order)}
        className={cn(
          'focus-visible:ring-ring flex shrink-0 items-center justify-center rounded-full border-4 text-base font-semibold tabular-nums focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
          STATE_CLASS[state],
          selected && 'ring-ring ring-2 ring-offset-2',
        )}
        style={{ width: NODE, height: NODE }}
      >
        {chapter.order}
      </button>
      <span
        aria-hidden="true"
        className={cn(
          'mt-1.5 line-clamp-2 text-center text-xs leading-tight font-medium',
          state === 'locked' && 'text-muted-foreground',
        )}
      >
        {chapter.text}
      </span>
      {state !== 'locked' && (
        <span aria-hidden="true" className="text-star-stroke text-xs tracking-widest">
          {'★'.repeat(stars)}
          <span className="text-star-empty">{'★'.repeat(MAX_STARS - stars)}</span>
        </span>
      )}
    </div>
  )
})

function RoadMap({
  chapters,
  first,
  progress,
  selected,
  initialRow,
  anchorOrder,
  onSelect,
  onScrolled,
  prevWorld,
  nextWorld,
  onGoWorld,
}: {
  chapters: WorldChapter[]
  first: number
  progress: ReadonlyMap<number, GameProgressEntry>
  selected: number | null
  initialRow: number | null
  anchorOrder: number
  onSelect: (order: number) => void
  onScrolled: (row: number) => void
  prevWorld: number | null
  nextWorld: number | null
  onGoWorld: (world: number) => void
}) {
  const { t } = useTranslation()
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [range, setRange] = useState({ from: 0, to: -1 })
  const focusAfter = useRef<number | null>(null)
  const layout: MapLayout = useMemo(
    () => layoutWorld(chapters.length, perRowFor(size?.width ?? 720), size?.width ?? 720),
    [chapters.length, size?.width],
  )
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const centerRow = useRef(0)
  const heightRef = useRef(0)
  heightRef.current = size?.height ?? 0

  const syncRange = useCallback((scrollTop: number) => {
    const next = visibleRange(layoutRef.current, scrollTop, heightRef.current)
    setRange((r) => (r.from === next.from && r.to === next.to ? r : next))
  }, [])

  useLayoutEffect(() => {
    const b = box.current
    if (!b) return
    const measure = (): void =>
      setSize({ width: Math.max(320, b.clientWidth - 32), height: b.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(b)
    return () => ro.disconnect()
  }, [])

  const measured = size !== null
  useLayoutEffect(() => {
    const b = box.current
    if (!b || !measured) return
    const l = layoutRef.current
    const index = Math.max(0, Math.min(l.count - 1, anchorOrder - first))
    b.scrollTop =
      initialRow === null
        ? scrollTopFor(l, index, b.clientHeight, 0.66)
        : scrollTopForCenterRow(l, initialRow, b.clientHeight)
    centerRow.current = centerRowAt(l, b.scrollTop, b.clientHeight)
    syncRange(b.scrollTop)
    // Re-anchor only when the world, the requested chapter or the first measurement changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first, anchorOrder, chapters, measured])
  useLayoutEffect(() => {
    const b = box.current
    if (!b || !measured) return
    b.scrollTop = scrollTopForCenterRow(layout, centerRow.current, b.clientHeight)
    syncRange(b.scrollTop)
  }, [layout, size?.height, measured, syncRange])

  const frame = useRef(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const onScroll = (): void => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const b = box.current
      if (!b) return
      centerRow.current = centerRowAt(layoutRef.current, b.scrollTop, b.clientHeight)
      syncRange(b.scrollTop)
    })
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => onScrolled(centerRow.current), 200)
  }
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current)
      clearTimeout(saveTimer.current)
    },
    [],
  )

  const selectedIndex = selected !== null ? selected - first : -1
  const indices: number[] = []
  for (let i = range.from; i <= range.to; i++) indices.push(i)
  if (selectedIndex >= 0 && selectedIndex < chapters.length && !indices.includes(selectedIndex))
    indices.push(selectedIndex)

  const currentIndex = nextUnplayed(progress, first + chapters.length - 1)
  const walkedTo = Math.min(
    chapters.length - 1,
    (currentIndex === null ? first + chapters.length - 1 : currentIndex) - first,
  )
  const focusIndex =
    selectedIndex >= 0 && selectedIndex < chapters.length
      ? selectedIndex
      : Math.max(0, Math.min(chapters.length - 1, (currentIndex ?? first) - first))

  const move = (e: React.KeyboardEvent, order: number): void => {
    const i = order - first
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? i + 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? i - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? chapters.length - 1
              : null
    if (next === null) return
    e.preventDefault()
    const clamped = Math.max(0, Math.min(chapters.length - 1, next))
    focusAfter.current = first + clamped
    const b = box.current
    if (b) {
      const y = nodePos(layout, clamped).y
      if (y < b.scrollTop + NODE || y > b.scrollTop + b.clientHeight - NODE)
        b.scrollTop = scrollTopFor(layout, clamped, b.clientHeight)
    }
    onSelect(first + clamped)
  }
  useEffect(() => {
    const order = focusAfter.current
    if (order === null) return
    focusAfter.current = null
    document.getElementById(`game-node-${order}`)?.focus({ preventScroll: true })
  })

  const labelW = Math.min(124, layout.pitch - 8)
  const nodeLabel = (c: WorldChapter): string => {
    const state = nodeStateOf(c.order, progress)
    return t(`ds.game.node.${state}`, {
      index: c.order,
      title: c.text,
      count: clampStars(progress.get(c.order)?.stars ?? 0),
      max: MAX_STARS,
    })
  }

  return (
    <div
      ref={box}
      onScroll={onScroll}
      className="relative h-full overflow-auto"
      data-testid="road-map"
      role="group"
      aria-label={t('screens.game.mapLabel')}
    >
      <div className="relative mx-auto" style={{ width: layout.width, height: layout.height }}>
        <svg
          aria-hidden="true"
          width={layout.width}
          height={layout.height}
          className="absolute inset-0"
        >
          <path
            d={roadPath(layout, range.from, range.to)}
            fill="none"
            className="stroke-muted"
            strokeWidth={26}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={roadPath(layout, range.from, Math.min(range.to, walkedTo))}
            fill="none"
            className="stroke-success-soft"
            strokeWidth={26}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {nextWorld !== null && (
          <div className="absolute inset-x-0 top-3 flex justify-center">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onGoWorld(nextWorld)}
              data-testid="world-next"
            >
              <ChevronUp />
              {t('screens.game.nextWorld', { n: nextWorld })}
            </Button>
          </div>
        )}
        {prevWorld !== null && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onGoWorld(prevWorld)}
              data-testid="world-prev"
            >
              <ChevronDown />
              {t('screens.game.prevWorld', { n: prevWorld })}
            </Button>
          </div>
        )}
        {indices.map((i) => {
          const c = chapters[i]!
          const p = nodePos(layout, i)
          const state = nodeStateOf(c.order, progress)
          return (
            <MapNode
              key={c.order}
              chapter={c}
              x={p.x}
              y={p.y}
              labelW={labelW}
              state={state}
              stars={clampStars(progress.get(c.order)?.stars ?? 0)}
              selected={selected === c.order}
              focusable={i === focusIndex}
              label={nodeLabel(c)}
              onSelect={onSelect}
              onKey={move}
            />
          )
        })}
      </div>
    </div>
  )
}

function ListView({
  chapters,
  progress,
  selected,
  onSelect,
  prevWorld,
  nextWorld,
  onGoWorld,
}: {
  chapters: WorldChapter[]
  progress: ReadonlyMap<number, GameProgressEntry>
  selected: number | null
  onSelect: (order: number) => void
  prevWorld: number | null
  nextWorld: number | null
  onGoWorld: (world: number) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="h-full space-y-3 overflow-auto p-4">
      {prevWorld !== null && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onGoWorld(prevWorld)}
          data-testid="world-prev"
        >
          <ChevronUp />
          {t('screens.game.prevWorld', { n: prevWorld })}
        </Button>
      )}
      <ol
        aria-label={t('screens.game.listCaption')}
        className="space-y-1"
        data-testid="chapter-list"
      >
        {chapters.map((c) => {
          const state = nodeStateOf(c.order, progress)
          const stars = clampStars(progress.get(c.order)?.stars ?? 0)
          return (
            <li key={c.order}>
              <button
                type="button"
                data-testid={`game-row-${c.order}`}
                data-state={state}
                aria-disabled={state === 'locked' || undefined}
                aria-current={selected === c.order || undefined}
                onClick={() => onSelect(c.order)}
                className={cn(
                  'hover:bg-accent focus-visible:ring-ring flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:outline-none',
                  selected === c.order && 'bg-primary-soft',
                  state === 'locked' && 'text-muted-foreground',
                )}
              >
                <span className="w-10 shrink-0 tabular-nums">{c.order}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{c.text}</span>
                <span className="text-muted-foreground w-16 shrink-0 text-xs">
                  {t(`screens.game.type.${c.type}`)}
                </span>
                <span className="w-20 shrink-0 text-xs">{t(`screens.game.status.${state}`)}</span>
                <span className="w-20 shrink-0">
                  {state !== 'locked' && <StarRating stars={stars} size="sm" />}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      {nextWorld !== null && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onGoWorld(nextWorld)}
          data-testid="world-next"
        >
          <ChevronDown />
          {t('screens.game.nextWorld', { n: nextWorld })}
        </Button>
      )}
    </div>
  )
}

function Preview({
  order,
  progress,
}: {
  order: number | null
  progress: ReadonlyMap<number, GameProgressEntry>
}) {
  const { t } = useTranslation()
  const [data, setData] = useState<{ order: number; chapter: GameChapter['chapter'] } | null>(null)
  useEffect(() => {
    if (order === null) return
    let live = true
    void window.engclaw.game
      .chapter({ order })
      .then((r) => live && setData({ order, chapter: r.chapter }))
    return () => {
      live = false
    }
  }, [order])
  if (order === null)
    return (
      <p className="text-muted-foreground p-6 text-center text-sm" data-testid="preview-empty">
        {t('screens.game.selectChapter')}
      </p>
    )
  const chapter = data?.order === order ? data.chapter : null
  const state = nodeStateOf(order, progress)
  const entry = progress.get(order)
  return (
    <div className="space-y-4 p-6" data-testid="chapter-preview" aria-live="polite">
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {chapter
            ? t('screens.game.chapterTitle', {
                n: order,
                type: t(`screens.game.type.${chapter.type}`),
              })
            : t('screens.game.chapterTitle', { n: order, type: '' })}
        </p>
        {state === 'locked' ? (
          <p className="text-muted-foreground text-sm">
            {t('screens.game.passFirst', { n: order - 1 })}
          </p>
        ) : chapter ? (
          <>
            <p className="text-2xl font-semibold wrap-break-word">
              <ClickableText text={chapter.text} />
            </p>
            <p className="text-muted-foreground" lang="en-fonipa">
              /{chapter.ipa}/
            </p>
          </>
        ) : null}
      </div>
      {state !== 'locked' && chapter && (
        <>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t('screens.game.best')}</dt>
            <dd>{entry ? <StarRating stars={entry.stars} size="sm" /> : '—'}</dd>
            <dt className="text-muted-foreground">{t('screens.game.attempts')}</dt>
            <dd className="tabular-nums">{entry?.attempts ?? 0}</dd>
          </dl>
          <TargetAudioActions text={chapter.text} />
          <ExamplesPanel examples={chapter.examples} />
          <div className="space-y-2">
            <Button asChild data-testid="preview-play">
              <Link to={`/game/chapter/${order}`}>
                <Play />
                {t(state === 'passed' ? 'screens.game.replay' : 'screens.game.play')}
              </Link>
            </Button>
            {state === 'passed' && (
              <p className="text-muted-foreground text-xs">{t('screens.game.bestKept')}</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export function GameMapPage() {
  const { t } = useTranslation()
  const [map, setMap] = useState<GameMap | null>(null)
  const [failed, setFailed] = useState(false)
  const [world, setWorld] = useState<number | null>(null)
  const [loaded, setLoaded] = useState<Record<number, GameWorld>>({})
  const [selected, setSelected] = useState<number | null>(null)
  const [view, setView] = useState<View>('map')
  const [anchor, setAnchor] = useState<{ order: number; fresh: boolean }>({
    order: 1,
    fresh: false,
  })
  const memory = useRef(readMemory(window.localStorage.getItem(MAP_MEMORY_KEY)))

  useEffect(() => {
    let live = true
    window.engclaw.game.map().then(
      (m) => {
        if (!live) return
        const passed = progressMap(m.progress)
        const next = nextUnplayed(passed, m.total)
        const remembered = memory.current?.world
        const valid = m.worlds.some((w) => w.world === remembered)
        const target = valid
          ? remembered!
          : (worldOfOrder(next ?? m.total, m.worlds) ?? m.worlds[0]?.world ?? 1)
        setMap(m)
        setWorld(target)
        setAnchor({ order: next ?? m.total, fresh: !valid })
      },
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [])

  const remember = useCallback((w: number, row?: number) => {
    const prev = memory.current ?? { world: w, rows: {} }
    const next = {
      world: w,
      rows: row === undefined ? prev.rows : { ...prev.rows, [w]: row },
    }
    memory.current = next
    window.localStorage.setItem(MAP_MEMORY_KEY, JSON.stringify(next))
  }, [])

  useEffect(() => {
    if (world === null || loaded[world]) return
    let live = true
    void window.engclaw.game
      .world({ world })
      .then((w) => live && setLoaded((l) => ({ ...l, [world]: w })))
    return () => {
      live = false
    }
  }, [world, loaded])

  const progress = useMemo(() => progressMap(map?.progress ?? []), [map])
  const worldInfo = map?.worlds.find((w) => w.world === world)
  const chapters = world !== null ? loaded[world]?.chapters : undefined

  const goToWorld = (w: number, order?: number, edge?: number): void => {
    if (!map) return
    const info = map.worlds.find((x) => x.world === w)
    if (!info) return
    remember(w)
    setWorld(w)
    setSelected(order ?? null)
    const savedRow = order === undefined && edge === undefined ? memory.current?.rows[w] : undefined
    setAnchor({
      order: order ?? edge ?? nextUnplayed(progress, map.total) ?? info.first,
      fresh: savedRow === undefined,
    })
  }

  if (failed)
    return (
      <p role="alert" className="p-6">
        {t('screens.game.mapFailed')}
      </p>
    )
  if (!map || world === null || !worldInfo)
    return (
      <p role="status" className="p-6">
        {t('screens.game.loadingMap')}
      </p>
    )

  const next = nextUnplayed(progress, map.total)
  const stars = map.progress.reduce((n, e) => n + e.stars, 0)
  const continueTo = (): void => {
    if (next === null) return
    const w = worldOfOrder(next, map.worlds)
    if (w !== null) goToWorld(w, next)
  }
  const worldIndex = map.worlds.findIndex((w) => w.world === world)
  const prevWorld = map.worlds[worldIndex - 1]?.world ?? null
  const nextWorld = map.worlds[worldIndex + 1]?.world ?? null
  const goAdjacent = (w: number): void => {
    const info = map.worlds.find((x) => x.world === w)
    if (info) goToWorld(w, undefined, w > world ? info.first : info.first + info.count - 1)
  }
  const initialRow = anchor.fresh ? null : (memory.current?.rows[world] ?? null)

  return (
    <section className="flex h-full flex-col" data-testid="game-map">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b px-6 py-3">
        <h2 className="min-w-0 flex-1 text-lg font-semibold">{t('screens.shell.game')}</h2>
        <span className="text-muted-foreground text-sm tabular-nums" data-testid="game-stats">
          {t('screens.game.stats', { stars, passed: map.progress.length })}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={next === null}
          onClick={continueTo}
          data-testid="game-continue"
        >
          <Play />
          {next === null
            ? t('screens.game.finishedBanner')
            : t('screens.game.continue', { n: next })}
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">{t('screens.game.jump')}</span>
          <select
            data-testid="game-world-select"
            aria-label={t('screens.game.jump')}
            value={world}
            onChange={(e) => goToWorld(Number(e.target.value))}
            className="bg-background h-8 rounded-md border px-2 text-sm"
          >
            {map.worlds.map((w) => (
              <option key={w.world} value={w.world}>
                {t('screens.game.worldOption', {
                  n: w.world,
                  passed: worldTally(w, progress).passed,
                  total: w.count,
                })}
              </option>
            ))}
          </select>
        </label>
        <ToggleGroup
          type="single"
          value={view}
          variant="outline"
          size="sm"
          aria-label={t('screens.game.view')}
          onValueChange={(v) => v && setView(v as View)}
        >
          <ToggleGroupItem
            value="map"
            aria-label={t('screens.game.viewMap')}
            data-testid="view-map"
          >
            <MapIcon />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="list"
            aria-label={t('screens.game.viewList')}
            data-testid="view-list"
          >
            <List />
          </ToggleGroupItem>
        </ToggleGroup>
      </header>
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[1fr_320px] lg:grid-rows-1 lg:divide-x">
        <div className="flex min-h-0 flex-col">
          <div className="shrink-0 space-y-1 px-6 pt-4">
            <p className="text-sm font-semibold" data-testid="world-title">
              {t('screens.game.worldN', { n: world })}
              <span className="text-muted-foreground ml-2 font-normal">
                {t('screens.game.worldPassed', {
                  passed: worldTally(worldInfo, progress).passed,
                  total: worldInfo.count,
                })}
              </span>
            </p>
            <ProgressSummary
              earned={stars}
              total={map.total * MAX_STARS}
              passed={map.progress.length}
              chapters={map.total}
            />
          </div>
          <div className="min-h-0 flex-1">
            {!chapters ? (
              <p role="status" className="p-6 text-sm">
                {t('screens.game.loadingMap')}
              </p>
            ) : view === 'map' ? (
              <RoadMap
                key={world}
                chapters={chapters}
                first={worldInfo.first}
                progress={progress}
                selected={selected}
                initialRow={initialRow}
                anchorOrder={anchor.order}
                onSelect={setSelected}
                onScrolled={(row) => remember(world, row)}
                prevWorld={prevWorld}
                nextWorld={nextWorld}
                onGoWorld={goAdjacent}
              />
            ) : (
              <ListView
                chapters={chapters}
                progress={progress}
                selected={selected}
                onSelect={setSelected}
                prevWorld={prevWorld}
                nextWorld={nextWorld}
                onGoWorld={goAdjacent}
              />
            )}
          </div>
        </div>
        <aside
          aria-label={t('screens.game.preview')}
          className="max-h-64 overflow-auto lg:max-h-none"
        >
          <Preview order={selected} progress={progress} />
        </aside>
      </div>
    </section>
  )
}
