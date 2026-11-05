import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Wrapper every chart sits in: a title, a text summary for assistive tech (charts are SVG
 * and carry no meaning on their own) and the chart itself, coloured only with score tokens.
 */
export function ChartFrame({
  title,
  summary,
  children,
  className,
}: {
  title: string
  /** One-sentence description of what the chart shows, e.g. "Score rose from 62 to 81". */
  summary: string
  children: ReactNode
  className?: string
}) {
  return (
    <figure
      className={cn('bg-card text-card-foreground space-y-2 rounded-lg border p-4', className)}
    >
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <div role="img" aria-label={`${title}. ${summary}`}>
        {children}
      </div>
      <p className="text-muted-foreground text-xs">{summary}</p>
    </figure>
  )
}
