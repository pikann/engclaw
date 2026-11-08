import type { SpeechSummary } from '@engclaw/ipc-contract'

/** Hard ceiling on what one turn's analysis may add to the prompt (≈4 characters per token). */
export const SPEECH_CONTEXT_TOKEN_BUDGET = 200
export const approxTokens = (s: string) => Math.ceil(s.length / 4)

/**
 * Renders the summary as the tagged block appended to the learner's message. The word list is
 * already truncated by the builder; here it only drops further words if the budget is exceeded.
 */
export function formatSpeechContext(s: SpeechSummary): string {
  const render = (n: number): string => {
    const words = s.words
      .slice(0, n)
      .map((w) => `${w.word} /${w.expected}/ heard /${w.heard}/ (${w.confidence})`)
      .join('; ')
    return [
      `[speech analysis v${s.v}, from the learner's voice, not typed]`,
      `score ${Math.round(s.score)}/100, word errors ${Math.round(s.wer * 100)}%, sound errors ${Math.round(s.per * 100)}%`,
      `mispronounced (${s.flaggedWords} flagged${s.flaggedWords > n ? `, worst ${n}` : ''}): ${words || 'none'}`,
      `pace ${s.pace.wpm} wpm, ${s.pace.pauses} pauses (longest ${s.pace.longestPauseSec}s)`,
      `intonation ${s.intonation.ending} at the end, pitch range ${s.intonation.rangeSemitones} semitones`,
      '[end speech analysis]',
    ].join('\n')
  }
  for (let n = s.words.length; n > 0; n--) {
    const text = render(n)
    if (approxTokens(text) <= SPEECH_CONTEXT_TOKEN_BUDGET) return text
  }
  return render(0)
}
