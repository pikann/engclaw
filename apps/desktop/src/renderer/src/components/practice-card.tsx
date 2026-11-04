import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Mic, Play, Square, Upload } from 'lucide-react'
import type { PronunciationResult } from '@engclaw/ipc-contract'
import { Alert } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { HearReference } from '@/components/hear-reference'
import { ResultCard } from '@/components/result-card'
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

/** Records a finished analysis in the local history; a storage failure never blocks the result. */
function saveAttempt(
  mode: 'sentence' | 'free',
  text: string,
  audio: PracticeAudio,
  r: PronunciationResult,
): void {
  void window.engclaw.history
    .save({
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
    .catch((e: unknown) => console.error('[history] save failed', e))
}

const platformOf = (p: string): string =>
  /mac/i.test(p) ? 'darwin' : /win/i.test(p) ? 'win32' : 'linux'

/**
 * Mode 2 ('sentence'): type the sentence, record or import audio, analyze.
 * Mode 1 ('free'): record or import audio, correct the ASR transcript, analyze the corrected text.
 */
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
  const modeRef = useRef(s.mode)
  modeRef.current = s.mode

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
      if (res.ok) saveAttempt(modeRef.current, textRef.current.trim(), audio, res.value)
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

  const transcribe = useCallback(async (audio: PracticeAudio) => {
    const id = crypto.randomUUID()
    requestId.current = id
    try {
      const res = await window.engclaw.inference.transcribe({ requestId: id, audio: audio.samples })
      if (requestId.current !== id) return
      dispatch(
        res.ok
          ? { type: 'transcribed', text: res.value.text }
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

  const onTranscribe = (): void => {
    if (!s.audio) return
    dispatch({ type: 'transcribe-requested' })
    void transcribe(s.audio)
  }

  const onRetry = (): void => (s.step === 'transcribe' ? onTranscribe() : onAnalyze())

  const onAnalyze = (): void => {
    if (!s.audio || !hasText(s.text)) return dispatch({ type: 'analyze-requested' })
    dispatch({ type: 'analyze-requested' })
    void analyze(s.audio)
  }

  const startRecording = async (): Promise<void> => {
    if (s.mode === 'sentence' && !hasText(s.text)) return dispatch({ type: 'record-requested' })
    setMicError(null)
    setFileError(null)
    setSeconds(0)
    const { silenceAutoStop } = await window.engclaw.app.getSettings()
    const rec = new Recorder({
      silenceAutoStop,
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
    startAuto(audio)
  }

  /** Mode 1 transcribes new audio straight away; Mode 2 analyzes a recording (text is checked). */
  const startAuto = (audio: PracticeAudio, fromFile = false): void => {
    if (modeRef.current === 'free') {
      dispatch({ type: 'transcribe-requested' })
      void transcribe(audio)
    } else if (!fromFile && hasText(textRef.current)) {
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
      const audio: PracticeAudio = {
        samples: d.samples,
        seconds: d.seconds,
        source: 'file',
        truncated: d.truncated,
      }
      dispatch({ type: 'loaded', audio })
      startAuto(audio, true)
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

  const busy = s.phase === 'recording' || s.phase === 'transcribing' || s.phase === 'analyzing'
  const free = s.mode === 'free'
  // In free speech the text is the ASR transcript, so it opens up only once there is one.
  const textLocked = busy || (free && !s.transcribed)

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

      <div className="flex gap-2" role="group" aria-label={t('practice.mode.label')}>
        {(['sentence', 'free'] as const).map((m) => (
          <Button
            key={m}
            size="sm"
            variant={s.mode === m ? 'default' : 'outline'}
            aria-pressed={s.mode === m}
            data-testid={`practice-mode-${m}`}
            disabled={busy}
            onClick={() => dispatch({ type: 'mode', mode: m })}
          >
            {t(`practice.mode.${m}`)}
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        <textarea
          data-testid="practice-text"
          className="border-input bg-background min-h-24 w-full rounded-md border p-2 text-sm"
          placeholder={t(free ? 'practice.freePlaceholder' : 'practice.placeholder')}
          value={s.text}
          disabled={textLocked}
          maxLength={1000}
          aria-invalid={s.hint}
          onChange={(e) => dispatch({ type: 'text', text: e.target.value })}
        />
        {s.hint && (
          <p role="alert" className="text-destructive text-sm" data-testid="practice-hint">
            {t('practice.emptyHint')}
          </p>
        )}
        {free && s.transcribed && (
          <p className="text-muted-foreground text-xs" data-testid="practice-transcript-note">
            {t('practice.transcriptNote')}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {!free &&
            EXAMPLES.map((ex) => (
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
          {free && !s.transcribed ? (
            <Button data-testid="practice-transcribe" disabled={busy} onClick={onTranscribe}>
              {t('practice.transcribe')}
            </Button>
          ) : (
            <Button data-testid="practice-analyze" disabled={busy} onClick={onAnalyze}>
              {t(free ? 'practice.confirmAnalyze' : 'practice.analyze')}
            </Button>
          )}
          {s.audio.truncated && (
            <span className="text-muted-foreground text-xs">
              {t('audio.truncated', { seconds: MAX_CLIP_SECONDS })}
            </span>
          )}
        </div>
      )}

      {s.phase === 'transcribing' && (
        <LoadingCard onCancel={cancel} messageKey="practice.transcribing" />
      )}
      {s.phase === 'analyzing' && <LoadingCard onCancel={cancel} />}

      {s.phase === 'error' && s.error && (
        <Alert className="border-destructive" data-testid="practice-error">
          <p>
            {s.error.code === 'MODEL_MISSING'
              ? t('practice.error.modelMissing')
              : t('practice.error.failed')}
          </p>
          <Button className="mt-2" size="sm" data-testid="practice-retry" onClick={onRetry}>
            {t('practice.retry')}
          </Button>
        </Alert>
      )}

      {s.phase === 'result' && s.result && (
        <ResultCard
          result={s.result}
          text={s.text}
          onTryAgain={() => dispatch({ type: 'discard' })}
          onReplay={togglePlay}
        />
      )}
    </section>
  )
}

function LoadingCard({ onCancel, messageKey }: { onCancel: () => void; messageKey?: string }) {
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
      <span className="flex-1 text-sm">{t(messageKey ?? loadingMessageKey(elapsed))}</span>
      <Button variant="outline" size="sm" onClick={onCancel}>
        {t('models.cancel')}
      </Button>
    </div>
  )
}
