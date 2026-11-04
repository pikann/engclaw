import { describe, expect, it } from 'vitest'
import { KokoroSynthesizer, type KokoroRun } from './kokoro'

const vocab = { a: 1, b: 2, ' ': 3, ˈ: 4 }

function setup(overrides: Partial<{ ids: string[] }> = {}) {
  const runs: { tokens: number[]; styleFirst: number }[] = []
  const run: KokoroRun = async (tokens, style) => {
    runs.push({ tokens, styleFirst: style[0]! })
    // 24 kHz: 0.1 s of silence, 2400 samples of signal, 0.1 s silence.
    const out = new Float32Array(24000 * 0.1 * 2 + 2400)
    out.fill(0.5, 2400, 4800)
    return out
  }
  const voice = new Float32Array(510 * 256)
  for (let r = 0; r < 510; r++) voice.fill(r, r * 256, (r + 1) * 256)
  const lines: string[][] = []
  const synth = new KokoroSynthesizer({
    id: 't',
    run,
    vocab,
    voice,
    ipa: async (l) => (lines.push(l), (overrides.ids ?? l.map(() => 'ˈa_b a')).slice(0, l.length)),
  })
  return { synth, runs, lines }
}

describe('KokoroSynthesizer', () => {
  it('runs one chunk per sentence with pad tokens and the style row for its length', async () => {
    const { synth, runs, lines } = setup()
    const out = await synth.synthesize('Hello there. Bye now!')
    expect(lines[0]).toEqual(['Hello there', 'Bye now'])
    expect(runs).toHaveLength(2)
    expect(runs[0]!.tokens).toEqual([0, 4, 1, 2, 3, 1, 0])
    expect(runs[0]!.styleFirst).toBe(5)
    expect(out.length).toBeGreaterThan(0)
  })

  it('trims silence (keeping a small margin) and resamples 24 kHz to 16 kHz', async () => {
    const { synth } = setup()
    const out = await synth.synthesize('Hello')
    // 2400 samples of signal + 2*1200 margin = 4800 @24k -> 3200 @16k
    expect(out.length).toBe(3200)
  })

  it('splits sentences over the token limit across calls', async () => {
    const { synth, runs } = setup({ ids: ['a'.repeat(600)] })
    await synth.synthesize('One long sentence')
    expect(runs.map((r) => r.tokens.length - 2)).toEqual([510, 90])
  })

  it('rejects text with nothing to say', async () => {
    await expect(setup().synth.synthesize('...')).rejects.toThrow('nothing to say')
  })
})
