import { renderToStaticMarkup } from 'react-dom/server'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { MemoryRouter } from 'react-router'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { i18nOptions } from '@engclaw/i18n'
import type { PronunciationResult } from '@engclaw/ipc-contract'
import {
  PhonemesDetail,
  PitchDetail,
  ResultSummary,
  useResultView,
  WordsDetail,
} from './practice-result'

const result = {
  score: 84,
  acoustic_distance: 7,
  feedback: { code: 'NEEDS_WORK', words: ['thought'] },
  transcribe: 'the sought went',
  prosody: { f0: [100, 120, 110], energy: [0.1, 0.4, 0.2] },
  differences: {
    phoneme_error_rate: 0.12,
    word_error_rate: 0.33,
    transcribe: 'the sought went',
    expected_vector: [1, 2, 3],
    transcribed_vector: [1, 3, 3],
    expected_phones: [
      ['ð', 'ə'],
      ['θ', 'ɔ', 't'],
      ['w', 'ɛ', 'n', 't'],
    ],
    heard_phones: ['ð', 's'],
    heard_phones_confidence: [0.9, 0.3],
    errors: [
      {
        position: 1,
        word: 'thought',
        expected: 'θɔt',
        actual: 'sɔt',
        actual_word: 'sought',
        phone_distance: 1,
        confidence: 0.8,
        phones: [{ expected: 'θ', heard: 's', confidence: 0.9 }],
      },
    ],
  },
} as unknown as PronunciationResult

function Harness({
  children,
}: {
  children: (v: ReturnType<typeof useResultView>) => React.ReactNode
}) {
  const view = useResultView(result, 'The thought went')
  return <>{children(view)}</>
}

describe('practice result', () => {
  let i18n: ReturnType<typeof createInstance>
  beforeAll(async () => {
    vi.stubGlobal('window', {})
    i18n = createInstance()
    await i18n.use(initReactI18next).init({ ...i18nOptions, ns: [...i18nOptions.ns], lng: 'en' })
  })
  const html = (node: (v: ReturnType<typeof useResultView>) => React.ReactNode) =>
    renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <Harness>{node}</Harness>
        </MemoryRouter>
      </I18nextProvider>,
    )

  it('renders the score, sub-scores, marked words and actions', () => {
    const out = html((view) => (
      <ResultSummary
        result={result}
        view={view}
        selected={1}
        saved
        onSelect={() => undefined}
        onTryAgain={() => undefined}
        onReplay={() => undefined}
        onSpeakFreely={() => undefined}
      />
    ))
    expect(out).toContain('data-testid="result-card"')
    expect(out).toContain('data-score="84"')
    expect(out.match(/data-testid="result-tile"/g)).toHaveLength(3)
    expect(out.match(/data-testid="word-chip"/g)).toHaveLength(3)
    expect(out).toContain('1 of 3 words need work')
    expect(out).toContain('data-testid="result-saved"')
    expect(out).toContain('data-testid="result-speak-freely"')
    expect(out).toContain('data-testid="result-try-again"')
    expect(out).toContain('data-testid="result-replay"')
    expect(out).not.toContain('result-edit')
  })

  it('hides Speak freely when no handler is given (already in free mode)', () => {
    const out = html((view) => (
      <ResultSummary
        result={result}
        view={view}
        selected={null}
        saved={false}
        onSelect={() => undefined}
        onTryAgain={() => undefined}
        onReplay={() => undefined}
      />
    ))
    expect(out).not.toContain('result-speak-freely')
  })

  it('renders phonemes, pitch and the selected word detail', () => {
    expect(html((view) => <PhonemesDetail result={result} view={view} />)).toContain(
      'chart-phoneme',
    )
    expect(html(() => <PitchDetail result={result} />)).toContain('chart-f0')
    const words = html((view) => (
      <WordsDetail view={view} selected={1} onSelect={() => undefined} />
    ))
    expect(words).toContain('data-testid="word-detail"')
    expect(words).toContain('data-testid="word-hear"')
  })

  it('shows the mouth and the tongue together, played by Hear it or by picking a sound', () => {
    const words = html((view) => (
      <WordsDetail view={view} selected={1} onSelect={() => undefined} />
    ))
    expect(words).toContain('data-testid="articulation"')
    expect(words).toContain('data-testid="mouth"')
    expect(words).toContain('data-testid="tongue"')
    expect(words).not.toContain('mouth-play')
  })

  it('shows the sounds, mouth and tongue for a word said correctly too', () => {
    const words = html((view) => (
      <WordsDetail view={view} selected={2} onSelect={() => undefined} />
    ))
    expect(words).toContain('data-testid="word-detail"')
    expect(words).toContain('data-testid="word-hear"')
    expect(words).toContain('data-testid="tongue"')
    expect(words.match(/data-testid="word-phone"/g)).toHaveLength(4)
    expect(words).not.toContain('data-testid="word-heard"')
  })

  it('explains an empty pitch track instead of drawing a chart', () => {
    const quiet = { ...result, prosody: { f0: [], energy: [] } } as PronunciationResult
    expect(html(() => <PitchDetail result={quiet} />)).toContain('pitch-empty')
  })
})
