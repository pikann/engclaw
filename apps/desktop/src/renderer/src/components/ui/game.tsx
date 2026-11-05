import { Check, Lock, Play, Sparkles, Star, Trophy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePrefersReducedMotion } from '@/lib/motion'
import {
  attemptSlots,
  clampStars,
  MAX_STARS,
  starStates,
  type AttemptSlot,
  type NodeState,
} from '@/lib/game'
import { cn } from '@/lib/utils'

/** 0-3 stars. Text alternative says "N of 3 stars"; `reveal` plays a staggered pop unless reduced motion. */
export function StarRating({
  stars,
  reveal = false,
  size = 'md',
  className,
}: {
  stars: number
  reveal?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const { t } = useTranslation()
  const reduced = usePrefersReducedMotion()
  const n = clampStars(stars)
  const px = { sm: 'size-4', md: 'size-6', lg: 'size-10' }[size]
  return (
    <span
      role="img"
      aria-label={t('ds.game.stars', { count: n, max: MAX_STARS })}
      className={cn('inline-flex items-center gap-1', className)}
      data-stars={n}
    >
      {starStates(n).map((s, i) => (
        <Star
          key={i}
          aria-hidden="true"
          data-state={s}
          className={cn(
            px,
            s === 'filled'
              ? 'fill-star-filled stroke-star-stroke'
              : 'stroke-star-empty fill-transparent',
            s === 'filled' && reveal && !reduced && 'animate-star-pop',
          )}
          style={
            s === 'filled' && reveal && !reduced ? { animationDelay: `${i * 180}ms` } : undefined
          }
        />
      ))}
    </span>
  )
}

const NODE_ICON = { locked: Lock, current: Play, passed: Check } as const

/** Chapter node on the level map. Locked nodes are disabled; state is icon + text alternative. */
export function ChapterNode({
  index,
  title,
  state,
  stars,
  onSelect,
}: {
  index: number
  title: string
  state: NodeState
  stars: number
  onSelect?: () => void
}) {
  const { t } = useTranslation()
  const Icon = NODE_ICON[state]
  return (
    <button
      type="button"
      disabled={state === 'locked'}
      onClick={onSelect}
      data-state={state}
      aria-label={t(`ds.game.node.${state}`, {
        index,
        title,
        count: clampStars(stars),
        max: MAX_STARS,
      })}
      className={cn(
        'flex w-40 flex-col items-center gap-2 rounded-xl border-2 p-3 text-center transition-colors',
        state === 'passed' && 'border-success bg-success-soft text-success-soft-foreground',
        state === 'current' && 'border-primary bg-card text-card-foreground',
        state === 'locked' && 'border-node-locked bg-muted text-muted-foreground border-dashed',
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full border-2 border-current">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <span className="text-sm font-semibold" aria-hidden="true">
        {index}. {title}
      </span>
      {state !== 'locked' && <StarRating stars={stars} size="sm" />}
    </button>
  )
}

/** Connector between two chapter nodes; solid once the earlier node is passed. */
export function PathConnector({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-done={done || undefined}
      className={cn(
        'block h-6 w-0.5 self-center',
        done ? 'bg-success' : 'border-node-locked border-l-2 border-dashed',
      )}
    />
  )
}

export function WorldHeader({ name, subtitle }: { name: string; subtitle?: string }) {
  return (
    <header className="space-y-0.5">
      <h2 className="text-xl font-semibold">{name}</h2>
      {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
    </header>
  )
}

export function ProgressSummary({
  earned,
  total,
  passed,
  chapters,
}: {
  earned: number
  total: number
  passed: number
  chapters: number
}) {
  const { t } = useTranslation()
  const pct = total ? Math.round((earned / total) * 100) : 0
  return (
    <div className="space-y-1.5" data-testid="progress-summary">
      <p className="text-sm">{t('ds.game.progress', { passed, chapters, earned, total })}</p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={t('ds.game.progressLabel')}
        className="bg-muted h-2 overflow-hidden rounded-full"
      >
        <div className="bg-primary h-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** Five attempt slots. `filled-pulse` is the slot being worked on; it does not pulse for reduced motion. */
export function AttemptTracker({ correct, active }: { correct: number; active: boolean }) {
  const { t } = useTranslation()
  const slots = attemptSlots(correct, active)
  return (
    <ol
      aria-label={t('ds.game.attempts', {
        correct: slots.filter((s) => s === 'correct').length,
        max: slots.length,
      })}
      className="flex items-center gap-2"
    >
      {slots.map((s: AttemptSlot, i) => (
        <li
          key={i}
          data-state={s}
          className={cn(
            'size-5 rounded-full border-2',
            s === 'correct' && 'border-success bg-success',
            s === 'empty' && 'border-input',
            s === 'filled-pulse' && 'border-primary bg-primary-soft motion-safe:animate-pulse-soft',
          )}
        >
          <span className="sr-only">{t(`ds.game.slot.${s}`, { index: i + 1 })}</span>
        </li>
      ))}
    </ol>
  )
}

/** Short verdict on the last attempt. Icon + text; announced politely. */
export function AttemptFeedbackChip({ correct, text }: { correct: boolean; text: string }) {
  return (
    <span
      role="status"
      data-correct={correct}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
        correct
          ? 'bg-success-soft text-success-soft-foreground'
          : 'bg-warning-soft text-warning-soft-foreground',
      )}
    >
      {correct ? (
        <Check aria-hidden="true" className="size-4" />
      ) : (
        <Sparkles aria-hidden="true" className="size-4" />
      )}
      {text}
    </span>
  )
}

/** Celebration behind the result stars: decorative rays, hidden entirely for reduced motion. */
export function StarBurst({ children }: { children: React.ReactNode }) {
  const reduced = usePrefersReducedMotion()
  return (
    <div className="relative inline-flex items-center justify-center p-6">
      {!reduced && (
        <span
          aria-hidden="true"
          className="bg-star-filled/20 animate-pulse-soft absolute inset-0 rounded-full"
          data-testid="star-burst-rays"
        />
      )}
      <span className="relative">{children}</span>
    </div>
  )
}

export function NewBestBadge() {
  const { t } = useTranslation()
  return (
    <span className="bg-warning text-warning-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
      <Trophy aria-hidden="true" className="size-3.5" />
      {t('ds.game.newBest')}
    </span>
  )
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card text-card-foreground rounded-lg border p-3">
      <dl>
        <dt className="text-muted-foreground text-xs">{label}</dt>
        <dd className="text-2xl font-semibold">{value}</dd>
      </dl>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  )
}
