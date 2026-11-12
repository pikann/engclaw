import { useLearningLanguage } from '@/lib/learning-language'
import { useCallback, useEffect, useRef, useState } from 'react'
import { playPcm } from '@/lib/audio'

/** Spoken length of each word (ms) for the browser voice, learned the first time it is played. */
const spokenMs = new Map<string, number>()
let speaking: SpeechSynthesisUtterance | undefined

/**
 * Say a word with the browser voice (fallback when the local voice is missing). It reports only
 * when speech starts and ends, so `onStart`/`onEnd` let the animation begin and stop with it.
 */
function speakBrowser(
  word: string,
  on: { onStart: () => void; onEnd: (ms: number) => void },
): void {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(word)
  u.lang = /\p{Script=Han}/u.test(word) ? 'zh-CN' : 'en-US'
  let t0 = 0
  speaking = u
  // A cancelled earlier word may still report its end; only the latest one counts.
  u.onstart = () => {
    if (speaking !== u) return
    t0 = performance.now()
    on.onStart()
  }
  u.onend = () => {
    if (speaking === u) on.onEnd(performance.now() - t0)
  }
  window.speechSynthesis.speak(u)
}

export interface ArticulationCue {
  playId: number
  stopId: number
  durationMs: number | undefined
}

/**
 * Plays a word's sounds as mouth/tongue animation, alone (pick a sound) or with the word's audio
 * (`hear`). With the local voice the audio is generated first, then played and animated in the
 * same moment for exactly its length, so first play is as in sync as any other.
 */
export function useWordArticulation(word: string, sounds: readonly string[]) {
  const language = useLearningLanguage()
  const [selected, setSelected] = useState<number | null>(null)
  const [cue, setCue] = useState<ArticulationCue>({ playId: 0, stopId: 0, durationMs: undefined })
  const [loading, setLoading] = useState(false)
  const playing = useRef<{ stop: () => void } | null>(null)
  const token = useRef(0)

  const halt = useCallback(() => {
    token.current++
    playing.current?.stop()
    playing.current = null
    speaking = undefined
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  }, [])

  useEffect(() => {
    setSelected(null)
    setLoading(false)
    setCue((c) => ({ ...c, stopId: c.stopId + 1 }))
    // Warm the voice cache so the first Hear it has little to wait for.
    void window.engclaw?.tts?.speak({ text: word, language }).catch(() => undefined)
    return halt
  }, [word, halt, language])

  const play = (durationMs: number | undefined): void => {
    setSelected(null)
    setCue((c) => ({ ...c, playId: c.playId + 1, durationMs }))
  }
  const stop = (): void => setCue((c) => ({ ...c, stopId: c.stopId + 1 }))

  const hear = async (): Promise<void> => {
    halt()
    const mine = token.current
    const browser = (): void =>
      speakBrowser(word, {
        onStart: () => play(spokenMs.get(word)),
        onEnd: (ms) => {
          spokenMs.set(word, ms)
          stop()
        },
      })
    const tts = window.engclaw?.tts
    if (!tts) return browser()
    setLoading(true)
    try {
      const res = await tts.speak({ text: word, language })
      if (mine !== token.current) return
      if (!res.ok) return browser()
      const handle = playPcm(res.samples, res.sampleRate)
      playing.current = handle
      play((res.samples.length / res.sampleRate) * 1000)
      setLoading(false)
      await handle.done
      if (mine === token.current) stop()
    } catch {
      if (mine === token.current) browser()
    } finally {
      if (mine === token.current) setLoading(false)
    }
  }

  const pick = (i: number): void => {
    halt()
    setSelected(i)
    setCue((c) => ({ ...c, playId: c.playId + 1, durationMs: undefined }))
  }

  return {
    selected,
    pick,
    hear,
    loading,
    view: {
      phones: selected === null ? sounds : sounds.slice(selected, selected + 1),
      ...cue,
    },
  }
}
