import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { IntonationResult } from '@engclaw/ipc-contract'
import { Alert } from '@/components/ui/alert'
import { domainOf, gapPath } from '@/lib/charts'
import type { IntonationState } from '@/lib/intonation'

const W = 300
const H = 90

/** Reference vs attempt pitch (semitones from each speaker's median) on the reference timeline. */
export function IntonationChart({ chart }: { chart: IntonationResult['chart'] }) {
  const { t } = useTranslation()
  const nums = (v: (number | null)[]) => v.filter((x): x is number => x !== null)
  const domain = domainOf(nums(chart.reference), nums(chart.user))
  const title = t('screens.shadowing.attempt.chartTitle')
  return (
    <figure className="space-y-1" data-testid="shadowing-intonation-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={title}
        preserveAspectRatio="none"
        className="bg-muted/30 h-24 w-full rounded"
      >
        <path
          d={gapPath(chart.reference, W, H, domain)}
          data-line="reference"
          fill="none"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          className="stroke-muted-foreground"
        />
        <path
          d={gapPath(chart.user, W, H, domain)}
          data-line="you"
          fill="none"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          className="stroke-primary"
        />
      </svg>
      <figcaption className="flex gap-3 text-xs">
        <span className="text-muted-foreground flex items-center gap-1">
          <i className="inline-block h-0.5 w-3 bg-current" />
          {t('screens.shadowing.attempt.chartReference')}
        </span>
        <span className="text-primary flex items-center gap-1">
          <i className="inline-block h-0.5 w-3 bg-current" />
          {t('screens.shadowing.attempt.chartYou')}
        </span>
      </figcaption>
    </figure>
  )
}

const pct = (x: number) => `${Math.round(Math.max(0, Math.min(1, x)) * 100)}%`

export function IntonationBody({ state }: { state: IntonationState | null }) {
  const { t } = useTranslation()
  if (!state || state.status === 'loading')
    return (
      <p
        role="status"
        className="text-muted-foreground flex items-center gap-2 text-sm"
        data-testid="shadowing-intonation-loading"
      >
        <Loader2 className="size-4 animate-spin" />
        {t('screens.shadowing.attempt.fluencyLoading')}
      </p>
    )
  if (state.status === 'failed')
    return (
      <p
        role="alert"
        className="text-muted-foreground text-sm"
        data-testid="shadowing-intonation-failed"
      >
        {t('screens.shadowing.attempt.fluencyFailed')}
      </p>
    )
  const r = state.result
  return (
    <div className="space-y-3" data-testid="shadowing-intonation">
      {state.fallback && (
        <Alert data-testid="shadowing-intonation-fallback" className="text-sm">
          {t('screens.shadowing.attempt.fallbackNotice')}
        </Alert>
      )}
      <p className="text-2xl font-semibold tabular-nums" data-testid="shadowing-fluency-score">
        {Math.round(r.score)}
        <span className="text-muted-foreground text-sm font-normal"> / 100</span>
      </p>
      <IntonationChart chart={r.chart} />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
        {(
          [
            ['metricContour', pct(r.correlation)],
            ['metricRange', pct(r.rangeRatio)],
            ['metricRhythm', pct(r.rhythm)],
            ['metricPauses', pct(r.pause)],
          ] as const
        ).map(([key, value]) => (
          <div key={key} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{t(`screens.shadowing.attempt.${key}`)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
