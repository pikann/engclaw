import { describe, expect, it, vi } from 'vitest'
import type { IpaWord } from '@engclaw/ipc-contract'
import { transcriptIpa } from './transcript-ipa'

function memory() {
  const rows = new Map<string, IpaWord[]>()
  return {
    rows,
    getIpa: (v: string, t: string) => rows.get(`${v}|${t}`) ?? null,
    putIpa: (v: string, t: string, w: readonly IpaWord[]) => void rows.set(`${v}|${t}`, [...w]),
  }
}
const ok = (word: string, phones: string[]) => ({
  ok: true as const,
  value: { words: [{ word, phones }], language: 'en' },
})

describe('transcriptIpa', () => {
  it('joins phones into IPA words and caches them per video', async () => {
    const store = memory()
    const phonemize = vi.fn(async () => ok('hello', ['h', 'ə', 'l', 'oʊ']))
    const first = await transcriptIpa(store, phonemize, 'vid', ['Hello'])
    expect(first).toEqual({ ok: true, value: [[{ word: 'hello', ipa: 'həloʊ' }]] })
    await transcriptIpa(store, phonemize, 'vid', ['Hello'])
    expect(phonemize).toHaveBeenCalledTimes(1)
    await transcriptIpa(store, phonemize, 'other', ['Hello'])
    expect(phonemize).toHaveBeenCalledTimes(2)
  })

  it('returns the failure and caches nothing for the failed sentence', async () => {
    const store = memory()
    const fail = { ok: false as const, code: 'FAILED' as const, message: 'boom' }
    const res = await transcriptIpa(store, async () => fail, 'vid', ['Hello'])
    expect(res).toEqual(fail)
    expect(store.rows.size).toBe(0)
  })
})
