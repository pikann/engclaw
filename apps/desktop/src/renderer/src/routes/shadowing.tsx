import { useLearningLanguage } from '@/lib/learning-language'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RecentVideo, TranscriptCue } from '@engclaw/ipc-contract'
import { ShadowingEntry } from '@/components/shadowing/entry'
import { ShadowingSession } from '@/components/shadowing/session'
import { useModelDownload } from '@/components/download-models'
import { Button } from '@/components/ui/button'
import { decodeSegmentAudio } from '@/lib/audio/decode'
import { generateTranscript, TranscriptGenerationError } from '@/lib/generate-transcript'
import {
  mapYouTubeError,
  parseVideoUrl,
  pickCaptionTrack,
  segmentCues,
  type EntryError,
  type Segment,
} from '@/lib/shadowing'

interface Source {
  videoId: string
  title: string
  durationSec: number
}
interface Loaded {
  videoId: string
  title: string
  segments: Segment[]
  generated?: boolean
}
const generatedSegments = (cues: TranscriptCue[]): Segment[] =>
  cues.map((cue, index) => ({ index, start: cue.start, end: cue.start + cue.dur, text: cue.text }))
const watchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`

export function ShadowingPage() {
  const language = useLearningLanguage()
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<EntryError | null>(null)
  const [recents, setRecents] = useState<RecentVideo[]>([])
  const [session, setSession] = useState<Loaded | null>(null)
  const [source, setSource] = useState<Source | null>(null)
  const [generatedSeconds, setGeneratedSeconds] = useState<number | null>(null)
  const lastId = useRef<string | null>(null)
  const request = useRef(0)
  const asrRequest = useRef<string | null>(null)
  const download = useModelDownload(() => void generate())

  const cancel = useCallback(() => {
    request.current++
    if (asrRequest.current) void window.engclaw.inference.cancel({ requestId: asrRequest.current })
    asrRequest.current = null
    setLoading(false)
    setGeneratedSeconds(null)
  }, [])
  useEffect(
    () => () => {
      request.current++
      if (asrRequest.current)
        void window.engclaw.inference.cancel({ requestId: asrRequest.current })
    },
    [],
  )

  const refreshRecents = useCallback(() => {
    void window.engclaw.youtube.recent().then(setRecents)
  }, [])
  useEffect(() => {
    if (!session) refreshRecents()
  }, [session, refreshRecents])

  async function generate() {
    if (!source || !(source.durationSec > 0)) return
    cancel()
    const mine = ++request.current
    const current = () => request.current === mine
    setLoading(true)
    setError(null)
    try {
      const models = await window.engclaw.models.list()
      if (!current()) return
      if (!models.some((model) => model.id === `asr-${language}` && model.state === 'ready')) {
        setError('noTranscript')
        setLoading(false)
        download.open()
        return
      }
      setGeneratedSeconds(0)
      const cues = await generateTranscript({
        api: window.engclaw,
        decode: decodeSegmentAudio,
        videoId: source.videoId,
        duration: source.durationSec,
        language,
        current,
        progress: (seconds) => {
          if (current()) setGeneratedSeconds(seconds)
        },
        onRequest: (id) => {
          asrRequest.current = id
        },
      })
      if (cues && current())
        setSession({ ...source, segments: generatedSegments(cues), generated: true })
    } catch (e) {
      console.error('[shadowing:generate]', e)
      if (!current()) return
      if (e instanceof TranscriptGenerationError && e.code === 'MODEL_MISSING') {
        setError('noTranscript')
        download.open()
      } else
        setError(
          e instanceof Error && /(?:status code|status) 403/.test(e.message)
            ? 'audioBlocked'
            : 'transcribeFailed',
        )
    } finally {
      if (current()) {
        setLoading(false)
        setGeneratedSeconds(null)
        asrRequest.current = null
      }
    }
  }

  const load = useCallback(
    async (videoId: string) => {
      cancel()
      const mine = ++request.current
      const current = () => request.current === mine
      lastId.current = videoId
      setLoading(true)
      setError(null)
      setSource(null)
      const fail = (e: EntryError) => {
        if (current()) {
          setLoading(false)
          setError(e)
        }
      }
      try {
        const meta = await window.engclaw.youtube.meta({ videoId })
        if (!current()) return
        if (!meta.ok) return fail(mapYouTubeError(meta.code, 'meta'))
        setSource(meta.value)
        const lang = pickCaptionTrack(meta.value.captionTracks, language)
        if (!lang) return fail('noTranscript')
        const transcript = await window.engclaw.youtube.transcript({ videoId, lang })
        if (!current()) return
        if (!transcript.ok) return fail(mapYouTubeError(transcript.code, 'transcript'))
        const segments = lang.endsWith('-x-engclaw-asr')
          ? generatedSegments(transcript.value)
          : segmentCues(transcript.value)
        if (!segments.length) return fail('noTranscript')
        setLoading(false)
        setSession({
          videoId,
          title: meta.value.title,
          segments,
          generated: lang.endsWith('-x-engclaw-asr'),
        })
      } catch {
        fail('network')
      }
    },
    [language, cancel],
  )

  const submit = () => {
    const videoId = parseVideoUrl(url)
    if (!videoId) {
      cancel()
      setSource(null)
      setError('invalid')
      return
    }
    void load(videoId)
  }

  if (session)
    return (
      <ShadowingSession
        key={`${language}:${session.videoId}`}
        videoId={session.videoId}
        title={session.title}
        segments={session.segments}
        generated={session.generated}
        onBack={() => setSession(null)}
      />
    )

  return (
    <>
      <ShadowingEntry
        url={url}
        onUrlChange={(next) => {
          cancel()
          setUrl(next)
          setSource(null)
          setError(null)
        }}
        onSubmit={submit}
        loading={loading}
        error={error}
        loadingMessage={
          generatedSeconds !== null && source
            ? t('learning.generating', {
                current: Math.floor(generatedSeconds),
                total: Math.ceil(source.durationSec),
              })
            : undefined
        }
        onCancel={
          generatedSeconds !== null
            ? () => {
                cancel()
                setError('noTranscript')
              }
            : undefined
        }
        transcriptAction={
          source &&
          (error === 'noTranscript' || error === 'transcribeFailed' || error === 'audioBlocked') &&
          source.durationSec > 0 ? (
            <div className="space-y-2">
              <p>{t('learning.generateHint')}</p>
              <Button
                type="button"
                data-testid="shadowing-generate"
                disabled={loading}
                onClick={() => void generate()}
              >
                {t('learning.generate')}
              </Button>
            </div>
          ) : undefined
        }
        onRetry={() => lastId.current && void load(lastId.current)}
        recents={recents}
        onOpenRecent={(videoId) => {
          setUrl(watchUrl(videoId))
          void load(videoId)
        }}
      />
      {download.dialog}
    </>
  )
}
