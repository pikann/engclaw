import type { InferenceResult, IpaWord, PhonemizeResult } from '@engclaw/ipc-contract'
import type { VideoStore } from './store/videos'

type Phonemize = (text: string) => Promise<InferenceResult<PhonemizeResult>>

/** IPA words for each transcript sentence; sentences phonemized once are served from SQLite. */
export async function transcriptIpa(
  videos: Pick<VideoStore, 'getIpa' | 'putIpa'>,
  phonemize: Phonemize,
  videoId: string,
  texts: readonly string[],
  cachedOnly = false,
  language = 'en',
): Promise<InferenceResult<IpaWord[][]>> {
  const out: IpaWord[][] = []
  for (const text of texts) {
    const key = language === 'en' ? text : `${language}:${text}`
    let words = videos.getIpa(videoId, key)
    if (!words && cachedOnly) return { ok: true, value: [] }
    if (!words) {
      const res = await phonemize(text)
      if (!res.ok) return res
      words = res.value.words.map((w) => ({ word: w.word, ipa: w.phones.join('') }))
      videos.putIpa(videoId, key, words)
    }
    out.push(words)
  }
  return { ok: true, value: out }
}
