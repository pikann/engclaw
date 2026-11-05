import {
  AlertTriangle,
  ArrowLeft,
  List,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  WifiOff,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PlayerSurface } from '@/components/shadowing/player-surface'
import { Pane } from '@/components/screens/shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePlayer } from '@/lib/use-player'
import { fitStage, formatClock, type Segment } from '@/lib/shadowing'
import { cn } from '@/lib/utils'

/** Fixed chrome under the video and sentence: the control bar plus the gaps between blocks. */
const CHROME_HEIGHT = 64

function useContentSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const r = entry?.contentRect
      if (r) setSize({ width: r.width, height: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

/** The shadowing stage (IA doc §4.2): video and current sentence as large as the window allows. */
export function ShadowingSession({
  videoId,
  title,
  segments,
  onBack,
}: {
  videoId: string
  title: string
  segments: readonly Segment[]
  onBack: () => void
}) {
  const { t } = useTranslation()
  const { state, index, command, seekToSegment, retry } = usePlayer(videoId, segments)
  const [railOpen, setRailOpen] = useState(true)
  const [stageRef, stage] = useContentSize()
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const shown = segments[Math.max(index, 0)]
  const fit = fitStage({
    stageWidth: stage.width,
    stageHeight: stage.height,
    chromeHeight: CHROME_HEIGHT,
    sentenceChars: shown?.text.length ?? 0,
  })
  const failed = state.phase === 'error'

  useEffect(() => {
    if (railOpen && index >= 0) itemRefs.current[index]?.scrollIntoView({ block: 'nearest' })
  }, [index, railOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable]')) return
      if (e.key.toLowerCase() === 't' && !e.metaKey && !e.ctrlKey && !e.altKey)
        setRailOpen((open) => !open)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const go = (i: number) => seekToSegment(Math.min(Math.max(i, 0), segments.length - 1))

  return (
    <div data-testid="shadowing-session" className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft />
          {t('screens.shadowing.another')}
        </Button>
        <h2 className="min-w-0 flex-1 truncate font-medium" data-testid="shadowing-title">
          {title}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('screens.shadowing.toggleRail')}
          aria-pressed={railOpen}
          onClick={() => setRailOpen((open) => !open)}
        >
          <List />
        </Button>
      </div>
      <div
        className={cn(
          'grid min-h-0 flex-1',
          railOpen ? 'grid-cols-[minmax(0,1fr)_320px]' : 'grid-cols-1',
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-col p-4">
          <div ref={stageRef} className="flex min-h-0 flex-1 flex-col items-center gap-3">
            <div
              className="relative shrink-0"
              style={{ width: fit.videoWidth, height: fit.videoHeight }}
            >
              <PlayerSurface
                width={fit.videoWidth}
                height={fit.videoHeight}
                visible={!failed && fit.videoWidth > 0}
                label={t('screens.shadowing.videoAlt')}
              />
              {failed && (
                <div
                  role="alert"
                  data-testid="shadowing-player-error"
                  className="bg-muted absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg border p-4 text-center text-sm"
                >
                  {state.error === 'NETWORK' ? (
                    <WifiOff className="size-6" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="text-warning size-6" aria-hidden="true" />
                  )}
                  <p>
                    {t(
                      state.error === 'NETWORK'
                        ? 'screens.shadowing.error.network'
                        : 'screens.shadowing.error.unavailable',
                    )}
                  </p>
                  {state.error === 'NETWORK' ? (
                    <Button size="sm" variant="outline" onClick={retry}>
                      {t('practice.retry')}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={onBack}>
                      {t('screens.shadowing.another')}
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div
              className="w-full shrink-0 overflow-auto text-center"
              style={{ height: fit.sentenceHeight }}
            >
              <p
                data-testid="shadowing-sentence"
                className="leading-snug"
                style={{ fontSize: fit.fontSize }}
              >
                {shown?.text}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-center gap-3">
              <div
                role="toolbar"
                aria-label={t('ds.player.label')}
                className="flex items-center gap-2"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('ds.player.prev')}
                  disabled={failed}
                  onClick={() => go(index - 1)}
                >
                  <SkipBack />
                </Button>
                <Button
                  size="icon"
                  data-testid="shadowing-toggle"
                  aria-label={state.playing ? t('ds.player.pause') : t('ds.player.play')}
                  disabled={failed}
                  onClick={() => command({ type: state.playing ? 'pause' : 'play' })}
                >
                  {state.playing ? <Pause /> : <Play />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('ds.player.next')}
                  disabled={failed}
                  onClick={() => go(index + 1)}
                >
                  <SkipForward />
                </Button>
              </div>
              <Badge variant="secondary" className="tabular-nums" data-testid="shadowing-position">
                {t('screens.shadowing.segment', {
                  n: Math.max(index, 0) + 1,
                  total: segments.length,
                })}
              </Badge>
            </div>
          </div>
        </div>
        {railOpen && (
          <Pane title={t('screens.shadowing.transcript')} className="border-l">
            <ol className="space-y-1 text-sm" data-testid="shadowing-rail">
              {segments.map((s, i) => (
                <li key={s.index}>
                  <button
                    type="button"
                    ref={(el) => {
                      itemRefs.current[i] = el
                    }}
                    aria-current={i === index ? 'true' : undefined}
                    onClick={() => seekToSegment(i)}
                    className={cn(
                      'focus-visible:ring-ring/50 hover:bg-muted flex w-full gap-2 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-[3px]',
                      i === index && 'bg-primary-soft font-medium',
                    )}
                  >
                    <span className="text-muted-foreground w-10 shrink-0 tabular-nums">
                      {formatClock(s.start)}
                    </span>
                    <span>{s.text}</span>
                  </button>
                </li>
              ))}
            </ol>
          </Pane>
        )}
      </div>
    </div>
  )
}
