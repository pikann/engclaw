import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlayer } from './use-player'
import {
  DEFAULT_SETTINGS,
  clampSettings,
  idleLoop,
  nudgeSettings,
  stepLoop,
  type LoopInput,
  type LoopState,
  type SentenceSettings,
  type ShortcutCommand,
} from './sentence-loop'
import type { Segment } from './shadowing'

/**
 * The practice loop of one video: sentence playback with back/replay/play/next, speed, repeat
 * count and auto-continue. Settings are remembered per video.
 */
export function useSentenceLoop(
  videoId: string,
  segments: readonly Segment[],
  noAutoContinue = false,
) {
  const [loop, setLoop] = useState<LoopState>(idleLoop)
  const [settings, setSettingsState] = useState<SentenceSettings>(DEFAULT_SETTINGS)
  const loopRef = useRef(loop)
  const settingsRef = useRef(settings)
  const segmentsRef = useRef(segments)
  const noAutoRef = useRef(noAutoContinue)
  noAutoRef.current = noAutoContinue
  const waitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loaded = useRef(false)
  const commandRef = useRef<ReturnType<typeof usePlayer>['command']>(() => undefined)

  useEffect(() => {
    segmentsRef.current = segments
  }, [segments])

  const clearWait = useCallback(() => {
    if (waitTimer.current) clearTimeout(waitTimer.current)
    waitTimer.current = null
  }, [])

  const dispatch = useCallback(
    (input: LoopInput) => {
      const effective = noAutoRef.current
        ? { ...settingsRef.current, autoContinuePct: 0 }
        : settingsRef.current
      const step = stepLoop(loopRef.current, input, segmentsRef.current, effective)
      loopRef.current = step.state
      setLoop(step.state)
      for (const a of step.actions) {
        switch (a.type) {
          case 'seek':
            commandRef.current({ type: 'seek', seconds: a.seconds })
            break
          case 'play':
          case 'pause':
            commandRef.current({ type: a.type })
            break
          case 'cancelWait':
            clearWait()
            break
          case 'wait':
            clearWait()
            waitTimer.current = setTimeout(() => {
              waitTimer.current = null
              dispatch({ type: 'waitElapsed' })
            }, a.ms)
            break
        }
      }
    },
    [clearWait],
  )

  const adoptNextTick = useRef(false)
  const onTime = useCallback(
    (seconds: number) => {
      if (adoptNextTick.current) {
        adoptNextTick.current = false
        dispatch({ type: 'adopt', seconds })
      }
      dispatch({ type: 'time', seconds })
    },
    [dispatch],
  )
  const { state, command, retry } = usePlayer(videoId, onTime)
  const wasPlaying = useRef(false)
  useEffect(() => {
    if (state.playing === wasPlaying.current) return
    wasPlaying.current = state.playing
    if (state.playing) adoptNextTick.current = loopRef.current.mode !== 'playing'
    else {
      adoptNextTick.current = false
      dispatch({ type: 'externalPause' })
    }
  }, [state.playing, dispatch])
  useEffect(() => {
    commandRef.current = command
  }, [command])

  useEffect(() => {
    loopRef.current = idleLoop
    setLoop(idleLoop)
    loaded.current = false
    let cancelled = false
    void window.engclaw.youtube.getSettings({ videoId }).then((saved) => {
      if (cancelled) return
      const next = saved ? clampSettings(saved) : DEFAULT_SETTINGS
      settingsRef.current = next
      setSettingsState(next)
      loaded.current = true
    })
    return () => {
      cancelled = true
      clearWait()
    }
  }, [videoId, clearWait])

  const ready = state.phase === 'ready'
  useEffect(() => {
    if (ready) command({ type: 'rate', rate: settings.speed })
  }, [ready, command, settings.speed])

  const setSettings = useCallback(
    (patch: Partial<SentenceSettings>) => {
      const next = clampSettings({ ...settingsRef.current, ...patch })
      settingsRef.current = next
      setSettingsState(next)
      if (loaded.current) void window.engclaw.youtube.saveSettings({ videoId, settings: next })
    },
    [videoId],
  )

  const runShortcut = useCallback(
    (cmd: ShortcutCommand) => {
      if (cmd.type === 'loop') dispatch(cmd.input)
      else setSettings(nudgeSettings(settingsRef.current, cmd.patch))
    },
    [dispatch, setSettings],
  )

  return { state, retry, loop, settings, setSettings, dispatch, runShortcut }
}
