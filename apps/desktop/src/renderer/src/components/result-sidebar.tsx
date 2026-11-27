import { MandarinResult } from '@/components/mandarin-result'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { PronunciationResult } from '@engclaw/ipc-contract'
import {
  PhonemesDetail,
  PitchDetail,
  ResultSummary,
  useResultView,
  WordsDetail,
  type WordPlayback,
} from '@/components/practice-result'
import { firstFlagged } from '@/lib/result'
import { cn } from '@/lib/utils'

export function ResultSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-card space-y-3 rounded-xl border border-input p-4">
      <h3 className="text-base font-semibold">{title}</h3>
      {children}
    </section>
  )
}

/** Right-hand sidebar with its own scroll area; `header` (tabs, title) stays pinned above it. */
export function ResultSidebar({
  label,
  header,
  children,
  className,
  testId,
}: {
  label: string
  header?: ReactNode
  children: ReactNode
  className?: string
  testId?: string
}) {
  return (
    <aside
      aria-label={label}
      data-testid={testId}
      className={cn('flex min-h-0 min-w-0 flex-col border-l', className)}
    >
      {header}
      {children}
    </aside>
  )
}

export function ResultSidebarBody({ children, hidden }: { children: ReactNode; hidden?: boolean }) {
  return (
    <div hidden={hidden} className="min-h-0 flex-1 overflow-auto px-4 pb-4">
      {children}
    </div>
  )
}

/** The full pronunciation result: summary card, then words, phonemes and pitch sections. */
export function PronunciationResultSections({
  result,
  text,
  onPlay,
  onRetry,
  replaying,
  wordPlayback,
  afterSummary,
  beforePitch,
  testId,
}: {
  result: PronunciationResult
  text: string
  onPlay: () => void
  onRetry: () => void
  replaying?: boolean
  wordPlayback?: WordPlayback
  afterSummary?: ReactNode
  beforePitch?: ReactNode
  testId?: string
}) {
  const { t } = useTranslation()
  const view = useResultView(result, text)
  const wordDetail = useRef<HTMLDivElement>(null)
  const clarity = !!wordPlayback
  const firstWord = () => {
    const unclear = clarity ? view.recognition.findIndex((word) => !word.matched) : -1
    return unclear >= 0 ? unclear : firstFlagged(view.chips)
  }
  const [selected, setSelected] = useState<number | null>(firstWord)
  useEffect(() => {
    setSelected(firstWord())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when a new result arrives
  }, [result])
  const selectWord = (position: number) => {
    if (wordPlayback?.position != null && wordPlayback.position !== position) wordPlayback.stop()
    setSelected(position)
  }
  if (result.assessment)
    return (
      <div data-testid={testId}>
        <MandarinResult result={result} text={text} onReplay={onPlay} onRetry={onRetry} />
        {beforePitch}
      </div>
    )
  const soundAnalysis = (
    <>
      <ResultSection title={t('screens.practice.tabPhonemes')}>
        <PhonemesDetail
          result={result}
          view={view}
          onReplay={onPlay}
          replaying={replaying}
          recording={wordPlayback?.practice?.recording}
        />
      </ResultSection>
      {beforePitch}
      <ResultSection title={t('screens.practice.tabPitch')}>
        <PitchDetail result={result} />
      </ResultSection>
    </>
  )
  return (
    <div className="space-y-4" data-testid={testId}>
      <ResultSummary
        result={result}
        view={view}
        selected={selected}
        saved={false}
        onSelect={(position) => {
          selectWord(position)
          if (wordPlayback) wordDetail.current?.scrollIntoView({ block: 'nearest' })
        }}
        onTryAgain={onRetry}
        onReplay={onPlay}
        clarity={clarity}
        technicalDetails={
          clarity ? (
            <>
              {afterSummary}
              {soundAnalysis}
            </>
          ) : undefined
        }
      />
      {!clarity && afterSummary}
      <div ref={wordDetail}>
        <ResultSection title={t('screens.practice.tabWords')}>
          <WordsDetail
            view={view}
            selected={selected}
            onSelect={selectWord}
            wordPlayback={wordPlayback}
            clarity={clarity}
          />
        </ResultSection>
      </div>
      {!clarity && soundAnalysis}
    </div>
  )
}
