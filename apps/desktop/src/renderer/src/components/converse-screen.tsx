import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router'
import { AlertTriangle, Hand, MicOff, Plus, X } from 'lucide-react'
import type { AgentConversation } from '@engclaw/ipc-contract'
import { AgentCardList } from '@/components/agent-card-view'
import { ModelDownloadDialog } from '@/components/model-download-dialog'
import { RecordButton } from '@/components/record-button'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  CaptionsToggle,
  HiddenCaptions,
  MessageBubble,
  TurnStateIndicator,
} from '@/components/ui/conversation'
import { LiveRegion } from '@/components/ui/live-region'
import { captionsAnnouncement, isCaptionsShortcut, type ConverseMessage } from '@/lib/converse'
import { useConverse } from '@/lib/use-converse'
import type { AskNavigationState } from '@/lib/use-ask-agent'
import { cn } from '@/lib/utils'

const platformOf = (p: string): string =>
  /mac/i.test(p) ? 'darwin' : /win/i.test(p) ? 'win32' : 'linux'

function Transcript({ messages }: { messages: ConverseMessage[] }) {
  const { t } = useTranslation()
  if (messages.length === 0)
    return (
      <p className="text-muted-foreground text-center text-sm">{t('converse.emptyTranscript')}</p>
    )
  return (
    <div
      role="log"
      aria-label={t('converse.transcript')}
      data-testid="converse-transcript"
      className="space-y-3"
    >
      {messages
        .filter((m) => m.streaming !== true || m.text !== '')
        .map((m) => (
          <div key={m.id} className="space-y-1">
            <MessageBubble role={m.role === 'user' ? 'user' : 'agent'} streaming={m.streaming}>
              {m.text}
            </MessageBubble>
            {m.cards && <AgentCardList cards={m.cards} />}
            {m.interrupted && (
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <X aria-hidden="true" className="size-3" />
                {t('converse.interrupted')}
              </p>
            )}
          </div>
        ))}
    </div>
  )
}

function ConversationList({
  items,
  activeId,
  onOpen,
}: {
  items: AgentConversation[]
  activeId: string | null
  onOpen: (id: string) => void
}) {
  const { t } = useTranslation()
  if (items.length === 0)
    return <p className="text-muted-foreground p-3 text-sm">{t('converse.emptyList')}</p>
  return (
    <ul className="space-y-0.5 p-2" data-testid="converse-history">
      {items.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            aria-current={c.id === activeId ? 'true' : undefined}
            onClick={() => onOpen(c.id)}
            className={cn(
              'hover:bg-primary-soft focus-visible:ring-ring/50 w-full truncate rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-[3px]',
              c.id === activeId && 'bg-primary-soft font-medium',
            )}
          >
            {c.title || t('converse.untitled')}
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Voice conversation: hold a turn with the mic, hear the reply, and read along or not. */
export function ConverseScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const c = useConverse(platformOf(window.navigator.platform))
  const { state } = c
  const [captions, setCaptions] = useState(true)
  const [announce, setAnnounce] = useState('')
  const [modelsOpen, setModelsOpen] = useState(false)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const location = useLocation()
  const seeded = useRef(false)
  const seed = (location.state as Partial<AskNavigationState> | null)?.askAgent

  useEffect(() => {
    if (!seed || configured !== true || seeded.current) return
    seeded.current = true
    void navigate(location.pathname, { replace: true, state: null })
    void c.sendText(seed)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per navigation
  }, [seed, configured])

  useEffect(() => {
    void window.engclaw.app.getSettings().then((s) => setCaptions(s.captionsVisible))
    void window.engclaw.llm.status().then((s) => setConfigured(s.kind !== 'none'))
  }, [])

  const setCaptionsVisible = (visible: boolean): void => {
    setCaptions(visible)
    setAnnounce(
      t(`converse.captions${captionsAnnouncement(visible) === 'shown' ? 'Shown' : 'Hidden'}`),
    )
    void window.engclaw.app.updateSettings({ captionsVisible: visible })
  }

  useEffect(() => {
    const on = (e: KeyboardEvent): void => {
      if (!isCaptionsShortcut(e)) return
      e.preventDefault()
      setCaptionsVisible(!captions)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  })

  const busy = state.turn === 'thinking'
  const listening = state.turn === 'listening'
  const speaking = state.turn === 'speaking'
  const errorText = state.error ? t(`converse.error.${state.error}`) : null

  return (
    <div className="grid h-full grid-cols-[minmax(0,14rem)_minmax(0,1fr)]" data-testid="converse">
      <aside aria-label={t('converse.conversations')} className="flex min-h-0 flex-col border-r">
        <div className="flex items-center justify-between gap-2 border-b p-3">
          <h2 className="text-sm font-semibold">{t('converse.conversations')}</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('converse.new')}
            data-testid="converse-new"
            disabled={busy || listening}
            onClick={c.reset}
          >
            <Plus />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <ConversationList
            items={c.conversations}
            activeId={state.conversationId}
            onOpen={(id) => void c.open(id)}
          />
        </div>
      </aside>

      <section className="flex min-h-0 flex-col">
        <header className="flex items-center justify-between gap-3 border-b p-3">
          <h1 className="text-lg font-semibold">{t('converse.title')}</h1>
          <CaptionsToggle visible={captions} onVisibleChange={setCaptionsVisible} />
        </header>

        {configured === false && (
          <Alert className="m-4 space-y-2" data-testid="converse-setup">
            <p className="font-medium">{t('converse.setupTitle')}</p>
            <p className="text-sm">{t('converse.setupBody')}</p>
            <Button size="sm" onClick={() => void navigate('/settings?tab=agent')}>
              {t('converse.setupAction')}
            </Button>
          </Alert>
        )}
        {c.needsModels && (
          <Alert className="m-4 space-y-2" data-testid="converse-models">
            <p className="font-medium">{t('converse.modelsTitle')}</p>
            <p className="text-sm">{t('converse.modelsBody')}</p>
            <Button
              size="sm"
              onClick={() => setModelsOpen(true)}
              data-testid="converse-models-open"
            >
              {t('converse.modelsAction')}
            </Button>
          </Alert>
        )}
        {c.mic && (
          <Alert
            variant="error"
            className="m-4 flex items-center gap-3"
            data-testid="converse-mic-error"
          >
            <MicOff aria-hidden="true" className="size-4 shrink-0" />
            <span>{t(c.mic.guidance)}</span>
          </Alert>
        )}
        {errorText && (
          <Alert
            variant="error"
            className="m-4 flex items-center gap-3"
            data-testid="converse-error"
          >
            <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
            <span>
              {errorText}
              {state.errorDetail && (
                <span
                  className="text-muted-foreground block text-xs"
                  data-testid="converse-error-detail"
                >
                  {state.errorDetail}
                </span>
              )}
            </span>
          </Alert>
        )}

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {captions ? (
            <Transcript messages={state.messages} />
          ) : (
            <div className="space-y-3">
              <HiddenCaptions onShow={() => setCaptionsVisible(true)} />
              {state.messages.map((m) => m.cards && <AgentCardList key={m.id} cards={m.cards} />)}
            </div>
          )}
        </div>

        <footer className="flex flex-col items-center gap-3 border-t p-4">
          {state.turn === 'idle' ? (
            <p className="text-muted-foreground text-sm">
              {c.notice ? t(`converse.${c.notice}`) : t('converse.idle')}
            </p>
          ) : (
            !listening && <TurnStateIndicator state={state.turn} />
          )}
          <RecordButton
            recording={listening}
            level={c.level}
            timer={t('ds.turn.listening')}
            disabled={busy || configured === false}
            startTestId="converse-mic"
            stopTestId="converse-stop"
            onStart={() => void c.startListening()}
            onStop={() => void c.finishListening()}
          />
          <div className="flex h-9 items-center justify-center">
            {speaking && (
              <Button
                variant="secondary"
                size="sm"
                className="rounded-full px-4"
                data-testid="converse-interrupt"
                onClick={() => {
                  c.interrupt()
                  void c.startListening()
                }}
              >
                <Hand aria-hidden="true" />
                {t('converse.interrupt')}
              </Button>
            )}
            {(busy || listening) && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-full px-4"
                data-testid="converse-cancel"
                onClick={c.cancel}
              >
                <X aria-hidden="true" />
                {t('converse.cancel')}
              </Button>
            )}
          </div>
        </footer>
      </section>

      <LiveRegion visuallyHidden>{announce}</LiveRegion>
      <ModelDownloadDialog
        open={modelsOpen}
        onOpenChange={setModelsOpen}
        onReady={() => {
          setModelsOpen(false)
          c.setNeedsModels(false)
        }}
      />
    </div>
  )
}
