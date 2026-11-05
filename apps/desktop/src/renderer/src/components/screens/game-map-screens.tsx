import { useEffect, useRef } from 'react'
import { ChevronDown, Flag, List, Map as MapIcon, Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AppShell, Pane, layoutOf, type Layout } from '@/components/screens/shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ChapterNode,
  PathConnector,
  ProgressSummary,
  StarRating,
  WorldHeader,
} from '@/components/ui/game'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { nodeStates, progressOf, type NodeState } from '@/lib/game'
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
const NODE_W: Record<Layout, string> = { wide: 'w-36', standard: 'w-32', compact: 'w-28' }

function Row({
  chapters,
  ltr,
  layout,
  selected,
  currentRef,
}: {
  chapters: Chapter[]
  ltr: boolean
  layout: Layout
  selected: number | null
  currentRef: React.RefObject<HTMLDivElement | null>
}) {
  const { t } = useTranslation()
  return (
    <div className={cn('flex gap-4', ltr ? 'flex-row' : 'flex-row-reverse')}>
      {chapters.map((c) => (
        <div
          key={c.index}
          ref={c.state === 'current' ? currentRef : undefined}
          className={cn(
            'relative',
            selected === c.index && 'ring-ring rounded-xl ring-2 ring-offset-2',
          )}
        >
          {c.state === 'current' && (
            <Badge
              className="absolute -top-3 left-1/2 z-10 -translate-x-1/2"
              data-testid="you-are-here"
            >
              {t('screens.game.youAreHere')}
            </Badge>
          )}
          <ChapterNode
            index={c.index}
            title={c.target}
            state={c.state}
            stars={c.stars ?? 0}
            className={cn(NODE_W[layout], 'overflow-hidden')}
          />
        </div>
      ))}
    </div>
  )
}

/** The zig-zag road, drawn bottom to top; the DOM stays in chapter order (1 → N). */
function RoadMap({
  chapters,
  layout,
  selected,
  finished,
  coach,
}: {
  chapters: Chapter[]
  layout: Layout
  selected: number | null
  finished: boolean
  coach: boolean
}) {
  const { t } = useTranslation()
  const box = useRef<HTMLDivElement>(null)
  const current = useRef<HTMLDivElement>(null)
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
    b.scrollTop = Math.max(0, top - b.clientHeight * (2 / 3))
  }, [chapters, layout])

  const perRow = PER_ROW[layout]
  const worlds = [...new Set(chapters.map((c) => c.world))]
  let rowNo = 0
  const parts: React.ReactNode[] = []
  for (const w of worlds) {
    const inWorld = chapters.filter((c) => c.world === w)
    const passed = inWorld.filter((c) => c.state === 'passed').length
    const rows: Chapter[][] = []
    for (let i = 0; i < inWorld.length; i += perRow) rows.push(inWorld.slice(i, i + perRow))
    // Bottom-up drawing: the header comes first in DOM order, so it sits at the start of its world.
    parts.push(
      <WorldHeader
        key={`w${w}`}
        name={t('screens.game.world', { n: w + 1, name: WORLD_NAMES[w] ?? WORLD_NAMES[0] })}
        subtitle={t('screens.game.worldPassed', { passed, total: inWorld.length })}
      />,
    )
    rows.forEach((r, i) => {
      const ltr = rowNo % 2 === 0
      parts.push(
        <Row
          key={`r${w}-${i}`}
          chapters={r}
          ltr={ltr}
          layout={layout}
          selected={selected}
          currentRef={current}
        />,
      )
      const isLastRow = i === rows.length - 1 && w === worlds[worlds.length - 1]
      if (!isLastRow)
        parts.push(
          <div
            key={`c${w}-${i}`}
            className={cn('flex px-14', ltr ? 'justify-end' : 'justify-start')}
          >
            <PathConnector done={r.every((c) => c.state === 'passed')} />
          </div>,
        )
      rowNo += 1
    })
  }
  return (
    <div ref={box} className="relative h-full overflow-auto p-6" data-testid="road-map">
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
      <div className="flex flex-col-reverse gap-2">{parts}</div>
    </div>
  )
}

/** The preview docked next to the map (or anchored over it when Compact). */
export function ChapterPreview({ chapter }: { chapter: Chapter | null }) {
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
  return (
    <div className="space-y-4" data-testid="chapter-preview">
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {t('screens.game.chapterTitle', {
            n: chapter.index,
            type: t(`screens.game.type.${chapter.type}`),
          })}
        </p>
        <p className="text-2xl font-semibold break-words">{chapter.target}</p>
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
          className="bg-card absolute inset-x-4 bottom-10 z-10 rounded-xl border p-4 shadow-lg"
          data-testid="preview-sheet"
        >
          <ChapterPreview chapter={picked} />
        </div>
      )}
      {variant === 'jump' && <JumpMenu chapters={chapters} />}
    </div>
  )
}
