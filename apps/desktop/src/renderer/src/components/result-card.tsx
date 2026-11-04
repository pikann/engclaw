import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, RotateCcw, Volume2 } from 'lucide-react'
import type { PronunciationResult } from '@engclaw/ipc-contract'
import { Button } from '@/components/ui/button'
import { playChime } from '@/lib/audio'
import {
  countUp,
  firstFlagged,
  heardSounds,
  heardText,
  isWrongPhone,
  scoreTone,
  verdictOf,
  wordChips,
  type WordChip,
} from '@/lib/result'

const RADIUS = 52
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const TONE = { good: 'stroke-green-500', ok: 'stroke-amber-500', poor: 'stroke-red-500' } as const

function ScoreRing({ score }: { score: number }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const start = performance.now()
    let raf = 0
    const tick = (now: number): void => {
      const v = countUp(score, now - start)
      setShown(v)
      if (v < Math.min(100, score)) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [score])
  return (
    <div className="relative size-32 shrink-0" data-testid="result-ring">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={RADIUS} fill="none" strokeWidth="10" className="stroke-muted" />
        <circle
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          className={TONE[scoreTone(score)]}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - shown / 100)}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-3xl font-semibold"
        data-testid="result-score"
        data-score={Math.round(score)}
      >
        {Math.round(shown)}
      </span>
    </div>
  )
}

function speak(word: string): void {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(word)
  u.lang = 'en-US'
  window.speechSynthesis.speak(u)
}

function WordDetail({ chip }: { chip: WordChip }) {
  const { t } = useTranslation()
  const e = chip.error
  if (!e) return null
  return (
    <div className="space-y-2 rounded-md border p-3" data-testid="word-detail">
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold">{chip.word}</span>
        <Button
          variant="outline"
          size="sm"
          data-testid="word-hear"
          disabled={!('speechSynthesis' in window)}
          onClick={() => speak(chip.word)}
        >
          <Volume2 />
          {t('result.hearIt')}
        </Button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t('result.expected')}</dt>
        <dd className="font-mono" data-testid="word-expected">
          {e.phones.length
            ? e.phones.map((p, i) => (
                <span
                  key={i}
                  data-wrong={isWrongPhone(p.confidence)}
                  className={
                    isWrongPhone(p.confidence) ? 'underline decoration-red-500 decoration-2' : ''
                  }
                >
                  {p.expected}
                </span>
              ))
            : e.expected}
        </dd>
        <dt className="text-muted-foreground">{t('result.heard')}</dt>
        <dd className="font-mono" data-testid="word-heard">
          {e.phones.length
            ? e.phones.map((p, i) => (
                <span
                  key={i}
                  className={
                    isWrongPhone(p.confidence) ? 'underline decoration-red-500 decoration-2' : ''
                  }
                >
                  {p.heard || '∅'}
                </span>
              ))
            : e.actual || '∅'}
        </dd>
      </dl>
      {e.actual_word && (
        <p className="text-muted-foreground text-sm" data-testid="word-actual">
          {t('result.understood', { word: e.actual_word })}
        </p>
      )}
    </div>
  )
}

/** OpenPronounce-style result card: ring, verdict, word chips, word detail, transcript, sounds. */
export function ResultCard({
  result,
  text,
  onTryAgain,
  onReplay,
}: {
  result: PronunciationResult
  text: string
  onTryAgain: () => void
  onReplay: () => void
}) {
  const { t } = useTranslation()
  const chips = useMemo(() => wordChips(result, text), [result, text])
  const verdict = verdictOf(chips)
  const sounds = useMemo(() => heardSounds(result), [result])
  const [selected, setSelected] = useState<number | null>(() => firstFlagged(chips))
  useEffect(() => setSelected(firstFlagged(chips)), [chips])
  useEffect(() => playChime(), [result])
  const heard = heardText(result)
  const current = chips.find((c) => c.position === selected && c.error)

  return (
    <div className="space-y-4 rounded-md border p-4" data-testid="result-card">
      <div className="flex items-center gap-4">
        <ScoreRing score={result.score} />
        <div className="space-y-1">
          <p className="text-sm">
            {t(`pronounce.feedback.${result.feedback.code}`, {
              words: result.feedback.words.join(', '),
            })}
          </p>
          <p className="text-muted-foreground text-sm" data-testid="result-verdict">
            {verdict.flagged === 0
              ? t('result.verdictAll', { total: verdict.total })
              : t('result.verdict', { flagged: verdict.flagged, total: verdict.total })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" data-testid="result-chips">
        {chips.map((c) => (
          <button
            key={c.position}
            type="button"
            data-testid="word-chip"
            data-flagged={!!c.error}
            aria-pressed={c.position === selected}
            title={
              c.error
                ? t('result.chipTip', {
                    confidence: Math.round(c.error.confidence * 100),
                    expected: c.error.expected,
                    actual: c.error.actual || '∅',
                  })
                : t('result.chipOk')
            }
            onClick={() => setSelected(c.position)}
            className={`rounded-full border px-3 py-1 text-sm ${
              c.error
                ? 'border-red-300 bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200'
                : 'border-green-300 bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200'
            } ${c.position === selected ? 'ring-2 ring-offset-1' : ''}`}
          >
            {c.word}
          </button>
        ))}
      </div>

      {current && <WordDetail chip={current} />}

      {heard && (
        <section>
          <h3 className="text-muted-foreground text-xs font-medium uppercase">
            {t('result.weHeard')}
          </h3>
          <p data-testid="result-heard-text">{heard}</p>
        </section>
      )}

      {sounds.length > 0 && (
        <section>
          <h3 className="text-muted-foreground text-xs font-medium uppercase">
            {t('result.yourSounds')}
          </h3>
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

      <div className="flex flex-wrap gap-2">
        <Button size="sm" data-testid="result-try-again" onClick={onTryAgain}>
          <RotateCcw />
          {t('practice.retry')}
        </Button>
        <Button variant="outline" size="sm" data-testid="result-replay" onClick={onReplay}>
          <Play />
          {t('result.replay')}
        </Button>
      </div>
    </div>
  )
}
