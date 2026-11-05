import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A polite live region. Keep it mounted and change its children so screen readers announce
 * the update (streaming replies, captions on/off, connection test results).
 */
export function LiveRegion({
  children,
  className,
  visuallyHidden = false,
}: {
  children?: ReactNode
  className?: string
  visuallyHidden?: boolean
}) {
  return (
    <div role="status" aria-live="polite" className={cn(visuallyHidden && 'sr-only', className)}>
      {children}
    </div>
  )
}
