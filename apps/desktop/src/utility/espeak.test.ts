import { spawnSync } from 'node:child_process'
import { afterAll, describe, expect, it } from 'vitest'
import { CachedPhonemizer } from '@engclaw/pronounce'
import { EspeakProcess } from './espeak'

const binary = process.env.ESPEAK_NG ?? 'espeak-ng'
const available = spawnSync(binary, ['--version']).status === 0

describe.skipIf(!available)('EspeakProcess (real espeak-ng)', () => {
  const backend = new EspeakProcess({ binary })
  afterAll(() => backend.dispose())

  it('answers line-for-line on one long-lived child', async () => {
    expect(await backend.phonemize(['hello world', 'the cat'])).toEqual([
      'h_ə_l_ˈoʊ w_ˈɜː_l_d',
      'ð_ə k_ˈæ_t',
    ])
    expect(await backend.phonemize(["don't"])).toEqual(['d_ˈoʊ_n_t'])
  })

  it('feeds the phonemizer service end to end', async () => {
    const p = new CachedPhonemizer(backend)
    expect((await p.getExpectedPhones('Hello, world!')).join(' ')).toBe('h ə l oʊ w ɚ l d')
  })

  it('respawns after the child dies', async () => {
    const b = new EspeakProcess({ binary })
    await b.phonemize(['hi'])
    b.dispose()
    expect(await b.phonemize(['hi'])).toEqual(['h_ˈaɪ'])
    b.dispose()
  })
})
