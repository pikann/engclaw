import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Mic, Play, Square, Upload } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { HearReference } from '@/components/hear-reference'
import {
  classifyMicError,
  decodeFile,
  isAudioFile,
  MAX_CLIP_SECONDS,
  micGuidance,
  playPcm,
  Recorder,
} from '@/lib/audio'
import {
  EXAMPLES,
  formatTimer,
  hasText,
  initialPractice,
  loadingMessageKey,
  practiceReducer,
  type PracticeAudio,
} from '@/lib/practice'

const platformOf = (p: string): string =>
  /mac/i.test(p) ? 'darwin' : /win/i.test(p) ? 'win32' : 'linux'

/** Mode 2: type the sentence, record or import audio, analyze. */
export function PracticeCard() {
  const { t } = useTranslation()
  const [s, dispatch] = useReducer(practiceReducer, initialPractice)
  const [seconds, setSeconds] = useState(0)
  const [micError, setMicError] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const recorder = useRef<Recorder | null>(null)
  const requestId = useRef<string | null>(null)
  const playing = useRef<{ stop: () => void } | null>(null)
  const textRef = useRef(s.text)
  textRef.current = s.text

  const analyze = useCallback(async (audio: PracticeAudio) => {
    const id = crypto.randomUUID()
    requestId.current = id
    try {
      const res = await window.engclaw.inference.analyze({
        requestId: id,
        audio: audio.samples,
        text: textRef.current.trim(),
      })
      if (requestId.current !== id) return
      dispatch(
        res.ok
          ? { type: 'analyzed', result: res.value }
          : {
              type: 'failed',
              error: { code: res.code, message: res.message, modelId: res.modelId },
            },
      )
    } catch (err) {
      if (requestId.current === id)
        dispatch({
          type: 'failed',
          error: { code: 'FAILED', message: err instanceof Error ? err.message : '' },
        })
    }
  }, [])

  const onAnalyze = (): void => {
    if (!s.audio || !hasText(s.text)) return dispatch({ type: 'analyze-requested' })
    dispatch({ type: 'analyze-requested' })
    void analyze(s.audio)
  }

  const startRecording = async (): Promise<void> => {
    if (!hasText(s.text)) return dispatch({ type: 'record-requested' })
    setMicError(null)
    setFileError(null)
    setSeconds(0)
    const rec = new Recorder({
      onTick: setSeconds,
      onAutoStop: () => void stopRecording(),
    })
    recorder.current = rec
    try {
      await rec.start()
      dispatch({ type: 'record-requested' })
    } catch (err) {
      recorder.current = null
      setMicError(t(micGuidance(classifyMicError(err), platformOf(window.navigator.platform))))
      dispatch({ type: 'record-failed' })
    }
  }

  const stopRecording = async (): Promise<void> => {
    const rec = recorder.current
    if (!rec) return
    recorder.current = null
    const take = await rec.stop()
    const audio: PracticeAudio = { ...take, source: 'mic', truncated: false }
    dispatch({ type: 'recorded', audio })
    // Auto-analyze straight after a recording; the text was validated before it started.
    if (hasText(textRef.current)) {
      dispatch({ type: 'analyze-requested' })
      void analyze(audio)
    }
  }

  const loadFile = async (file: File): Promise<void> => {
    setFileError(null)
    setMicError(null)
    if (!isAudioFile(file)) return setFileError(t('audio.decodeError'))
    try {
      const d = await decodeFile(file)
      dispatch({
        type: 'loaded',
        audio: { samples: d.samples, seconds: d.seconds, source: 'file', truncated: d.truncated },
      })
    } catch {
      setFileError(t('audio.decodeError'))
    }
  }

  const cancel = (): void => {
    const id = requestId.current
    requestId.current = null
    if (id) void window.engclaw.inference.cancel({ requestId: id })
    dispatch({ type: 'failed', error: { code: 'CANCELLED', message: '' } })
  }

  const togglePlay = (): void => {
    if (playing.current) return playing.current.stop()
    if (!s.audio) return
    const h = playPcm(s.audio.samples, 16000)
    playing.current = h
    void h.done.finally(() => (playing.current = null))
  }

  useEffect(
    () => () => {
      void recorder.current?.stop()
      playing.current?.stop()
    },
    [],
  )

  const busy = s.phase === 'recording' || s.phase === 'analyzing'

  return (
    <section
      className="space-y-4 rounded-lg border p-4"
      data-testid="practice-card"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const f = e.dataTransfer.files[0]
        if (f && !busy) void loadFile(f)
      }}
    >
      <h2 className="text-lg font-semibold">{t('practice.title')}</h2>

      <div className="space-y-2">
        <textarea
          data-testid="practice-text"
          className="border-input bg-background min-h-24 w-full rounded-md border p-2 text-sm"
          placeholder={t('practice.placeholder')}
          value={s.text}
          disabled={busy}
          maxLength={1000}
          aria-invalid={s.hint}
          onChange={(e) => dispatch({ type: 'text', text: e.target.value })}
        />
        {s.hint && (
          <p role="alert" className="text-destructive text-sm" data-testid="practice-hint">
            {t('practice.emptyHint')}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <Button
              key={ex}
              variant="outline"
              size="sm"
              data-testid="practice-example"
              disabled={busy}
              onClick={() => dispatch({ type: 'text', text: ex })}
            >
              {ex}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {s.phase === 'recording' ? (
          <Button
            data-testid="practice-stop"
            variant="destructive"
            onClick={() => void stopRecording()}
          >
            <Square />
            {t('audio.stop')} · <span data-testid="practice-timer">{formatTimer(seconds)}</span>
          </Button>
        ) : (
          <Button
            data-testid="practice-record"
            disabled={busy}
            onClick={() => void startRecording()}
          >
            <Mic />
            {t('audio.record')}
          </Button>
        )}
        <HearReference text={s.text} />
        <label
          className={`${buttonVariants({ variant: 'outline', size: 'sm' })} cursor-pointer`}
          aria-disabled={busy}
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
      <p
        className={`text-muted-foreground rounded-md border border-dashed p-2 text-center text-xs ${dragging ? 'bg-accent' : ''}`}
      >
        {t('audio.drop')}
      </p>

      {micError && (
        <Alert className="border-destructive text-destructive" data-testid="practice-mic-error">
          {micError}
        </Alert>
      )}
      {fileError && (
        <p role="alert" className="text-destructive text-sm">
          {fileError}
        </p>
      )}

      {s.audio && s.phase !== 'recording' && (
        <div className="flex flex-wrap items-center gap-2" data-testid="practice-review">
          <Button variant="outline" size="sm" onClick={togglePlay}>
            <Play />
            {t('practice.review', { time: formatTimer(s.audio.seconds) })}
          </Button>
          <Button
            data-testid="practice-analyze"
            disabled={s.phase === 'analyzing'}
            onClick={onAnalyze}
          >
            {t('practice.analyze')}
          </Button>
          {s.audio.truncated && (
            <span className="text-muted-foreground text-xs">
              {t('audio.truncated', { seconds: MAX_CLIP_SECONDS })}
            </span>
          )}
        </div>
      )}

      {s.phase === 'analyzing' && <LoadingCard onCancel={cancel} />}

      {s.phase === 'error' && s.error && (
        <Alert className="border-destructive" data-testid="practice-error">
          <p>
            {s.error.code === 'MODEL_MISSING'
              ? t('practice.error.modelMissing')
              : t('practice.error.failed')}
          </p>
          <Button className="mt-2" size="sm" data-testid="practice-retry" onClick={onAnalyze}>
            {t('practice.retry')}
          </Button>
        </Alert>
      )}

      {s.phase === 'result' && s.result && (
        <div className="space-y-1 rounded-md border p-3" data-testid="result-card">
          <p className="text-2xl font-semibold" data-testid="result-score">
            {Math.round(s.result.score)}
          </p>
          <p className="text-sm">
            {t(`pronounce.feedback.${s.result.feedback.code}`, {
              words: s.result.feedback.words.join(', '),
            })}
          </p>
        </div>
      )}
    </section>
  )
}

function LoadingCard({ onCancel }: { onCancel: () => void }) {
  const { t } = useTranslation()
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const start = Date.now()
    const id = setInterval(() => setElapsed(Date.now() - start), 500)
    return () => clearInterval(id)
  }, [])
  return (
    <div
      className="flex items-center gap-2 rounded-md border p-3"
      role="status"
      data-testid="practice-loading"
    >
      <Loader2 className="animate-spin" />
      <span className="flex-1 text-sm">{t(loadingMessageKey(elapsed))}</span>
      <Button variant="outline" size="sm" onClick={onCancel}>
        {t('models.cancel')}
      </Button>
    </div>
  )
}
