import { AlertTriangle, Check, Download, MicOff, RotateCcw, Upload, Volume2, X } from 'lucide-react'
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

const READ_TEXT = 'The thorough thought went through.'
const FREE_TEXT = 'I go to the market yesterday'

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

function PhonemeDetail() {
  const { t } = useTranslation()
  const ph = [
    ['ð', false],
    ['ə', false],
    ['θ', true],
    ['ʌ', false],
    ['r', false],
    ['ə', false],
  ] as const
  return (
    <div className="space-y-3">
      <p className="font-mono text-xl" lang="en-fonipa">
        {ph.map(([p, bad], i) => (
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
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t('result.expected')}</dt>
        <dd className="font-mono">θ</dd>
        <dt className="text-muted-foreground">{t('result.heard')}</dt>
        <dd className="font-mono">s</dd>
      </dl>
      <Button variant="outline" size="sm">
        <Volume2 />
        {t('screens.practice.hearBoth')}
      </Button>
    </div>
  )
}

function PitchDetail() {
  const { t } = useTranslation()
  return (
    <figure className="space-y-2">
      <svg
        viewBox="0 0 240 80"
        role="img"
        aria-label={t('screens.practice.pitchSummary')}
        className="bg-card h-28 w-full rounded-md border"
      >
        <path
          d="M8 50 C40 20 70 60 100 34 S170 30 232 52"
          fill="none"
          className="stroke-muted-foreground"
          strokeWidth="2"
        />
        <path
          d="M8 56 C40 30 70 62 100 44 S170 38 232 58"
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

function DetailTabs({ withSummary, summary }: { withSummary: boolean; summary?: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <Tabs defaultValue={withSummary ? 'summary' : 'phonemes'}>
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
        <PhonemeDetail />
      </TabsContent>
      <TabsContent value="pitch" className="pt-4">
        <PitchDetail />
      </TabsContent>
      <TabsContent value="words" className="pt-4">
        <WordsDetail />
      </TabsContent>
    </Tabs>
  )
}

function ResultSummary({ phase }: { phase: PracticePhase }) {
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
        </div>
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

function InputPane({ mode, phase }: { mode: PracticeMode; phase: PracticePhase }) {
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
    </div>
  )
}

/** Practice screen (IA doc §3): input · result · detail; detail folds into tabs below 1440. */
export function PracticeScreen({
  width,
  mode,
  phase,
}: {
  width: number
  mode: PracticeMode
  phase: PracticePhase
}) {
  const { t } = useTranslation()
  const layout: Layout = layoutOf(width)
  const result = phase === 'result'
  return (
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
                'rounded-md px-3 py-1 text-sm',
                m === mode ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground',
              )}
            >
              {t(`screens.practice.mode.${m}`)}
            </span>
          ))}
        </div>
      }
    >
      <div className="flex h-full flex-col">
        <p className="text-muted-foreground shrink-0 px-4 py-2 text-sm">
          {t(`screens.practice.helper.${mode}`)}
        </p>
        <div
          className={cn(
            'grid min-h-0 flex-1 divide-x border-t',
            layout === 'wide' ? 'grid-cols-[340px_1fr_380px]' : 'grid-cols-[320px_1fr]',
          )}
        >
          <Pane title={t('screens.practice.input')}>
            <InputPane mode={mode} phase={phase} />
          </Pane>
          {layout === 'wide' ? (
            <>
              <Pane title={t('screens.practice.result')}>
                <ResultSummary phase={phase} />
              </Pane>
              <Pane title={t('screens.practice.detail')}>
                {result ? (
                  <DetailTabs withSummary={false} />
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
                <DetailTabs withSummary summary={<ResultSummary phase={phase} />} />
              ) : (
                <ResultSummary phase={phase} />
              )}
            </Pane>
          )}
        </div>
      </div>
    </AppShell>
  )
}
