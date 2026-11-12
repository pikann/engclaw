import { useTranslation } from 'react-i18next'
import type { PronunciationResult } from '@engclaw/ipc-contract'
import { Button } from '@/components/ui/button'
import { ScoreRing } from '@/components/ui/score-ring'
import { HearReference } from '@/components/hear-reference'

/** ASR character recognition is useful practice feedback, without pretending to measure tones. */
export function MandarinResult({
  result,
  text,
  onReplay,
  onRetry,
}: {
  result: PronunciationResult
  text: string
  onReplay: () => void
  onRetry: () => void
}) {
  const { t } = useTranslation()
  return (
    <section className="bg-card space-y-4 rounded-xl border p-5" data-testid="mandarin-result">
      <div className="flex items-center gap-4">
        <ScoreRing score={result.score} />
        <h2 className="font-semibold">{t('learning.characterAccuracy')}</h2>
      </div>
      <p className="text-muted-foreground text-sm">{t('learning.assessmentNote')}</p>
      <div>
        <h3 className="text-sm font-medium">{t('learning.reference')}</h3>
        <p lang="zh-CN" className="text-2xl leading-loose">
          {text}
        </p>
      </div>
      <div>
        <h3 className="text-sm font-medium">{t('learning.heard')}</h3>
        <p lang="zh-CN" className="text-2xl leading-loose">
          {result.transcribe || '…'}
        </p>
      </div>
      {result.differences.errors.length > 0 && (
        <ul className="space-y-1 text-sm" aria-label={t('learning.mismatches')}>
          {result.differences.errors.map((error, index) => (
            <li key={index} lang="zh-CN">
              {error.expected || '∅'} → {error.actual || '∅'}
            </li>
          ))}
        </ul>
      )}
      <HearReference text={text} />
      <div className="flex gap-2">
        <Button onClick={onRetry}>{t('practice.retry')}</Button>
        <Button variant="outline" onClick={onReplay}>
          {t('screens.practice.playTake')}
        </Button>
      </div>
    </section>
  )
}
