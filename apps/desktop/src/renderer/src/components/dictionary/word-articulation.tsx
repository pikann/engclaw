import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Volume2 } from 'lucide-react'
import { ArticulationView } from '@/components/articulation-view'
import { SoundButtons } from '@/components/sound-buttons'
import { Button } from '@/components/ui/button'
import { ipaPhones } from '@/lib/articulation'
import { useWordArticulation } from '@/lib/use-word-articulation'

/** Dictionary word page: the word's sounds with the mouth and tongue animated in sync with the audio. */
export function WordArticulation({ word, ipa }: { word: string; ipa: string | undefined }) {
  const { t } = useTranslation()
  const sounds = useMemo(() => ipaPhones(ipa ?? ''), [ipa])
  const art = useWordArticulation(word, sounds)
  if (!sounds.length) return null
  return (
    <section
      aria-labelledby="dict-articulation"
      className="space-y-2"
      data-testid="word-articulation"
    >
      <h4 id="dict-articulation" className="text-sm font-semibold">
        {t('dict.articulation')}
      </h4>
      <div className="flex flex-wrap items-center gap-3">
        <ArticulationView {...art.view} />
        <div className="space-y-2">
          <p lang="en-fonipa" className="font-mono text-lg">
            <SoundButtons sounds={sounds} selected={art.selected} onPick={art.pick} />
          </p>
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
        </div>
      </div>
    </section>
  )
}
