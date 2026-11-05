import { useCallback, useEffect, useRef, useState } from 'react'
import type { RecentVideo } from '@engclaw/ipc-contract'
import { ShadowingEntry } from '@/components/shadowing/entry'
import { ShadowingSession } from '@/components/shadowing/session'
import {
  mapYouTubeError,
  parseVideoUrl,
  pickCaptionTrack,
  segmentCues,
  type EntryError,
  type Segment,
} from '@/lib/shadowing'

interface Loaded {
  videoId: string
  title: string
  segments: Segment[]
}

const watchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`

export function ShadowingPage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<EntryError | null>(null)
  const [recents, setRecents] = useState<RecentVideo[]>([])
  const [session, setSession] = useState<Loaded | null>(null)
  const lastId = useRef<string | null>(null)
  const request = useRef(0)

  const refreshRecents = useCallback(() => {
    void window.engclaw.youtube.recent().then(setRecents)
  }, [])
  useEffect(() => {
    if (!session) refreshRecents()
  }, [session, refreshRecents])

  const load = useCallback(async (videoId: string) => {
    const mine = ++request.current
    const current = () => request.current === mine
    lastId.current = videoId
    setLoading(true)
    setError(null)
    const fail = (e: EntryError) => {
      if (!current()) return
      setLoading(false)
      setError(e)
    }

    const meta = await window.engclaw.youtube.meta({ videoId })
    if (!meta.ok) return fail(mapYouTubeError(meta.code, 'meta'))
    const lang = pickCaptionTrack(meta.value.captionTracks)
    if (!lang) return fail('noTranscript')
    const transcript = await window.engclaw.youtube.transcript({ videoId, lang })
    if (!transcript.ok) return fail(mapYouTubeError(transcript.code, 'transcript'))
    const segments = segmentCues(transcript.value)
    if (!segments.length) return fail('noTranscript')
    if (!current()) return
    setLoading(false)
    setSession({ videoId, title: meta.value.title, segments })
  }, [])

  const submit = () => {
    const videoId = parseVideoUrl(url)
    if (!videoId) {
      request.current++
      setLoading(false)
      setError('invalid')
      return
    }
    void load(videoId)
  }

  if (session)
    return (
      <ShadowingSession
        key={session.videoId}
        videoId={session.videoId}
        title={session.title}
        segments={session.segments}
        onBack={() => setSession(null)}
      />
    )

  return (
    <ShadowingEntry
      url={url}
      onUrlChange={(next) => {
        setUrl(next)
        setError(null)
      }}
      onSubmit={submit}
      loading={loading}
      error={error}
      onRetry={() => lastId.current && void load(lastId.current)}
      recents={recents}
      onOpenRecent={(videoId) => {
        setUrl(watchUrl(videoId))
        void load(videoId)
      }}
    />
  )
}
