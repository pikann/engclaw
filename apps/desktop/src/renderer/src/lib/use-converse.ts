import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { AgentConversation, AgentEvent, SpeechSummary } from '@engclaw/ipc-contract'
import { classifyMicError, micGuidance, playPcm, Recorder, type MicErrorReason } from '@/lib/audio'
import { converseReducer, initialConverse } from '@/lib/converse'
import { buildSpeechSummary } from '@/lib/speech-summary'

const MIN_SPEECH_SECONDS = 0.4
const MAX_SPOKEN_CHARS = 1000

export type ConverseNotice = 'noSpeech' | 'speakFailed' | null

/** The Converse turn loop: mic -> local ASR -> agent -> local TTS, with barge-in and cancel. */
export function useConverse(platform: string) {
  const [state, dispatch] = useReducer(converseReducer, initialConverse)
  const [mic, setMic] = useState<{ reason: MicErrorReason; guidance: string } | null>(null)
  const [needsModels, setNeedsModels] = useState(false)
  const [notice, setNotice] = useState<ConverseNotice>(null)
  const [level, setLevel] = useState(0)
  const [conversations, setConversations] = useState<AgentConversation[]>([])

  const stateRef = useRef(state)
  stateRef.current = state
  const recorder = useRef<Recorder | null>(null)
  const asrId = useRef<string | null>(null)
  const playback = useRef<{ stop: () => void } | null>(null)
  const turnToken = useRef(0)
  const sending = useRef(false)
  const early = useRef<Exclude<AgentEvent, { type: 'tool' }>[]>([])

  const refreshList = useCallback(() => window.engclaw.agent.list().then(setConversations), [])

  const stopSpeaking = useCallback(() => {
    turnToken.current++
    playback.current?.stop()
    playback.current = null
  }, [])

  const speak = useCallback(async (text: string) => {
    const mine = ++turnToken.current
    try {
      const res = await window.engclaw.tts.speak({ text: text.slice(0, MAX_SPOKEN_CHARS) })
      if (turnToken.current !== mine) return
      if (!res.ok) {
        setNotice('speakFailed')
        if (res.code === 'MODEL_MISSING') setNeedsModels(true)
        return dispatch({ type: 'spoken' })
      }
      const h = playPcm(res.samples, res.sampleRate)
      playback.current = h
      await h.done
    } catch {
      if (turnToken.current === mine) setNotice('speakFailed')
    } finally {
      if (turnToken.current === mine) {
        playback.current = null
        dispatch({ type: 'spoken' })
      }
    }
  }, [])

  const handleEvent = useCallback(
    (e: Exclude<AgentEvent, { type: 'tool' }>) => {
      dispatch(e)
      if (e.type === 'done') {
        void speak(e.text)
        void refreshList()
      }
    },
    [refreshList, speak],
  )

  useEffect(
    () =>
      window.engclaw.agent.onEvent((e) => {
        if (e.type === 'tool') return
        if (sending.current) early.current.push(e)
        else handleEvent(e)
      }),
    [handleEvent],
  )

  useEffect(() => {
    void refreshList()
    return () => {
      stopSpeaking()
      const rec = recorder.current
      recorder.current = null
      void rec?.stop().catch(() => undefined)
      if (asrId.current) void window.engclaw.inference.cancel({ requestId: asrId.current })
    }
  }, [refreshList, stopSpeaking])

  const submit = useCallback(
    async (text: string, speech?: SpeechSummary) => {
      dispatch({ type: 'heard', text })
      sending.current = true
      early.current = []
      const res = await window.engclaw.agent.send({
        ...(stateRef.current.conversationId
          ? { conversationId: stateRef.current.conversationId }
          : {}),
        text,
        ...(speech ? { speech } : {}),
      })
      if (!res.ok) {
        sending.current = false
        return dispatch({ type: 'send-failed', code: res.code })
      }
      dispatch({ type: 'sent', conversationId: res.conversationId, requestId: res.requestId })
      sending.current = false
      const buffered = early.current
      early.current = []
      for (const e of buffered) handleEvent(e)
    },
    [handleEvent],
  )

  const finishListening = useCallback(async () => {
    const rec = recorder.current
    recorder.current = null
    setLevel(0)
    if (!rec) return
    const clip = await rec.stop()
    if (clip.seconds < MIN_SPEECH_SECONDS) {
      setNotice('noSpeech')
      return dispatch({ type: 'stop-listening' })
    }
    const id = crypto.randomUUID()
    asrId.current = id
    dispatch({ type: 'transcribing' })
    const res = await window.engclaw.inference
      .transcribe({ requestId: id, audio: clip.samples })
      .catch(() => null)
    if (asrId.current !== id) return
    if (!res || !res.ok) {
      asrId.current = null
      if (res && res.code === 'MODEL_MISSING') setNeedsModels(true)
      return dispatch({ type: 'send-failed', code: 'FAILED' })
    }
    const text = res.value.text.trim()
    if (text === '') {
      asrId.current = null
      setNotice('noSpeech')
      return dispatch({ type: 'stop-listening' })
    }
    // The analysis is best-effort: if it fails or is cancelled the turn goes out as plain text.
    const speech = await window.engclaw.inference
      .analyze({ requestId: id, audio: clip.samples, text })
      .then((r) => (r.ok ? buildSpeechSummary(r.value) : undefined))
      .catch(() => undefined)
    if (asrId.current !== id) return
    asrId.current = null
    await submit(text, speech)
  }, [submit])

  const startListening = useCallback(async () => {
    stopSpeaking()
    if (stateRef.current.turn === 'speaking') dispatch({ type: 'interrupt' })
    setMic(null)
    setNotice(null)
    const { silenceAutoStop } = await window.engclaw.app.getSettings()
    const rec = new Recorder({
      silenceAutoStop,
      onLevel: setLevel,
      onAutoStop: () => void finishListening(),
    })
    try {
      await rec.start()
    } catch (err) {
      const reason = classifyMicError(err)
      setMic({ reason, guidance: micGuidance(reason, platform) })
      return dispatch({ type: 'stop-listening' })
    }
    recorder.current = rec
    dispatch({ type: 'listen' })
  }, [finishListening, platform, stopSpeaking])

  const cancel = useCallback(() => {
    const s = stateRef.current
    if (s.turn === 'listening') {
      const rec = recorder.current
      recorder.current = null
      setLevel(0)
      void rec?.stop()
      dispatch({ type: 'stop-listening' })
    } else if (s.requestId) void window.engclaw.agent.cancel({ requestId: s.requestId })
    else if (asrId.current) {
      void window.engclaw.inference.cancel({ requestId: asrId.current })
      asrId.current = null
      dispatch({ type: 'stop-listening' })
    }
  }, [])

  const interrupt = useCallback(() => {
    stopSpeaking()
    dispatch({ type: 'interrupt' })
  }, [stopSpeaking])

  const open = useCallback(
    async (conversationId: string) => {
      stopSpeaking()
      const messages = await window.engclaw.agent.messages({ conversationId })
      dispatch({ type: 'load', conversationId, messages })
    },
    [stopSpeaking],
  )

  const reset = useCallback(() => {
    stopSpeaking()
    dispatch({ type: 'reset' })
    setNotice(null)
  }, [stopSpeaking])

  return {
    state,
    mic,
    notice,
    level,
    needsModels,
    setNeedsModels,
    conversations,
    startListening,
    finishListening,
    cancel,
    interrupt,
    open,
    reset,
  }
}
