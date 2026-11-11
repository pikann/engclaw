import { useEffect, useRef, useState } from 'react'
import { Mouth } from '@/components/mouth'
import { Tongue } from '@/components/tongue'
import {
  REST_POSE,
  articulationFrames,
  scaleFrames,
  type ArticulationFrame,
} from '@/lib/articulation'
import { usePrefersReducedMotion } from '@/lib/motion'
import { REST } from '@/lib/viseme'

const RESTING: ArticulationFrame = { phone: '', viseme: REST, pose: REST_POSE, ms: 0 }

/**
 * Front-view mouth and side-view tongue, side by side and driven by one timeline so they always
 * show the same sound. `phones` animate in sequence each time `playId` changes, stretched to
 * `durationMs` when given (to match a spoken word); a change of `stopId` ends it early on the
 * rest pose. With reduced motion the first sound is shown still instead.
 */
export function ArticulationView({
  phones,
  playId,
  durationMs,
  stopId = 0,
}: {
  phones: readonly string[]
  playId: number
  durationMs?: number
  stopId?: number
}) {
  const reduced = usePrefersReducedMotion()
  const key = phones.join(' ')
  const [frame, setFrame] = useState<ArticulationFrame>(RESTING)
  const timers = useRef<number[]>([])
  const clear = (): void => {
    timers.current.forEach(window.clearTimeout)
    timers.current = []
  }

  useEffect(() => {
    clear()
    let frames = articulationFrames(phones)
    if (durationMs) frames = scaleFrames(frames, durationMs)
    if (!phones.length) return setFrame(RESTING)
    if (reduced) return setFrame(frames[0] ?? RESTING)
    let at = 0
    for (const f of frames) {
      timers.current.push(window.setTimeout(() => setFrame(f), at))
      at += f.ms
    }
    return clear
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands in for `phones`
  }, [key, playId, reduced])

  useEffect(() => {
    if (!stopId) return
    clear()
    setFrame(RESTING)
  }, [stopId])

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="articulation">
      <Mouth viseme={frame.viseme} />
      <Tongue pose={frame.pose} phone={frame.phone} />
    </div>
  )
}
