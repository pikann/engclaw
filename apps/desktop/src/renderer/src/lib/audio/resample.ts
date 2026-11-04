/** Pure resampling helpers (no DOM) so they are unit-testable in Node. */

export function downmixToMono(channels: Float32Array[]): Float32Array {
  const first = channels[0]
  if (!first) return new Float32Array(0)
  if (channels.length === 1) return first
  const out = new Float32Array(first.length)
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i]! += ch[i] ?? 0
  for (let i = 0; i < out.length; i++) out[i]! /= channels.length
  return out
}

export { resampleLinear, TARGET_SAMPLE_RATE } from '@engclaw/pronounce'
