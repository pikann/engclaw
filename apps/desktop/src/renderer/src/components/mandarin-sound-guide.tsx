import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArticulationView } from '@/components/articulation-view'
import { HearReference } from '@/components/hear-reference'
import { usePronunciationGuide } from '@/lib/learning-language'
import { Button } from '@/components/ui/button'
import type { MandarinFinal } from '@/lib/mandarin-final'
import type { MandarinInitial } from '@/lib/mandarin-initial'
import { vietnameseFinals } from '@/lib/mandarin-pronunciation'

export function MandarinSoundGuide({
  item,
  disabled,
}: {
  item: MandarinInitial | MandarinFinal
  disabled: boolean
}) {
  const { t } = useTranslation()
  const { language, t: guideT } = usePronunciationGuide()
  const [playId, setPlayId] = useState(0)
  const replay = () => setPlayId((id) => id + 1)
  const final = 'final' in item

  return (
    <section
      className="space-y-3"
      data-testid={final ? 'mandarin-final-guide' : 'mandarin-initial-guide'}
    >
      <h3 className="text-lg font-semibold">
        {final
          ? t('mandarinGuide.finalTitle', { final: item.spelling })
          : t('mandarinGuide.initialTitle', { initial: item.initial })}
      </h3>
      <div className="space-y-2 text-sm" lang={language}>
        {final && language === 'vi' && (
          <p>
            <strong>{guideT('pronunciation.approximation')}</strong> · “
            {vietnameseFinals[item.final]}”
          </p>
        )}
        <p>
          {guideT(
            final ? `pronunciation.finals.${item.final}` : `pronunciation.initials.${item.initial}`,
          )}
        </p>
        {!final && item.initial === 'j' && (
          <ol className="list-decimal space-y-1 pl-5">
            {[0, 1, 2].map((step) => (
              <li key={step}>{guideT(`pronunciation.jSteps.${step}`)}</li>
            ))}
          </ol>
        )}
      </div>
      <div className="space-y-2">
        <ArticulationView phones={item.phones} playId={playId} durationMs={1400} showProfile />
        <Button variant="outline" size="sm" onClick={replay}>
          {t('mandarinGuide.replayMotion')}
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        {t(final ? 'mandarinGuide.finalSample' : 'mandarinGuide.initialSample', {
          reading: item.reading,
          han: item.han,
        })}
      </p>
      <HearReference
        text={item.han}
        label={t('mandarinGuide.hearSyllable', { syllable: item.reading })}
        disabled={disabled}
        speedControls
        onPlaybackStart={replay}
      />
    </section>
  )
}
