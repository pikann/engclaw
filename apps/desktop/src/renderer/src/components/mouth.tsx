import { useTranslation } from 'react-i18next'
import type { Viseme } from '@/lib/viseme'

const IMAGES = import.meta.glob<string>('../assets/mouths/*.png', {
  eager: true,
  import: 'default',
})
const src = (viseme: string): string => IMAGES[`../assets/mouths/${viseme}.png`] ?? ''

/** Front-view mouth picture for one mouth shape (animated by `ArticulationView`). */
export function Mouth({ viseme }: { viseme: Viseme }) {
  const { t } = useTranslation()
  return (
    <img
      src={src(viseme)}
      alt={t('result.mouthAlt', { shape: viseme })}
      data-testid="mouth"
      data-viseme={viseme}
      className="size-28 rounded-md border object-contain"
    />
  )
}
