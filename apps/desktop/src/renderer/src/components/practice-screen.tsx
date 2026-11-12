import { MandarinResult } from '@/components/mandarin-result'
import { useLearningLanguage } from '@/lib/learning-language'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui'
import {
  AlertTriangle,
  Bookmark,
  ChevronRight,
  Download,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  Upload,
} from 'lucide-react'
import type { HistoryAttempt, PronunciationResult } from '@engclaw/ipc-contract'
import { HearReference } from '@/components/hear-reference'
import { RecordButton } from '@/components/record-button'
import { ModelDownloadDialog } from '@/components/model-download-dialog'
import {
  PhonemesDetail,
  PitchDetail,
  ResultSummary,
  useResultView,
  WordsDetail,
} from '@/components/practice-result'
import { Alert } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  classifyMicError,
  decodeFile,
  isAudioFile,
  MAX_CLIP_SECONDS,
  micGuidance,
  playPcm,
  Recorder,
  type MicErrorReason,
} from '@/lib/audio'
import {
  EXAMPLES,
  formatTimer,
  hasDraft,
  hasText,
  initialTabs,
  loadingMessageKey,
  tabsReducer,
  type PracticeAudio,
  type PracticeEvent,
  type PracticeMode,
} from '@/lib/practice'
import { firstFlagged } from '@/lib/result'
import { notifyStarMoment } from '@/lib/star-prompt'
import { cn } from '@/lib/utils'

const MODES: readonly PracticeMode[] = ['free', 'sentence']
const HISTORY_SHOWN = 5
const HISTORY_FETCH = 50

const platformOf = (p: string): string =>
  /mac/i.test(p) ? 'darwin' : /win/i.test(p) ? 'win32' : 'linux'

/** Records a finished analysis in the local history; a storage failure never blocks the result. */
async function saveAttempt(
  mode: PracticeMode,
  text: string,
  audio: PracticeAudio,
  r: PronunciationResult,
): Promise<boolean> {
  try {
    await window.engclaw.history.save({
      mode,
      text,
      language: r.language,
      score: r.score,
      errors: r.differences.errors.map((e) => ({
        word: e.word,
        expected: e.expected,
        actual: e.actual,
        confidence: e.confidence,
      })),
      audio: audio.samples,
    })
    notifyStarMoment(r.score)
    return true
  } catch (e) {
    console.error('[history] save failed', e)
    return false
  }
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card space-y-3 rounded-xl border border-input p-5">
      <h3 className="text-base font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function Loading({ onCancel, messageKey }: { onCancel: () => void; messageKey?: string }) {
  const { t } = useTranslation()
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const start = Date.now()
    const id = setInterval(() => setElapsed(Date.now() - start), 500)
    return () => clearInterval(id)
  }, [])
  return (
    <div role="status" className="space-y-4" data-testid="practice-loading">
      <p className="text-sm">{t(messageKey ?? loadingMessageKey(elapsed))}</p>
      <Skeleton className="size-24 rounded-full" />
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-6 w-1/2" />
      <Button variant="outline" size="sm" onClick={onCancel}>
        {t('models.cancel')}
      </Button>
    </div>
  )
}

function HistoryList({
  mode,
  items,
  onPick,
}: {
  mode: PracticeMode
  items: HistoryAttempt[]
  onPick: (text: string) => void
}) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' })
  const when = (at: number): string => {
    const minutes = Math.round((at - Date.now()) / 60_000)
    if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute')
    const hours = Math.round(minutes / 60)
    return Math.abs(hours) < 24
      ? rtf.format(hours, 'hour')
      : rtf.format(Math.round(hours / 24), 'day')
  }
  const id = `practice-history-${mode}`
  return (
    <div className="space-y-2" data-testid="practice-history">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-primary-soft focus-visible:ring-ring/50 flex w-full items-center gap-1 rounded-md px-1 py-1 text-left text-sm font-medium focus-visible:ring-[3px] focus-visible:outline-none"
      >
        <ChevronRight
          className={cn('size-4 shrink-0 transition-transform', open && 'rotate-90')}
          aria-hidden="true"
        />
        {t('screens.practice.historyTitle')}
      </button>
      <div id={id} hidden={!open}>
        {items.length === 0 ? (
          <p className="text-muted-foreground px-1 text-sm">{t('screens.practice.historyEmpty')}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {items.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  data-testid="practice-history-item"
                  onClick={() => onPick(a.text)}
                  className="hover:bg-primary-soft focus-visible:ring-ring/50 flex w-full items-center gap-2 px-3 py-2 text-left focus-visible:ring-[3px] focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{a.text}</span>
                    <span className="text-muted-foreground block text-xs">{when(a.createdAt)}</span>
                  </span>
                  {a.hasAudio && (
                    <Bookmark
                      className="text-muted-foreground size-3.5 shrink-0"
                      aria-label={t('screens.practice.historySaved')}
                    />
                  )}
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {Math.round(a.score)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/**
 * Practice (IA doc §3): Input · Result · Detail. Detail folds into the Result pane as tabs below
 * 1440 px. Each tab (Speak freely / Read aloud) keeps its own text, take and result; a request
 * that finishes while its tab is hidden still lands on that tab.
 *
 * Read aloud: type the sentence, record or import audio, analyze.
 * Speak freely: record or import audio, correct the ASR transcript, analyze the corrected text.
 */
export function PracticeScreen() {
  const language = useLearningLanguage()
  const { t } = useTranslation()
  const [state, dispatch] = useReducer(tabsReducer, initialTabs)
  const mode = state.active
  const s = state.tabs[mode]
  const free = mode === 'free'
  const latest = useRef(state)
  latest.current = state

  const location = useLocation()
  useEffect(() => {
    const text = (location.state as { practiceText?: unknown } | null)?.practiceText
    if (typeof text === 'string' && text.trim()) dispatch({ type: 'handoff', text })
  }, [location.key, location.state])

  const [seconds, setSeconds] = useState(0)
  const [level, setLevel] = useState(0)
  const [mic, setMic] = useState<{ reason: MicErrorReason; message: string } | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [confirmTo, setConfirmTo] = useState<PracticeMode | null>(null)
  const [history, setHistory] = useState<HistoryAttempt[]>([])
  const [saved, setSaved] = useState<PronunciationResult | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const recording = useRef<{ rec: Recorder; mode: PracticeMode } | null>(null)
  const levelRef = useRef(0)
  const requestIds = useRef<Record<PracticeMode, string | null>>({ sentence: null, free: null })
  const playing = useRef<{ stop: () => void } | null>(null)

  const send = useCallback(
    (m: PracticeMode, event: PracticeEvent) => dispatch({ type: 'tab', mode: m, event }),
    [],
  )

  const loadHistory = useCallback(() => {
    void window.engclaw.history
      .list({ limit: HISTORY_FETCH, language })
      .then((r) => setHistory(r.attempts.filter((attempt) => attempt.language === language)))
      .catch(() => undefined)
  }, [language])
  useEffect(loadHistory, [loadHistory])

  const analyze = useCallback(
    async (m: PracticeMode, audio: PracticeAudio) => {
      const id = crypto.randomUUID()
      requestIds.current[m] = id
      const text = latest.current.tabs[m].text.trim()
      try {
        const res = await window.engclaw.inference.analyze({
          requestId: id,
          language,
          audio: audio.samples,
          text,
        })
        if (requestIds.current[m] !== id) return
        if (res.ok) {
          const result = res.value
          void saveAttempt(m, text, audio, result).then((ok) => {
            if (ok) setSaved(result)
            loadHistory()
          })
        }
        send(
          m,
          res.ok
            ? { type: 'analyzed', result: res.value }
            : {
                type: 'failed',
                error: { code: res.code, message: res.message, modelId: res.modelId },
              },
        )
      } catch (err) {
        if (requestIds.current[m] === id)
          send(m, {
            type: 'failed',
            error: { code: 'FAILED', message: err instanceof Error ? err.message : '' },
          })
      }
    },
    [send, loadHistory, language],
  )

  const transcribe = useCallback(
    async (m: PracticeMode, audio: PracticeAudio) => {
      const id = crypto.randomUUID()
      requestIds.current[m] = id
      try {
        const res = await window.engclaw.inference.transcribe({
          requestId: id,
          language,
          audio: audio.samples,
        })
        if (requestIds.current[m] !== id) return
        send(
          m,
          res.ok
            ? { type: 'transcribed', text: res.value.text }
            : {
                type: 'failed',
                error: { code: res.code, message: res.message, modelId: res.modelId },
              },
        )
      } catch (err) {
        if (requestIds.current[m] === id)
          send(m, {
            type: 'failed',
            error: { code: 'FAILED', message: err instanceof Error ? err.message : '' },
          })
      }
    },
    [send, language],
  )

  const runTranscribe = (m: PracticeMode): void => {
    const audio = latest.current.tabs[m].audio
    if (!audio) return
    send(m, { type: 'transcribe-requested' })
    void transcribe(m, audio)
  }

  const runAnalyze = (m: PracticeMode): void => {
    const tab = latest.current.tabs[m]
    send(m, { type: 'analyze-requested' })
    if (tab.audio && hasText(tab.text)) void analyze(m, tab.audio)
  }

  const retry = (m: PracticeMode): void =>
    latest.current.tabs[m].step === 'transcribe' ? runTranscribe(m) : runAnalyze(m)

  // A missing model opens the download prompt; once it is installed the same step runs again.
  const missingTab = MODES.find((m) => {
    const tab = state.tabs[m]
    return tab.phase === 'error' && tab.error?.code === 'MODEL_MISSING'
  })
  const missingTabRef = useRef(missingTab)
  missingTabRef.current = missingTab
  const missingError = missingTab ? state.tabs[missingTab].error : null
  useEffect(() => {
    if (missingError) setDownloadOpen(true)
  }, [missingError])

  /** Mode 'free' transcribes new audio straight away; 'sentence' analyzes a take once text is in. */
  const startAuto = (m: PracticeMode, audio: PracticeAudio, fromFile = false): void => {
    const tab = latest.current.tabs[m]
    if (m === 'free' && !(tab.transcribed && hasText(tab.text) && !fromFile)) {
      send(m, { type: 'transcribe-requested' })
      void transcribe(m, audio)
    } else if (!fromFile && hasText(tab.text)) {
      send(m, { type: 'analyze-requested' })
      void analyze(m, audio)
    }
  }

  const stopRecording = async (): Promise<void> => {
    const cur = recording.current
    if (!cur) return
    recording.current = null
    const take = await cur.rec.stop()
    const audio: PracticeAudio = { ...take, source: 'mic', truncated: false }
    send(cur.mode, { type: 'recorded', audio })
    startAuto(cur.mode, audio)
  }

  const startRecording = async (): Promise<void> => {
    if (!free && !hasText(s.text)) return send(mode, { type: 'record-requested' })
    setMic(null)
    setFileError(null)
    setSeconds(0)
    levelRef.current = 0
    const { silenceAutoStop } = await window.engclaw.app.getSettings()
    const rec = new Recorder({
      silenceAutoStop,
      onTick: setSeconds,
      onLevel: (rms) => (levelRef.current = rms),
      onAutoStop: () => void stopRecording(),
    })
    recording.current = { rec, mode }
    try {
      await rec.start()
      send(mode, { type: 'record-requested' })
    } catch (err) {
      recording.current = null
      const reason = classifyMicError(err)
      setMic({ reason, message: t(micGuidance(reason, platformOf(window.navigator.platform))) })
      send(mode, { type: 'record-failed' })
    }
  }

  const loadFile = async (file: File): Promise<void> => {
    setFileError(null)
    setMic(null)
    if (!isAudioFile(file)) return setFileError(t('audio.decodeError'))
    try {
      const d = await decodeFile(file)
      const audio: PracticeAudio = {
        samples: d.samples,
        seconds: d.seconds,
        source: 'file',
        truncated: d.truncated,
      }
      send(mode, { type: 'loaded', audio })
      startAuto(mode, audio, true)
    } catch {
      setFileError(t('audio.decodeError'))
    }
  }

  const cancel = (): void => {
    const id = requestIds.current[mode]
    requestIds.current[mode] = null
    if (id) void window.engclaw.inference.cancel({ requestId: id })
    send(mode, { type: 'failed', error: { code: 'CANCELLED', message: '' } })
  }

  const togglePlay = (): void => {
    if (playing.current) return playing.current.stop()
    if (!s.audio) return
    const h = playPcm(s.audio.samples, 16000)
    playing.current = h
    setIsPlaying(true)
    void h.done.finally(() => {
      playing.current = null
      setIsPlaying(false)
    })
  }

  const requestSwitch = (m: PracticeMode): void => {
    if (m === mode) return
    if (s.phase === 'recording') return setConfirmTo(m)
    setMic(null)
    setFileError(null)
    dispatch({ type: 'switch', mode: m })
  }

  const discardAndSwitch = (): void => {
    const cur = recording.current
    recording.current = null
    if (cur) void cur.rec.stop()
    send(mode, { type: 'record-failed' })
    setMic(null)
    if (confirmTo) dispatch({ type: 'switch', mode: confirmTo })
    setConfirmTo(null)
  }

  useEffect(
    () => () => {
      void recording.current?.rec.stop()
      playing.current?.stop()
      for (const mode of MODES) {
        const requestId = requestIds.current[mode]
        requestIds.current[mode] = null
        if (requestId) void window.engclaw.inference.cancel({ requestId })
      }
    },
    [],
  )

  const isRecording = s.phase === 'recording'
  useEffect(() => {
    if (!isRecording) return setLevel(0)
    const id = setInterval(() => setLevel(Math.min(1, levelRef.current * 8)), 80)
    return () => clearInterval(id)
  }, [isRecording])

  const result = s.result
  const view = useResultView(
    result ??
      ({ differences: { errors: [], expected_phones: [] } } as unknown as PronunciationResult),
    s.text,
  )
  useEffect(() => {
    setSelected(result ? firstFlagged(view.chips) : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when a new result arrives
  }, [result])

  const busy = s.phase === 'recording' || s.phase === 'transcribing' || s.phase === 'analyzing'
  const working = s.phase === 'transcribing' || s.phase === 'analyzing'
  const otherMode: PracticeMode = free ? 'sentence' : 'free'
  const modeName = (m: PracticeMode): string =>
    t(`screens.practice.mode.${m === 'free' ? 'free' : 'read'}`)
  const missing = s.phase === 'error' && s.error?.code === 'MODEL_MISSING'
  const tooLong = s.phase === 'error' && s.error?.code === 'CLIP_TOO_LONG'
  const engineStopped = s.phase === 'error' && s.error?.code === 'PROCESS_CRASHED'
  const canOpenMicSettings =
    mic?.reason === 'denied' && ['darwin', 'win32'].includes(platformOf(window.navigator.platform))
  const recent = history.filter((a) => a.mode === mode && !a.videoId).slice(0, HISTORY_SHOWN)

  // One step on screen at a time: record → review → (loading) → result → details.
  const stage: 'record' | 'review' | 'loading' | 'result' = working
    ? 'loading'
    : s.phase === 'result' && result
      ? 'result'
      : s.audio && s.phase !== 'recording'
        ? 'review'
        : 'record'
  const awaitingEdit = free && s.transcribed && s.phase === 'ready'
  // A fresh transcript puts the cursor in the text: fix it, then check.
  useEffect(() => {
    if (stage === 'review' && awaitingEdit) textRef.current?.focus()
  }, [stage, awaitingEdit])

  const rerecord = (): void => {
    playing.current?.stop()
    send(mode, { type: 'rerecord' })
    void startRecording()
  }
  const onSelect = (position: number): void => {
    setSelected(position)
  }

  const textField = (
    <div className="space-y-2">
      <label htmlFor="practice-text" className="text-sm font-medium">
        {free && s.transcribed
          ? t('result.weHeard')
          : t(free ? 'screens.practice.speakLabel' : 'screens.practice.readLabel')}
      </label>
      <Textarea
        id="practice-text"
        ref={textRef}
        data-testid="practice-text"
        rows={4}
        value={s.text}
        disabled={s.phase === 'recording'}
        className={cn(awaitingEdit && 'border-primary ring-primary/30 ring-[3px]')}
        maxLength={1000}
        aria-invalid={s.hint}
        placeholder={
          language === 'zh'
            ? '你好，我正在学习中文。'
            : t(free ? 'practice.freePlaceholder' : 'practice.placeholder')
        }
        onChange={(e) => send(mode, { type: 'text', text: e.target.value })}
      />
      {s.hint && (
        <p role="alert" className="text-destructive text-sm" data-testid="practice-hint">
          {t('practice.emptyHint')}
        </p>
      )}
    </div>
  )

  const alerts = (
    <>
      {mic && (
        <Alert
          variant="error"
          className="border-destructive space-y-2"
          data-testid="practice-mic-error"
        >
          <p className="flex items-center gap-2 font-medium">
            <MicOff className="size-4" />
            {t(
              mic.reason === 'denied'
                ? 'audio.mic.denied.title'
                : mic.reason === 'notfound'
                  ? 'audio.mic.notfound'
                  : 'audio.mic.unknown',
            )}
          </p>
          {mic.reason === 'denied' && <p className="text-muted-foreground">{mic.message}</p>}
          <div className="flex flex-wrap gap-2">
            {canOpenMicSettings && (
              <Button
                size="sm"
                variant="outline"
                data-testid="practice-mic-settings"
                onClick={() => void window.engclaw.app.openMicSettings()}
              >
                {t('screens.practice.openSettings')}
              </Button>
            )}
            <Button
              size="sm"
              data-testid="practice-mic-retry"
              onClick={() => void startRecording()}
            >
              {engineStopped ? t('practice.restartEngine') : t('practice.retry')}
            </Button>
          </div>
        </Alert>
      )}
      {fileError && (
        <p role="alert" className="text-destructive text-sm">
          {fileError}
        </p>
      )}
      {s.phase === 'error' && s.error && (
        <Alert
          variant={missing ? 'default' : 'error'}
          className={cn('space-y-2', missing ? 'border-warning' : 'border-destructive')}
          data-testid="practice-error"
        >
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" />
            {missing
              ? t('practice.error.modelMissing')
              : tooLong
                ? t('practice.error.clipTooLong')
                : engineStopped
                  ? t('practice.error.engineStopped')
                  : t('practice.error.failed')}
          </p>
          {!missing && <p className="text-muted-foreground">{t('screens.practice.keptAudio')}</p>}
          {engineStopped && s.error.message && (
            <p
              data-testid="practice-error-detail"
              className="text-muted-foreground text-sm break-words"
            >
              {s.error.message}
            </p>
          )}
          {missing ? (
            <Button
              size="sm"
              data-testid="practice-download-models"
              onClick={() => setDownloadOpen(true)}
            >
              <Download />
              {t('practice.downloadModels')}
            </Button>
          ) : (
            <Button size="sm" data-testid="practice-retry" onClick={() => retry(mode)}>
              <RotateCcw />
              {t('practice.retry')}
            </Button>
          )}
        </Alert>
      )}
    </>
  )

  const recordStep = (
    <>
      {free && !hasText(s.text) ? (
        <p className="text-foreground pt-4 text-center text-xl" data-testid="practice-prompt">
          {t('screens.practice.helper.free')}
        </p>
      ) : (
        <div className="bg-card space-y-4 rounded-xl border border-input p-5">
          {textField}
          {!free && (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium">
                {t('screens.practice.examples')}
              </p>
              <div className="flex flex-wrap gap-2">
                {(language === 'zh'
                  ? ['你好，我正在学习中文。', '请说慢一点。', '今天你想做什么？']
                  : EXAMPLES
                ).map((ex) => (
                  <Button
                    key={ex}
                    variant="secondary"
                    size="xs"
                    data-testid="practice-example"
                    disabled={busy}
                    onClick={() => send(mode, { type: 'text', text: ex })}
                  >
                    {ex}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <HearReference text={s.text} variant="outline" />
        </div>
      )}
      <div className="flex justify-center">
        <RecordButton
          recording={isRecording}
          level={level}
          timer={formatTimer(seconds)}
          disabled={busy && !isRecording}
          onStart={() => void startRecording()}
          onStop={() => void stopRecording()}
        />
      </div>
      <div
        className={cn(
          'text-muted-foreground flex justify-center rounded-md',
          dragging && 'bg-primary-soft ring-ring/50 ring-[3px]',
        )}
      >
        <label
          title={t('audio.drop')}
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'sm' }),
            'focus-within:ring-ring/50 cursor-pointer focus-within:ring-[3px]',
            busy && 'pointer-events-none opacity-50',
          )}
        >
          <Upload />
          {t('audio.import')}
          <input
            data-testid="practice-upload"
            type="file"
            accept="audio/*,.wav,.mp3,.m4a,.ogg,.oga,.flac,.webm,.aac"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void loadFile(f)
            }}
          />
        </label>
      </div>
      {alerts}
      <HistoryList
        key={mode}
        mode={mode}
        items={recent}
        onPick={(text) => {
          if (!free && !busy) send(mode, { type: 'text', text })
        }}
      />
    </>
  )

  const reviewStep = s.audio && (
    <>
      <div className="bg-card space-y-4 rounded-xl border border-input p-5">
        {textField}
        <p
          className={cn(
            'text-sm',
            awaitingEdit ? 'text-foreground font-medium' : 'text-muted-foreground',
          )}
          data-testid="practice-review-hint"
        >
          {free && !s.transcribed
            ? t('practice.transcriptNote')
            : t(free ? 'screens.practice.reviewHint' : 'screens.practice.reviewHintRead')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2" data-testid="practice-review">
        <HearReference text={s.text} variant="outline" />
        <Button variant="outline" size="sm" data-testid="practice-play" onClick={togglePlay}>
          {isPlaying ? <Pause /> : <Play />}
          {t('screens.practice.playTake')}
          <span className="text-muted-foreground tabular-nums">{formatTimer(s.audio.seconds)}</span>
        </Button>
        <Button variant="ghost" size="sm" data-testid="practice-rerecord" onClick={rerecord}>
          <Mic />
          {t('screens.practice.reRecord')}
        </Button>
      </div>
      {s.audio.truncated && (
        <p className="text-muted-foreground text-xs">
          {t('audio.truncated', { minutes: MAX_CLIP_SECONDS / 60 })}
        </p>
      )}
      {free && !s.transcribed ? (
        <Button size="lg" data-testid="practice-transcribe" onClick={() => runTranscribe(mode)}>
          {t('practice.transcribe')}
        </Button>
      ) : (
        <Button
          size="lg"
          data-testid="practice-analyze"
          disabled={!hasText(s.text)}
          onClick={() => runAnalyze(mode)}
        >
          {t('screens.practice.check')}
        </Button>
      )}
      {alerts}
    </>
  )

  const body =
    stage === 'loading' ? (
      <Loading
        onCancel={cancel}
        messageKey={s.phase === 'transcribing' ? 'practice.transcribing' : undefined}
      />
    ) : stage === 'result' && result?.assessment === 'character-accuracy' ? (
      <MandarinResult result={result} text={s.text} onReplay={togglePlay} onRetry={rerecord} />
    ) : stage === 'result' && result ? (
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <ResultSummary
            result={result}
            view={view}
            selected={selected}
            saved={saved === result}
            onSelect={onSelect}
            onTryAgain={rerecord}
            onReplay={togglePlay}
            onSpeakFreely={free ? undefined : () => requestSwitch('free')}
            onStartOver={free ? () => send(mode, { type: 'reset' }) : undefined}
          />
          <DetailSection title={t('screens.practice.tabPhonemes')}>
            <PhonemesDetail result={result} view={view} />
          </DetailSection>
        </div>
        <div className="space-y-5">
          <DetailSection title={t('screens.practice.tabWords')}>
            <WordsDetail view={view} selected={selected} onSelect={setSelected} />
          </DetailSection>
          <DetailSection title={t('screens.practice.tabPitch')}>
            <PitchDetail result={result} />
          </DetailSection>
        </div>
      </div>
    ) : stage === 'review' ? (
      reviewStep
    ) : (
      recordStep
    )

  return (
    <section
      className="relative flex h-full flex-col"
      data-testid="practice-card"
      aria-label={t('practice.title')}
      data-stage={stage}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const f = e.dataTransfer.files[0]
        if (f && !busy && stage === 'record') void loadFile(f)
      }}
    >
      {language === 'zh' && (
        <p className="px-6 pt-3 text-sm text-muted-foreground">{t('learning.assessmentNote')}</p>
      )}
      <Tabs
        value={mode}
        onValueChange={(v) => requestSwitch(v as PracticeMode)}
        className="min-h-0 flex-1 gap-0"
      >
        <div className="mx-auto flex w-full max-w-xl shrink-0 flex-col items-center gap-2 px-6 pt-5">
          <div>
            <TabsList aria-label={t('practice.mode.label')}>
              {MODES.map((m) => (
                <TabsTrigger key={m} value={m} data-testid={`practice-mode-${m}`}>
                  {modeName(m)}
                  {m === otherMode && hasDraft(state.tabs[m]) && (
                    <>
                      <span aria-hidden="true" className="bg-primary size-1.5 rounded-full" />
                      <span className="sr-only">{t('screens.practice.draftDot')}</span>
                    </>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {hasDraft(state.tabs[otherMode]) && (
            <span className="text-muted-foreground text-xs" data-testid="practice-draft-kept">
              {t('screens.practice.draftKept', { tab: modeName(otherMode) })}
            </span>
          )}
        </div>
        <TabsContent value={mode} className="min-h-0 flex-1 overflow-auto">
          <div
            className={cn(
              'mx-auto flex w-full flex-col gap-5 p-6',
              stage === 'result' ? 'max-w-6xl' : 'max-w-xl',
            )}
          >
            {body}
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialogPrimitive.Root
        open={confirmTo !== null}
        onOpenChange={(open) => !open && setConfirmTo(null)}
      >
        <AlertDialogPrimitive.Portal>
          <AlertDialogPrimitive.Overlay className="bg-background/70 fixed inset-0 z-50 backdrop-blur-[1px]" />
          <AlertDialogPrimitive.Content
            data-testid="practice-switch-confirm"
            className="bg-card fixed top-1/2 left-1/2 z-50 w-120 max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-xl border p-6 shadow-lg"
          >
            <AlertDialogPrimitive.Title className="text-lg font-semibold">
              {t('screens.practice.switchTitle', { tab: confirmTo ? modeName(confirmTo) : '' })}
            </AlertDialogPrimitive.Title>
            <AlertDialogPrimitive.Description className="text-muted-foreground text-sm">
              {t('screens.practice.switchBody')}
            </AlertDialogPrimitive.Description>
            <footer className="flex flex-wrap justify-end gap-2">
              <AlertDialogPrimitive.Action asChild>
                <Button
                  variant="outline"
                  data-testid="practice-switch-discard"
                  onClick={discardAndSwitch}
                >
                  {t('screens.practice.switchDiscard')}
                </Button>
              </AlertDialogPrimitive.Action>
              <AlertDialogPrimitive.Cancel asChild>
                <Button data-testid="practice-switch-stay">
                  {t('screens.practice.switchStay')}
                </Button>
              </AlertDialogPrimitive.Cancel>
            </footer>
          </AlertDialogPrimitive.Content>
        </AlertDialogPrimitive.Portal>
      </AlertDialogPrimitive.Root>

      <ModelDownloadDialog
        open={downloadOpen}
        onOpenChange={setDownloadOpen}
        onReady={() => {
          setDownloadOpen(false)
          const m = missingTabRef.current
          if (m) retry(m)
        }}
      />
    </section>
  )
}
