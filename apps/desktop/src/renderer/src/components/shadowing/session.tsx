import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  List,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  WifiOff,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DictationActions, DictationRail, DictationSheet } from '@/components/shadowing/dictation'
import { ResultSidebar, ResultSidebarBody } from '@/components/result-sidebar'
import { AttemptPanel } from '@/components/shadowing/attempt-panel'
import { PlayerSurface } from '@/components/shadowing/player-surface'
import { SentenceWords } from '@/components/shadowing/sentence-words'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ClickableText } from '@/components/ui/clickable-text'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DEFAULT_BLANK_PERCENT, scoreSegment } from '@/lib/dictation'
import { alignIpa } from '@/lib/ipa'
import { useDictation } from '@/lib/use-dictation'
import { useShowIpa, useTranscriptIpa } from '@/lib/use-ipa'
import { usePrefetchProsody, useSegmentProsody, useShowProsody } from '@/lib/use-prosody'
import { useSegmentAttempt } from '@/lib/use-segment-attempt'
import { useSentenceLoop } from '@/lib/use-sentence-loop'
import {
  DEFAULT_SETTINGS,
  MAX_AUTO_CONTINUE,
  MAX_REPEAT,
  SPEED_OPTIONS,
  shortcutFor,
} from '@/lib/sentence-loop'
import { useWordLookup } from '@/lib/word-lookup'
import { fitDictation, fitStage, formatClock, type Segment } from '@/lib/shadowing'
import { cn } from '@/lib/utils'

const REPEAT_CYCLE = [1, 3, MAX_REPEAT]
const DICTATION_SHORTCUTS: Record<
  string,
  'check' | 'cycleRepeat' | { type: 'back' | 'next' | 'replay' | 'toggle' }
> = {
  arrowleft: { type: 'back' },
  arrowright: { type: 'next' },
  r: { type: 'replay' },
  ' ': { type: 'toggle' },
  enter: 'check',
  l: 'cycleRepeat',
}

/** Fixed chrome under the video and sentence: the control bar plus the gaps between blocks. */
const CHROME_HEIGHT = 64 + 12

/** The dictation action row under the sentence, plus its gap. */
const ACTIONS_HEIGHT = 44

function useContentSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const r = entry?.contentRect
      if (r) setSize({ width: r.width, height: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

/** The shadowing stage (IA doc §4.2): video and current sentence as large as the window allows. */
export function ShadowingSession({
  videoId,
  title,
  segments,
  onBack,
}: {
  videoId: string
  title: string
  segments: readonly Segment[]
  onBack: () => void
}) {
  const { t } = useTranslation()
  const lookup = useWordLookup()
  const [mode, setMode] = useState<'shadowing' | 'dictation'>('shadowing')
  const dictation = mode === 'dictation'
  const { state, retry, loop, settings, setSettings, dispatch, runShortcut } = useSentenceLoop(
    videoId,
    segments,
    dictation,
  )
  const index = loop.index
  const [percent, setPercent] = useState(DEFAULT_BLANK_PERCENT)
  const [autoAdvance, setAutoAdvance] = useState(false)
  const dict = useDictation(segments, percent)
  const entry = dict.entries.get(index)
  const { ensure } = dict
  useEffect(() => {
    if (dictation) ensure(index)
  }, [dictation, index, ensure])
  const checkedRight = !!entry?.result && scoreSegment(entry.result) === 1
  const [railOpen, setRailOpen] = useState(true)
  const [sideTab, setSideTab] = useState<'transcript' | 'attempt'>('attempt')
  const [speedOpen, setSpeedOpen] = useState(false)
  const autoOn = settings.autoContinuePct > 0
  const lastAutoPct = useRef(autoOn ? settings.autoContinuePct : DEFAULT_SETTINGS.autoContinuePct)
  if (autoOn) lastAutoPct.current = settings.autoContinuePct
  const [showIpa, setShowIpa] = useShowIpa()
  const { state: ipa, retry: retryIpa } = useTranscriptIpa(videoId, segments, showIpa)
  const [showProsody, setShowProsody] = useShowProsody()
  usePrefetchProsody(videoId, segments, index)
  const { state: prosody, retry: retryProsody } = useSegmentProsody(
    videoId,
    segments[index],
    showProsody,
  )
  const pauseForRecording = useCallback(() => {
    if (loop.mode === 'playing' || loop.mode === 'waiting') dispatch({ type: 'toggle' })
  }, [loop.mode, dispatch])
  const attempt = useSegmentAttempt(videoId, segments, index, pauseForRecording)
  const [stageRef, stage] = useContentSize()
  const toggleRecord = useCallback(() => {
    setRailOpen(true)
    setSideTab('attempt')
    attempt.toggleRecord()
  }, [attempt])
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const shown = segments[index]
  const fit = dictation
    ? fitDictation({
        stageWidth: stage.width,
        stageHeight: stage.height,
        chromeHeight: CHROME_HEIGHT + ACTIONS_HEIGHT,
        sentenceChars: (shown?.text.length ?? 0) + (entry?.blanks.length ?? 0) * 5,
        extraHeight: (shown && shown.end - shown.start > 15 ? 24 : 0) + 8,
      })
    : fitStage({
        stageWidth: stage.width,
        stageHeight: stage.height,
        chromeHeight: CHROME_HEIGHT,
        sentenceChars: (shown?.text.length ?? 0) * (1 + (showIpa ? 1 : 0)),
      })
  const ipaWords = (text: string) => {
    if (!showIpa || ipa.status !== 'ready') return null
    const words = ipa.byText.get(text)
    return words ? alignIpa(text, words) : null
  }
  const shownIpa = shown && showIpa ? ipaWords(shown.text) : null
  const failed = state.phase === 'error'
  const blocked = state.phase !== 'ready'

  const { check } = dict
  const runCheck = useCallback(() => {
    if (blocked || entry?.result) return
    if (loop.mode === 'playing' || loop.mode === 'waiting') dispatch({ type: 'toggle' })
    check(index)
  }, [blocked, entry?.result, loop.mode, dispatch, check, index])

  useEffect(() => {
    if (!dictation || !autoAdvance || !checkedRight || index >= segments.length - 1) return
    const timer = setTimeout(() => dispatch({ type: 'next' }), 2000)
    return () => clearTimeout(timer)
  }, [dictation, autoAdvance, checkedRight, index, segments.length, dispatch])

  useEffect(() => {
    if (railOpen) itemRefs.current[index]?.scrollIntoView({ block: 'nearest' })
  }, [index, railOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('[role="dialog"]')) return
      if (dictation) {
        if (!(e.metaKey || e.ctrlKey) || e.altKey) return
        const cmd = DICTATION_SHORTCUTS[e.key.toLowerCase()]
        if (!cmd || blocked) return
        e.preventDefault()
        if (cmd === 'check') runCheck()
        else if (cmd === 'cycleRepeat') {
          const at = REPEAT_CYCLE.indexOf(settings.repeat)
          setSettings({ repeat: REPEAT_CYCLE[(at + 1) % REPEAT_CYCLE.length]! })
        } else dispatch(cmd)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable], [role="radiogroup"]')) return
      if (e.key.toLowerCase() === 't') {
        setRailOpen((open) => !open)
        return
      }
      if (e.key.toLowerCase() === 'm') {
        if (!blocked) toggleRecord()
        return
      }
      if (e.key.toLowerCase() === 'i') {
        setShowIpa(!showIpa)
        return
      }
      if (e.key.toLowerCase() === 'p') {
        setShowProsody(!showProsody)
        return
      }
      if (e.key === ' ' && target?.closest('button, a')) return
      const cmd = shortcutFor(e.key)
      if (!cmd || blocked) return
      e.preventDefault()
      runShortcut(cmd)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    blocked,
    runShortcut,
    showIpa,
    setShowIpa,
    showProsody,
    setShowProsody,
    toggleRecord,
    dictation,
    runCheck,
    dispatch,
    settings.repeat,
    setSettings,
  ])

  return (
    <div data-testid="shadowing-session" className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft />
          {t('screens.shadowing.another')}
        </Button>
        <h2 className="min-w-0 flex-1 truncate font-medium" data-testid="shadowing-title">
          {title}
        </h2>
        <div role="status" className="flex shrink-0 items-center">
          {loop.mode === 'waiting' ? (
            <Badge data-testid="shadowing-your-turn">{t('screens.shadowing.yourTurn')}</Badge>
          ) : loop.mode === 'playing' && settings.repeat > 1 ? (
            <Badge variant="outline" className="tabular-nums" data-testid="shadowing-plays">
              {t('screens.shadowing.play', { n: loop.plays, total: settings.repeat })}
            </Badge>
          ) : null}
        </div>
        <Badge variant="secondary" className="tabular-nums" data-testid="shadowing-position">
          {t('screens.shadowing.segment', {
            n: index + 1,
            total: segments.length,
          })}
        </Badge>
        <div
          role="group"
          aria-label={t('screens.shadowing.modeLabel')}
          className="flex shrink-0 items-center gap-1"
        >
          {(['shadowing', 'dictation'] as const).map((m) => (
            <Button
              key={m}
              size="sm"
              variant={mode === m ? 'secondary' : 'ghost'}
              aria-pressed={mode === m}
              data-testid={`mode-${m}`}
              onClick={() => setMode(m)}
            >
              {t(`screens.shadowing.mode.${m}`)}
            </Button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('screens.shadowing.toggleRail')}
          aria-pressed={railOpen}
          onClick={() => setRailOpen((open) => !open)}
        >
          <List />
        </Button>
      </div>
      <div
        className={cn(
          'grid min-h-0 flex-1',
          railOpen ? 'grid-cols-[minmax(0,1fr)_400px]' : 'grid-cols-1',
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-col p-4">
          <div ref={stageRef} className="flex min-h-0 flex-1 flex-col items-center gap-3">
            <div
              className="relative shrink-0"
              style={{ width: fit.videoWidth, height: fit.videoHeight }}
            >
              <PlayerSurface
                width={fit.videoWidth}
                height={fit.videoHeight}
                visible={!failed && fit.videoWidth > 0 && !speedOpen}
                label={t('screens.shadowing.videoAlt')}
              />
              {failed && (
                <div
                  role="alert"
                  data-testid="shadowing-player-error"
                  className="bg-muted absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg border p-4 text-center text-sm"
                >
                  {state.error === 'NETWORK' ? (
                    <WifiOff className="size-6" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="text-warning size-6" aria-hidden="true" />
                  )}
                  <p>
                    {t(
                      state.error === 'NETWORK'
                        ? 'screens.shadowing.error.network'
                        : 'screens.shadowing.error.unavailable',
                    )}
                  </p>
                  {state.error === 'NETWORK' ? (
                    <Button size="sm" variant="outline" onClick={retry}>
                      {t('practice.retry')}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={onBack}>
                      {t('screens.shadowing.another')}
                    </Button>
                  )}
                </div>
              )}
            </div>
            {dictation ? (
              <div
                className="order-3 w-full shrink-0 overflow-auto text-center"
                style={{ height: fit.sentenceHeight }}
              >
                {shown && entry && (
                  <DictationSheet
                    segment={shown}
                    entry={entry}
                    onAnswer={(blank, value) => dict.setAnswer(index, blank, value)}
                    onCheck={runCheck}
                    fontSize={fit.fontSize}
                  />
                )}
              </div>
            ) : (
              <div
                className="w-full shrink-0 overflow-auto text-center"
                style={{ height: fit.sentenceHeight }}
              >
                {shown && (
                  <div className="leading-snug" style={{ fontSize: fit.fontSize }}>
                    <SentenceWords
                      text={shown.text}
                      ipa={shownIpa}
                      showIpa={showIpa}
                      prosody={showProsody ? prosody : null}
                    />
                  </div>
                )}
              </div>
            )}
            <div className="order-2 flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <div
                role="toolbar"
                aria-label={t('ds.player.label')}
                className="flex items-center gap-2"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid="shadowing-back"
                  aria-label={t('ds.player.prev')}
                  aria-keyshortcuts="ArrowLeft"
                  disabled={blocked}
                  onClick={() => dispatch({ type: 'back' })}
                >
                  <SkipBack />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid="shadowing-replay"
                  aria-label={t('screens.shadowing.replay')}
                  aria-keyshortcuts="R"
                  disabled={blocked}
                  onClick={() => dispatch({ type: 'replay' })}
                >
                  <RotateCcw />
                </Button>
                <Button
                  size="icon"
                  data-testid="shadowing-toggle"
                  aria-label={state.playing ? t('ds.player.pause') : t('ds.player.play')}
                  aria-keyshortcuts="Space"
                  disabled={blocked}
                  onClick={() => dispatch({ type: 'toggle' })}
                >
                  {state.playing ? <Pause /> : <Play />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid="shadowing-next"
                  aria-label={t('ds.player.next')}
                  aria-keyshortcuts="ArrowRight"
                  disabled={blocked}
                  onClick={() => dispatch({ type: 'next' })}
                >
                  <SkipForward />
                </Button>
              </div>
              <DropdownMenu open={speedOpen} onOpenChange={setSpeedOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="tabular-nums"
                    aria-label={`${t('ds.player.speed')}: ${settings.speed}×`}
                    data-testid="shadowing-speed"
                  >
                    {settings.speed}×
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center">
                  <DropdownMenuRadioGroup
                    value={String(settings.speed)}
                    onValueChange={(v) => setSettings({ speed: Number(v) })}
                  >
                    {SPEED_OPTIONS.map((s) => (
                      <DropdownMenuRadioItem key={s} value={String(s)} className="tabular-nums">
                        {s}×
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <label className="flex items-center gap-2 text-sm">
                {t('screens.shadowing.repeat')}
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_REPEAT}
                  step={1}
                  className="w-16"
                  data-testid="shadowing-repeat"
                  aria-keyshortcuts="- ="
                  value={settings.repeat}
                  onChange={(e) => {
                    const n = e.currentTarget.valueAsNumber
                    if (Number.isFinite(n)) setSettings({ repeat: n })
                  }}
                />
              </label>
              {dictation && (
                <div className="flex items-center gap-2 text-sm">
                  <Switch
                    id="dictation-auto-advance"
                    size="sm"
                    data-testid="dictation-auto-advance"
                    checked={autoAdvance}
                    onCheckedChange={setAutoAdvance}
                  />
                  <label htmlFor="dictation-auto-advance">
                    {t('screens.dictation.autoAdvance')}
                  </label>
                </div>
              )}
              {!dictation && (
                <div className="flex items-center gap-2 text-sm">
                  <Switch
                    id="shadowing-auto-on"
                    size="sm"
                    data-testid="shadowing-auto-toggle"
                    checked={autoOn}
                    onCheckedChange={(on) => {
                      if (!on && settings.autoContinuePct > 0)
                        lastAutoPct.current = settings.autoContinuePct
                      setSettings({ autoContinuePct: on ? lastAutoPct.current : 0 })
                    }}
                  />
                  <label htmlFor="shadowing-auto">{t('screens.shadowing.autoContinue')}</label>
                  <Input
                    id="shadowing-auto"
                    disabled={!autoOn}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_AUTO_CONTINUE}
                    step={25}
                    className="w-20"
                    data-testid="shadowing-auto"
                    aria-keyshortcuts=", ."
                    aria-describedby="shadowing-auto-hint"
                    value={settings.autoContinuePct}
                    onChange={(e) => {
                      const n = e.currentTarget.valueAsNumber
                      if (Number.isFinite(n)) setSettings({ autoContinuePct: n })
                    }}
                  />
                  <span aria-hidden="true">%</span>
                  <span id="shadowing-auto-hint" className="sr-only">
                    {t('screens.shadowing.autoContinueHint')}
                  </span>
                </div>
              )}
              {!dictation && (
                <div className="relative flex items-center gap-2 text-sm">
                  <Switch
                    id="shadowing-ipa"
                    size="sm"
                    data-testid="shadowing-ipa-toggle"
                    aria-keyshortcuts="I"
                    aria-label={t('screens.shadowing.ipaHint')}
                    checked={showIpa}
                    onCheckedChange={setShowIpa}
                  />
                  <label htmlFor="shadowing-ipa" title={t('screens.shadowing.ipaHint')}>
                    {t('screens.shadowing.ipa')}
                  </label>
                  {showIpa && ipa.status === 'loading' && (
                    <span
                      role="status"
                      className="text-muted-foreground absolute top-full left-0 mt-1 whitespace-nowrap"
                    >
                      {t('screens.shadowing.ipaLoading')}
                    </span>
                  )}
                  {showIpa && ipa.status === 'error' && (
                    <span
                      role="alert"
                      className="absolute top-full left-0 mt-1 flex items-center gap-1 whitespace-nowrap"
                    >
                      {t('screens.shadowing.ipaError')}
                      <Button size="sm" variant="outline" onClick={retryIpa}>
                        {t('practice.retry')}
                      </Button>
                    </span>
                  )}
                </div>
              )}
              {!dictation && (
                <div className="relative flex items-center gap-2 text-sm">
                  <Switch
                    id="shadowing-prosody"
                    size="sm"
                    data-testid="shadowing-prosody-toggle"
                    aria-keyshortcuts="P"
                    checked={showProsody}
                    onCheckedChange={setShowProsody}
                  />
                  <label htmlFor="shadowing-prosody">{t('screens.shadowing.prosody.toggle')}</label>
                  {showProsody && prosody.status === 'loading' && (
                    <span
                      role="status"
                      data-testid="shadowing-prosody-loading"
                      className="text-muted-foreground absolute top-full left-0 mt-1 whitespace-nowrap"
                    >
                      {t('screens.shadowing.prosody.loading')}
                    </span>
                  )}
                  {showProsody && prosody.status === 'error' && (
                    <span
                      role="alert"
                      data-testid="shadowing-prosody-error"
                      className="absolute top-full left-0 mt-1 flex items-center gap-1 whitespace-nowrap"
                    >
                      {t('screens.shadowing.prosody.error')}
                      <Button size="sm" variant="outline" onClick={retryProsody}>
                        {t('practice.retry')}
                      </Button>
                    </span>
                  )}
                </div>
              )}
            </div>
            {dictation && entry && (
              <div className="order-4 flex shrink-0 justify-center">
                <DictationActions
                  checked={!!entry.result}
                  percent={percent}
                  onPercent={setPercent}
                  onCheck={runCheck}
                  onNewBlanks={() => dict.newBlanks(index)}
                  onRetry={() => dict.retry(index)}
                />
              </div>
            )}
          </div>
        </div>
        {dictation && railOpen && (
          <DictationRail
            segments={segments}
            index={index}
            results={dict.results}
            score={dict.score}
            review={dict.review}
            onSelect={(i) => dispatch({ type: 'start', index: i })}
          />
        )}
        {!dictation && railOpen && (
          <ResultSidebar
            label={t('screens.shadowing.transcript')}
            testId="shadowing-sidebar"
            header={
              <Tabs
                value={sideTab}
                onValueChange={(v) => setSideTab(v as 'transcript' | 'attempt')}
                className="shrink-0 items-center p-2"
              >
                <TabsList>
                  <TabsTrigger value="attempt" data-testid="shadowing-tab-attempt">
                    {t('screens.shadowing.attemptTab')}
                  </TabsTrigger>
                  <TabsTrigger value="transcript" data-testid="shadowing-tab-transcript">
                    {t('screens.shadowing.transcript')}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            }
          >
            <ResultSidebarBody hidden={sideTab !== 'transcript'}>
              <ol className="space-y-1 text-sm" data-testid="shadowing-rail">
                {segments.map((s, i) => (
                  <li key={s.index}>
                    {/* Words are inert spans (see ClickableText `light`); the clock button is the keyboard target. */}
                    <div
                      aria-current={i === index ? 'true' : undefined}
                      onClick={(e) => {
                        const word = (e.target as HTMLElement).closest<HTMLElement>('[data-word]')
                        if (!word) dispatch({ type: 'start', index: i })
                        else if (!window.getSelection()?.toString().trim())
                          lookup?.(word.dataset['word']!)
                      }}
                      className={cn(
                        'hover:bg-muted flex w-full cursor-pointer gap-2 rounded-md px-2 py-1.5 text-left',
                        i === index && 'bg-primary-soft font-medium',
                      )}
                    >
                      <button
                        type="button"
                        ref={(el) => {
                          itemRefs.current[i] = el
                        }}
                        aria-label={t('screens.shadowing.segment', {
                          n: i + 1,
                          total: segments.length,
                        })}
                        className="focus-visible:ring-ring/50 text-muted-foreground w-10 shrink-0 rounded text-left tabular-nums outline-none focus-visible:ring-[3px]"
                      >
                        {formatClock(s.start)}
                      </button>
                      <span className="min-w-0 flex-1">
                        <ClickableText text={s.text} light />
                        {showIpa && (
                          <span
                            lang="en-fonipa"
                            className="text-muted-foreground block truncate text-xs font-normal"
                          >
                            {ipaWords(s.text)
                              ?.map((tok) => tok.ipa)
                              .filter(Boolean)
                              .map((v) => `/${v}/`)
                              .join(' ') || '\u00a0'}
                          </span>
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </ResultSidebarBody>
            <ResultSidebarBody hidden={sideTab !== 'attempt'}>
              <AttemptPanel
                state={attempt.state}
                intonation={attempt.intonation}
                text={shown?.text ?? ''}
                best={attempt.best}
                disabled={blocked}
                onToggleRecord={toggleRecord}
                onPlay={attempt.play}
                onRetry={attempt.retry}
              />
            </ResultSidebarBody>
          </ResultSidebar>
        )}
      </div>
    </div>
  )
}
