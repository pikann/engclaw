import { AlertTriangle, Check, Circle, CircleDot, Minus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Pane } from '@/components/screens/shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ClickableText } from '@/components/ui/clickable-text'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  BLANK_PERCENT_OPTIONS,
  scoreSegment,
  tokenizeSentence,
  type ReviewItem,
  type SegmentResult,
  type SessionScore,
} from '@/lib/dictation'
import type { DictationEntry } from '@/lib/use-dictation'
import { formatClock, type Segment } from '@/lib/shadowing'
import { cn } from '@/lib/utils'

const GRADE_ICON = { correct: Check, near: Minus, wrong: X } as const
const GRADE_STATUS = { correct: 'ok', near: 'near', wrong: 'wrong' } as const

/** The sentence with its hidden words as inputs (IA doc §4.3). Typed answers survive replays. */
export function DictationSheet({
  segment,
  entry,
  onAnswer,
  onCheck,
  fontSize,
}: {
  segment: Segment
  entry: DictationEntry
  onAnswer: (blank: number, value: string) => void
  onCheck: () => void
  fontSize: number
}) {
  const { t } = useTranslation()
  const tokens = tokenizeSentence(segment.text)
  const { result } = entry
  const last = entry.blanks.length - 1
  const long = segment.end - segment.start > 15

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-1">
      <p
        data-testid="dictation-sheet"
        className="flex flex-wrap items-center justify-center gap-x-[0.3em] leading-[2.4]"
        style={{ fontSize }}
      >
        {tokens.map((tok, i) => {
          const blank = entry.blanks.indexOf(i)
          if (blank < 0) {
            return (
              <span key={i}>
                {tok.before}
                <ClickableText text={tok.word} />
                {tok.after}
              </span>
            )
          }
          const grade = result?.grades[blank]
          const Icon = grade ? GRADE_ICON[grade] : null
          return (
            <span key={i} className="relative">
              <span className="inline-flex items-center">
                {tok.before}
                <Input
                  value={entry.answers[blank] ?? ''}
                  readOnly={!!result}
                  autoFocus={blank === 0}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  data-testid={`dictation-blank-${blank}`}
                  data-grade={grade}
                  aria-label={t('screens.dictation.blank', { n: blank + 1 })}
                  style={{ width: `${Math.max(4, tok.word.length + 2)}ch`, fontSize: 'inherit' }}
                  className={cn(
                    'mx-1 h-[1.5em] px-2 text-center',
                    grade === 'correct' && 'border-success',
                    grade === 'near' && 'border-warning',
                    grade === 'wrong' && 'border-destructive',
                  )}
                  onChange={(e) => onAnswer(blank, e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && blank === last && !e.nativeEvent.isComposing) {
                      e.preventDefault()
                      onCheck()
                    }
                  }}
                />
                {Icon && grade && (
                  <span className="sr-only">
                    {t(`screens.dictation.status.${GRADE_STATUS[grade]}`)}
                  </span>
                )}
                {Icon && <Icon className="size-[0.7em]" aria-hidden="true" />}
                {tok.after}
              </span>
              {grade && grade !== 'correct' && (
                <span
                  data-testid={`dictation-reveal-${blank}`}
                  className="text-muted-foreground absolute top-[calc(100%-0.35em)] left-0 w-full text-center text-[0.6em] leading-tight whitespace-nowrap"
                >
                  {t(`screens.dictation.status.${GRADE_STATUS[grade]}`)} {tok.word}
                </span>
              )}
            </span>
          )
        })}
      </p>
      {long && (
        <p role="note" className="text-muted-foreground flex items-center gap-1 text-sm">
          <AlertTriangle className="text-warning size-4" aria-hidden="true" />
          {t('screens.dictation.longSegment')}
        </p>
      )}
    </div>
  )
}

/** Check / retry, fresh blanks and the hide-percent picker, sized to sit in the control bar. */
export function DictationActions({
  checked,
  percent,
  onPercent,
  onCheck,
  onNewBlanks,
  onRetry,
}: {
  checked: boolean
  percent: number
  onPercent: (percent: number) => void
  onCheck: () => void
  onNewBlanks: () => void
  onRetry: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2">
      {checked ? (
        <Button size="sm" data-testid="dictation-retry" onClick={onRetry}>
          {t('screens.dictation.retrySegment')}
        </Button>
      ) : (
        <Button
          size="sm"
          data-testid="dictation-check"
          aria-keyshortcuts="Control+Enter Meta+Enter"
          onClick={onCheck}
        >
          {t('screens.dictation.check')}
        </Button>
      )}
      <Button size="sm" variant="outline" data-testid="dictation-new-blanks" onClick={onNewBlanks}>
        {t('screens.dictation.newBlanks')}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" data-testid="dictation-percent">
            {t('screens.dictation.hide', { n: percent })}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuRadioGroup
            value={String(percent)}
            onValueChange={(v) => onPercent(Number(v))}
          >
            {BLANK_PERCENT_OPTIONS.map((p) => (
              <DropdownMenuRadioItem key={p} value={String(p)}>
                {t('screens.dictation.hide', { n: p })}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

type RailStatus = 'todo' | 'current' | 'done' | 'review'
const STATUS_ICON = { todo: Circle, current: CircleDot, done: Check, review: AlertTriangle }

/** Segment status dots, running score and the missed-words review list (IA doc §4.3). */
export function DictationRail({
  segments,
  index,
  results,
  score,
  review,
  onSelect,
}: {
  segments: readonly Segment[]
  index: number
  results: ReadonlyMap<number, SegmentResult>
  score: SessionScore
  review: readonly ReviewItem[]
  onSelect: (index: number) => void
}) {
  const { t } = useTranslation()
  return (
    <Pane
      title={t('screens.dictation.segments')}
      className="border-l"
      actions={
        <Badge variant="secondary" className="tabular-nums" data-testid="dictation-score">
          {t('screens.dictation.score', { n: Math.round(score.ratio * 100) })}
        </Badge>
      }
      bodyClassName="flex flex-col gap-4"
    >
      <ol className="space-y-1 text-sm" data-testid="dictation-rail">
        {segments.map((s, i) => {
          const r = results.get(i)
          const status: RailStatus = r
            ? scoreSegment(r) === 1
              ? 'done'
              : 'review'
            : i === index
              ? 'current'
              : 'todo'
          const Icon = STATUS_ICON[status]
          return (
            <li key={s.index}>
              <button
                type="button"
                aria-current={i === index ? 'true' : undefined}
                data-status={status}
                onClick={() => onSelect(i)}
                className={cn(
                  'focus-visible:ring-ring/50 hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-[3px]',
                  i === index && 'bg-primary-soft font-medium',
                )}
              >
                <Icon
                  className={cn(
                    'size-4 shrink-0',
                    status === 'done' && 'text-success',
                    status === 'review' && 'text-warning',
                  )}
                  aria-hidden="true"
                />
                <span className="sr-only">{t(`screens.dictation.seg.${status}`)}</span>
                <span className="text-muted-foreground w-10 shrink-0 tabular-nums">
                  {formatClock(s.start)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {r
                    ? s.text
                    : t('screens.dictation.segment', { n: i + 1, total: segments.length })}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <section aria-labelledby="dictation-review-title" className="space-y-1 text-sm">
        <h3 id="dictation-review-title" className="font-medium">
          {t('screens.dictation.reviewList')}
        </h3>
        {review.length ? (
          <ul data-testid="dictation-review" className="space-y-0.5">
            {review.map((item, i) => (
              <li key={i} className="tabular-nums">
                <span className="line-through opacity-70">{item.answered || '—'}</span>
                {' → '}
                <span className="font-medium">{item.expected}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">{t('screens.dictation.noReview')}</p>
        )}
      </section>
    </Pane>
  )
}
