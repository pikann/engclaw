import { useEffect, useRef, type ReactNode } from 'react'
import { ImageOff, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/**
 * Dictionary dialog shell: title, optional body and an "Ask the agent" footer. It is opened
 * programmatically (from a clickable word), so Radix has no trigger to hand focus back to:
 * the opener is remembered here and refocused on close.
 */
export function DictionaryDialog({
  open,
  onOpenChange,
  word,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  word: string
  children: ReactNode
  footer?: ReactNode
}) {
  const { t } = useTranslation()
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (open) opener.current = document.activeElement as HTMLElement | null
  }, [open])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg"
        data-testid="dictionary-dialog"
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          opener.current?.focus()
        }}
      >
        <DialogTitle>{word}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('ds.dict.description', { word })}
        </DialogDescription>
        <div className="space-y-3">{children}</div>
        {footer}
        <DialogClose asChild>
          <Button variant="outline" className="justify-self-end">
            {t('ds.dict.close')}
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}

export function AskAgentButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const { t } = useTranslation()
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      data-testid="ask-agent"
    >
      <Sparkles /> {t('ds.dict.ask')}
    </Button>
  )
}

/** Suggested follow-up questions; each is a real button, so they are keyboard reachable. */
export function QuickPrompts({
  prompts,
  onPick,
  className,
}: {
  prompts: readonly string[]
  onPick: (prompt: string) => void
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <ul aria-label={t('ds.dict.quickPrompts')} className={cn('flex flex-wrap gap-2', className)}>
      {prompts.map((p) => (
        <li key={p}>
          <Button variant="outline" size="sm" onClick={() => onPick(p)}>
            {p}
          </Button>
        </li>
      ))}
    </ul>
  )
}

/** Word illustration with required attribution, or an explained empty state. */
export function WordImage({
  src,
  alt,
  attribution,
  className,
}: {
  src?: string
  alt: string
  attribution?: string
  className?: string
}) {
  const { t } = useTranslation()
  if (!src) {
    return (
      <div
        className={cn(
          'text-muted-foreground bg-muted flex h-32 items-center justify-center gap-2 rounded-lg text-sm',
          className,
        )}
        data-testid="word-image-empty"
      >
        <ImageOff aria-hidden="true" className="size-4" />
        {t('ds.dict.noImage')}
      </div>
    )
  }
  return (
    <figure className={cn('space-y-1', className)}>
      <img src={src} alt={alt} className="h-32 w-full rounded-lg object-cover" />
      {attribution && (
        <figcaption className="text-muted-foreground text-xs">{attribution}</figcaption>
      )}
    </figure>
  )
}
