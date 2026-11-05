import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Loader2,
  MessageCircle,
  Mic,
  MicOff,
  Play,
  Send,
  Turtle,
  Volume2,
  WifiOff,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DictionaryDialogStatic } from '@/components/screens/dictionary-screens'
import { DownloadPrompt } from '@/components/screens/model-screens'
import { AppShell, Pane, layoutOf, type Layout } from '@/components/screens/shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ClickableWord } from '@/components/ui/clickable-word'
import { MessageBubble } from '@/components/ui/conversation'
import { AttemptFeedbackChip, AttemptTracker } from '@/components/ui/game'
import { Input } from '@/components/ui/input'
import { Recorder } from '@/components/ui/recorder'
import { cn } from '@/lib/utils'

export type ChapterTarget = 'word' | 'phrase' | 'idiom' | 'longIdiom'
export type ChapterPhase = 'idle' | 'recording' | 'analyzing' | 'correct' | 'fix'
export type AskPanel = 'closed' | 'open' | 'noProvider'
export type ChapterError = 'none' | 'mic' | 'analysis' | 'offlineAudio'
export type ChapterOverlay = 'none' | 'dict' | 'leave' | 'modelMissing'
export type ExamplesState = 'idle' | 'loading' | 'playing' | 'playingSlow'

interface Target {
  text: string
  type: 'word' | 'phrase' | 'idiom'
  ipa: string
  meaning: string
  examples: string[]
  /** The word and sound the demo feedback points at. */
  fix: { word: string; sound: string; heard: string }
}

const TARGETS: Record<ChapterTarget, Target> = {
  word: {
    text: 'thoroughly',
    type: 'word',
    ipa: 'ˈθʌrəli',
    meaning: 'in a careful and complete way',
    fix: { word: 'thoroughly', sound: 'th', heard: 's' },
    examples: ['She cleaned the room thoroughly.', 'Read the contract thoroughly before you sign.'],
  },
  phrase: {
    text: 'look forward to',
    type: 'phrase',
    ipa: 'lʊk ˈfɔːrwərd tuː',
    meaning: 'to feel happy about something that will happen',
    fix: { word: 'forward', sound: 'r', heard: 'w' },
    examples: ['I look forward to meeting you.', 'We are looking forward to the weekend.'],
  },
  idiom: {
    text: 'break a leg',
    type: 'idiom',
    ipa: 'breɪk ə lɛɡ',
    meaning: 'good luck, said to someone before a performance',
    fix: { word: 'break', sound: 'ea', heard: 'e' },
    examples: ['Break a leg tonight!', 'My friends told me to break a leg at the audition.'],
  },
  longIdiom: {
    text: 'don’t count your chickens before they hatch',
    type: 'idiom',
    ipa: 'doʊnt kaʊnt jɔːr ˈtʃɪkɪnz bɪˈfɔːr ðeɪ hætʃ',
    meaning: 'do not rely on a result before it has actually happened',
    fix: { word: 'chickens', sound: 'ch', heard: 'sh' },
    examples: [
      'He spent the bonus before he got it — never count your chickens before they hatch.',
      'I will not plan the party yet; don’t count your chickens before they hatch.',
    ],
  },
}

const ATTEMPT_LOG: [number, boolean][] = [
  [78, false],
  [85, true],
  [90, true],
]

function TargetText({ target, onWord }: { target: Target; onWord?: boolean }) {
  const long = target.text.length > 24
  const size = long ? 'text-2xl' : target.type === 'word' ? 'text-4xl' : 'text-3xl'
  return (
    <p className={cn(size, 'leading-snug font-semibold break-words')} data-testid="target-text">
      {target.text.split(' ').map((w, i) => (
        <span key={i} className="mr-2 inline-block">
          <ClickableWord aria-expanded={onWord ? true : undefined}>{w}</ClickableWord>
        </span>
      ))}
    </p>
  )
}

function Examples({
  target,
  state,
  offline,
}: {
  target: Target
  state: ExamplesState
  offline: boolean
}) {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="ex-title" className="space-y-2">
      <h4
        id="ex-title"
        className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
      >
        {t('screens.game.examples')}
      </h4>
      {offline && (
        <p
          className="bg-warning-soft text-warning-soft-foreground flex items-center gap-2 rounded-md px-3 py-2 text-sm"
          data-testid="offline-audio"
        >
          <WifiOff aria-hidden="true" className="size-4 shrink-0" />
          {t('screens.game.offlineAudio')}
        </p>
      )}
      <ul className="space-y-2">
        {target.examples.map((ex, i) => {
          const first = i === 0
          const loading = first && state === 'loading'
          const playing = first && state === 'playing'
          const slow = first && state === 'playingSlow'
          return (
            <li key={ex} className="flex items-start gap-2 text-sm">
              <Button
                size="icon-sm"
                variant={playing ? 'default' : 'outline'}
                disabled={offline}
                aria-label={t('screens.game.playExample', { n: i + 1 })}
              >
                {loading ? <Loader2 className="animate-spin" /> : <Play />}
              </Button>
              <Button
                size="icon-sm"
                variant={slow ? 'default' : 'outline'}
                disabled={offline}
                aria-label={t('screens.game.slowExample', { n: i + 1 })}
              >
                <Turtle />
              </Button>
              <span className="min-w-0 flex-1 pt-1">{ex}</span>
              {(loading || playing || slow) && (
                <span role="status" className="text-muted-foreground pt-1 text-xs">
                  {t(
                    loading
                      ? 'screens.game.loadingVoice'
                      : slow
                        ? 'screens.game.playingSlow'
                        : 'screens.game.playing',
                  )}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Feedback({
  phase,
  slots,
  fix,
}: {
  phase: ChapterPhase
  slots: number
  fix: Target['fix']
}) {
  const { t } = useTranslation()
  if (phase === 'analyzing')
    return (
      <p
        role="status"
        className="text-muted-foreground flex items-center gap-2 text-sm"
        data-testid="analyzing"
      >
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        {t('screens.game.analyzing')}
      </p>
    )
  if (phase !== 'correct' && phase !== 'fix')
    return (
      <p className="text-muted-foreground text-sm">
        {t('screens.game.sayIt', { count: 5 - slots })}
      </p>
    )
  const ok = phase === 'correct'
  return (
    <div className="space-y-3" data-testid="attempt-feedback">
      <div className="flex flex-wrap items-center gap-3">
        <AttemptFeedbackChip
          correct={ok}
          text={t(ok ? 'screens.game.correct' : 'screens.game.tryAgain')}
        />
        <span className="text-sm tabular-nums">
          {t('screens.game.lastAttempt', { score: ok ? 90 : 78 })}
        </span>
      </div>
      {!ok && (
        <>
          <p className="text-sm">
            {t('screens.game.soundFix', { sound: fix.sound, heard: fix.heard })}
          </p>
          <p className="text-sm">
            {t('screens.game.wordsToFix')}: <ClickableWord>{fix.word}</ClickableWord>
          </p>
        </>
      )}
      <div>
        <h4 className="text-muted-foreground mb-1 text-xs font-medium">
          {t('screens.game.attemptLog')}
        </h4>
        <ol className="flex flex-wrap gap-2 text-sm tabular-nums">
          {ATTEMPT_LOG.slice(0, Math.max(1, slots + (ok ? 0 : 1))).map(([s, good], i) => (
            <li
              key={i}
              className="bg-card flex items-center gap-1 rounded-full border px-2.5 py-0.5"
            >
              {s}
              {good ? (
                <span aria-label={t('result.chipOk')}>✓</span>
              ) : (
                <span aria-label={t('screens.practice.needsWork')}>✗</span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

const PROMPTS: Record<Target['type'], string[]> = {
  word: ['explain', 'examples', 'sound'],
  phrase: ['when', 'formal', 'otherWays'],
  idiom: ['meaning', 'origin', 'useIt'],
}

function AskPanelBody({ target }: { target: Target }) {
  const { t, i18n } = useTranslation()
  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-testid="ask-panel">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 text-sm font-semibold break-words">
          {t('screens.game.askAbout', { target: target.text })}
        </h3>
        <Button size="icon-sm" variant="ghost" aria-label={t('screens.game.closeAsk')}>
          <X />
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {t('screens.game.askContext', {
          type: t(`screens.game.type.${target.type}`).toLocaleLowerCase(i18n.language),
          count: 2,
        })}
      </p>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto">
        <MessageBubble role="agent">
          {t('screens.game.askReply', { target: target.text })}
        </MessageBubble>
        <ul aria-label={t('ds.dict.quickPrompts')} className="flex flex-wrap gap-2">
          {PROMPTS[target.type].map((k) => (
            <li key={k}>
              <Button size="xs" variant="outline">
                {t(`screens.game.prompt.${k}`)}
              </Button>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex gap-2">
        <Button size="icon" variant="outline" aria-label={t('screens.game.askMic')}>
          <Mic />
        </Button>
        <Input
          aria-label={t('screens.converse.typeLabel')}
          placeholder={t('screens.converse.typePlaceholder')}
          readOnly
        />
        <Button size="icon" aria-label={t('screens.converse.send')}>
          <Send />
        </Button>
      </div>
      <Button variant="link" size="sm" className="justify-start px-0">
        {t('screens.game.openConverse')}
        <ExternalLink />
      </Button>
    </div>
  )
}

function AskCollapsed({ noProvider }: { noProvider: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2" data-testid="ask-collapsed">
      <Button variant="secondary" disabled={noProvider} data-testid="ask-button">
        <MessageCircle />
        {t('ds.dict.ask')}
      </Button>
      {noProvider ? (
        <p className="text-muted-foreground text-sm">
          {t('screens.game.noProviderHint')}{' '}
          <Button variant="link" size="sm" className="h-auto px-0">
            {t('screens.game.openSettings')}
          </Button>
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">{t('screens.game.askHint')}</p>
      )}
    </div>
  )
}

function Scrim({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background/70 absolute inset-0 z-30 flex items-center justify-center p-4 backdrop-blur-[1px]">
      {children}
    </div>
  )
}

function LeaveDialog() {
  const { t } = useTranslation()
  return (
    <section
      aria-labelledby="leave-title"
      className="bg-card w-[480px] max-w-full space-y-4 rounded-xl border p-6 shadow-lg"
      data-testid="leave-dialog"
    >
      <h3 id="leave-title" className="text-lg font-semibold">
        {t('screens.game.leaveTitle')}
      </h3>
      <p className="text-muted-foreground text-sm">{t('screens.game.leaveBody', { n: 3 })}</p>
      <footer className="flex justify-end gap-2">
        <Button variant="outline">{t('screens.game.stay')}</Button>
        <Button variant="destructive">{t('screens.game.leave')}</Button>
      </footer>
    </section>
  )
}

/** Chapter (IA doc §9.4, §9.5): target and examples · practice · Ask the agent (docked or sheet). */
export function ChapterScreen({
  width,
  target: targetKey,
  phase = 'idle',
  slots = 0,
  ask = 'closed',
  error = 'none',
  overlay = 'none',
  examples = 'idle',
}: {
  width: number
  target: ChapterTarget
  phase?: ChapterPhase
  slots?: number
  ask?: AskPanel
  error?: ChapterError
  overlay?: ChapterOverlay
  examples?: ExamplesState
}) {
  const { t } = useTranslation()
  const layout: Layout = layoutOf(width)
  const wide = layout === 'wide'
  const compact = layout === 'compact'
  const target = TARGETS[targetKey]
  const askOpen = ask === 'open'
  const modelMissing = overlay === 'modelMissing'
  const offline = error === 'offlineAudio'
  const recorderBusy = askOpen || modelMissing
  const recState =
    phase === 'recording' ? 'recording' : phase === 'analyzing' ? 'processing' : 'idle'
  return (
    <div className="relative h-full">
      <AppShell
        layout={layout}
        active="game"
        title={
          <span className="flex items-center gap-2">
            <Button variant="ghost" size="sm">
              <ArrowLeft />
              {t('screens.game.backMap')}
            </Button>
            <span className="truncate">
              {t('screens.game.chapterTitle', {
                n: 56,
                type: t(`screens.game.type.${target.type}`),
              })}
            </span>
          </span>
        }
        actions={
          <>
            <AttemptTracker correct={slots} active={slots < 5} />
            <span className="text-sm tabular-nums" aria-hidden="true">
              {slots}/5
            </span>
            <Button variant="ghost" size="icon" aria-label={t('screens.game.leave')}>
              <X />
            </Button>
          </>
        }
      >
        <div
          className={cn(
            'grid h-full divide-x',
            wide
              ? 'grid-cols-[1fr_1fr_360px]'
              : compact
                ? 'grid-cols-1'
                : askOpen
                  ? 'grid-cols-[1fr_1fr_320px]'
                  : 'grid-cols-[1fr_1fr]',
          )}
        >
          <Pane
            title={t('screens.game.target')}
            actions={
              !wide && !askOpen ? (
                <Button size="sm" variant="secondary" disabled={ask === 'noProvider'}>
                  <MessageCircle />
                  {t('ds.dict.ask')}
                </Button>
              ) : undefined
            }
            bodyClassName="space-y-4"
          >
            <TargetText target={target} onWord={overlay === 'dict'} />
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-lg" lang="en-fonipa">
                /{target.ipa}/
              </span>
              <Button variant="outline" size="sm" disabled={offline || modelMissing}>
                <Volume2 />
                {t('result.hearIt')}
              </Button>
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">{t('screens.game.meaning')}: </span>
              {target.meaning}
            </p>
            <Examples target={target} state={examples} offline={offline} />
          </Pane>
          <Pane title={t('screens.game.practice')} bodyClassName="space-y-4">
            {error === 'mic' && (
              <Alert
                className="border-destructive bg-destructive-soft text-destructive-soft-foreground flex flex-wrap items-center gap-3"
                data-testid="chapter-error"
              >
                <MicOff aria-hidden="true" className="size-4 shrink-0" />
                <span className="flex-1">{t('audio.mic.denied.title')}</span>
                <Button size="sm" variant="outline">
                  {t('screens.practice.openSettings')}
                </Button>
                <Button size="sm">{t('practice.retry')}</Button>
              </Alert>
            )}
            {error === 'analysis' && (
              <Alert
                className="border-warning bg-warning-soft text-warning-soft-foreground flex items-center gap-3"
                data-testid="chapter-error"
              >
                <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
                <span className="flex-1">{t('screens.game.analysisFailed')}</span>
                <Button size="sm">{t('practice.retry')}</Button>
              </Alert>
            )}
            <Recorder
              state={recState}
              level={0.6}
              disabled={recorderBusy || error === 'mic'}
              onStart={() => undefined}
              onStop={() => undefined}
            />
            {askOpen && (
              <p className="text-muted-foreground text-xs" data-testid="mic-exclusive">
                {t('screens.game.micExclusive')}
              </p>
            )}
            <Feedback phase={phase} slots={slots} fix={target.fix} />
          </Pane>
          {(wide || (!compact && askOpen)) && (
            <Pane title={t('screens.game.askTitle')} bodyClassName="flex flex-col">
              {askOpen ? (
                <AskPanelBody target={target} />
              ) : (
                <AskCollapsed noProvider={ask === 'noProvider'} />
              )}
            </Pane>
          )}
        </div>
      </AppShell>
      {compact && askOpen && (
        <aside
          aria-label={t('screens.game.askTitle')}
          className="bg-card absolute top-12 right-0 bottom-7 z-20 w-[420px] max-w-[85%] border-l p-4 shadow-lg"
        >
          <AskPanelBody target={target} />
        </aside>
      )}
      {overlay === 'dict' && (
        <Scrim>
          <DictionaryDialogStatic
            image="image"
            ask={ask === 'noProvider' ? 'noProvider' : 'ready'}
            source="practice"
          />
        </Scrim>
      )}
      {overlay === 'leave' && (
        <Scrim>
          <LeaveDialog />
        </Scrim>
      )}
      {modelMissing && (
        <Scrim>
          <DownloadPrompt state="prompt" />
        </Scrim>
      )}
    </div>
  )
}
