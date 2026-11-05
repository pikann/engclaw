import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AdvancedFields,
  ConnectionTestStatus,
  FormField,
  ProviderInput,
  SignInButton,
  type ConnectionStatus,
} from '@/components/ui/provider-form'
import {
  AskAgentButton,
  DictionaryDialog,
  QuickPrompts,
  WordImage,
} from '@/components/ui/dictionary'
import {
  AttemptFeedbackChip,
  AttemptTracker,
  ChapterNode,
  NewBestBadge,
  PathConnector,
  ProgressSummary,
  StarBurst,
  StarRating,
  StatTile,
  WorldHeader,
} from '@/components/ui/game'
import {
  CaptionsToggle,
  HiddenCaptions,
  MessageBubble,
  TurnStateIndicator,
} from '@/components/ui/conversation'
import {
  CorrectionCard,
  GrammarTipCard,
  PronunciationCard,
  ToolUseChip,
  VocabularyCard,
} from '@/components/ui/agent-cards'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChartFrame } from '@/components/ui/chart-frame'
import { ClickableWord } from '@/components/ui/clickable-word'
import { LiveRegion } from '@/components/ui/live-region'
import { Logo, LogoLockup } from '@/components/ui/logo'
import { PlayerControls } from '@/components/ui/player-controls'
import { Recorder, type RecorderState } from '@/components/ui/recorder'
import { ScoreRing } from '@/components/ui/score-ring'
import { SplitPane } from '@/components/ui/split-pane'
import { Switch } from '@/components/ui/switch'
import { TooltipProvider } from '@/components/ui/tooltip'
import { nodeStates, progressOf } from '@/lib/game'
import { setThemePreference, useThemePreference } from '@/lib/theme'

const CHAPTER_STARS = [3, 1, null, null]

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id} className="space-y-3 border-b pb-6">
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** Dev/test-only kitchen sink: every design-system component and state, for review and axe. */
export function DesignSystem() {
  const { t } = useTranslation()
  const theme = useThemePreference()
  const [rec, setRec] = useState<RecorderState>('idle')
  const [captions, setCaptions] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [dict, setDict] = useState(false)
  const [conn, setConn] = useState<ConnectionStatus>('idle')
  const states = nodeStates(CHAPTER_STARS)
  const prog = progressOf(CHAPTER_STARS)

  return (
    <TooltipProvider>
      <main className="mx-auto max-w-5xl space-y-8 p-8" data-testid="design-system">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold">Design system</h1>
          <div role="group" aria-label={t('settings.theme')} className="flex gap-2">
            {(['system', 'light', 'dark'] as const).map((k) => (
              <Button
                key={k}
                size="sm"
                variant={theme === k ? 'default' : 'outline'}
                aria-pressed={theme === k}
                data-testid={`ds-theme-${k}`}
                onClick={() => setThemePreference(k)}
              >
                {k}
              </Button>
            ))}
          </div>
        </header>

        <Section id="ds-logo" title="Logo">
          <p className="text-muted-foreground max-w-prose text-sm">
            The mark has no text. It is one colour and follows <code>currentColor</code>: teal on
            surfaces, white on a primary surface. Minimum height 16 px; keep clear space of at least
            a quarter of the mark's height around it. The wordmark is set in the UI font next to it
            (lockup).
          </p>
          <div className="flex flex-wrap items-center gap-6">
            <div
              className="bg-card flex items-center gap-6 rounded-lg border p-6"
              data-testid="logo-on-surface"
            >
              <Logo label="Engclaw" className="text-primary h-16" />
              <Logo className="text-primary h-10" />
              <Logo className="text-primary h-6" />
              <Logo className="text-primary h-4" />
            </div>
            <div className="bg-primary text-primary-foreground flex items-center gap-6 rounded-lg p-6">
              <Logo className="h-16" />
              <Logo className="h-6" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-8">
            <LogoLockup size="lg" />
            <LogoLockup />
            <LogoLockup size="sm" />
            <span
              className="bg-primary text-primary-foreground flex size-24 items-center justify-center rounded-[22%]"
              role="img"
              aria-label="App icon"
            >
              <Logo className="h-10" />
            </span>
          </div>
        </Section>

        <Section id="ds-type" title="Typography (en / vi)">
          <p className="text-3xl">Pronounce clearly — Phát âm rõ ràng</p>
          <p className="text-base">Ắ ằ ẳ ẵ ặ Ữ ự ộ ỗ ổ Ế Ề Ể Ễ Ệ — Tiếng Việt có nhiều dấu</p>
          <p className="text-sm">IPA: /ʃ ə ɪ æ θ ð ŋ ʒ ˈ ː ɑ ʊ/</p>
          <p className="text-muted-foreground text-xs">Muted text, extra small</p>
        </Section>

        <Section id="ds-buttons" title="Buttons, badges, form">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button variant="destructive">Destructive</Button>
            <Button disabled>Disabled</Button>
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Switch aria-label="Example switch" />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-success-soft text-success-soft-foreground rounded-md p-3 text-sm">
              success
            </div>
            <div className="bg-warning-soft text-warning-soft-foreground rounded-md p-3 text-sm">
              warning
            </div>
            <div className="bg-info-soft text-info-soft-foreground rounded-md p-3 text-sm">
              info
            </div>
            <div className="bg-destructive-soft text-destructive-soft-foreground rounded-md p-3 text-sm">
              destructive
            </div>
          </div>
        </Section>

        <Section id="ds-core" title="Score ring, recorder, player, chart, panes">
          <div className="flex flex-wrap items-center gap-8">
            <ScoreRing score={86} animate={false} />
            <ScoreRing score={64} animate={false} />
            <ScoreRing score={32} animate={false} />
          </div>
          <Recorder
            state={rec}
            level={0.6}
            onStart={() => setRec('recording')}
            onStop={() => setRec('idle')}
          />
          <PlayerControls
            playing={playing}
            looping={loop}
            speed={speed}
            onToggle={() => setPlaying(!playing)}
            onPrev={() => {}}
            onNext={() => {}}
            onLoop={() => setLoop(!loop)}
            onSpeed={setSpeed}
          />
          <ChartFrame
            title="Score over time"
            summary="Score rose from 62 to 81 over five attempts."
          >
            <svg viewBox="0 0 100 30" className="h-24 w-full" aria-hidden="true">
              <polyline
                points="0,20 25,16 50,18 75,9 100,5"
                fill="none"
                strokeWidth="2"
                className="stroke-score-high"
              />
            </svg>
          </ChartFrame>
          <div className="h-40 rounded-lg border">
            <SplitPane
              id="ds-split"
              left={<div className="p-3 text-sm">Left pane</div>}
              right={<div className="p-3 text-sm">Right pane</div>}
            />
          </div>
        </Section>

        <Section id="ds-agent" title="Conversation and agent cards">
          <div className="flex items-center gap-3">
            <TurnStateIndicator state="listening" />
            <TurnStateIndicator state="thinking" />
            <TurnStateIndicator state="speaking" />
            <CaptionsToggle visible={captions} onVisibleChange={setCaptions} />
          </div>
          {captions ? (
            <LiveRegion className="space-y-2">
              <MessageBubble role="user">
                How do I say <ClickableWord>comfortable</ClickableWord>?
              </MessageBubble>
              <MessageBubble role="agent">Say it in three syllables…</MessageBubble>
              <MessageBubble role="agent" streaming>
                Let me explain the stress
              </MessageBubble>
            </LiveRegion>
          ) : (
            <HiddenCaptions onShow={() => setCaptions(true)} />
          )}
          <div className="grid grid-cols-2 gap-3">
            <VocabularyCard
              word="comfortable"
              ipa="ˈkʌmftərbəl"
              meaning="Giving physical ease; không gây khó chịu."
              example="This chair is comfortable."
            />
            <PronunciationCard
              word="comfortable"
              ipa="ˈkʌmftərbəl"
              tip="Stress the first syllable."
              onHear={() => {}}
            />
            <GrammarTipCard
              title="Present perfect"
              body="Use have/has + past participle for experiences."
              example="I have visited Hue."
            />
            <CorrectionCard
              said="I am agree"
              better="I agree"
              why="'Agree' is a verb, not an adjective."
            />
          </div>
          <div className="flex gap-2">
            <ToolUseChip label="Dictionary lookup" running />
            <ToolUseChip label="Dictionary lookup" />
          </div>
        </Section>

        <Section id="ds-dict" title="Dictionary and provider setup">
          <p>
            Click <ClickableWord onClick={() => setDict(true)}>serendipity</ClickableWord> to open
            the dictionary.
          </p>
          <DictionaryDialog
            open={dict}
            onOpenChange={setDict}
            word="serendipity"
            footer={
              <div className="space-y-2">
                <AskAgentButton onClick={() => {}} />
                <QuickPrompts prompts={['Use it in a sentence', 'Synonyms']} onPick={() => {}} />
              </div>
            }
          >
            <p className="text-sm">Finding something good without looking for it.</p>
            <WordImage alt="" />
          </DictionaryDialog>
          <div className="grid max-w-md gap-3">
            <SignInButton provider="Provider" onClick={() => {}} />
            <FormField label="API key" hint="Stored on this computer only.">
              {(p) => <ProviderInput type="password" {...p} />}
            </FormField>
            <FormField label="Model" error="Model not found.">
              {(p) => <ProviderInput {...p} />}
            </FormField>
            <AdvancedFields>
              <FormField label="Base URL">{(p) => <ProviderInput {...p} />}</FormField>
            </AdvancedFields>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setConn(conn === 'ok' ? 'failed' : 'ok')}>
                Test connection
              </Button>
              <ConnectionTestStatus status={conn} detail="timeout" />
            </div>
          </div>
        </Section>

        <Section id="ds-game" title="Game">
          <WorldHeader name="World 1: Café" subtitle="Order, pay, chat" />
          <ProgressSummary
            earned={prog.earned}
            total={prog.total}
            passed={states.filter((s) => s === 'passed').length}
            chapters={states.length}
          />
          <div className="flex flex-col items-center">
            {states.map((s, i) => (
              <div key={i} className="flex flex-col items-center">
                <ChapterNode
                  index={i + 1}
                  title={`Chapter ${i + 1}`}
                  state={s}
                  stars={CHAPTER_STARS[i] ?? 0}
                />
                {i < states.length - 1 && <PathConnector done={s === 'passed'} />}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <StarRating stars={0} />
            <StarRating stars={2} />
            <StarBurst>
              <StarRating stars={3} size="lg" reveal />
            </StarBurst>
            <NewBestBadge />
          </div>
          <div className="flex items-center gap-4">
            <AttemptTracker correct={2} active />
            <AttemptFeedbackChip correct text="Nice!" />
            <AttemptFeedbackChip correct={false} text="Try the 'th' again" />
          </div>
          <div className="grid max-w-md grid-cols-3 gap-3">
            <StatTile label="Best" value="92" />
            <StatTile label="Accuracy" value="84%" />
            <StatTile label="Time" value="1:42" />
          </div>
        </Section>
      </main>
    </TooltipProvider>
  )
}
