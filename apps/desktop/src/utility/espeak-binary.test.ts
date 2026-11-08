import { describe, expect, it } from 'vitest'
import { resolveEspeakBinary } from './espeak-binary'

describe('resolveEspeakBinary', () => {
  it('prefers ESPEAK_NG', () => {
    expect(resolveEspeakBinary({ ESPEAK_NG: '/x/espeak-ng' }, '/res', () => true)).toBe(
      '/x/espeak-ng',
    )
  })
  it('uses a bundled binary when present', () => {
    const got = resolveEspeakBinary({}, '/res', (p) => p.startsWith('/res/espeak-ng/'))
    expect(got.replace(/\\/g, '/')).toMatch(/^\/res\/espeak-ng\/espeak-ng(\.exe)?$/)
  })
  it('falls back to PATH when nothing is found', () => {
    expect(resolveEspeakBinary({}, '/res', () => false)).toBe('espeak-ng')
  })
})
