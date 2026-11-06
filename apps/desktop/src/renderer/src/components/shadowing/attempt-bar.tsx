import { Check, Loader2, Mic, Pause, Play, RotateCcw, Square, X } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { type AttemptState } from '@/lib/use-segment-attempt'
import { scoreTone, verdictOf, wordChips } from '@/lib/result'
import { cn } from '@/lib/utils'

/** Height reserved under the controls so a finished check never moves the video or sentence. */
export const ATTEMPT_RESULT_HEIGHT = 40

export function AttemptRecordButton({
  state,
  disabled,
  onToggle,
}: {
  state: AttemptState
  disabled: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const recording = state.phase === 'recording'
  const analyzing = state.phase === 'analyzing'
  return (
    <Button
      variant={recording ? 'live' : 'outline'}
      size="sm"
      data-testid="shadowing-record"
      aria-keyshortcuts="M"
      aria-pressed={recording}
      disabled={disabled || analyzing}
      onClick={onToggle}
    >
      {analyzing ? <Loader2 className="animate-spin" /> : recording ? <Square /> : <Mic />}
      {t(
        analyzing
          ? 'screens.shadowing.attempt.analyzing'
          : recording
            ? 'screens.shadowing.attempt.stop'
            : 'screens.shadowing.attempt.record',
      )}
    </Button>
  )
}

/** Score and per-word chips of the attempt at the shown sentence. */
export function AttemptResult({
  state,
  text,
  best,
  isPlaying,
  onPlay,
  onRetry,
}: {
  state: AttemptState
  text: string
  best: number | null
  isPlaying: boolean
  onPlay: () => void
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const result = state.phase === 'result' ? state.result : null
  const chips = useMemo(() => (result ? wordChips(result, text) : []), [result, text])

  return (
    <div
      role="status"
      data-testid="shadowing-attempt"
      data-phase={state.phase}
      className="flex w-full shrink-0 items-center justify-center gap-2 overflow-y-auto text-sm"
      style={{ height: ATTEMPT_RESULT_HEIGHT }}
    >
      {result ? (
        <>
          <Badge
            data-testid="shadowing-attempt-score"
            variant={scoreTone(result.score) === 'poor' ? 'destructive' : 'secondary'}
            className="shrink-0 tabular-nums"
          >
            {t('screens.shadowing.attempt.score', { score: Math.round(result.score) })}
          </Badge>
          {best !== null && best > result.score && (
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {t('screens.shadowing.attempt.best', { score: Math.round(best) })}
            </span>
          )}
          <ul className="flex min-w-0 flex-wrap items-center justify-center gap-1">
            {chips.map((c) => (
              <li
                key={c.position}
                data-testid="shadowing-word-chip"
                data-flagged={c.error ? 'true' : 'false'}
                className={cn(
                  'flex items-center gap-0.5 rounded-md px-1.5 py-0.5',
                  c.error
                    ? 'bg-destructive-soft text-destructive-soft-foreground'
                    : 'bg-success-soft text-success-soft-foreground',
                )}
              >
                {c.error ? (
                  <X
                    className="size-3.5"
                    aria-label={t('screens.shadowing.attempt.wordBad', { word: c.word })}
                  />
                ) : (
                  <Check
                    className="size-3.5"
                    aria-label={t('screens.shadowing.attempt.wordOk', { word: c.word })}
                  />
                )}
                {c.word}
              </li>
            ))}
          </ul>
          <span className="sr-only">
            {verdictOf(chips).flagged > 0
              ? t('screens.shadowing.attempt.flagged', { count: verdictOf(chips).flagged })
              : t('screens.shadowing.attempt.allGood')}
          </span>
          <Button
            variant="ghost"
            size="icon"
            data-testid="shadowing-attempt-play"
            aria-label={t('screens.shadowing.attempt.play')}
            onClick={onPlay}
          >
            {isPlaying ? <Pause /> : <Play />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            data-testid="shadowing-attempt-again"
            aria-label={t('screens.shadowing.attempt.again')}
            onClick={onRetry}
          >
            <RotateCcw />
          </Button>
        </>
      ) : state.phase === 'error' ? (
        <>
          <span data-testid="shadowing-attempt-error" role="alert">
            {t(
              state.kind === 'mic'
                ? 'screens.shadowing.attempt.mic'
                : state.kind === 'model'
                  ? 'screens.shadowing.attempt.missing'
                  : 'screens.shadowing.attempt.failed',
            )}
          </span>
          <Button size="sm" variant="outline" onClick={onRetry}>
            {t('practice.retry')}
          </Button>
        </>
      ) : best !== null && state.phase === 'idle' ? (
        <span className="text-muted-foreground tabular-nums">
          {t('screens.shadowing.attempt.best', { score: Math.round(best) })}
        </span>
      ) : null}
    </div>
  )
}
