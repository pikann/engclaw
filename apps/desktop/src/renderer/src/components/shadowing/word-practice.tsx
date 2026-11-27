import { useEffect, useRef, useState } from 'react'
import { Mic, Play, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PronunciationResult } from '@engclaw/ipc-contract'
import { Button } from '@/components/ui/button'
import { isWrongPhone, recognizeWords } from '@/lib/result'
import { splitWords } from '@engclaw/pronounce/src/compare'
import { playPcm, Recorder } from '@/lib/audio'

export interface WordPracticeControls {
  prepare: () => void
  recording: boolean
  onRecordingChange: (recording: boolean) => void
}

export function WordPractice({
  word,
  controls,
  onPrepare,
}: {
  word: string
  controls: WordPracticeControls
  onPrepare: () => void
}) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<'idle' | 'starting' | 'recording' | 'analyzing'>('idle')
  const [audio, setAudio] = useState<Float32Array | null>(null)
  const [result, setResult] = useState<PronunciationResult | null>(null)
  const [error, setError] = useState<'mic' | 'empty' | 'failed' | null>(null)
  const [playing, setPlaying] = useState(false)
  const recording = useRef<{ recorder: Recorder; ready: boolean } | null>(null)
  const request = useRef<string | null>(null)
  const playback = useRef<ReturnType<typeof playPcm> | null>(null)
  const mounted = useRef(false)
  const microphoneBusy = useRef(false)
  const { onRecordingChange } = controls

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      const take = recording.current
      recording.current = null
      if (take?.ready) void take.recorder.stop().catch(() => undefined)
      if (microphoneBusy.current) onRecordingChange(false)
      microphoneBusy.current = false
      if (request.current)
        void window.engclaw.inference.cancel({ requestId: request.current }).catch(() => undefined)
      playback.current?.stop()
    }
  }, [onRecordingChange])

  const releaseMicrophone = () => {
    microphoneBusy.current = false
    onRecordingChange(false)
  }

  async function stop() {
    const take = recording.current
    if (!take?.ready) return
    recording.current = null
    setPhase('analyzing')
    try {
      const { samples } = await take.recorder.stop()
      if (!mounted.current) return
      releaseMicrophone()
      if (!samples.length) {
        setError('empty')
        return
      }
      setAudio(samples)
      const requestId = crypto.randomUUID()
      request.current = requestId
      const response = await window.engclaw.inference.analyze({
        requestId,
        audio: samples,
        text: word,
        language: 'en',
      })
      if (!mounted.current) return
      if (response.ok) setResult(response.value)
      else setError('failed')
    } catch {
      if (mounted.current) setError('failed')
    } finally {
      request.current = null
      if (mounted.current) {
        releaseMicrophone()
        setPhase('idle')
      }
    }
  }

  async function start() {
    if (phase !== 'idle' || recording.current) return
    playback.current?.stop()
    onPrepare()
    controls.prepare()
    microphoneBusy.current = true
    onRecordingChange(true)
    setPhase('starting')
    setAudio(null)
    setResult(null)
    setError(null)
    const take = {
      recorder: new Recorder({
        onAutoStop: () => void stop(),
        onTick: (seconds) => {
          if (seconds >= 12) void stop()
        },
      }),
      ready: false,
    }
    recording.current = take
    try {
      await take.recorder.start()
      if (recording.current !== take) {
        await take.recorder.stop()
        return
      }
      take.ready = true
      setPhase('recording')
    } catch {
      await take.recorder.stop().catch(() => undefined)
      if (recording.current !== take) return
      recording.current = null
      releaseMicrophone()
      setError('mic')
      setPhase('idle')
    }
  }

  function replay() {
    if (playback.current) return playback.current.stop()
    if (!audio) return
    onPrepare()
    const handle = playPcm(audio, 16000)
    playback.current = handle
    setPlaying(true)
    void handle.done.then(() => {
      if (playback.current !== handle) return
      playback.current = null
      if (mounted.current) setPlaying(false)
    })
  }

  const expectedWords = splitWords(word)
  const recognition = result ? recognizeWords(expectedWords, result.transcribe) : []
  const recognized = recognition.filter((item) => item.matched).length
  const pronunciation = result?.differences.errors[0]
  const unclearPhone = pronunciation?.phones.find(
    (phone) => phone.expected && phone.expected !== phone.heard && isWrongPhone(phone.confidence),
  )

  return (
    <div className="space-y-2 border-t pt-2 text-sm" data-testid="shadowing-word-practice">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={phase === 'recording' ? 'live' : 'outline'}
          data-testid="shadowing-word-record"
          disabled={phase === 'starting' || phase === 'analyzing'}
          onClick={() => void (phase === 'recording' ? stop() : start())}
        >
          {phase === 'recording' ? <Square /> : <Mic />}
          {t(`wordPractice.${phase}`)}
        </Button>
        {audio && (
          <Button variant="outline" size="sm" data-testid="shadowing-word-replay" onClick={replay}>
            {playing ? <Square /> : <Play />}
            {t(playing ? 'result.stopWordRecording' : 'wordPractice.replay')}
          </Button>
        )}
      </div>
      {result && (
        <div role="status">
          <p className="font-medium" data-testid="shadowing-word-recognition">
            {expectedWords.length > 1
              ? t('result.recognizedCount', { recognized, total: expectedWords.length })
              : t(recognized ? 'result.recognizedWord' : 'result.unrecognizedWord')}
          </p>
          {recognized < expectedWords.length && (
            <p>{t('wordPractice.heard', { text: result.transcribe.trim() || '…' })}</p>
          )}
          {unclearPhone && <p>{t('result.unclearSound', { sound: unclearPhone.expected })}</p>}
          <details className="mt-2">
            <summary className="cursor-pointer">{t('result.technicalDetails')}</summary>
            <p data-testid="shadowing-word-score">
              {t('wordPractice.score', { score: Math.round(result.score) })}
            </p>
            {pronunciation && (
              <p lang="en-fonipa">
                {pronunciation.expected} → {pronunciation.actual || '∅'}
              </p>
            )}
          </details>
        </div>
      )}
      {error && <p role="alert">{t(`wordPractice.${error}`)}</p>}
    </div>
  )
}
