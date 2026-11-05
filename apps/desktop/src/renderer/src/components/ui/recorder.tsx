import { Loader2, Mic, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type RecorderState = 'idle' | 'recording' | 'processing'

/**
 * Record / stop control with a live level meter. The state change is announced through
 * the button label; the meter is decorative.
 */
export function Recorder({
  state,
  level = 0,
  onStart,
  onStop,
  disabled,
  className,
  startTestId = 'recorder-start',
  stopTestId = 'recorder-stop',
  processingLabel,
  timer,
}: {
  state: RecorderState
  /** Input level 0..1. */
  level?: number
  onStart: () => void
  onStop: () => void
  disabled?: boolean
  className?: string
  startTestId?: string
  stopTestId?: string
  /** Replaces the default "Analysing…" while the state is `processing`. */
  processingLabel?: string
  /** Elapsed time shown beside the meter while recording. */
  timer?: string
}) {
  const { t } = useTranslation()
  const recording = state === 'recording'
  const processing = state === 'processing'
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Button
        size="lg"
        variant={recording ? 'live' : 'default'}
        disabled={disabled || processing}
        onClick={recording ? onStop : onStart}
        data-testid={recording ? stopTestId : startTestId}
      >
        {processing ? <Loader2 className="animate-spin" /> : recording ? <Square /> : <Mic />}
        {processing
          ? (processingLabel ?? t('ds.recorder.processing'))
          : recording
            ? t('ds.recorder.stop')
            : t('ds.recorder.start')}
      </Button>
      <div
        aria-hidden="true"
        className="bg-muted h-2 w-32 overflow-hidden rounded-full"
        data-testid="recorder-level"
      >
        <div
          className="bg-accent h-full origin-left transition-transform duration-(--duration-fast)"
          style={{ transform: `scaleX(${recording ? Math.min(1, Math.max(0, level)) : 0})` }}
        />
      </div>
      {recording && timer && (
        <span className="text-muted-foreground text-sm tabular-nums" data-testid="recorder-timer">
          {timer}
        </span>
      )}
    </div>
  )
}
