import { useCallback, useEffect, useRef, useState } from 'react'
import { playPcm } from '@/lib/audio'

export type SpeechPhase = 'loading' | 'playing'
export type SpeechError = 'modelMissing' | 'failed'

/**
 * Plays Kokoro audio for a text, one clip at a time. `key` identifies the control that started
 * it so each button can show its own loading/playing state; playing the same key again stops it.
 */
export function useSpeech() {
  const [active, setActive] = useState<{ key: string; phase: SpeechPhase } | null>(null)
  const [error, setError] = useState<SpeechError | null>(null)
  const handle = useRef<{ stop: () => void } | null>(null)
  const token = useRef(0)

  const stop = useCallback(() => {
    token.current++
    handle.current?.stop()
    handle.current = null
    setActive(null)
  }, [])

  const play = useCallback(
    async (key: string, text: string) => {
      if (handle.current && active?.key === key) return stop()
      stop()
      const mine = token.current
      setError(null)
      setActive({ key, phase: 'loading' })
      try {
        const res = await window.engclaw.tts.speak({ text })
        if (token.current !== mine) return
        if (!res.ok) {
          setError(res.code === 'MODEL_MISSING' ? 'modelMissing' : 'failed')
          return setActive(null)
        }
        const h = playPcm(res.samples, res.sampleRate)
        handle.current = h
        setActive({ key, phase: 'playing' })
        await h.done
      } catch {
        if (token.current === mine) setError('failed')
      } finally {
        if (token.current === mine) {
          handle.current = null
          setActive(null)
        }
      }
    },
    [active?.key, stop],
  )

  useEffect(() => stop, [stop])
  return { active, error, play, stop }
}
