import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePrefersReducedMotion } from '@/lib/motion'
import { countUp, scoreTone } from '@/lib/result'
import { cn } from '@/lib/utils'

const RADIUS = 52
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const TONE = {
  good: 'stroke-score-high',
  ok: 'stroke-score-mid',
  poor: 'stroke-score-low',
} as const

/** Circular 0-100 score. Counts up on mount unless the OS asks for reduced motion. */
export function ScoreRing({
  score,
  className,
  animate = true,
}: {
  score: number
  className?: string
  animate?: boolean
}) {
  const { t } = useTranslation()
  const reduced = usePrefersReducedMotion()
  const still = !animate || reduced
  const [shown, setShown] = useState(still ? score : 0)
  useEffect(() => {
    if (still) return setShown(score)
    const start = performance.now()
    let raf = 0
    const tick = (now: number): void => {
      const v = countUp(score, now - start)
      setShown(v)
      if (v < Math.min(100, score)) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [score, still])
  return (
    <div
      className={cn('relative size-32 shrink-0', className)}
      data-testid="result-ring"
      role="img"
      aria-label={t('ds.scoreRing', { score: Math.round(score) })}
    >
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={RADIUS} fill="none" strokeWidth="10" className="stroke-muted" />
        <circle
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          className={TONE[scoreTone(score)]}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - shown / 100)}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-3xl font-semibold"
        data-testid="result-score"
        data-score={Math.round(score)}
        aria-hidden="true"
      >
        {Math.round(shown)}
      </span>
    </div>
  )
}
