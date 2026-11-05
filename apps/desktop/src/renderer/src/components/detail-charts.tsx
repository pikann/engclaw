import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { PronunciationResult } from '@engclaw/ipc-contract'
import { detailSeries, domainOf, linePath } from '@/lib/charts'

const W = 300
const H = 80

function Chart({
  testId,
  title,
  lines,
}: {
  testId: string
  title: string
  lines: { label: string; values: number[]; className: string }[]
}) {
  const domain = domainOf(...lines.map((l) => l.values))
  const empty = lines.every((l) => !l.values.length)
  return (
    <figure className="space-y-1" data-testid={testId}>
      <figcaption className="text-muted-foreground text-xs font-medium">{title}</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={title}
        preserveAspectRatio="none"
        className="bg-muted/30 h-20 w-full rounded"
      >
        {lines.map((l) => (
          <path
            key={l.label}
            d={linePath(l.values, W, H, domain)}
            data-line={l.label}
            fill="none"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            className={l.className}
          />
        ))}
      </svg>
      {lines.length > 1 && !empty && (
        <p className="flex gap-3 text-xs">
          {lines.map((l) => (
            <span key={l.label} className="flex items-center gap-1">
              <i
                className={`inline-block h-0.5 w-3 bg-current ${l.className.replace('stroke-', 'text-')}`}
              />
              {l.label}
            </span>
          ))}
        </p>
      )}
    </figure>
  )
}

/** Collapsible "Details": phoneme DTW trace, pitch (F0) and energy. */
export function DetailCharts({ result }: { result: PronunciationResult }) {
  const { t } = useTranslation()
  const s = useMemo(() => detailSeries(result), [result])
  return (
    <details className="rounded-md border p-3" data-testid="result-details">
      <summary className="cursor-pointer text-sm font-medium">{t('result.details')}</summary>
      <div className="mt-3 space-y-4">
        <Chart
          testId="chart-phoneme"
          title={t('result.chartPhoneme')}
          lines={[
            {
              label: t('result.chartReference'),
              values: s.phoneme.reference,
              className: 'stroke-muted-foreground',
            },
            { label: t('result.chartYou'), values: s.phoneme.you, className: 'stroke-primary' },
          ]}
        />
        <Chart
          testId="chart-f0"
          title={t('result.chartF0')}
          lines={[{ label: 'F0', values: s.f0, className: 'stroke-primary' }]}
        />
        <Chart
          testId="chart-energy"
          title={t('result.chartEnergy')}
          lines={[{ label: 'Energy', values: s.energy, className: 'stroke-primary' }]}
        />
      </div>
    </details>
  )
}
