import {
  AlertTriangle,
  Bookmark,
  Check,
  ChevronRight,
  Download,
  MicOff,
  RotateCcw,
  Square,
  Upload,
  Volume2,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppShell, Pane, layoutOf, type Layout } from '@/components/screens/shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ClickableWord } from '@/components/ui/clickable-word'
import { Recorder } from '@/components/ui/recorder'
import { ScoreRing } from '@/components/ui/score-ring'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

export type PracticeMode = 'read' | 'free'
export type PracticePhase =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'check'
  | 'analyzing'
  | 'result'
  | 'empty-hint'
  | 'error-mic'
  | 'error-model'
  | 'error-failed'

/** Optional states beyond the main phase (ENGC-87). */
export interface PracticeExtras {
  /** "History: last 5" in the input pane. */
  history?: 'closed' | 'list' | 'empty'
  /** Save action in the result: not yet saved, or saved with its audio. */
  saved?: boolean
  /** Phoneme view in Detail. */
  view?: 'ipa' | 'text'
  /** Pitch chart quality. */
  pitch?: 'ok' | 'empty' | 'low'
  /** "Hear both" is playing. */
  hearing?: boolean
  /** Detail tab shown first. */
  detailTab?: 'phonemes' | 'pitch' | 'words'
  /** The other tab holds unfinished work (kept), or switching would end a recording (confirm). */
  tabs?: 'draft' | 'confirm'
}

const READ_TEXT = 'The thorough thought went through.'
const FREE_TEXT = 'I go to the market yesterday'

const HISTORY = {
  read: [
    ['The thorough thought went through.', 84, -2, true],
    ['She sells seashells by the seashore.', 71, -5, false],
    ['Would you like some water?', 90, -26, false],
    ['I think this is the right path.', 65, -50, false],
    ['Three free throws', 58, -100, true],
  ],
  free: [
    ['I go to the market yesterday', 71, -1, false],
    ['My brother is working in the hospital', 80, -4, true],
    ['I want to improve my pronunciation', 88, -26, false],
    ['Yesterday I watch a movie with friends', 69, -50, false],
    ['We have a meeting at three o’clock', 77, -100, false],
  ],
} as const

const WORDS = [
  { w: 'The', bad: false },
  { w: 'thorough', bad: true },
  { w: 'thought', bad: true },
  { w: 'went', bad: false },
  { w: 'through.', bad: false },
]

/** Result words: marked with an icon and underline, never by colour alone. */
function ResultWords() {
  const { t } = useTranslation()
  return (
    <p className="text-2xl leading-loose" data-testid="screen-result-words">
      {WORDS.map(({ w, bad }) => (
        <span key={w} className="mr-2 inline-block">
          <ClickableWord
            className={cn(
              bad
                ? 'bg-destructive-soft text-destructive-soft-foreground decoration-destructive'
                : 'text-success-soft-foreground',
            )}
          >
            {w}
          </ClickableWord>
          {bad ? (
            <X
              className="text-destructive ml-0.5 inline size-4"
              aria-label={t('screens.practice.needsWork')}
            />
          ) : (
            <Check className="text-success ml-0.5 inline size-4" aria-label={t('result.chipOk')} />
          )}
        </span>
      ))}
    </p>
  )
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card rounded-lg border px-4 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

const PHONEMES = [
  ['ð', 'th', 'this', false],
  ['ə', 'uh', 'about', false],
  ['θ', 'th', 'think', true],
  ['ʌ', 'u', 'cup', false],
  ['r', 'r', 'red', false],
  ['ə', 'uh', 'about', false],
] as const

function PhonemeDetail({ view, hearing }: { view: 'ipa' | 'text'; hearing: boolean }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState(view)
  return (
    <div className="space-y-3">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={mode}
        onValueChange={(v) => v && setMode(v as 'ipa' | 'text')}
        aria-label={t('screens.practice.viewLabel')}
      >
        <ToggleGroupItem value="ipa">{t('screens.practice.viewIpa')}</ToggleGroupItem>
        <ToggleGroupItem value="text">{t('screens.practice.viewText')}</ToggleGroupItem>
      </ToggleGroup>
      {mode === 'ipa' ? (
        <p className="font-mono text-xl" lang="en-fonipa" data-testid="screen-phonemes-ipa">
          {PHONEMES.map(([p, , , bad], i) => (
            <span
              key={i}
              className={cn(
                'mr-1',
                bad && 'underline decoration-score-low decoration-2 underline-offset-4',
              )}
            >
              {p}
            </span>
          ))}
        </p>
      ) : (
        <ol className="flex flex-wrap gap-2 text-sm" data-testid="screen-phonemes-text">
          {PHONEMES.map(([, sound, word, bad], i) => (
            <li
              key={i}
              className={cn(
                'rounded-md border px-2 py-1',
                bad && 'border-destructive bg-destructive-soft text-destructive-soft-foreground',
              )}
            >
              {bad && <X className="mr-1 inline size-3.5" aria-hidden="true" />}
              {t('screens.practice.asIn', { sound, word })}
            </li>
          ))}
        </ol>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t('result.expected')}</dt>
        <dd className="font-mono">θ</dd>
        <dt className="text-muted-foreground">{t('result.heard')}</dt>
        <dd className="font-mono">s</dd>
      </dl>
      <Button variant="outline" size="sm" aria-pressed={hearing}>
        {hearing ? <Square /> : <Volume2 />}
        {t(hearing ? 'screens.practice.stopBoth' : 'screens.practice.hearBoth')}
        {hearing && <span className="sr-only"> — {t('screens.practice.playingBoth')}</span>}
      </Button>
      {hearing && (
        <p role="status" className="text-muted-foreground text-xs">
          {t('screens.practice.playingBoth')}
        </p>
      )}
    </div>
  )
}

function PitchDetail({ quality }: { quality: 'ok' | 'empty' | 'low' }) {
  const { t } = useTranslation()
  if (quality === 'empty')
    return (
      <div
        className="bg-muted/40 space-y-1 rounded-md border border-dashed p-4 text-sm"
        data-testid="screen-pitch-empty"
      >
        <p className="font-medium">{t('screens.practice.pitchEmptyTitle')}</p>
        <p className="text-muted-foreground">{t('screens.practice.pitchEmptyBody')}</p>
      </div>
    )
  return (
    <figure className="space-y-2">
      {quality === 'low' && (
        <Alert
          role="status"
          className="border-warning bg-warning-soft text-warning-soft-foreground flex gap-2"
          data-testid="screen-pitch-low"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">{t('screens.practice.pitchLowTitle')}</p>
            <p>{t('screens.practice.pitchLowBody')}</p>
          </div>
        </Alert>
      )}
      <svg
        viewBox="0 0 240 80"
        role="img"
        aria-label={t('screens.practice.pitchSummary')}
        className={cn('bg-card h-28 w-full rounded-md border', quality === 'low' && 'opacity-60')}
      >
        <path
          d="M8 50 C40 20 70 60 100 34 S170 30 232 52"
          fill="none"
          className="stroke-muted-foreground"
          strokeWidth="2"
        />
        <path
          d={
            quality === 'low'
              ? 'M8 56 L30 40 L52 62 L74 36 L96 58 L118 30 L140 54 L162 44 L184 60 L206 38 L232 56'
              : 'M8 56 C40 30 70 62 100 44 S170 38 232 58'
          }
          fill="none"
          className="stroke-primary"
          strokeWidth="2"
          strokeDasharray="4 3"
        />
      </svg>
      <figcaption className="text-muted-foreground flex gap-4 text-xs">
        <span>— {t('result.chartReference')}</span>
        <span>- - {t('result.chartYou')}</span>
      </figcaption>
    </figure>
  )
}

function WordsDetail() {
  const { t } = useTranslation()
  return (
    <ul className="space-y-1 text-sm">
      {WORDS.map(({ w, bad }) => (
        <li key={w} className="flex items-center justify-between rounded-md border px-3 py-1.5">
          <span>{w}</span>
          <span
            className={cn(
              'flex items-center gap-1',
              bad ? 'text-destructive-soft-foreground' : 'text-success-soft-foreground',
            )}
          >
            {bad ? <X className="size-4" /> : <Check className="size-4" />}
            {bad ? t('screens.practice.needsWork') : t('result.chipOk')}
          </span>
        </li>
      ))}
    </ul>
  )
}

function DetailTabs({
  withSummary,
  summary,
  extras,
}: {
  withSummary: boolean
  summary?: React.ReactNode
  extras: PracticeExtras
}) {
  const { t } = useTranslation()
  return (
    <Tabs defaultValue={extras.detailTab ?? (withSummary ? 'summary' : 'phonemes')}>
      <TabsList>
        {withSummary && (
          <TabsTrigger value="summary">{t('screens.practice.tabResult')}</TabsTrigger>
        )}
        <TabsTrigger value="phonemes">{t('screens.practice.tabPhonemes')}</TabsTrigger>
        <TabsTrigger value="pitch">{t('screens.practice.tabPitch')}</TabsTrigger>
        <TabsTrigger value="words">{t('screens.practice.tabWords')}</TabsTrigger>
      </TabsList>
      {withSummary && (
        <TabsContent value="summary" className="pt-4">
          {summary}
        </TabsContent>
      )}
      <TabsContent value="phonemes" className="pt-4">
        <PhonemeDetail view={extras.view ?? 'ipa'} hearing={!!extras.hearing} />
      </TabsContent>
      <TabsContent value="pitch" className="pt-4">
        <PitchDetail quality={extras.pitch ?? 'ok'} />
      </TabsContent>
      <TabsContent value="words" className="pt-4">
        <WordsDetail />
      </TabsContent>
    </Tabs>
  )
}

function ResultSummary({ phase, saved }: { phase: PracticePhase; saved?: boolean }) {
  const { t } = useTranslation()
  if (phase === 'analyzing' || phase === 'transcribing')
    return (
      <div role="status" className="space-y-4" data-testid="screen-loading">
        <p className="text-sm">
          {t(phase === 'transcribing' ? 'practice.transcribing' : 'screens.practice.analyzing')}
        </p>
        <Skeleton className="size-24 rounded-full" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-6 w-1/2" />
        <Button variant="outline" size="sm">
          {t('models.cancel')}
        </Button>
      </div>
    )
  if (phase === 'result')
    return (
      <div className="space-y-5" data-testid="screen-result">
        <div className="flex flex-wrap items-center gap-4">
          <ScoreRing score={84} />
          <div className="flex gap-2">
            <Tile label={t('screens.practice.accuracy')} value={88} />
            <Tile label={t('screens.practice.fluency')} value={79} />
            <Tile label={t('screens.practice.prosody')} value={80} />
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          {t('result.verdict', { flagged: 2, total: 5 })}
        </p>
        <ResultWords />
        <p className="bg-info-soft text-info-soft-foreground rounded-md p-3 text-sm">
          {t('screens.practice.tip')}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm">
            <RotateCcw />
            {t('practice.retry')}
          </Button>
          <Button size="sm" variant="outline">
            {t('screens.practice.editText')}
          </Button>
          <Button size="sm" variant="outline">
            {t('result.replay')}
          </Button>
          <Button size="sm" variant="outline" disabled={saved} data-testid="screen-save">
            {saved ? <Check /> : <Bookmark />}
            {t(saved ? 'screens.practice.saved' : 'screens.practice.save')}
          </Button>
        </div>
        {saved && (
          <p
            role="status"
            className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm"
          >
            {t('screens.practice.savedNote')}
            <Button variant="link" size="xs" className="px-0">
              {t('screens.practice.viewHistory')}
            </Button>
          </p>
        )}
      </div>
    )
  return (
    <p className="text-muted-foreground flex h-full min-h-40 items-center justify-center text-center text-sm">
      {t('screens.practice.emptyResult')}
    </p>
  )
}

function ErrorAlert({ phase }: { phase: PracticePhase }) {
  const { t } = useTranslation()
  if (phase === 'error-mic')
    return (
      <Alert className="border-destructive space-y-2" data-testid="screen-error">
        <p className="flex items-center gap-2 font-medium">
          <MicOff className="size-4" />
          {t('audio.mic.denied.title')}
        </p>
        <p className="text-muted-foreground">{t('audio.mic.denied.macos')}</p>
        <Button size="sm" variant="outline">
          {t('screens.practice.openSettings')}
        </Button>
      </Alert>
    )
  if (phase === 'error-model')
    return (
      <Alert className="border-warning space-y-2" data-testid="screen-error">
        <p className="flex items-center gap-2 font-medium">
          <AlertTriangle className="size-4" />
          {t('practice.error.modelMissing')}
        </p>
        <Button size="sm">
          <Download />
          {t('practice.downloadModels')}
        </Button>
      </Alert>
    )
  if (phase === 'error-failed')
    return (
      <Alert className="border-destructive space-y-2" data-testid="screen-error">
        <p className="flex items-center gap-2 font-medium">
          <AlertTriangle className="size-4" />
          {t('practice.error.failed')}
        </p>
        <p className="text-muted-foreground">{t('screens.practice.keptAudio')}</p>
        <Button size="sm">
          <RotateCcw />
          {t('practice.retry')}
        </Button>
      </Alert>
    )
  return null
}

function HistoryList({ mode, state }: { mode: PracticeMode; state: 'closed' | 'list' | 'empty' }) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(state !== 'closed')
  const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' })
  const when = (h: number) =>
    Math.abs(h) < 24 ? rtf.format(h, 'hour') : rtf.format(Math.round(h / 24), 'day')
  const id = `screen-history-${mode}`
  return (
    <div className="space-y-2" data-testid="screen-history">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-primary-soft focus-visible:ring-ring/50 flex w-full items-center gap-1 rounded-md px-1 py-1 text-left text-sm font-medium focus-visible:ring-[3px] focus-visible:outline-none"
      >
        <ChevronRight
          className={cn('size-4 shrink-0 transition-transform', open && 'rotate-90')}
          aria-hidden="true"
        />
        {t('screens.practice.historyTitle')}
      </button>
      <div id={id} hidden={!open}>
        {state === 'empty' ? (
          <p className="text-muted-foreground px-1 text-sm">{t('screens.practice.historyEmpty')}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {HISTORY[mode].map(([text, score, hours, saved]) => (
              <li key={text}>
                <button
                  type="button"
                  className="hover:bg-primary-soft focus-visible:ring-ring/50 flex w-full items-center gap-2 px-3 py-2 text-left focus-visible:ring-[3px] focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{text}</span>
                    <span className="text-muted-foreground block text-xs">{when(hours)}</span>
                  </span>
                  {saved && (
                    <Bookmark
                      className="text-muted-foreground size-3.5 shrink-0"
                      aria-label={t('screens.practice.historySaved')}
                    />
                  )}
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{score}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function InputPane({
  mode,
  phase,
  history,
}: {
  mode: PracticeMode
  phase: PracticePhase
  history?: 'closed' | 'list' | 'empty'
}) {
  const { t } = useTranslation()
  const free = mode === 'free'
  const recording = phase === 'recording'
  const busy = phase === 'transcribing' || phase === 'analyzing'
  const hasAudio = !['idle', 'recording', 'empty-hint', 'error-mic'].includes(phase)
  const text = free
    ? phase === 'check' || phase === 'analyzing' || phase === 'result'
      ? FREE_TEXT
      : ''
    : phase === 'idle' || phase === 'recording' || phase === 'error-mic'
      ? ''
      : READ_TEXT
  const emptyHint = phase === 'empty-hint'
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={`screen-text-${mode}`} className="text-sm font-medium">
          {free && text
            ? t('result.weHeard')
            : t(free ? 'screens.practice.speakLabel' : 'screens.practice.readLabel')}
        </label>
        <Textarea
          id={`screen-text-${mode}`}
          readOnly
          rows={4}
          value={text}
          disabled={busy || recording || (free && !text)}
          aria-invalid={emptyHint}
          placeholder={t(free ? 'practice.freePlaceholder' : 'practice.placeholder')}
        />
        {emptyHint && (
          <p role="alert" className="text-destructive text-sm">
            {t('practice.emptyHint')}
          </p>
        )}
        {free && phase === 'check' && (
          <p className="text-muted-foreground text-xs">{t('practice.transcriptNote')}</p>
        )}
        {!free && !text && !emptyHint && (
          <div className="flex flex-wrap gap-2 pt-1">
            {['The thorough thought', 'She sells seashells'].map((ex) => (
              <Button key={ex} variant="outline" size="xs">
                {ex}
              </Button>
            ))}
          </div>
        )}
      </div>
      <Recorder
        state={recording ? 'recording' : busy ? 'processing' : 'idle'}
        level={0.6}
        onStart={() => undefined}
        onStop={() => undefined}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={recording || busy}>
          <Upload />
          {t('audio.import')}
        </Button>
        {!free && (
          <Button variant="outline" size="sm">
            <Volume2 />
            {t('result.hearIt')}
          </Button>
        )}
        {recording && (
          <span className="text-muted-foreground text-sm tabular-nums" aria-live="off">
            00:03
          </span>
        )}
      </div>
      {free && phase === 'check' && <Button>{t('screens.practice.check')}</Button>}
      {hasAudio && !busy && phase !== 'check' && (
        <Button variant="outline" size="sm">
          {t('practice.review', { time: '0:03' })}
        </Button>
      )}
      <ErrorAlert phase={phase} />
      {history && <HistoryList mode={mode} state={history} />}
    </div>
  )
}

function ConfirmSwitch({ to }: { to: PracticeMode }) {
  const { t } = useTranslation()
  return (
    <div className="bg-background/70 absolute inset-0 flex items-center justify-center p-4 backdrop-blur-[1px]">
      <section
        aria-labelledby="switch-title"
        className="bg-card w-120 max-w-full space-y-4 rounded-xl border p-6 shadow-lg"
        data-testid="screen-switch-confirm"
      >
        <h3 id="switch-title" className="text-lg font-semibold">
          {t('screens.practice.switchTitle', { tab: t(`screens.practice.mode.${to}`) })}
        </h3>
        <p className="text-muted-foreground text-sm">{t('screens.practice.switchBody')}</p>
        <footer className="flex flex-wrap justify-end gap-2">
          <Button>{t('screens.practice.switchStay')}</Button>
          <Button variant="outline">{t('screens.practice.switchDiscard')}</Button>
        </footer>
      </section>
    </div>
  )
}

/** Practice screen (IA doc §3): input · result · detail; detail folds into tabs below 1440. */
export function PracticeScreen({
  width,
  mode,
  phase,
  extras = {},
}: {
  width: number
  mode: PracticeMode
  phase: PracticePhase
  extras?: PracticeExtras
}) {
  const { t } = useTranslation()
  const layout: Layout = layoutOf(width)
  const result = phase === 'result'
  const other: PracticeMode = mode === 'free' ? 'read' : 'free'
  const otherName = t(`screens.practice.mode.${other}`)
  return (
    <div className="relative h-full">
      <AppShell
        layout={layout}
        active="practice"
        title={t('screens.shell.practice')}
        actions={
          <div
            role="tablist"
            aria-label={t('practice.mode.label')}
            className="bg-muted flex rounded-lg p-0.5"
          >
            {(['free', 'read'] as const).map((m) => (
              <span
                key={m}
                role="tab"
                aria-selected={m === mode}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1 text-sm',
                  m === mode ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground',
                )}
              >
                {t(`screens.practice.mode.${m}`)}
                {extras.tabs === 'draft' && m === other && (
                  <>
                    <span aria-hidden="true" className="bg-primary size-1.5 rounded-full" />
                    <span className="sr-only">{t('screens.practice.draftDot')}</span>
                  </>
                )}
              </span>
            ))}
          </div>
        }
      >
        <div className="flex h-full flex-col">
          <p className="text-muted-foreground shrink-0 px-4 py-2 text-sm">
            {t(`screens.practice.helper.${mode}`)}
            {extras.tabs === 'draft' && (
              <span className="text-foreground ml-2 font-medium" data-testid="screen-draft-kept">
                {t('screens.practice.draftKept', { tab: otherName })}
              </span>
            )}
          </p>
          <div
            className={cn(
              'grid min-h-0 flex-1 divide-x border-t',
              layout === 'wide' ? 'grid-cols-[340px_1fr_380px]' : 'grid-cols-[320px_1fr]',
            )}
          >
            <Pane title={t('screens.practice.input')}>
              <InputPane mode={mode} phase={phase} history={extras.history} />
            </Pane>
            {layout === 'wide' ? (
              <>
                <Pane title={t('screens.practice.result')}>
                  <ResultSummary phase={phase} saved={extras.saved} />
                </Pane>
                <Pane title={t('screens.practice.detail')}>
                  {result ? (
                    <DetailTabs withSummary={false} extras={extras} />
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      {t('screens.practice.emptyDetail')}
                    </p>
                  )}
                </Pane>
              </>
            ) : (
              <Pane title={t('screens.practice.result')}>
                {result ? (
                  <DetailTabs
                    withSummary
                    summary={<ResultSummary phase={phase} saved={extras.saved} />}
                    extras={extras}
                  />
                ) : (
                  <ResultSummary phase={phase} />
                )}
              </Pane>
            )}
          </div>
        </div>
      </AppShell>
      {extras.tabs === 'confirm' && <ConfirmSwitch to={other} />}
    </div>
  )
}
