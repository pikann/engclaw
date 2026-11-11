import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { BookOpen, Check, Mic, Play, RotateCcw, Volume2, X } from 'lucide-react'
import type { PronunciationResult } from '@engclaw/ipc-contract'
import { Chart } from '@/components/detail-charts'
import { ArticulationView } from '@/components/articulation-view'
import { SoundButtons } from '@/components/sound-buttons'
import { ipaPhones } from '@/lib/articulation'
import { useWordArticulation } from '@/lib/use-word-articulation'
import { Button } from '@/components/ui/button'
import { useWordLookup } from '@/lib/word-lookup'
import { normalizeWord } from '@/lib/words'
import { ClickableText } from '@/components/ui/clickable-text'
import { ClickableWord } from '@/components/ui/clickable-word'
import { ScoreRing } from '@/components/ui/score-ring'
import { playChime } from '@/lib/audio'
import { detailSeries } from '@/lib/charts'
import {
  heardSounds,
  heardText,
  isWrongPhone,
  subScores,
  verdictOf,
  wordChips,
  type WordChip,
} from '@/lib/result'
import { cn } from '@/lib/utils'

/** The result's view model, derived once and shared by the summary and the detail tabs. */
export function useResultView(result: PronunciationResult, text: string) {
  return useMemo(() => {
    const chips = wordChips(result, text)
    return { text, chips, verdict: verdictOf(chips), scores: subScores(result) }
  }, [result, text])
}
export type ResultView = ReturnType<typeof useResultView>

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card min-w-0 rounded-lg border px-3 py-2" data-testid="result-tile">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

/** Score ring, sub-scores, words with ✓/✗ marks (never colour alone), feedback and actions. */
export function ResultSummary({
  result,
  view,
  selected,
  saved,
  onSelect,
  onTryAgain,
  onReplay,
  onSpeakFreely,
  onStartOver,
}: {
  result: PronunciationResult
  view: ResultView
  selected: number | null
  saved: boolean
  onSelect: (position: number) => void
  onTryAgain: () => void
  onReplay: () => void
  /** Read-aloud tab: one click to the free-speaking tab. */
  onSpeakFreely?: () => void
  /** Free tab: forget this take and text. */
  onStartOver?: () => void
}) {
  const { t } = useTranslation()
  useEffect(() => playChime(), [result])
  const { chips, verdict, scores } = view
  return (
    <div className="bg-card space-y-5 rounded-xl border border-input p-5" data-testid="result-card">
      <div className="flex flex-wrap items-center gap-4">
        <ScoreRing score={result.score} />
        <div className="grid min-w-0 grid-cols-3 gap-2">
          <Tile label={t('screens.practice.accuracy')} value={scores.accuracy} />
          <Tile label={t('screens.practice.fluency')} value={scores.fluency} />
          <Tile label={t('screens.practice.prosody')} value={scores.prosody} />
        </div>
      </div>
      <p className="text-muted-foreground text-sm" data-testid="result-verdict">
        {verdict.flagged === 0
          ? t('result.verdictAll', { total: verdict.total })
          : t('result.verdict', { flagged: verdict.flagged, total: verdict.total })}
      </p>
      <p className="text-2xl leading-loose" data-testid="result-chips">
        {chips.map((c) => (
          <span key={c.position} className="mr-2 inline-block">
            <ClickableWord
              data-testid="word-chip"
              data-flagged={!!c.error}
              aria-expanded={c.position === selected}
              title={
                c.error
                  ? t('result.chipTip', {
                      confidence: Math.round(c.error.confidence * 100),
                      expected: c.error.expected,
                      actual: c.error.actual || '∅',
                    })
                  : t('result.chipOk')
              }
              onClick={() => onSelect(c.position)}
              className={cn(
                c.error
                  ? 'bg-destructive-soft text-destructive-soft-foreground decoration-destructive'
                  : 'text-success-soft-foreground',
              )}
            >
              {c.word}
            </ClickableWord>
            {c.error ? (
              <X
                className="text-destructive ml-0.5 inline size-4"
                aria-label={t('screens.practice.needsWork')}
              />
            ) : (
              <Check
                className="text-success ml-0.5 inline size-4"
                aria-label={t('result.chipOk')}
              />
            )}
          </span>
        ))}
      </p>
      <p className="bg-info-soft text-info-soft-foreground rounded-md p-3 text-sm">
        {t(`pronounce.feedback.${result.feedback.code}`, {
          words: result.feedback.words.join(', '),
        })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" data-testid="result-try-again" onClick={onTryAgain}>
          <RotateCcw />
          {t('practice.retry')}
        </Button>
        <Button size="sm" variant="outline" data-testid="result-replay" onClick={onReplay}>
          <Play />
          {t('screens.practice.playTake')}
        </Button>
        {onStartOver && (
          <Button size="sm" variant="ghost" data-testid="result-start-over" onClick={onStartOver}>
            {t('screens.practice.startOver')}
          </Button>
        )}
        {onSpeakFreely && (
          <Button
            size="sm"
            variant="outline"
            data-testid="result-speak-freely"
            onClick={onSpeakFreely}
          >
            <Mic />
            {t('screens.practice.speakFreely')}
          </Button>
        )}
      </div>
      {saved && (
        <p
          role="status"
          className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm"
          data-testid="result-saved"
        >
          {t('screens.practice.savedNote')}
          <Link to="/history" className="text-primary underline underline-offset-4">
            {t('screens.practice.viewHistory')}
          </Link>
        </p>
      )}
    </div>
  )
}

function WordDetail({ chip, text }: { chip: WordChip; text: string }) {
  const { t } = useTranslation()
  const e = chip.error
  const lookup = useWordLookup()
  const sounds = useMemo(
    () =>
      e?.phones.length
        ? e.phones.map((p) => p.expected)
        : chip.expected.length
          ? chip.expected
          : ipaPhones(e?.expected ?? ''),
    [chip, e],
  )
  const art = useWordArticulation(chip.word, sounds)
  return (
    <div className="space-y-2 rounded-md border p-3" data-testid="word-detail">
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold">{chip.word}</span>
        <Button
          variant="outline"
          size="sm"
          data-testid="word-hear"
          disabled={art.loading}
          onClick={() => void art.hear()}
        >
          <Volume2 />
          {art.loading ? t('reference.loading') : t('result.hearIt')}
        </Button>
        {lookup && (
          <Button
            variant="outline"
            size="sm"
            data-testid="word-lookup"
            onClick={() => lookup(normalizeWord(chip.word), text)}
          >
            <BookOpen />
            {t('dict.lookup')}
          </Button>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t('result.expected')}</dt>
        <dd className="font-mono" data-testid="word-expected" lang="en-fonipa">
          <SoundButtons
            sounds={sounds}
            selected={art.selected}
            onPick={art.pick}
            wrong={(i) => isWrongPhone(e?.phones[i]?.confidence ?? 0)}
          />
        </dd>
        {e && (
          <>
            <dt className="text-muted-foreground">{t('result.heard')}</dt>
            <dd className="font-mono" data-testid="word-heard">
              {e.phones.length
                ? e.phones.map((p, i) => (
                    <span
                      key={i}
                      className={cn(
                        isWrongPhone(p.confidence) && 'decoration-score-low underline decoration-2',
                      )}
                    >
                      {p.heard || '∅'}
                    </span>
                  ))
                : e.actual || '∅'}
            </dd>
          </>
        )}
      </dl>
      {e?.actual_word && (
        <p className="text-muted-foreground text-sm" data-testid="word-actual">
          {t('result.understood', { word: e.actual_word })}
        </p>
      )}
      {sounds.length > 0 && <ArticulationView {...art.view} />}
    </div>
  )
}

/** Phonemes tab: the sentence's sounds with the wrong ones underlined, what we heard, the trace. */
export function PhonemesDetail({
  result,
  view,
}: {
  result: PronunciationResult
  view: ResultView
}) {
  const { t } = useTranslation()
  const series = useMemo(() => detailSeries(result), [result])
  const sounds = useMemo(() => heardSounds(result), [result])
  const heard = heardText(result)
  const { expected_phones } = result.differences
  return (
    <div className="space-y-4">
      <section>
        <h4 className="text-muted-foreground text-xs font-medium uppercase">
          {t('result.expected')}
        </h4>
        <p className="font-mono text-xl" lang="en-fonipa" data-testid="result-expected-sounds">
          {view.chips.map((c) => (
            <span key={c.position} className="mr-3 inline-block">
              {c.error?.phones.length
                ? c.error.phones.map((p, i) => (
                    <span
                      key={i}
                      className={cn(
                        isWrongPhone(p.confidence) &&
                          'decoration-score-low underline decoration-2 underline-offset-4',
                      )}
                    >
                      {p.expected}
                    </span>
                  ))
                : (expected_phones[c.position] ?? []).join('')}
            </span>
          ))}
        </p>
      </section>
      {heard && (
        <section>
          <h4 className="text-muted-foreground text-xs font-medium uppercase">
            {t('result.weHeard')}
          </h4>
          <p data-testid="result-heard-text">
            <ClickableText text={heard} />
          </p>
        </section>
      )}
      {sounds.length > 0 && (
        <section>
          <h4 className="text-muted-foreground text-xs font-medium uppercase">
            {t('result.yourSounds')}
          </h4>
          <p className="font-mono" data-testid="result-sounds">
            {sounds.map((s, i) => (
              <span
                key={i}
                data-confident={s.confident}
                className={s.confident ? '' : 'opacity-40'}
              >
                {s.phone}{' '}
              </span>
            ))}
          </p>
        </section>
      )}
      <Chart
        testId="chart-phoneme"
        title={t('result.chartPhoneme')}
        lines={[
          {
            label: t('result.chartReference'),
            values: series.phoneme.reference,
            className: 'stroke-muted-foreground',
          },
          { label: t('result.chartYou'), values: series.phoneme.you, className: 'stroke-primary' },
        ]}
      />
    </div>
  )
}

/** Pitch tab: F0 and energy, or the "No pitch to show" advice when nothing could be tracked. */
export function PitchDetail({ result }: { result: PronunciationResult }) {
  const { t } = useTranslation()
  const series = useMemo(() => detailSeries(result), [result])
  if (series.f0.length < 2 || series.f0.every((v) => !v))
    return (
      <div
        className="bg-muted/40 space-y-1 rounded-md border border-dashed p-4 text-sm"
        data-testid="pitch-empty"
      >
        <p className="font-medium">{t('screens.practice.pitchEmptyTitle')}</p>
        <p className="text-muted-foreground">{t('screens.practice.pitchEmptyBody')}</p>
      </div>
    )
  return (
    <div className="space-y-4">
      <Chart
        testId="chart-f0"
        title={t('result.chartF0')}
        lines={[{ label: 'F0', values: series.f0, className: 'stroke-primary' }]}
      />
      <Chart
        testId="chart-energy"
        title={t('result.chartEnergy')}
        lines={[{ label: 'Energy', values: series.energy, className: 'stroke-primary' }]}
      />
    </div>
  )
}

/** Words tab: every word with its mark, and the sound-by-sound detail of the selected one. */
export function WordsDetail({
  view,
  selected,
  onSelect,
}: {
  view: ResultView
  selected: number | null
  onSelect: (position: number) => void
}) {
  const { t } = useTranslation()
  const current = view.chips.find((c) => c.position === selected)
  return (
    <div className="space-y-3">
      {current ? (
        <WordDetail chip={current} text={view.text} />
      ) : (
        view.verdict.flagged > 0 && (
          <p className="text-muted-foreground text-sm">{t('screens.practice.pickWord')}</p>
        )
      )}
      <ul className="space-y-1 text-sm">
        {view.chips.map((c) => (
          <li key={c.position}>
            <button
              type="button"
              aria-pressed={c.position === selected}
              onClick={() => onSelect(c.position)}
              className={cn(
                'focus-visible:ring-ring/50 flex w-full items-center justify-between rounded-md border px-3 py-1.5 text-left focus-visible:ring-[3px] focus-visible:outline-none',
                c.position === selected && 'bg-primary-soft',
              )}
            >
              <span>{c.word}</span>
              <span
                className={cn(
                  'flex items-center gap-1',
                  c.error ? 'text-destructive-soft-foreground' : 'text-success-soft-foreground',
                )}
              >
                {c.error ? <X className="size-4" /> : <Check className="size-4" />}
                {c.error ? t('screens.practice.needsWork') : t('result.chipOk')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
