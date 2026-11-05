import {
  AlertTriangle,
  ChevronDown,
  Eye,
  Ear,
  Loader2,
  Menu,
  MessageCircle,
  MicOff,
  Plus,
  Search,
  Send,
  Volume2,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DownloadPrompt } from '@/components/screens/model-screens'
import { AppShell, Pane, layoutOf, type Layout } from '@/components/screens/shell'
import {
  CorrectionCard,
  GrammarTipCard,
  PronunciationCard,
  ToolUseChip,
  VocabularyCard,
} from '@/components/ui/agent-cards'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ClickableWord } from '@/components/ui/clickable-word'
import { MessageBubble, TurnStateIndicator } from '@/components/ui/conversation'
import { Input } from '@/components/ui/input'
import { SignInButton } from '@/components/ui/provider-form'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

export type ConverseView = 'transcript' | 'cards'
export type ConverseTurn = 'idle' | 'listening' | 'thinking' | 'speaking'
export type ConverseVariant =
  | 'normal'
  | 'streaming'
  | 'interrupted'
  | 'empty'
  | 'toolFailed'
  | 'cardError'
  | 'noProvider'
  | 'noModels'
  | 'providerExpired'
  | 'micError'
  | 'listOpen'
  | 'emptyList'

const SAID = 'I go to the market yesterday'
const REPLY = 'Nice! You went to the market yesterday. What did you buy there?'

/** Analysis chip under the user's turn: a score and a count, never the sentence itself. */
function AnalysisChip({ open }: { open?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        aria-expanded={!!open}
        className="bg-card hover:bg-primary-soft inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
      >
        <span className="font-medium tabular-nums">
          {t('screens.converse.chip', { score: 82 })}
        </span>
        <span className="text-muted-foreground">{t('screens.converse.chipFix', { count: 1 })}</span>
        <ChevronDown aria-hidden="true" className={cn('size-3', open && 'rotate-180')} />
      </button>
      {open && (
        <p className="bg-card rounded-md border px-3 py-2 text-sm">
          <ClickableWord>market</ClickableWord>
          <span className="text-muted-foreground"> — /ˈmɑːrkɪt/ → /ˈmɑːkɪt/</span>
        </p>
      )}
    </div>
  )
}

function CardFallback() {
  const { t } = useTranslation()
  return (
    <section
      aria-label={t('screens.converse.cardError')}
      className="bg-card max-w-[72ch] space-y-1.5 rounded-lg border border-dashed p-4"
      data-testid="card-fallback"
    >
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <AlertTriangle aria-hidden="true" className="size-4" />
        {t('screens.converse.cardError')}
      </p>
      <p className="text-sm">
        <ClickableWord>market</ClickableWord> /ˈmɑːrkɪt/ — {t('screens.converse.marketMeaning')}
      </p>
    </section>
  )
}

function Cards({ variant, grid }: { variant: ConverseVariant; grid: boolean }) {
  const { t } = useTranslation()
  return (
    <div className={cn('grid gap-3', grid && 'grid-cols-2')}>
      <CorrectionCard
        said="I go to the market yesterday"
        better="I went to the market yesterday"
        why={t('screens.converse.correctionWhy')}
      />
      <PronunciationCard
        word="market"
        ipa="ˈmɑːrkɪt"
        tip={t('screens.converse.pronTip')}
        onHear={() => undefined}
      />
      {variant === 'cardError' ? (
        <CardFallback />
      ) : (
        <VocabularyCard
          word="market"
          ipa="ˈmɑːrkɪt"
          meaning={t('screens.converse.marketMeaning')}
          example={t('screens.converse.marketExample')}
        />
      )}
      <GrammarTipCard
        title={t('screens.converse.tipTitle')}
        body={t('screens.converse.tipBody')}
        example="I went to the market yesterday."
      />
    </div>
  )
}

function ToolLine({ variant, turn }: { variant: ConverseVariant; turn: ConverseTurn }) {
  const { t } = useTranslation()
  if (variant === 'toolFailed')
    return (
      <p
        className="text-muted-foreground flex items-center gap-1.5 text-xs"
        data-testid="tool-line"
      >
        <AlertTriangle aria-hidden="true" className="size-3" />
        {t('screens.converse.toolFailed', { word: 'market' })}
      </p>
    )
  const running = turn === 'thinking'
  return (
    <div data-testid="tool-line">
      <ToolUseChip
        running={running}
        label={t(running ? 'screens.converse.toolRunning' : 'screens.converse.toolDone', {
          word: 'market',
        })}
      />
    </div>
  )
}

function Feed({
  view,
  variant,
  turn,
  grid,
}: {
  view: ConverseView
  variant: ConverseVariant
  turn: ConverseTurn
  grid: boolean
}) {
  const { t } = useTranslation()
  const empty = variant === 'empty'
  if (empty)
    return (
      <p className="text-muted-foreground flex h-full min-h-40 items-center justify-center text-center text-sm">
        {t(view === 'cards' ? 'screens.converse.emptyCards' : 'screens.converse.sayHello')}
      </p>
    )
  const streaming = variant === 'streaming'
  const interrupted = variant === 'interrupted'
  const hasReply =
    turn === 'speaking' || streaming || interrupted || turn === 'idle' || turn === 'listening'
  if (view === 'cards')
    return (
      <div className="space-y-4" data-testid="feed-cards">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{t('screens.converse.turn', { n: 2 })}</Badge>
            <AnalysisChip />
          </div>
          <Cards variant={variant} grid={grid} />
          <div className="flex items-center justify-between gap-2">
            <ToolLine variant={variant} turn={turn} />
            <Button variant="ghost" size="sm">
              <Eye />
              {t('screens.converse.showText')}
            </Button>
          </div>
        </div>
      </div>
    )
  return (
    <div className="space-y-3" data-testid="feed-transcript" aria-live="polite">
      <MessageBubble role="agent">{t('screens.converse.opening')}</MessageBubble>
      <MessageBubble role="user">
        {SAID.split(' ').map((w, i) => (
          <span key={i}>
            {w === 'market' ? (
              <ClickableWord className="decoration-primary-foreground">market</ClickableWord>
            ) : (
              w
            )}{' '}
          </span>
        ))}
      </MessageBubble>
      <AnalysisChip open={variant === 'normal'} />
      <Cards variant={variant} grid={grid} />
      <ToolLine variant={variant} turn={turn} />
      {turn !== 'thinking' && hasReply && (
        <div className="space-y-1">
          <MessageBubble role="agent" streaming={streaming}>
            {streaming ? REPLY.slice(0, 34) : interrupted ? `${REPLY.slice(0, 31)}…` : REPLY}
          </MessageBubble>
          {interrupted && (
            <p
              className="text-muted-foreground flex items-center gap-1.5 text-xs"
              data-testid="interrupted"
            >
              <X aria-hidden="true" className="size-3" />
              {t('screens.converse.interrupted')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Orb({ turn, compact }: { turn: ConverseTurn; compact: boolean }) {
  const Icon =
    turn === 'speaking'
      ? Volume2
      : turn === 'thinking'
        ? Loader2
        : turn === 'listening'
          ? Ear
          : MessageCircle
  return (
    <div
      aria-hidden="true"
      className={cn(
        'bg-primary-soft text-primary flex items-center justify-center rounded-full border',
        compact ? 'size-16' : 'size-28',
        turn === 'listening' && 'motion-safe:animate-pulse-soft',
      )}
    >
      <Icon
        className={cn(
          compact ? 'size-6' : 'size-10',
          turn === 'thinking' && 'motion-safe:animate-spin',
        )}
      />
    </div>
  )
}

function Bars({ turn }: { turn: ConverseTurn }) {
  if (turn !== 'listening' && turn !== 'speaking') return null
  const hs = [3, 6, 10, 14, 10, 6, 3]
  return (
    <div aria-hidden="true" className="flex h-6 items-end gap-1">
      {hs.map((h, i) => (
        <span
          key={i}
          className={cn('w-1 rounded-full', turn === 'listening' ? 'bg-accent' : 'bg-primary')}
          style={{ height: h * 1.6 }}
        />
      ))}
    </div>
  )
}

function Stage({
  view,
  turn,
  variant,
  compact,
}: {
  view: ConverseView
  turn: ConverseTurn
  variant: ConverseVariant
  compact: boolean
}) {
  const { t } = useTranslation()
  if (variant === 'noProvider')
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
        data-testid="stage-no-provider"
      >
        <Orb turn="idle" compact={compact} />
        <h3 className="text-lg font-semibold">{t('screens.provider.title')}</h3>
        <p className="text-muted-foreground max-w-sm text-sm">{t('screens.provider.intro')}</p>
        <SignInButton provider="ChatGPT" onClick={() => undefined} />
        <Button variant="link" size="sm">
          {t('screens.converse.otherProvider')}
        </Button>
        <Button disabled variant="outline" size="sm">
          <MicOff />
          {t('screens.converse.micDisabled')}
        </Button>
      </div>
    )
  const showCaption = view === 'transcript' && (turn === 'listening' || turn === 'speaking')
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center"
      data-testid="stage"
    >
      <Orb turn={turn} compact={compact} />
      {turn === 'idle' ? (
        <p className="text-muted-foreground text-sm">{t('screens.converse.idle')}</p>
      ) : (
        <TurnStateIndicator state={turn} />
      )}
      <Bars turn={turn} />
      {turn === 'thinking' && (
        <p className="text-muted-foreground text-sm">{t('screens.converse.phase')}</p>
      )}
      {showCaption && (
        <p className="max-w-xs text-base" data-testid="stage-caption">
          {turn === 'listening' ? `${SAID}…` : REPLY}
        </p>
      )}
      {view === 'cards' && (turn === 'listening' || turn === 'speaking') && (
        <p className="text-muted-foreground text-xs">{t('screens.converse.captionsOff')}</p>
      )}
      {variant === 'micError' && (
        <div className="flex w-full max-w-xs gap-2">
          <Input
            aria-label={t('screens.converse.typeLabel')}
            placeholder={t('screens.converse.typePlaceholder')}
            readOnly
          />
          <Button size="icon" aria-label={t('screens.converse.send')}>
            <Send />
          </Button>
        </div>
      )}
      <div className="flex gap-2">
        {turn === 'thinking' ? (
          <Button variant="outline" size="sm">
            {t('screens.converse.cancelTurn')}
          </Button>
        ) : (
          <>
            <Button variant="outline" size="sm" disabled={variant === 'micError'}>
              <MicOff />
              {t('screens.converse.mute')}
            </Button>
            <Button variant="outline" size="sm">
              {t('screens.converse.end')}
            </Button>
          </>
        )}
      </div>
      <p className="text-muted-foreground text-xs">
        {t('screens.converse.provider', { name: 'ChatGPT · gpt-4o-mini' })}
      </p>
    </div>
  )
}

function ConversationList({ empty }: { empty: boolean }) {
  const { t } = useTranslation()
  const groups: [string, string[]][] = [
    ['today', ['Market talk', 'Idiom: break the ice']],
    ['yesterday', ['Travel plans']],
  ]
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="text-muted-foreground absolute top-2.5 left-2.5 size-4"
        />
        <Input
          aria-label={t('screens.converse.search')}
          placeholder={t('screens.converse.search')}
          className="pl-8"
          readOnly
        />
      </div>
      {empty ? (
        <p
          className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm"
          data-testid="list-empty"
        >
          {t('screens.converse.emptyList')}
        </p>
      ) : (
        groups.map(([g, items]) => (
          <section key={g} className="space-y-1">
            <h4 className="text-muted-foreground text-xs font-medium">
              {t(`screens.converse.${g}`)}
            </h4>
            <ul className="space-y-0.5">
              {items.map((it, i) => (
                <li
                  key={it}
                  aria-current={g === 'today' && i === 0 ? 'true' : undefined}
                  className={cn(
                    'rounded-md px-2 py-1.5 text-sm',
                    g === 'today' && i === 0 && 'bg-primary-soft font-medium',
                  )}
                >
                  {it}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

function Banner({ variant }: { variant: ConverseVariant }) {
  const { t } = useTranslation()
  if (variant === 'providerExpired')
    return (
      <Alert
        className="border-warning bg-warning-soft text-warning-soft-foreground flex flex-wrap items-center gap-3"
        data-testid="converse-banner"
      >
        <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
        <span className="flex-1">
          {t('screens.provider.expiredBody')} {t('screens.converse.kept')}
        </span>
        <Button size="sm">{t('screens.provider.signInAgain')}</Button>
      </Alert>
    )
  if (variant === 'micError')
    return (
      <Alert
        className="border-destructive bg-destructive-soft text-destructive-soft-foreground flex flex-wrap items-center gap-3"
        data-testid="converse-banner"
      >
        <MicOff aria-hidden="true" className="size-4 shrink-0" />
        <span className="flex-1">
          {t('audio.mic.denied.title')} {t('screens.converse.typeInstead')}
        </span>
        <Button size="sm" variant="outline">
          {t('screens.practice.openSettings')}
        </Button>
        <Button size="sm">{t('practice.retry')}</Button>
      </Alert>
    )
  return null
}

/** Converse (IA doc §8): conversations · stage · feed, with the view switch and blocking states. */
export function ConverseScreen({
  width,
  view,
  turn,
  variant,
}: {
  width: number
  view: ConverseView
  turn: ConverseTurn
  variant: ConverseVariant
}) {
  const { t } = useTranslation()
  const layout: Layout = layoutOf(width)
  const wide = layout === 'wide'
  const compact = layout === 'compact'
  const listOverlay = !wide && (variant === 'listOpen' || variant === 'emptyList')
  const blocked = variant === 'noProvider'
  return (
    <div className="relative h-full">
      <AppShell
        layout={layout}
        active="converse"
        title={t('screens.shell.converse')}
        actions={
          <>
            {!wide && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('screens.converse.conversations')}
                aria-expanded={listOverlay}
              >
                <Menu />
              </Button>
            )}
            <ToggleGroup
              type="single"
              value={view}
              variant="outline"
              size="sm"
              aria-label={t('screens.converse.viewLabel')}
            >
              <ToggleGroupItem value="transcript">
                {t('screens.converse.viewTranscript')}
              </ToggleGroupItem>
              <ToggleGroupItem value="cards">{t('screens.converse.viewCards')}</ToggleGroupItem>
            </ToggleGroup>
            <Button size="sm">
              <Plus />
              {t('screens.converse.new')}
            </Button>
          </>
        }
      >
        <div className="flex h-full flex-col">
          <Banner variant={variant} />
          <div
            className={cn(
              'grid min-h-0 flex-1 divide-x',
              wide
                ? 'grid-cols-[260px_1fr_460px]'
                : compact
                  ? 'grid-cols-1 grid-rows-[auto_1fr] divide-x-0'
                  : 'grid-cols-[1fr_420px]',
            )}
          >
            {wide && (
              <Pane title={t('screens.converse.conversations')}>
                <ConversationList empty={variant === 'emptyList'} />
              </Pane>
            )}
            <div className={cn('min-h-0', compact && 'border-b')}>
              <Stage view={view} turn={turn} variant={variant} compact={compact} />
            </div>
            {!blocked && (
              <Pane
                title={t(view === 'cards' ? 'screens.converse.cards' : 'screens.converse.feed')}
              >
                <Feed view={view} variant={variant} turn={turn} grid={wide && view === 'cards'} />
              </Pane>
            )}
          </div>
        </div>
      </AppShell>
      {listOverlay && (
        <div
          className={cn(
            'bg-card absolute top-12 bottom-7 z-10 w-72',
            compact ? 'left-16' : 'left-60',
            'space-y-2 overflow-auto border-r p-3 shadow-lg',
          )}
          data-testid="list-drawer"
        >
          <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t('screens.converse.conversations')}
          </h3>
          <ConversationList empty={variant === 'emptyList'} />
        </div>
      )}
      {variant === 'noModels' && (
        <div className="bg-background/70 absolute inset-0 flex items-center justify-center p-4 backdrop-blur-[1px]">
          <DownloadPrompt state="prompt" />
        </div>
      )}
    </div>
  )
}
