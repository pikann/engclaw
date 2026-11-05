import {
  AlertTriangle,
  Check,
  Circle,
  CircleDot,
  EyeOff,
  Film,
  List,
  Loader2,
  Maximize2,
  Mic,
  Square,
  WifiOff,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AppShell, Pane, layoutOf } from '@/components/screens/shell'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ClickableWord } from '@/components/ui/clickable-word'
import { Input } from '@/components/ui/input'
import { PlayerControls } from '@/components/ui/player-controls'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export type EntryState =
  'empty' | 'loading' | 'invalid' | 'noTranscript' | 'unavailable' | 'network' | 'no-recents'

const ENTRY_URL = 'https://www.youtube.com/watch?v=abc123'
const SENTENCE = ['Today', 'we', 'talk', 'about', 'the', 'roots', 'of', 'learning', 'languages.']

/** URL entry with the inline error banners from IA doc §4.1. */
export function ShadowingEntryScreen({ width, state }: { width: number; state: EntryState }) {
  const { t } = useTranslation()
  const failed = ['invalid', 'noTranscript', 'unavailable', 'network'].includes(state)
  const loading = state === 'loading'
  return (
    <AppShell layout={layoutOf(width)} active="shadowing" title={t('screens.shell.shadowing')}>
      <div className="mx-auto flex h-full max-w-3xl flex-col gap-6 overflow-auto p-8">
        <div className="space-y-3">
          <h3 className="text-2xl font-semibold">{t('screens.shadowing.heading')}</h3>
          <div className="flex gap-2">
            <Input
              aria-label={t('screens.shadowing.urlLabel')}
              placeholder="https://www.youtube.com/watch?v=…"
              defaultValue={state === 'empty' || state === 'no-recents' ? '' : ENTRY_URL}
              aria-invalid={state === 'invalid'}
              readOnly
            />
            <Button disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              {t('screens.shadowing.load')}
            </Button>
          </div>
          {loading && (
            <p role="status" className="text-muted-foreground text-sm">
              {t('screens.shadowing.loading')}
            </p>
          )}
          {failed && (
            <Alert className="border-destructive bg-destructive-soft text-destructive-soft-foreground flex gap-3">
              {state === 'network' ? (
                <WifiOff className="mt-0.5 size-4 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              )}
              <div className="space-y-2">
                <p>{t(`screens.shadowing.error.${state}`)}</p>
                {state === 'network' && (
                  <Button size="sm" variant="outline">
                    {t('practice.retry')}
                  </Button>
                )}
              </div>
            </Alert>
          )}
        </div>
        <section aria-labelledby="recent-title" className="space-y-3">
          <h3 id="recent-title" className="text-lg font-semibold">
            {t('screens.shadowing.recent')}
          </h3>
          {state === 'no-recents' ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
              {t('screens.shadowing.noRecents')}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <li key={i} className="space-y-1.5">
                  <div className="bg-muted text-muted-foreground flex aspect-video items-center justify-center rounded-md">
                    {loading ? <Skeleton className="size-full" /> : <Film aria-hidden="true" />}
                  </div>
                  <p className="truncate text-sm">{t('screens.shadowing.sampleVideo', { n: i })}</p>
                  <p className="text-muted-foreground text-xs">
                    {t('screens.shadowing.progress', { done: i * 4, total: 48 })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  )
}

export type SessionState =
  | 'ready'
  | 'playing'
  | 'recording'
  | 'analyzing'
  | 'result'
  | 'hidden'
  | 'stopped'
  | 'loading'
  | 'focus'

function VideoBox({ state }: { state: SessionState }) {
  const { t } = useTranslation()
  return (
    <div className="bg-muted text-muted-foreground relative flex aspect-video max-h-full max-w-full items-center justify-center self-center overflow-hidden rounded-lg border">
      {state === 'loading' ? (
        <Skeleton className="size-full" />
      ) : (
        <Film className="size-10" aria-hidden="true" />
      )}
      {state === 'stopped' && (
        <div className="bg-card/95 absolute inset-x-4 bottom-4 flex items-center gap-3 rounded-md border p-3 text-sm">
          <AlertTriangle className="text-warning size-4 shrink-0" />
          <span className="flex-1">{t('screens.shadowing.stopped')}</span>
          <Button size="sm">{t('practice.retry')}</Button>
        </div>
      )}
      <span className="sr-only">{t('screens.shadowing.videoAlt')}</span>
    </div>
  )
}

function Sentence({ state, size }: { state: SessionState; size: string }) {
  const { t } = useTranslation()
  const scored = state === 'result'
  const bad = new Set(['talk', 'about'])
  if (state === 'loading')
    return (
      <div className="space-y-2" role="status" aria-label={t('screens.shadowing.loading')}>
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-8 w-1/2" />
      </div>
    )
  return (
    <div className="space-y-1.5 text-center">
      <p
        className={cn(size, 'leading-relaxed', state === 'hidden' && 'blur-sm select-none')}
        aria-hidden={state === 'hidden' || undefined}
        data-testid="screen-sentence"
      >
        {SENTENCE.map((w, i) => {
          const isBad = scored && bad.has(w)
          return (
            <span key={i} className="mr-2 inline-block">
              <ClickableWord
                disabled={state === 'hidden'}
                className={cn(
                  state === 'playing' && w === 'talk' && 'bg-primary-soft',
                  isBad &&
                    'bg-destructive-soft text-destructive-soft-foreground decoration-destructive',
                )}
              >
                {w}
              </ClickableWord>
              {scored &&
                (isBad ? (
                  <AlertTriangle
                    className="text-destructive ml-0.5 inline size-4"
                    aria-label={t('screens.practice.needsWork')}
                  />
                ) : (
                  <Check
                    className="text-success ml-0.5 inline size-4"
                    aria-label={t('result.chipOk')}
                  />
                ))}
            </span>
          )
        })}
      </p>
      {state === 'hidden' ? (
        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-sm">
          <EyeOff className="size-4" />
          {t('screens.shadowing.sentenceHidden')}
        </p>
      ) : (
        <p className="text-muted-foreground text-sm" lang="en-fonipa">
          /təˈdeɪ wi tɔːk əˈbaʊt ðə ruːts əv ˈlɜːnɪŋ ˈlæŋɡwɪdʒɪz/
        </p>
      )}
    </div>
  )
}

function TranscriptRail() {
  const { t } = useTranslation()
  return (
    <Pane title={t('screens.shadowing.transcript')} className="border-l">
      <ol className="space-y-1 text-sm">
        {Array.from({ length: 8 }, (_, i) => (
          <li
            key={i}
            aria-current={i === 1 ? 'true' : undefined}
            className={cn('rounded-md px-2 py-1.5', i === 1 && 'bg-primary-soft font-medium')}
          >
            <span className="text-muted-foreground mr-2 tabular-nums">{i + 1}</span>
            {t('screens.shadowing.sampleLine', { n: i + 1 })}
          </li>
        ))}
      </ol>
    </Pane>
  )
}

/** Shadowing stage (IA doc §4.2): the video and the sentence take the space; the rail is optional. */
export function ShadowingSessionScreen({
  width,
  state,
  rail,
}: {
  width: number
  state: SessionState
  rail: boolean
}) {
  const { t } = useTranslation()
  const focus = state === 'focus'
  const recording = state === 'recording'
  const analyzing = state === 'analyzing'
  const layout = layoutOf(width)
  const stage = (
    <div className="flex h-full min-w-0 flex-col gap-3 p-4">
      <div className="flex min-h-0 flex-1 justify-center">
        <VideoBox state={state} />
      </div>
      <Sentence state={state} size={layout === 'compact' ? 'text-2xl' : 'text-3xl'} />
      <div className="flex flex-wrap items-center justify-center gap-3 border-t pt-3">
        <PlayerControls
          playing={state === 'playing'}
          looping={false}
          speed={1}
          onToggle={() => undefined}
          onPrev={() => undefined}
          onNext={() => undefined}
          onLoop={() => undefined}
          onSpeed={() => undefined}
        />
        <Button
          variant={recording ? 'live' : 'default'}
          disabled={analyzing || state === 'loading'}
        >
          {analyzing ? <Loader2 className="animate-spin" /> : recording ? <Square /> : <Mic />}
          {t(
            analyzing
              ? 'ds.recorder.processing'
              : recording
                ? 'ds.recorder.stop'
                : 'ds.recorder.start',
          )}
        </Button>
        <Badge variant="secondary" className="tabular-nums">
          {t('screens.shadowing.segment', { n: 2, total: 48 })}
        </Badge>
      </div>
      {state === 'result' && (
        <div
          className="bg-card flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
          data-testid="screen-strip"
        >
          <span className="font-medium tabular-nums">
            {t('screens.shadowing.fluency', { n: 76 })}
          </span>
          <span className="tabular-nums">{t('screens.shadowing.accuracy', { n: 91 })}</span>
          <span className="text-muted-foreground flex-1">
            {t('screens.shadowing.toFix', { count: 2 })}
          </span>
          <Button size="sm" variant="outline">
            {t('result.details')}
          </Button>
        </div>
      )}
    </div>
  )
  return (
    <AppShell
      layout={layout}
      active="shadowing"
      title={focus ? '' : t('screens.shadowing.videoTitle')}
      actions={
        focus ? undefined : (
          <>
            <div
              role="tablist"
              aria-label={t('screens.shadowing.modeLabel')}
              className="bg-muted flex rounded-lg p-0.5"
            >
              {(['shadowing', 'dictation'] as const).map((m) => (
                <span
                  key={m}
                  role="tab"
                  aria-selected={m === 'shadowing'}
                  className={cn(
                    'rounded-md px-3 py-1 text-sm',
                    m === 'shadowing' ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground',
                  )}
                >
                  {t(`screens.shadowing.mode.${m}`)}
                </span>
              ))}
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('screens.shadowing.toggleRail')}
              aria-pressed={rail}
            >
              <List />
            </Button>
            <Button variant="ghost" size="icon" aria-label={t('screens.shadowing.focus')}>
              <Maximize2 />
            </Button>
          </>
        )
      }
    >
      <div
        className={cn(
          'grid h-full',
          rail && layout !== 'compact' ? 'grid-cols-[1fr_320px]' : 'grid-cols-1',
        )}
      >
        {stage}
        {rail && layout !== 'compact' && <TranscriptRail />}
      </div>
    </AppShell>
  )
}

export type DictationState = 'typing' | 'checked' | 'summary' | 'stopped'
type Blank = 'empty' | 'ok' | 'near' | 'wrong'

function BlankInput({ n, value, status }: { n: number; value: string; status: Blank }) {
  const { t } = useTranslation()
  const icon =
    status === 'ok' ? (
      <Check className="text-success size-4" />
    ) : status === 'near' ? (
      <span aria-hidden="true">~</span>
    ) : status === 'wrong' ? (
      <AlertTriangle className="text-destructive size-4" />
    ) : null
  return (
    <div className="flex items-center gap-2">
      <label className="text-muted-foreground w-16 shrink-0 text-sm" htmlFor={`blank-${n}`}>
        {t('screens.dictation.blank', { n })}
      </label>
      <Input
        id={`blank-${n}`}
        readOnly
        defaultValue={value}
        aria-invalid={status === 'wrong'}
        className="max-w-48"
      />
      {icon}
      {status !== 'empty' && (
        <span className="text-sm">
          {t(`screens.dictation.status.${status}`)}
          {status === 'wrong' && <strong className="ml-1">{n === 3 ? 'languages' : 'talk'}</strong>}
          {status === 'near' && <strong className="ml-1">roots</strong>}
        </span>
      )}
    </div>
  )
}

/** Dictation (IA doc §4.3): video + loop · sheet · segments and review list. */
export function DictationScreen({ width, state }: { width: number; state: DictationState }) {
  const { t } = useTranslation()
  const layout = layoutOf(width)
  const checked = state === 'checked'
  const summary = state === 'summary'
  const blanks: [string, Blank][] = checked
    ? [
        ['talk', 'ok'],
        ['rutes', 'near'],
        ['', 'wrong'],
      ]
    : [
        ['talk', 'empty'],
        ['', 'empty'],
        ['', 'empty'],
      ]
  return (
    <AppShell layout={layout} active="shadowing" title={t('screens.shadowing.videoTitle')}>
      <div
        className={cn(
          'grid h-full divide-x',
          layout === 'compact'
            ? 'grid-cols-[1fr_1fr]'
            : 'grid-cols-[minmax(280px,1fr)_minmax(320px,1.2fr)_280px]',
        )}
      >
        <Pane title={t('screens.dictation.listen')} bodyClassName="flex flex-col gap-3">
          <div className="flex min-h-0 flex-1 justify-center">
            <VideoBox state={state === 'stopped' ? 'stopped' : 'ready'} />
          </div>
          <PlayerControls
            playing={false}
            looping
            speed={1}
            onToggle={() => undefined}
            onPrev={() => undefined}
            onNext={() => undefined}
            onLoop={() => undefined}
            onSpeed={() => undefined}
            className="flex-wrap"
          />
          <p className="text-muted-foreground text-sm tabular-nums">
            {t('screens.dictation.playCount', { n: 2, total: 3 })}
          </p>
        </Pane>
        {summary ? (
          <Pane title={t('screens.dictation.summary')}>
            <div className="space-y-3" data-testid="screen-summary">
              <p className="text-4xl font-semibold tabular-nums">72%</p>
              <p className="text-muted-foreground text-sm">
                {t('screens.dictation.summaryBody', { right: 35, total: 48 })}
              </p>
              <Button>{t('screens.dictation.practiseWords')}</Button>
            </div>
          </Pane>
        ) : (
          <Pane
            title={t('screens.dictation.segment', { n: 2, total: 48 })}
            actions={<Badge variant="outline">{t('screens.dictation.hide', { n: 30 })}</Badge>}
          >
            <div className="space-y-4">
              <p className="text-2xl leading-loose">
                Today we <span className="border-b-2 px-4">&nbsp;</span> about the{' '}
                <span className="border-b-2 px-4">&nbsp;</span> of learning{' '}
                <span className="border-b-2 px-4">&nbsp;</span>.
              </p>
              {state === 'stopped' && (
                <Alert
                  className="border-warning bg-warning-soft text-warning-soft-foreground"
                  role="status"
                >
                  {t('screens.shadowing.stopped')} {t('screens.dictation.answersKept')}
                </Alert>
              )}
              <div className="space-y-2">
                {blanks.map(([v, s], i) => (
                  <BlankInput key={i} n={i + 1} value={v} status={s} />
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button>{t('screens.dictation.check')}</Button>
                <Button variant="outline">{t('screens.dictation.newBlanks')}</Button>
                {checked && (
                  <Button variant="outline">{t('screens.dictation.retrySegment')}</Button>
                )}
              </div>
            </div>
          </Pane>
        )}
        {layout !== 'compact' && (
          <Pane
            title={t('screens.dictation.segments')}
            actions={
              <span className="text-sm tabular-nums">
                {t('screens.dictation.score', { n: 72 })}
              </span>
            }
          >
            <ul className="space-y-1 text-sm">
              {[
                ['done', 1],
                ['current', 2],
                ['todo', 3],
                ['review', 4],
              ].map(([k, n]) => (
                <li key={String(n)} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                  {k === 'done' ? (
                    <Check className="text-success size-4" />
                  ) : k === 'current' ? (
                    <CircleDot className="text-primary size-4" />
                  ) : k === 'review' ? (
                    <AlertTriangle className="text-warning size-4" />
                  ) : (
                    <Circle className="text-muted-foreground size-4" />
                  )}
                  <span className="tabular-nums">{n}</span>
                  <span className="text-muted-foreground">{t(`screens.dictation.seg.${k}`)}</span>
                </li>
              ))}
            </ul>
            {(checked || summary) && (
              <div className="mt-4 space-y-2">
                <h4 className="text-sm font-medium">{t('screens.dictation.reviewList')}</h4>
                <p className="text-sm">
                  <ClickableWord>talk</ClickableWord> → tack
                </p>
              </div>
            )}
          </Pane>
        )}
      </div>
    </AppShell>
  )
}
