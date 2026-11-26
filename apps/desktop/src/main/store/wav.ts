import { encodePcmWav } from '../../shared/pcm-wav'

/** 16-bit mono PCM WAV encode/decode for the optional per-attempt recording. */
export function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  return Buffer.from(encodePcmWav(samples, sampleRate))
}

export function decodeWav(buf: Buffer): { samples: Float32Array; sampleRate: number } {
  if (
    buf.length < 44 ||
    buf.toString('ascii', 0, 4) !== 'RIFF' ||
    buf.toString('ascii', 8, 12) !== 'WAVE'
  )
    throw new Error('Not a WAV file')
  const sampleRate = buf.readUInt32LE(24)
  const n = Math.floor((buf.length - 44) / 2)
  const samples = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const v = buf.readInt16LE(44 + i * 2)
    samples[i] = v < 0 ? v / 0x8000 : v / 0x7fff
  }
  return { samples, sampleRate }
}
