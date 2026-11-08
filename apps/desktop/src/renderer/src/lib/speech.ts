export interface SpeakApi {
  speak(req: { text: string }): Promise<{ ok: boolean }>
}

/**
 * Warms the Kokoro audio cache for upcoming texts, one at a time so it never competes with a
 * foreground request for long. Stops at the first failure (model missing, offline) or when
 * `live()` turns false; a prefetch never surfaces errors.
 */
export async function prefetchSpeech(
  texts: readonly string[],
  api: SpeakApi,
  live: () => boolean,
): Promise<number> {
  let warmed = 0
  for (const text of texts) {
    if (!live()) break
    try {
      if (!(await api.speak({ text })).ok) break
    } catch {
      break
    }
    warmed++
  }
  return warmed
}
