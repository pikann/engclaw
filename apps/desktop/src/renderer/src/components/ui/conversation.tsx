import type { ReactNode } from 'react'
import { Captions, CaptionsOff, Ear, MessageSquareMore, Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Toggle } from '@/components/ui/toggle'
import { cn } from '@/lib/utils'

export type MessageRole = 'user' | 'agent'

/**
 * Chat bubble. The streaming variant shows a caret and marks itself busy; place it inside a
 * `LiveRegion` (or give the list `aria-live="polite"`) so replies are announced once complete.
 */
export function MessageBubble({
  role,
  streaming = false,
  children,
  className,
}: {
  role: MessageRole
  streaming?: boolean
  children: ReactNode
  className?: string
}) {
  const { t } = useTranslation()
  const user = role === 'user'
  return (
    <div className={cn('flex', user ? 'justify-end' : 'justify-start')}>
      <div
        data-role={role}
        data-streaming={streaming || undefined}
        aria-busy={streaming || undefined}
        className={cn(
          'max-w-[72ch] rounded-2xl px-4 py-2 text-sm',
          user
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-secondary text-secondary-foreground rounded-bl-sm',
          className,
        )}
      >
        <span className="sr-only">{user ? t('ds.chat.you') : t('ds.chat.agent')}: </span>
        {children}
        {streaming && (
          <span
            aria-hidden="true"
            className="animate-caret ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-current"
          />
        )}
      </div>
    </div>
  )
}

export type TurnState = 'listening' | 'thinking' | 'speaking'

const TURN_ICON = { listening: Ear, thinking: MessageSquareMore, speaking: Volume2 } as const

/** Who has the floor. Icon + text, never colour alone; announces changes politely. */
export function TurnStateIndicator({ state }: { state: TurnState }) {
  const { t } = useTranslation()
  const Icon = TURN_ICON[state]
  return (
    <div
      role="status"
      aria-live="polite"
      data-state={state}
      className="bg-muted text-foreground inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm"
    >
      <Icon
        aria-hidden="true"
        className={cn('size-4', state !== 'listening' && 'motion-safe:animate-pulse-soft')}
      />
      {t(`ds.turn.${state}`)}
    </div>
  )
}

/** Show/hide captions. The pressed state is the single source of truth; the visible label never changes, so the accessible name matches it. */
export function CaptionsToggle({
  visible,
  onVisibleChange,
}: {
  visible: boolean
  onVisibleChange: (visible: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <Toggle
      variant="outline"
      size="sm"
      pressed={visible}
      onPressedChange={onVisibleChange}
      data-testid="captions-toggle"
    >
      {visible ? <Captions /> : <CaptionsOff />}
      {t('ds.captions.toggle')}
    </Toggle>
  )
}

/** Replaces the transcript while captions are hidden, so the empty area is explained. */
export function HiddenCaptions({ onShow }: { onShow?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm">
      <CaptionsOff aria-hidden="true" className="size-5" />
      <p>{t('ds.captions.hidden')}</p>
      {onShow && (
        <button
          type="button"
          className="text-primary underline underline-offset-4"
          onClick={onShow}
        >
          {t('ds.captions.show')}
        </button>
      )}
    </div>
  )
}
