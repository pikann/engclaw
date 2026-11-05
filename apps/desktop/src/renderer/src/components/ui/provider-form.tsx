import { useId, useState, type ReactNode } from 'react'
import { CheckCircle2, ChevronDown, Loader2, LogIn, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LiveRegion } from '@/components/ui/live-region'
import { cn } from '@/lib/utils'

export function SignInButton({
  provider,
  onClick,
  busy,
}: {
  provider: string
  onClick: () => void
  busy?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Button onClick={onClick} disabled={busy} data-testid="provider-signin">
      {busy ? <Loader2 className="animate-spin" /> : <LogIn />}
      {t('ds.provider.signIn', { provider })}
    </Button>
  )
}

/** A labelled field with optional hint and error, wired with aria-describedby / aria-invalid. */
export function FormField({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: (props: {
    id: string
    'aria-describedby'?: string
    'aria-invalid'?: boolean
  }) => ReactNode
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const errId = `${id}-err`
  const describedBy = [hint && hintId, error && errId].filter(Boolean).join(' ') || undefined
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errId}
          className="text-destructive-soft-foreground bg-destructive-soft rounded px-2 py-1 text-xs"
        >
          {error}
        </p>
      )}
    </div>
  )
}

/** "Advanced" disclosure for base URL, model id, etc.; collapsed by default. */
export function AdvancedFields({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const panel = useId()
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen(!open)}
      >
        <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
        {t('ds.provider.advanced')}
      </Button>
      <div id={panel} hidden={!open} className="mt-2 space-y-3">
        {children}
      </div>
    </div>
  )
}

export type ConnectionStatus = 'idle' | 'testing' | 'ok' | 'failed'

/** Connection test result; always announced, icon + text (not colour alone). */
export function ConnectionTestStatus({
  status,
  detail,
}: {
  status: ConnectionStatus
  detail?: string
}) {
  const { t } = useTranslation()
  return (
    <LiveRegion className="min-h-6 text-sm">
      {status === 'testing' && (
        <span className="text-muted-foreground inline-flex items-center gap-2">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" /> {t('ds.provider.testing')}
        </span>
      )}
      {status === 'ok' && (
        <span className="bg-success-soft text-success-soft-foreground inline-flex items-center gap-2 rounded px-2 py-0.5">
          <CheckCircle2 aria-hidden="true" className="size-4" /> {t('ds.provider.ok')}
        </span>
      )}
      {status === 'failed' && (
        <span className="bg-destructive-soft text-destructive-soft-foreground inline-flex items-center gap-2 rounded px-2 py-0.5">
          <XCircle aria-hidden="true" className="size-4" /> {t('ds.provider.failed')}
          {detail ? `: ${detail}` : ''}
        </span>
      )}
    </LiveRegion>
  )
}

export { Input as ProviderInput }
