import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * A word that opens the dictionary / "Ask the agent". Distinct from the error chips in the
 * result card: a dotted underline (not a filled chip), so "tap to look up" is never mistaken
 * for "you mispronounced this". State is carried by underline + background, not colour alone.
 */
export const ClickableWord = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(function ClickableWord({ className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      data-slot="clickable-word"
      className={cn(
        'inline cursor-pointer rounded-sm px-0.5 underline decoration-dotted decoration-1 underline-offset-4 transition-colors',
        'hover:bg-primary-soft hover:text-foreground hover:decoration-solid',
        'active:bg-primary-soft active:text-foreground active:decoration-2',
        'aria-expanded:bg-primary-soft aria-expanded:decoration-solid',
        className,
      )}
      {...props}
    />
  )
})
