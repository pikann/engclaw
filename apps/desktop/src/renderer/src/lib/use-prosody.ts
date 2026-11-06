import { useEffect, useRef, useState } from 'react'
import type { InferenceResult, SegmentProsody } from '@engclaw/ipc-contract'
import { decodeSegmentAudio } from '@/lib/audio/decode'
import type { Segment } from './shadowing'

const GUIDE_KEY = 'shadowing.showProsody'

function useStoredFlag(key: string) {
  const [on, setOn] = useState(() => localStorage.getItem(key) === '1')
  const set = (value: boolean) => {
    localStorage.setItem(key, value ? '1' : '0')
    setOn(value)
  }
  return [on, set] as const
}

export const useShowProsody = () => useStoredFlag(GUIDE_KEY)

export type ProsodyState =
  { status: 'idle' | 'loading' | 'error' } | { status: 'ready'; value: SegmentProsody }

export interface ProsodyApi {
  youtube: {
    prosody(r: {
      videoId: string
      start: number
      end: number
      text: string
      audio?: Float32Array
      cachedOnly?: boolean
    }): Promise<InferenceResult<SegmentProsody | null>>
    audioRange(r: {
      videoId: string
      start: number
      end: number
    }): Promise<{ ok: true; value: { bytes: Uint8Array; offsetSec: number } } | { ok: false }>
  }
}

export interface ProsodyDeps {
  api: ProsodyApi
  decode(bytes: Uint8Array, offsetSec: number, start: number, end: number): Promise<Float32Array>
}

/**
 * Prosody of one segment: the cache answers first, so a segment analysed before never shows a
 * loading step. On a miss it is only computed when `analyze` is set (the guide is switched on).
 */
export async function loadSegmentProsody(
  { api, decode }: ProsodyDeps,
  videoId: string,
  segment: Pick<Segment, 'start' | 'end' | 'text'>,
  analyze: boolean,
  onLoading: () => void = () => undefined,
): Promise<ProsodyState> {
  const ref = { videoId, start: segment.start, end: segment.end, text: segment.text }
  try {
    const cached = await api.youtube.prosody({ ...ref, cachedOnly: true })
    if (cached.ok && cached.value) return { status: 'ready', value: cached.value }
    if (!analyze) return { status: 'idle' }
    onLoading()
    const range = await api.youtube.audioRange({
      videoId,
      start: segment.start,
      end: segment.end,
    })
    if (!range.ok) return { status: 'error' }
    const audio = await decode(range.value.bytes, range.value.offsetSec, segment.start, segment.end)
    const res = await api.youtube.prosody({ ...ref, audio })
    return res.ok && res.value ? { status: 'ready', value: res.value } : { status: 'error' }
  } catch {
    return { status: 'error' }
  }
}

/** Prosody of the shown segment, analysed in the background while the transcript stays usable. */
export function useSegmentProsody(videoId: string, segment: Segment | undefined, enabled: boolean) {
  const [result, setResult] = useState<{ key: string; state: ProsodyState } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const key = segment ? `${videoId}:${segment.start}:${segment.end}:${segment.text}` : ''
  useEffect(() => {
    if (!segment) return
    let live = true
    void loadSegmentProsody(
      { api: window.engclaw, decode: decodeSegmentAudio },
      videoId,
      segment,
      enabled,
      () => live && setResult({ key, state: { status: 'loading' } }),
    ).then((state) => {
      if (live) setResult({ key, state })
    })
    return () => {
      live = false
    }
    // `segment` is identified by `key`; its object identity changes with every transcript render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, videoId, enabled, attempt])
  const state: ProsodyState = result?.key === key ? result.state : { status: 'idle' }
  return { state, retry: () => setAttempt((n) => n + 1) }
}

/** Segments in the order a background pass should analyse them: from `from` onwards, then wrapping. */
export function prefetchOrder<T>(segments: readonly T[], from: number): T[] {
  const start = Math.min(Math.max(from, 0), segments.length)
  return [...segments.slice(start), ...segments.slice(0, start)]
}

/**
 * Analyses every segment of the video one after another, so each is already cached by the time the
 * learner reaches it. Cached segments cost one cache lookup; a failed segment is skipped.
 */
export async function prefetchProsody(
  deps: ProsodyDeps,
  videoId: string,
  segments: readonly Pick<Segment, 'start' | 'end' | 'text'>[],
  isLive: () => boolean,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<void> {
  let failures = 0
  for (const segment of segments) {
    if (!isLive()) return
    const state = await loadSegmentProsody(deps, videoId, segment, true)
    failures = state.status === 'error' ? failures + 1 : 0
    // YouTube throttles a burst of audio lookups, so a failing pass slows down instead of hammering.
    if (failures) await sleep(Math.min(2000 * 2 ** (failures - 1), 60_000))
  }
}

/** Starts the background pass for a video; it restarts only when the video or its transcript changes. */
export function usePrefetchProsody(
  videoId: string,
  segments: readonly Segment[],
  startIndex: number,
) {
  const latest = useRef({ segments, startIndex })
  latest.current = { segments, startIndex }
  const transcriptKey = `${videoId}:${segments.length}:${segments[0]?.text ?? ''}:${segments.at(-1)?.end ?? ''}`
  useEffect(() => {
    let live = true
    const { segments: all, startIndex: from } = latest.current
    void prefetchProsody(
      { api: window.engclaw, decode: decodeSegmentAudio },
      videoId,
      prefetchOrder(all, from),
      () => live,
    )
    return () => {
      live = false
    }
  }, [transcriptKey, videoId])
}
