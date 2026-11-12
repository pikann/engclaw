import { useLearningLanguage } from '@/lib/learning-language'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { HistorySaveRequest, PronunciationResult } from '@engclaw/ipc-contract'
import { classifyMicError, playPcm, Recorder } from '@/lib/audio'
import { decodeSegmentAudio } from '@/lib/audio/decode'
import { checkIntonation, type IntonationState } from './intonation'
import type { Segment } from './shadowing'
import { notifyStarMoment } from './star-prompt'

export type AttemptErrorKind = 'mic' | 'model' | 'failed'

export type AttemptState =
  | { phase: 'idle' }
  | { phase: 'recording' }
  | { phase: 'analyzing' }
  | { phase: 'result'; result: PronunciationResult; audio: Float32Array }
  | { phase: 'error'; kind: AttemptErrorKind; audio: Float32Array | null; detail?: string }

const IDLE: AttemptState = { phase: 'idle' }
const HISTORY_FETCH = 500

/**
 * Records the learner's attempt at the shown sentence, runs the full pronunciation check on it
 * and stores the result. Attempts are kept per sentence while the video stays open, so stepping
 * back to a sentence shows its last result.
 */
export function useSegmentAttempt(
  videoId: string,
  segments: readonly Segment[],
  index: number,
  /** Called right before the microphone opens so the video stops playing over the learner. */
  onRecordStart: () => void,
) {
  const language = useLearningLanguage()
  const [byIndex, setByIndex] = useState<Record<number, AttemptState>>({})
  const [intonation, setIntonation] = useState<Record<number, IntonationState>>({})
  const [best, setBest] = useState<Record<number, number>>({})
  const recording = useRef<{ rec: Recorder; index: number } | null>(null)
  const playing = useRef<{ stop: () => void } | null>(null)
  const requestIds = useRef<Record<number, string>>({})
  const [isPlaying, setIsPlaying] = useState(false)
  const segmentsRef = useRef(segments)
  segmentsRef.current = segments
  const indexRef = useRef(index)
  indexRef.current = index

  const set = useCallback(
    (i: number, state: AttemptState) => setByIndex((prev) => ({ ...prev, [i]: state })),
    [],
  )

  const loadBest = useCallback(() => {
    void window.engclaw.history
      .list({ videoId, limit: HISTORY_FETCH, language })
      .then(({ attempts }) => {
        const next: Record<number, number> = {}
        for (const a of attempts) {
          if (a.segmentIndex == null || a.language !== language) continue
          next[a.segmentIndex] = Math.max(next[a.segmentIndex] ?? 0, a.score)
        }
        setBest(next)
      })
      .catch(() => undefined)
  }, [videoId, language])

  useEffect(() => {
    setByIndex({})
    setIntonation({})
    setBest({})
    requestIds.current = {}
    loadBest()
  }, [videoId, loadBest])

  const stopPlayback = useCallback(() => {
    playing.current?.stop()
    playing.current = null
    setIsPlaying(false)
  }, [])

  const runIntonation = useCallback(
    async (i: number, audio: Float32Array, requestId: string): Promise<IntonationState> => {
      const segment = segmentsRef.current[i]
      if (!segment) return { status: 'failed' }
      setIntonation((prev) => ({ ...prev, [i]: { status: 'loading' } }))
      const state = await checkIntonation(
        { api: window.engclaw, decode: decodeSegmentAudio },
        `${requestId}-fluency`,
        videoId,
        segment,
        audio,
      )
      if (requestIds.current[i] === requestId) setIntonation((prev) => ({ ...prev, [i]: state }))
      return state
    },
    [videoId],
  )

  const save = useCallback(
    async (
      segment: Segment,
      text: string,
      body: {
        language: string
        score: number
        errors: HistorySaveRequest['errors']
        audio: Float32Array
      },
    ) => {
      try {
        await window.engclaw.history.save({
          mode: 'sentence',
          text,
          videoId,
          segmentIndex: segment.index,
          ...body,
        })
        loadBest()
        notifyStarMoment(body.score)
      } catch (e) {
        console.error('[shadowing] attempt save failed', e)
      }
    },
    [videoId, loadBest],
  )

  const analyze = useCallback(
    async (i: number, audio: Float32Array) => {
      const segment = segmentsRef.current[i]
      if (!segment) return
      const text = segment.text.trim()
      const id = crypto.randomUUID()
      requestIds.current[i] = id
      set(i, { phase: 'analyzing' })
      const fail = (code?: string, detail?: string) =>
        set(i, {
          phase: 'error',
          kind: code === 'MODEL_MISSING' ? 'model' : 'failed',
          audio,
          ...(detail ? { detail } : {}),
        })
      try {
        const res = await window.engclaw.inference.analyze({ requestId: id, audio, text, language })
        if (requestIds.current[i] !== id) return
        if (!res.ok) return fail(res.code, res.message)
        const result = res.value
        set(i, { phase: 'result', result, audio })
        void runIntonation(i, audio, id)
        await save(segment, text, {
          language: result.language,
          score: result.score,
          errors: result.differences.errors.map((e) => ({
            word: e.word,
            expected: e.expected,
            actual: e.actual,
            confidence: e.confidence,
          })),
          audio,
        })
      } catch {
        if (requestIds.current[i] === id) set(i, { phase: 'error', kind: 'failed', audio })
      }
    },
    [set, runIntonation, save, language],
  )

  const stop = useCallback(async () => {
    const cur = recording.current
    if (!cur) return
    recording.current = null
    const take = await cur.rec.stop()
    if (take.samples.length === 0) return set(cur.index, IDLE)
    await analyze(cur.index, take.samples)
  }, [analyze, set])

  const start = useCallback(async () => {
    if (recording.current) return
    stopPlayback()
    onRecordStart()
    const i = indexRef.current
    const { silenceAutoStop } = await window.engclaw.app.getSettings()
    const rec = new Recorder({ silenceAutoStop, onAutoStop: () => void stop() })
    recording.current = { rec, index: i }
    try {
      await rec.start()
      set(i, { phase: 'recording' })
    } catch (err) {
      recording.current = null
      console.error('[shadowing] microphone failed', classifyMicError(err))
      set(i, { phase: 'error', kind: 'mic', audio: null })
    }
  }, [onRecordStart, set, stop, stopPlayback])

  // Moving to another sentence while recording drops that take; a running check still lands on its sentence.
  useEffect(() => {
    const cur = recording.current
    if (cur && cur.index !== index) {
      recording.current = null
      void cur.rec.stop()
      set(cur.index, IDLE)
    }
    stopPlayback()
  }, [index, set, stopPlayback])

  useEffect(
    () => () => {
      void recording.current?.rec.stop()
      playing.current?.stop()
      for (const requestId of Object.values(requestIds.current)) {
        void window.engclaw.inference.cancel({ requestId })
        void window.engclaw.inference.cancel({ requestId: `${requestId}-fluency` })
      }
      requestIds.current = {}
    },
    [],
  )

  const state = byIndex[index] ?? IDLE

  const play = useCallback(() => {
    if (playing.current) return stopPlayback()
    const s = byIndex[indexRef.current]
    const audio = s && (s.phase === 'result' || s.phase === 'error') ? s.audio : null
    if (!audio) return
    const h = playPcm(audio, 16000)
    playing.current = h
    setIsPlaying(true)
    void h.done.finally(() => {
      if (playing.current === h) {
        playing.current = null
        setIsPlaying(false)
      }
    })
  }, [byIndex, stopPlayback])

  const retry = useCallback(() => {
    const s = byIndex[indexRef.current]
    if (s?.phase === 'error' && s.audio) void analyze(indexRef.current, s.audio)
    else void start()
  }, [analyze, byIndex, start])

  return {
    state,
    intonation: intonation[index] ?? null,
    best: best[segments[index]?.index ?? -1] ?? null,
    isPlaying,
    toggleRecord: () => (recording.current ? void stop() : void start()),
    play,
    retry,
  }
}
