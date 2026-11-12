import { useLearningLanguage } from './learning-language'
import { useEffect, useState } from 'react'
import type { IpaWord } from '@engclaw/ipc-contract'
import type { Segment } from './shadowing'

const KEY = 'shadowing.showIpa'

export function useShowIpa() {
  const [show, setShow] = useState(() => localStorage.getItem(KEY) === '1')
  const set = (on: boolean) => {
    localStorage.setItem(KEY, on ? '1' : '0')
    setShow(on)
  }
  return [show, set] as const
}

export type IpaState =
  | { status: 'idle' | 'loading' | 'error' }
  | { status: 'ready'; byText: ReadonlyMap<string, readonly IpaWord[]> }

/** IPA of every transcript sentence, fetched once when enabled (main caches it per video). */
export function useTranscriptIpa(videoId: string, segments: readonly Segment[], enabled: boolean) {
  const language = useLearningLanguage()
  const [state, setState] = useState<IpaState>({ status: 'idle' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    const texts = [...new Set(segments.map((s) => s.text))]
    const ready = (value: readonly (readonly IpaWord[])[]): IpaState => ({
      status: 'ready',
      byText: new Map(texts.map((t, i) => [t, value[i] ?? []])),
    })
    const load = async () => {
      const cached = await window.engclaw.youtube.ipa({
        videoId,
        texts,
        cachedOnly: true,
        language,
      })
      if (!live) return
      if (cached.ok && cached.value.length > 0) return setState(ready(cached.value))
      if (!enabled) return setState({ status: 'idle' })
      setState({ status: 'loading' })
      const res = await window.engclaw.youtube.ipa({ videoId, texts, language })
      if (live) setState(res.ok ? ready(res.value) : { status: 'error' })
    }
    void load().catch(() => live && setState({ status: 'error' }))
    return () => {
      live = false
    }
  }, [enabled, videoId, segments, attempt, language])
  return { state, retry: () => setAttempt((n) => n + 1) }
}
