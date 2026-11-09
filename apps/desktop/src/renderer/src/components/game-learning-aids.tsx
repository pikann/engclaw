import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Play, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ClickableText } from '@/components/ui/clickable-text'
import { useSpeech } from '@/lib/use-speech'

function SpeechError({ error }: { error: 'modelMissing' | 'failed' | null }) {
  const { t } = useTranslation()
  if (!error) return null
  return (
    <p role="alert" className="text-destructive text-sm" data-testid="speech-error">
      {t(error === 'modelMissing' ? 'reference.modelMissing' : 'reference.failed')}
    </p>
  )
}

/**
 * "Hear it" for the target, plus a fixed-size slot for the later "Ask the
 * agent" action. The slot always takes the same space, so showing the action never moves the
 * rest of the chapter.
 */
export function TargetAudioActions({
  text,
  silenced = false,
  ask,
}: {
  text: string
  silenced?: boolean
  ask?: ReactNode
}) {
  const { t } = useTranslation()
  const { active, error, play, stop } = useSpeech()
  useEffect(() => {
    if (silenced) stop()
  }, [silenced, stop])
  const on = (key: string) => active?.key === key
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2" data-testid="target-actions">
        <Button
          variant="outline"
          size="sm"
          data-testid="hear-reference"
          disabled={silenced || !text.trim()}
          onClick={() => void play('hear', text)}
        >
          {on('hear') && active?.phase === 'loading' ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Volume2 />
          )}
          {t('reference.hear')}
        </Button>
        <div className="min-h-8" data-testid="ask-slot">
          {ask}
        </div>
      </div>
      <SpeechError error={error} />
    </div>
  )
}

/** The example sentences: clickable words plus a Kokoro play button each. */
export function ExamplesPanel({
  examples,
  silenced = false,
}: {
  examples: readonly string[]
  silenced?: boolean
}) {
  const { t } = useTranslation()
  const { active, error, play, stop } = useSpeech()
  useEffect(() => {
    if (silenced) stop()
  }, [silenced, stop])
  if (examples.length === 0) return null
  return (
    <section aria-labelledby="examples-title" className="space-y-2" data-testid="examples-panel">
      <h3
        id="examples-title"
        className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
      >
        {t('screens.game.examples')}
      </h3>
      <ul className="space-y-2">
        {examples.map((ex, i) => {
          const normal = active?.key === `ex-${i}`
          return (
            <li key={ex} className="flex items-start gap-2 text-sm" data-testid="example-row">
              <Button
                size="icon-sm"
                variant={normal ? 'default' : 'outline'}
                disabled={silenced}
                aria-label={t('screens.game.playExample', { n: i + 1 })}
                data-testid="example-play"
                onClick={() => void play(`ex-${i}`, ex)}
              >
                {normal && active?.phase === 'loading' ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Play />
                )}
              </Button>
              <span className="min-w-0 flex-1 pt-1">
                <ClickableText text={ex} />
              </span>
            </li>
          )
        })}
      </ul>
      <SpeechError error={error} />
    </section>
  )
}
