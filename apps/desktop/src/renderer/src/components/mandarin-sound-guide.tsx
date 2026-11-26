import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArticulationView } from '@/components/articulation-view'
import { HearReference } from '@/components/hear-reference'
import { Button } from '@/components/ui/button'
import type { MandarinFinal } from '@/lib/mandarin-final'
import type { MandarinInitial } from '@/lib/mandarin-initial'
import { finalTips, initialTips, vietnameseFinals } from '@/lib/mandarin-pronunciation'

const palatalSteps = [
  'Đặt đầu lưỡi sát mặt trong răng dưới.',
  'Nâng mặt trước của lưỡi lên sát vòm cứng để chặn hơi trong chốc lát.',
  'Hạ mặt lưỡi vừa đủ để hơi thoát qua khe hẹp, rồi chuyển sang i ngay. Bật hơi nhẹ.',
]

export function MandarinSoundGuide({
  item,
  disabled,
}: {
  item: MandarinInitial | MandarinFinal
  disabled: boolean
}) {
  const { t } = useTranslation()
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
      <div className="space-y-2 text-sm" lang="vi">
        {final && (
          <p>
            <strong>Nghe gần giống tiếng Việt</strong> · “{vietnameseFinals[item.final]}”
          </p>
        )}
        <p>{final ? finalTips[item.final] : initialTips[item.initial]}</p>
        {!final && item.initial === 'j' && (
          <ol className="list-decimal space-y-1 pl-5">
            {palatalSteps.map((step) => (
              <li key={step}>{step}</li>
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
