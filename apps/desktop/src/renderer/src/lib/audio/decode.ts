import { capClip, MAX_CLIP_SECONDS } from './clip'
import { downmixToMono, TARGET_SAMPLE_RATE } from './resample'
import type { Recording } from './recorder'

/** Decode an imported/dropped audio file and resample to 16 kHz mono via OfflineAudioContext. */
export async function decodeFile(file: Blob): Promise<Recording & { truncated: boolean }> {
  const bytes = await file.arrayBuffer()
  const probe = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await probe.decodeAudioData(bytes)
  } finally {
    await probe.close()
  }
  const length = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE))
  const offline = new OfflineAudioContext(1, length, TARGET_SAMPLE_RATE)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination) // channel mixing downmixes to mono
  src.start()
  const rendered = await offline.startRendering()
  const mono = downmixToMono(
    Array.from({ length: rendered.numberOfChannels }, (_, i) => rendered.getChannelData(i)),
  )
  const { samples, truncated } = capClip(mono, TARGET_SAMPLE_RATE, MAX_CLIP_SECONDS)
  return {
    samples,
    sampleRate: TARGET_SAMPLE_RATE,
    seconds: samples.length / TARGET_SAMPLE_RATE,
    truncated,
  }
}

export function isAudioFile(f: File): boolean {
  return f.type.startsWith('audio/') || /\.(wav|mp3|m4a|ogg|oga|flac|webm|aac)$/i.test(f.name)
}
