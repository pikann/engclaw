/** 16-bit mono PCM WAV encode/decode for the optional per-attempt recording. */

export function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + samples.length * 2, 4)
  buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(samples.length * 2, 40)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!))
    buf.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), 44 + i * 2)
  }
  return buf
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
