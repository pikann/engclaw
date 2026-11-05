import type { ReactNode } from 'react'
import { ArrowRight, BookOpen, Lightbulb, Mic2, Search, Volume2, Wrench } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function AgentCard({
  icon,
  title,
  tone = 'info',
  children,
  className,
  ...rest
}: {
  icon: ReactNode
  title: string
  tone?: 'info' | 'success' | 'warning' | 'destructive'
  children: ReactNode
  className?: string
} & React.HTMLAttributes<HTMLElement>) {
  const toneClass = {
    info: 'bg-info-soft text-info-soft-foreground',
    success: 'bg-success-soft text-success-soft-foreground',
    warning: 'bg-warning-soft text-warning-soft-foreground',
    destructive: 'bg-destructive-soft text-destructive-soft-foreground',
  }[tone]
  return (
    <section
      className={cn(
        'bg-card text-card-foreground max-w-[72ch] space-y-2 rounded-lg border p-4',
        className,
      )}
      aria-label={title}
      {...rest}
    >
      <header className="flex items-center gap-2">
        <span
          className={cn('inline-flex size-7 items-center justify-center rounded-md', toneClass)}
          aria-hidden="true"
        >
          {icon}
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </header>
      {children}
    </section>
  )
}

export function VocabularyCard({
  word,
  ipa,
  meaning,
  example,
  className,
}: {
  word: string
  ipa?: string
  meaning: string
  example?: string
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <AgentCard
      icon={<BookOpen className="size-4" />}
      title={t('ds.card.vocabulary')}
      className={className}
    >
      <p className="text-base font-semibold">
        {word} {ipa && <span className="text-muted-foreground font-normal">/{ipa}/</span>}
      </p>
      <p className="text-sm">{meaning}</p>
      {example && <p className="text-muted-foreground text-sm italic">“{example}”</p>}
    </AgentCard>
  )
}

export function PronunciationCard({
  word,
  ipa,
  tip,
  onHear,
  mouth,
  className,
}: {
  word: string
  ipa?: string
  tip?: string
  onHear: () => void
  /** The mouth-view slot (e.g. `<Mouth />`); omitted when the card is compact. */
  mouth?: ReactNode
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <AgentCard
      icon={<Mic2 className="size-4" />}
      title={t('ds.card.pronunciation')}
      tone="success"
      className={className}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-base font-semibold">
            {word} {ipa && <span className="text-muted-foreground font-normal">/{ipa}/</span>}
          </p>
          {tip && <p className="text-sm">{tip}</p>}
          <Button variant="outline" size="sm" onClick={onHear} data-testid="hear-it">
            <Volume2 /> {t('ds.card.hearIt')}
            <span className="sr-only"> {word}</span>
          </Button>
        </div>
        {mouth && <div className="shrink-0">{mouth}</div>}
      </div>
    </AgentCard>
  )
}

export function GrammarTipCard({
  title,
  body,
  example,
  className,
}: {
  title: string
  body: string
  example?: string
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <AgentCard
      icon={<Lightbulb className="size-4" />}
      title={t('ds.card.grammar')}
      tone="warning"
      className={className}
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="text-sm">{body}</p>
      {example && <p className="text-muted-foreground text-sm italic">“{example}”</p>}
    </AgentCard>
  )
}

/** "You said … / Better …": both lines are labelled in text, with a strike/no-strike difference too. */
export function CorrectionCard({
  said,
  better,
  why,
  className,
}: {
  said: string
  better: string
  why?: string
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <AgentCard
      icon={<ArrowRight className="size-4" />}
      title={t('ds.card.correction')}
      tone="destructive"
      className={className}
    >
      <dl className="space-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="text-muted-foreground w-16 shrink-0">{t('ds.card.said')}</dt>
          <dd className="line-through decoration-1">{said}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground w-16 shrink-0">{t('ds.card.better')}</dt>
          <dd className="font-medium">{better}</dd>
        </div>
      </dl>
      {why && <p className="text-muted-foreground text-sm">{why}</p>}
    </AgentCard>
  )
}

/** Shows that the agent used a tool (e.g. a dictionary lookup) without dumping the tool output. */
export function ToolUseChip({ label, running = false }: { label: string; running?: boolean }) {
  const { t } = useTranslation()
  return (
    <Badge variant="outline" className="gap-1.5" data-running={running || undefined}>
      {running ? (
        <Wrench aria-hidden="true" className="motion-safe:animate-pulse-soft size-3" />
      ) : (
        <Search aria-hidden="true" className="size-3" />
      )}
      <span>{label}</span>
      <span className="sr-only">{running ? t('ds.tool.running') : t('ds.tool.done')}</span>
    </Badge>
  )
}
