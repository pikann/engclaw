/** Encode mono PCM as standard 16-bit WAV for storage or browser media playback. */
export function encodePcmWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytes = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(bytes)
  const tag = (value: string, offset: number) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }
  tag('RIFF', 0)
  view.setUint32(4, 36 + samples.length * 2, true)
  tag('WAVEfmt ', 8)
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  tag('data', 36)
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]!))
    view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 0x8000 : 0x7fff)), true)
  }
  return bytes
}
