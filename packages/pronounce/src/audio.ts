/** wav2vec2 input preparation. */

/** wav2vec2 feature-extractor `do_normalize`: zero mean, unit variance. */
export function normalizeWaveform(samples: Float32Array): Float32Array {
  const n = samples.length
  if (n === 0) return new Float32Array(0)
  let sum = 0
  for (let i = 0; i < n; i++) sum += samples[i]!
  const mean = sum / n
  let sq = 0
  for (let i = 0; i < n; i++) sq += (samples[i]! - mean) ** 2
  const inv = 1 / Math.sqrt(sq / n + 1e-7)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = (samples[i]! - mean) * inv
  return out
}
