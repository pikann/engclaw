import { Loader2, Mic, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PronunciationResult } from '@engclaw/ipc-contract'
import {
  PhonemesDetail,
  PitchDetail,
  ResultSummary,
  useResultView,
  WordsDetail,
} from '@/components/practice-result'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { firstFlagged } from '@/lib/result'
import { cn } from '@/lib/utils'
import { accuracyScore, type IntonationState } from '@/lib/intonation'
import type { AttemptState } from '@/lib/use-segment-attempt'
import { IntonationBody } from './intonation-section'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card space-y-3 rounded-xl border border-input p-4">
      <h3 className="text-base font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function FullResult({
  result,
  text,
  intonation,
  onPlay,
  onRetry,
}: {
  result: PronunciationResult
  text: string
  intonation: IntonationState | null
  onPlay: () => void
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const view = useResultView(result, text)
  const [selected, setSelected] = useState<number | null>(() => firstFlagged(view.chips))
  useEffect(() => {
    setSelected(firstFlagged(view.chips))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when a new result arrives
  }, [result])
  return (
    <div className="space-y-4" data-testid="shadowing-attempt-result">
      <ResultSummary
        result={result}
        view={view}
        selected={selected}
        saved={false}
        onSelect={setSelected}
        onTryAgain={onRetry}
        onReplay={onPlay}
      />
      <Section title={t('screens.shadowing.attempt.accuracy')}>
        <p className="text-2xl font-semibold tabular-nums" data-testid="shadowing-accuracy-score">
          {accuracyScore(result.differences.word_error_rate)}
          <span className="text-muted-foreground text-sm font-normal"> / 100</span>
        </p>
        <p className="text-muted-foreground text-sm">
          {t('screens.shadowing.attempt.detected')}{' '}
          <span className="text-foreground" data-testid="shadowing-detected">
            {result.differences.transcribe.toLowerCase() || '…'}
          </span>
        </p>
      </Section>
      <Section title={t('screens.practice.tabWords')}>
        <WordsDetail view={view} selected={selected} onSelect={setSelected} />
      </Section>
      <Section title={t('screens.practice.tabPhonemes')}>
        <PhonemesDetail result={result} view={view} />
      </Section>
      <Section title={t('screens.shadowing.attempt.fluency')}>
        <IntonationBody state={intonation} />
      </Section>
      <Section title={t('screens.practice.tabPitch')}>
        <PitchDetail result={result} />
      </Section>
    </div>
  )
}

/** Sidebar tab: record at the shown sentence and read the full pronunciation result. */
export function AttemptPanel({
  state,
  intonation,
  text,
  best,
  disabled,
  onToggleRecord,
  onPlay,
  onRetry,
}: {
  state: AttemptState
  intonation: IntonationState | null
  text: string
  best: number | null
  disabled: boolean
  onToggleRecord: () => void
  onPlay: () => void
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const recording = state.phase === 'recording'
  const analyzing = state.phase === 'analyzing'
  return (
    <div
      className={cn(
        'min-h-full space-y-4',
        state.phase !== 'result' && 'flex flex-col justify-center',
      )}
      data-testid="shadowing-attempt"
      data-phase={state.phase}
    >
      {state.phase !== 'result' && (
        <div className="flex flex-col items-center gap-2 py-2">
          <Button
            variant={recording ? 'live' : 'default'}
            disabled={disabled || analyzing}
            aria-pressed={recording}
            aria-label={t(
              analyzing
                ? 'screens.shadowing.attempt.analyzing'
                : recording
                  ? 'screens.shadowing.attempt.stop'
                  : 'screens.shadowing.attempt.record',
            )}
            data-testid="shadowing-attempt-record"
            onClick={onToggleRecord}
            className="size-16 rounded-full shadow-md [&_svg:not([class*='size-'])]:size-7"
          >
            {analyzing ? <Loader2 className="animate-spin" /> : recording ? <Square /> : <Mic />}
          </Button>
          <p role="status" className="text-muted-foreground text-center text-sm">
            {t(
              analyzing
                ? 'screens.shadowing.attempt.analyzing'
                : recording
                  ? 'screens.shadowing.attempt.stop'
                  : 'screens.shadowing.attempt.idle',
            )}
          </p>
          {best !== null && state.phase === 'idle' && (
            <p className="text-muted-foreground text-sm tabular-nums">
              {t('screens.shadowing.attempt.best', { score: Math.round(best) })}
            </p>
          )}
        </div>
      )}
      {state.phase === 'error' && (
        <Alert className="border-destructive space-y-2">
          <p role="alert" data-testid="shadowing-attempt-error" className="font-medium">
            {t(
              state.kind === 'mic'
                ? 'screens.shadowing.attempt.mic'
                : state.kind === 'model'
                  ? 'screens.shadowing.attempt.missing'
                  : 'screens.shadowing.attempt.failed',
            )}
          </p>
          <Button size="sm" variant="outline" onClick={onRetry}>
            {t('practice.retry')}
          </Button>
        </Alert>
      )}
      {state.phase === 'result' && (
        <FullResult
          result={state.result}
          text={text}
          intonation={intonation}
          onPlay={onPlay}
          onRetry={onRetry}
        />
      )}
    </div>
  )
}
