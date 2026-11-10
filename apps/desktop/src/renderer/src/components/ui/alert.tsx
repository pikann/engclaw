import * as React from 'react'
import { FeedbackButton } from '@/components/feedback-button'
import { cn } from '@/lib/utils'

type AlertProps = React.ComponentProps<'div'> & {
  /** `error` adds a Feedback button that opens a prefilled GitHub bug report. */
  variant?: 'default' | 'error'
}

/** The alert's own text, without the Feedback button's label. */
function textOf(root: HTMLElement | null): string {
  if (!root) return ''
  const copy = root.cloneNode(true) as HTMLElement
  copy.querySelectorAll('[data-feedback-button]').forEach((n) => n.remove())
  return copy.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

function Alert({ className, variant = 'default', children, ...props }: AlertProps) {
  const root = React.useRef<HTMLDivElement>(null)
  return (
    <div
      ref={root}
      role="alert"
      data-slot="alert"
      data-variant={variant}
      className={cn('border-border rounded-md border p-3 text-sm', className)}
      {...props}
    >
      {children}
      {variant === 'error' && (
        <div data-feedback-button className="mt-2">
          <FeedbackButton getError={() => textOf(root.current)} />
        </div>
      )}
    </div>
  )
}

export { Alert }
