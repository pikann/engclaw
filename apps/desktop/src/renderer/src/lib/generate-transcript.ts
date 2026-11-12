import type { EngclawApi, LearningLanguage, TranscriptCue } from '@engclaw/ipc-contract'

export class TranscriptGenerationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/** Bounded audio windows keep IPC, decoding and inference memory independent of video length. */
export async function generateTranscript({
  api,
  decode,
  videoId,
  duration,
  language,
  current,
  progress,
  onRequest,
}: {
  api: Pick<EngclawApi, 'youtube' | 'inference'>
  decode: (bytes: Uint8Array, offset: number, start: number, end: number) => Promise<Float32Array>
  videoId: string
  duration: number
  language: LearningLanguage
  current: () => boolean
  progress: (seconds: number) => void
  onRequest: (id: string) => void
}): Promise<TranscriptCue[] | null> {
  const cues: TranscriptCue[] = []
  for (let start = 0; start < duration; start += 20) {
    if (!current()) return null
    const end = Math.min(start + 20, duration)
    const range = await api.youtube.audioRange({ videoId, start, end })
    if (!current()) return null
    if (!range.ok) throw new TranscriptGenerationError(range.code, range.message)
    const audio = await decode(range.value.bytes, range.value.offsetSec, start, end)
    if (!current()) return null
    if (audio.length >= 3200) {
      const requestId = crypto.randomUUID()
      onRequest(requestId)
      const result = await api.inference.transcribe({ requestId, audio, language })
      if (!current()) return null
      if (!result.ok) throw new TranscriptGenerationError(result.code, result.message)
      const text = result.value.text.trim()
      if (text) cues.push({ start, dur: end - start, text })
    }
    progress(end)
  }
  if (!cues.length) throw new TranscriptGenerationError('NO_SPEECH', 'No speech was recognized')
  if (!current()) return null
  await api.youtube.saveGeneratedTranscript({ videoId, language, cues })
  return current() ? cues : null
}
