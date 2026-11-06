import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlayerCommand } from '@engclaw/ipc-contract'
import { initialPlayerState, reducePlayer } from './player-state'

/**
 * Drives the main-process player view for one video. Time ticks (20 Hz) go to `onTime` instead of
 * React state, so they do not re-render the screen.
 */
export function usePlayer(videoId: string, onTime: (seconds: number) => void) {
  const [state, setState] = useState(initialPlayerState)
  const [attempt, setAttempt] = useState(0)
  const onTimeRef = useRef(onTime)
  useEffect(() => {
    onTimeRef.current = onTime
  }, [onTime])

  useEffect(() => {
    setState(initialPlayerState)
    const off = window.engclaw.player.onEvent((e) => {
      if (e.type === 'time') {
        onTimeRef.current(e.seconds)
        return
      }
      setState((s) => reducePlayer(s, e))
    })
    void window.engclaw.player.load({ videoId })
    return () => {
      off()
      void window.engclaw.player.close()
    }
  }, [videoId, attempt])

  const command = useCallback((c: PlayerCommand) => {
    void window.engclaw.player.command(c)
  }, [])
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { state, command, retry }
}
