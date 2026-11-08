import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useBlocker, useNavigate, useParams } from 'react-router'
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui'
import { AlertTriangle, MicOff, X } from 'lucide-react'
import {
  addAttempt,
  correctCount,
  evaluateAttempt,
  isPassed,
  newRun,
  runResult,
  isNewBest,
  REQUIRED_CORRECT,
  totalAttempts,
  type Attempt,
  type ChapterRun,
} from '@engclaw/game'
import type { GameChapter, GameProgressEntry, PronunciationResult } from '@engclaw/ipc-contract'
import { HearReference } from '@/components/hear-reference'
import { ModelDownloadDialog } from '@/components/model-download-dialog'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ChapterResultCard } from '@/components/game-result-card'
import { AttemptFeedbackChip, AttemptTracker, StarRating } from '@/components/ui/game'
import { RecordButton } from '@/components/record-button'
import {
  PronunciationResultSections,
  ResultSidebar,
  ResultSidebarBody,
} from '@/components/result-sidebar'
import {
  classifyMicError,
  playPcm,
  micGuidance,
  Recorder as MicRecorder,
  type MicErrorReason,
} from '@/lib/audio'
import { formatTimer } from '@/lib/practice'

type Chapter = NonNullable<GameChapter['chapter']>
type Phase = 'idle' | 'recording' | 'analyzing'
interface Last {
  attempt: Attempt
  result: PronunciationResult
  samples: Float32Array
}

const platformOf = (p: string): string =>
  /mac/i.test(p) ? 'darwin' : /win/i.test(p) ? 'win32' : 'linux'

export function GameChapterPage() {
  const { order: param } = useParams()
  const order = Number(param)
  const { t } = useTranslation()
  const [data, setData] = useState<GameChapter | null>(null)
  useEffect(() => {
    setData(null)
    if (Number.isInteger(order) && order >= 1)
      void window.engclaw.game.chapter({ order }).then(setData)
    else setData({ chapter: null, total: 0, unlocked: false, best: null })
  }, [order])

  if (!data) return <p role="status">{t('screens.game.loadingChapter')}</p>
  if (!data.chapter)
    return (
      <section className="mx-auto max-w-2xl space-y-3" data-testid="game-not-found">
        <p>{t('screens.game.chapterNotFound')}</p>
        <Button asChild variant="outline">
          <Link to="/game">{t('screens.game.backMap')}</Link>
        </Button>
      </section>
    )
  if (!data.unlocked)
    return (
      <section className="mx-auto max-w-2xl space-y-3 p-6" data-testid="game-locked">
        <p>{t('screens.game.chapterLocked', { n: data.chapter.order - 1 })}</p>
        <Button asChild variant="outline">
          <Link to="/game">{t('screens.game.backMap')}</Link>
        </Button>
      </section>
    )
  return (
    <ChapterPlay key={data.chapter.id} chapter={data.chapter} total={data.total} best={data.best} />
  )
}

/** Records a finished analysis in the practice history; a storage failure never blocks the run. */
async function saveToHistory(text: string, r: PronunciationResult, samples: Float32Array) {
  try {
    await window.engclaw.history.save({
      mode: 'sentence',
      text,
      language: r.language,
      score: r.score,
      errors: r.differences.errors.map((e) => ({
        word: e.word,
        expected: e.expected,
        actual: e.actual,
        confidence: e.confidence,
      })),
      audio: samples,
    })
  } catch (e) {
    console.error('[history] save failed', e)
  }
}

interface Outcome {
  previous: GameProgressEntry | null
  progress: GameProgressEntry
  improved: boolean
}

function ChapterPlay({
  chapter,
  total,
  best: storedBest,
}: {
  chapter: Chapter
  total: number
  best: GameProgressEntry | null
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [run, setRun] = useState<ChapterRun>(newRun)
  const [last, setLast] = useState<Last | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [seconds, setSeconds] = useState(0)
  const [level, setLevel] = useState(0)
  const [mic, setMic] = useState<{ reason: MicErrorReason; message: string } | null>(null)
  const [failed, setFailed] = useState(false)
  const [best, setBest] = useState(storedBest)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const playing = useRef<{ stop: () => void } | null>(null)
  const recorder = useRef<MicRecorder | null>(null)
  const levelRef = useRef(0)
  const requestId = useRef<string | null>(null)
  const pending = useRef<Float32Array | null>(null)
  const passed = isPassed(run)
  const correct = correctCount(run)
  const result = runResult(run)

  useEffect(() => {
    const result = runResult(run)
    if (!result) return
    void window.engclaw.game
      .record({ order: chapter.order, ...result })
      .then((o) => {
        setOutcome(o)
        setBest(o.progress)
      })
      .catch((e: unknown) => console.error('[game] record failed', e))
  }, [passed]) // eslint-disable-line react-hooks/exhaustive-deps

  const blocker = useBlocker(() => totalAttempts(run) > 0 && !passed)

  useEffect(() => {
    if (phase !== 'recording') return
    const id = setInterval(() => setLevel(Math.min(1, levelRef.current * 8)), 80)
    return () => clearInterval(id)
  }, [phase])

  useEffect(
    () => () => {
      playing.current?.stop()
      void recorder.current?.stop().catch(() => undefined)
      if (requestId.current) void window.engclaw.inference.cancel({ requestId: requestId.current })
    },
    [],
  )

  const analyze = useCallback(
    async (samples: Float32Array) => {
      const id = crypto.randomUUID()
      requestId.current = id
      pending.current = samples
      setPhase('analyzing')
      setFailed(false)
      try {
        const res = await window.engclaw.inference.analyze({
          requestId: id,
          audio: samples,
          text: chapter.text,
        })
        if (requestId.current !== id) return
        requestId.current = null
        setPhase('idle')
        if (res.ok) {
          pending.current = null
          const attempt = evaluateAttempt(res.value)
          setLast({ attempt, result: res.value, samples })
          setRun((r) => addAttempt(r, attempt))
          void saveToHistory(chapter.text, res.value, samples)
        } else if (res.code === 'MODEL_MISSING') setDownloadOpen(true)
        else if (res.code !== 'CANCELLED') setFailed(true)
      } catch {
        if (requestId.current !== id) return
        requestId.current = null
        setPhase('idle')
        setFailed(true)
      }
    },
    [chapter.text],
  )

  const stop = useCallback(async () => {
    const rec = recorder.current
    if (!rec) return
    recorder.current = null
    const take = await rec.stop()
    void analyze(take.samples)
  }, [analyze])

  const start = async (): Promise<void> => {
    playing.current?.stop()
    setMic(null)
    setFailed(false)
    setSeconds(0)
    levelRef.current = 0
    const { silenceAutoStop } = await window.engclaw.app.getSettings()
    const rec = new MicRecorder({
      silenceAutoStop,
      onTick: setSeconds,
      onLevel: (rms) => (levelRef.current = rms),
      onAutoStop: () => void stop(),
    })
    recorder.current = rec
    try {
      await rec.start()
      setPhase('recording')
    } catch (err) {
      recorder.current = null
      const reason = classifyMicError(err)
      setMic({ reason, message: t(micGuidance(reason, platformOf(window.navigator.platform))) })
    }
  }

  const togglePlay = (): void => {
    if (playing.current) return playing.current.stop()
    if (!last) return
    const h = playPcm(last.samples, 16000)
    playing.current = h
    void h.done.finally(() => {
      playing.current = null
    })
  }

  const replay = (): void => {
    playing.current?.stop()
    setRun(newRun())
    setOutcome(null)
    setLast(null)
    setFailed(false)
  }

  return (
    <section className="flex h-full flex-col" data-testid="game-chapter">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b px-6 py-3">
        <h2 className="min-w-0 flex-1 text-lg font-semibold">
          {t('screens.game.chapterTitle', {
            n: chapter.order,
            type: t(`screens.game.type.${chapter.type}`),
          })}
        </h2>
        {best && (
          <span
            className="text-muted-foreground flex items-center gap-1.5 text-sm"
            data-testid="game-best"
          >
            {t('screens.game.best')}
            <StarRating stars={best.stars} size="sm" />
            <span className="tabular-nums">{Math.round(best.avgScore)}</span>
          </span>
        )}
        <AttemptTracker correct={correct} active={!passed} />
        <span className="text-sm tabular-nums" aria-hidden="true" data-testid="game-count">
          {correct}/{REQUIRED_CORRECT}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('screens.game.leave')}
          onClick={() => void navigate('/game')}
        >
          <X />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto lg:flex-row lg:overflow-hidden">
        <div className="space-y-4 p-6 lg:flex-1 lg:overflow-auto">
          <div className="bg-card space-y-3 rounded-xl border border-input p-5">
            <p
              className="text-4xl leading-snug font-semibold wrap-break-word"
              data-testid="game-target"
            >
              {chapter.text}
            </p>
            <p className="text-muted-foreground text-lg" lang="en-fonipa">
              /{chapter.ipa}/
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">{t('screens.game.meaning')}: </span>
              {chapter.meaning}
            </p>
            <HearReference text={chapter.text} variant="outline" />
          </div>

          {!passed && (
            <>
              {mic && (
                <Alert
                  className="border-destructive bg-destructive-soft text-destructive-soft-foreground flex flex-wrap items-center gap-3"
                  data-testid="game-error"
                >
                  <MicOff aria-hidden="true" className="size-4 shrink-0" />
                  <span className="flex-1">{mic.message}</span>
                  <Button size="sm" onClick={() => void start()}>
                    {t('practice.retry')}
                  </Button>
                </Alert>
              )}
              {failed && (
                <Alert
                  className="border-warning bg-warning-soft text-warning-soft-foreground flex items-center gap-3"
                  data-testid="game-error"
                >
                  <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
                  <span className="flex-1">{t('screens.game.analysisFailed')}</span>
                  <Button
                    size="sm"
                    onClick={() =>
                      pending.current ? void analyze(pending.current) : setFailed(false)
                    }
                  >
                    {t('practice.retry')}
                  </Button>
                </Alert>
              )}
              <div className="flex justify-center">
                <RecordButton
                  recording={phase === 'recording'}
                  level={level}
                  timer={formatTimer(seconds)}
                  disabled={!!mic || phase === 'analyzing'}
                  startTestId="game-record"
                  stopTestId="game-stop"
                  onStart={() => void start()}
                  onStop={() => void stop()}
                />
              </div>
              {phase === 'analyzing' && (
                <p
                  role="status"
                  className="text-muted-foreground text-sm"
                  data-testid="game-analyzing"
                >
                  {t('screens.game.analyzing')}
                </p>
              )}

              {last && phase === 'idle' && !mic && (
                <p className="text-muted-foreground text-sm">
                  {t('screens.game.sayIt', { count: REQUIRED_CORRECT - correct })}
                </p>
              )}

              {totalAttempts(run) > 0 && (
                <ol
                  aria-label={t('screens.game.attemptLog')}
                  className="flex flex-wrap gap-2 text-sm tabular-nums"
                  data-testid="game-log"
                >
                  {run.attempts.map((a, i) => (
                    <li
                      key={i}
                      className="bg-card flex items-center gap-1 rounded-full border px-2.5 py-0.5"
                    >
                      {Math.round(a.score)}
                      {a.correct ? (
                        <span aria-label={t('result.chipOk')}>✓</span>
                      ) : (
                        <span aria-label={t('screens.practice.needsWork')}>✗</span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
        <ResultSidebar
          label={t('screens.game.result')}
          testId="game-sidebar"
          className="border-t lg:w-112 lg:shrink-0 lg:border-t-0"
        >
          <ResultSidebarBody>
            <div className="space-y-4 pt-4">
              {passed && result && (
                <ChapterResultCard
                  order={chapter.order}
                  hasNext={chapter.order < total}
                  run={result}
                  previous={outcome ? outcome.previous : best}
                  newBest={outcome ? outcome.improved : isNewBest(best, result)}
                  onReplay={replay}
                />
              )}
              {!last && !passed && phase === 'idle' && !mic && (
                <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
                  {t('screens.game.sayIt', { count: REQUIRED_CORRECT - correct })}
                </p>
              )}
              {last && phase !== 'analyzing' && (
                <div className="space-y-4" data-testid="game-feedback">
                  <div className="flex flex-wrap items-center gap-3">
                    <AttemptFeedbackChip
                      correct={last.attempt.correct}
                      text={t(
                        last.attempt.correct ? 'screens.game.correct' : 'screens.game.tryAgain',
                      )}
                    />
                    <span className="text-sm tabular-nums" data-testid="game-last-score">
                      {t('screens.game.lastAttempt', { score: Math.round(last.attempt.score) })}
                    </span>
                  </div>
                  <PronunciationResultSections
                    result={last.result}
                    text={chapter.text}
                    onPlay={togglePlay}
                    onRetry={() => void start()}
                    testId="game-details"
                  />
                </div>
              )}
            </div>
          </ResultSidebarBody>
        </ResultSidebar>
      </div>

      <AlertDialogPrimitive.Root open={blocker.state === 'blocked'}>
        <AlertDialogPrimitive.Portal>
          <AlertDialogPrimitive.Overlay className="bg-background/70 fixed inset-0 z-50 backdrop-blur-[1px]" />
          <AlertDialogPrimitive.Content
            data-testid="game-leave-dialog"
            className="bg-card fixed top-1/2 left-1/2 z-50 w-120 max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-xl border p-6 shadow-lg"
          >
            <AlertDialogPrimitive.Title className="text-lg font-semibold">
              {t('screens.game.leaveTitle')}
            </AlertDialogPrimitive.Title>
            <AlertDialogPrimitive.Description className="text-muted-foreground text-sm">
              {t('screens.game.leaveBody', { n: correct })}
            </AlertDialogPrimitive.Description>
            <footer className="flex flex-wrap justify-end gap-2">
              <AlertDialogPrimitive.Action asChild>
                <Button
                  variant="outline"
                  data-testid="game-leave-confirm"
                  onClick={() => blocker.state === 'blocked' && blocker.proceed()}
                >
                  {t('screens.game.leave')}
                </Button>
              </AlertDialogPrimitive.Action>
              <AlertDialogPrimitive.Cancel asChild>
                <Button
                  data-testid="game-leave-stay"
                  onClick={() => blocker.state === 'blocked' && blocker.reset()}
                >
                  {t('screens.game.stay')}
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
          if (pending.current) void analyze(pending.current)
        }}
      />
    </section>
  )
}
