import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlayerCommand } from '@engclaw/ipc-contract'
import { initialPlayerState, reducePlayer } from './player-state'
import { segmentIndexAt, type Segment } from './shadowing'

/**
 * Drives the main-process player view for one video. `index` is the segment playing now; it only
 * changes when the playing segment changes, so the 20 Hz time ticks do not re-render the screen.
 */
export function usePlayer(videoId: string, segments: readonly Segment[]) {
  const [state, setState] = useState(initialPlayerState)
  const [index, setIndex] = useState(-1)
  const [attempt, setAttempt] = useState(0)
  const segmentsRef = useRef(segments)
  useEffect(() => {
    segmentsRef.current = segments
  }, [segments])

  useEffect(() => {
    setState(initialPlayerState)
    setIndex(-1)
    const off = window.engclaw.player.onEvent((e) => {
      if (e.type === 'time') {
        const next = segmentIndexAt(segmentsRef.current, e.seconds)
        setIndex((prev) => (prev === next ? prev : next))
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
  const seekToSegment = useCallback(
    (i: number) => {
      const seg = segmentsRef.current[i]
      if (!seg) return
      setIndex(i)
      command({ type: 'seek', seconds: seg.start })
    },
    [command],
  )
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { state, index, command, seekToSegment, retry }
}
