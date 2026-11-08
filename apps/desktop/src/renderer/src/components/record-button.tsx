import { Mic, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

/** One big round record / stop button: a single focusable element, so Space toggles it in place. */
export function RecordButton({
  recording,
  level,
  timer,
  disabled,
  startTestId = 'practice-record',
  stopTestId = 'practice-stop',
  onStart,
  onStop,
}: {
  recording: boolean
  level: number
  timer: string
  disabled: boolean
  startTestId?: string
  stopTestId?: string
  onStart: () => void
  onStop: () => void
}) {
  const { t } = useTranslation()
  const label = t(recording ? 'ds.recorder.stop' : 'ds.recorder.start')
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="relative">
        {recording && (
          <span
            aria-hidden="true"
            data-testid="recorder-level"
            className="bg-accent/25 absolute inset-0 rounded-full transition-transform duration-100"
            style={{ transform: `scale(${1 + Math.min(1, level) * 0.7})` }}
          />
        )}
        <Button
          variant={recording ? 'live' : 'default'}
          disabled={disabled}
          aria-label={label}
          data-testid={recording ? stopTestId : startTestId}
          onClick={recording ? onStop : onStart}
          className="relative size-20 rounded-full shadow-md [&_svg:not([class*='size-'])]:size-8"
        >
          {recording ? <Square /> : <Mic />}
        </Button>
      </div>
      <p
        className="text-muted-foreground text-sm font-medium tabular-nums"
        data-testid={recording ? 'recorder-timer' : undefined}
      >
        {recording ? timer : label}
      </p>
    </div>
  )
}
