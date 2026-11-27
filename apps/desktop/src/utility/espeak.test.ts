import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { afterAll, describe, expect, it } from 'vitest'
import { CachedPhonemizer } from '@engclaw/pronounce'
import { SpeakRequest } from '@engclaw/ipc-contract'
import { englishSoundGroups } from '../renderer/src/lib/english-sound'
import { englishIpaArgs, EspeakProcess, speakEnglishIpa } from './espeak'
import { resolveEspeak } from './espeak-binary'

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

const chartVoice = resolveEspeak(
  process.env,
  undefined,
  undefined,
  fileURLToPath(new URL('../../resources', import.meta.url)),
)
const chartVoiceAvailable =
  spawnSync(chartVoice.binary, ['--version'], { timeout: 2000 }).status === 0

it.skipIf(!chartVoiceAvailable)(
  'reads the expected IPA for every chart sound and example',
  async () => {
    const phonemes = (ipa: string, example?: string) => {
      const run = spawnSync(
        chartVoice.binary,
        ['-q', '--ipa', ...englishIpaArgs(ipa, chartVoice.dataPath, example)],
        { encoding: 'utf8', timeout: 2000 },
      )
      expect(run.status, run.stderr).toBe(0)
      return run.stdout.replace(/[ˈˌː\s]/gu, '')
    }

    for (const { ipa, example } of englishSoundGroups.flatMap((group) => group.sounds)) {
      expect(SpeakRequest.safeParse({ text: ipa, language: 'en', ipa: true }).success, ipa).toBe(
        true,
      )
      const expected = ipa === 'ɝ' ? 'ɚ' : ipa
      expect(phonemes(ipa), ipa).toBe(expected)
      expect(phonemes(ipa, example), `${ipa} in ${example}`).toContain(expected)
      const samples = await speakEnglishIpa(ipa, chartVoice)
      const peak = samples.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0)
      expect(peak, ipa).toBeGreaterThan(0.005)
    }
  },
  15000,
)
