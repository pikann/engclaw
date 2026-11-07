import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Upload } from 'lucide-react'
import type {
  DeckGrade,
  DeckSession,
  DeckStats,
  DictionaryWord,
  LearningFileResult,
} from '@engclaw/ipc-contract'
import { HearReference } from '@/components/hear-reference'
import { Pane, useLayout } from '@/components/screens/shell'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  GRADE_KEYS,
  heatLevel,
  nextQuestion,
  percent,
  pickAnswer,
  quizDone,
  startQuiz,
  type QuizState,
} from '@/lib/deck'
import { formatIpa, groupSenses } from '@/lib/dictionary'
import { cn } from '@/lib/utils'

const GRADES: DeckGrade[] = ['again', 'hard', 'good', 'easy']
const HEAT = ['bg-muted', 'bg-primary/25', 'bg-primary/50', 'bg-primary/75', 'bg-primary']

type Load<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error' }

function CardBack({ entry }: { entry: DictionaryWord }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3 text-left" data-testid="flashcard-back">
      {groupSenses(entry.senses).map((g) => (
        <div key={g.pos} className="space-y-1">
          <p className="text-muted-foreground text-xs font-medium">
            {t(`dict.pos.${g.pos}`, { defaultValue: g.pos })}
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {g.senses.slice(0, 3).map((s, i) => (
              <li key={i}>
                {s.definition}
                {s.example && (
                  <span className="text-muted-foreground block italic">“{s.example}”</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
      {entry.morphemes.length > 0 && (
        <div>
          <p className="text-muted-foreground mb-1 text-xs font-medium">{t('dict.deck.parts')}</p>
          <ul className="flex flex-wrap gap-2 text-sm">
            {entry.morphemes.map((m, i) => (
              <li key={`${i}-${m.form}`} className="rounded-md border px-2 py-1">
                <span className="font-semibold">{m.form}</span>
                <span className="text-muted-foreground"> · {m.root.meaning}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ReviewPane({
  drillRootId,
  onDrillExit,
  onChanged,
}: {
  drillRootId: number | null
  onDrillExit: () => void
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [session, setSession] = useState<Load<DeckSession>>({ status: 'loading' })
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    try {
      const next = await window.engclaw.deck.next(
        drillRootId === null ? undefined : { rootId: drillRootId },
      )
      setSession({ status: 'ready', value: next })
      setRevealed(false)
    } catch {
      setSession({ status: 'error' })
    }
  }, [drillRootId])

  useEffect(() => {
    setSession({ status: 'loading' })
    void load()
  }, [load])

  const grade = useCallback(
    async (g: DeckGrade): Promise<void> => {
      if (session.status !== 'ready' || !session.value || busy) return
      setBusy(true)
      try {
        await window.engclaw.deck.review({ word: session.value.card.word, grade: g })
        onChanged()
        await load()
      } catch {
        setSession({ status: 'error' })
      } finally {
        setBusy(false)
      }
    },
    [session, busy, load, onChanged],
  )

  const current = session.status === 'ready' ? session.value : null
  useEffect(() => {
    if (!current) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (e.key === ' ' && !revealed) {
        e.preventDefault()
        setRevealed(true)
      } else if (revealed && GRADE_KEYS[e.key]) void grade(GRADE_KEYS[e.key]!)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, revealed, grade])

  return (
    <div className="space-y-4 p-4" data-testid="flashcards-review">
      {drillRootId !== null && (
        <div className="bg-primary-soft flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm">
          <span>{t('dict.deck.drilling')}</span>
          <Button size="xs" variant="outline" data-testid="drill-exit" onClick={onDrillExit}>
            {t('dict.deck.drillExit')}
          </Button>
        </div>
      )}
      {session.status === 'loading' && (
        <p role="status" className="text-muted-foreground text-sm">
          {t('dict.loading')}
        </p>
      )}
      {session.status === 'error' && (
        <p role="alert" className="text-destructive text-sm">
          {t('dict.deck.failed')}
        </p>
      )}
      {session.status === 'ready' && !session.value && (
        <div className="space-y-1 py-8 text-center" data-testid="flashcards-empty">
          <h3 className="text-lg font-semibold">{t('dict.deck.doneTitle')}</h3>
          <p className="text-muted-foreground text-sm">{t('dict.deck.doneBody')}</p>
        </div>
      )}
      {current && (
        <article
          aria-label={t('dict.deck.card')}
          className="space-y-4 rounded-xl border p-6"
          data-testid="flashcard"
        >
          <p className="text-muted-foreground text-xs" data-testid="flashcard-remaining">
            {t('dict.deck.dueCount', { count: current.remaining.due })} ·{' '}
            {t('dict.deck.newCount', { count: current.remaining.new })}
          </p>
          <div className="flex flex-col items-center gap-2 text-center">
            <h2
              lang="en"
              className="text-3xl font-semibold break-words"
              data-testid="flashcard-word"
            >
              {current.card.word}
            </h2>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {current.entry.pronunciations.slice(0, 1).map((ipa) => (
                <span key={ipa} lang="en-fonipa" aria-label={t('dict.ipa')}>
                  {formatIpa(ipa)}
                </span>
              ))}
              <HearReference text={current.card.word} variant="ghost" />
            </div>
          </div>
          {revealed ? (
            <>
              <CardBack entry={current.entry} />
              <div
                role="group"
                aria-label={t('dict.deck.title')}
                className="grid grid-cols-4 gap-2"
                data-testid="grade-buttons"
              >
                {GRADES.map((g, i) => (
                  <Button
                    key={g}
                    variant={g === 'good' ? 'default' : 'outline'}
                    disabled={busy}
                    data-testid={`grade-${g}`}
                    onClick={() => void grade(g)}
                  >
                    {t(`dict.deck.grade.${g}`)}
                    <kbd className="text-muted-foreground ml-1 text-xs">{i + 1}</kbd>
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-1 text-center">
              <Button data-testid="flashcard-show" onClick={() => setRevealed(true)}>
                {t('dict.deck.show')}
              </Button>
              <p className="text-muted-foreground text-xs">{t('dict.deck.showHint')}</p>
            </div>
          )}
        </article>
      )}
    </div>
  )
}

function QuizPane({ onAnswered }: { onAnswered: () => void }) {
  const { t } = useTranslation()
  const [state, setState] = useState<Load<QuizState>>({ status: 'loading' })

  const load = useCallback(async (): Promise<void> => {
    setState({ status: 'loading' })
    try {
      setState({ status: 'ready', value: startQuiz(await window.engclaw.deck.quiz()) })
    } catch {
      setState({ status: 'error' })
    }
  }, [])
  useEffect(() => void load(), [load])

  if (state.status === 'loading')
    return (
      <p role="status" className="text-muted-foreground p-4 text-sm">
        {t('dict.loading')}
      </p>
    )
  if (state.status === 'error')
    return (
      <p role="alert" className="text-destructive p-4 text-sm">
        {t('dict.deck.failed')}
      </p>
    )
  const quiz = state.value
  if (quiz.questions.length === 0)
    return (
      <p className="text-muted-foreground p-4 text-sm" data-testid="quiz-empty">
        {t('dict.deck.quizUi.empty')}
      </p>
    )
  if (quizDone(quiz))
    return (
      <div className="space-y-3 p-4 text-center" data-testid="quiz-result">
        <p className="text-lg font-semibold">
          {t('dict.deck.quizUi.score', { score: quiz.score, total: quiz.questions.length })}
        </p>
        <Button onClick={() => void load()}>{t('dict.deck.quizUi.again')}</Button>
      </div>
    )

  const q = quiz.questions[quiz.index]!
  const answered = quiz.picked !== null
  const choose = (i: number): void => {
    if (answered) return
    setState({ status: 'ready', value: pickAnswer(quiz, i) })
    void window.engclaw.deck
      .quizAnswer({ word: q.word, correct: i === q.answer })
      .then(onAnswered, () => undefined)
  }
  const last = quiz.index === quiz.questions.length - 1

  return (
    <div className="space-y-4 p-4" data-testid="quiz">
      <p className="text-muted-foreground text-xs">
        {t('dict.deck.quizUi.progress', { n: quiz.index + 1, total: quiz.questions.length })} ·{' '}
        {t('dict.deck.quizUi.hint')}
      </p>
      <h2 className="text-xl font-semibold" lang="en">
        {t('dict.deck.quizUi.prompt', { word: q.word })}
        {q.ipa && (
          <span lang="en-fonipa" className="text-muted-foreground ml-2 text-base font-normal">
            {formatIpa(q.ipa)}
          </span>
        )}
      </h2>
      <ul className="space-y-2" data-testid="quiz-options">
        {q.options.map((option, i) => (
          <li key={i}>
            <button
              type="button"
              disabled={answered}
              aria-pressed={quiz.picked === i}
              data-testid="quiz-option"
              data-correct={answered ? String(i === q.answer) : undefined}
              onClick={() => choose(i)}
              className={cn(
                'focus-visible:ring-ring/50 w-full rounded-lg border px-3 py-2 text-left text-sm focus-visible:ring-[3px] focus-visible:outline-none',
                !answered && 'hover:bg-primary-soft',
                answered && i === q.answer && 'border-success bg-success-soft',
                answered && quiz.picked === i && i !== q.answer && 'border-destructive',
              )}
            >
              {option}
            </button>
          </li>
        ))}
      </ul>
      {answered && (
        <div className="flex items-center justify-between gap-2">
          <p role="status" className="text-sm">
            {quiz.picked === q.answer ? t('dict.deck.quizUi.correct') : t('dict.deck.quizUi.wrong')}
          </p>
          <Button
            data-testid="quiz-next"
            onClick={() => setState({ status: 'ready', value: nextQuestion(quiz) })}
          >
            {last ? t('dict.deck.quizUi.finish') : t('dict.deck.quizUi.next')}
          </Button>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, id }: { label: string; value: string | number; id: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums" data-testid={`stat-${id}`}>
        {value}
      </dd>
    </div>
  )
}

function StatsPane({ stats, onImported }: { stats: Load<DeckStats>; onImported: () => void }) {
  const { t } = useTranslation()
  const [notice, setNotice] = useState<string | null>(null)

  const report = (res: LearningFileResult): void => {
    if (res.status === 'exported') setNotice(t('dict.deck.file.exported', { count: res.count }))
    else if (res.status === 'imported') {
      setNotice(t('dict.deck.file.imported', res))
      onImported()
    } else if (res.status === 'error')
      setNotice(t('dict.deck.file.error', { message: res.message }))
  }

  if (stats.status !== 'ready')
    return (
      <p
        className="text-muted-foreground p-4 text-sm"
        role={stats.status === 'error' ? 'alert' : 'status'}
      >
        {stats.status === 'error' ? t('dict.deck.failed') : t('dict.loading')}
      </p>
    )
  const s = stats.value
  const max = Math.max(0, ...s.heatmap.map((d) => d.count))
  const none = t('dict.deck.stats.none')
  return (
    <div className="space-y-5 p-4" data-testid="deck-stats">
      <dl className="grid grid-cols-2 gap-2">
        <Stat id="total" label={t('dict.deck.stats.total')} value={s.total} />
        <Stat id="due" label={t('dict.deck.stats.dueToday')} value={s.dueToday} />
        <Stat id="new" label={t('dict.deck.stats.new')} value={s.newCards} />
        <Stat id="learning" label={t('dict.deck.stats.learning')} value={s.learning} />
        <Stat id="mature" label={t('dict.deck.stats.mature')} value={s.mature} />
        <Stat id="streak" label={t('dict.deck.stats.streak')} value={s.streak} />
        <Stat
          id="retention"
          label={t('dict.deck.stats.retention')}
          value={percent(s.retention) || none}
        />
        <Stat
          id="quiz"
          label={t('dict.deck.stats.quizAccuracy')}
          value={percent(s.quizAccuracy) || none}
        />
      </dl>

      <section aria-labelledby="deck-heatmap" className="space-y-1.5">
        <h4 id="deck-heatmap" className="text-xs font-medium">
          {t('dict.deck.stats.heatmap')}
        </h4>
        <ul className="grid grid-cols-10 gap-1" data-testid="deck-heatmap">
          {s.heatmap.map((d) => (
            <li
              key={d.day}
              title={t('dict.deck.stats.heatmapDay', { count: d.count })}
              data-count={d.count}
              className={cn('aspect-square rounded-sm', HEAT[heatLevel(d.count, max)])}
            />
          ))}
        </ul>
      </section>

      {s.roots.length > 0 && (
        <section aria-labelledby="deck-roots" className="space-y-2">
          <h4 id="deck-roots" className="text-xs font-medium">
            {t('dict.deck.stats.roots')}
          </h4>
          <ul className="space-y-2" data-testid="deck-root-mastery">
            {s.roots.slice(0, 12).map((r) => (
              <li key={r.rootId} className="space-y-1 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium break-words">{r.root}</span>
                  <span className="text-muted-foreground text-xs">
                    {t('dict.deck.stats.rootMastery', { mature: r.mature, total: r.total })}
                  </span>
                </div>
                <Progress
                  value={(r.mature / r.total) * 100}
                  aria-label={`${r.root}: ${r.meaning}`}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="space-y-1.5">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            data-testid="deck-export"
            disabled={s.total === 0}
            onClick={async () => report(await window.engclaw.deck.export())}
          >
            <Download />
            {t('dict.deck.file.export')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            data-testid="deck-import"
            onClick={async () => report(await window.engclaw.deck.import())}
          >
            <Upload />
            {t('dict.deck.file.import')}
          </Button>
        </div>
        {notice && (
          <p role="status" className="text-muted-foreground text-xs" data-testid="deck-file-notice">
            {notice}
          </p>
        )}
      </div>
    </div>
  )
}

/** Flashcards tab (IA §5): SM-2 review or word quiz in the centre, progress on the right. */
export function Flashcards({
  drillRootId,
  onDrillExit,
}: {
  drillRootId: number | null
  onDrillExit: () => void
}) {
  const { t } = useTranslation()
  const layout = useLayout()
  const [stats, setStats] = useState<Load<DeckStats>>({ status: 'loading' })
  const [version, setVersion] = useState(0)

  const refresh = useCallback(() => setVersion((v) => v + 1), [])
  useEffect(() => {
    let live = true
    window.engclaw.deck.stats().then(
      (value) => live && setStats({ status: 'ready', value }),
      () => live && setStats({ status: 'error' }),
    )
    return () => {
      live = false
    }
  }, [version])

  const empty = stats.status === 'ready' && stats.value.total === 0

  return (
    <div
      className={cn(
        'grid h-full divide-x',
        layout === 'compact' ? 'grid-cols-[1fr_260px]' : 'grid-cols-[1fr_320px]',
      )}
      data-testid="flashcards"
    >
      <Pane title={t('dict.deck.title')}>
        {empty ? (
          <p className="text-muted-foreground p-4 text-sm" data-testid="deck-empty">
            {t('dict.deck.empty')}
          </p>
        ) : (
          <Tabs defaultValue="review" className="gap-0">
            <TabsList className="mx-4">
              <TabsTrigger value="review">{t('dict.deck.review')}</TabsTrigger>
              <TabsTrigger value="quiz" data-testid="deck-tab-quiz">
                {t('dict.deck.quiz')}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="review">
              <ReviewPane drillRootId={drillRootId} onDrillExit={onDrillExit} onChanged={refresh} />
            </TabsContent>
            <TabsContent value="quiz">
              <QuizPane onAnswered={refresh} />
            </TabsContent>
          </Tabs>
        )}
      </Pane>
      <Pane title={t('dict.deck.stats.title')}>
        <StatsPane stats={stats} onImported={refresh} />
      </Pane>
    </div>
  )
}
