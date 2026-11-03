/** Frame RMS energy; mirrors librosa.feature.rms(center=True, pad_mode='constant'). */
export function rms(y: Float32Array, frameLength = 2048, hopLength = 512): Float32Array {
  const pad = frameLength >> 1
  const nFrames = 1 + Math.floor(y.length / hopLength)
  const out = new Float32Array(nFrames)
  for (let t = 0; t < nFrames; t++) {
    const start = t * hopLength - pad
    let sum = 0
    for (let i = 0; i < frameLength; i++) {
      const v = y[start + i]
      if (v !== undefined && start + i >= 0) sum += v * v
    }
    out[t] = Math.sqrt(sum / frameLength)
  }
  return out
}
