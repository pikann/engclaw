import { capClip, MAX_CLIP_SECONDS } from './clip'
import { downmixToMono, TARGET_SAMPLE_RATE } from './resample'
import type { Recording } from './recorder'

/** Decode compressed audio bytes to 16 kHz mono PCM via OfflineAudioContext. */
async function decodeToMono16k(bytes: ArrayBuffer): Promise<Float32Array> {
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
  return downmixToMono(
    Array.from({ length: rendered.numberOfChannels }, (_, i) => rendered.getChannelData(i)),
  )
}

/** Decode an imported/dropped audio file and resample to 16 kHz mono via OfflineAudioContext. */
export async function decodeFile(file: Blob): Promise<Recording & { truncated: boolean }> {
  const mono = await decodeToMono16k(await file.arrayBuffer())
  const { samples, truncated } = capClip(mono, TARGET_SAMPLE_RATE, MAX_CLIP_SECONDS)
  return {
    samples,
    sampleRate: TARGET_SAMPLE_RATE,
    seconds: samples.length / TARGET_SAMPLE_RATE,
    truncated,
  }
}

/** Index range of `[startSec, endSec]` inside audio that begins at `offsetSec`, clamped to its length. */
export function rangeSamples(
  length: number,
  offsetSec: number,
  startSec: number,
  endSec: number,
  sampleRate = TARGET_SAMPLE_RATE,
): [number, number] {
  const from = Math.min(length, Math.max(0, Math.round((startSec - offsetSec) * sampleRate)))
  const to = Math.min(length, Math.max(from, Math.round((endSec - offsetSec) * sampleRate)))
  return [from, to]
}

/** A fetched YouTube audio window (starting at `offsetSec`) trimmed to the segment, as 16 kHz mono. */
export async function decodeSegmentAudio(
  bytes: Uint8Array,
  offsetSec: number,
  startSec: number,
  endSec: number,
): Promise<Float32Array> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const mono = await decodeToMono16k(buffer as ArrayBuffer)
  const [from, to] = rangeSamples(mono.length, offsetSec, startSec, endSec)
  return mono.slice(from, to)
}

export function isAudioFile(f: File): boolean {
  return f.type.startsWith('audio/') || /\.(wav|mp3|m4a|ogg|oga|flac|webm|aac)$/i.test(f.name)
}
