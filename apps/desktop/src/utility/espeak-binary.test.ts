import { describe, expect, it } from 'vitest'
import { resolveEspeak } from './espeak-binary'

const posix = (p: string | undefined): string | undefined => p?.replace(/\\/g, '/')

describe('resolveEspeak', () => {
  it('prefers ESPEAK_NG and ESPEAK_DATA_PATH', () => {
    expect(
      resolveEspeak({ ESPEAK_NG: '/x/espeak-ng', ESPEAK_DATA_PATH: '/x/d' }, '/res', () => true),
    ).toEqual({ binary: '/x/espeak-ng', dataPath: '/x/d' })
  })
  it('uses the bundled binary and its data folder when present', () => {
    const got = resolveEspeak({}, '/res', (p) => posix(p)!.startsWith('/res/espeak-ng/'))
    expect(posix(got.binary)).toMatch(/^\/res\/espeak-ng\/espeak-ng(\.exe)?$/)
    expect(posix(got.dataPath)).toBe('/res/espeak-ng')
  })
  it('finds the copy staged in a source checkout when running unpackaged', () => {
    const got = resolveEspeak(
      {},
      '/electron/res',
      (p) => posix(p)!.startsWith('/repo/resources/espeak-ng/'),
      '/repo/resources',
    )
    expect(posix(got.binary)).toMatch(/^\/repo\/resources\/espeak-ng\/espeak-ng(\.exe)?$/)
    expect(posix(got.dataPath)).toBe('/repo/resources/espeak-ng')
  })
  it('falls back to PATH when nothing is found', () => {
    expect(resolveEspeak({}, '/res', () => false)).toEqual({
      binary: 'espeak-ng',
      dataPath: undefined,
    })
  })
})
