import { useEffect, useRef } from 'react'
import { useNativeOverlayOpen } from '@/lib/native-overlay'

const HIDDEN = { x: 0, y: 0, width: 0, height: 0 }

/**
 * A placeholder box whose on-screen rectangle the main process copies onto the native player
 * view. The view is a native layer above the page, so it is hidden (zero bounds) whenever
 * `visible` is false, for example while an error message is shown in its place.
 */
export function PlayerSurface({
  width,
  height,
  visible,
  label,
}: {
  width: number
  height: number
  visible: boolean
  label: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const covered = useNativeOverlayOpen()
  const shown = visible && !covered

  useEffect(() => {
    let raf = 0
    let last = ''
    const sync = () => {
      const el = ref.current
      const r = shown && el ? el.getBoundingClientRect() : null
      const bounds = r
        ? {
            x: Math.max(0, Math.round(r.x)),
            y: Math.max(0, Math.round(r.y)),
            width: Math.round(r.width),
            height: Math.round(r.height),
          }
        : HIDDEN
      const key = `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`
      if (key !== last) {
        last = key
        void window.engclaw.player.setBounds(bounds)
      }
      raf = requestAnimationFrame(sync)
    }
    raf = requestAnimationFrame(sync)
    return () => {
      cancelAnimationFrame(raf)
      void window.engclaw.player.setBounds(HIDDEN)
    }
  }, [shown])

  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      data-testid="shadowing-player"
      className="rounded-lg bg-black"
      style={{ width, height }}
    />
  )
}
